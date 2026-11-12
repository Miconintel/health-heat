import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('organizations')
export class Organization extends BaseEntity {
  @Column()
  name!: string;
}
