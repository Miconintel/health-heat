import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, Max, Min } from 'class-validator';

/** A directly measured reading from an on-site WBGT sensor. */
export class SensorReadingDto {
  @ApiProperty() @IsDateString() observedAt!: string;
  @ApiProperty() @IsNumber() @Min(-20) @Max(60) wbgtC!: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() airTempC?: number;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  relativeHumidity?: number;
}
