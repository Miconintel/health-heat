import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AuditAction, Role } from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { Worker } from '../workers/entities/worker.entity';
import { HealthProfile } from './entities/health-profile.entity';
import { Consent } from './entities/consent.entity';
import { WorkerPpe } from '../ppe/entities/worker-ppe.entity';
import { WorkAssignment } from '../workload/entities/work-assignment.entity';
import { RiskAssessment } from '../risk-engine/entities/risk-assessment.entity';
import { Recommendation } from '../recommendations/entities/recommendation.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { WaterLog } from '../me/entities/water-log.entity';
import { WearableDevice } from '../wearables/entities/wearable-device.entity';
import { WearableReading } from '../wearables/entities/wearable-reading.entity';

/** GDPR Art. 15/20: the worker can download everything held about them. */
@Injectable()
export class DataExportService {
  constructor(
    private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  async export(user: AuthUser, workerId: string) {
    if (user.role !== Role.WORKER || user.workerId !== workerId)
      throw new ForbiddenException();
    const m = this.ds.manager;
    const where = { workerId };
    const result = {
      exportedAt: new Date().toISOString(),
      worker: await m.findOneBy(Worker, {
        id: workerId,
        organizationId: user.organizationId,
      }),
      healthProfile: await m.findOneBy(HealthProfile, where),
      consents: await m.findBy(Consent, where),
      ppe: await m.findBy(WorkerPpe, where),
      workAssignments: await m.findBy(WorkAssignment, where),
      riskAssessments: await m.findBy(RiskAssessment, where),
      recommendations: await m.findBy(Recommendation, where),
      helpRequests: await m.findBy(HelpRequest, where),
      waterLogs: await m.findBy(WaterLog, where),
      wearableDevice: await m.findOneBy(WearableDevice, where),
      wearableReadings: await m.findBy(WearableReading, where),
      accessLog: await m.findBy(AuditLog, { subjectWorkerId: workerId }),
    };
    await this.audit.record(user, AuditAction.DATA_EXPORTED, {
      subjectWorkerId: workerId,
    });
    return result;
  }
}
