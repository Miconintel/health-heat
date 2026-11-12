import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { WorkersService } from './workers.service';
import {
  CreateWorkerDto,
  SetAcclimatizationDto,
  UpdateWorkerDto,
} from './dto/worker.dto';

@ApiTags('workers')
@ApiBearerAuth()
@Controller('workers')
export class WorkersController {
  constructor(private readonly workers: WorkersService) {}

  /** List workers (no health data) */
  @Get()
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'crewId', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('crewId', new ParseUUIDPipe({ optional: true })) crewId?: string,
  ) {
    return this.workers.list(user.organizationId, { crewId });
  }

  /** Get a worker (workers can only get themselves) */
  @Get(':workerId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.workers.getAccessible(user, workerId);
  }

  /** Create a worker */
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkerDto) {
    return this.workers.create(user.organizationId, dto);
  }

  /** Update a worker (crew, language, active). Setting isActive false starts the 30-day health-data retention clock */
  @Patch(':workerId')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  update(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: UpdateWorkerDto,
  ) {
    return this.workers.update(user, workerId, dto);
  }

  /** Set or reset the acclimatisation start date (audited; earlier dates need a reason). */
  @Put(':workerId/acclimatization')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  setAcclimatization(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: SetAcclimatizationDto,
  ) {
    return this.workers.setAcclimatization(user, workerId, dto);
  }
}
