import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import {
  AuditAction,
  ConsentPurpose,
  PrecautionLevel,
  Role,
} from '../../common/enums';
import { AuditService } from '../audit/audit.service';
import { RiskEngineService } from '../risk-engine/risk-engine.service';
import { WorkersService } from '../workers/workers.service';
import { HealthProfile } from './entities/health-profile.entity';
import { HelpRequest } from '../help-requests/entities/help-request.entity';
import { WearableReading } from '../wearables/entities/wearable-reading.entity';
import { mixesNone } from './profile-options';
import { Consent } from './entities/consent.entity';
import {
  ApproveHealthProfileDto,
  RecordConsentDto,
  UpdateOwnHealthDataDto,
} from './dto/health-profile.dto';

/**
 * Access rules (spec 2, 3.2):
 *  - read:    the worker themselves, occupational health
 *  - write:   the worker (own clinical data, requires consent), occupational health
 *  - approve: occupational health only
 *  - never:   supervisors, admins
 * Every read and write is audited.
 */
@Injectable()
export class HealthProfilesService {
  constructor(
    @InjectRepository(HealthProfile)
    private readonly profiles: Repository<HealthProfile>,
    @InjectRepository(Consent) private readonly consents: Repository<Consent>,
    private readonly workers: WorkersService,
    private readonly audit: AuditService,
    private readonly risk: RiskEngineService,
  ) {}

  private assertCanAccess(user: AuthUser, workerId: string) {
    const isSelf = user.role === Role.WORKER && user.workerId === workerId;
    if (!isSelf && user.role !== Role.OCCUPATIONAL_HEALTH)
      throw new ForbiddenException();
  }

  async get(user: AuthUser, workerId: string) {
    this.assertCanAccess(user, workerId);
    await this.workers.getAccessible(user, workerId);
    const profile = await this.profiles.findOneBy({ workerId });
    await this.audit.record(user, AuditAction.HEALTH_PROFILE_READ, {
      subjectWorkerId: workerId,
      entityType: 'health_profile',
      entityId: profile?.id ?? null,
    });
    if (!profile) throw new NotFoundException('No health profile recorded');
    return profile;
  }

  async updateOwnData(
    user: AuthUser,
    workerId: string,
    dto: UpdateOwnHealthDataDto,
  ) {
    this.assertCanAccess(user, workerId);
    await this.workers.getAccessible(user, workerId);
    if (!(await this.hasActiveConsent(workerId))) {
      throw new ConflictException(
        'Health data processing consent is required before health data can be stored',
      );
    }

    if (mixesNone(dto.healthConditions) || mixesNone(dto.medications)) {
      throw new BadRequestException(
        '"none" cannot be combined with other answers',
      );
    }
    const { acclimatisation, ...answers } = dto;
    const profile =
      (await this.profiles.findOneBy({ workerId })) ??
      this.profiles.create({ workerId });
    Object.assign(profile, answers);
    if (acclimatisation) profile.acclimatisationAnswer = acclimatisation;
    // Any change by the worker needs occupational-health review before it can change the classification.
    if (user.role === Role.WORKER) profile.reviewRequested = true;
    const saved = await this.profiles.save(profile);

    await this.audit.record(user, AuditAction.HEALTH_PROFILE_WRITE, {
      subjectWorkerId: workerId,
      entityType: 'health_profile',
      entityId: saved.id,
      metadata: { fields: Object.keys(dto) }, // field names only, never values
    });
    if (acclimatisation) {
      // Work history, not health data: it feeds the engine through the worker record.
      await this.workers.applyAcclimatisationAnswer(
        user.organizationId,
        workerId,
        acclimatisation,
      );
    }
    return saved;
  }

  async approve(
    user: AuthUser,
    workerId: string,
    dto: ApproveHealthProfileDto,
  ) {
    if (user.role !== Role.OCCUPATIONAL_HEALTH) throw new ForbiddenException();
    await this.workers.getAccessible(user, workerId);

    const profile =
      (await this.profiles.findOneBy({ workerId })) ??
      this.profiles.create({ workerId });
    profile.precautionLevel = dto.precautionLevel;
    if (dto.precautionNotes !== undefined)
      profile.precautionNotes = dto.precautionNotes;
    if (dto.restrictions !== undefined) profile.restrictions = dto.restrictions;
    if (dto.nextReviewOn !== undefined) profile.nextReviewOn = dto.nextReviewOn;
    profile.approvedByUserId = user.userId;
    profile.approvedAt = new Date();
    profile.reviewRequested = false;
    const saved = await this.profiles.save(profile);

    await this.audit.record(user, AuditAction.HEALTH_PROFILE_APPROVE, {
      subjectWorkerId: workerId,
      entityType: 'health_profile',
      entityId: saved.id,
      metadata: { precautionLevel: dto.precautionLevel },
    });
    this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    return saved;
  }

  async requestReview(user: AuthUser, workerId: string) {
    if (user.role !== Role.WORKER || user.workerId !== workerId)
      throw new ForbiddenException();
    const profile = await this.profiles.findOneBy({ workerId });
    if (!profile) throw new NotFoundException('No health profile recorded');
    profile.reviewRequested = true;
    await this.profiles.save(profile);
    await this.audit.record(user, AuditAction.HEALTH_PROFILE_REVIEW_REQUESTED, {
      subjectWorkerId: workerId,
      entityType: 'health_profile',
      entityId: profile.id,
    });
    return { reviewRequested: true };
  }

  /** Occupational health work queue. */
  async listPendingReview(user: AuthUser) {
    if (user.role !== Role.OCCUPATIONAL_HEALTH) throw new ForbiddenException();
    const rows = await this.profiles
      .createQueryBuilder('p')
      .innerJoin('p.worker', 'w')
      .select([
        'p.id',
        'p.workerId',
        'p.precautionLevel',
        'p.updatedAt',
        'w.displayName',
      ])
      .where('w.organizationId = :org', { org: user.organizationId })
      .andWhere('p.reviewRequested = true')
      .orderBy('p.updatedAt', 'ASC')
      .getMany();
    return rows.map((p) => ({
      profileId: p.id,
      workerId: p.workerId,
      workerName: p.worker?.displayName,
      precautionLevel: p.precautionLevel,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * GDPR Art. 17 erasure of clinical data.
   * The precaution classification reverts to STANDARD, so the response warns the caller.
   */
  async erase(user: AuthUser, workerId: string) {
    this.assertCanAccess(user, workerId);
    await this.workers.getAccessible(user, workerId);
    const profile = await this.profiles.findOneBy({ workerId });
    const sharedReports = await this.profiles.manager.countBy(HelpRequest, {
      workerId,
      detailsShared: true,
    });
    if (!profile && sharedReports === 0) {
      throw new NotFoundException('No health information recorded');
    }
    const hadPrecautions =
      !!profile && profile.precautionLevel !== PrecautionLevel.STANDARD;
    await this.eraseHealthData(workerId);
    await this.audit.record(user, AuditAction.HEALTH_PROFILE_ERASED, {
      subjectWorkerId: workerId,
      entityType: 'health_profile',
      entityId: profile?.id ?? null,
      metadata: { symptomReportsCleared: sharedReports },
    });
    this.risk.reassessWorkerInBackground(user.organizationId, workerId);
    return {
      erased: true,
      warning: hadPrecautions
        ? 'Occupational-health precautions were removed. Risk assessments now use standard precautions.'
        : undefined,
    };
  }

  /**
   * Removes the worker's health information: the health profile and any symptom
   * details. The fact that an alert was raised is kept (safety record, no health detail).
   */
  async eraseHealthData(workerId: string) {
    await this.profiles.manager.transaction(async (tx) => {
      await tx.delete(HealthProfile, { workerId });
      await tx.delete(WearableReading, { workerId });
      await tx.update(
        HelpRequest,
        { workerId },
        { symptoms: null, note: null, detailsShared: false },
      );
    });
  }

  // ---- consent -------------------------------------------------------------

  async hasActiveConsent(
    workerId: string,
    purpose = ConsentPurpose.HEALTH_DATA_PROCESSING,
  ) {
    const latest = await this.consents.findOne({
      where: { workerId, purpose },
      order: { createdAt: 'DESC' },
    });
    return latest?.granted === true;
  }

  /** Latest choice per purpose (false when never recorded). */
  async consentState(
    workerId: string,
  ): Promise<Record<ConsentPurpose, boolean>> {
    const rows = await this.consents.find({
      where: { workerId },
      order: { createdAt: 'DESC' },
    });
    const state = Object.fromEntries(
      Object.values(ConsentPurpose).map((p) => [p, false]),
    ) as Record<ConsentPurpose, boolean>;
    const seen = new Set<ConsentPurpose>();
    for (const r of rows) {
      if (seen.has(r.purpose)) continue;
      seen.add(r.purpose);
      state[r.purpose] = r.granted;
    }
    return state;
  }

  /**
   * The consent screen sends all switches at once. Records a consent row only for
   * purposes whose value changed (append-only history), each audited.
   */
  async recordConsentChoices(
    user: AuthUser,
    workerId: string,
    choices: Partial<Record<ConsentPurpose, boolean>>,
    policyVersion: string,
  ) {
    const current = await this.consentState(workerId);
    const hasHistory = (
      await this.consents.find({
        where: { workerId },
        select: { purpose: true },
      })
    ).map((r) => r.purpose);
    for (const purpose of Object.values(ConsentPurpose)) {
      const granted = choices[purpose];
      if (granted === undefined) continue;
      // Skip unchanged values, but always record a first explicit choice.
      if (granted === current[purpose] && hasHistory.includes(purpose))
        continue;
      await this.recordConsent(user, workerId, {
        purpose,
        granted,
        policyVersion,
      });
    }
    return this.consentState(workerId);
  }

  async listConsents(user: AuthUser, workerId: string) {
    this.assertCanAccess(user, workerId);
    await this.workers.getAccessible(user, workerId);
    return this.consents.find({
      where: { workerId },
      order: { createdAt: 'DESC' },
    });
  }

  async recordConsent(user: AuthUser, workerId: string, dto: RecordConsentDto) {
    // Consent must come from the data subject.
    if (user.role !== Role.WORKER || user.workerId !== workerId)
      throw new ForbiddenException();
    const saved = await this.consents.save(
      this.consents.create({ ...dto, workerId, recordedByUserId: user.userId }),
    );
    if (!dto.granted && dto.purpose === ConsentPurpose.WEARABLE_BAND) {
      // Pausing the band deletes its readings (they are health data).
      await this.profiles.manager.delete(WearableReading, { workerId });
    }
    if (!dto.granted && dto.purpose === ConsentPurpose.HEALTH_DATA_PROCESSING) {
      // Withdrawal: flag for occupational-health follow-up (erasure is a separate, explicit request).
      await this.profiles.update({ workerId }, { reviewRequested: true });
    }
    await this.audit.record(user, AuditAction.CONSENT_CHANGED, {
      subjectWorkerId: workerId,
      entityType: 'consent',
      entityId: saved.id,
      metadata: {
        purpose: dto.purpose,
        granted: dto.granted,
        policyVersion: dto.policyVersion,
      },
    });
    return saved;
  }
}
