/**
 * Contract of the external HeatGuard AI risk engine.
 * Mirrors `heat ai/openapi.json` (engine v0.1.0). Field names are the engine's (snake_case).
 */

export type EngineWorkload = 'light' | 'moderate' | 'heavy' | 'very_heavy';
export type EnginePpe =
  'standard' | 'coverall' | 'chemical_resistant' | 'impermeable';
export type EnginePrecaution = 'standard' | 'enhanced' | 'high_priority';
export type EngineWbgtSource = 'measured' | 'estimated';
export type EngineLanguageCode = 'en' | 'ha' | 'yo' | 'ig';
export type EngineWhen = 'routine' | 'now' | 'immediately';
export type EngineDataQuality = 'ok' | 'degraded';
/** PROPOSED (request #4): forecast certainty. */
export type EngineConfidence = 'high' | 'moderate' | 'low';

export interface LastKnownWbgt {
  wbgt_c: number;
  wbgt_source: EngineWbgtSource;
  /** ISO 8601 with timezone. */
  timestamp: string;
}

export interface AssessWorkerRequest {
  worker_id: string;
  site_id: string;
  timestamp: string;
  wbgt_c: number | null;
  wbgt_source?: EngineWbgtSource | null;
  wbgt_timestamp?: string | null;
  workload: EngineWorkload;
  ppe: EnginePpe;
  acclimatized: boolean;
  precaution_level: EnginePrecaution;
  minutes_exposed: number;
  minutes_since_last_break: number;
  language?: EngineLanguageCode;
  last_known?: LastKnownWbgt | null;
  /**
   * PROPOSED, not in engine v0.1.0. Only sent when ENGINE_SUPPORTS_HOOD=true,
   * because the engine rejects unknown fields (additionalProperties: false → 422).
   */
  hood?: boolean;
  /**
   * PROPOSED (request #5): wearable band summary of the last 30 minutes.
   * Only sent when ENGINE_SUPPORTS_WEARABLES=true and the band reported in the last 10 minutes.
   */
  wearable?: EngineWearable;
}

export interface EngineWearable {
  measured_at: string;
  heart_rate_bpm: number | null;
  heart_rate_avg_10min_bpm: number | null;
  minutes_heart_rate_at_or_above_120: number;
  skin_temp_c: number | null;
  skin_temp_change_30min_c: number | null;
  minutes_of_data: number;
}

export interface ForecastHour {
  timestamp: string;
  wbgt_c: number | null;
  wbgt_source: EngineWbgtSource | null;
  workload: EngineWorkload;
  rest_break?: boolean;
}

export interface ForecastRequest {
  worker_id: string;
  site_id: string;
  ppe: EnginePpe;
  acclimatized: boolean;
  precaution_level: EnginePrecaution;
  minutes_exposed: number;
  minutes_since_last_break: number;
  language?: EngineLanguageCode;
  /** PROPOSED: see AssessWorkerRequest.hood. */
  hood?: boolean;
  /** 1–24 entries, oldest first, no repeats. */
  hours: ForecastHour[];
}

export interface EngineReason {
  factor: string;
  effect: string;
}

export interface EngineAction {
  what: string;
  when: EngineWhen;
}

/** Worker view. Its reasons can reveal health information: worker (and OH) only. */
export interface WorkerAssessment {
  worker_id: string;
  timestamp: string;
  level: 1 | 2 | 3 | 4;
  label: string;
  reasons: EngineReason[];
  action: EngineAction;
  wbgt_c: number | null;
  wbgt_source: EngineWbgtSource | null;
  data_quality: EngineDataQuality;
  /** PROPOSED (request #4): higher level this hour could reach if the forecast is off. */
  possible_level?: number | null;
  possible_label?: string | null;
  confidence?: EngineConfidence | null;
}

export interface LevelReached {
  level: number;
  label: string;
  at: string;
}

export interface WorkerForecast {
  worker_id: string;
  hours: WorkerAssessment[];
  first_reached: LevelReached[];
  peak_level: number;
  peak_label: string;
  peak_at: string;
  data_quality: EngineDataQuality;
  /** PROPOSED (request #4). */
  confidence?: EngineConfidence | null;
  confidence_note?: string | null;
}

export type EngineRule = Record<string, unknown>;

// ---- WBGT from weather (route being built by the engine owner) ----------------
// Contract agreed in README "Proposed /v1/wbgt contract". Liljegren et al. (2008).

export interface WbgtWeatherHour {
  /** ISO 8601 with timezone. */
  timestamp: string;
  air_temp_c: number | null;
  relative_humidity: number | null;
  /** Global horizontal (shortwave) irradiance, W/m². */
  shortwave_radiation_wm2: number | null;
  direct_radiation_wm2: number | null;
  diffuse_radiation_wm2: number | null;
  wind_speed_ms: number | null;
  /** Height the wind was measured at (Open-Meteo: 10 m). */
  wind_height_m: number;
  surface_pressure_hpa: number | null;
}

export interface WbgtRequest {
  latitude: number;
  longitude: number;
  /** 1–25 entries, oldest first, no repeats. */
  hours: WbgtWeatherHour[];
}

export interface WbgtHourResult {
  timestamp: string;
  /** Null when the inputs for that hour were insufficient. */
  wbgt_sun_c: number | null;
  wbgt_shade_c: number | null;
}

export interface WbgtResponse {
  /** e.g. "liljegren-2008"; stored with each reading for traceability. */
  model: string;
  hours: WbgtHourResult[];
}
