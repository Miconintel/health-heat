import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, LessThan, MoreThan, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AuditAction, ConsentPurpose, Role } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { HealthProfilesService } from '../health-profiles/health-profiles.service';
import { WorkersService } from '../workers/workers.service';
import { WearableDevice } from './entities/wearable-device.entity';
import { WearableReading } from './entities/wearable-reading.entity';
import { summarise } from './wearable-summary';
import { BandReadingsDto, PairBandDto } from './dto/wearable.dto';

/** Readings are kept this long (data minimisation). */
export const READING_RETENTION_DAYS = 7;
const SAMPLE_MAX_AGE_MS = 24 * 3_600_000;
const SAMPLE_MAX_FUTURE_MS = 2 * 60_000;
export const BAND_CONNECTED_MINUTES = 15;

/**
 * Wearable band (heart rate, skin temperature). Off unless WEARABLES_ENABLED=true.
 * Needs the worker's "Wearable band" consent; readings are health data (encrypted,
 * worker and occupational health only, 7-day retention). Supervisors see counts only.
 */
@Injectable()
export class WearablesService {
  private readonly logger = new Logger(WearablesService.name);
  readonly enabled: boolean;

  constructor(
    @InjectRepository(WearableDevice)
    private readonly devices: Repository<WearableDevice>,
    @InjectRepository(WearableReading)
    private readonly readings: Repository<WearableReading>,
    private readonly health: HealthProfilesService,
    private readonly workers: WorkersService,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.enabled = config.get<boolean>('WEARABLES_ENABLED') === true;
  }

  private assertEnabled() {
    if (!this.enabled)
      throw new ServiceUnavailableException('Wearable bands are not enabled');
  }

  private requireWorker(user: AuthUser) {
    if (user.role !== Role.WORKER || !user.workerId)
      throw new ForbiddenException();
    return user.workerId;
  }

  private async assertConsent(workerId: string) {
    const consents = await this.health.consentState(workerId);
    if (!consents[ConsentPurpose.WEARABLE_BAND]) {
      throw new ForbiddenException(
        'Turn on "Wearable band" in your sharing choices first',
      );
    }
  }

  async pair(user: AuthUser, dto: PairBandDto) {
    this.assertEnabled();
    const workerId = this.requireWorker(user);
    await this.assertConsent(workerId);
    await this.devices.upsert(
      {
        workerId,
        deviceId: dto.deviceId,
        model: dto.model ?? null,
        pairedAt: new Date(),
        lastSeenAt: null,
      },
      ['workerId'],
    );
    return this.status(user);
  }

  /** Unpair and delete this worker's readings. */
  async unpair(user: AuthUser) {
    this.assertEnabled();
    const workerId = this.requireWorker(user);
    await this.devices.delete({ workerId });
    await this.readings.delete({ workerId });
    return { paired: false };
  }

  async status(user: AuthUser) {
    const workerId = this.requireWorker(user);
    const device = await this.devices.findOneBy({ workerId });
    const now = Date.now();
    return {
      enabled: this.enabled,
      paired: !!device,
      deviceId: device?.deviceId ?? null,
      model: device?.model ?? null,
      lastSeenAt: device?.lastSeenAt ?? null,
      batteryPercent: device?.batteryPercent ?? null,
      connected:
        !!device?.lastSeenAt &&
        now - device.lastSeenAt.getTime() <= BAND_CONNECTED_MINUTES * 60_000,
    };
  }

  /** Batch from the phone. Duplicates (same time) are ignored. */
  async ingest(user: AuthUser, dto: BandReadingsDto) {
    this.assertEnabled();
    const workerId = this.requireWorker(user);
    await this.assertConsent(workerId);
    const device = await this.devices.findOneBy({ workerId });
    if (!device) throw new ConflictException('Pair a band first');
    if (device.deviceId !== dto.deviceId)
      throw new ConflictException('This band is not the paired one');

    const now = Date.now();
    const rows = dto.readings
      .map((r) => ({
        at: new Date(r.at),
        hr: r.heartRateBpm ?? null,
        skin: r.skinTempC ?? null,
      }))
      .filter((r) => r.hr !== null || r.skin !== null);
    if (
      rows.some(
        (r) =>
          now - r.at.getTime() > SAMPLE_MAX_AGE_MS ||
          r.at.getTime() - now > SAMPLE_MAX_FUTURE_MS,
      )
    ) {
      throw new BadRequestException('Readings must be from the last 24 hours');
    }
    if (rows.length) {
      await this.readings
        .createQueryBuilder()
        .insert()
        .into(WearableReading)
        .values(
          rows.map((r) => ({
            workerId,
            at: r.at,
            values: { heartRateBpm: r.hr, skinTempC: r.skin },
          })),
        )
        .orIgnore()
        .execute();
    }
    const latest = rows.reduce<Date | null>(
      (m, r) => (!m || r.at > m ? r.at : m),
      null,
    );
    await this.devices.update(
      { workerId },
      {
        lastSeenAt:
          latest && (!device.lastSeenAt || latest > device.lastSeenAt)
            ? latest
            : device.lastSeenAt,
        batteryPercent: dto.batteryPercent ?? device.batteryPercent,
      },
    );
    return { accepted: rows.length };
  }

  /** The worker's own recent readings and the summary the engine would receive. */
  async mine(user: AuthUser, hours: number) {
    const workerId = this.requireWorker(user);
    return this.readingsView(workerId, hours);
  }

  /** Occupational health: a worker's band data (only exists with consent). Audited. */
  async forWorker(user: AuthUser, workerId: string, hours: number) {
    await this.workers.getAccessible(user, workerId);
    await this.audit.record(user, AuditAction.WEARABLE_READ, {
      subjectWorkerId: workerId,
      entityType: 'wearable_reading',
    });
    return this.readingsView(workerId, hours);
  }

  private async readingsView(workerId: string, hours: number) {
    const now = new Date();
    const rows = await this.readings.find({
      where: {
        workerId,
        at: Between(new Date(now.getTime() - hours * 3_600_000), now),
      },
      order: { at: 'ASC' },
    });
    const samples = rows.map((r) => ({ at: r.at, ...r.values }));
    return { summary: summarise(samples, now), readings: samples };
  }

  /** Workers whose band sent data recently (supervisor system health: a count only). */
  async connectedCount(workerIds: string[]) {
    if (!workerIds.length) return 0;
    return this.devices.countBy({
      workerId: In(workerIds),
      lastSeenAt: MoreThan(
        new Date(Date.now() - BAND_CONNECTED_MINUTES * 60_000),
      ),
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeOld() {
    const cutoff = new Date(Date.now() - READING_RETENTION_DAYS * 86_400_000);
    const res = await this.readings.delete({ at: LessThan(cutoff) });
    if (res.affected)
      this.logger.log(
        `Deleted ${res.affected} band readings older than ${READING_RETENTION_DAYS} days`,
      );
  }
}
