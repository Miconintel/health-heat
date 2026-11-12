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
import { ShiftEvent, WorkloadService } from './workload.service';
import {
  CreateActivityCategoryDto,
  CreateAssignmentDto,
} from './dto/workload.dto';

@ApiTags('workload')
@ApiBearerAuth()
@Controller()
export class WorkloadController {
  constructor(private readonly workload: WorkloadService) {}

  /** Activity categories and their default workload */
  @Get('activity-categories')
  categories() {
    return this.workload.listCategories();
  }

  /** Add an activity category */
  @Post('activity-categories')
  @Roles(Role.ADMIN)
  createCategory(@Body() dto: CreateActivityCategoryDto) {
    return this.workload.createCategory(dto);
  }

  /** A worker's work assignments (shifts) */
  @Get('workers/:workerId/assignments')
  list(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.workload.listForWorker(user, workerId);
  }

  /** Assign a worker to a site, activity and shift (with planned breaks) */
  @Post('workers/:workerId/assignments')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  create(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.workload.createAssignment(user, workerId, dto);
  }

  /** Start shift (the engine counts exposure from here) */
  @Post('assignments/:assignmentId/clock-in')
  @Roles(Role.WORKER, Role.SUPERVISOR)
  clockIn(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId', ParseUUIDPipe) id: string,
  ) {
    return this.event(user, id, 'clock-in');
  }

  /** Start a rest break in shade */
  @Post('assignments/:assignmentId/break/start')
  @Roles(Role.WORKER, Role.SUPERVISOR)
  breakStart(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId', ParseUUIDPipe) id: string,
  ) {
    return this.event(user, id, 'break-start');
  }

  /** End the rest break */
  @Post('assignments/:assignmentId/break/end')
  @Roles(Role.WORKER, Role.SUPERVISOR)
  breakEnd(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId', ParseUUIDPipe) id: string,
  ) {
    return this.event(user, id, 'break-end');
  }

  /** End shift */
  @Post('assignments/:assignmentId/clock-out')
  @Roles(Role.WORKER, Role.SUPERVISOR)
  clockOut(
    @CurrentUser() user: AuthUser,
    @Param('assignmentId', ParseUUIDPipe) id: string,
  ) {
    return this.event(user, id, 'clock-out');
  }

  private event(user: AuthUser, id: string, event: ShiftEvent) {
    return this.workload.recordShiftEvent(user, id, event);
  }
}
