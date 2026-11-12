import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { encryptedJson } from '../../../common/crypto/field-encryption';
import { PrecautionLevel } from '../../../common/enums';
import { Worker } from '../../workers/entities/worker.entity';

/**
 * GDPR Art. 9 special-category data.
 * - Clinical fields are AES-256-GCM encrypted at the column level.
 * - Only the worker and occupational health users may read this entity.
 * - The risk engine reads ONLY `precautionLevel` – never the clinical fields.
 */
@Entity('health_profiles')
export class HealthProfile extends BaseEntity {
  @Column('uuid', { unique: true })
  workerId!: string;

  @OneToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workerId' })
  worker?: Worker;

  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  ageRange!: string | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  healthConditions!: string[] | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  medicalHistory!: string[] | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  medications!: string[] | null;

  /** Past heat illness answer: no | recent | old | unsure. */
  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  heatIllness!: string | null;

  /**
   * "How long in this heat?" answer: new | adjusting | over2 | back.
   * It also sets the worker's acclimatisation start date (decision D4).
   */
  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  acclimatisationAnswer!: string | null;

  /** Work restrictions set by occupational health, one per line (shown to the worker). */
  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  restrictions!: string[] | null;

  @Column({ type: 'date', nullable: true })
  nextReviewOn!: string | null;

  /** Restrictions written by occupational health (free text, encrypted). */
  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  precautionNotes!: string | null;

  /** Set ONLY by occupational health. Supervisors see its effect, not its basis. */
  @Column({
    type: 'enum',
    enum: PrecautionLevel,
    default: PrecautionLevel.STANDARD,
  })
  precautionLevel!: PrecautionLevel;

  @Column('uuid', { nullable: true })
  approvedByUserId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  /** Worker changed their data or asked for a review; occupational health must look again. */
  @Column({ default: false })
  reviewRequested!: boolean;
}
