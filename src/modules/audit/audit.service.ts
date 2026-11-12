import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators';
import { AuditAction, Role } from '../../common/enums';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async record(
    actor: AuthUser,
    action: AuditAction,
    details: {
      subjectWorkerId?: string | null;
      entityType?: string;
      entityId?: string | null;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    await this.repo.save({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action,
      subjectWorkerId: details.subjectWorkerId ?? null,
      entityType: details.entityType ?? null,
      entityId: details.entityId ?? null,
      metadata: details.metadata ?? null,
    });
  }

  /** For actions with no human actor (e.g. the retention job). */
  async recordSystem(
    organizationId: string,
    action: AuditAction,
    details: {
      subjectWorkerId?: string | null;
      entityType?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    await this.repo.save({
      organizationId,
      actorUserId: null,
      actorRole: null,
      action,
      subjectWorkerId: details.subjectWorkerId ?? null,
      entityType: details.entityType ?? null,
      entityId: null,
      metadata: details.metadata ?? null,
    });
  }

  /**
   * "Who looked at your data": accesses by other people to this worker's data
   * (direct, or as part of a site overview), grouped per day, role and action.
   * Actors are shown by role only, never by name.
   */
  async accessLogFor(
    organizationId: string,
    workerId: string,
    selfUserId: string,
    days: number,
  ) {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.repo
      .createQueryBuilder('a')
      .select(['a.createdAt', 'a.actorRole', 'a.action'])
      .where('a.organizationId = :org', { org: organizationId })
      .andWhere('a.createdAt >= :since', { since })
      // Separate text parameter: Postgres would otherwise type :w as uuid for the jsonb `?`.
      .andWhere(
        `(a.subjectWorkerId = :w OR a.metadata -> 'workerIds' ? CAST(:wt AS text))`,
        { w: workerId, wt: workerId },
      )
      .andWhere('(a.actorUserId IS NULL OR a.actorUserId <> :self)', {
        self: selfUserId,
      })
      .orderBy('a.createdAt', 'DESC')
      .getMany();

    const groups = new Map<
      string,
      {
        date: string;
        actorRole: Role | null;
        action: AuditAction;
        count: number;
        lastAt: Date;
      }
    >();
    for (const r of rows) {
      const date = r.createdAt.toISOString().slice(0, 10);
      const key = `${date}|${r.actorRole}|${r.action}`;
      const g = groups.get(key);
      if (g) g.count++;
      else
        groups.set(key, {
          date,
          actorRole: r.actorRole,
          action: r.action,
          count: 1,
          lastAt: r.createdAt,
        });
    }
    return [...groups.values()];
  }

  list(
    organizationId: string,
    filter: { subjectWorkerId?: string; limit?: number },
  ) {
    return this.repo.find({
      where: {
        organizationId,
        ...(filter.subjectWorkerId
          ? { subjectWorkerId: filter.subjectWorkerId }
          : {}),
      },
      order: { createdAt: 'DESC' },
      take: Math.min(filter.limit ?? 100, 500),
    });
  }
}
