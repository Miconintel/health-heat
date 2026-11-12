import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from '../workers/entities/worker.entity';
import { Crew } from '../organizations/entities/crew.entity';
import { Site } from '../organizations/entities/site.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { HealthProfile } from '../health-profiles/entities/health-profile.entity';
import { User } from '../users/entities/user.entity';
import { HealthProfilesModule } from '../health-profiles/health-profiles.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { MeService } from './me.service';
import { WaterLog } from './entities/water-log.entity';
import { DeviceStatus } from './entities/device-status.entity';
import { MeController } from './me.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WaterLog,
      DeviceStatus,
      User,
      Worker,
      Crew,
      Site,
      WorkAssignment,
      HealthProfile,
    ]),
    HealthProfilesModule,
    RiskEngineModule,
  ],
  providers: [MeService],
  controllers: [MeController],
})
export class MeModule {}
