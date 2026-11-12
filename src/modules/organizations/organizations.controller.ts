import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Roles } from '../../common/decorators';
import { Role } from '../../common/enums';
import { OrganizationsService } from './organizations.service';
import {
  CreateCrewDto,
  CreateSiteDto,
  UpdateSiteDto,
} from './dto/organization.dto';

@ApiTags('sites')
@ApiBearerAuth()
@Controller('sites')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  /** List sites */
  @Get()
  listSites(@CurrentUser() user: AuthUser) {
    return this.orgs.listSites(user.organizationId);
  }

  /** Create a site */
  @Post()
  @Roles(Role.ADMIN)
  createSite(@CurrentUser() user: AuthUser, @Body() dto: CreateSiteDto) {
    return this.orgs.createSite(user.organizationId, dto);
  }

  /** Update a site (name, location, timezone, shifts, emergency number) */
  @Patch(':siteId')
  @Roles(Role.ADMIN)
  updateSite(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.orgs.updateSite(user.organizationId, siteId, dto);
  }

  /** List crews at a site (IDs and names) */
  @Get(':siteId/crews')
  @Roles(Role.ADMIN, Role.SUPERVISOR, Role.OCCUPATIONAL_HEALTH)
  listCrews(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
  ) {
    return this.orgs.listCrews(user.organizationId, siteId);
  }

  /** Create a crew at a site */
  @Post(':siteId/crews')
  @Roles(Role.ADMIN)
  createCrew(
    @CurrentUser() user: AuthUser,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: CreateCrewDto,
  ) {
    return this.orgs.createCrew(user.organizationId, siteId, dto);
  }
}
