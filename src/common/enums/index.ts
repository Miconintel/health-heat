export enum Role {
  ADMIN = 'admin',
  OCCUPATIONAL_HEALTH = 'occupational_health',
  SUPERVISOR = 'supervisor',
  WORKER = 'worker',
}

export enum WorkloadLevel {
  LIGHT = 'light',
  MODERATE = 'moderate',
  HEAVY = 'heavy',
  VERY_HEAVY = 'very_heavy',
}

export enum WorkEnvironment {
  DIRECT_SUN = 'direct_sun',
  SHADE = 'shade',
  INDOOR = 'indoor',
}

/** Spec 3.2 – established or approved by occupational health personnel. */
export enum PrecautionLevel {
  STANDARD = 'standard',
  ENHANCED = 'enhanced',
  HIGH_PRIORITY = 'high_priority',
}

/** Spec 3.5 – four-level classification. */
export enum RiskLevel {
  LOW = 1,
  ELEVATED = 2,
  HIGH = 3,
  CRITICAL = 4,
}

/** PPE classes the external risk engine understands (most to least breathable). */
export enum EnginePpeClass {
  STANDARD = 'standard',
  COVERALL = 'coverall',
  /** Double-layer woven clothing (ACGIH +3 °C). */
  DOUBLE_LAYER = 'double_layer',
  CHEMICAL_RESISTANT = 'chemical_resistant',
  IMPERMEABLE = 'impermeable',
}

/**
 * PPE worn on top of the clothing class that adds heat burden.
 * The engine does not accept these yet (see ENGINE_SUPPORTS_HOOD).
 */
export enum EnginePpeAddon {
  /** Encloses head and neck; about +1 °C WBGT in ACGIH clothing adjustments. */
  HOOD = 'hood',
}

/** Languages the external risk engine answers in. Anything else is sent as English. */
export enum EngineLanguage {
  EN = 'en',
  HA = 'ha',
  YO = 'yo',
  IG = 'ig',
}

export enum DataQuality {
  OK = 'ok',
  DEGRADED = 'degraded',
}

/** Where an assessment came from: the engine, or our fail-safe when the engine was unreachable. */
export enum AssessmentSource {
  ENGINE = 'engine',
  FALLBACK = 'fallback',
}

export enum ReadingSource {
  WEATHER_API = 'weather_api',
  SENSOR = 'sensor',
}

/** Spec 3.1 – estimated and directly measured WBGT must be clearly distinguished. */
export enum WbgtMethod {
  MEASURED = 'measured',
  ESTIMATED = 'estimated',
}

export enum Confidence {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum RecommendationAudience {
  WORKER = 'worker',
  SUPERVISOR = 'supervisor',
}

export enum RecommendationTiming {
  IMMEDIATE = 'immediate',
  SCHEDULED = 'scheduled',
  PRECAUTION = 'precaution',
}

export enum RecommendationStatus {
  OPEN = 'open',
  ACKNOWLEDGED = 'acknowledged',
  IMPLEMENTED = 'implemented',
  DISMISSED = 'dismissed',
  /** Condition no longer holds on a later assessment run. */
  SUPERSEDED = 'superseded',
}

export enum InterventionStatus {
  ACKNOWLEDGED = 'acknowledged',
  IMPLEMENTED = 'implemented',
  /** "Reassign": the worker was moved to other duty (counts as implemented). */
  REASSIGNED = 'reassigned',
  DISMISSED = 'dismissed',
}

/** One switch each on the worker consent and My data screens. */
export enum ConsentPurpose {
  /** "Health precautions": OH may use health answers to set extra care. */
  HEALTH_DATA_PROCESSING = 'health_data_processing',
  /** "Wearable band": heart rate and skin temperature (wearables are a later phase). */
  WEARABLE_BAND = 'wearable_band',
  /** "Symptom reports to occupational health": details reach OH. */
  SYMPTOM_REPORTS = 'symptom_reports',
}

/** Languages a worker can choose in the app. The engine supports all but `pcm` (sent as `en`). */
export enum AppLanguage {
  EN = 'en',
  HA = 'ha',
  YO = 'yo',
  IG = 'ig',
  /** Nigerian Pidgin. */
  PCM = 'pcm',
}

export enum AuditAction {
  HEALTH_PROFILE_READ = 'health_profile.read',
  HEALTH_PROFILE_WRITE = 'health_profile.write',
  HEALTH_PROFILE_APPROVE = 'health_profile.approve',
  HEALTH_PROFILE_REVIEW_REQUESTED = 'health_profile.review_requested',
  HEALTH_PROFILE_ERASED = 'health_profile.erased',
  CONSENT_CHANGED = 'consent.changed',
  DATA_EXPORTED = 'worker.data_exported',
  /** Full worker risk view (with reasons) read by someone other than the worker. */
  RISK_DETAIL_READ = 'risk.detail_read',
  /** Acclimatisation start date set or reset by staff. */
  ACCLIMATIZATION_CHANGED = 'worker.acclimatization_changed',
  /** Occupational health read symptom details. */
  SYMPTOM_REPORT_READ = 'symptom_report.read',
  /** A supervisor or OH opened a site overview; metadata.workerIds lists who was shown. */
  RISK_OVERVIEW_VIEWED = 'risk.overview_viewed',
  /** Health data removed by the retention rule (no human actor). */
  HEALTH_DATA_RETENTION_ERASED = 'health_data.retention_erased',
  /** Occupational health read a worker's band data. */
  WEARABLE_READ = 'wearable.read',
  /** Legacy: thresholds were ours before the external engine. Kept so old audit rows stay valid. */
  THRESHOLD_CHANGED = 'risk_threshold.changed',
}

export enum HelpRequestKind {
  /** Worker sent the symptom report form. */
  SYMPTOM_REPORT = 'symptom_report',
  /** "Alert first aider" emergency button. */
  FIRST_AID_ALERT = 'first_aid_alert',
}

export enum HelpRequestStatus {
  OPEN = 'open',
  /** Supervisor or first aider pressed "I am on my way". */
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
}
