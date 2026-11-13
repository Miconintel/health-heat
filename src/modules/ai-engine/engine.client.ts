import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AssessWorkerRequest,
  EngineRule,
  ForecastRequest,
  WbgtRequest,
  WbgtResponse,
  WorkerAssessment,
  WorkerForecast,
} from './engine.types';

/** Any failure talking to the engine. `retryable` = network error, timeout or 5xx (except 503). */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

const RULES_TTL_MS = 60 * 60_000;
/** Pauses between attempts of one call: Render answers 502 for a few seconds while the engine restarts. */
const RETRY_DELAYS_MS = [2_000, 5_000];
/** How long warm-up keeps trying: a sleeping Render instance takes 20 to 60 s to wake. */
const WARMUP_MAX_MS = 90_000;
const WARMUP_DELAYS_MS = [3_000, 5_000, 10_000];

/**
 * HTTP client for the external HeatGuard AI risk engine.
 * The engine is stateless; the API key stays on this server and is never sent to clients.
 */
@Injectable()
export class EngineClient {
  private readonly logger = new Logger(EngineClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  /** Send the `hood` field (on unless ENGINE_SUPPORTS_HOOD=false). */
  readonly supportsHood: boolean;
  /** WBGT comes from the engine's /v1/wbgt route (on unless ENGINE_WBGT_ENABLED=false). */
  readonly wbgtEnabled: boolean;
  /** Engine accepts the (proposed) `wearable` field. */
  readonly supportsWearables: boolean;
  private rulesCache: { at: number; rules: EngineRule[] } | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config
      .getOrThrow<string>('ENGINE_BASE_URL')
      .replace(/\/+$/, '');
    this.apiKey = config.getOrThrow<string>('ENGINE_API_KEY');
    this.timeoutMs = config.get<number>('ENGINE_TIMEOUT_MS') ?? 60_000;
    this.supportsHood = config.get<boolean>('ENGINE_SUPPORTS_HOOD') !== false;
    this.wbgtEnabled = config.get<boolean>('ENGINE_WBGT_ENABLED') !== false;
    this.supportsWearables =
      config.get<boolean>('WEARABLES_ENABLED') === true &&
      config.get<boolean>('ENGINE_SUPPORTS_WEARABLES') === true;
  }

  assess(body: AssessWorkerRequest): Promise<WorkerAssessment> {
    return this.request<WorkerAssessment>('POST', '/v1/assess/worker', body);
  }

  forecast(body: ForecastRequest): Promise<WorkerForecast> {
    return this.request<WorkerForecast>('POST', '/v1/forecast/worker', body);
  }

  /** Weather → WBGT (sun and shade) with the engine's Liljegren implementation. */
  wbgt(body: WbgtRequest): Promise<WbgtResponse> {
    return this.request<WbgtResponse>('POST', '/v1/wbgt', body);
  }

  async rules(): Promise<EngineRule[]> {
    if (this.rulesCache && Date.now() - this.rulesCache.at < RULES_TTL_MS) {
      return this.rulesCache.rules;
    }
    const rules = await this.request<EngineRule[]>('GET', '/v1/rules');
    this.rulesCache = { at: Date.now(), rules };
    return rules;
  }

  /**
   * Wakes the engine (Render free plan sleeps after ~15 min idle) and waits until it
   * answers, for up to 90 s, so a run doesn't send every worker to the fail-safe while
   * the engine is still starting. Never throws.
   */
  async warmUp(): Promise<boolean> {
    const started = Date.now();
    let waited = 0; // pauses taken; also bounds the loop when time doesn't pass (tests)
    for (let attempt = 0; ; attempt++) {
      try {
        await this.once('GET', '/health', undefined, false);
        if (attempt > 0)
          this.logger.log(
            `Engine awake after ${Math.round((Date.now() - started) / 1000)} s`,
          );
        return true;
      } catch (err) {
        const wait =
          WARMUP_DELAYS_MS[Math.min(attempt, WARMUP_DELAYS_MS.length - 1)];
        const spent = Math.max(Date.now() - started, waited);
        if (spent + wait > WARMUP_MAX_MS) {
          this.logger.warn(
            `Engine warm-up gave up after ${Math.round((Date.now() - started) / 1000)} s: ${(err as Error).message}`,
          );
          return false;
        }
        waited += wait;
        await this.sleep(wait);
      }
    }
  }

  /** Overridable in tests. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    opts: { auth?: boolean; retries?: number } = {},
  ): Promise<T> {
    const retries = opts.retries ?? RETRY_DELAYS_MS.length;
    let lastError: EngineError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.once<T>(method, path, body, opts.auth ?? true);
      } catch (err) {
        lastError =
          err instanceof EngineError
            ? err
            : new EngineError((err as Error).message, null, true);
        if (!lastError.retryable || attempt === retries) break;
        await this.sleep(
          RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)],
        );
      }
    }

    const e = lastError!;
    if (e.status === 401 || e.status === 503) {
      this.logger.error(
        `Engine configuration problem on ${path}: ${e.message}`,
      );
    } else if (e.status === 422) {
      this.logger.error(`Engine rejected our request on ${path}: ${e.message}`);
    }
    throw e;
  }

  private async once<T>(
    method: string,
    path: string,
    body: unknown,
    auth: boolean,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(auth ? { 'x-api-key': this.apiKey } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const name = (err as Error).name;
      const msg =
        name === 'TimeoutError'
          ? `timed out after ${this.timeoutMs} ms`
          : (err as Error).message;
      throw new EngineError(`Engine unreachable: ${msg}`, null, true);
    }

    if (!res.ok) {
      // Body of a 422 explains which field was wrong; it never contains the API key.
      // Render's own error pages are HTML: summarise instead of logging the whole page.
      const text = await res.text().catch(() => '');
      const detail = /^\s*</.test(text)
        ? '(HTML error page from the host: the engine is down, starting or deploying)'
        : text.slice(0, 1000);
      const retryable = res.status >= 500 && res.status !== 503;
      throw new EngineError(
        `Engine returned ${res.status}: ${detail}`,
        res.status,
        retryable,
      );
    }
    return (await res.json()) as T;
  }
}
