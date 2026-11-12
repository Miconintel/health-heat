import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Organization } from './organization.entity';

export interface SiteShift {
  name: string;
  /** "HH:MM", site-local time. */
  start: string;
  end: string;
}

@Entity('sites')
export class Site extends BaseEntity {
  @Index()
  @Column('uuid')
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organizationId' })
  organization?: Organization;

  @Column()
  name!: string;

  @Column('double precision')
  latitude!: number;

  @Column('double precision')
  longitude!: number;

  @Column({ default: 'UTC' })
  timezone!: string;

  /** Shown on the worker Report screen as a tap-to-call number. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  emergencyNumber!: string | null;

  /** Named shifts in site-local time, e.g. Day shift 07:00 to 17:00. */
  @Column('jsonb', { default: () => "'[]'" })
  shifts!: SiteShift[];
}
