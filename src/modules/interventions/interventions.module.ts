import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../recommendations/entities/recommendation.entity';
import { Intervention } from './entities/intervention.entity';
import { InterventionsService } from './interventions.service';
import { InterventionsController } from './interventions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Intervention, Recommendation])],
  providers: [InterventionsService],
  controllers: [InterventionsController],
})
export class InterventionsModule {}
