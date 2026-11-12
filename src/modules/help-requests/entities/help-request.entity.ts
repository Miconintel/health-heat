import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { encryptedJson } from '../../../common/crypto/field-encryption';
import { HelpRequestKind, HelpRequestStatus } from '../../../common/enums';

/**
 * A worker asking for help: the symptom report form, or the "Alert first aider"
 * emergency button.
 *
 * Decision D5: the alert itself always reaches the supervisor and first aider.
 * Symptom details are stored only if the worker consented to symptom reports,
 * are encrypted, and are visible to the worker and occupational health only.
 */
@Entity('help_requests')
@Index(['siteId', 'createdAt'])
export class HelpRequest extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Index() @Column('uuid') workerId!: string;
  @Column('uuid', { nullable: true }) siteId!: string | null;
  @Column('uuid', { nullable: true }) crewId!: string | null;

  @Column({ type: 'enum', enum: HelpRequestKind })
  kind!: HelpRequestKind;

  @Column({
    type: 'enum',
    enum: HelpRequestStatus,
    default: HelpRequestStatus.OPEN,
  })
  status!: HelpRequestStatus;

  /** Whether symptom details were shared (consent at the time of sending). */
  @Column({ default: false })
  detailsShared!: boolean;

  /** Symptom codes (headache, dizzy, …). Null when not shared or erased. */
  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  symptoms!: string[] | null;

  @Column({ type: 'text', nullable: true, transformer: encryptedJson })
  note!: string | null;

  @Column('uuid', { nullable: true }) acknowledgedByUserId!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) acknowledgedAt!: Date | null;
  @Column('uuid', { nullable: true }) resolvedByUserId!: string | null;
  @Column({ type: 'timestamptz', nullable: true }) resolvedAt!: Date | null;
}
