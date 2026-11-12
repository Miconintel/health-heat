import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { PpeService } from './ppe.service';
import { AssignPpeDto, CreatePpeItemDto } from './dto/ppe.dto';

@ApiTags('ppe')
@ApiBearerAuth()
@Controller()
export class PpeController {
  constructor(private readonly ppe: PpeService) {}

  /** PPE catalogue with each item's engine clothing class */
  @Get('ppe-items')
  catalogue(@CurrentUser() user: AuthUser) {
    return this.ppe.listCatalogue(user.organizationId);
  }

  /** Add a PPE item */
  @Post('ppe-items')
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePpeItemDto) {
    return this.ppe.createItem(user.organizationId, dto);
  }

  /** PPE a worker wears */
  @Get('workers/:workerId/ppe')
  forWorker(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
  ) {
    return this.ppe.listForWorker(user, workerId);
  }

  /** Set the PPE a worker wears (reassesses the worker) */
  @Put('workers/:workerId/ppe')
  @Roles(Role.ADMIN, Role.SUPERVISOR)
  assign(
    @CurrentUser() user: AuthUser,
    @Param('workerId', ParseUUIDPipe) workerId: string,
    @Body() dto: AssignPpeDto,
  ) {
    return this.ppe.assign(user, workerId, dto);
  }
}
