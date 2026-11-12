import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { WorkersModule } from '../workers/workers.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { ActivityCategory } from './entities/activity-category.entity';
import { WorkAssignment } from './entities/work-assignment.entity';
import { WorkEvent } from './entities/work-event.entity';
import { WorkloadService } from './workload.service';
import { WorkloadController } from './workload.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityCategory, WorkAssignment, WorkEvent]),
    WorkersModule,
    OrganizationsModule,
    RiskEngineModule,
  ],
  providers: [WorkloadService],
  controllers: [WorkloadController],
})
export class WorkloadModule {}
