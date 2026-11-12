import { Column, Entity, PrimaryColumn } from 'typeorm';

/** The band paired to a worker (one per worker). Not health data; supervisors see only counts. */
@Entity('wearable_devices')
export class WearableDevice {
  @PrimaryColumn('uuid') workerId!: string;
  /** Band identifier from the phone (e.g. Bluetooth address or vendor serial), or "SIM-…" for the simulator. */
  @Column() deviceId!: string;
  @Column({ type: 'varchar', length: 80, nullable: true }) model!:
    string | null;
  @Column({ type: 'timestamptz' }) pairedAt!: Date;
  /** Last reading received from this band. */
  @Column({ type: 'timestamptz', nullable: true }) lastSeenAt!: Date | null;
  @Column('int', { nullable: true }) batteryPercent!: number | null;
}
