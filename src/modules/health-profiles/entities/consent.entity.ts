import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { ConsentPurpose } from '../../../common/enums';

/** Append-only consent history. The latest row per (worker, purpose) is authoritative. */
@Entity('consents')
@Index(['workerId', 'purpose', 'createdAt'])
export class Consent extends BaseEntity {
  @Column('uuid')
  workerId!: string;

  @Column({ type: 'enum', enum: ConsentPurpose })
  purpose!: ConsentPurpose;

  @Column()
  granted!: boolean;

  @Column()
  policyVersion!: string;

  @Column('uuid')
  recordedByUserId!: string;
}
