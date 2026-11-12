import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkersModule } from '../workers/workers.module';
import { RiskEngineModule } from '../risk-engine/risk-engine.module';
import { PpeItem } from './entities/ppe-item.entity';
import { WorkerPpe } from './entities/worker-ppe.entity';
import { PpeService } from './ppe.service';
import { PpeController } from './ppe.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PpeItem, WorkerPpe]),
    WorkersModule,
    RiskEngineModule,
  ],
  providers: [PpeService],
  controllers: [PpeController],
})
export class PpeModule {}
