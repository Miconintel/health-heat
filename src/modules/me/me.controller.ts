import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { MeService } from './me.service';
import {
  ConsentChoicesDto,
  LogWaterDto,
  UpdatePreferencesDto,
  HeartbeatDto,
} from './dto/me.dto';
import { MeResponseDto } from './dto/me-response.dto';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** The signed-in person: account, and for workers their crew, site, shift, consents and precaution summary. */
  @Get()
  @ApiOkResponse({ type: MeResponseDto })
  get(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    return this.me.get(user);
  }

  /** Worker's own language and "read warnings aloud". */
  @Patch('preferences')
  @Roles(Role.WORKER)
  preferences(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdatePreferencesDto,
  ) {
    return this.me.updatePreferences(user, dto);
  }

  /** All consent switches in one call (consent screen and My data). */
  @Put('consents')
  @Roles(Role.WORKER)
  consents(@CurrentUser() user: AuthUser, @Body() dto: ConsentChoicesDto) {
    return this.me.updateConsents(user, dto);
  }

  /** Water tracker: cups today (resets at local midnight). */
  @Get('water')
  @Roles(Role.WORKER)
  water(@CurrentUser() user: AuthUser) {
    return this.me.waterToday(user);
  }

  /** "+ Cup". */
  @Post('water')
  @Roles(Role.WORKER)
  logWater(@CurrentUser() user: AuthUser, @Body() dto: LogWaterDto) {
    return this.me.logWater(user, dto);
  }

  /** "Who looked at your data": other people's access, by role, grouped per day. */
  @Get('access-log')
  @Roles(Role.WORKER)
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Default 30, max 90',
  })
  accessLog(
    @CurrentUser() user: AuthUser,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.me.accessLog(user, Math.min(Math.max(days, 1), 90));
  }

  /** App heartbeat while open (every 5 min). A phone that goes quiet counts as High. */
  @Post('heartbeat')
  @Roles(Role.WORKER)
  @HttpCode(200)
  heartbeat(@CurrentUser() user: AuthUser, @Body() dto: HeartbeatDto) {
    return this.me.heartbeat(user, dto);
  }
}
