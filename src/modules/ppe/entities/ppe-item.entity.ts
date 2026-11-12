import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { EnginePpeAddon, EnginePpeClass } from '../../../common/enums';

export enum PpeCategory {
  CLOTHING = 'clothing',
  HEAD = 'head',
  RESPIRATORY = 'respiratory',
  OTHER = 'other',
}

/**
 * Spec 3.4 – PPE catalogue. The heat adjustment itself is applied by the
 * external risk engine; we only record which engine class each item falls into.
 */
@Entity('ppe_items')
export class PpeItem extends BaseEntity {
  /** Null = global catalogue entry; otherwise organisation-specific. */
  @Index()
  @Column('uuid', { nullable: true })
  organizationId!: string | null;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'enum', enum: PpeCategory })
  category!: PpeCategory;

  /** Engine clothing class. Null for items the engine does not model (helmets, hoods, …). */
  @Column({ type: 'enum', enum: EnginePpeClass, nullable: true })
  engineClass!: EnginePpeClass | null;

  /** Worn on top of the clothing and adds heat burden (e.g. a hood). Helmets: null. */
  @Column({ type: 'enum', enum: EnginePpeAddon, nullable: true })
  engineAddon!: EnginePpeAddon | null;
}
