import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Site } from './site.entity';

@Entity('crews')
export class Crew extends BaseEntity {
  @Index()
  @Column('uuid')
  organizationId!: string;

  @Index()
  @Column('uuid')
  siteId!: string;

  @ManyToOne(() => Site, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'siteId' })
  site?: Site;

  @Column()
  name!: string;

  /** User responsible for this crew (role: supervisor). */
  @Column('uuid', { nullable: true })
  supervisorUserId!: string | null;
}
