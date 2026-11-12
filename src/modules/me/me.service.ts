import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  IsNull,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { ConsentPurpose, Role } from '../../common/enums';
import { Worker } from '../workers/entities/worker.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { Site } from '../organizations/entities/site.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import { User } from '../users/entities/user.entity';
import { HealthProfilesService } from '../health-profiles/health-profiles.service';
import { RiskEngineService } from '../risk-engine/risk-engine.service';
import {
  ConsentChoicesDto,
  LogWaterDto,
  UpdatePreferencesDto,
  HeartbeatDto,
} from './dto/me.dto';
import { localDate, localDayStart } from '../../common/time';
import { WaterLog } from './entities/water-log.entity';
import { DeviceStatus } from './entities/device-status.entity';
import { AuditService } from '../audit/audit.service';
import { acclimatizationStatus } from '../workers/acclimatization';

const DAY_MS = 24 * 3_600_000;

/**
 * Everything the app needs about the signed-in person in one call.
 * Raw data only (decision D7): the frontend formats text.
 */
@Injectable()
export class MeService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    @InjectRepository(HealthProfile)
    private readonly profiles: Repository<HealthProfile>,
    @InjectRepository(WaterLog) private readonly water: Repository<WaterLog>,
    @InjectRepository(DeviceStatus)
    private readonly devices: Repository<DeviceStatus>,
    private readonly health: HealthProfilesService,
    private readonly audit: AuditService,
    private readonly risk: RiskEngineService,
  ) {}

  async get(user: AuthUser) {
    const account = await this.users.findOneByOrFail({ id: user.userId });
    const base = {
      user: { id: account.id, loginId: account.loginId, role: account.role },
    };
    if (user.role !== Role.WORKER || !user.workerId) {
      return {
        ...base,
        worker: null,
        assignment: null,
        site: null,
        consents: null,
        precaution: null,
      };
    }

    const worker = await this.workers.findOneByOrFail({
      id: user.workerId,
      organizationId: user.organizationId,
    });
    const [crew, assignment, consents, profile] = await Promise.all([
      worker.crewId ? this.crews.findOneBy({ id: worker.crewId }) : null,
      this.currentOrNextAssignment(worker.id),
      this.health.consentState(worker.id),
      // Own precaution summary only; clinical columns are not loaded.
      this.profiles.findOne({
        select: {
          precautionLevel: true,
          approvedAt: true,
          reviewRequested: true,
          restrictions: true,
          nextReviewOn: true,
        },
        where: { workerId: worker.id },
      }),
    ]);
    const site = assignment
      ? await this.sites.findOneBy({ id: assignment.siteId })
      : crew
        ? await this.sites.findOneBy({ id: crew.siteId })
        : null;

    return {
      ...base,
      worker: {
        id: worker.id,
        employeeCode: worker.employeeCode,
        displayName: worker.displayName,
        crew: crew && { id: crew.id, name: crew.name },
        language: worker.preferredLanguage,
        readAloud: worker.readAloud,
        acclimatization: acclimatizationStatus(
          worker.acclimatizationStartedOn,
          localDate(site?.timezone ?? 'UTC'),
        ),
      },
      site: site && {
        id: site.id,
        name: site.name,
        timezone: site.timezone,
        emergencyNumber: site.emergencyNumber,
        shifts: site.shifts,
      },
      assignment: assignment && {
        id: assignment.id,
        siteId: assignment.siteId,
        activity: {
          code: assignment.activityCategory.code,
          name: assignment.activityCategory.name,
        },
        workload:
          assignment.workloadOverride ??
          assignment.activityCategory.defaultWorkload,
        workEnvironment: assignment.workEnvironment,
        startsAt: assignment.startsAt,
        endsAt: assignment.endsAt,
        plannedBreaks: assignment.plannedBreaks,
        breakMinutes: assignment.breakMinutes,
        clockedInAt: assignment.clockedInAt,
        clockedOutAt: assignment.clockedOutAt,
        onBreakSince: assignment.onBreakSince,
        lastBreakEndedAt: assignment.lastBreakEndedAt,
      },
      consents: {
        healthPrecautions: consents[ConsentPurpose.HEALTH_DATA_PROCESSING],
        wearableBand: consents[ConsentPurpose.WEARABLE_BAND],
        symptomReports: consents[ConsentPurpose.SYMPTOM_REPORTS],
      },
      precaution: profile && {
        level: profile.precautionLevel,
        setOn: profile.approvedAt,
        reviewRequested: profile.reviewRequested,
        restrictions: profile.restrictions ?? [],
        nextReviewOn: profile.nextReviewOn,
      },
    };
  }

  /** Active assignment now, else the next one starting within 24 hours. */
  private async currentOrNextAssignment(workerId: string, now = new Date()) {
    const active = await this.assignments.findOne({
      where: {
        workerId,
        startsAt: LessThanOrEqual(now),
        endsAt: MoreThan(now),
        clockedOutAt: IsNull(),
      },
      order: { startsAt: 'DESC' },
    });
    if (active) return active;
    const next = await this.assignments.findOne({
      where: { workerId, startsAt: MoreThan(now), clockedOutAt: IsNull() },
      order: { startsAt: 'ASC' },
    });
    return next && next.startsAt.getTime() - now.getTime() <= DAY_MS
      ? next
      : null;
  }

  async updatePreferences(user: AuthUser, dto: UpdatePreferencesDto) {
    const workerId = this.requireWorker(user);
    const patch: Partial<Worker> = {};
    if (dto.language !== undefined) patch.preferredLanguage = dto.language;
    if (dto.readAloud !== undefined) patch.readAloud = dto.readAloud;
    if (Object.keys(patch).length) {
      await this.workers.update(
        { id: workerId, organizationId: user.organizationId },
        patch,
      );
    }
    // The engine writes the worker's advice in their language: refresh it.
    if (dto.language !== undefined) {
      this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    }
    return this.get(user);
  }

  async updateConsents(user: AuthUser, dto: ConsentChoicesDto) {
    const workerId = this.requireWorker(user);
    const state = await this.health.recordConsentChoices(
      user,
      workerId,
      {
        [ConsentPurpose.HEALTH_DATA_PROCESSING]: dto.healthPrecautions,
        [ConsentPurpose.WEARABLE_BAND]: dto.wearableBand,
        [ConsentPurpose.SYMPTOM_REPORTS]: dto.symptomReports,
      },
      dto.policyVersion,
    );
    return {
      healthPrecautions: state[ConsentPurpose.HEALTH_DATA_PROCESSING],
      wearableBand: state[ConsentPurpose.WEARABLE_BAND],
      symptomReports: state[ConsentPurpose.SYMPTOM_REPORTS],
    };
  }

  async accessLog(user: AuthUser, days: number) {
    const workerId = this.requireWorker(user);
    return this.audit.accessLogFor(
      user.organizationId,
      workerId,
      user.userId,
      days,
    );
  }

  /** App heartbeat (every few minutes while open). */
  async heartbeat(user: AuthUser, dto: HeartbeatDto) {
    const workerId = this.requireWorker(user);
    await this.devices.upsert(
      {
        workerId,
        lastSeenAt: new Date(),
        batteryPercent: dto.batteryPercent ?? null,
        charging: dto.charging ?? null,
      },
      ['workerId'],
    );
    return { ok: true };
  }

  // ---- water tracker ----------------------------------------------------------

  /** Timezone of the worker's current site (water counts reset at local midnight). */
  private async workerTimezone(workerId: string): Promise<string> {
    const assignment = await this.currentOrNextAssignment(workerId);
    if (assignment) {
      const site = await this.sites.findOneBy({ id: assignment.siteId });
      if (site) return site.timezone;
    }
    const worker = await this.workers.findOneBy({ id: workerId });
    const crew = worker?.crewId
      ? await this.crews.findOneBy({ id: worker.crewId })
      : null;
    const site = crew ? await this.sites.findOneBy({ id: crew.siteId }) : null;
    return site?.timezone ?? 'UTC';
  }

  async waterToday(user: AuthUser) {
    const workerId = this.requireWorker(user);
    const since = localDayStart(await this.workerTimezone(workerId));
    const rows = await this.water.find({
      where: { workerId, loggedAt: MoreThanOrEqual(since) },
      order: { loggedAt: 'DESC' },
    });
    return {
      cupsToday: rows.reduce((n, r) => n + r.cups, 0),
      lastCupAt: rows[0]?.loggedAt ?? null,
    };
  }

  async logWater(user: AuthUser, dto: LogWaterDto) {
    const workerId = this.requireWorker(user);
    await this.water.save(this.water.create({ workerId, cups: dto.cups ?? 1 }));
    return this.waterToday(user);
  }

  private requireWorker(user: AuthUser): string {
    if (user.role !== Role.WORKER || !user.workerId)
      throw new ForbiddenException();
    return user.workerId;
  }
}
