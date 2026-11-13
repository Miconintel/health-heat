import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  IsNull,
  LessThan,
  LessThanOrEqual,
  MoreThan,
  MoreThanOrEqual,
  Not,
  Repository,
} from 'typeorm';
import { Confidence, ReadingSource, WbgtMethod } from '../../common/enums';
import { OrganizationsService } from '../organizations/organizations.service';
import { Site } from '../organizations/entities/site.entity';
import { EnvironmentalReading } from './entities/environmental-reading.entity';
import {
  WeatherObservation,
  WeatherProvider,
} from './providers/weather-provider';
import { EngineClient } from '../ai-engine/engine.client';
import { buildWbgtRequest, matchWbgt } from './wbgt/engine-wbgt';
import { detectHazards } from './hazards';
import { SensorReadingDto } from './dto/environment.dto';

/**
 * 24 hours (as in the engine guide), so one successful fetch covers a whole day: if
 * Open-Meteo later refuses (429 from Render's shared address), the forecast for the
 * current hour still gives a heat value. See currentConditions.
 */
const FORECAST_HOURS = 24;
const HOUR_MS = 60 * 60_000;
const SENSOR_MAX_AGE_MS = 30 * 60_000;
const WEATHER_MAX_AGE_MS = 2 * 60 * 60_000;

@Injectable()
export class EnvironmentService {
  private readonly logger = new Logger(EnvironmentService.name);

  constructor(
    @InjectRepository(EnvironmentalReading)
    private readonly readings: Repository<EnvironmentalReading>,
    private readonly weather: WeatherProvider,
    private readonly engine: EngineClient,
    private readonly orgs: OrganizationsService,
  ) {}

  /**
   * Pull current + forecast weather, turn it into WBGT, and replace this site's
   * future forecast rows.
   *
   * WBGT comes only from the engine's POST /v1/wbgt (Liljegren), one call per site.
   * Its `wbgt_c` is full-sun WBGT; there is no shade value, so it is used for every worker
   * (stored as wbgtSunC, wbgtShadeC left null). A null `wbgt_c` is stored as null and
   * reaches the engine as null. If the call fails the whole refresh fails and existing
   * readings are kept, so the risk engine falls back on `last_known` / its staleness
   * rule, never on a second formula. With ENGINE_WBGT_ENABLED=false readings are stored
   * without WBGT.
   */
  async refreshSite(site: Site): Promise<EnvironmentalReading[]> {
    const observations = await this.weather.fetch(
      site.latitude,
      site.longitude,
      FORECAST_HOURS,
    );

    const matched = this.engine.wbgtEnabled
      ? matchWbgt(
          observations,
          await this.engine.wbgt(
            buildWbgtRequest(site.latitude, site.longitude, observations),
          ),
        )
      : null;
    const wbgtFor = (o: WeatherObservation) => {
      const v = matched?.get(o);
      return v
        ? { ...v, model: `engine/${v.model}` }
        : { wbgtC: null, model: null, confidence: Confidence.LOW };
    };

    const rows = observations.map((o) => {
      const w = wbgtFor(o);
      return this.readings.create({
        siteId: site.id,
        observedAt: o.time,
        isForecast: o.isForecast,
        source: ReadingSource.WEATHER_API,
        airTempC: o.airTempC,
        relativeHumidity: o.relativeHumidity,
        solarRadiationWm2: o.solarRadiationWm2,
        directRadiationWm2: o.directRadiationWm2,
        diffuseRadiationWm2: o.diffuseRadiationWm2,
        windSpeedMs: o.windSpeedMs,
        surfacePressureHpa: o.surfacePressureHpa,
        precipitationMm: o.precipitationMm,
        weatherCode: o.weatherCode,
        dustUgM3: o.dustUgM3,
        pm10UgM3: o.pm10UgM3,
        wbgtSunC: w.wbgtC,
        wbgtShadeC: null,
        wbgtMethod: WbgtMethod.ESTIMATED,
        wbgtModel: w.model,
        confidence: w.confidence,
      });
    });

    return this.readings.manager.transaction(async (tx) => {
      await tx.delete(EnvironmentalReading, {
        siteId: site.id,
        isForecast: true,
      });
      return tx.save(rows);
    });
  }

  async refreshAllSites(): Promise<void> {
    const sites = await this.readings.manager.find(Site);
    for (const site of sites) {
      try {
        await this.refreshSite(site);
      } catch (err) {
        this.logger.warn(
          `Weather refresh failed for site ${site.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  async recordSensorReading(
    organizationId: string,
    siteId: string,
    dto: SensorReadingDto,
  ) {
    await this.orgs.getSite(organizationId, siteId);
    return this.readings.save(
      this.readings.create({
        siteId,
        observedAt: new Date(dto.observedAt),
        isForecast: false,
        source: ReadingSource.SENSOR,
        airTempC: dto.airTempC ?? null,
        relativeHumidity: dto.relativeHumidity ?? null,
        // A WBGT sensor measures the conditions where it stands; use the value for both.
        wbgtSunC: dto.wbgtC,
        wbgtShadeC: dto.wbgtC,
        wbgtMethod: WbgtMethod.MEASURED,
        wbgtModel: null,
        confidence: Confidence.HIGH,
      }),
    );
  }

  /** Best current conditions: a sensor reading (30 min), else a weather observation (2 h), else this hour's forecast. */
  async currentConditions(
    siteId: string,
    now = new Date(),
  ): Promise<EnvironmentalReading | null> {
    const sensor = await this.readings.findOne({
      where: {
        siteId,
        source: ReadingSource.SENSOR,
        observedAt: MoreThan(new Date(now.getTime() - SENSOR_MAX_AGE_MS)),
      },
      order: { observedAt: 'DESC' },
    });
    if (sensor) return sensor;
    const observation = await this.readings.findOne({
      where: {
        siteId,
        source: ReadingSource.WEATHER_API,
        isForecast: false,
        observedAt: MoreThan(new Date(now.getTime() - WEATHER_MAX_AGE_MS)),
      },
      order: { observedAt: 'DESC' },
    });
    if (observation) return observation;
    // No recent observation (e.g. the weather service refused us): use the forecast for
    // the hour we are in. It comes from the same weather data and the same engine
    // formula, and is labelled `estimated` like any weather-based value. Its timestamp is
    // the start of this hour, so the engine still treats it as current (under 60 min).
    return this.readings.findOne({
      where: {
        siteId,
        source: ReadingSource.WEATHER_API,
        isForecast: true,
        observedAt: Between(new Date(now.getTime() - HOUR_MS + 1), now),
      },
      order: { observedAt: 'DESC' },
    });
  }

  /**
   * Readings to send to the risk engine. `current` falls back to this hour's forecast
   * when there is no recent observation (see currentConditions). The engine decides staleness itself
   * (`max_wbgt_age_minutes`), so `current` may be old; we send its timestamp.
   * `lastKnown` is the most recent earlier reading with a WBGT value (engine `last_known`).
   */
  async readingsForEngine(
    siteId: string,
    now = new Date(),
  ): Promise<{
    current: EnvironmentalReading | null;
    lastKnown: EnvironmentalReading | null;
  }> {
    const current =
      (await this.currentConditions(siteId, now)) ??
      (await this.readings.findOne({
        where: { siteId, isForecast: false, observedAt: LessThanOrEqual(now) },
        order: { observedAt: 'DESC' },
      }));
    const lastKnown = await this.readings.findOne({
      where: {
        siteId,
        isForecast: false,
        observedAt: LessThan(current?.observedAt ?? now),
        wbgtSunC: Not(IsNull()),
      },
      order: { observedAt: 'DESC' },
    });
    return { current, lastKnown };
  }

  /** True when there is no observation newer than the weather max age (time to refresh). */
  async needsRefresh(siteId: string, now = new Date()): Promise<boolean> {
    return !(await this.readings.exists({
      where: {
        siteId,
        isForecast: false,
        observedAt: MoreThan(new Date(now.getTime() - WEATHER_MAX_AGE_MS)),
      },
    }));
  }

  /** Most recent (non-forecast) observation from one source, any age. */
  latestObservation(siteId: string, source: ReadingSource) {
    return this.readings.findOne({
      where: { siteId, source, isForecast: false },
      order: { observedAt: 'DESC' },
    });
  }

  /** Dust and storm hazards from now through the next 12 hours. */
  async hazards(siteId: string, now = new Date()) {
    const rows = await this.readings.find({
      select: {
        observedAt: true,
        weatherCode: true,
        dustUgM3: true,
        pm10UgM3: true,
      },
      where: {
        siteId,
        source: ReadingSource.WEATHER_API,
        observedAt: Between(
          new Date(now.getTime() - 3_600_000),
          new Date(now.getTime() + 12 * 3_600_000),
        ),
      },
    });
    return detectHazards(rows);
  }

  forecast(siteId: string, from: Date, to: Date) {
    return this.readings.find({
      where: { siteId, isForecast: true, observedAt: Between(from, to) },
      order: { observedAt: 'ASC' },
    });
  }

  async siteConditions(
    organizationId: string,
    siteId: string,
    now = new Date(),
  ) {
    const site = await this.orgs.getSite(organizationId, siteId);
    let current = await this.currentConditions(siteId, now);
    if (!current) {
      await this.refreshSite(site);
      current = await this.currentConditions(siteId, now);
    }
    const forecast = await this.readings.find({
      where: { siteId, isForecast: true, observedAt: MoreThanOrEqual(now) },
      order: { observedAt: 'ASC' },
    });
    return { site, current, forecast };
  }
}
