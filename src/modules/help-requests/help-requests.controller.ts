import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { HelpRequestsService } from './help-requests.service';
import { SymptomReportDto } from './dto/help-request.dto';

@ApiTags('help-requests')
@ApiBearerAuth()
@Controller()
export class HelpRequestsController {
  constructor(private readonly help: HelpRequestsService) {}

  /** Report symptoms. Always alerts the supervisor; details go to OH only with consent. */
  @Post('me/symptom-reports')
  @Roles(Role.WORKER)
  report(@CurrentUser() user: AuthUser, @Body() dto: SymptomReportDto) {
    return this.help.report(user, dto);
  }

  /** "Alert first aider" emergency button. */
  @Post('me/first-aid-alert')
  @Roles(Role.WORKER)
  @HttpCode(201)
  alert(@CurrentUser() user: AuthUser) {
    return this.help.firstAidAlert(user);
  }

  /** The worker's own help requests and their status */
  @Get('me/help-requests')
  @Roles(Role.WORKER)
  mine(@CurrentUser() user: AuthUser) {
    return this.help.mine(user);
  }

  /** Supervisor "Needs attention": who needs help, never what the symptoms are. */
  @Get('sites/:siteId/help-requests')
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'includeResolved', required: false, type: Boolean })
  forSite(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('includeResolved', new ParseBoolPipe({ optional: true }))
    includeResolved?: boolean,
  ) {
    return this.help.forSite(user, siteId, { includeResolved });
  }

  /** "I am on my way". */
  @Post('help-requests/:id/acknowledge')
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @HttpCode(200)
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.help.acknowledge(user, id);
  }

  /** "Mark resolved". */
  @Post('help-requests/:id/resolve')
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @HttpCode(200)
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.help.resolve(user, id);
  }

  /** Occupational health: symptom details (shared reports only). Audited. */
  @Get('symptom-reports')
  @Roles(Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'workerId', required: false })
  forOh(
    @CurrentUser() user: AuthUser,
    @Query('workerId', new ParseUUIDPipe({ optional: true })) workerId?: string,
  ) {
    return this.help.forOccupationalHealth(user, workerId);
  }
}
