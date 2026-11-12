import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnvironmentModule } from '../environment/environment.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { Crew } from '../organizations/entities/crew.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { Worker } from '../workers/entities/worker.entity';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { SiteHourlyLevel } from './entities/site-hourly-level.entity';
import { ShiftPlan } from '../plans/entities/shift-plan.entity';
import { WearableReading } from '../wearables/entities/wearable-reading.entity';
import { WearableDevice } from '../wearables/entities/wearable-device.entity';
import { SiteHeatService } from './site-heat.service';
import { RiskEngineService } from './risk-engine.service';
import { RiskEngineController } from './risk-engine.controller';
import { RiskEngineScheduler } from './risk-engine.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RiskAssessment,
      SiteHourlyLevel,
      ShiftPlan,
      WearableReading,
      WearableDevice,
      WorkAssignment,
      Worker,
      WorkerPpe,
      HealthProfile,
      Crew,
    ]),
    EnvironmentModule,
    OrganizationsModule,
    RecommendationsModule,
  ],
  providers: [RiskEngineService, RiskEngineScheduler, SiteHeatService],
  controllers: [RiskEngineController],
  exports: [RiskEngineService, SiteHeatService],
})
export class RiskEngineModule {}
