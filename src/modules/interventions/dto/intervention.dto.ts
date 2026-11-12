import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { InterventionStatus } from '../../../common/enums';

export class RecordInterventionDto {
  @ApiProperty({ enum: InterventionStatus })
  @IsEnum(InterventionStatus)
  status!: InterventionStatus;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
