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

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
    client = new EngineClient(config);
    jest.spyOn(client['logger'], 'error').mockImplementation(() => undefined);
    jest.spyOn(client['logger'], 'warn').mockImplementation(() => undefined);
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

  it('retries once on a 5xx', async () => {
    fetchMock
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(200, { ok: 1 }));
    await expect(client.assess(body)).resolves.toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a network error, then gives up', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(client.assess(body)).rejects.toBeInstanceOf(EngineError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
      json(200, { model: 'liljegren-2008', hours: [] }),
    );
    await expect(
      client.wbgt({ latitude: 9, longitude: 7, hours: [] }),
    ).resolves.toEqual({
      model: 'liljegren-2008',
      hours: [],
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://engine.test/v1/wbgt');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe(
      'secret-key',
    );
  });

  it('keeps the WBGT route off unless enabled', () => {
    expect(client.wbgtEnabled).toBe(false);
    expect(
      new EngineClient(
        new ConfigService({
          ENGINE_BASE_URL: 'https://e.test',
          ENGINE_API_KEY: 'k',
          ENGINE_WBGT_ENABLED: true,
        }),
      ).wbgtEnabled,
    ).toBe(true);
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
