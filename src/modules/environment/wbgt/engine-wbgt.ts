import { Confidence } from '../../../common/enums';
import type {
  WbgtRequest,
  WbgtResponse,
  WbgtWeatherHour,
} from '../../ai-engine/engine.types';
import type { WeatherObservation } from '../providers/weather-provider';

/**
 * Pure mapping between our weather observations and the engine's POST /v1/wbgt
 * (Liljegren). One request per site covers "now" plus every forecast hour.
 * Contract: the engine's live openapi.json and AI_BACKEND_GUIDE.md section 10.
 */

export const DEFAULT_WBGT_METHOD = 'liljegren_2008';

/**
 * The engine's accepted range for each field. A value outside it would make the whole
 * request fail with 422, so it is sent as null instead: that one hour comes back
 * `wbgt_c: null` (cautious) and the other hours are unaffected.
 */
const RANGES = {
  temperature_2m_c: [-40, 60],
  dew_point_2m_c: [-40, 60],
  surface_pressure_hpa: [500, 1100],
  wind_speed_10m_kmh: [0, 250],
  shortwave_radiation_wm2: [0, 1500],
} as const;

function inRange(
  value: number | null,
  [min, max]: readonly [number, number],
): number | null {
  return value !== null &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

export function buildWbgtRequest(
  latitude: number,
  longitude: number,
  observations: WeatherObservation[],
): WbgtRequest {
  const seen = new Set<number>();
  const hours = [...observations]
    .sort((a, b) => a.time.getTime() - b.time.getTime())
    .filter((o) => {
      const t = o.time.getTime();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .map((o): WbgtWeatherHour => {
      const hour: WbgtWeatherHour = {
        time: o.time.toISOString(),
        temperature_2m_c: inRange(o.airTempC, RANGES.temperature_2m_c),
        dew_point_2m_c: inRange(o.dewPointC, RANGES.dew_point_2m_c),
        surface_pressure_hpa: inRange(
          o.surfacePressureHpa,
          RANGES.surface_pressure_hpa,
        ),
        wind_speed_10m_kmh: inRange(o.windSpeedKmh, RANGES.wind_speed_10m_kmh),
        shortwave_radiation_wm2: inRange(
          o.solarRadiationWm2,
          RANGES.shortwave_radiation_wm2,
        ),
      };
      // Open-Meteo `current` values are 15-minute averages; hourly ones use the default 60.
      if (!o.isForecast) hour.radiation_period_min = 15;
      return hour;
    });
  return { latitude, longitude, hours };
}

export interface EngineWbgtValue {
  /** WBGT in full sun. The engine has no shade value; it is used for every worker. */
  wbgtC: number | null;
  model: string;
  confidence: Confidence;
}

/**
 * Match the engine's answer back to each observation by instant (offsets may differ).
 * An hour with `wbgt_c: null`, or missing from the answer, stays null so the risk
 * engine gets null and uses its safe fallback, instead of us guessing.
 */
export function matchWbgt(
  observations: WeatherObservation[],
  response: WbgtResponse,
): Map<WeatherObservation, EngineWbgtValue> {
  const byInstant = new Map(response.hours.map((h) => [Date.parse(h.time), h]));
  const model = response.method ?? DEFAULT_WBGT_METHOD;
  const out = new Map<WeatherObservation, EngineWbgtValue>();
  for (const o of observations) {
    const wbgtC = byInstant.get(o.time.getTime())?.wbgt_c ?? null;
    out.set(o, {
      wbgtC,
      model,
      // Still an estimate from weather data, never a sensor measurement.
      confidence: wbgtC === null ? Confidence.LOW : Confidence.MEDIUM,
    });
  }
  return out;
}
