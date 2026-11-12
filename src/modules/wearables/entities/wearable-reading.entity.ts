import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { encryptedJson } from '../../../common/crypto/field-encryption';

export interface WearableValues {
  heartRateBpm: number | null;
  skinTempC: number | null;
}

/**
 * One band sample. Physiological data is GDPR special-category data:
 * values are encrypted, kept 7 days, worker and occupational health only.
 */
@Entity('wearable_readings')
@Unique(['workerId', 'at'])
@Index(['workerId', 'at'])
export class WearableReading {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid') workerId!: string;
  @Column({ type: 'timestamptz' }) at!: Date;
  @Column({ type: 'text', transformer: encryptedJson }) values!: WearableValues;
}
