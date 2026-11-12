import { Confidence } from '../../../common/enums';
import type { WeatherObservation } from '../providers/weather-provider';
import { buildWbgtRequest, matchWbgt } from './engine-wbgt';

const obs = (iso: string, isForecast = true): WeatherObservation => ({
  time: new Date(iso),
  isForecast,
  airTempC: 34,
  relativeHumidity: 48,
  solarRadiationWm2: 820,
  directRadiationWm2: 600,
  diffuseRadiationWm2: 220,
  windSpeedMs: 2.3,
  surfacePressureHpa: 963,
  precipitationMm: 0,
  weatherCode: null,
  dustUgM3: null,
  pm10UgM3: null,
});

describe('buildWbgtRequest', () => {
  it('sends every hour once, oldest first, with all Liljegren inputs and the 10 m wind height', () => {
    const current = obs('2026-03-15T12:15:00Z', false);
    const req = buildWbgtRequest(9.06, 7.49, [
      obs('2026-03-15T13:00:00Z'),
      current,
      obs('2026-03-15T13:00:00Z'),
    ]);
    expect(req.latitude).toBe(9.06);
    expect(req.hours.map((h) => h.timestamp)).toEqual([
      '2026-03-15T12:15:00.000Z',
      '2026-03-15T13:00:00.000Z',
    ]);
    expect(req.hours[0]).toEqual({
      timestamp: '2026-03-15T12:15:00.000Z',
      air_temp_c: 34,
      relative_humidity: 48,
      shortwave_radiation_wm2: 820,
      direct_radiation_wm2: 600,
      diffuse_radiation_wm2: 220,
      wind_speed_ms: 2.3,
      wind_height_m: 10,
      surface_pressure_hpa: 963,
    });
  });
});

describe('matchWbgt', () => {
  it('matches by instant even when the engine answers in another UTC offset', () => {
    const a = obs('2026-03-15T12:00:00Z');
    const m = matchWbgt([a], {
      model: 'liljegren-2008',
      hours: [
        {
          timestamp: '2026-03-15T13:00:00+01:00',
          wbgt_sun_c: 31.4,
          wbgt_shade_c: 28.2,
        },
      ],
    });
    expect(m.get(a)).toEqual({
      sunC: 31.4,
      shadeC: 28.2,
      model: 'liljegren-2008',
      confidence: Confidence.MEDIUM,
    });
  });

  it('leaves an hour empty (not guessed) when the engine returned nothing for it', () => {
    const a = obs('2026-03-15T12:00:00Z');
    const m = matchWbgt([a], { model: 'liljegren-2008', hours: [] });
    expect(m.get(a)).toMatchObject({
      sunC: null,
      shadeC: null,
      confidence: Confidence.LOW,
    });
  });
});
