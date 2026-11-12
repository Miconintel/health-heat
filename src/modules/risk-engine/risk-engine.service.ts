import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  Repository,
  Between,
} from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  AssessmentSource,
  AuditAction,
  DataQuality,
  EnginePpeAddon,
  PrecautionLevel,
  ReadingSource,
  RiskLevel,
} from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { hourInstants, localDate } from '../../common/time';
import { ShiftPlan } from '../plans/entities/shift-plan.entity';
import { ConfigService } from '@nestjs/config';
import { WearableReading } from '../wearables/entities/wearable-reading.entity';
import { WearableDevice } from '../wearables/entities/wearable-device.entity';
import { summarise, WearableSummary } from '../wearables/wearable-summary';
import { engineHourPlan } from '../plans/plan-rules';
import { acclimatizationStatus } from '../workers/acclimatization';
import { EngineClient, EngineError } from '../ai-engine/engine.client';
import type { WorkerForecast } from '../ai-engine/engine.types';
import { EnvironmentService } from '../environment/environment.service';
import { EnvironmentalReading } from '../environment/entities/environmental-reading.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { Crew } from '../organizations/entities/crew.entity';
import { Site } from '../organizations/entities/site.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { Worker } from '../workers/entities/worker.entity';
import { RecommendationsService } from '../recommendations/recommendations.service';
import {
  crewRecommendations,
  RecommendationDraft,
  supervisorRecommendations,
  workerCareAlert,
  workerRecommendation,
} from '../recommendations/rules/recommendation-rules';
import {
  buildAssessRequest,
  buildForecastRequest,
  enginePpeFor,
  engineLanguage,
  fallbackAssessment,
  LEVEL_NAME,
  nextBreak,
  ppeAddonsFor,
  storedForecast,
  WorkerContext,
} from './engine-mapping';
import { SiteHeatService } from './site-heat.service';
import { RiskAssessment } from './entities/risk-assessment.entity';

const ENGINE_CONCURRENCY = 5;

type Draft = RecommendationDraft & { riskAssessmentId: string | null };

/** Most frequent value, or null. */
export function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: string | null = null;
  for (const [v, n] of counts)
    if (!best || n > (counts.get(best) ?? 0)) best = v;
  return best;
}

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Orchestrates heat-risk assessment. The risk itself is computed by the external
 * HeatGuard AI engine; this service supplies the context the engine needs, stores
 * its answers, builds supervisor and crew views, and enforces who sees what.
 */
@Injectable()
export class RiskEngineService {
  private readonly logger = new Logger(RiskEngineService.name);
  /** Tail of the run chain per site: every run for a site happens one after another. */
  private readonly siteChains = new Map<string, Promise<unknown>>();
  /** Sites with a background run queued but not yet started (coalesces bursts of events). */
  private readonly pendingBackground = new Set<string>();

  constructor(
    @InjectRepository(RiskAssessment)
    private readonly assessments: Repository<RiskAssessment>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(WorkerPpe)
    private readonly workerPpe: Repository<WorkerPpe>,
    @InjectRepository(HealthProfile)
    private readonly profiles: Repository<HealthProfile>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
    private readonly engine: EngineClient,
    private readonly env: EnvironmentService,
    private readonly orgs: OrganizationsService,
    private readonly recommendations: RecommendationsService,
    private readonly audit: AuditService,
    private readonly siteHeat: SiteHeatService,
    @InjectRepository(ShiftPlan) private readonly plans: Repository<ShiftPlan>,
    @InjectRepository(WearableReading)
    private readonly bandReadings: Repository<WearableReading>,
    @InjectRepository(WearableDevice)
    private readonly bandDevices: Repository<WearableDevice>,
    config: ConfigService,
  ) {
    this.wearablesEnabled = config.get<boolean>('WEARABLES_ENABLED') === true;
  }

  private readonly wearablesEnabled: boolean;

  // ---------------------------------------------------------------------------
  // Running assessments
  // ---------------------------------------------------------------------------

  private activeWhere(now: Date) {
    return {
      startsAt: LessThanOrEqual(now),
      endsAt: MoreThan(now),
      clockedOutAt: IsNull(),
    };
  }

  /**
   * Run `fn` after every earlier run for the same site has finished, so two runs
   * never reconcile the same site's recommendations at the same time.
   */
  private serialized<T>(siteId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.siteChains.get(siteId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(fn);
    const tail = run.catch(() => undefined);
    this.siteChains.set(siteId, tail);
    void tail.then(() => {
      if (this.siteChains.get(siteId) === tail) this.siteChains.delete(siteId);
    });
    return run;
  }

  /** Assess every worker with an active assignment at the site, then refresh recommendations. */
  runForSite(organizationId: string, siteId: string) {
    // `now` is taken when the run actually starts, not when it was queued.
    return this.serialized(siteId, () =>
      this.runSite(organizationId, siteId, new Date()),
    );
  }

  private async runSite(organizationId: string, siteId: string, now: Date) {
    const site = await this.orgs.getSite(organizationId, siteId);

    if (await this.env.needsRefresh(siteId, now)) {
      // Weather down must not stop the run: the engine degrades safely without WBGT.
      await this.env
        .refreshSite(site)
        .catch((err: Error) =>
          this.logger.warn(
            `Weather refresh failed for site ${siteId}: ${err.message}`,
          ),
        );
    }

    // Site heat for the reference worker, even when nobody is on shift.
    await this.siteHeat.update(site, now);

    const candidates = await this.assignments.find({
      where: { siteId, organizationId, ...this.activeWhere(now) },
      order: { startsAt: 'DESC', createdAt: 'DESC' },
    });
    // One assessment per worker: if assignments overlap, the most recently started one counts.
    const seenWorkers = new Set<string>();
    const active = candidates.filter((a) => {
      if (seenWorkers.has(a.workerId)) return false;
      seenWorkers.add(a.workerId);
      return true;
    });
    if (active.length === 0) {
      await this.recommendations.sync(organizationId, siteId, []);
      return { assessedAt: now, assessed: 0, fallback: 0 };
    }

    const workerIds = [...new Set(active.map((a) => a.workerId))];
    const latestEnd = new Date(
      Math.max(...active.map((a) => a.endsAt.getTime())),
    );
    const [readings, forecastRows, workers, ppeRows, profiles] =
      await Promise.all([
        this.env.readingsForEngine(siteId, now),
        this.env.forecast(siteId, now, latestEnd),
        this.workers.findBy({
          id: In(workerIds),
          organizationId,
          isActive: true,
        }),
        this.workerPpe.find({ where: { workerId: In(workerIds) } }),
        // Only the classification is sent to the engine; clinical columns are never loaded.
        this.profiles.find({
          select: { workerId: true, precautionLevel: true },
          where: { workerId: In(workerIds) },
        }),
      ]);
    const workerById = new Map(workers.map((w) => [w.id, w]));
    // Band summaries go to the engine only when it supports them (ENGINE_SUPPORTS_WEARABLES).
    const bandByWorker = this.engine.supportsWearables
      ? await this.bandSummaries(workerIds, now)
      : new Map<string, WearableSummary>();
    const precautionByWorker = new Map(
      profiles.map((p) => [p.workerId, p.precautionLevel]),
    );

    await this.engine.warmUp();
    const siteToday = localDate(site.timezone, now);
    // A sent shift plan gives forecasts the planned work and breaks for each hour.
    const sentPlan = await this.plans.findOneBy({
      siteId,
      date: siteToday,
      status: 'sent',
    });
    const planHourStarts = sentPlan
      ? hourInstants(site.timezone, sentPlan.date, sentPlan.hours)
      : undefined;

    const results = await mapLimit(
      active,
      ENGINE_CONCURRENCY,
      async (assignment) => {
        const worker = workerById.get(assignment.workerId);
        if (!worker) return null;
        const workerItems = ppeRows
          .filter((p) => p.workerId === worker.id)
          .map((p) => p.ppeItem);
        const { notModelled, ...addons } = ppeAddonsFor(
          workerItems,
          this.engine.supportsHood,
        );
        const ctx: WorkerContext = {
          workerId: worker.id,
          siteId,
          acclimatized: acclimatizationStatus(
            worker.acclimatizationStartedOn,
            siteToday,
          ).acclimatized,
          preferredLanguage: worker.preferredLanguage,
          workload:
            assignment.workloadOverride ??
            assignment.activityCategory.defaultWorkload,
          workEnvironment: assignment.workEnvironment,
          ppe: enginePpeFor(workerItems),
          addons,
          precautionLevel:
            precautionByWorker.get(worker.id) ?? PrecautionLevel.STANDARD,
          shift: assignment,
          wearable: bandByWorker.get(worker.id) ?? null,
          hourPlan:
            sentPlan &&
            planHourStarts &&
            worker.crewId &&
            sentPlan.crews[worker.crewId]
              ? engineHourPlan(
                  sentPlan.crews[worker.crewId],
                  planHourStarts,
                  assignment.workloadOverride ??
                    assignment.activityCategory.defaultWorkload,
                )
              : undefined,
        };
        return this.assessOne(
          organizationId,
          notModelled,
          worker,
          assignment,
          ctx,
          readings,
          forecastRows,
          now,
        );
      },
    );

    const drafts: Draft[] = [];
    const crewLevels = new Map<string, RiskLevel[]>();
    let fallback = 0;
    for (const r of results) {
      if (!r) continue;
      drafts.push(...r.drafts);
      if (r.assessment.source === AssessmentSource.FALLBACK) fallback++;
      const crewId = r.assessment.crewId;
      if (crewId)
        crewLevels.set(crewId, [
          ...(crewLevels.get(crewId) ?? []),
          r.assessment.level,
        ]);
    }

    if (crewLevels.size) {
      const crews = await this.crews.findBy({ id: In([...crewLevels.keys()]) });
      for (const crew of crews) {
        const crewResults = results.filter(
          (r): r is NonNullable<typeof r> =>
            !!r && r.assessment.crewId === crew.id,
        );
        const firstCritical = crewResults
          .flatMap((r) => r.assessment.forecastFirstReached)
          .filter((f) => f.level >= Number(RiskLevel.CRITICAL))
          .map((f) => new Date(f.at))
          .sort((a, b) => a.getTime() - b.getTime())[0];
        for (const d of crewRecommendations({
          crewId: crew.id,
          crewName: crew.name,
          workerLevels: crewLevels.get(crew.id) ?? [],
          activityName: mostCommon(
            active
              .filter((a) => workerById.get(a.workerId)?.crewId === crew.id)
              .map((a) => a.activityCategory.name),
          ),
          firstCriticalAt: firstCritical ?? null,
        })) {
          drafts.push({ ...d, riskAssessmentId: null });
        }
      }
    }

    await this.recommendations.sync(organizationId, siteId, drafts);
    if (fallback > 0) {
      this.logger.warn(
        `Site ${siteId}: ${fallback} assessment(s) used the fail-safe fallback`,
      );
    }
    return {
      assessedAt: now,
      assessed: results.filter(Boolean).length,
      fallback,
    };
  }

  /** One worker: engine assess + forecast, or the fail-safe if the engine is unreachable. */
  private async assessOne(
    organizationId: string,
    ppeNotModelled: EnginePpeAddon[],
    worker: Worker,
    assignment: WorkAssignment,
    ctx: WorkerContext,
    readings: {
      current: EnvironmentalReading | null;
      lastKnown: EnvironmentalReading | null;
    },
    forecastRows: EnvironmentalReading[],
    now: Date,
  ): Promise<{ assessment: RiskAssessment; drafts: Draft[] }> {
    const language = engineLanguage(worker.preferredLanguage);
    const base = {
      organizationId,
      siteId: ctx.siteId,
      workerId: worker.id,
      crewId: worker.crewId,
      workAssignmentId: assignment.id,
      assessedAt: now,
      language,
      ppeNotModelled,
    };

    let entity: RiskAssessment;
    try {
      const current = await this.engine.assess(
        buildAssessRequest(ctx, readings.current, readings.lastKnown, now),
      );

      // Forecast is best-effort: if it fails we still keep the current assessment.
      let forecast: WorkerForecast | null = null;
      const forecastReq = buildForecastRequest(ctx, forecastRows, now);
      if (forecastReq) {
        forecast = await this.engine
          .forecast(forecastReq)
          .catch((err: Error) => {
            this.logger.warn(
              `Forecast failed for worker ${worker.id}: ${err.message}`,
            );
            return null;
          });
      }

      const stored = storedForecast(forecast);
      entity = this.assessments.create({
        ...base,
        source: AssessmentSource.ENGINE,
        level: current.level,
        label: current.label,
        reasons: current.reasons,
        action: current.action,
        wbgtC: current.wbgt_c,
        wbgtSource: current.wbgt_source,
        dataQuality: current.data_quality as DataQuality,
        forecastFirstReached: forecast?.first_reached ?? [],
        forecastPeakLevel: forecast ? forecast.peak_level : null,
        forecastPeakAt: forecast ? new Date(forecast.peak_at) : null,
        forecastHours: stored.hours,
        forecastConfidence: stored.confidence,
        forecastConfidenceNote: stored.confidenceNote,
        forecastPossiblePeakLevel: stored.possiblePeak?.level ?? null,
        forecastPossiblePeakAt: stored.possiblePeak?.at ?? null,
      });
    } catch (err) {
      if (!(err instanceof EngineError)) throw err;
      this.logger.warn(
        `Engine unavailable for worker ${worker.id}: ${err.message}`,
      );
      const previous = await this.assessments.findOne({
        where: { workerId: worker.id, source: AssessmentSource.ENGINE },
        order: { assessedAt: 'DESC' },
      });
      const fb = fallbackAssessment(previous, now);
      entity = this.assessments.create({
        ...base,
        source: AssessmentSource.FALLBACK,
        language: engineLanguage(null), // fallback text is English only
        ...fb,
        wbgtC: null,
        wbgtSource: null,
        forecastFirstReached: [],
        forecastPeakLevel: null,
        forecastPeakAt: null,
        forecastHours: [],
        forecastConfidence: null,
        forecastConfidenceNote: null,
        forecastPossiblePeakLevel: null,
        forecastPossiblePeakAt: null,
      });
    }

    const saved = await this.assessments.save(entity);
    const drafts: Draft[] = [
      workerRecommendation({
        workerId: worker.id,
        crewId: worker.crewId,
        level: saved.level,
        label: saved.label,
        action: saved.action,
      }),
      ...supervisorRecommendations({
        workerId: worker.id,
        workerName: worker.displayName,
        crewId: worker.crewId,
        level: saved.level,
        ppe: ctx.ppe,
        hood: ctx.addons.hood,
        forecastFirstReached: saved.forecastFirstReached,
        forecastPeakLevel: saved.forecastPeakLevel,
      }),
      ...workerCareAlert({
        workerId: worker.id,
        workerName: worker.displayName,
        crewId: worker.crewId,
        level: saved.level,
        forecastPeakLevel: saved.forecastPeakLevel,
        precautionLevel: ctx.precautionLevel,
      }),
    ].map((d) => ({ ...d, riskAssessmentId: saved.id }));

    return { assessment: saved, drafts };
  }

  /**
   * Queue a background run for a site. Several events in a burst (clock-in, PPE,
   * new assignment) collapse into one run that picks up all of them.
   */
  private queueSiteRun(organizationId: string, siteId: string): Promise<void> {
    if (this.pendingBackground.has(siteId)) return Promise.resolve();
    this.pendingBackground.add(siteId);
    return this.serialized(siteId, async () => {
      this.pendingBackground.delete(siteId);
      await this.runSite(organizationId, siteId, new Date());
    }).catch((err: Error) =>
      this.logger.warn(
        `Reassessment failed for site ${siteId}: ${err.message}`,
      ),
    );
  }

  /**
   * Called when a worker's task, clothing or break status changes (engine guide §7).
   * Fire-and-forget: never blocks or fails the caller's request.
   */
  reassessWorkerInBackground(organizationId: string, workerId: string): void {
    void (async () => {
      const now = new Date();
      const active = await this.assignments.find({
        where: { organizationId, workerId, ...this.activeWhere(now) },
      });
      for (const siteId of new Set(active.map((a) => a.siteId))) {
        await this.queueSiteRun(organizationId, siteId);
      }
    })().catch((err: Error) =>
      this.logger.warn(
        `Background reassessment failed for worker ${workerId}: ${err.message}`,
      ),
    );
  }

  async refreshWeatherForAllSites(): Promise<void> {
    await this.env.refreshAllSites();
  }

  async runForAllSites(): Promise<void> {
    const sites = await this.assignments.manager.find(Site);
    for (const site of sites) {
      await this.queueSiteRun(site.organizationId, site.id);
    }
  }

  // ---------------------------------------------------------------------------
  // Views
  // ---------------------------------------------------------------------------

  /**
   * Supervisor (and OH) dashboard.
   * Per engine guide §6: per worker only id, level, label and action, plus forecast
   * levels/times. Never `reasons`, never the precaution level.
   */
  async siteOverview(
    user: AuthUser,
    siteId: string,
    filter: { crewId?: string },
  ) {
    await this.orgs.getSite(user.organizationId, siteId);
    const now = new Date();
    const [readings, forecast] = await Promise.all([
      this.env.readingsForEngine(siteId, now),
      this.env.forecast(siteId, now, new Date(now.getTime() + 12 * 3_600_000)),
    ]);

    const latest = await this.assessments
      .createQueryBuilder('a')
      .select('MAX(a.assessedAt)', 'max')
      .where('a.siteId = :siteId AND a.organizationId = :org', {
        siteId,
        org: user.organizationId,
      })
      .getRawOne<{ max: Date | null }>();

    const rows = latest?.max
      ? await this.assessments.find({
          // Explicit column list: `reasons` is never even loaded for this view.
          select: {
            id: true,
            workerId: true,
            crewId: true,
            assessedAt: true,
            source: true,
            level: true,
            label: true,
            language: true,
            action: { what: true, when: true },
            dataQuality: true,
            ppeNotModelled: true,
            forecastFirstReached: true,
            forecastPeakLevel: true,
            forecastPeakAt: true,
            forecastConfidence: true,
            forecastPossiblePeakLevel: true,
            forecastPossiblePeakAt: true,
          },
          where: {
            siteId,
            organizationId: user.organizationId,
            assessedAt: latest.max,
            ...(filter.crewId ? { crewId: filter.crewId } : {}),
          },
          order: { level: 'DESC' },
        })
      : [];
    const names = new Map(
      (await this.workers.findBy({ id: In(rows.map((r) => r.workerId)) })).map(
        (w) => [w.id, w.displayName],
      ),
    );

    // Feeds each worker's "Who looked at your data" (one entry per view).
    if (rows.length) {
      await this.audit.record(user, AuditAction.RISK_OVERVIEW_VIEWED, {
        entityType: 'site',
        entityId: siteId,
        metadata: { workerIds: rows.map((r) => r.workerId) },
      });
    }

    const distribution = { low: 0, elevated: 0, high: 0, critical: 0 };
    for (const r of rows) {
      const key = LEVEL_NAME[
        r.level
      ].toLowerCase() as keyof typeof distribution;
      distribution[key]++;
    }

    const current = readings.current;
    return {
      assessedAt: latest?.max ?? null,
      environment: {
        current: current && {
          observedAt: current.observedAt,
          source: current.source,
          airTempC: current.airTempC,
          relativeHumidity: current.relativeHumidity,
          solarRadiationWm2: current.solarRadiationWm2,
          windSpeedMs: current.windSpeedMs,
          wbgtSunC: current.wbgtSunC,
          wbgtShadeC: current.wbgtShadeC,
          wbgtMethod: current.wbgtMethod,
        },
        forecast: forecast.map((f) => ({
          at: f.observedAt,
          wbgtSunC: f.wbgtSunC,
          wbgtShadeC: f.wbgtShadeC,
          wbgtMethod: f.wbgtMethod,
        })),
      },
      distribution,
      degraded: rows.filter((r) => r.dataQuality === DataQuality.DEGRADED)
        .length,
      workers: rows.map((r) =>
        this.toSupervisorView(r, names.get(r.workerId) ?? null),
      ),
    };
  }

  /** The only shape a supervisor ever receives for a worker. */
  toSupervisorView(r: RiskAssessment, workerName: string | null) {
    return {
      workerId: r.workerId,
      workerName,
      crewId: r.crewId,
      assessedAt: r.assessedAt,
      level: r.level,
      levelName: LEVEL_NAME[r.level],
      /** Engine label, in the worker's language. Use `level` / `levelName` for logic. */
      label: r.label,
      /** Engine's worker action. `what` is in `language`; `when` is always an English code. */
      action: { what: r.action.what, when: r.action.when },
      language: r.language,
      dataQuality: r.dataQuality,
      /** PPE the engine couldn't count (e.g. hood): the level may be too low. */
      ppeNotModelled: r.ppeNotModelled,
      source: r.source,
      forecast: {
        firstReached: r.forecastFirstReached.map((f) => ({
          level: f.level,
          at: f.at,
        })),
        peakLevel: r.forecastPeakLevel,
        peakAt: r.forecastPeakAt,
        /** "May reach" level above the definite peak (shown as "4?"). Null until the engine sends it. */
        possiblePeakLevel: r.forecastPossiblePeakLevel,
        possiblePeakAt: r.forecastPossiblePeakAt,
        confidence: r.forecastConfidence,
      },
    };
  }

  private toWorkerView(a: RiskAssessment) {
    return {
      assessedAt: a.assessedAt,
      level: a.level,
      levelName: LEVEL_NAME[a.level],
      label: a.label,
      language: a.language,
      reasons: a.reasons,
      action: a.action,
      wbgtC: a.wbgtC,
      wbgtSource: a.wbgtSource,
      dataQuality: a.dataQuality,
      ppeNotModelled: a.ppeNotModelled,
      source: a.source,
      forecast: {
        firstReached: a.forecastFirstReached,
        peakLevel: a.forecastPeakLevel,
        peakAt: a.forecastPeakAt,
        possiblePeakLevel: a.forecastPossiblePeakLevel,
        possiblePeakAt: a.forecastPossiblePeakAt,
        confidence: a.forecastConfidence,
        confidenceNote: a.forecastConfidenceNote,
        // Saved so the worker app can keep warning if the signal drops (engine guide §8).
        hours: a.forecastHours,
      },
    };
  }

  /** Worker app: own full view, including reasons and the saved forecast. */
  async myRisk(user: AuthUser) {
    if (!user.workerId) throw new ForbiddenException();
    const latest = await this.assessments.findOne({
      where: { workerId: user.workerId, organizationId: user.organizationId },
      order: { assessedAt: 'DESC' },
    });
    if (!latest) throw new NotFoundException('No assessment yet');
    const now = new Date();
    const [recommendations, assignment, crewLevel, dataSources, hazards] =
      await Promise.all([
        this.recommendations.listForWorker(user.organizationId, user.workerId),
        this.assignments.findOneBy({ id: latest.workAssignmentId }),
        this.crewLevelExcluding(latest),
        this.dataSources(latest.siteId, now, latest.workerId),
        this.env.hazards(latest.siteId, now),
      ]);
    return {
      ...this.toWorkerView(latest),
      nextBreak: assignment ? nextBreak(assignment, now) : null,
      /** Highest level among the rest of the crew (for the "Who" line); null if alone. */
      crewLevel,
      dataSources,
      /** "Also today": dust and storms. */
      hazards,
      recommendations,
    };
  }

  /** Highest level among the other crew members assessed in the same run. Level only. */
  private async crewLevelExcluding(
    a: RiskAssessment,
  ): Promise<RiskLevel | null> {
    if (!a.crewId) return null;
    const row = await this.assessments
      .createQueryBuilder('x')
      .select('MAX(x.level)', 'max')
      .where('x.crewId = :crew AND x.siteId = :site AND x.assessedAt = :at', {
        crew: a.crewId,
        site: a.siteId,
        at: a.assessedAt,
      })
      .andWhere('x.workerId <> :me', { me: a.workerId })
      .getRawOne<{ max: number | null }>();
    return row?.max ? Number(row.max) : null;
  }

  /** Last-30-minute band summaries per worker (fresh ones only). */
  private async bandSummaries(workerIds: string[], now: Date) {
    const rows = await this.bandReadings.find({
      where: {
        workerId: In(workerIds),
        at: Between(new Date(now.getTime() - 30 * 60_000), now),
      },
    });
    const byWorker = new Map<
      string,
      { at: Date; heartRateBpm: number | null; skinTempC: number | null }[]
    >();
    for (const r of rows) {
      byWorker.set(r.workerId, [
        ...(byWorker.get(r.workerId) ?? []),
        { at: r.at, ...r.values },
      ]);
    }
    const out = new Map<string, WearableSummary>();
    for (const [id, samples] of byWorker) {
      const sum = summarise(samples, now);
      if (sum) out.set(id, sum);
    }
    return out;
  }

  /** Freshness of each data source feeding the assessment (home screen "from …" line). */
  private async dataSources(siteId: string, now: Date, workerId?: string) {
    const band =
      this.wearablesEnabled && workerId
        ? await this.bandDevices.findOneBy({ workerId })
        : null;
    const [weather, sensor] = await Promise.all([
      this.env.latestObservation(siteId, ReadingSource.WEATHER_API),
      this.env.latestObservation(siteId, ReadingSource.SENSOR),
    ]);
    const fresh = (at: Date | undefined, maxMin: number) =>
      !!at && now.getTime() - at.getTime() <= maxMin * 60_000;
    return {
      weather: {
        ok: fresh(weather?.observedAt, 60),
        at: weather?.observedAt ?? null,
      },
      /** null = the site has no sensor. */
      siteSensor: sensor
        ? { ok: fresh(sensor.observedAt, 30), at: sensor.observedAt }
        : null,
      /** null = band feature off or no band paired. */
      wearable: band
        ? { ok: fresh(band.lastSeenAt ?? undefined, 15), at: band.lastSeenAt }
        : null,
    };
  }

  /** Occupational health: a worker's full view. Reasons may reveal health data, so it is audited. */
  async workerRiskDetail(user: AuthUser, workerId: string) {
    const worker = await this.workers.findOneBy({
      id: workerId,
      organizationId: user.organizationId,
    });
    if (!worker) throw new NotFoundException('Worker not found');
    const latest = await this.assessments.findOne({
      where: { workerId, organizationId: user.organizationId },
      order: { assessedAt: 'DESC' },
    });
    await this.audit.record(user, AuditAction.RISK_DETAIL_READ, {
      subjectWorkerId: workerId,
      entityType: 'risk_assessment',
      entityId: latest?.id ?? null,
    });
    if (!latest) throw new NotFoundException('No assessment yet');
    return {
      workerId,
      workerName: worker.displayName,
      ...this.toWorkerView(latest),
    };
  }

  /** Thresholds and their sources now live in the engine. */
  rules() {
    return this.engine.rules();
  }
}
