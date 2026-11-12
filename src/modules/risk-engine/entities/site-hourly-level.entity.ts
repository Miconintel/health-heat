import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { RiskLevel } from '../../../common/enums';

/**
 * Site heat level per hour, for a reference worker (moderate work, standard
 * clothing, acclimatised): the supervisor's "Today, hour by hour" strip and the
 * shift-plan heat row. Keeps the forecast history for warning lead-time measures.
 */
@Entity('site_hourly_levels')
@Unique(['siteId', 'hourStart'])
@Index(['siteId', 'hourStart'])
export class SiteHourlyLevel {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') siteId!: string;
  /** Start of the hour (UTC instant). */
  @Column({ type: 'timestamptz' }) hourStart!: Date;

  /** Level assessed from current conditions during this hour (latest in the hour). */
  @Column('int', { nullable: true }) observedLevel!: RiskLevel | null;
  @Column('double precision', { nullable: true }) observedWbgtC!: number | null;
  @Column({ type: 'timestamptz', nullable: true }) observedAt!: Date | null;

  /** The first forecast made for this hour. */
  @Column('int', { nullable: true }) firstForecastLevel!: RiskLevel | null;
  @Column({ type: 'timestamptz', nullable: true })
  firstForecastAt!: Date | null;
  /** When a forecast first said High or above (definite or possible) for this hour. */
  @Column({ type: 'timestamptz', nullable: true }) firstWarningAt!: Date | null;

  /** The most recent forecast for this hour. */
  @Column('int', { nullable: true }) latestForecastLevel!: RiskLevel | null;
  @Column('int', { nullable: true }) latestPossibleLevel!: RiskLevel | null;
  @Column({ type: 'varchar', length: 16, nullable: true }) latestConfidence!:
    string | null;
  @Column({ type: 'timestamptz', nullable: true })
  latestForecastAt!: Date | null;
}
