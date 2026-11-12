import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { WorkEnvironment, WorkloadLevel } from '../../../common/enums';
import { ActivityCategory } from './activity-category.entity';

/**
 * What a worker is doing, where, and for how long, within one shift.
 * Also tracks clock-in and breaks, because the risk engine needs
 * minutes exposed and minutes since the last break.
 */
@Entity('work_assignments')
@Index(['workerId', 'startsAt'])
export class WorkAssignment extends BaseEntity {
  @Column('uuid')
  organizationId!: string;

  @Column('uuid')
  workerId!: string;

  @Index()
  @Column('uuid')
  siteId!: string;

  @Column('uuid')
  activityCategoryId!: string;

  @ManyToOne(() => ActivityCategory, { eager: true })
  @JoinColumn({ name: 'activityCategoryId' })
  activityCategory!: ActivityCategory;

  /** Overrides the category default when the supervisor knows better. */
  @Column({ type: 'enum', enum: WorkloadLevel, nullable: true })
  workloadOverride!: WorkloadLevel | null;

  @Column({ type: 'enum', enum: WorkEnvironment })
  workEnvironment!: WorkEnvironment;

  /** Planned shift window. */
  @Column({ type: 'timestamptz' })
  startsAt!: Date;

  @Column({ type: 'timestamptz' })
  endsAt!: Date;

  /** Planned rest breaks in shade (start times). Feeds `rest_break` in engine forecasts. */
  @Column({ type: 'timestamptz', array: true, default: () => "'{}'" })
  plannedBreaks!: Date[];

  /** Length of each planned break in shade. */
  @Column('int', { default: 15 })
  breakMinutes!: number;

  // ---- live shift tracking -------------------------------------------------

  @Column({ type: 'timestamptz', nullable: true })
  clockedInAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  clockedOutAt!: Date | null;

  /** Set while the worker is on a break; cleared when the break ends. */
  @Column({ type: 'timestamptz', nullable: true })
  onBreakSince!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastBreakEndedAt!: Date | null;
}
