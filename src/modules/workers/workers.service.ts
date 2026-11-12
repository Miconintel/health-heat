import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { Role } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { Worker } from './entities/worker.entity';
import {
  CreateWorkerDto,
  SetAcclimatizationDto,
  UpdateWorkerDto,
} from './dto/worker.dto';
import { AuditService } from '../audit/audit.service';
import { RiskEngineService } from '../risk-engine/risk-engine.service';
import { AuditAction } from '../../common/enums';
import type { AcclimatisationAnswer } from '../health-profiles/profile-options';
import { localDate } from '../../common/time';
import {
  acclimatizationStatus,
  isoDate,
  laterDate,
  startDateFromAnswer,
} from './acclimatization';

@Injectable()
export class WorkersService {
  constructor(
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    private readonly orgs: OrganizationsService,
    private readonly audit: AuditService,
    private readonly risk: RiskEngineService,
  ) {}

  /**
   * Loads a worker the caller is allowed to see:
   * same organisation, and a worker-role user may only see themselves.
   */
  async getAccessible(user: AuthUser, workerId: string): Promise<Worker> {
    if (user.role === Role.WORKER && user.workerId !== workerId)
      throw new ForbiddenException();
    const worker = await this.workers.findOneBy({
      id: workerId,
      organizationId: user.organizationId,
    });
    if (!worker) throw new NotFoundException('Worker not found');
    return worker;
  }

  list(organizationId: string, filter: { crewId?: string }) {
    return this.workers.find({
      where: {
        organizationId,
        ...(filter.crewId ? { crewId: filter.crewId } : {}),
      },
      order: { displayName: 'ASC' },
    });
  }

  async create(organizationId: string, dto: CreateWorkerDto) {
    if (dto.crewId) await this.orgs.getCrew(organizationId, dto.crewId);
    return this.workers.save(
      this.workers.create({
        ...dto,
        crewId: dto.crewId ?? null,
        organizationId,
      }),
    );
  }

  async update(user: AuthUser, workerId: string, dto: UpdateWorkerDto) {
    const worker = await this.getAccessible(user, workerId);
    if (dto.crewId) await this.orgs.getCrew(user.organizationId, dto.crewId);
    if (dto.isActive === false && worker.isActive)
      worker.leftOn = isoDate(new Date());
    if (dto.isActive === true) worker.leftOn = null;
    Object.assign(worker, dto);
    return this.workers.save(worker);
  }

  /**
   * Staff set or reset the acclimatisation start date (decision D4).
   * Moving it later (e.g. "returned after an absence") is always allowed.
   * Moving it earlier makes the engine less cautious, so it needs a reason.
   * Both are audited.
   */
  async setAcclimatization(
    user: AuthUser,
    workerId: string,
    dto: SetAcclimatizationDto,
  ) {
    const worker = await this.getAccessible(user, workerId);
    const today = await this.workerToday(worker);
    if (dto.startedOn > today)
      throw new BadRequestException('startedOn cannot be in the future');
    const before = worker.acclimatizationStartedOn;
    const lessCautious = !before || dto.startedOn < before;
    if (lessCautious && !dto.reason?.trim()) {
      throw new BadRequestException(
        'A reason is required when setting an earlier start date (it reduces caution)',
      );
    }
    worker.acclimatizationStartedOn = dto.startedOn;
    await this.workers.save(worker);
    await this.audit.record(user, AuditAction.ACCLIMATIZATION_CHANGED, {
      subjectWorkerId: workerId,
      entityType: 'worker',
      entityId: workerId,
      metadata: { before, after: dto.startedOn, reason: dto.reason ?? null },
    });
    this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    return this.acclimatizationView(worker, today);
  }

  /**
   * From the worker's health-profile answer: the later (more cautious) of the
   * current start date and the one implied by the answer wins.
   */
  async applyAcclimatisationAnswer(
    organizationId: string,
    workerId: string,
    answer: AcclimatisationAnswer,
  ) {
    const worker = await this.workers.findOneByOrFail({
      id: workerId,
      organizationId,
    });
    const candidate = startDateFromAnswer(
      answer,
      await this.workerToday(worker),
    );
    const next = laterDate(worker.acclimatizationStartedOn, candidate);
    if (next !== worker.acclimatizationStartedOn) {
      worker.acclimatizationStartedOn = next;
      await this.workers.save(worker);
      this.risk.reassessWorkerInBackground(organizationId, workerId);
    }
    return this.acclimatizationView(worker, await this.workerToday(worker));
  }

  acclimatizationView(worker: Worker, today: string) {
    return acclimatizationStatus(worker.acclimatizationStartedOn, today);
  }

  /** Today's date at the worker's site (crew's site timezone), else UTC. */
  private async workerToday(worker: Worker): Promise<string> {
    if (worker.crewId) {
      const crew = await this.orgs
        .getCrew(worker.organizationId, worker.crewId)
        .catch(() => null);
      const site = crew
        ? await this.orgs
            .getSite(worker.organizationId, crew.siteId)
            .catch(() => null)
        : null;
      if (site) return localDate(site.timezone);
    }
    return isoDate(new Date());
  }
}
