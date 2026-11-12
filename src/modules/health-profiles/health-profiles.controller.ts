import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { HealthProfilesService } from './health-profiles.service';
import { DataExportService } from './data-export.service';
import {
  ApproveHealthProfileDto,
  RecordConsentDto,
  UpdateOwnHealthDataDto,
} from './dto/health-profile.dto';

@ApiTags('health-profiles')
@ApiBearerAuth()
@Roles(Role.WORKER, Role.OCCUPATIONAL_HEALTH) // supervisors and admins never reach these routes
@Controller()
export class HealthProfilesController {
  constructor(
    private readonly profiles: HealthProfilesService,
    private readonly exporter: DataExportService,
  ) {}

  /** Health profiles waiting for an occupational health review */
  @Get('health-profiles/pending-review')
  @Roles(Role.OCCUPATIONAL_HEALTH)
  pending(@CurrentUser() user: AuthUser) {
    return this.profiles.listPendingReview(user);
  }

  /** Get a worker's health profile (the worker or occupational health only; audited) */
  @Get('workers/:workerId/health-profile')
  get(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.profiles.get(user, workerId);
  }

  /** Save the worker's health answers (codes; needs the "Health precautions" consent). Also sets the acclimatisation start date */
  @Put('workers/:workerId/health-profile')
  update(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: UpdateOwnHealthDataDto,
  ) {
    return this.profiles.updateOwnData(user, workerId, dto);
  }

  /** Occupational health: set the precaution level, restrictions and next review date */
  @Post('workers/:workerId/health-profile/approve')
  @Roles(Role.OCCUPATIONAL_HEALTH)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: ApproveHealthProfileDto,
  ) {
    return this.profiles.approve(user, workerId, dto);
  }

  /** Worker asks occupational health to review their profile */
  @Post('workers/:workerId/health-profile/request-review')
  @Roles(Role.WORKER)
  requestReview(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.profiles.requestReview(user, workerId);
  }

  /** Delete the worker's health information (profile, symptom details, band readings) */
  @Delete('workers/:workerId/health-profile')
  erase(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.profiles.erase(user, workerId);
  }

  /** A worker's consent history */
  @Get('workers/:workerId/consents')
  consents(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.profiles.listConsents(user, workerId);
  }

  /** Record one consent choice (the worker only). PUT /me/consents sets all switches at once */
  @Post('workers/:workerId/consents')
  @Roles(Role.WORKER)
  recordConsent(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: RecordConsentDto,
  ) {
    return this.profiles.recordConsent(user, workerId, dto);
  }

  /** Download everything the server holds about the worker (GDPR) */
  @Get('workers/:workerId/data-export')
  @Roles(Role.WORKER)
  export(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.exporter.export(user, workerId);
  }
}
