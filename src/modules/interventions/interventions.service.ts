import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  InterventionStatus,
  RecommendationAudience,
  RecommendationStatus,
  Role,
} from '../../common/enums';
import { Recommendation } from '../recommendations/entities/recommendation.entity';
import { Intervention } from './entities/intervention.entity';
import { RecordInterventionDto } from './dto/intervention.dto';

const STATUS_MAP: Record<InterventionStatus, RecommendationStatus> = {
  [InterventionStatus.ACKNOWLEDGED]: RecommendationStatus.ACKNOWLEDGED,
  [InterventionStatus.IMPLEMENTED]: RecommendationStatus.IMPLEMENTED,
  [InterventionStatus.REASSIGNED]: RecommendationStatus.IMPLEMENTED,
  [InterventionStatus.DISMISSED]: RecommendationStatus.DISMISSED,
};

@Injectable()
export class InterventionsService {
  constructor(
    @InjectRepository(Intervention)
    private readonly interventions: Repository<Intervention>,
    @InjectRepository(Recommendation)
    private readonly recs: Repository<Recommendation>,
  ) {}

  private async loadAccessible(user: AuthUser, recommendationId: string) {
    const rec = await this.recs.findOneBy({
      id: recommendationId,
      organizationId: user.organizationId,
    });
    if (!rec) throw new NotFoundException('Recommendation not found');
    if (user.role === Role.WORKER) {
      // Workers may only act on their own worker-facing recommendations.
      const own =
        rec.audience === RecommendationAudience.WORKER &&
        rec.workerId === user.workerId;
      if (!own) throw new ForbiddenException();
    }
    return rec;
  }

  async record(
    user: AuthUser,
    recommendationId: string,
    dto: RecordInterventionDto,
  ) {
    const rec = await this.loadAccessible(user, recommendationId);
    if (
      user.role === Role.WORKER &&
      dto.status !== InterventionStatus.ACKNOWLEDGED
    ) {
      throw new ForbiddenException(
        'Workers can only acknowledge recommendations',
      );
    }
    return this.interventions.manager.transaction(async (tx) => {
      const saved = await tx.save(
        tx.create(Intervention, {
          organizationId: user.organizationId,
          recommendationId,
          status: dto.status,
          note: dto.note ?? null,
          recordedByUserId: user.userId,
        }),
      );
      rec.status = STATUS_MAP[dto.status];
      await tx.save(rec);
      return saved;
    });
  }

  async list(user: AuthUser, recommendationId: string) {
    await this.loadAccessible(user, recommendationId);
    return this.interventions.find({
      where: { recommendationId },
      order: { createdAt: 'ASC' },
    });
  }
}
