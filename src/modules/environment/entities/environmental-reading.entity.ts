import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Confidence, ReadingSource, WbgtMethod } from '../../../common/enums';

@Entity('environmental_readings')
@Index(['siteId', 'observedAt'])
export class EnvironmentalReading extends BaseEntity {
  @Column('uuid')
  siteId!: string;

  /** Time the conditions apply to (observation time or forecast hour). */
  @Column({ type: 'timestamptz' })
  observedAt!: Date;

  @Column({ default: false })
  isForecast!: boolean;

  @Column({ type: 'enum', enum: ReadingSource })
  source!: ReadingSource;

  @Column('double precision', { nullable: true }) airTempC!: number | null;
  @Column('double precision', { nullable: true }) relativeHumidity!:
    number | null;
  @Column('double precision', { nullable: true }) solarRadiationWm2!:
    number | null;
  @Column('double precision', { nullable: true }) windSpeedMs!: number | null;
  @Column('double precision', { nullable: true }) directRadiationWm2!:
    number | null;
  @Column('double precision', { nullable: true }) diffuseRadiationWm2!:
    number | null;
  @Column('double precision', { nullable: true }) surfacePressureHpa!:
    number | null;
  /** WMO weather code (95, 96, 99 = thunderstorm). */
  @Column('int', { nullable: true }) weatherCode!: number | null;
  @Column('double precision', { nullable: true }) dustUgM3!: number | null;
  @Column('double precision', { nullable: true }) pm10UgM3!: number | null;
  @Column('double precision', { nullable: true }) precipitationMm!:
    number | null;

  /** WBGT in direct sun. */
  @Column('double precision', { nullable: true }) wbgtSunC!: number | null;
  /** WBGT in shade. */
  @Column('double precision', { nullable: true }) wbgtShadeC!: number | null;

  @Column({ type: 'enum', enum: WbgtMethod })
  wbgtMethod!: WbgtMethod;

  /** Name of the estimation formula used, for traceability. */
  @Column({ type: 'text', nullable: true })
  wbgtModel!: string | null;

  @Column({ type: 'enum', enum: Confidence })
  confidence!: Confidence;
}
