import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum WorkEventType {
  CLOCK_IN = 'clock_in',
  BREAK_START = 'break_start',
  BREAK_END = 'break_end',
  CLOCK_OUT = 'clock_out',
}

/** Append-only log of shift events. Used for "work time paused" and plan compliance. */
@Entity('work_events')
@Index(['siteId', 'at'])
export class WorkEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @Column('uuid') organizationId!: string;
  @Column('uuid') siteId!: string;
  @Index() @Column('uuid') workerId!: string;
  @Column('uuid') assignmentId!: string;
  @Column({ type: 'enum', enum: WorkEventType }) type!: WorkEventType;
  @Column({ type: 'timestamptz' }) at!: Date;
}
