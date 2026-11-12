import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Role } from '../../../common/enums';

/**
 * Login account. Everyone signs in with a login ID and a PIN (demo-friendly):
 * workers use their employee code (e.g. W-0412), staff an ID like S-001.
 * Accounts are created by an admin or the demo seed; there is no self sign-up.
 */
@Entity('users')
export class User extends BaseEntity {
  @Index()
  @Column('uuid')
  organizationId!: string;

  /** Stored upper-case, e.g. "W-0412". */
  @Index({ unique: true })
  @Column()
  loginId!: string;

  /** Optional contact address; not used to sign in. */
  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  email!: string | null;

  /** bcrypt hash of the PIN. Never selected by default. */
  @Column({ select: false })
  pinHash!: string;

  @Column({ type: 'enum', enum: Role })
  role!: Role;

  /** Links a login to a worker record (role: worker). */
  @Column('uuid', { nullable: true, unique: true })
  workerId!: string | null;

  @Column({ default: true })
  isActive!: boolean;

  /** Consecutive wrong PINs; reset on success. */
  @Column('int', { default: 0, select: false })
  failedLoginCount!: number;

  /** Set after too many wrong PINs; login refused until then. */
  @Column({ type: 'timestamptz', nullable: true, select: false })
  lockedUntil!: Date | null;
}
