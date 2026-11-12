import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { WearablesService } from './wearables.service';
import { BandReadingsDto, PairBandDto } from './dto/wearable.dto';

const clampHours = (h: number) => Math.min(Math.max(h, 1), 24 * 7);

@ApiTags('wearables')
@ApiBearerAuth()
@Controller()
export class WearablesController {
  constructor(private readonly wearables: WearablesService) {}

  /** Band status for the worker app ("Your band" data source, My data). */
  @Get('me/wearable')
  @Roles(Role.WORKER)
  status(@CurrentUser() user: AuthUser) {
    return this.wearables.status(user);
  }

  /** Pair a band (needs the "Wearable band" consent). */
  @Put('me/wearable')
  @Roles(Role.WORKER)
  pair(@CurrentUser() user: AuthUser, @Body() dto: PairBandDto) {
    return this.wearables.pair(user, dto);
  }

  /** Unpair and delete band readings. */
  @Delete('me/wearable')
  @Roles(Role.WORKER)
  unpair(@CurrentUser() user: AuthUser) {
    return this.wearables.unpair(user);
  }

  /** Batch of band samples relayed by the phone. */
  @Post('me/wearable/readings')
  @Roles(Role.WORKER)
  ingest(@CurrentUser() user: AuthUser, @Body() dto: BandReadingsDto) {
    return this.wearables.ingest(user, dto);
  }

  /** The worker's own band readings and the summary sent to the engine */
  @Get('me/wearable/readings')
  @Roles(Role.WORKER)
  @ApiQuery({ name: 'hours', required: false })
  mine(
    @CurrentUser() user: AuthUser,
    @Query('hours', new DefaultValuePipe(4), ParseIntPipe) hours: number,
  ) {
    return this.wearables.mine(user, clampHours(hours));
  }

  /** Occupational health only; audited. Supervisors never see band data. */
  @Get('workers/:workerId/wearable/readings')
  @Roles(Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'hours', required: false })
  forWorker(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Query('hours', new DefaultValuePipe(4), ParseIntPipe) hours: number,
  ) {
    return this.wearables.forWorker(user, workerId, clampHours(hours));
  }
}
