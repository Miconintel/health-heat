import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { validateEnv } from './config/env.validation';
import { typeormOptions } from './database/typeorm.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AuditModule } from './modules/audit/audit.module';
import { AiEngineModule } from './modules/ai-engine/ai-engine.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { WorkersModule } from './modules/workers/workers.module';
import { HealthProfilesModule } from './modules/health-profiles/health-profiles.module';
import { PpeModule } from './modules/ppe/ppe.module';
import { WorkloadModule } from './modules/workload/workload.module';
import { EnvironmentModule } from './modules/environment/environment.module';
import { RiskEngineModule } from './modules/risk-engine/risk-engine.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { InterventionsModule } from './modules/interventions/interventions.module';
import { HealthController } from './modules/health/health.controller';
import { MeModule } from './modules/me/me.module';
import { HelpRequestsModule } from './modules/help-requests/help-requests.module';
import { SupervisorModule } from './modules/supervisor/supervisor.module';
import { PlansModule } from './modules/plans/plans.module';
import { MeasuresModule } from './modules/measures/measures.module';
import { WearablesModule } from './modules/wearables/wearables.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({ useFactory: () => typeormOptions() }),
    ScheduleModule.forRoot(),
    AuditModule,
    AiEngineModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    WorkersModule,
    HealthProfilesModule,
    PpeModule,
    WorkloadModule,
    EnvironmentModule,
    RiskEngineModule,
    RecommendationsModule,
    InterventionsModule,
    MeModule,
    HelpRequestsModule,
    SupervisorModule,
    PlansModule,
    MeasuresModule,
    WearablesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
