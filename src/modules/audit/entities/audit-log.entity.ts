import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction, Role } from '../../../common/enums';

/** Append-only. Records who touched special-category data and when (GDPR accountability). */
@Entity('audit_logs')
@Index(['organizationId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;

  @Column('uuid') organizationId!: string;
  /** Null for system actions (e.g. retention). */
  @Column('uuid', { nullable: true })
  actorUserId!: string | null;
  @Column({ type: 'enum', enum: Role, nullable: true })
  actorRole!: Role | null;
  @Column({ type: 'enum', enum: AuditAction }) action!: AuditAction;
  @Index() @Column('uuid', { nullable: true }) subjectWorkerId!: string | null;
  @Column({ type: 'text', nullable: true }) entityType!: string | null;
  @Column('uuid', { nullable: true }) entityId!: string | null;
  /** Never put health data in here. */
  @Column('jsonb', { nullable: true }) metadata!: Record<
    string,
    unknown
  > | null;
}
