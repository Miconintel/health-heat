import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthProfilesModule } from '../health-profiles/health-profiles.module';
import { WorkersModule } from '../workers/workers.module';
import { WearableDevice } from './entities/wearable-device.entity';
import { WearableReading } from './entities/wearable-reading.entity';
import { WearablesService } from './wearables.service';
import { WearablesController } from './wearables.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WearableDevice, WearableReading]),
    HealthProfilesModule,
    WorkersModule,
  ],
  providers: [WearablesService],
  controllers: [WearablesController],
  exports: [WearablesService],
})
export class WearablesModule {}
