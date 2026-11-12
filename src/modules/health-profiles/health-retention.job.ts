import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { AuditAction } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { Worker } from '../workers/entities/worker.entity';
import { addDays, isoDate } from '../workers/acclimatization';
import { HealthProfile } from './entities/health-profile.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { WaterLog } from '../me/entities/water-log.entity';
import { HealthProfilesService } from './health-profiles.service';

/** Promise on the My data screen: health information is deleted 30 days after leaving. */
export const RETENTION_DAYS_AFTER_LEAVING = 30;

@Injectable()
export class HealthRetentionJob {
  private readonly logger = new Logger(HealthRetentionJob.name);

  constructor(
    @InjectRepository(Worker) private readonly workers: Repository<Worker>,
    private readonly health: HealthProfilesService,
    private readonly audit: AuditService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async nightly() {
    const erased = await this.run().catch((err: Error) => {
      this.logger.error(`Retention run failed: ${err.message}`);
      return 0;
    });
    if (erased)
      this.logger.log(`Retention: erased health data for ${erased} worker(s)`);
  }

  /** Returns how many workers had data erased. Safe to run repeatedly. */
  async run(today = isoDate(new Date())): Promise<number> {
    const cutoff = addDays(today, -RETENTION_DAYS_AFTER_LEAVING);
    const leavers = await this.workers.find({
      where: { isActive: false, leftOn: LessThanOrEqual(cutoff) },
    });
    let erased = 0;
    for (const w of leavers) {
      const m = this.workers.manager;
      const [profile, shared, water] = await Promise.all([
        m.existsBy(HealthProfile, { workerId: w.id }),
        m.existsBy(HelpRequest, { workerId: w.id, detailsShared: true }),
        m.existsBy(WaterLog, { workerId: w.id }),
      ]);
      if (!profile && !shared && !water) continue;
      await this.health.eraseHealthData(w.id);
      await m.delete(WaterLog, { workerId: w.id });
      await this.audit.recordSystem(
        w.organizationId,
        AuditAction.HEALTH_DATA_RETENTION_ERASED,
        {
          subjectWorkerId: w.id,
          entityType: 'worker',
          metadata: {
            leftOn: w.leftOn,
            retentionDays: RETENTION_DAYS_AFTER_LEAVING,
          },
        },
      );
      erased++;
    }
    return erased;
  }
}
