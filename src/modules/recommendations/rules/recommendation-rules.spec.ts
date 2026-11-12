import {
  RecommendationAudience,
  RecommendationTiming,
  RiskLevel,
} from '../../../common/enums';
import {
  crewRecommendations,
  supervisorRecommendations,
  SupervisorRuleContext,
  workerRecommendation,
} from './recommendation-rules';

const ctx = (
  o: Partial<SupervisorRuleContext> = {},
): SupervisorRuleContext => ({
  workerId: 'w1',
  workerName: 'Alex',
  crewId: 'c1',
  level: RiskLevel.LOW,
  ppe: 'standard',
  hood: false,
  forecastFirstReached: [],
  forecastPeakLevel: null,
  ...o,
});
const codes = (c: SupervisorRuleContext) =>
  supervisorRecommendations(c).map((r) => r.code);

describe('workerRecommendation', () => {
  it('passes the engine action through unchanged, in the worker language', () => {
    const r = workerRecommendation({
      workerId: 'w1',
      crewId: null,
      level: RiskLevel.HIGH,
      label: 'Babba',
      action: { what: 'Rage aiki mai nauyi', when: 'now' },
    });
    expect(r.audience).toBe(RecommendationAudience.WORKER);
    expect(r.action).toBe('Rage aiki mai nauyi');
    expect(r.whatHappened).toBe('Babba');
    expect(r.timing).toBe(RecommendationTiming.IMMEDIATE);
  });

  it('maps routine to a precaution', () => {
    expect(
      workerRecommendation({
        workerId: 'w',
        crewId: null,
        level: 1,
        label: 'Low',
        action: { what: 'x', when: 'routine' },
      }).timing,
    ).toBe(RecommendationTiming.PRECAUTION);
  });
});

describe('supervisorRecommendations', () => {
  it('produces nothing at LOW', () => {
    expect(codes(ctx())).toEqual([]);
  });

  it('escalates with level', () => {
    expect(codes(ctx({ level: RiskLevel.ELEVATED }))).toEqual([
      'supervisor.increase_monitoring',
    ]);
    expect(codes(ctx({ level: RiskLevel.HIGH }))).toEqual([
      'supervisor.extra_breaks_reduce_load',
    ]);
    expect(codes(ctx({ level: RiskLevel.CRITICAL }))).toEqual([
      'supervisor.suspend_activity',
    ]);
  });

  it('reviews heat-retaining PPE but never recommends removing it', () => {
    const recs = supervisorRecommendations(
      ctx({ level: RiskLevel.HIGH, ppe: 'impermeable' }),
    );
    const ppe = recs.find((r) => r.code === 'supervisor.review_ppe_cooling');
    expect(ppe?.action).toContain(
      'Do not remove essential protective equipment',
    );
    for (const r of recs)
      expect(r.action.toLowerCase()).not.toMatch(
        /\bremove (the |your )?(ppe|protective)/,
      );
  });

  it('asks for PPE review for a hooded worker even in standard clothing', () => {
    expect(codes(ctx({ level: RiskLevel.ELEVATED, hood: true }))).toContain(
      'supervisor.review_ppe_cooling',
    );
    expect(codes(ctx({ level: RiskLevel.ELEVATED }))).not.toContain(
      'supervisor.review_ppe_cooling',
    );
  });

  it('contains nothing that could reveal health information', () => {
    const recs = supervisorRecommendations(
      ctx({
        level: RiskLevel.HIGH,
        ppe: 'coverall',
        forecastPeakLevel: 4,
        forecastFirstReached: [
          { level: 3, label: 'High', at: '2026-03-15T13:00:00+01:00' },
        ],
      }),
    );
    const text = recs
      .map((r) =>
        [r.whatHappened, r.whyItMatters, r.whoIsAffected, r.action].join(' '),
      )
      .join(' ')
      .toLowerCase();
    for (const word of [
      'precaution',
      'health',
      'medic',
      'condition',
      'heart',
      'blood',
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it('schedules action at the first forecast High', () => {
    const recs = supervisorRecommendations(
      ctx({
        level: RiskLevel.ELEVATED,
        forecastPeakLevel: RiskLevel.CRITICAL,
        forecastFirstReached: [
          { level: 4, label: 'Critical', at: '2026-03-15T14:00:00+01:00' },
          { level: 3, label: 'High', at: '2026-03-15T13:00:00+01:00' },
        ],
      }),
    );
    const r = recs.find((x) => x.code === 'supervisor.reschedule_before_peak');
    expect(r?.dueAt?.toISOString()).toBe('2026-03-15T12:00:00.000Z');
    expect(r?.timing).toBe(RecommendationTiming.SCHEDULED);
  });
});

describe('crewRecommendations', () => {
  it('needs at least two workers at HIGH or above', () => {
    expect(
      crewRecommendations({
        crewId: 'c',
        crewName: 'A',
        workerLevels: [3, 1, 1],
      }),
    ).toHaveLength(0);
    expect(
      crewRecommendations({
        crewId: 'c',
        crewName: 'A',
        workerLevels: [3, 4, 1],
      }),
    ).toHaveLength(1);
  });
});
