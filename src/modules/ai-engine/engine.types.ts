/**
 * Contract of the external HeatGuard AI risk engine.
 * Mirrors `heat ai/openapi.json` (engine v0.1.0). Field names are the engine's (snake_case).
 */

export type EngineWorkload = 'light' | 'moderate' | 'heavy' | 'very_heavy';
export type EnginePpe =
  | 'standard'
  | 'coverall'
  | 'double_layer'
  | 'chemical_resistant'
  | 'impermeable';
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
  /** Hood worn on top of `ppe` (+1 °C, also on impermeable). Sent when ENGINE_SUPPORTS_HOOD is on. */
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
  /** See AssessWorkerRequest.hood. */
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

// ---- WBGT from weather: POST /v1/wbgt ----------------------------------------
// Live engine schema (openapi.json) and AI_BACKEND_GUIDE.md section 10. Liljegren (2008).
// The engine rejects unknown fields (422), and every weather field must be present (null if missing).

export interface WbgtWeatherHour {
  /** ISO 8601 with timezone. */
  time: string;
  /** Open-Meteo temperature_2m, °C (-40 to 60). */
  temperature_2m_c: number | null;
  /** Open-Meteo dew_point_2m, °C (-40 to 60). */
  dew_point_2m_c: number | null;
  /** Open-Meteo surface_pressure (not pressure_msl), hPa (500 to 1100). */
  surface_pressure_hpa: number | null;
  /** Open-Meteo wind_speed_10m in km/h, the default unit (0 to 250). */
  wind_speed_10m_kmh: number | null;
  /** Open-Meteo shortwave_radiation, W/m² (0 to 1500). */
  shortwave_radiation_wm2: number | null;
  /** Minutes the radiation is averaged over: 60 for hourly data (default), 15 for Open-Meteo `current`. */
  radiation_period_min?: 15 | 60;
}

export interface WbgtRequest {
  latitude: number;
  longitude: number;
  /** 1 to 400 hours, one site. */
  hours: WbgtWeatherHour[];
}

export interface WbgtHourResult {
  time: string;
  /** WBGT in full sun, °C. Null when a weather value was null or the model could not compute it. */
  wbgt_c: number | null;
  wbgt_source?: 'estimated';
  /** 'degraded' when wbgt_c is null. */
  data_quality: EngineDataQuality;
  /** For checking only. */
  globe_c: number | null;
  natural_wet_bulb_c: number | null;
  wind_2m_ms: number | null;
}

export interface WbgtResponse {
  /** "liljegren_2008"; stored with each reading for traceability. */
  method?: string;
  /** Same order as the request. */
  hours: WbgtHourResult[];
}
