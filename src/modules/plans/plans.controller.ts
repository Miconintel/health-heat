import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { PlansService } from './plans.service';
import { SavePlanDto, SendPlanDto } from './dto/plan.dto';

@ApiTags('shift-plan')
@ApiBearerAuth()
@Controller('sites/:siteId/plan')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Current and suggested plans, site heat per hour, too-hot evaluation. */
  @Get()
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Site-local YYYY-MM-DD; default today',
  })
  get(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('date') date?: string,
  ) {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = undefined;
    return this.plans.get(user, siteId, date);
  }

  /** Edit mode: save crew tasks as a draft. */
  @Put()
  @Roles(Role.SUPERVISOR)
  save(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: SavePlanDto,
  ) {
    return this.plans.save(user, siteId, dto);
  }

  /** "Send to crews": apply the current or suggested plan. */
  @Post('send')
  @Roles(Role.SUPERVISOR)
  @HttpCode(200)
  send(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: SendPlanDto,
  ) {
    return this.plans.send(user, siteId, dto);
  }
}
