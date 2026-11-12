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
import { InterventionsService } from './interventions.service';
import { RecordInterventionDto } from './dto/intervention.dto';

@ApiTags('interventions')
@ApiBearerAuth()
@Controller('recommendations/:recommendationId/interventions')
export class InterventionsController {
  constructor(private readonly interventions: InterventionsService) {}

  /** What has been done about a recommendation */
  @Get()
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH, Role.WORKER)
  list(
    @CurrentUser() user: AuthUser,
    @Param('recommendationId', ParseUUIDPipe) id: string,
  ) {
    return this.interventions.list(user, id);
  }

  /** Record an action: acknowledged, implemented, reassigned or dismissed (workers can only acknowledge their own) */
  @Post()
  @Roles(Role.SUPERVISOR, Role.WORKER)
  record(
    @CurrentUser() user: AuthUser,
    @Param('recommendationId', ParseUUIDPipe) id: string,
    @Body() dto: RecordInterventionDto,
  ) {
    return this.interventions.record(user, id, dto);
  }
}
