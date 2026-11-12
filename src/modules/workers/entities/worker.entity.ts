import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Crew } from '../../organizations/entities/crew.entity';

/**
 * Operational worker record. Contains NO health information –
 * that lives in health_profiles and is encrypted + access-restricted.
 */
@Entity('workers')
export class Worker extends BaseEntity {
  @Index()
  @Column('uuid')
  organizationId!: string;

  /** Employer's own identifier for the worker. */
  @Column()
  employeeCode!: string;

  @Column()
  displayName!: string;

  @Index()
  @Column('uuid', { nullable: true })
  crewId!: string | null;

  @ManyToOne(() => Crew, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'crewId' })
  crew?: Crew | null;

  /** App language code (see AppLanguage). */
  @Column({ default: 'en' })
  preferredLanguage!: string;

  /** "Read warnings aloud" preference from My data. */
  @Column({ default: false })
  readAloud!: boolean;

  /**
   * When the worker started working regularly in this heat (decision D4).
   * `acclimatized` is derived from it (see acclimatization.ts); null = unknown,
   * treated as not acclimatised. Work history, not health data.
   */
  @Column({ type: 'date', nullable: true })
  acclimatizationStartedOn!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  /** Date the worker left the site; health data is erased 30 days later. */
  @Column({ type: 'date', nullable: true })
  leftOn!: string | null;
}
