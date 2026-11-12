import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { WorkEnvironment, WorkloadLevel } from '../../../common/enums';

export class CreateActivityCategoryDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: WorkloadLevel })
  @IsEnum(WorkloadLevel)
  defaultWorkload!: WorkloadLevel;
}

export class CreateAssignmentDto {
  @ApiProperty() @IsUUID() siteId!: string;
  @ApiProperty() @IsUUID() activityCategoryId!: string;
  @ApiProperty({ enum: WorkloadLevel, required: false })
  @IsOptional()
  @IsEnum(WorkloadLevel)
  workloadOverride?: WorkloadLevel;
  @ApiProperty({ enum: WorkEnvironment })
  @IsEnum(WorkEnvironment)
  workEnvironment!: WorkEnvironment;
  @ApiProperty() @IsDateString() startsAt!: string;
  @ApiProperty() @IsDateString() endsAt!: string;
  @ApiProperty({
    type: [String],
    required: false,
    description:
      'Planned rest breaks in shade (ISO start times within the shift)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(48)
  @IsDateString({}, { each: true })
  plannedBreaks?: string[];

  @ApiProperty({ required: false, default: 15, minimum: 5, maximum: 60 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60)
  breakMinutes?: number;
}
