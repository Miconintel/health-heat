import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Crew } from '../organizations/entities/crew.entity';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { WorkEvent } from '../workload/entities/work-event.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { DeviceStatus } from '../me/entities/device-status.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { Recommendation } from '../recommendations/entities/recommendation.entity';
import { Intervention } from '../interventions/entities/intervention.entity';
import { RiskAssessment } from '../risk-engine/entities/risk-assessment.entity';
import { WearableDevice } from '../wearables/entities/wearable-device.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { EnvironmentModule } from '../environment/environment.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { SupervisorService } from './supervisor.service';
import { SupervisorController } from './supervisor.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Crew,
      Worker,
      WorkAssignment,
      WorkEvent,
      WorkerPpe,
      DeviceStatus,
      HelpRequest,
      Recommendation,
      Intervention,
      RiskAssessment,
      WearableDevice,
    ]),
    OrganizationsModule,
    EnvironmentModule,
    RiskEngineModule,
  ],
  providers: [SupervisorService],
  controllers: [SupervisorController],
  exports: [SupervisorService],
})
export class SupervisorModule {}
