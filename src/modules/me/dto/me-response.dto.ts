import { ApiProperty } from '@nestjs/swagger';
import {
  AppLanguage,
  PrecautionLevel,
  Role,
  WorkEnvironment,
  WorkloadLevel,
} from '../../../common/enums';

/** Response of GET /me, documented for Swagger (the service returns this shape). */

class MeAccountDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'W-0412' }) loginId!: string;
  @ApiProperty({ enum: Role }) role!: Role;
}

class MeCrewDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Crew C' }) name!: string;
}

class MeAcclimatizationDto {
  @ApiProperty({
    description:
      'Derived: true once 14 days have passed since `startedOn`. Restarts after 7+ days with no shift.',
  })
  acclimatized!: boolean;
  @ApiProperty({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Null = unknown, treated as not acclimatised.',
  })
  startedOn!: string | null;
  @ApiProperty({ type: Number, nullable: true }) daysSinceStart!: number | null;
}

class MeWorkerDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'W-0412' }) employeeCode!: string;
  @ApiProperty({ example: 'W-0412' }) displayName!: string;
  @ApiProperty({ type: MeCrewDto, nullable: true }) crew!: MeCrewDto | null;
  @ApiProperty({
    enum: AppLanguage,
    description: 'Hide `pcm` (Pidgin) for the 15 Nov submission.',
  })
  language!: string;
  @ApiProperty() readAloud!: boolean;
  @ApiProperty({ type: MeAcclimatizationDto })
  acclimatization!: MeAcclimatizationDto;
}

class MeSiteShiftDto {
  @ApiProperty({ example: 'Day shift' }) name!: string;
  @ApiProperty({ example: '07:00', description: 'HH:MM, site-local time' })
  start!: string;
  @ApiProperty({ example: '17:00', description: 'HH:MM, site-local time' })
  end!: string;
}

class MeSiteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Abuja Demo Site' }) name!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) timezone!: string;
  @ApiProperty({ type: String, nullable: true, example: '112' })
  emergencyNumber!: string | null;
  @ApiProperty({ type: [MeSiteShiftDto] }) shifts!: MeSiteShiftDto[];
}

class MeActivityDto {
  @ApiProperty({ example: 'welding' }) code!: string;
  @ApiProperty({ example: 'Welding' }) name!: string;
}

class MeAssignmentDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ type: MeActivityDto }) activity!: MeActivityDto;
  @ApiProperty({ enum: WorkloadLevel }) workload!: WorkloadLevel;
  @ApiProperty({ enum: WorkEnvironment }) workEnvironment!: WorkEnvironment;
  @ApiProperty({ format: 'date-time' }) startsAt!: Date;
  @ApiProperty({ format: 'date-time' }) endsAt!: Date;
  @ApiProperty({ type: [String], format: 'date-time' }) plannedBreaks!: Date[];
  @ApiProperty({ example: 15 }) breakMinutes!: number;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  clockedInAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  clockedOutAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  onBreakSince!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastBreakEndedAt!: Date | null;
}

class MeConsentsDto {
  @ApiProperty() healthPrecautions!: boolean;
  @ApiProperty() wearableBand!: boolean;
  @ApiProperty() symptomReports!: boolean;
}

class MePrecautionDto {
  @ApiProperty({
    enum: PrecautionLevel,
    description:
      'Set by occupational health. `standard` = no extra precautions; `enhanced` and `high_priority` make the engine more cautious.',
  })
  level!: PrecautionLevel;
  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'When occupational health last set or approved it.',
  })
  setOn!: Date | null;
  @ApiProperty({
    description:
      'True after the worker changed their health answers, until occupational health reviews them.',
  })
  reviewRequested!: boolean;
  @ApiProperty({
    type: [String],
    description:
      'Plain-text instructions from occupational health, in English. Empty array when none.',
    example: ['Extra 10 min break each hour at level 3 and above'],
  })
  restrictions!: string[];
  @ApiProperty({ type: String, format: 'date', nullable: true })
  nextReviewOn!: string | null;
}

export class MeResponseDto {
  @ApiProperty({ type: MeAccountDto }) user!: MeAccountDto;
  @ApiProperty({
    type: MeWorkerDto,
    nullable: true,
    description: 'Null for supervisors, occupational health and admins.',
  })
  worker!: MeWorkerDto | null;
  @ApiProperty({
    type: MeSiteDto,
    nullable: true,
    description:
      "The site of today's shift, else the crew's site. Null for non-workers.",
  })
  site!: MeSiteDto | null;
  @ApiProperty({
    type: MeAssignmentDto,
    nullable: true,
    description:
      'The shift happening now, else the next one starting within 24 hours. Null when there is none.',
  })
  assignment!: MeAssignmentDto | null;
  @ApiProperty({
    type: MeConsentsDto,
    nullable: true,
    description: 'Null for non-workers.',
  })
  consents!: MeConsentsDto | null;
  @ApiProperty({
    type: MePrecautionDto,
    nullable: true,
    description:
      "The worker's own precaution summary. Null when the worker has no health profile (no precautions recorded), and for non-workers. Never shown to supervisors.",
  })
  precaution!: MePrecautionDto | null;
}
