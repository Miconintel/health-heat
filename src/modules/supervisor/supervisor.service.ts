import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  In,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  AssessmentSource,
  EnginePpeClass,
  HelpRequestKind,
  HelpRequestStatus,
  InterventionStatus,
  ReadingSource,
  RecommendationAudience,
  RecommendationStatus,
  RiskLevel,
  WorkloadLevel,
} from '../../common/enums';
import { localDate, localDayStart } from '../../common/time';
import { OrganizationsService } from '../organizations/organizations.service';
import { Site } from '../organizations/entities/site.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { WorkEvent } from '../workload/entities/work-event.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { DeviceStatus } from '../me/entities/device-status.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { Recommendation } from '../recommendations/entities/recommendation.entity';
import { Intervention } from '../interventions/entities/intervention.entity';
import { RiskAssessment } from '../risk-engine/entities/risk-assessment.entity';
import { WearableDevice } from '../wearables/entities/wearable-device.entity';
import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from '../environment/environment.service';
import {
  RiskEngineService,
  mostCommon,
} from '../risk-engine/risk-engine.service';
import {
  displayLevel,
  SiteHeatService,
} from '../risk-engine/site-heat.service';
import { LEVEL_NAME } from '../risk-engine/engine-mapping';
import {
  actionsFollowed,
  actionsOnTime,
  hoursAtHighOrAbove,
  pausedMinutes,
  RecRow,
  warningStats,
} from '../measures/measures';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A phone silent for longer than this counts as "No recent data" (treated as High). */
export const QUIET_AFTER_MIN = 15;
export const LOW_BATTERY_PERCENT = 20;

const WORKLOAD_ORDER = [
  WorkloadLevel.LIGHT,
  WorkloadLevel.MODERATE,
  WorkloadLevel.HEAVY,
  WorkloadLevel.VERY_HEAVY,
];
const PPE_ORDER = [
  EnginePpeClass.STANDARD,
  EnginePpeClass.COVERALL,
  EnginePpeClass.CHEMICAL_RESISTANT,
  EnginePpeClass.IMPERMEABLE,
];

const SUPERVISOR_ALERT_CODES = [
  'supervisor.suspend_activity',
  'supervisor.worker_reduced_exposure',
  'supervisor.worker_earlier_breaks',
  'crew.rotate_and_cool',
];

export interface TodayFilter {
  crewId?: string;
  /** Shift name, e.g. "Night shift". Default: the shift running now. */
  shift?: string;
  /** Activity code, e.g. "excavation". */
  activity?: string;
}

/** Shift window for "today" at the site: the configured shift containing now, else the first. */
export function shiftWindows(site: Site, now: Date) {
  const dayStart = localDayStart(site.timezone, now);
  const toInstant = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(dayStart.getTime() + (h * 60 + m) * 60_000);
  };
  const shifts = site.shifts?.length
    ? site.shifts
    : [{ name: 'Day shift', start: '06:00', end: '18:00' }];
  const windows = shifts.map((s) => {
    const start = toInstant(s.start);
    let end = toInstant(s.end);
    if (end <= start) end = new Date(end.getTime() + DAY);
    return { name: s.name, start, end };
  });
  return windows;
}

/**
 * The shift to show: the named one (case-insensitive) if given, else the one
 * running now, else the first. Throws a 400 listing the options for an unknown name.
 */
export function shiftWindow(site: Site, now: Date, name?: string) {
  const windows = shiftWindows(site, now);
  if (name) {
    const found = windows.find(
      (w) => w.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!found) {
      throw new BadRequestException(
        `Unknown shift "${name}". Shifts at this site: ${windows.map((w) => w.name).join(', ')}`,
      );
    }
    return found;
  }
  return windows.find((w) => w.start <= now && now < w.end) ?? windows[0];
}

/**
 * Supervisor "Today" page. Raw data only (decision D7); never health data or
 * engine reasons (engine guide §6). Worker rows come from the supervisor-safe overview.
 */
@Injectable()
export class SupervisorService {
  constructor(
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
    @InjectRepository(WorkerPpe)
    private readonly workerPpe: Repository<WorkerPpe>,
    @InjectRepository(DeviceStatus)
    private readonly devices: Repository<DeviceStatus>,
    @InjectRepository(HelpRequest)
    private readonly help: Repository<HelpRequest>,
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
    @InjectRepository(Intervention)
    private readonly interventions: Repository<Intervention>,
    @InjectRepository(WorkEvent) private readonly events: Repository<WorkEvent>,
    @InjectRepository(RiskAssessment)
    private readonly assessments: Repository<RiskAssessment>,
    private readonly orgs: OrganizationsService,
    private readonly env: EnvironmentService,
    private readonly risk: RiskEngineService,
    private readonly siteHeat: SiteHeatService,
    @InjectRepository(WearableDevice)
    private readonly bandDevices: Repository<WearableDevice>,
    config: ConfigService,
  ) {
    this.wearablesEnabled = config.get<boolean>('WEARABLES_ENABLED') === true;
  }

  private readonly wearablesEnabled: boolean;

  // ---------------------------------------------------------------------------
  // Today page
  // ---------------------------------------------------------------------------

  async today(
    user: AuthUser,
    siteId: string,
    filter: TodayFilter,
    now = new Date(),
  ) {
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const shift = shiftWindow(site, now, filter.shift);
    const dayStart = localDayStart(site.timezone, now);
    // Current shift: who is on shift now. Another shift: everyone assigned to its window.
    const isCurrent = shift.start <= now && now < shift.end;
    const scope = await this.scope(
      user.organizationId,
      siteId,
      filter,
      now,
      isCurrent ? undefined : shift,
    );
    // Supervisor-safe worker rows (also writes the "who looked" audit entry).
    const overview = await this.risk.siteOverview(user, siteId, {
      crewId: filter.crewId,
    });
    const workerRows = overview.workers.filter((w) =>
      scope.workerIds.has(w.workerId),
    );

    const [hours, currentHour, hazards, devices] = await Promise.all([
      this.siteHeat.range(siteId, shift.start, shift.end),
      // "Now" comes from the current hour, even outside the shift strip.
      this.siteHeat.range(siteId, now, now),
      this.env.hazards(siteId, now),
      this.devices.findBy({ workerId: In([...scope.workerIds]) }),
    ]);
    const quiet = this.quietWorkers(devices, now);

    const distribution = {
      low: 0,
      elevated: 0,
      high: 0,
      critical: 0,
      noRecentData: 0,
    };
    for (const w of workerRows) {
      if (quiet.has(w.workerId)) distribution.noRecentData++;
      else
        distribution[
          LEVEL_NAME[w.level].toLowerCase() as
            'low' | 'elevated' | 'high' | 'critical'
        ]++;
    }

    const shown = hours.map((r) => displayLevel(r, now));
    const nowHour = currentHour[0] ? displayLevel(currentHour[0], now) : null;
    const ahead = shown.filter(
      (h) => h.hourStart >= new Date(Math.floor(now.getTime() / HOUR) * HOUR),
    );
    const peakLevel = Math.max(
      0,
      ...ahead.map((h) => Math.max(h.level ?? 0, h.possibleLevel ?? 0)),
    );
    const peakHours = ahead.filter(
      (h) => Math.max(h.level ?? 0, h.possibleLevel ?? 0) === peakLevel,
    );

    return {
      site: {
        id: site.id,
        name: site.name,
        timezone: site.timezone,
        emergencyNumber: site.emergencyNumber,
      },
      shift: {
        name: shift.name,
        start: shift.start,
        end: shift.end,
        current: isCurrent,
      },
      /** For the shift dropdown. */
      shifts: shiftWindows(site, now).map((w) => ({
        name: w.name,
        start: w.start,
        end: w.end,
      })),
      workersOnShift: scope.workerIds.size,
      updatedAt: overview.assessedAt,
      siteHeat: {
        /** Reference worker: moderate work, standard clothing. */
        reference: {
          workload: WorkloadLevel.MODERATE,
          ppe: EnginePpeClass.STANDARD,
        },
        now: {
          level: nowHour?.level ?? null,
          wbgtC: overview.environment.current?.wbgtSunC ?? null,
          wbgtMethod: overview.environment.current?.wbgtMethod ?? null,
        },
        peak: peakLevel
          ? {
              level: peakLevel,
              possible: peakHours.every(
                (h) => Number(h.level ?? 0) < peakLevel,
              ),
              from: peakHours[0].hourStart,
              to: new Date(
                peakHours[peakHours.length - 1].hourStart.getTime() + HOUR,
              ),
              confidence: peakHours[0].confidence,
            }
          : null,
        hours: shown,
      },
      distribution,
      hazards,
      systemHealth: await this.systemHealth(
        siteId,
        scope.workerIds,
        devices,
        now,
      ),
      needsAttention: await this.needsAttention(user, siteId, scope, filter),
      actionsToday: await this.actionsToday(
        user,
        siteId,
        scope,
        filter,
        dayStart,
      ),
      todaySoFar: await this.todaySoFar(
        user,
        siteId,
        scope,
        filter,
        dayStart,
        now,
      ),
      crews: await this.crewsSummary(user, siteId, filter, now, scope, quiet),
      last7Days: await this.history(user, siteId, 7, now),
      workers: workerRows.map((w) => ({
        ...w,
        appReporting: !quiet.has(w.workerId),
        /** Quiet phones count as High until the app reconnects. */
        treatedAsLevel: quiet.has(w.workerId)
          ? Math.max(w.level, RiskLevel.HIGH)
          : w.level,
      })),
    };
  }

  // ---------------------------------------------------------------------------
  // Sections (also exposed on their own)
  // ---------------------------------------------------------------------------

  /** Who is on shift now in scope (filters applied). */
  private async scope(
    organizationId: string,
    siteId: string,
    filter: TodayFilter,
    now: Date,
    window?: { start: Date; end: Date },
  ) {
    const active = await this.assignments.find({
      where: window
        ? {
            organizationId,
            siteId,
            startsAt: LessThan(window.end),
            endsAt: MoreThan(window.start),
          }
        : {
            organizationId,
            siteId,
            startsAt: LessThanOrEqual(now),
            endsAt: MoreThan(now),
            clockedOutAt: IsNull(),
          },
      order: { startsAt: 'DESC' },
    });
    const workers = new Map(
      (
        await this.workers.findBy({
          id: In(active.map((a) => a.workerId)),
          isActive: true,
        })
      ).map((w) => [w.id, w]),
    );
    const byWorker = new Map<string, WorkAssignment>();
    for (const a of active) {
      const w = workers.get(a.workerId);
      if (!w || byWorker.has(a.workerId)) continue;
      if (filter.crewId && w.crewId !== filter.crewId) continue;
      if (filter.activity && a.activityCategory.code !== filter.activity)
        continue;
      byWorker.set(a.workerId, a);
    }
    return {
      assignments: [...byWorker.values()],
      workerIds: new Set(byWorker.keys()),
      workers,
      crewIds: new Set(
        [...byWorker.keys()]
          .map((id) => workers.get(id)?.crewId)
          .filter((c): c is string => !!c),
      ),
    };
  }

  private quietWorkers(devices: DeviceStatus[], now: Date) {
    // Only phones that have reported before can "go quiet"; never-seen apps aren't counted.
    return new Set(
      devices
        .filter(
          (d) =>
            now.getTime() - d.lastSeenAt.getTime() > QUIET_AFTER_MIN * 60_000,
        )
        .map((d) => d.workerId),
    );
  }

  async systemHealth(
    siteId: string,
    workerIds: Set<string>,
    devices: DeviceStatus[],
    now: Date,
  ) {
    const [weather, sensor, lastRun] = await Promise.all([
      this.env.latestObservation(siteId, ReadingSource.WEATHER_API),
      this.env.latestObservation(siteId, ReadingSource.SENSOR),
      this.assessments.findOne({
        select: { assessedAt: true },
        where: { siteId },
        order: { assessedAt: 'DESC' },
      }),
    ]);
    const fallbacks = lastRun
      ? await this.assessments.countBy({
          siteId,
          assessedAt: lastRun.assessedAt,
          source: AssessmentSource.FALLBACK,
        })
      : 0;
    const age = (d?: Date) =>
      d ? (now.getTime() - d.getTime()) / 60_000 : Infinity;
    const reporting = devices.filter(
      (d) => age(d.lastSeenAt) <= QUIET_AFTER_MIN,
    );
    return {
      weatherFeed: {
        lastAt: weather?.observedAt ?? null,
        ok: age(weather?.observedAt) <= 60,
      },
      /** null = no sensor has ever reported at this site. */
      siteSensors: sensor
        ? { lastAt: sensor.observedAt, ok: age(sensor.observedAt) <= 30 }
        : null,
      workerApps: {
        onShift: workerIds.size,
        everReported: devices.length,
        reporting: reporting.length,
        quiet: devices.length - reporting.length,
        lowBattery: reporting.filter(
          (d) =>
            d.batteryPercent !== null &&
            d.batteryPercent <= LOW_BATTERY_PERCENT &&
            !d.charging,
        ).length,
      },
      /** Wearables are a later phase. */
      wearables: {
        available: this.wearablesEnabled,
        /** Bands that reported in the last 15 minutes. A count only, never readings. */
        connected: this.wearablesEnabled
          ? await this.bandDevices.countBy({
              workerId: In([...workerIds]),
              lastSeenAt: MoreThan(new Date(now.getTime() - 15 * 60_000)),
            })
          : 0,
      },
      riskEngine: {
        lastRunAt: lastRun?.assessedAt ?? null,
        ok: !!lastRun && fallbacks === 0,
        fallbackAssessments: fallbacks,
      },
    };
  }

  /** "Needs attention": help requests, critical workers, crew risk, worker care (action only, D1). */
  async needsAttention(
    user: AuthUser,
    siteId: string,
    scope: Awaited<ReturnType<SupervisorService['scope']>>,
    filter: TodayFilter,
  ) {
    const [help, recs, latest] = await Promise.all([
      this.help.find({
        select: {
          id: true,
          workerId: true,
          crewId: true,
          kind: true,
          status: true,
          createdAt: true,
          acknowledgedAt: true,
        },
        where: {
          organizationId: user.organizationId,
          siteId,
          status: In([HelpRequestStatus.OPEN, HelpRequestStatus.ACKNOWLEDGED]),
        },
        order: { createdAt: 'DESC' },
      }),
      this.recs.find({
        where: {
          organizationId: user.organizationId,
          siteId,
          audience: RecommendationAudience.SUPERVISOR,
          code: In(SUPERVISOR_ALERT_CODES),
          status: In([
            RecommendationStatus.OPEN,
            RecommendationStatus.ACKNOWLEDGED,
          ]),
        },
        order: { riskLevel: 'DESC', createdAt: 'ASC' },
      }),
      this.latestAssessments(siteId),
    ]);
    const filtered = !!(filter.crewId || filter.activity);
    // Help requests stay visible even if the worker has since left the shift (crew filter still applies).
    const helpRows = help.filter((h) =>
      filter.activity
        ? scope.workerIds.has(h.workerId)
        : !filter.crewId || h.crewId === filter.crewId,
    );
    const codes = new Map(
      (
        await this.workers.find({
          select: { id: true, employeeCode: true },
          where: {
            id: In([
              ...new Set([
                ...helpRows.map((h) => h.workerId),
                ...recs.map((r) => r.workerId).filter((w): w is string => !!w),
              ]),
            ]),
          },
        })
      ).map((w) => [w.id, w.employeeCode]),
    );
    const code = (workerId: string | null) =>
      workerId ? (codes.get(workerId) ?? null) : null;
    const inScope = (crewId: string | null, workerId: string | null) =>
      !filtered ||
      (workerId
        ? scope.workerIds.has(workerId)
        : !!crewId && scope.crewIds.has(crewId));

    const items: Record<string, unknown>[] = [];
    for (const h of helpRows) {
      items.push({
        kind: 'help',
        helpRequestId: h.id,
        helpKind: h.kind,
        workerId: h.workerId,
        workerCode: code(h.workerId),
        crewId: h.crewId,
        status: h.status,
        createdAt: h.createdAt,
        acknowledgedAt: h.acknowledgedAt,
      });
    }
    for (const r of recs.filter((r) => inScope(r.crewId, r.workerId))) {
      if (r.code === 'crew.rotate_and_cool') {
        const crewRows = latest.filter((a) => a.crewId === r.crewId);
        items.push({
          kind: 'crew_risk',
          recommendationId: r.id,
          crewId: r.crewId,
          level: r.riskLevel,
          highOrAbove: crewRows.filter((a) => a.level >= RiskLevel.HIGH).length,
          crewOnShift: crewRows.length,
          activity: mostCommon(
            scope.assignments
              .filter((a) => scope.workers.get(a.workerId)?.crewId === r.crewId)
              .map((a) => a.activityCategory.code),
          ),
          dueAt: r.dueAt,
          status: r.status,
          createdAt: r.createdAt,
        });
      } else {
        items.push({
          kind:
            r.code === 'supervisor.suspend_activity'
              ? 'critical'
              : 'worker_care',
          /** worker_care only: what the worker needs (never why). */
          need:
            r.code === 'supervisor.worker_reduced_exposure'
              ? 'reduced_exposure'
              : r.code === 'supervisor.worker_earlier_breaks'
                ? 'earlier_breaks'
                : null,
          recommendationId: r.id,
          workerId: r.workerId,
          workerCode: code(r.workerId),
          crewId: r.crewId,
          level: r.riskLevel,
          status: r.status,
          createdAt: r.createdAt,
        });
      }
    }
    const order = {
      help: 0,
      critical: 1,
      crew_risk: 2,
      worker_care: 3,
    } as Record<string, number>;
    items.sort((a, b) => order[a.kind as string] - order[b.kind as string]);
    return { open: items.length, items };
  }

  /** "Actions today", grouped by action and listing the crews it applies to. */
  async actionsToday(
    user: AuthUser,
    siteId: string,
    scope: Awaited<ReturnType<SupervisorService['scope']>>,
    filter: TodayFilter,
    dayStart: Date,
  ) {
    const filtered = !!(filter.crewId || filter.activity);
    const recs = await this.recs.find({
      where: {
        organizationId: user.organizationId,
        siteId,
        audience: RecommendationAudience.SUPERVISOR,
        createdAt: MoreThanOrEqual(dayStart),
      },
      order: { createdAt: 'ASC' },
    });
    const implemented = await this.implementedAt(recs.map((r) => r.id));
    const rows = recs.filter(
      (r) =>
        (r.status !== RecommendationStatus.SUPERSEDED ||
          implemented.has(r.id)) &&
        (!filtered ||
          (r.workerId
            ? scope.workerIds.has(r.workerId)
            : !!r.crewId && scope.crewIds.has(r.crewId))),
    );
    const groups = new Map<string, Recommendation[]>();
    for (const r of rows)
      groups.set(r.code, [...(groups.get(r.code) ?? []), r]);
    const actions = [...groups.entries()].map(([code, list]) => {
      const done = list.every(
        (r) => r.status === RecommendationStatus.IMPLEMENTED,
      );
      const acked = list.every((r) =>
        [
          RecommendationStatus.IMPLEMENTED,
          RecommendationStatus.ACKNOWLEDGED,
        ].includes(r.status),
      );
      const dues = list.map((r) => r.dueAt).filter((d): d is Date => !!d);
      return {
        code,
        status: done ? 'done' : acked ? 'acknowledged' : 'pending',
        crewIds: [
          ...new Set(list.map((r) => r.crewId).filter((c): c is string => !!c)),
        ],
        workerCount: new Set(list.map((r) => r.workerId).filter(Boolean)).size,
        timing: list[0].timing,
        firstAt: list[0].createdAt,
        dueAt: dues.length
          ? new Date(Math.min(...dues.map((d) => d.getTime())))
          : null,
        recommendationIds: list.map((r) => r.id),
      };
    });
    return {
      done: actions.filter((a) => a.status === 'done').length,
      total: actions.length,
      actions,
    };
  }

  /** "Today so far". Forecast-accuracy figures are provisional (D6). */
  async todaySoFar(
    user: AuthUser,
    siteId: string,
    scope: Awaited<ReturnType<SupervisorService['scope']>>,
    filter: TodayFilter,
    dayStart: Date,
    now: Date,
  ) {
    const filtered = !!(filter.crewId || filter.activity);
    const [hours, recs, help, events] = await Promise.all([
      this.siteHeat.range(siteId, dayStart, now),
      this.recRows(user.organizationId, siteId, dayStart, now),
      this.help.find({
        select: { kind: true },
        where: {
          organizationId: user.organizationId,
          siteId,
          createdAt: Between(dayStart, now),
        },
      }),
      this.events.find({ where: { siteId, at: Between(dayStart, now) } }),
    ]);
    const w = warningStats(hours, now);
    return {
      warningLeadMinutes: w.medianLeadMinutes,
      warnings: {
        periods: w.warningPeriods,
        notBorneOut: w.falseAlarms,
        provisional: true,
      },
      actionsFollowed: actionsFollowed(recs),
      symptomReports: help.filter(
        (h) => h.kind === HelpRequestKind.SYMPTOM_REPORT,
      ).length,
      emergencyEscalations: help.filter(
        (h) => h.kind === HelpRequestKind.FIRST_AID_ALERT,
      ).length,
      workTimePausedMinutes: pausedMinutes(
        filtered
          ? events.filter((e) => scope.workerIds.has(e.workerId))
          : events,
        now,
      ),
    };
  }

  /** Crews table: activity, workload, PPE, workers, now, peak, next action. */
  async crewsSummary(
    user: AuthUser,
    siteId: string,
    filter: TodayFilter,
    now: Date,
    scopeIn?: Awaited<ReturnType<SupervisorService['scope']>>,
    quietIn?: Set<string>,
  ) {
    await this.orgs.getSite(user.organizationId, siteId);
    let scope = scopeIn;
    if (!scope) {
      const site = await this.orgs.getSite(user.organizationId, siteId);
      const shift = shiftWindow(site, now, filter.shift);
      const isCurrent = shift.start <= now && now < shift.end;
      scope = await this.scope(
        user.organizationId,
        siteId,
        filter,
        now,
        isCurrent ? undefined : shift,
      );
    }
    const [crews, latest, ppe, recs] = await Promise.all([
      this.crews.findBy({
        siteId,
        ...(filter.crewId ? { id: filter.crewId } : {}),
      }),
      this.latestAssessments(siteId),
      this.workerPpe.find({ where: { workerId: In([...scope.workerIds]) } }),
      this.recs.find({
        where: {
          organizationId: user.organizationId,
          siteId,
          audience: RecommendationAudience.SUPERVISOR,
          status: In([
            RecommendationStatus.OPEN,
            RecommendationStatus.ACKNOWLEDGED,
          ]),
        },
        order: { riskLevel: 'DESC', createdAt: 'ASC' },
      }),
    ]);
    const quiet = quietIn ?? new Set<string>();

    return crews
      .map((crew) => {
        const assigns = scope.assignments.filter(
          (a) => scope.workers.get(a.workerId)?.crewId === crew.id,
        );
        if (!assigns.length) return null;
        const ids = new Set(assigns.map((a) => a.workerId));
        const rows = latest.filter((a) => ids.has(a.workerId));
        const workloads = assigns.map(
          (a) => a.workloadOverride ?? a.activityCategory.defaultWorkload,
        );
        const items = ppe
          .filter((p) => ids.has(p.workerId))
          .map((p) => p.ppeItem);
        const ppeClass = items.reduce(
          (best, i) =>
            i.engineClass &&
            PPE_ORDER.indexOf(i.engineClass) > PPE_ORDER.indexOf(best)
              ? i.engineClass
              : best,
          EnginePpeClass.STANDARD,
        );
        const peak = rows.reduce<{
          level: number;
          at: Date | null;
          possible: number | null;
        }>(
          (p, a) => {
            const level = Number(a.forecastPeakLevel ?? a.level);
            const at = a.forecastPeakAt;
            const better =
              level > p.level ||
              (level === p.level && at && (!p.at || at < p.at));
            return {
              level: better ? level : p.level,
              at: better ? at : p.at,
              possible:
                Math.max(p.possible ?? 0, a.forecastPossiblePeakLevel ?? 0) ||
                null,
            };
          },
          { level: 0, at: null, possible: null },
        );
        const next = recs.find(
          (r) =>
            r.crewId === crew.id ||
            (r.workerId !== null && ids.has(r.workerId)),
        );
        return {
          crewId: crew.id,
          name: crew.name,
          activity: mostCommon(assigns.map((a) => a.activityCategory.code)),
          activityName: mostCommon(assigns.map((a) => a.activityCategory.name)),
          workload:
            WORKLOAD_ORDER[
              Math.max(...workloads.map((w) => WORKLOAD_ORDER.indexOf(w)))
            ],
          ppe: {
            engineClass: ppeClass,
            items: [...new Set(items.map((i) => i.code))],
          },
          workers: ids.size,
          now: rows.length
            ? Math.max(
                ...rows.map((a) =>
                  quiet.has(a.workerId)
                    ? Math.max(a.level, RiskLevel.HIGH)
                    : a.level,
                ),
              )
            : null,
          peak: peak.level
            ? {
                level: peak.level,
                at: peak.at,
                possibleLevel:
                  peak.possible && peak.possible > peak.level
                    ? peak.possible
                    : null,
              }
            : null,
          nextAction: next
            ? { code: next.code, recommendationId: next.id, dueAt: next.dueAt }
            : null,
        };
      })
      .filter((c): c is NonNullable<typeof c> => !!c);
  }

  /** "Last 7 days": hours at High or above (site level) and actions done on time, per local day. */
  async history(
    user: AuthUser,
    siteId: string,
    days: number,
    now = new Date(),
  ) {
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const todayStart = localDayStart(site.timezone, now);
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const from = new Date(todayStart.getTime() - i * DAY);
      const to = new Date(from.getTime() + DAY);
      const [hours, recs] = await Promise.all([
        this.siteHeat.range(siteId, from, new Date(to.getTime() - 1)),
        this.recRows(user.organizationId, siteId, from, to),
      ]);
      out.push({
        /** Site-local calendar date. */
        date: localDate(site.timezone, new Date(from.getTime() + HOUR)),
        dayStart: from,
        hoursAtHighOrAbove: hoursAtHighOrAbove(hours),
        actions: actionsOnTime(recs),
      });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------------

  /** Latest run's assessments for the site (columns safe for supervisors only). */
  private async latestAssessments(siteId: string) {
    const last = await this.assessments.findOne({
      select: { assessedAt: true },
      where: { siteId },
      order: { assessedAt: 'DESC' },
    });
    if (!last) return [];
    return this.assessments.find({
      select: {
        id: true,
        workerId: true,
        crewId: true,
        level: true,
        forecastPeakLevel: true,
        forecastPeakAt: true,
        forecastPossiblePeakLevel: true,
      },
      where: { siteId, assessedAt: last.assessedAt },
    });
  }

  /** First time each recommendation was marked done (implemented or reassigned). */
  private async implementedAt(recIds: string[]) {
    if (!recIds.length) return new Map<string, Date>();
    const rows = await this.interventions.find({
      select: { recommendationId: true, createdAt: true },
      where: {
        recommendationId: In(recIds),
        status: In([
          InterventionStatus.IMPLEMENTED,
          InterventionStatus.REASSIGNED,
        ]),
      },
      order: { createdAt: 'ASC' },
    });
    const map = new Map<string, Date>();
    for (const r of rows)
      if (!map.has(r.recommendationId))
        map.set(r.recommendationId, r.createdAt);
    return map;
  }

  /** Supervisor recommendations created in a window, with when they were done. */
  async recRows(
    organizationId: string,
    siteId: string,
    from: Date,
    to: Date,
  ): Promise<RecRow[]> {
    const recs = await this.recs.find({
      select: {
        id: true,
        status: true,
        crewId: true,
        createdAt: true,
        dueAt: true,
      },
      where: {
        organizationId,
        siteId,
        audience: RecommendationAudience.SUPERVISOR,
        createdAt: Between(from, to),
      },
    });
    const done = await this.implementedAt(recs.map((r) => r.id));
    return recs.map((r) => ({
      status: r.status,
      crewId: r.crewId,
      createdAt: r.createdAt,
      dueAt: r.dueAt,
      implementedAt: done.get(r.id) ?? null,
    }));
  }

  async scopeFor(
    organizationId: string,
    siteId: string,
    filter: TodayFilter,
    now = new Date(),
  ) {
    return this.scope(organizationId, siteId, filter, now);
  }
}
