import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { encryptedJson } from '../../../common/crypto/field-encryption';
import {
  AssessmentSource,
  DataQuality,
  EngineLanguage,
  EnginePpeAddon,
  RiskLevel,
} from '../../../common/enums';
import type {
  EngineAction,
  EngineConfidence,
  EngineReason,
  EngineWbgtSource,
  LevelReached,
} from '../../ai-engine/engine.types';

/** One hour of a saved forecast, kept so the worker app can warn while offline. */
export interface StoredForecastHour {
  at: string;
  level: RiskLevel;
  label: string;
  action: EngineAction;
  dataQuality: DataQuality;
  /** Higher level this hour may reach (engine request #4); null when not provided. */
  possibleLevel: RiskLevel | null;
  possibleLabel: string | null;
  confidence: EngineConfidence | null;
}

/**
 * One assessment of one worker, as returned by the external risk engine
 * (or our fail-safe when the engine was unreachable).
 *
 * Privacy: `reasons` can reveal health information (engine guide §6), so it is
 * encrypted and only ever returned to the worker or occupational health.
 */
@Entity('risk_assessments')
@Index(['workerId', 'assessedAt'])
@Index(['siteId', 'assessedAt'])
export class RiskAssessment extends BaseEntity {
  @Column('uuid') organizationId!: string;
  @Column('uuid') siteId!: string;
  @Column('uuid') workerId!: string;
  @Column('uuid', { nullable: true }) crewId!: string | null;
  @Column('uuid') workAssignmentId!: string;

  @Column({ type: 'timestamptz' })
  assessedAt!: Date;

  @Column({ type: 'enum', enum: AssessmentSource })
  source!: AssessmentSource;

  /** 1 Low, 2 Elevated, 3 High, 4 Critical. Use for logic; `label` is language-dependent. */
  @Column('int')
  level!: RiskLevel;

  @Column()
  label!: string;

  @Column({ type: 'enum', enum: EngineLanguage })
  language!: EngineLanguage;

  @Column({ type: 'text', transformer: encryptedJson })
  reasons!: EngineReason[];

  @Column('jsonb')
  action!: EngineAction;

  /** The WBGT value the engine actually used. */
  @Column('double precision', { nullable: true })
  wbgtC!: number | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  wbgtSource!: EngineWbgtSource | null;

  @Column({ type: 'enum', enum: DataQuality })
  dataQuality!: DataQuality;

  /**
   * PPE the worker wears that the engine could not take into account (e.g. `hood`
   * until the engine supports it). Non-empty means the level may be too low.
   * Not health data, so supervisors see it too.
   */
  @Column('jsonb', { default: () => "'[]'" })
  ppeNotModelled!: EnginePpeAddon[];

  // ---- forecast for the rest of the assignment -----------------------------

  @Column('jsonb', { default: () => "'[]'" })
  forecastFirstReached!: LevelReached[];

  @Column('int', { nullable: true })
  forecastPeakLevel!: RiskLevel | null;

  @Column({ type: 'timestamptz', nullable: true })
  forecastPeakAt!: Date | null;

  @Column('jsonb', { default: () => "'[]'" })
  forecastHours!: StoredForecastHour[];

  /** Overall forecast confidence (engine request #4). Null until the engine provides it. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  forecastConfidence!: EngineConfidence | null;

  /** In the worker's language: worker view only. */
  @Column({ type: 'text', nullable: true })
  forecastConfidenceNote!: string | null;

  /** Highest "possible" level in the forecast, if above the definite peak. */
  @Column('int', { nullable: true })
  forecastPossiblePeakLevel!: RiskLevel | null;

  @Column({ type: 'timestamptz', nullable: true })
  forecastPossiblePeakAt!: Date | null;
}
