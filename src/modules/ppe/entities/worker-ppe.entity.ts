import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PpeItem } from './ppe-item.entity';

@Entity('worker_ppe')
@Unique(['workerId', 'ppeItemId'])
export class WorkerPpe extends BaseEntity {
  @Column('uuid')
  workerId!: string;

  @Column('uuid')
  ppeItemId!: string;

  @ManyToOne(() => PpeItem, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'ppeItemId' })
  ppeItem!: PpeItem;
}
