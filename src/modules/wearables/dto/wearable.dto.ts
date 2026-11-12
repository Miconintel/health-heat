import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PairBandDto {
  @ApiProperty({
    example: 'C8:2B:96:1A:00:4F',
    description: 'Band ID from the phone (or SIM-… for the simulator)',
  })
  @IsString()
  @MaxLength(64)
  deviceId!: string;

  @ApiProperty({ required: false, example: 'Generic BLE heart-rate band' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;
}

export class BandSampleDto {
  @ApiProperty({ example: '2026-11-12T10:30:00+01:00' })
  @IsISO8601()
  at!: string;

  @ApiProperty({ required: false, minimum: 30, maximum: 230 })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(230)
  heartRateBpm?: number;

  @ApiProperty({ required: false, minimum: 20, maximum: 45 })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(45)
  skinTempC?: number;
}

/** A batch from the phone, which relays the band's samples (e.g. once a minute). */
export class BandReadingsDto {
  @ApiProperty() @IsString() @MaxLength(64) deviceId!: string;

  @ApiProperty({ required: false, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryPercent?: number;

  @ApiProperty({ type: [BandSampleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(240)
  @ValidateNested({ each: true })
  @Type(() => BandSampleDto)
  readings!: BandSampleDto[];
}
