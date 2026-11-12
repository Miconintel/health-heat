import { Confidence } from '../../../common/enums';
import type { WbgtRequest, WbgtResponse } from '../../ai-engine/engine.types';
import type { WeatherObservation } from '../providers/weather-provider';

/**
 * Pure mapping between our weather observations and the engine's POST /v1/wbgt
 * (Liljegren). One request per site covers "now" plus every forecast hour.
 */

/** Open-Meteo reports wind at 10 m; Liljegren needs to know to adjust it. */
export const OPEN_METEO_WIND_HEIGHT_M = 10;

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
    .map((o) => ({
      timestamp: o.time.toISOString(),
      air_temp_c: o.airTempC,
      relative_humidity: o.relativeHumidity,
      shortwave_radiation_wm2: o.solarRadiationWm2,
      direct_radiation_wm2: o.directRadiationWm2,
      diffuse_radiation_wm2: o.diffuseRadiationWm2,
      wind_speed_ms: o.windSpeedMs,
      wind_height_m: OPEN_METEO_WIND_HEIGHT_M,
      surface_pressure_hpa: o.surfacePressureHpa,
    }));
  return { latitude, longitude, hours };
}

export interface EngineWbgtValue {
  sunC: number | null;
  shadeC: number | null;
  model: string;
  confidence: Confidence;
}

/**
 * Match the engine's answer back to each observation by instant (offsets may differ).
 * An hour the engine returned no value for gets nulls, so the risk engine treats it
 * as missing data (cautious) instead of us guessing.
 */
export function matchWbgt(
  observations: WeatherObservation[],
  response: WbgtResponse,
): Map<WeatherObservation, EngineWbgtValue> {
  const byInstant = new Map(
    response.hours.map((h) => [Date.parse(h.timestamp), h]),
  );
  const out = new Map<WeatherObservation, EngineWbgtValue>();
  for (const o of observations) {
    const h = byInstant.get(o.time.getTime());
    const sunC = h?.wbgt_sun_c ?? null;
    const shadeC = h?.wbgt_shade_c ?? null;
    out.set(o, {
      sunC,
      shadeC,
      model: response.model,
      // Still an estimate from weather data, never a sensor measurement.
      confidence:
        sunC === null && shadeC === null ? Confidence.LOW : Confidence.MEDIUM,
    });
  }
  return out;
}
