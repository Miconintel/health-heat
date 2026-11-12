import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import {
  PrecautionLevel,
  RiskLevel,
  WorkEnvironment,
  WorkloadLevel,
} from '../../common/enums';
import { EngineClient } from '../ai-engine/engine.client';
import { EnvironmentService } from '../environment/environment.service';
import { Site } from '../organizations/entities/site.entity';
import {
  buildAssessRequest,
  buildForecastRequest,
  storedForecast,
  WorkerContext,
} from './engine-mapping';
import { SiteHourlyLevel } from './entities/site-hourly-level.entity';

const HOUR = 3_600_000;
const FORECAST_SPAN_H = 12;
const floorHour = (d: Date) => new Date(Math.floor(d.getTime() / HOUR) * HOUR);

/** The reference worker the site level describes. */
export function referenceWorker(siteId: string, now: Date): WorkerContext {
  return {
    workerId: 'site-reference',
    siteId,
    acclimatized: true,
    preferredLanguage: 'en',
    workload: WorkloadLevel.MODERATE,
    workEnvironment: WorkEnvironment.DIRECT_SUN,
    ppe: 'standard',
    addons: { hood: false, hoodSupported: false },
    precautionLevel: PrecautionLevel.STANDARD,
    // A fresh worker: the level reflects the environment, not accumulated exposure.
    shift: {
      startsAt: now,
      endsAt: new Date(now.getTime() + (FORECAST_SPAN_H + 1) * HOUR),
      plannedBreaks: [],
      clockedInAt: now,
      onBreakSince: null,
      lastBreakEndedAt: null,
    },
  };
}

@Injectable()
export class SiteHeatService {
  private readonly logger = new Logger(SiteHeatService.name);

  constructor(
    @InjectRepository(SiteHourlyLevel)
    private readonly hours: Repository<SiteHourlyLevel>,
    private readonly engine: EngineClient,
    private readonly env: EnvironmentService,
  ) {}

  /** Assess the reference worker now and for the next hours; record per hour. Best-effort. */
  async update(site: Site, now = new Date()): Promise<void> {
    try {
      const ctx = referenceWorker(site.id, now);
      const [readings, forecastRows] = await Promise.all([
        this.env.readingsForEngine(site.id, now),
        this.env.forecast(
          site.id,
          now,
          new Date(now.getTime() + FORECAST_SPAN_H * HOUR),
        ),
      ]);
      const current = await this.engine.assess(
        buildAssessRequest(ctx, readings.current, readings.lastKnown, now),
      );
      const req = buildForecastRequest(ctx, forecastRows, now);
      const forecast = req
        ? await this.engine.forecast(req).catch(() => null)
        : null;
      const stored = storedForecast(forecast);

      const thisHour = floorHour(now);
      const hourKeys = [
        thisHour,
        ...stored.hours.map((h) => floorHour(new Date(h.at))),
      ];
      const existing = new Map(
        (
          await this.hours.findBy({ siteId: site.id, hourStart: In(hourKeys) })
        ).map((r) => [r.hourStart.getTime(), r]),
      );
      const row = (hourStart: Date) =>
        existing.get(hourStart.getTime()) ??
        this.hours.create({ siteId: site.id, hourStart });

      const toSave: SiteHourlyLevel[] = [];
      const obs = row(thisHour);
      obs.observedLevel = current.level;
      obs.observedWbgtC = current.wbgt_c;
      obs.observedAt = now;
      toSave.push(obs);
      existing.set(thisHour.getTime(), obs);

      for (const h of stored.hours) {
        const r = row(floorHour(new Date(h.at)));
        r.firstForecastLevel ??= h.level;
        r.firstForecastAt ??= now;
        const warns =
          h.level >= RiskLevel.HIGH || (h.possibleLevel ?? 0) >= RiskLevel.HIGH;
        if (warns) r.firstWarningAt ??= now;
        r.latestForecastLevel = h.level;
        r.latestPossibleLevel = h.possibleLevel;
        r.latestConfidence = h.confidence;
        r.latestForecastAt = now;
        if (!toSave.includes(r)) toSave.push(r);
        existing.set(r.hourStart.getTime(), r);
      }
      await this.hours.save(toSave);
    } catch (err) {
      // No fallback here: the site strip simply shows no level for the hour.
      this.logger.warn(
        `Site level update failed for ${site.id}: ${(err as Error).message}`,
      );
    }
  }

  /** Hourly rows between two instants (inclusive start). */
  range(siteId: string, from: Date, to: Date) {
    return this.hours.find({
      where: { siteId, hourStart: Between(floorHour(from), to) },
      order: { hourStart: 'ASC' },
    });
  }
}

/** The level to show for an hour: observed if the hour has passed or is now, else forecast. */
export function displayLevel(r: SiteHourlyLevel, now: Date) {
  const isPastOrNow = r.hourStart.getTime() <= floorHour(now).getTime();
  const level = isPastOrNow
    ? (r.observedLevel ?? r.latestForecastLevel)
    : r.latestForecastLevel;
  const possible =
    !isPastOrNow &&
    r.latestPossibleLevel &&
    level &&
    r.latestPossibleLevel > level
      ? r.latestPossibleLevel
      : null;
  return {
    hourStart: r.hourStart,
    level,
    possibleLevel: possible,
    observed: isPastOrNow && r.observedLevel !== null,
    now: r.hourStart.getTime() === floorHour(now).getTime(),
    confidence: isPastOrNow ? null : r.latestConfidence,
  };
}
