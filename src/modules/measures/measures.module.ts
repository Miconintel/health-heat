import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from '../workers/entities/worker.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { WorkEvent } from '../workload/entities/work-event.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { SupervisorModule } from '../supervisor/supervisor.module';
import { MeasuresService } from './measures.service';
import { MeasuresController } from './measures.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Worker, WorkAssignment, WorkEvent, HelpRequest]),
    OrganizationsModule,
    RiskEngineModule,
    SupervisorModule,
  ],
  providers: [MeasuresService],
  controllers: [MeasuresController],
})
export class MeasuresModule {}
