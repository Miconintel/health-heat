import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crew } from '../organizations/entities/crew.entity';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { ShiftPlan } from './entities/shift-plan.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShiftPlan,
      Crew,
      Worker,
      WorkAssignment,
      WorkerPpe,
      HealthProfile,
    ]),
    OrganizationsModule,
    RiskEngineModule,
  ],
  providers: [PlansService],
  controllers: [PlansController],
})
export class PlansModule {}
