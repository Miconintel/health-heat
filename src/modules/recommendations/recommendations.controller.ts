import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth()
@Controller()
export class RecommendationsController {
  constructor(
    private readonly recs: RecommendationsService,
    private readonly orgs: OrganizationsService,
  ) {}

  /** Supervisor recommendations for a site (health-free) */
  @Get('sites/:siteId/recommendations')
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'crewId', required: false })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  async forSite(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('crewId', new ParseUUIDPipe({ optional: true })) crewId?: string,
    @Query('activeOnly', new ParseBoolPipe({ optional: true }))
    activeOnly?: boolean,
  ) {
    await this.orgs.getSite(user.organizationId, siteId);
    return this.recs.listForSite(user.organizationId, siteId, {
      crewId,
      activeOnly,
    });
  }

  /** The worker's own recommendations (from the engine, in their language) */
  @Get('me/recommendations')
  @Roles(Role.WORKER)
  mine(@CurrentUser() user: AuthUser) {
    if (!user.workerId) throw new ForbiddenException();
    return this.recs.listForWorker(user.organizationId, user.workerId);
  }
}
