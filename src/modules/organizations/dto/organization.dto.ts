import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsLatitude,
  Matches,
  MaxLength,
  ValidateNested,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SiteShiftDto {
  @ApiProperty({ example: 'Day shift' })
  @IsString()
  @MaxLength(40)
  name!: string;
  @ApiProperty({ example: '07:00' }) @Matches(HHMM) start!: string;
  @ApiProperty({ example: '17:00' }) @Matches(HHMM) end!: string;
}

export class CreateSiteDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty() @IsLatitude() latitude!: number;
  @ApiProperty() @IsLongitude() longitude!: number;
  @ApiProperty({ required: false, example: 'Europe/Madrid' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiProperty({ required: false, example: '112' })
  @IsOptional()
  @Matches(/^[0-9+ ()-]{2,32}$/)
  emergencyNumber?: string;

  @ApiProperty({ required: false, type: () => [SiteShiftDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SiteShiftDto)
  shifts?: SiteShiftDto[];
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class CreateCrewDto {
  @ApiProperty() @IsString() @MinLength(1) name!: string;
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supervisorUserId?: string;
}
