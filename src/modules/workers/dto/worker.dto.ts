import { ApiProperty, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AppLanguage } from '../../../common/enums';

export class CreateWorkerDto {
  @ApiProperty() @IsString() @MinLength(1) employeeCode!: string;
  @ApiProperty() @IsString() @MinLength(1) displayName!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsUUID() crewId?: string;
  @ApiProperty({ required: false, enum: AppLanguage })
  @IsOptional()
  @IsEnum(AppLanguage)
  preferredLanguage?: AppLanguage;
  @ApiProperty({
    required: false,
    example: '2026-10-01',
    description:
      'When the worker started working regularly in this heat. Unknown = not acclimatised.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  acclimatizationStartedOn?: string;
}

/** Acclimatisation changes go through PUT /workers/:id/acclimatization (audited). */
export class UpdateWorkerDto extends PartialType(
  OmitType(CreateWorkerDto, ['acclimatizationStartedOn'] as const),
) {
  @ApiProperty({
    required: false,
    description: 'false = left the site (starts the 30-day retention clock)',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SetAcclimatizationDto {
  @ApiProperty({
    example: '2026-11-12',
    description: 'New start date. Today = "returned after an absence".',
  })
  @IsISO8601({ strict: true })
  startedOn!: string;

  @ApiProperty({
    required: false,
    description:
      'Required when moving the date earlier (makes the engine less cautious).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
