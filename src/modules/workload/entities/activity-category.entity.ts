import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { WorkloadLevel } from '../../../common/enums';

/** Spec 3.3 – predefined activity categories (not a trained model). */
@Entity('activity_categories')
export class ActivityCategory extends BaseEntity {
  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: WorkloadLevel })
  defaultWorkload!: WorkloadLevel;

  @Column({ default: true })
  isPlaceholder!: boolean;
}
