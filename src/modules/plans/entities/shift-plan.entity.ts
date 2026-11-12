import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { Task } from '../plan-rules';

/** A site's crew × hour plan for one local day (Shift plan page). */
@Entity('shift_plans')
@Unique(['siteId', 'date'])
export class ShiftPlan extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Column('uuid') siteId!: string;
  /** Site-local date, YYYY-MM-DD. */
  @Column({ type: 'date' }) date!: string;
  /** Hour labels in site-local time, e.g. ["07:00", "08:00", …]. */
  @Column('jsonb') hours!: string[];
  /** crewId → one task per hour. */
  @Column('jsonb') crews!: Record<string, Task[]>;
  @Column({ type: 'varchar', length: 8, default: 'draft' }) status!:
    'draft' | 'sent';
  @Column({ type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @Column('uuid', { nullable: true }) updatedByUserId!: string | null;
}
