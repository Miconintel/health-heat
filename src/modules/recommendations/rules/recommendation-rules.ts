import {
  PrecautionLevel,
  RecommendationAudience,
  RecommendationTiming,
  RiskLevel,
} from '../../../common/enums';
import type {
  EngineAction,
  EnginePpe,
  LevelReached,
} from '../../ai-engine/engine.types';
import {
  LEVEL_NAME,
  levelName,
  timingFor,
} from '../../risk-engine/engine-mapping';

/**
 * Recommendations (spec 3.6).
 *
 * - Worker-facing: taken as-is from the external engine's `action` (already in the
 *   worker's language). We do not write our own worker advice.
 * - Supervisor / crew-facing: built here from the engine's level, the assigned PPE
 *   class and the engine forecast ONLY. They never use reasons or precaution level,
 *   so nothing in them can reveal a worker's health (engine guide §6).
 *
 * Safety invariant (spec 3.4): no rule may recommend removing essential PPE.
 */

export interface RecommendationDraft {
  audience: RecommendationAudience;
  code: string;
  riskLevel: RiskLevel;
  whatHappened: string;
  whyItMatters: string;
  whoIsAffected: string;
  action: string;
  timing: RecommendationTiming;
  dueAt: Date | null;
  workerId: string | null;
  crewId: string | null;
}

export function workerRecommendation(ctx: {
  workerId: string;
  crewId: string | null;
  level: RiskLevel;
  label: string;
  action: EngineAction;
}): RecommendationDraft {
  return {
    audience: RecommendationAudience.WORKER,
    code: 'worker.engine_action',
    riskLevel: ctx.level,
    whatHappened: ctx.label,
    // Reasons are shown from the (encrypted) assessment via /me/risk, not copied here.
    whyItMatters: 'See your risk details for the reasons.',
    whoIsAffected: 'You',
    action: ctx.action.what,
    timing: timingFor(ctx.action.when),
    dueAt: null,
    workerId: ctx.workerId,
    crewId: ctx.crewId,
  };
}

export interface SupervisorRuleContext {
  workerId: string;
  workerName: string;
  crewId: string | null;
  level: RiskLevel;
  ppe: EnginePpe;
  /** Worker wears a hood; added PPE heat burden even if the engine can't count it yet. */
  hood: boolean;
  forecastFirstReached: LevelReached[];
  forecastPeakLevel: RiskLevel | null;
}

export function supervisorRecommendations(
  ctx: SupervisorRuleContext,
): RecommendationDraft[] {
  const base = {
    audience: RecommendationAudience.SUPERVISOR,
    riskLevel: ctx.level,
    whatHappened: `${LEVEL_NAME[ctx.level]} heat risk`,
    whyItMatters: `${LEVEL_NAME[ctx.level]} heat risk for this worker`,
    whoIsAffected: ctx.workerName,
    workerId: ctx.workerId,
    crewId: ctx.crewId,
    dueAt: null,
  };
  const out: RecommendationDraft[] = [];

  if (ctx.level === RiskLevel.CRITICAL) {
    out.push({
      ...base,
      code: 'supervisor.suspend_activity',
      action:
        'Suspend the affected activity, start heat-emergency procedures and check this worker now.',
      timing: RecommendationTiming.IMMEDIATE,
    });
    return out; // critical overrides the softer actions below
  }

  if (ctx.level === RiskLevel.HIGH) {
    out.push({
      ...base,
      code: 'supervisor.extra_breaks_reduce_load',
      action:
        'Introduce additional rest breaks in shade, reduce physically demanding work, or temporarily reassign this worker to lower-exposure work.',
      timing: RecommendationTiming.IMMEDIATE,
    });
  }

  if (ctx.level === RiskLevel.ELEVATED) {
    out.push({
      ...base,
      code: 'supervisor.increase_monitoring',
      action:
        'Increase monitoring of this worker and make sure water and shade are available.',
      timing: RecommendationTiming.PRECAUTION,
    });
  }

  if (ctx.level >= RiskLevel.ELEVATED && (ctx.ppe !== 'standard' || ctx.hood)) {
    out.push({
      ...base,
      code: 'supervisor.review_ppe_cooling',
      action:
        'Provide additional cooling and recovery time. Review whether lower heat-burden PPE alternatives give equal protection against the workplace hazard. Do not remove essential protective equipment.',
      timing: RecommendationTiming.PRECAUTION,
    });
  }

  // Early warning from the engine forecast: High or above coming later in the shift.
  const firstHigh = ctx.forecastFirstReached
    .filter((r) => r.level >= Number(RiskLevel.HIGH))
    // Compare as instants: timestamps may carry different UTC offsets.
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))[0];
  if (
    firstHigh &&
    ctx.forecastPeakLevel &&
    ctx.forecastPeakLevel > ctx.level &&
    ctx.forecastPeakLevel >= RiskLevel.HIGH
  ) {
    out.push({
      ...base,
      code: 'supervisor.reschedule_before_peak',
      whatHappened: `Heat risk forecast to reach ${levelName(firstHigh.level)}`,
      action:
        'Reschedule physically demanding work for this worker away from the forecast peak, or plan extra breaks before it.',
      timing: RecommendationTiming.SCHEDULED,
      dueAt: new Date(firstHigh.at),
    });
  }

  return out;
}

/**
 * Decision D1: a worker with occupational-health precautions gets a supervisor alert
 * that says only WHAT to do. No level name, no word "precautions", no health detail.
 * Kept separate from supervisorRecommendations, which never sees precaution levels.
 */
export function workerCareAlert(ctx: {
  workerId: string;
  workerName: string;
  crewId: string | null;
  level: RiskLevel;
  forecastPeakLevel: RiskLevel | null;
  precautionLevel: PrecautionLevel;
}): RecommendationDraft[] {
  if (ctx.precautionLevel === PrecautionLevel.STANDARD) return [];
  const hotToday =
    ctx.level >= RiskLevel.ELEVATED ||
    (ctx.forecastPeakLevel ?? RiskLevel.LOW) >= RiskLevel.HIGH;
  if (!hotToday) return [];
  const reduced = ctx.precautionLevel === PrecautionLevel.HIGH_PRIORITY;
  return [
    {
      audience: RecommendationAudience.SUPERVISOR,
      code: reduced
        ? 'supervisor.worker_reduced_exposure'
        : 'supervisor.worker_earlier_breaks',
      riskLevel: ctx.level,
      whatHappened: reduced
        ? 'Needs reduced exposure today'
        : 'Needs earlier breaks today',
      whyItMatters: `${LEVEL_NAME[ctx.level]} heat risk for this worker`,
      whoIsAffected: ctx.workerName,
      action: reduced
        ? "Reduce this worker's heat exposure today: shaded or lighter duty, and a recovery break every 30 minutes."
        : 'Give this worker earlier and more frequent rest breaks in shade today.',
      timing: RecommendationTiming.IMMEDIATE,
      dueAt: null,
      workerId: ctx.workerId,
      crewId: ctx.crewId,
    },
  ];
}

export interface CrewRuleContext {
  crewId: string;
  crewName: string;
  workerLevels: RiskLevel[];
  /** Most common activity in the crew today, e.g. "Excavation". */
  activityName?: string | null;
  /** First forecast Critical hour for any crew member: the "before" deadline. */
  firstCriticalAt?: Date | null;
}

/** Crew-level actions when several workers in the same crew are at High or above. */
export function crewRecommendations(
  ctx: CrewRuleContext,
): RecommendationDraft[] {
  const highOrAbove = ctx.workerLevels.filter(
    (l) => l >= RiskLevel.HIGH,
  ).length;
  if (highOrAbove < 2) return [];
  const maxLevel = Math.max(...ctx.workerLevels);
  return [
    {
      audience: RecommendationAudience.SUPERVISOR,
      code: 'crew.rotate_and_cool',
      riskLevel: maxLevel,
      whatHappened: `${highOrAbove} of ${ctx.workerLevels.length} workers in ${ctx.crewName}${ctx.activityName ? ` (${ctx.activityName})` : ''} at High risk or above`,
      whyItMatters:
        'Several workers are exposed to hazardous heat at the same time',
      whoIsAffected: `Crew: ${ctx.crewName}`,
      action:
        'Rotate workers between high- and low-exposure tasks, provide extra shade, cooling and hydration, and move heavy work to cooler periods.',
      timing: RecommendationTiming.IMMEDIATE,
      // Act before the crew's risk is forecast to reach Critical.
      dueAt: ctx.firstCriticalAt ?? null,
      workerId: null,
      crewId: ctx.crewId,
    },
  ];
}
