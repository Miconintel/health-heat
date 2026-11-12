import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  RecommendationAudience,
  RecommendationStatus,
} from '../../common/enums';
import { Recommendation } from './entities/recommendation.entity';
import { RecommendationDraft } from './rules/recommendation-rules';

const ACTIVE = [RecommendationStatus.OPEN, RecommendationStatus.ACKNOWLEDGED];

const keyOf = (
  r: Pick<Recommendation, 'audience' | 'workerId' | 'crewId' | 'code'>,
) => `${r.audience}|${r.workerId ?? ''}|${r.crewId ?? ''}|${r.code}`;

@Injectable()
export class RecommendationsService {
  constructor(
    @InjectRepository(Recommendation)
    private readonly repo: Repository<Recommendation>,
  ) {}

  /**
   * Reconcile a site's active recommendations with the drafts from a new run:
   * matching ones are refreshed (keeping their acknowledged status), new ones are created,
   * and ones whose condition no longer applies are marked SUPERSEDED.
   */
  async sync(
    organizationId: string,
    siteId: string,
    drafts: (RecommendationDraft & { riskAssessmentId: string | null })[],
  ): Promise<void> {
    await this.repo.manager.transaction(async (tx) => {
      // Also serialise across app instances: one reconcile per site at a time.
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [siteId]);
      const existing = await tx.find(Recommendation, {
        where: { siteId, status: In(ACTIVE) },
        order: { createdAt: 'ASC' },
      });
      // Keep the oldest active row per key (it carries any acknowledgement).
      const byKey = new Map<string, Recommendation>();
      for (const r of existing)
        if (!byKey.has(keyOf(r))) byKey.set(keyOf(r), r);
      const seen = new Set<string>();
      const kept = new Set<string>();

      for (const draft of drafts) {
        const key = keyOf(draft);
        if (seen.has(key)) continue;
        seen.add(key);
        const match = byKey.get(key);
        if (match) {
          Object.assign(match, draft);
          await tx.save(match);
          kept.add(match.id);
        } else {
          await tx.save(
            tx.create(Recommendation, { ...draft, organizationId, siteId }),
          );
        }
      }

      // Everything else is stale: no longer applicable, or a duplicate of a kept row.
      const stale = existing.filter((r) => !kept.has(r.id)).map((r) => r.id);
      if (stale.length) {
        await tx.update(
          Recommendation,
          { id: In(stale) },
          { status: RecommendationStatus.SUPERSEDED },
        );
      }
    });
  }

  listForSite(
    organizationId: string,
    siteId: string,
    filter: { crewId?: string; activeOnly?: boolean },
  ) {
    return this.repo.find({
      where: {
        organizationId,
        siteId,
        audience: RecommendationAudience.SUPERVISOR,
        ...(filter.crewId ? { crewId: filter.crewId } : {}),
        ...(filter.activeOnly !== false ? { status: In(ACTIVE) } : {}),
      },
      order: { riskLevel: 'DESC', createdAt: 'ASC' },
      take: 500,
    });
  }

  listForWorker(organizationId: string, workerId: string) {
    return this.repo.find({
      where: {
        organizationId,
        workerId,
        audience: RecommendationAudience.WORKER,
        status: In(ACTIVE),
      },
      order: { riskLevel: 'DESC', createdAt: 'ASC' },
    });
  }
}
