import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  AuditAction,
  ConsentPurpose,
  HelpRequestKind,
  HelpRequestStatus,
  Role,
} from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { HealthProfilesService } from '../health-profiles/health-profiles.service';
import { Worker } from '../workers/entities/worker.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { OrganizationsService } from '../organizations/organizations.service';
import { HelpRequest } from './entities/help-request.entity';
import { SymptomReportDto } from './dto/help-request.dto';

const OPEN_STATES = [HelpRequestStatus.OPEN, HelpRequestStatus.ACKNOWLEDGED];

@Injectable()
export class HelpRequestsService {
  constructor(
    @InjectRepository(HelpRequest)
    private readonly requests: Repository<HelpRequest>,
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    private readonly health: HealthProfilesService,
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private requireWorker(user: AuthUser) {
    if (user.role !== Role.WORKER || !user.workerId)
      throw new ForbiddenException();
    return user.workerId;
  }

  /** Where the worker is now: active assignment's site, else their crew's site. */
  private async locate(organizationId: string, workerId: string) {
    const worker = await this.workers.findOneByOrFail({
      id: workerId,
      organizationId,
    });
    const now = new Date();
    const active = await this.assignments.findOne({
      where: {
        workerId,
        startsAt: LessThanOrEqual(now),
        endsAt: MoreThan(now),
        clockedOutAt: IsNull(),
      },
      order: { startsAt: 'DESC' },
    });
    const crew = worker.crewId
      ? await this.crews.findOneBy({ id: worker.crewId })
      : null;
    return {
      siteId: active?.siteId ?? crew?.siteId ?? null,
      crewId: worker.crewId,
    };
  }

  // ---- worker ------------------------------------------------------------------

  /** Symptom form. Always raises a "needs help" alert; details only with consent. */
  async report(user: AuthUser, dto: SymptomReportDto) {
    const workerId = this.requireWorker(user);
    if (!dto.symptoms?.length && !dto.note?.trim()) {
      throw new BadRequestException('Tick a symptom or add a note');
    }
    const consents = await this.health.consentState(workerId);
    const share = consents[ConsentPurpose.SYMPTOM_REPORTS];
    const where = await this.locate(user.organizationId, workerId);
    const saved = await this.requests.save(
      this.requests.create({
        organizationId: user.organizationId,
        workerId,
        ...where,
        kind: HelpRequestKind.SYMPTOM_REPORT,
        detailsShared: share,
        symptoms: share ? (dto.symptoms ?? []) : null,
        note: share ? dto.note?.trim() || null : null,
      }),
    );
    return this.workerView(saved);
  }

  /** Emergency button. No details, always allowed (works without any consent). */
  async firstAidAlert(user: AuthUser) {
    const workerId = this.requireWorker(user);
    const where = await this.locate(user.organizationId, workerId);
    const saved = await this.requests.save(
      this.requests.create({
        organizationId: user.organizationId,
        workerId,
        ...where,
        kind: HelpRequestKind.FIRST_AID_ALERT,
        detailsShared: false,
        symptoms: null,
        note: null,
      }),
    );
    return this.workerView(saved);
  }

  async mine(user: AuthUser) {
    const workerId = this.requireWorker(user);
    const rows = await this.requests.find({
      where: { workerId, organizationId: user.organizationId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    return rows.map((r) => this.workerView(r));
  }

  private workerView(r: HelpRequest) {
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
      detailsShared: r.detailsShared,
      symptoms: r.symptoms,
      note: r.note,
      acknowledgedAt: r.acknowledgedAt,
      resolvedAt: r.resolvedAt,
    };
  }

  // ---- supervisor ----------------------------------------------------------------

  /** "Needs attention": who needs help and when. Never symptoms or notes. */
  async forSite(
    user: AuthUser,
    siteId: string,
    opts: { includeResolved?: boolean },
  ) {
    await this.orgs.getSite(user.organizationId, siteId);
    const rows = await this.requests.find({
      // Explicit columns: encrypted details are never loaded for this view.
      select: {
        id: true,
        workerId: true,
        crewId: true,
        kind: true,
        status: true,
        createdAt: true,
        acknowledgedAt: true,
        resolvedAt: true,
      },
      where: {
        organizationId: user.organizationId,
        siteId,
        ...(opts.includeResolved ? {} : { status: In(OPEN_STATES) }),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    const workers = new Map(
      (await this.workers.findBy({ id: In(rows.map((r) => r.workerId)) })).map(
        (w) => [w.id, w],
      ),
    );
    return rows.map((r) => ({
      id: r.id,
      workerId: r.workerId,
      workerCode: workers.get(r.workerId)?.employeeCode ?? null,
      crewId: r.crewId,
      kind: r.kind,
      status: r.status,
      createdAt: r.createdAt,
      acknowledgedAt: r.acknowledgedAt,
      resolvedAt: r.resolvedAt,
    }));
  }

  async acknowledge(user: AuthUser, id: string) {
    const r = await this.load(user, id);
    if (r.status !== HelpRequestStatus.OPEN)
      throw new ConflictException('Already acknowledged or resolved');
    r.status = HelpRequestStatus.ACKNOWLEDGED;
    r.acknowledgedByUserId = user.userId;
    r.acknowledgedAt = new Date();
    await this.requests.save(r);
    return { id: r.id, status: r.status, acknowledgedAt: r.acknowledgedAt };
  }

  async resolve(user: AuthUser, id: string) {
    const r = await this.load(user, id);
    if (r.status === HelpRequestStatus.RESOLVED)
      throw new ConflictException('Already resolved');
    r.status = HelpRequestStatus.RESOLVED;
    r.resolvedByUserId = user.userId;
    r.resolvedAt = new Date();
    await this.requests.save(r);
    return { id: r.id, status: r.status, resolvedAt: r.resolvedAt };
  }

  private async load(user: AuthUser, id: string) {
    const r = await this.requests.findOne({
      select: { id: true, organizationId: true, status: true, workerId: true },
      where: { id, organizationId: user.organizationId },
    });
    if (!r) throw new NotFoundException();
    return r;
  }

  // ---- occupational health -------------------------------------------------------

  /** Symptom details for OH (only reports the worker chose to share). Audited. */
  async forOccupationalHealth(user: AuthUser, workerId?: string) {
    const rows = await this.requests.find({
      where: {
        organizationId: user.organizationId,
        ...(workerId ? { workerId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    for (const subject of new Set(
      rows.filter((r) => r.detailsShared).map((r) => r.workerId),
    )) {
      await this.audit.record(user, AuditAction.SYMPTOM_REPORT_READ, {
        subjectWorkerId: subject,
        entityType: 'help_request',
      });
    }
    return rows.map((r) => ({
      ...this.workerView(r),
      workerId: r.workerId,
      crewId: r.crewId,
      siteId: r.siteId,
    }));
  }
}
