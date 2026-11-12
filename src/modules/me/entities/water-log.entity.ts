import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** One "+ Cup" press on the worker home screen. Visible to the worker only. */
@Entity('water_logs')
@Index(['workerId', 'loggedAt'])
export class WaterLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') workerId!: string;
  @CreateDateColumn({ type: 'timestamptz' }) loggedAt!: Date;
  @Column('int', { default: 1 }) cups!: number;
}
