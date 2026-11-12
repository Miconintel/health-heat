import {
  AssessmentSource,
  DataQuality,
  EngineLanguage,
  EnginePpeAddon,
  EnginePpeClass,
  PrecautionLevel,
  RecommendationTiming,
  RiskLevel,
  WbgtMethod,
  WorkEnvironment,
  WorkloadLevel,
} from '../../common/enums';
import type { WearableSummary } from '../wearables/wearable-summary';
import type {
  AssessWorkerRequest,
  EngineConfidence,
  WorkerForecast,
  EngineAction,
  EnginePpe,
  EngineWbgtSource,
  EngineWhen,
  ForecastHour,
  ForecastRequest,
  LastKnownWbgt,
} from '../ai-engine/engine.types';

/**
 * Pure translation between our data model and the external engine's contract.
 * No I/O here, so every rule about what we send is unit-testable.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
export const MAX_FORECAST_HOURS = 24;

export const LEVEL_NAME: Record<
  RiskLevel,
  'Low' | 'Elevated' | 'High' | 'Critical'
> = {
  [RiskLevel.LOW]: 'Low',
  [RiskLevel.ELEVATED]: 'Elevated',
  [RiskLevel.HIGH]: 'High',
  [RiskLevel.CRITICAL]: 'Critical',
};

/** Level name for a plain number from the engine (e.g. forecast `first_reached`). */
export const levelName = (n: number): string =>
  (LEVEL_NAME as Record<number, string>)[n] ?? `Level ${n}`;

// ---- shift time ------------------------------------------------------------

export interface ShiftState {
  startsAt: Date;
  clockedInAt: Date | null;
  onBreakSince: Date | null;
  lastBreakEndedAt: Date | null;
}

const minutesBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / MINUTE));

/**
 * Minutes exposed (since clock-in) and since the last break, at time `at`.
 * Without a clock-in we count from the planned start: overestimating exposure
 * is the safe direction.
 */
export function exposureMinutes(
  s: ShiftState,
  at: Date,
): { minutesExposed: number; minutesSinceLastBreak: number } {
  const start = s.clockedInAt ?? s.startsAt;
  const minutesExposed = minutesBetween(start, at);
  if (s.onBreakSince && s.onBreakSince <= at) {
    return { minutesExposed, minutesSinceLastBreak: 0 };
  }
  const lastRest = s.lastBreakEndedAt ?? start;
  return {
    minutesExposed,
    minutesSinceLastBreak: minutesBetween(lastRest, at),
  };
}

// ---- PPE / language ------------------------------------------------------

const PPE_ORDER: EnginePpeClass[] = [
  EnginePpeClass.STANDARD,
  EnginePpeClass.COVERALL,
  EnginePpeClass.CHEMICAL_RESISTANT,
  EnginePpeClass.IMPERMEABLE,
];

/** The engine takes one clothing class: send the most heat-retaining one worn. */
export function enginePpeFor(
  items: { engineClass: EnginePpeClass | null }[],
): EnginePpe {
  let best = 0;
  for (const { engineClass } of items) {
    if (engineClass) best = Math.max(best, PPE_ORDER.indexOf(engineClass));
  }
  return PPE_ORDER[best];
}

export interface PpeAddons {
  /** Worker wears a hood (or other item flagged as a hood addon). */
  hood: boolean;
  /** Engine accepts the `hood` field; if false we must not send it (422). */
  hoodSupported: boolean;
}

/** Add-ons worn, and which of them the engine could not take into account. */
export function ppeAddonsFor(
  items: { engineAddon: EnginePpeAddon | null }[],
  hoodSupported: boolean,
): PpeAddons & { notModelled: EnginePpeAddon[] } {
  const hood = items.some((i) => i.engineAddon === EnginePpeAddon.HOOD);
  return {
    hood,
    hoodSupported,
    notModelled: hood && !hoodSupported ? [EnginePpeAddon.HOOD] : [],
  };
}

/** The `hood` field, only when the engine supports it. */
const hoodField = (a: PpeAddons) => (a.hoodSupported ? { hood: a.hood } : {});

/** Languages the engine doesn't support (e.g. Pidgin) are sent as English, never a 422. */
export function engineLanguage(
  preferred: string | null | undefined,
): EngineLanguage {
  const values = Object.values(EngineLanguage) as string[];
  return preferred && values.includes(preferred)
    ? (preferred as EngineLanguage)
    : EngineLanguage.EN;
}

// ---- WBGT ------------------------------------------------------------------

export interface ReadingLike {
  observedAt: Date;
  wbgtSunC: number | null;
  wbgtShadeC: number | null;
  wbgtMethod: WbgtMethod;
}

/** Choose the sun or shade value for where the worker actually is. */
export function pickWbgt(
  reading: ReadingLike | null,
  env: WorkEnvironment,
): { wbgtC: number; source: EngineWbgtSource } | null {
  if (!reading) return null;
  const value =
    env === WorkEnvironment.DIRECT_SUN
      ? (reading.wbgtSunC ?? reading.wbgtShadeC)
      : (reading.wbgtShadeC ?? reading.wbgtSunC);
  if (value === null || value === undefined) return null;
  return {
    wbgtC: Math.round(Math.min(Math.max(value, 0), 50) * 10) / 10, // engine accepts 0–50
    source:
      reading.wbgtMethod === WbgtMethod.MEASURED ? 'measured' : 'estimated',
  };
}

/** Band summary in the engine's (proposed) shape. */
export function engineWearable(w: WearableSummary) {
  return {
    measured_at: w.measuredAt.toISOString(),
    heart_rate_bpm: w.heartRateBpm,
    heart_rate_avg_10min_bpm: w.heartRateAvg10MinBpm,
    minutes_heart_rate_at_or_above_120: w.minutesHeartRateAtOrAbove120,
    skin_temp_c: w.skinTempC,
    skin_temp_change_30min_c: w.skinTempChange30MinC,
    minutes_of_data: w.minutesOfData,
  };
}

// ---- requests --------------------------------------------------------------

export interface WorkerContext {
  workerId: string;
  siteId: string;
  acclimatized: boolean;
  preferredLanguage: string | null;
  workload: WorkloadLevel;
  workEnvironment: WorkEnvironment;
  ppe: EnginePpe;
  addons: PpeAddons;
  precautionLevel: PrecautionLevel;
  /** Band summary to send (only when the engine supports it and the data is fresh). */
  wearable?: WearableSummary | null;
  /** From a sent shift plan: hour start (ms) → planned workload and rest break. */
  hourPlan?: Map<number, { workload: WorkloadLevel; restBreak: boolean }>;
  shift: ShiftState & { endsAt: Date; plannedBreaks: Date[] };
}

/**
 * @param current  freshest reading for the site (may be old; the engine judges staleness)
 * @param fallback  most recent reading that has a usable value, sent as `last_known`
 */
export function buildAssessRequest(
  ctx: WorkerContext,
  current: ReadingLike | null,
  fallback: ReadingLike | null,
  now: Date,
): AssessWorkerRequest {
  const wbgt = pickWbgt(current, ctx.workEnvironment);
  const minutes = exposureMinutes(ctx.shift, now);

  let lastKnown: LastKnownWbgt | null = null;
  if (fallback && fallback !== current) {
    const lk = pickWbgt(fallback, ctx.workEnvironment);
    if (lk) {
      lastKnown = {
        wbgt_c: lk.wbgtC,
        wbgt_source: lk.source,
        timestamp: fallback.observedAt.toISOString(),
      };
    }
  }

  return {
    worker_id: ctx.workerId,
    site_id: ctx.siteId,
    timestamp: now.toISOString(),
    wbgt_c: wbgt?.wbgtC ?? null,
    wbgt_source: wbgt?.source ?? null,
    wbgt_timestamp: wbgt && current ? current.observedAt.toISOString() : null,
    workload: ctx.workload,
    ppe: ctx.ppe,
    ...hoodField(ctx.addons),
    acclimatized: ctx.acclimatized,
    precaution_level: ctx.precautionLevel,
    minutes_exposed: minutes.minutesExposed,
    minutes_since_last_break: minutes.minutesSinceLastBreak,
    language: engineLanguage(ctx.preferredLanguage),
    ...(lastKnown ? { last_known: lastKnown } : {}),
    ...(ctx.wearable ? { wearable: engineWearable(ctx.wearable) } : {}),
  };
}

/**
 * Forecast for the rest of the shift: hourly rows after `now` up to the shift end,
 * oldest first, no repeated hours, at most 24. Returns null when there is nothing to send.
 */
export function buildForecastRequest(
  ctx: WorkerContext,
  forecastRows: ReadingLike[],
  now: Date,
): ForecastRequest | null {
  const seen = new Set<number>();
  const rows = [...forecastRows]
    .filter((r) => r.observedAt > now && r.observedAt < ctx.shift.endsAt)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
    .filter((r) => {
      const t = r.observedAt.getTime();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, MAX_FORECAST_HOURS);
  if (rows.length === 0) return null;

  const hours: ForecastHour[] = rows.map((r) => {
    const t = r.observedAt.getTime();
    const wbgt = pickWbgt(r, ctx.workEnvironment);
    const planned = ctx.hourPlan?.get(Math.floor(t / HOUR) * HOUR);
    const restBreak =
      !!planned?.restBreak ||
      ctx.shift.plannedBreaks.some(
        (b) => b.getTime() >= t && b.getTime() < t + HOUR,
      );
    return {
      timestamp: r.observedAt.toISOString(),
      wbgt_c: wbgt?.wbgtC ?? null,
      wbgt_source: wbgt?.source ?? null,
      // From the sent shift plan; otherwise repeat the current workload (engine guide §4).
      workload: planned?.workload ?? ctx.workload,
      ...(restBreak ? { rest_break: true } : {}),
    };
  });

  // Minutes are "at the first hour"; the engine adds the time between hours itself.
  const minutes = exposureMinutes(
    // If the worker is on a break now, treat it as ending now.
    ctx.shift.onBreakSince
      ? { ...ctx.shift, onBreakSince: null, lastBreakEndedAt: now }
      : ctx.shift,
    rows[0].observedAt,
  );

  return {
    worker_id: ctx.workerId,
    site_id: ctx.siteId,
    ppe: ctx.ppe,
    ...hoodField(ctx.addons),
    acclimatized: ctx.acclimatized,
    precaution_level: ctx.precautionLevel,
    minutes_exposed: minutes.minutesExposed,
    minutes_since_last_break: minutes.minutesSinceLastBreak,
    language: engineLanguage(ctx.preferredLanguage),
    hours,
  };
}

// ---- fail-safe ---------------------------------------------------------------

export const FALLBACK_WINDOW_MS = HOUR;

/**
 * Used when the engine can't be reached. Fail safe, not silent: at least High,
 * and never below the last real engine level from the past hour.
 */
export function fallbackAssessment(
  previous: {
    level: RiskLevel;
    assessedAt: Date;
    source: AssessmentSource;
  } | null,
  now: Date,
): {
  level: RiskLevel;
  label: string;
  action: EngineAction;
  reasons: { factor: string; effect: string }[];
  dataQuality: DataQuality;
} {
  const recent =
    previous &&
    now.getTime() - previous.assessedAt.getTime() <= FALLBACK_WINDOW_MS
      ? previous.level
      : RiskLevel.LOW;
  const level: RiskLevel = recent > RiskLevel.HIGH ? recent : RiskLevel.HIGH;
  return {
    level,
    label: LEVEL_NAME[level],
    dataQuality: DataQuality.DEGRADED,
    reasons: [
      {
        factor: 'data',
        effect:
          'The risk service could not be reached, so High risk is assumed until it is back.',
      },
    ],
    action:
      level === RiskLevel.CRITICAL
        ? {
            what: 'Stop strenuous work, move to a cool or shaded area, drink water and tell your supervisor.',
            when: 'immediately',
          }
        : {
            what: 'Follow the site heat plan: take regular breaks in shade, drink water often, and report any symptoms to your supervisor.',
            when: 'now',
          },
  };
}

// ---- misc ------------------------------------------------------------------

export function timingFor(when: EngineWhen): RecommendationTiming {
  return when === 'routine'
    ? RecommendationTiming.PRECAUTION
    : RecommendationTiming.IMMEDIATE;
}

// ---- forecast storage ------------------------------------------------------------

const CONFIDENCES: readonly EngineConfidence[] = ['high', 'moderate', 'low'];

const LEVELS = [
  RiskLevel.LOW,
  RiskLevel.ELEVATED,
  RiskLevel.HIGH,
  RiskLevel.CRITICAL,
] as const;

/** A valid 1–4 level from an untrusted number, else null. */
const asLevel = (n: unknown): RiskLevel | null =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4
    ? LEVELS[n - 1]
    : null;

const asConfidence = (c: unknown): EngineConfidence | null =>
  CONFIDENCES.find((v) => v === c) ?? null;

/**
 * Turn the engine forecast into what we store. The uncertainty fields (engine
 * request #4) are optional: used when present and valid, otherwise null. A
 * "possible" level only counts when it is higher than the definite level.
 */
export function storedForecast(forecast: WorkerForecast | null) {
  const hours = (forecast?.hours ?? []).map((h) => {
    const level = asLevel(h.level) ?? RiskLevel.HIGH; // malformed level: assume High
    const possible = asLevel(h.possible_level);
    const higher = possible !== null && Number(possible) > Number(level);
    return {
      at: h.timestamp,
      level,
      label: h.label,
      action: h.action,
      dataQuality:
        h.data_quality === 'ok' ? DataQuality.OK : DataQuality.DEGRADED,
      possibleLevel: higher ? possible : null,
      possibleLabel: higher ? (h.possible_label ?? levelName(possible)) : null,
      confidence: asConfidence(h.confidence),
    };
  });

  const definitePeak = forecast ? Number(forecast.peak_level) : 0;
  let possiblePeak: { level: RiskLevel; at: Date } | null = null;
  for (const h of hours) {
    const p = h.possibleLevel;
    if (p === null || Number(p) <= definitePeak) continue;
    if (!possiblePeak || Number(p) > Number(possiblePeak.level)) {
      possiblePeak = { level: p, at: new Date(h.at) };
    }
  }

  return {
    hours,
    confidence: asConfidence(forecast?.confidence),
    confidenceNote: forecast?.confidence_note ?? null,
    possiblePeak,
  };
}

// ---- next break ------------------------------------------------------------------

/** "Next break in 12 min, 15 min in shade", or "on a break now". */
export function nextBreak(
  a: {
    plannedBreaks: Date[];
    breakMinutes: number;
    onBreakSince: Date | null;
    endsAt: Date;
  },
  now: Date,
) {
  if (a.onBreakSince) {
    return {
      onBreakNow: true,
      since: a.onBreakSince,
      startsAt: null,
      minutesUntil: null,
      durationMinutes: a.breakMinutes,
    };
  }
  const next = [...a.plannedBreaks]
    .map((b) => new Date(b))
    .filter((b) => b > now && b < a.endsAt)
    .sort((x, y) => x.getTime() - y.getTime())[0];
  if (!next) return null;
  return {
    onBreakNow: false,
    since: null,
    startsAt: next,
    minutesUntil: Math.ceil((next.getTime() - now.getTime()) / 60_000),
    durationMinutes: a.breakMinutes,
  };
}
