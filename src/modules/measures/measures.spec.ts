import { RecommendationStatus } from '../../common/enums';
import {
  actionsFollowed,
  actionsOnTime,
  hoursAtHighOrAbove,
  leadTimeHistogram,
  median,
  pausedMinutes,
  warningStats,
} from './measures';

const h = (
  hh: number,
  observed: number | null,
  warnedAt: string | null = null,
) => ({
  hourStart: new Date(`2026-03-15T${String(hh).padStart(2, '0')}:00:00Z`),
  observedLevel: observed,
  firstWarningAt: warnedAt ? new Date(`2026-03-15T${warnedAt}:00Z`) : null,
});
const now = new Date('2026-03-15T18:00:00Z');

describe('warningStats (provisional, D6)', () => {
  it('counts a warned High period with its lead time', () => {
    const s = warningStats(
      [h(10, 2), h(11, 3, '09:20'), h(12, 3, '09:20'), h(13, 2)],
      now,
    );
    expect(s).toMatchObject({
      highPeriods: 1,
      warned: 1,
      missed: 0,
      falseAlarms: 0,
      medianLeadMinutes: 100,
    });
  });

  it('counts a High period without a prior warning as missed', () => {
    expect(warningStats([h(14, 3), h(15, 4)], now)).toMatchObject({
      highPeriods: 1,
      warned: 0,
      missed: 1,
    });
  });

  it('counts a warning period that never reached High as a false alarm', () => {
    expect(
      warningStats([h(9, 2, '07:00'), h(10, 2, '07:00')], now),
    ).toMatchObject({
      warningPeriods: 1,
      falseAlarms: 1,
    });
  });

  it('ignores hours that have not finished yet', () => {
    expect(warningStats([h(17, 3), h(18, 3)], now).highPeriods).toBe(1);
  });

  it('a warning issued after the hour began is not a warning', () => {
    expect(warningStats([h(11, 3, '11:10')], now)).toMatchObject({
      warned: 0,
      missed: 1,
    });
  });
});

describe('helpers', () => {
  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
  });

  it('histogram buckets', () => {
    expect(
      leadTimeHistogram([10, 45, 90, 150, 300, 60]).map((b) => b.count),
    ).toEqual([1, 1, 2, 1, 1]);
  });

  it('hours at High or above', () => {
    expect(hoursAtHighOrAbove([h(1, 3), h(2, 4), h(3, 2), h(4, null)])).toBe(2);
  });
});

describe('actions', () => {
  const rec = (
    status: RecommendationStatus,
    createdHH: number,
    implementedHH: number | null,
    dueHH: number | null = null,
  ) => ({
    status,
    crewId: 'c',
    createdAt: new Date(`2026-03-15T${createdHH}:00:00Z`),
    dueAt: dueHH === null ? null : new Date(`2026-03-15T${dueHH}:00:00Z`),
    implementedAt:
      implementedHH === null
        ? null
        : new Date(`2026-03-15T${implementedHH}:30:00Z`),
  });

  it('followed: done / total, ignoring ones superseded before anyone acted', () => {
    expect(
      actionsFollowed([
        rec(RecommendationStatus.IMPLEMENTED, 10, 10),
        rec(RecommendationStatus.OPEN, 11, null),
        rec(RecommendationStatus.SUPERSEDED, 9, null),
      ]),
    ).toEqual({ done: 1, total: 2, percent: 50 });
  });

  it('on time: within an hour for immediate, before the due time for scheduled', () => {
    expect(
      actionsOnTime([
        rec(RecommendationStatus.IMPLEMENTED, 10, 10), // 30 min: on time
        rec(RecommendationStatus.IMPLEMENTED, 10, 12), // 2.5 h: late
        rec(RecommendationStatus.IMPLEMENTED, 10, 11, 12), // before due
      ]),
    ).toEqual({ onTime: 2, total: 3 });
  });
});

describe('pausedMinutes', () => {
  const e = (
    type: 'clock_in' | 'break_start' | 'break_end' | 'clock_out',
    hhmm: string,
    a = 'a1',
  ) => ({
    assignmentId: a,
    type,
    at: new Date(`2026-03-15T${hhmm}:00Z`),
  });

  it('sums breaks, including an open one up to now', () => {
    expect(
      pausedMinutes(
        [
          e('clock_in', '07:00'),
          e('break_start', '10:00'),
          e('break_end', '10:15'),
          e('break_start', '13:00', 'a2'),
        ],
        new Date('2026-03-15T13:20:00Z'),
      ),
    ).toBe(35);
  });
});
