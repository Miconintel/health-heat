import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Site } from './entities/site.entity';
import { Crew } from './entities/crew.entity';
import {
  CreateCrewDto,
  CreateSiteDto,
  UpdateSiteDto,
} from './dto/organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(Crew) private readonly crews: Repository<Crew>,
  ) {}

  listSites(organizationId: string) {
    return this.sites.find({
      where: { organizationId },
      order: { name: 'ASC' },
    });
  }

  async getSite(organizationId: string, siteId: string) {
    const site = await this.sites.findOneBy({ id: siteId, organizationId });
    if (!site) throw new NotFoundException('Site not found');
    return site;
  }

  createSite(organizationId: string, dto: CreateSiteDto) {
    return this.sites.save(this.sites.create({ ...dto, organizationId }));
  }

  async updateSite(organizationId: string, siteId: string, dto: UpdateSiteDto) {
    const site = await this.getSite(organizationId, siteId);
    Object.assign(site, dto);
    return this.sites.save(site);
  }

  async listCrews(organizationId: string, siteId: string) {
    await this.getSite(organizationId, siteId);
    return this.crews.find({
      where: { organizationId, siteId },
      order: { name: 'ASC' },
    });
  }

  async createCrew(organizationId: string, siteId: string, dto: CreateCrewDto) {
    await this.getSite(organizationId, siteId);
    return this.crews.save(
      this.crews.create({
        ...dto,
        supervisorUserId: dto.supervisorUserId ?? null,
        organizationId,
        siteId,
      }),
    );
  }

  async getCrew(organizationId: string, crewId: string) {
    const crew = await this.crews.findOneBy({ id: crewId, organizationId });
    if (!crew) throw new NotFoundException('Crew not found');
    return crew;
  }
}
