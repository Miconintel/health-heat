import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { SupervisorService } from './supervisor.service';

@ApiTags('supervisor')
@ApiBearerAuth()
@Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
@Controller('sites/:siteId')
export class SupervisorController {
  constructor(private readonly supervisor: SupervisorService) {}

  /** Everything on the supervisor Today page in one call. */
  @Get('today')
  @ApiQuery({ name: 'crewId', required: false })
  @ApiQuery({
    name: 'activity',
    required: false,
    description: 'Activity code, e.g. excavation',
  })
  today(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('crewId', new ParseUUIDPipe({ optional: true })) crewId?: string,
    @Query('activity') activity?: string,
    @Query('shift') shift?: string,
  ) {
    return this.supervisor.today(user, siteId, { crewId, activity, shift });
  }

  /** Crews table on its own. */
  @Get('crews-summary')
  @ApiQuery({ name: 'crewId', required: false })
  @ApiQuery({ name: 'activity', required: false })
  crews(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('crewId', new ParseUUIDPipe({ optional: true })) crewId?: string,
    @Query('activity') activity?: string,
  ) {
    return this.supervisor.crewsSummary(
      user,
      siteId,
      { crewId, activity },
      new Date(),
    );
  }

  /** "Last N days" chart (default 7, max 31). */
  @Get('history')
  @ApiQuery({ name: 'days', required: false })
  history(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days: number,
  ) {
    return this.supervisor.history(
      user,
      siteId,
      Math.min(Math.max(days, 1), 31),
    );
  }
}
