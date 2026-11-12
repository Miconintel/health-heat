import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Last heartbeat from a worker's phone (one row per worker).
 * Feeds "No recent data" (quiet phones count as High) and system health.
 */
@Entity('device_status')
export class DeviceStatus {
  @PrimaryColumn('uuid') workerId!: string;
  @Column({ type: 'timestamptz' }) lastSeenAt!: Date;
  @Column('int', { nullable: true }) batteryPercent!: number | null;
  @Column({ type: 'boolean', nullable: true }) charging!: boolean | null;
}
