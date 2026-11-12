import {
  Controller,
  Get,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { AuditService } from './audit.service';

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Audit log: who accessed sensitive data (filter by worker) */
  @Get()
  @Roles(Role.ADMIN, Role.OCCUPATIONAL_HEALTH)
  @ApiQuery({ name: 'workerId', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser() user: AuthUser,
    @Query('workerId', new ParseUUIDPipe({ optional: true })) workerId?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.audit.list(user.organizationId, {
      subjectWorkerId: workerId,
      limit,
    });
  }
}
