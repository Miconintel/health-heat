import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { EnvironmentService } from './environment.service';
import { SensorReadingDto } from './dto/environment.dto';

@ApiTags('environment')
@ApiBearerAuth()
@Controller('sites/:siteId/environment')
export class EnvironmentController {
  constructor(
    private readonly env: EnvironmentService,
    private readonly orgs: OrganizationsService,
  ) {}

  /** Current weather and WBGT at the site, plus the forecast */
  @Get()
  conditions(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.env.siteConditions(user.organizationId, siteId);
  }

  /** Fetch fresh weather now and recalculate WBGT */
  @Post('refresh')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  async refresh(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    const site = await this.orgs.getSite(user.organizationId, siteId);
    const rows = await this.env.refreshSite(site);
    return { stored: rows.length };
  }

  /** Record a measured WBGT reading from an on-site sensor (preferred over estimates for 30 minutes) */
  @Post('sensor-readings')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  sensor(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: SensorReadingDto,
  ) {
    return this.env.recordSensorReading(user.organizationId, siteId, dto);
  }
}
