import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { PrecautionLevel, WorkloadLevel } from '../../common/enums';
import { hourInstants, localDate } from '../../common/time';
import { OrganizationsService } from '../organizations/organizations.service';
import { Site } from '../organizations/entities/site.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import {
  RiskEngineService,
  mostCommon,
} from '../risk-engine/risk-engine.service';
import {
  displayLevel,
  SiteHeatService,
} from '../risk-engine/site-heat.service';
import { ShiftPlan } from './entities/shift-plan.entity';
import {
  evaluatePlan,
  suggestPlan,
  Task,
  TASKS,
  taskForWorkload,
} from './plan-rules';
import { SavePlanDto, SendPlanDto } from './dto/plan.dto';

const HOUR = 3_600_000;

const WORKLOAD_ORDER = [
  WorkloadLevel.LIGHT,
  WorkloadLevel.MODERATE,
  WorkloadLevel.HEAVY,
  WorkloadLevel.VERY_HEAVY,
];

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(ShiftPlan) private readonly plans: Repository<ShiftPlan>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    @InjectRepository(WorkerPpe)
    private readonly workerPpe: Repository<WorkerPpe>,
    @InjectRepository(HealthProfile)
    private readonly profiles: Repository<HealthProfile>,
    private readonly orgs: OrganizationsService,
    private readonly siteHeat: SiteHeatService,
    private readonly risk: RiskEngineService,
  ) {}

  /** Hour labels for the site's first shift (default 07:00 to 17:00). */
  private hoursFor(site: Site): string[] {
    const shift = site.shifts?.[0] ?? { start: '07:00', end: '17:00' };
    const [sh] = shift.start.split(':').map(Number);
    const [endH, em] = shift.end.split(':').map(Number);
    let eh = endH;
    if (em > 0) eh += 1;
    if (eh <= sh) eh += 24;
    return Array.from(
      { length: eh - sh },
      (_, i) => `${String((sh + i) % 24).padStart(2, '0')}:00`,
    );
  }

  /**
   * Assignments overlapping the plan's hours, one per worker: the one covering
   * most of the plan window (so a day plan never edits a night shift).
   */
  private async dayAssignments(site: Site, date: string, hours: string[]) {
    const starts = hourInstants(site.timezone, date, hours);
    const from = starts[0];
    const to = new Date(starts[starts.length - 1].getTime() + HOUR);
    const rows = await this.assignments.find({
      where: {
        siteId: site.id,
        startsAt: LessThan(to),
        endsAt: MoreThan(from),
      },
      order: { startsAt: 'DESC' },
    });
    const overlap = (a: WorkAssignment) =>
      Math.min(a.endsAt.getTime(), to.getTime()) -
      Math.max(a.startsAt.getTime(), from.getTime());
    const byWorker = new Map<string, WorkAssignment>();
    for (const a of rows) {
      const cur = byWorker.get(a.workerId);
      if (!cur || overlap(a) > overlap(cur)) byWorker.set(a.workerId, a);
    }
    const workers = new Map(
      (
        await this.workers.findBy({
          id: In([...byWorker.keys()]),
          isActive: true,
        })
      ).map((w) => [w.id, w]),
    );
    return [...byWorker.values()]
      .filter((a) => workers.has(a.workerId))
      .map((a) => ({ assignment: a, worker: workers.get(a.workerId)! }));
  }

  /** Default plan from today's assignments: each crew's usual task, breaks where planned. */
  private derive(
    site: Site,
    date: string,
    hours: string[],
    day: Awaited<ReturnType<PlansService['dayAssignments']>>,
    crewIds: string[],
  ) {
    const crews: Record<string, Task[]> = {};
    for (const crewId of crewIds) {
      const members = day.filter((d) => d.worker.crewId === crewId);
      if (!members.length) continue;
      const workload =
        WORKLOAD_ORDER[
          Math.max(
            ...members.map((m) =>
              WORKLOAD_ORDER.indexOf(
                m.assignment.workloadOverride ??
                  m.assignment.activityCategory.defaultWorkload,
              ),
            ),
          )
        ];
      const breaks = members[0].assignment.plannedBreaks.map((b) =>
        new Date(b).getTime(),
      );
      const starts = hourInstants(site.timezone, date, hours);
      crews[crewId] = starts.map((d) => {
        const start = d.getTime();
        return breaks.some((b) => b >= start && b < start + HOUR)
          ? 'B'
          : taskForWorkload(workload);
      });
    }
    return crews;
  }

  private validate(
    crews: Record<string, Task[]>,
    hours: string[],
    allowed: Set<string>,
  ) {
    for (const [crewId, tasks] of Object.entries(crews)) {
      if (!allowed.has(crewId))
        throw new BadRequestException(`Unknown crew ${crewId} for this site`);
      if (!Array.isArray(tasks) || tasks.length !== hours.length)
        throw new BadRequestException(
          `Crew ${crewId}: need exactly ${hours.length} hourly tasks`,
        );
      if (tasks.some((t) => !TASKS.includes(t)))
        throw new BadRequestException(
          `Crew ${crewId}: tasks must be H, M, L or B`,
        );
    }
  }

  async get(user: AuthUser, siteId: string, dateIn?: string, now = new Date()) {
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const date = dateIn ?? localDate(site.timezone, now);
    const saved = await this.plans.findOneBy({ siteId, date });
    const planHours = saved?.hours ?? this.hoursFor(site);
    const [crewRows, day] = await Promise.all([
      this.crews.find({ where: { siteId }, order: { name: 'ASC' } }),
      this.dayAssignments(site, date, planHours),
    ]);
    const crewIds = crewRows.map((c) => c.id);
    const current =
      saved?.crews ?? this.derive(site, date, planHours, day, crewIds);

    const starts = hourInstants(site.timezone, date, planHours);
    const levelRows = await this.siteHeat.range(
      siteId,
      starts[0],
      starts[starts.length - 1],
    );
    const byHour = new Map(
      levelRows.map((r) => [r.hourStart.getTime(), displayLevel(r, now)]),
    );
    const hourInfo = starts.map((s, i) => {
      const d = byHour.get(s.getTime());
      return {
        label: planHours[i],
        start: s,
        level: d?.level ?? null,
        possibleLevel: d?.possibleLevel ?? null,
      };
    });
    // The too-hot rule counts a "possible" level, as the frontend does.
    const levels = hourInfo.map(
      (h) => Math.max(h.level ?? 0, h.possibleLevel ?? 0) || null,
    );
    const suggested = suggestPlan(current, levels);

    const ppe = await this.workerPpe.find({
      where: { workerId: In(day.map((d) => d.worker.id)) },
    });
    const crews = crewRows
      .filter((c) => current[c.id])
      .map((c) => {
        const members = day.filter((d) => d.worker.crewId === c.id);
        const ids = new Set(members.map((m) => m.worker.id));
        return {
          crewId: c.id,
          name: c.name,
          activity: mostCommon(
            members.map((m) => m.assignment.activityCategory.code),
          ),
          workers: members.length,
          ppe: [
            ...new Set(
              ppe.filter((p) => ids.has(p.workerId)).map((p) => p.ppeItem.code),
            ),
          ],
        };
      });

    // Decision D1: a count only, never who or why.
    const reducedExposure = await this.profiles.count({
      where: {
        workerId: In(day.map((d) => d.worker.id)),
        precautionLevel: PrecautionLevel.HIGH_PRIORITY,
      },
    });

    return {
      date,
      status: saved?.status ?? 'draft',
      source: saved ? 'saved' : 'derived',
      sentAt: saved?.sentAt ?? null,
      hours: hourInfo,
      crews,
      current: { tasks: current, ...evaluatePlan(current, levels) },
      suggested: { tasks: suggested, ...evaluatePlan(suggested, levels) },
      workersNeedingReducedExposure: reducedExposure,
      /** "H at level 3 or above, or M at level 4", counting "possible" levels. */
      rule: { heavyFrom: 3, moderateFrom: 4 },
    };
  }

  async save(
    user: AuthUser,
    siteId: string,
    dto: SavePlanDto,
    now = new Date(),
  ) {
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const date = dto.date ?? localDate(site.timezone, now);
    const existing = await this.plans.findOneBy({ siteId, date });
    const hours = existing?.hours ?? this.hoursFor(site);
    const crewIds = new Set(
      (await this.crews.findBy({ siteId })).map((c) => c.id),
    );
    this.validate(dto.crews, hours, crewIds);
    const plan =
      existing ??
      this.plans.create({
        organizationId: user.organizationId,
        siteId,
        date,
        hours,
      });
    // First save of the day starts from the full derived plan, so other crews keep theirs.
    const base =
      existing?.crews ??
      (await this.get(user, siteId, date, now)).current.tasks;
    plan.crews = { ...base, ...dto.crews };
    plan.status = 'draft';
    plan.updatedByUserId = user.userId;
    await this.plans.save(plan);
    return this.get(user, siteId, date, now);
  }

  /**
   * "Send to crews": saves the chosen plan as sent, moves today's planned breaks to the
   * plan's B hours, and reassesses so forecasts use the planned hour-by-hour work.
   * (Push notifications to crews are a later phase.)
   */
  async send(
    user: AuthUser,
    siteId: string,
    dto: SendPlanDto,
    now = new Date(),
  ) {
    const view = await this.get(user, siteId, dto.date, now);
    const tasks =
      dto.use === 'suggested' ? view.suggested.tasks : view.current.tasks;
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const plan =
      (await this.plans.findOneBy({ siteId, date: view.date })) ??
      this.plans.create({
        organizationId: user.organizationId,
        siteId,
        date: view.date,
        hours: view.hours.map((h) => h.label),
      });
    plan.crews = tasks;
    plan.status = 'sent';
    plan.sentAt = new Date();
    plan.updatedByUserId = user.userId;
    await this.plans.save(plan);

    const starts = hourInstants(site.timezone, view.date, plan.hours);
    for (const { assignment, worker } of await this.dayAssignments(
      site,
      view.date,
      plan.hours,
    )) {
      const crewTasks = worker.crewId ? tasks[worker.crewId] : undefined;
      if (!crewTasks || assignment.clockedOutAt) continue;
      assignment.plannedBreaks = starts.filter((_, i) => crewTasks[i] === 'B');
      await this.assignments.save(assignment);
    }
    await this.risk.runForSite(user.organizationId, siteId);
    return this.get(user, siteId, view.date, now);
  }
}
