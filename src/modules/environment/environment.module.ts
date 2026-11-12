import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationsModule } from '../organizations/organizations.module';
import { EnvironmentalReading } from './entities/environmental-reading.entity';
import { EnvironmentService } from './environment.service';
import { EnvironmentController } from './environment.controller';
import { WeatherProvider } from './providers/weather-provider';
import { OpenMeteoProvider } from './providers/open-meteo.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([EnvironmentalReading]),
    OrganizationsModule,
  ],
  providers: [
    EnvironmentService,
    { provide: WeatherProvider, useClass: OpenMeteoProvider },
  ],
  controllers: [EnvironmentController],
  exports: [EnvironmentService],
})
export class EnvironmentModule {}
