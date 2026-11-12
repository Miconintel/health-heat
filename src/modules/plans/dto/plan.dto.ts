import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsObject, IsOptional } from 'class-validator';
import type { Task } from '../plan-rules';

export class SavePlanDto {
  @ApiProperty({
    required: false,
    example: '2026-11-12',
    description: 'Site-local date; default today',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @ApiProperty({
    example: { '<crewId>': ['H', 'H', 'M', 'B', 'L'] },
    description:
      'crewId → one task per hour (H, M, L or B), same length as the plan hours',
  })
  @IsObject()
  crews!: Record<string, Task[]>;
}

export class SendPlanDto {
  @ApiProperty({ required: false, example: '2026-11-12' })
  @IsOptional()
  @IsISO8601({ strict: true })
  date?: string;

  @ApiProperty({ enum: ['current', 'suggested'], default: 'current' })
  @IsOptional()
  @IsIn(['current', 'suggested'])
  use?: 'current' | 'suggested';
}
