import { ConfigService } from '@nestjs/config';
import { EngineClient, EngineError } from './engine.client';

const config = new ConfigService({
  ENGINE_BASE_URL: 'https://engine.test/',
  ENGINE_API_KEY: 'secret-key',
  ENGINE_TIMEOUT_MS: 1000,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('EngineClient', () => {
  let fetchMock: jest.SpyInstance;
  let client: EngineClient;
  let sleepSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    client = new EngineClient(config);
    // No real waiting between retries in tests.
    sleepSpy = jest
      .spyOn(client as never, 'sleep')
      .mockResolvedValue(undefined as never);
    jest.spyOn(client['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(client['logger'], 'log').mockImplementation(() => undefined);
  });
  afterEach(() => fetchMock.mockRestore());

  const body = { worker_id: 'w' } as never;

  it('sends the API key and returns the body', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { level: 2 }));
    await expect(client.assess(body)).resolves.toEqual({ level: 2 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://engine.test/v1/assess/worker');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'secret-key',
    );
  });

  it('retries a 5xx after a pause (Render answers 502 while the engine restarts)', async () => {
    fetchMock
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(client.assess(body)).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });

  it('retries a network error twice, then gives up', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.assess(body)).rejects.toBeInstanceOf(EngineError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("summarises Render's HTML error page instead of logging it", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response('<!DOCTYPE html><html><head><title>502</title>', {
          status: 502,
        }),
      ),
    );
    const err = (await client.assess(body).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain('HTML error page from the host');
    expect(err.message).not.toContain('<html');
  });

  it('warm-up keeps trying until the engine answers', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('<html>', { status: 502 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(json(200, { status: 'ok' }));
    await expect(client.warmUp()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([401, 422, 503])('does not retry a %i', async (status) => {
    fetchMock.mockResolvedValueOnce(json(status, { detail: 'x' }));
    await expect(client.forecast(body)).rejects.toMatchObject({
      status,
      retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('warmUp never throws and sends no key', async () => {
    fetchMock.mockRejectedValue(new TypeError('down'));
    await expect(client.warmUp()).resolves.toBe(false);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)['x-api-key'],
    ).toBeUndefined();
  });

  it('posts weather to /v1/wbgt with the key', async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { method: 'liljegren_2008', hours: [] }),
    );
    await expect(
      client.wbgt({ latitude: 9, longitude: 7, hours: [] }),
    ).resolves.toEqual({
      method: 'liljegren_2008',
      hours: [],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://engine.test/v1/wbgt');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'secret-key',
    );
  });

  it('uses the WBGT route unless switched off', () => {
    expect(client.wbgtEnabled).toBe(true);
    expect(
      new EngineClient(
        new ConfigService({
          ENGINE_BASE_URL: 'https://e.test',
          ENGINE_API_KEY: 'k',
          ENGINE_WBGT_ENABLED: false,
        }),
      ).wbgtEnabled,
    ).toBe(false);
  });

  it('sends band data only when both wearable switches are on', () => {
    const make = (env: Record<string, unknown>) =>
      new EngineClient(
        new ConfigService({
          ENGINE_BASE_URL: 'https://e.test',
          ENGINE_API_KEY: 'k',
          ...env,
        }),
      );
    expect(make({}).supportsWearables).toBe(false);
    expect(make({ ENGINE_SUPPORTS_WEARABLES: true }).supportsWearables).toBe(
      false,
    );
    expect(make({ WEARABLES_ENABLED: true }).supportsWearables).toBe(false);
    expect(
      make({ WEARABLES_ENABLED: true, ENGINE_SUPPORTS_WEARABLES: true })
        .supportsWearables,
    ).toBe(true);
  });

  it('caches rules', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ name: 'r' }]));
    await client.rules();
    await client.rules();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
