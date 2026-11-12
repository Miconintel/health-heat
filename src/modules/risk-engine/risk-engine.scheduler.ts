import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RiskEngineService } from './risk-engine.service';

/**
 * Off unless WEATHER_POLLING_ENABLED=true.
 * - Weather: hourly (Open-Meteo data is hourly).
 * - Assessments: every 15 min, because minutes exposed keep growing (engine guide §7).
 */
@Injectable()
export class RiskEngineScheduler {
  private readonly logger = new Logger(RiskEngineScheduler.name);
  private running = false;

  constructor(
    private readonly risk: RiskEngineService,
    private readonly config: ConfigService,
  ) {}

  private get enabled() {
    return !!this.config.get<boolean>('WEATHER_POLLING_ENABLED');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async refreshWeather() {
    if (!this.enabled) return;
    await this.risk
      .refreshWeatherForAllSites()
      .catch((err: Error) =>
        this.logger.warn(`Weather refresh failed: ${err.message}`),
      );
  }

  @Cron('0 */15 * * * *')
  async reassess() {
    if (!this.enabled || this.running) return;
    this.running = true;
    try {
      await this.risk.runForAllSites();
    } finally {
      this.running = false;
    }
  }
}
