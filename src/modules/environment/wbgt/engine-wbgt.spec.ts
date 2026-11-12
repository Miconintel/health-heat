import { Confidence } from '../../../common/enums';
import type { WbgtHourResult } from '../../ai-engine/engine.types';
import type { WeatherObservation } from '../providers/weather-provider';
import { buildWbgtRequest, matchWbgt } from './engine-wbgt';

const obs = (
  iso: string,
  isForecast = true,
  over: Partial<WeatherObservation> = {},
): WeatherObservation => ({
  time: new Date(iso),
  isForecast,
  airTempC: 33.6,
  dewPointC: 20,
  relativeHumidity: 45,
  solarRadiationWm2: 920,
  directRadiationWm2: 700,
  diffuseRadiationWm2: 220,
  windSpeedKmh: 8,
  windSpeedMs: 8 / 3.6,
  surfacePressureHpa: 960,
  precipitationMm: 0,
  weatherCode: null,
  dustUgM3: null,
  pm10UgM3: null,
  ...over,
});

const hour = (time: string, wbgt_c: number | null): WbgtHourResult => ({
  time,
  wbgt_c,
  wbgt_source: 'estimated',
  data_quality: wbgt_c === null ? 'degraded' : 'ok',
  globe_c: null,
  natural_wet_bulb_c: null,
  wind_2m_ms: null,
});

describe('buildWbgtRequest', () => {
  it('sends every hour once, oldest first, with exactly the engine field names', () => {
    const current = obs('2026-03-15T12:15:00Z', false);
    const req = buildWbgtRequest(9.06, 7.49, [
      obs('2026-03-15T13:00:00Z'),
      current,
      obs('2026-03-15T13:00:00Z'),
    ]);
    expect(req.latitude).toBe(9.06);
    expect(req.longitude).toBe(7.49);
    expect(req.hours.map((h) => h.time)).toEqual([
      '2026-03-15T12:15:00.000Z',
      '2026-03-15T13:00:00.000Z',
    ]);
    // The current observation is a 15-minute average.
    expect(req.hours[0]).toEqual({
      time: '2026-03-15T12:15:00.000Z',
      temperature_2m_c: 33.6,
      dew_point_2m_c: 20,
      surface_pressure_hpa: 960,
      wind_speed_10m_kmh: 8,
      shortwave_radiation_wm2: 920,
      radiation_period_min: 15,
    });
    // Forecast hours use the engine's default (60) and send no extra keys.
    expect(Object.keys(req.hours[1]).sort()).toEqual([
      'dew_point_2m_c',
      'shortwave_radiation_wm2',
      'surface_pressure_hpa',
      'temperature_2m_c',
      'time',
      'wind_speed_10m_kmh',
    ]);
  });

  it('keeps missing values as null and nulls values the engine would reject (422)', () => {
    const req = buildWbgtRequest(9.06, 7.49, [
      obs('2026-03-15T13:00:00Z', true, {
        dewPointC: null,
        windSpeedKmh: 300,
        surfacePressureHpa: 1013.2,
        solarRadiationWm2: -1,
      }),
    ]);
    expect(req.hours[0]).toMatchObject({
      temperature_2m_c: 33.6,
      dew_point_2m_c: null,
      wind_speed_10m_kmh: null,
      surface_pressure_hpa: 1013.2,
      shortwave_radiation_wm2: null,
    });
  });
});

describe('matchWbgt', () => {
  it('reads wbgt_c, matching by instant even when the engine answers in another UTC offset', () => {
    const a = obs('2026-03-15T12:00:00Z');
    const m = matchWbgt([a], {
      method: 'liljegren_2008',
      hours: [hour('2026-03-15T13:00:00+01:00', 31.3)],
    });
    expect(m.get(a)).toEqual({
      wbgtC: 31.3,
      model: 'liljegren_2008',
      confidence: Confidence.MEDIUM,
    });
  });

  it('passes a null wbgt_c on as null (never guessed)', () => {
    const a = obs('2026-03-15T12:00:00Z');
    const b = obs('2026-03-15T13:00:00Z');
    const m = matchWbgt([a, b], {
      hours: [hour('2026-03-15T12:00:00Z', null)],
    });
    expect(m.get(a)).toEqual({
      wbgtC: null,
      model: 'liljegren_2008',
      confidence: Confidence.LOW,
    });
    expect(m.get(b)?.wbgtC).toBeNull();
  });
});
