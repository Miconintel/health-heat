import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { Role } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { WorkersService } from '../workers/workers.service';
import { RiskEngineService } from '../risk-engine/risk-engine.service';
import { ActivityCategory } from './entities/activity-category.entity';
import { WorkAssignment } from './entities/work-assignment.entity';
import { WorkEvent, WorkEventType } from './entities/work-event.entity';
import {
  CreateActivityCategoryDto,
  CreateAssignmentDto,
} from './dto/workload.dto';

export type ShiftEvent = 'clock-in' | 'break-start' | 'break-end' | 'clock-out';

const EVENT_TYPE: Record<ShiftEvent, WorkEventType> = {
  'clock-in': WorkEventType.CLOCK_IN,
  'break-start': WorkEventType.BREAK_START,
  'break-end': WorkEventType.BREAK_END,
  'clock-out': WorkEventType.CLOCK_OUT,
};

@Injectable()
export class WorkloadService {
  constructor(
    @InjectRepository(ActivityCategory)
    private readonly categories: Repository<ActivityCategory>,
    @InjectRepository(WorkAssignment)
    private readonly assignments: Repository<WorkAssignment>,
    private readonly workers: WorkersService,
    private readonly orgs: OrganizationsService,
    private readonly risk: RiskEngineService,
    @InjectRepository(WorkEvent) private readonly events: Repository<WorkEvent>,
  ) {}

  listCategories() {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  createCategory(dto: CreateActivityCategoryDto) {
    return this.categories.save(
      this.categories.create({ ...dto, isPlaceholder: false }),
    );
  }

  async createAssignment(
    user: AuthUser,
    workerId: string,
    dto: CreateAssignmentDto,
  ) {
    await this.workers.getAccessible(user, workerId);
    await this.orgs.getSite(user.organizationId, dto.siteId);
    const category = await this.categories.findOneBy({
      id: dto.activityCategoryId,
    });
    if (!category) throw new NotFoundException('Activity category not found');
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt)
      throw new BadRequestException('endsAt must be after startsAt');
    const plannedBreaks = (dto.plannedBreaks ?? [])
      .map((b) => new Date(b))
      .sort((a, b) => a.getTime() - b.getTime());
    if (plannedBreaks.some((b) => b < startsAt || b >= endsAt)) {
      throw new BadRequestException('plannedBreaks must fall within the shift');
    }

    const saved = await this.assignments.save(
      this.assignments.create({
        ...dto,
        organizationId: user.organizationId,
        workerId,
        startsAt,
        endsAt,
        plannedBreaks,
        workloadOverride: dto.workloadOverride ?? null,
      }),
    );
    // Task changed: reassess now (engine guide §7).
    this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    return saved;
  }

  async listForWorker(user: AuthUser, workerId: string) {
    await this.workers.getAccessible(user, workerId);
    return this.assignments.find({
      where: { workerId },
      order: { startsAt: 'DESC' },
      take: 50,
    });
  }

  /**
   * Clock-in / breaks / clock-out. The engine needs minutes exposed and minutes
   * since the last break, and the backend must keep them because the engine is stateless.
   * Allowed for the worker on their own assignment, and for supervisors.
   */
  async recordShiftEvent(
    user: AuthUser,
    assignmentId: string,
    event: ShiftEvent,
    at = new Date(),
  ) {
    const a = await this.assignments.findOneBy({
      id: assignmentId,
      organizationId: user.organizationId,
    });
    if (!a) throw new NotFoundException('Assignment not found');
    const isOwn = user.role === Role.WORKER && user.workerId === a.workerId;
    if (!isOwn && user.role !== Role.SUPERVISOR) throw new ForbiddenException();
    if (a.clockedOutAt) throw new ConflictException('Shift already ended');

    switch (event) {
      case 'clock-in':
        if (a.clockedInAt) throw new ConflictException('Already clocked in');
        a.clockedInAt = at;
        break;
      case 'break-start':
        if (!a.clockedInAt) throw new ConflictException('Not clocked in');
        if (a.onBreakSince) throw new ConflictException('Already on a break');
        a.onBreakSince = at;
        break;
      case 'break-end':
        if (!a.onBreakSince) throw new ConflictException('Not on a break');
        a.onBreakSince = null;
        a.lastBreakEndedAt = at;
        break;
      case 'clock-out':
        if (!a.clockedInAt) throw new ConflictException('Not clocked in');
        a.onBreakSince = null;
        a.clockedOutAt = at;
        break;
    }
    const saved = await this.assignments.save(a);
    await this.events.insert({
      organizationId: a.organizationId,
      siteId: a.siteId,
      workerId: a.workerId,
      assignmentId: a.id,
      type: EVENT_TYPE[event],
      at,
    });
    if (event !== 'clock-out') {
      // Break status changed: reassess now (engine guide §7).
      this.risk.reassessWorkerInBackground(user.organizationId, a.workerId);
    }
    return saved;
  }
}
