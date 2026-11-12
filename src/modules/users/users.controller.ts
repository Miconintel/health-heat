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
import { UsersService } from './users.service';
import { CreateUserDto, ResetPinDto } from './dto/create-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The signed-in account (use GET /me for the full worker profile) */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.users.findById(user.userId);
  }

  /** List login accounts in your organisation */
  @Get()
  @Roles(Role.ADMIN)
  list(@CurrentUser() user: AuthUser) {
    return this.users.list(user.organizationId);
  }

  /** Create a login account (workers default to their employee code as login ID) */
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user.organizationId, dto);
  }

  /** Admin sets a new PIN for a user (also clears a lockout). */
  @Put(':userId/pin')
  @Roles(Role.ADMIN)
  resetPin(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ResetPinDto,
  ) {
    return this.users.resetPin(user.organizationId, userId, dto.pin);
  }
}
