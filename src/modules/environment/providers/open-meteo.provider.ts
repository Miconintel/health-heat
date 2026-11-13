import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WeatherObservation, WeatherProvider } from './weather-provider';

interface OpenMeteoResponse {
  current?: Record<string, number | string | null>;
  hourly?: Record<string, (number | string | null)[]>;
}

const VARS = [
  'temperature_2m',
  'dew_point_2m',
  'relative_humidity_2m',
  'shortwave_radiation',
  'direct_radiation',
  'diffuse_radiation',
  'wind_speed_10m',
  'surface_pressure',
  'precipitation',
  'weather_code',
].join(',');

/** Pauses before retrying a 429 (rate limit) or 5xx. Render's shared outgoing address hits the free limit. */
const RETRY_DELAYS_MS = [5_000, 15_000];
const MAX_RETRY_AFTER_MS = 30_000;

/**
 * https://open-meteo.com – free without a key; OPEN_METEO_API_KEY (paid plan, with
 * OPEN_METEO_BASE_URL=https://customer-api.open-meteo.com/v1/forecast) avoids the shared rate limit. Times requested in UTC (sent to the engine
 * with a `Z` offset, which its "ISO 8601 with timezone" accepts). Wind in km/h.
 */
@Injectable()
export class OpenMeteoProvider extends WeatherProvider {
  readonly name = 'open-meteo';

  constructor(private readonly config: ConfigService) {
    super();
  }

  /** Overridable in tests. */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Adds the API key, when there is one. */
  private withKey(params: Record<string, string>) {
    const key = this.config.get<string>('OPEN_METEO_API_KEY');
    return new URLSearchParams(key ? { ...params, apikey: key } : params);
  }

  /**
   * GET with retries on 429 and 5xx. The error includes Open-Meteo's own reason
   * (e.g. "Hourly API request limit exceeded"), never the API key.
   */
  private async getJson<T>(url: URL): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return (await res.json()) as T;
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= RETRY_DELAYS_MS.length) {
        const body = (await res.json().catch(() => null)) as {
          reason?: string;
        } | null;
        throw new ServiceUnavailableException(
          `Weather provider returned ${res.status}${body?.reason ? `: ${body.reason}` : ''}`,
        );
      }
      const retryAfter = Number(res.headers.get('retry-after')) * 1000;
      await this.sleep(
        retryAfter > 0
          ? Math.min(retryAfter, MAX_RETRY_AFTER_MS)
          : RETRY_DELAYS_MS[attempt],
      );
    }
  }

  async fetch(
    latitude: number,
    longitude: number,
    forecastHours: number,
  ): Promise<WeatherObservation[]> {
    const url = new URL(this.config.getOrThrow<string>('OPEN_METEO_BASE_URL'));
    url.search = this.withKey({
      latitude: String(latitude),
      longitude: String(longitude),
      current: VARS,
      hourly: VARS,
      forecast_hours: String(forecastHours),
      // Default units: wind in km/h, as the engine's /v1/wbgt expects.
      timezone: 'UTC',
    }).toString();

    const body = await this.getJson<OpenMeteoResponse>(url);

    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    const utc = (t: unknown) => new Date(`${String(t)}Z`);
    const ms = (v: unknown) => {
      const k = num(v);
      return k === null ? null : Math.round((k / 3.6) * 100) / 100;
    };
    const out: WeatherObservation[] = [];

    if (body.current) {
      const c = body.current;
      out.push({
        time: utc(c.time),
        isForecast: false,
        airTempC: num(c.temperature_2m),
        dewPointC: num(c.dew_point_2m),
        relativeHumidity: num(c.relative_humidity_2m),
        solarRadiationWm2: num(c.shortwave_radiation),
        directRadiationWm2: num(c.direct_radiation),
        diffuseRadiationWm2: num(c.diffuse_radiation),
        windSpeedKmh: num(c.wind_speed_10m),
        windSpeedMs: ms(c.wind_speed_10m),
        surfacePressureHpa: num(c.surface_pressure),
        weatherCode: num(c.weather_code),
        dustUgM3: null,
        pm10UgM3: null,
        precipitationMm: num(c.precipitation),
      });
    }
    const h = body.hourly;
    if (h?.time) {
      h.time.forEach((t, i) =>
        out.push({
          time: utc(t),
          isForecast: true,
          airTempC: num(h.temperature_2m?.[i]),
          dewPointC: num(h.dew_point_2m?.[i]),
          relativeHumidity: num(h.relative_humidity_2m?.[i]),
          solarRadiationWm2: num(h.shortwave_radiation?.[i]),
          directRadiationWm2: num(h.direct_radiation?.[i]),
          diffuseRadiationWm2: num(h.diffuse_radiation?.[i]),
          windSpeedKmh: num(h.wind_speed_10m?.[i]),
          windSpeedMs: ms(h.wind_speed_10m?.[i]),
          surfacePressureHpa: num(h.surface_pressure?.[i]),
          weatherCode: num(h.weather_code?.[i]),
          dustUgM3: null,
          pm10UgM3: null,
          precipitationMm: num(h.precipitation?.[i]),
        }),
      );
    }
    await this.addAirQuality(latitude, longitude, forecastHours, out);
    return out;
  }

  /**
   * Dust and PM10 from Open-Meteo's air-quality API, matched to each observation's
   * hour. Best-effort: a failure leaves them null and never blocks the heat data.
   */
  private async addAirQuality(
    latitude: number,
    longitude: number,
    forecastHours: number,
    out: WeatherObservation[],
  ) {
    try {
      const url = new URL(
        this.config.getOrThrow<string>('OPEN_METEO_AIR_QUALITY_URL'),
      );
      url.search = this.withKey({
        latitude: String(latitude),
        longitude: String(longitude),
        hourly: 'dust,pm10',
        forecast_hours: String(forecastHours + 1),
        timezone: 'UTC',
      }).toString();
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return;
      const body = (await res.json()) as {
        hourly?: {
          time?: string[];
          dust?: (number | null)[];
          pm10?: (number | null)[];
        };
      };
      const byHour = new Map<
        number,
        { dust: number | null; pm10: number | null }
      >();
      body.hourly?.time?.forEach((t, i) =>
        byHour.set(new Date(`${t}Z`).getTime(), {
          dust: body.hourly?.dust?.[i] ?? null,
          pm10: body.hourly?.pm10?.[i] ?? null,
        }),
      );
      for (const o of out) {
        const hour = new Date(o.time);
        hour.setUTCMinutes(0, 0, 0);
        const aq = byHour.get(hour.getTime());
        if (aq) {
          o.dustUgM3 = aq.dust;
          o.pm10UgM3 = aq.pm10;
        }
      }
    } catch {
      // Air quality is optional context; heat risk does not depend on it.
    }
  }
}
