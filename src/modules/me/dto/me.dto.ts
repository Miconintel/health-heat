import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AppLanguage } from '../../../common/enums';

export class UpdatePreferencesDto {
  @ApiProperty({ required: false, enum: AppLanguage })
  @IsOptional()
  @IsEnum(AppLanguage)
  language?: AppLanguage;

  @ApiProperty({ required: false, description: 'Read warnings aloud' })
  @IsOptional()
  @IsBoolean()
  readAloud?: boolean;
}

/** The three switches on the consent and My data screens. Omitted = unchanged. */
export class ConsentChoicesDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  healthPrecautions?: boolean;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  wearableBand?: boolean;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  symptomReports?: boolean;

  @ApiProperty({
    example: '2026-11',
    description: 'Version of the privacy notice shown',
  })
  @IsString()
  @MaxLength(50)
  policyVersion!: string;
}

export class LogWaterDto {
  @ApiProperty({ required: false, default: 1, minimum: 1, maximum: 4 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  cups?: number;
}

export class HeartbeatDto {
  @ApiProperty({ required: false, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  charging?: boolean;
}
