import { ConfigService } from '@nestjs/config';
import { OpenMeteoProvider } from './open-meteo.provider';

const BASE = {
  OPEN_METEO_BASE_URL: 'https://weather.test/v1/forecast',
  OPEN_METEO_AIR_QUALITY_URL: 'https://air.test/v1/air-quality',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const weather = {
  current: { time: '2026-11-13T10:00', temperature_2m: 31, dew_point_2m: 15 },
  hourly: { time: [] },
};

describe('OpenMeteoProvider', () => {
  let fetchMock: jest.SpyInstance;
  const make = (extra: Record<string, string> = {}) => {
    const p = new OpenMeteoProvider(new ConfigService({ ...BASE, ...extra }));
    jest.spyOn(p as never, 'sleep').mockResolvedValue(undefined as never);
    return p;
  };
  beforeEach(() => (fetchMock = jest.spyOn(global, 'fetch')));
  afterEach(() => fetchMock.mockRestore());

  /** First call is the forecast; any later call is air quality (answered empty). */
  const urls = () =>
    fetchMock.mock.calls.map(([u]) => new URL(String(u as URL)));

  it('retries a 429 (rate limit) and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(json(429, { error: true, reason: 'limit' }))
      .mockResolvedValueOnce(json(200, weather))
      .mockResolvedValue(json(200, { hourly: {} }));
    const out = await make().fetch(9.06, 7.49, 12);
    expect(out[0]).toMatchObject({ airTempC: 31, dewPointC: 15 });
    expect(urls()[0].host).toBe('weather.test');
    expect(urls()[1].host).toBe('weather.test');
  });

  it("gives up after two retries with Open-Meteo's reason", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        json(429, { error: true, reason: 'Hourly API request limit exceeded' }),
      ),
    );
    await expect(make().fetch(9.06, 7.49, 12)).rejects.toThrow(
      'Weather provider returned 429: Hourly API request limit exceeded',
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 400', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { reason: 'bad' }));
    await expect(make().fetch(9.06, 7.49, 12)).rejects.toThrow('400: bad');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends the API key only when one is set', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, weather))
      .mockResolvedValue(json(200, { hourly: {} }));
    await make().fetch(9.06, 7.49, 12);
    expect(urls()[0].searchParams.has('apikey')).toBe(false);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(json(200, weather))
      .mockResolvedValue(json(200, { hourly: {} }));
    await make({ OPEN_METEO_API_KEY: 'k123' }).fetch(9.06, 7.49, 12);
    expect(urls()[0].searchParams.get('apikey')).toBe('k123');
    expect(urls()[1].searchParams.get('apikey')).toBe('k123'); // air quality too
  });
});
