import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import {
  RecommendationAudience,
  RecommendationStatus,
  RecommendationTiming,
  RiskLevel,
} from '../../../common/enums';

/** Spec 3.6 – every recommendation answers what / why / who / what to do / when. */
@Entity('recommendations')
@Index(['siteId', 'createdAt'])
export class Recommendation extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Column('uuid') siteId!: string;
  @Column('uuid', { nullable: true }) riskAssessmentId!: string | null;
  /** Set for worker-level recommendations. */
  @Index() @Column('uuid', { nullable: true }) workerId!: string | null;
  /** Set for crew-level recommendations. */
  @Column('uuid', { nullable: true }) crewId!: string | null;

  @Column({ type: 'enum', enum: RecommendationAudience })
  audience!: RecommendationAudience;

  /** Stable rule identifier, e.g. `worker.extra_breaks`. */
  @Column()
  code!: string;

  @Column('int')
  riskLevel!: RiskLevel;

  @Column('text') whatHappened!: string;
  @Column('text') whyItMatters!: string;
  @Column('text') whoIsAffected!: string;
  @Column('text') action!: string;

  @Column({ type: 'enum', enum: RecommendationTiming })
  timing!: RecommendationTiming;

  @Column({ type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({
    type: 'enum',
    enum: RecommendationStatus,
    default: RecommendationStatus.OPEN,
  })
  status!: RecommendationStatus;
}
