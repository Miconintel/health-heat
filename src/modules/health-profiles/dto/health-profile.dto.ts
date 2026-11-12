import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ConsentPurpose, PrecautionLevel } from '../../../common/enums';
import {
  ACCLIMATISATION_CODES,
  AGE_RANGES,
  CONDITION_CODES,
  HEAT_ILLNESS_CODES,
  MEDICINE_CODES,
} from '../profile-options';
import type { AcclimatisationAnswer } from '../profile-options';

/**
 * The worker's own answers (spec 3.2, frontend health profile). Every field optional.
 * Codes match the frontend's options; `none` can't be combined with other ticks.
 */
export class UpdateOwnHealthDataDto {
  @ApiProperty({ required: false, enum: AGE_RANGES })
  @IsOptional()
  @IsIn(AGE_RANGES)
  ageRange?: string;

  @ApiProperty({ required: false, enum: CONDITION_CODES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(CONDITION_CODES, { each: true })
  healthConditions?: string[];

  @ApiProperty({ required: false, enum: HEAT_ILLNESS_CODES })
  @IsOptional()
  @IsIn(HEAT_ILLNESS_CODES)
  heatIllness?: string;

  @ApiProperty({ required: false, enum: MEDICINE_CODES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(MEDICINE_CODES, { each: true })
  medications?: string[];

  @ApiProperty({
    required: false,
    enum: ACCLIMATISATION_CODES,
    description:
      'Also sets the acclimatisation start date (the later, more cautious date wins).',
  })
  @IsOptional()
  @IsIn(ACCLIMATISATION_CODES)
  acclimatisation?: AcclimatisationAnswer;

  @ApiProperty({
    required: false,
    type: [String],
    description: 'Free-text history (optional)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  medicalHistory?: string[];
}

/** Occupational health sets the classification that the risk engine uses. */
export class ApproveHealthProfileDto {
  @ApiProperty({ enum: PrecautionLevel })
  @IsEnum(PrecautionLevel)
  precautionLevel!: PrecautionLevel;

  @ApiProperty({
    required: false,
    type: [String],
    example: ['No heavy work at level 3 and above'],
    description:
      'Work restrictions, shown to the worker (never to supervisors)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  restrictions?: string[];

  @ApiProperty({ required: false, example: '2026-12-09' })
  @IsOptional()
  @IsISO8601({ strict: true })
  nextReviewOn?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  precautionNotes?: string;
}

export class RecordConsentDto {
  @ApiProperty({ enum: ConsentPurpose })
  @IsEnum(ConsentPurpose)
  purpose!: ConsentPurpose;
  @ApiProperty() @IsBoolean() granted!: boolean;
  @ApiProperty({ example: '2026-11-01' })
  @IsString()
  @MaxLength(50)
  policyVersion!: string;
}
