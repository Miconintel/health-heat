import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { HelpRequestKind } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import {
  WorkEvent,
  WorkEventType,
} from '../workload/entities/work-event.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { SiteHeatService } from '../risk-engine/site-heat.service';
import { SupervisorService } from '../supervisor/supervisor.service';
import {
  actionsFollowed,
  leadTimeHistogram,
  pausedMinutes,
  warningStats,
} from './measures';

export type MeasuresPeriod = '7d' | '30d' | 'season';
const DAYS: Record<MeasuresPeriod, number> = {
  '7d': 7,
  '30d': 30,
  season: 120,
};
/** Crews smaller than this are grouped, so no small crew can be singled out. */
export const MIN_CREW_SIZE = 5;

@Injectable()
export class MeasuresService {
  constructor(
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    @InjectRepository(WorkEvent) private readonly events: Repository<WorkEvent>,
    @InjectRepository(HelpRequest)
    private readonly help: Repository<HelpRequest>,
    private readonly orgs: OrganizationsService,
    private readonly siteHeat: SiteHeatService,
    private readonly supervisor: SupervisorService,
  ) {}

  /** Measures page: crew-level only, never individual rankings. */
  async forSite(
    user: AuthUser,
    siteId: string,
    period: MeasuresPeriod,
    now = new Date(),
  ) {
    await this.orgs.getSite(user.organizationId, siteId);
    const from = new Date(now.getTime() - DAYS[period] * 86_400_000);

    const [hours, recs, help, events, shifts, crewSizes] = await Promise.all([
      this.siteHeat.range(siteId, from, now),
      this.supervisor.recRows(user.organizationId, siteId, from, now),
      this.help.find({
        select: { kind: true, createdAt: true, acknowledgedAt: true },
        where: {
          organizationId: user.organizationId,
          siteId,
          createdAt: Between(from, now),
        },
      }),
      this.events.find({ where: { siteId, at: Between(from, now) } }),
      this.assignments.find({
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          plannedBreaks: true,
          workerId: true,
        },
        where: { siteId, startsAt: LessThan(now), endsAt: MoreThan(from) },
      }),
      this.crewSizes(user.organizationId),
    ]);

    const warnings = warningStats(hours, now);

    // Actions followed, by crew; crews under MIN_CREW_SIZE are grouped.
    const byCrew = new Map<string, typeof recs>();
    for (const r of recs) {
      const key =
        r.crewId && (crewSizes.get(r.crewId) ?? 0) >= MIN_CREW_SIZE
          ? r.crewId
          : 'other';
      byCrew.set(key, [...(byCrew.get(key) ?? []), r]);
    }

    const symptomReports = help.filter(
      (h) => h.kind === HelpRequestKind.SYMPTOM_REPORT,
    ).length;
    const alerts = help.filter(
      (h) => h.kind === HelpRequestKind.FIRST_AID_ALERT,
    );
    const within10 = alerts.filter(
      (a) =>
        a.acknowledgedAt &&
        a.acknowledgedAt.getTime() - a.createdAt.getTime() <= 10 * 60_000,
    ).length;

    const scheduledMinutes = shifts.reduce((n, s) => {
      const start = Math.max(s.startsAt.getTime(), from.getTime());
      const end = Math.min(s.endsAt.getTime(), now.getTime());
      return n + Math.max(0, (end - start) / 60_000);
    }, 0);

    // Provisional compliance: a finished shift meets the heat plan if it took at least its planned breaks.
    const finished = shifts.filter(
      (s) => s.endsAt <= now && s.plannedBreaks.length > 0,
    );
    const breaksTaken = new Map<string, number>();
    for (const e of events)
      if (e.type === WorkEventType.BREAK_START)
        breaksTaken.set(
          e.assignmentId,
          (breaksTaken.get(e.assignmentId) ?? 0) + 1,
        );
    const compliant = finished.filter(
      (s) => (breaksTaken.get(s.id) ?? 0) >= s.plannedBreaks.length,
    ).length;

    return {
      period,
      from,
      to: now,
      warningLeadTime: {
        medianMinutes: warnings.medianLeadMinutes,
        provisional: true,
      },
      falseAlarms: {
        count: warnings.falseAlarms,
        of: warnings.warningPeriods,
        percent: warnings.warningPeriods
          ? Math.round((warnings.falseAlarms / warnings.warningPeriods) * 100)
          : null,
        provisional: true,
      },
      missedWarnings: {
        count: warnings.missed,
        ofHighPeriods: warnings.highPeriods,
        provisional: true,
      },
      leadTimeHistogram: leadTimeHistogram(warnings.leadTimesMinutes),
      actionsFollowed: {
        ...actionsFollowed(recs),
        byCrew: [...byCrew.entries()].map(([crewId, list]) => ({
          crewId: crewId === 'other' ? null : crewId,
          grouped: crewId === 'other',
          ...actionsFollowed(list),
        })),
      },
      symptomsAndIncidents: {
        symptomReports,
        /** No incident log yet. */
        heatIncidents: null,
      },
      emergencyEscalations: {
        count: alerts.length,
        acknowledgedWithin10Min: within10,
      },
      lostWorkTime: {
        pausedMinutes: pausedMinutes(events, now),
        scheduledMinutes: Math.round(scheduledMinutes),
      },
      compliance: {
        shiftsMeetingPlan: compliant,
        shifts: finished.length,
        percent: finished.length
          ? Math.round((compliant / finished.length) * 100)
          : null,
        provisional: true,
      },
    };
  }

  private async crewSizes(organizationId: string) {
    const rows = await this.workers
      .createQueryBuilder('w')
      .select('w.crewId', 'crewId')
      .addSelect('COUNT(*)', 'n')
      .where(
        'w.organizationId = :o AND w.isActive = true AND w.crewId IS NOT NULL',
        { o: organizationId },
      )
      .groupBy('w.crewId')
      .getRawMany<{ crewId: string; n: string }>();
    return new Map(rows.map((r) => [r.crewId, Number(r.n)]));
  }
}
