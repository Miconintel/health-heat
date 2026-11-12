import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { InterventionStatus } from '../../../common/enums';

/** Supervisor record of what was done about a recommendation (spec 3.7 intervention tracking). */
@Entity('interventions')
export class Intervention extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Index() @Column('uuid') recommendationId!: string;
  @Column({ type: 'enum', enum: InterventionStatus })
  status!: InterventionStatus;
  @Column('uuid') recordedByUserId!: string;
  @Column({ type: 'text', nullable: true }) note!: string | null;
}
