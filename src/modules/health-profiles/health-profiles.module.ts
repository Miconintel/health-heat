import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkersModule } from '../workers/workers.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { HealthProfile } from './entities/health-profile.entity';
import { Consent } from './entities/consent.entity';
import { HealthProfilesService } from './health-profiles.service';
import { HealthRetentionJob } from './health-retention.job';
import { Worker } from '../workers/entities/worker.entity';
import { DataExportService } from './data-export.service';
import { HealthProfilesController } from './health-profiles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([HealthProfile, Consent, Worker]),
    WorkersModule,
    RiskEngineModule,
  ],
  providers: [HealthProfilesService, DataExportService, HealthRetentionJob],
  exports: [HealthProfilesService],
  controllers: [HealthProfilesController],
})
export class HealthProfilesModule {}
