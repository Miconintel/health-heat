import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EngineClient } from './engine.client';

/** Pings the engine's /health so Render's free plan doesn't put it to sleep. */
@Injectable()
export class EngineKeepAlive {
  constructor(
    private readonly engine: EngineClient,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async ping() {
    if (this.config.get<boolean>('ENGINE_KEEPALIVE'))
      await this.engine.warmUp();
  }
}
