import { Confidence } from '../../../common/enums';

export interface WbgtEstimateInput {
  airTempC: number | null;
  relativeHumidity: number | null;
  solarRadiationWm2: number | null;
}

export interface WbgtEstimate {
  shadeC: number | null;
  sunC: number | null;
  model: string;
  confidence: Confidence;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Approximate WBGT from standard weather variables.
 *
 * Shade: Australian Bureau of Meteorology approximation
 *   e    = (RH/100) · 6.105 · exp(17.27·Ta / (237.7 + Ta))   [hPa]
 *   WBGT = 0.567·Ta + 0.393·e + 3.94
 *
 * INTERIM: used only while ENGINE_WBGT_ENABLED=false. The engine's POST /v1/wbgt
 *   (Liljegren 2008) replaces it; delete this file once that route is live, so the
 *   system has one WBGT formula.
 *
 * Sun: shade value + a solar increment of up to 3 °C at 1000 W/m².
 *   The solar increment is a PLACEHOLDER. Replace with a physically based
 *   model (e.g. Liljegren et al. 2008) before any operational use.
 */
export function estimateWbgt(input: WbgtEstimateInput): WbgtEstimate {
  const model = 'bom-approx-shade+linear-solar-placeholder';
  const {
    airTempC: ta,
    relativeHumidity: rh,
    solarRadiationWm2: solar,
  } = input;

  if (ta === null || rh === null) {
    return { shadeC: null, sunC: null, model, confidence: Confidence.LOW };
  }

  const vapourPressure =
    (rh / 100) * 6.105 * Math.exp((17.27 * ta) / (237.7 + ta));
  const shade = 0.567 * ta + 0.393 * vapourPressure + 3.94;

  if (solar === null) {
    return {
      shadeC: round1(shade),
      sunC: null,
      model,
      confidence: Confidence.LOW,
    };
  }
  const solarIncrement = Math.min(3, (Math.max(solar, 0) / 1000) * 3);

  return {
    shadeC: round1(shade),
    sunC: round1(shade + solarIncrement),
    model,
    // Estimated values never get HIGH confidence; that is reserved for sensors.
    confidence: Confidence.MEDIUM,
  };
}
