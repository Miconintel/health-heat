import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { MeasuresPeriod, MeasuresService } from './measures.service';

@ApiTags('measures')
@ApiBearerAuth()
@Controller('sites/:siteId/measures')
export class MeasuresController {
  constructor(private readonly measures: MeasuresService) {}

  /** Safety and productivity measures. Crew-level only; some figures are provisional (D6). */
  @Get()
  @Roles(Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH, Role.ADMIN)
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', 'season'] })
  get(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query('period') period?: string,
  ) {
    const p: MeasuresPeriod =
      period === '7d' || period === 'season' ? period : '30d';
    return this.measures.forSite(user, siteId, p);
  }
}
