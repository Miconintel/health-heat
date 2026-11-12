import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { SYMPTOM_CODES } from '../../health-profiles/profile-options';

export class SymptomReportDto {
  @ApiProperty({ enum: SYMPTOM_CODES, isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(SYMPTOM_CODES.length)
  @IsIn(SYMPTOM_CODES, { each: true })
  symptoms?: string[];

  @ApiProperty({ required: false, description: '"Anything else?" note' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
