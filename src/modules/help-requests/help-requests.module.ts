import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from '../workers/entities/worker.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { HealthProfilesModule } from '../health-profiles/health-profiles.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { HelpRequest } from './entities/help-request.entity';
import { HelpRequestsService } from './help-requests.service';
import { HelpRequestsController } from './help-requests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HelpRequest, Worker, Crew, WorkAssignment]),
    HealthProfilesModule,
    OrganizationsModule,
  ],
  providers: [HelpRequestsService],
  controllers: [HelpRequestsController],
  exports: [HelpRequestsService],
})
export class HelpRequestsModule {}
