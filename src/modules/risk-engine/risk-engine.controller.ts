import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { RiskEngineService } from './risk-engine.service';

@ApiTags('risk')
@ApiBearerAuth()
@Controller()
export class RiskEngineController {
  constructor(private readonly risk: RiskEngineService) {}

  /** Reassess every worker on shift at the site now (also refreshes weather if stale and the site heat level) */
  @Post('sites/:siteId/assessments/run')
  @Roles(Role.SUPERVISOR)
  run(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.risk.runForSite(user.organizationId, siteId);
  }

  /** Supervisor dashboard: levels and actions only, never reasons or precaution levels. */
  @Get('sites/:siteId/risk-overview')
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'crewId', required: false })
  overview(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('crewId', new ParseUUIDPipe({ optional: true })) crewId?: string,
  ) {
    return this.risk.siteOverview(user, siteId, { crewId });
  }

  /** Worker app: own risk with reasons and the saved forecast. */
  @Get('me/risk')
  @Roles(Role.WORKER)
  mine(@CurrentUser() user: AuthUser) {
    return this.risk.myRisk(user);
  }

  /** Occupational health: a worker's full risk view (audited). */
  @Get('workers/:workerId/risk')
  @Roles(Role.OCCUPATIONAL_HEALTH)
  workerDetail(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.risk.workerRiskDetail(user, workerId);
  }

  /** Every threshold and adjustment the engine uses, with its published source. */
  @Get('risk-rules')
  @Roles(Role.ADMIN, Role.OCCUPATIONAL_HEALTH)
  rules() {
    return this.risk.rules();
  }
}
