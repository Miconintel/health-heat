import { RecommendationStatus } from '../../common/enums';

/**
 * Pure calculations for "Today so far", "Last 7 days" and the Measures page.
 *
 * Forecast-accuracy measures (lead time, false alarms, missed warnings). Definition
 * accepted by the engine owner on 12 Nov 2026 (their evaluation on real Abuja weather
 * uses the same one). It stays `provisional: true` until they share their results.
 * - a "High period" is a run of consecutive hours whose observed site level was High or above;
 * - it was "warned" if a forecast said High or above (a definite level; a "possible"
 *   level does not count) for its first hour before that hour began;
 * - lead time = first hour start − first warning time;
 * - a "warning period" is a run of past hours that had a warning; it is a false alarm
 *   when none of its hours was observed at High or above.
 */

const HOUR = 3_600_000;

export interface HourRow {
  hourStart: Date;
  observedLevel: number | null;
  firstWarningAt: Date | null;
}

function runs<T extends HourRow>(rows: T[], inRun: (r: T) => boolean): T[][] {
  const sorted = [...rows].sort(
    (a, b) => a.hourStart.getTime() - b.hourStart.getTime(),
  );
  const out: T[][] = [];
  let cur: T[] = [];
  for (const r of sorted) {
    const contiguous =
      cur.length > 0 &&
      r.hourStart.getTime() - cur[cur.length - 1].hourStart.getTime() === HOUR;
    if (inRun(r)) {
      if (cur.length && !contiguous) {
        out.push(cur);
        cur = [];
      }
      cur.push(r);
    } else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function warningStats(rows: HourRow[], now: Date) {
  const past = rows.filter(
    (r) => r.hourStart.getTime() + HOUR <= now.getTime(),
  );
  const highPeriods = runs(past, (r) => (r.observedLevel ?? 0) >= 3);
  const leadTimesMin: number[] = [];
  let missed = 0;
  for (const p of highPeriods) {
    const first = p[0];
    if (first.firstWarningAt && first.firstWarningAt < first.hourStart) {
      leadTimesMin.push(
        Math.round(
          (first.hourStart.getTime() - first.firstWarningAt.getTime()) / 60_000,
        ),
      );
    } else {
      missed++;
    }
  }
  const warningPeriods = runs(past, (r) => !!r.firstWarningAt);
  const falseAlarms = warningPeriods.filter(
    (p) =>
      p.every((r) => r.observedLevel !== null) &&
      !p.some((r) => (r.observedLevel ?? 0) >= 3),
  ).length;
  return {
    provisional: true as const,
    highPeriods: highPeriods.length,
    warned: leadTimesMin.length,
    missed,
    warningPeriods: warningPeriods.length,
    falseAlarms,
    medianLeadMinutes: median(leadTimesMin),
    leadTimesMinutes: leadTimesMin,
  };
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** "How early warnings came" histogram. */
export function leadTimeHistogram(leadTimesMin: number[]) {
  const buckets = [
    { key: 'under_30m', max: 30 },
    { key: '30_60m', max: 60 },
    { key: '1_2h', max: 120 },
    { key: '2_3h', max: 180 },
    { key: 'over_3h', max: Infinity },
  ];
  return buckets.map((b, i) => ({
    bucket: b.key,
    count: leadTimesMin.filter(
      (m) => m >= (i ? buckets[i - 1].max : 0) && m < b.max,
    ).length,
  }));
}

/** Hours whose observed site level was High or above. */
export const hoursAtHighOrAbove = (rows: HourRow[]) =>
  rows.filter((r) => (r.observedLevel ?? 0) >= 3).length;

export interface RecRow {
  status: RecommendationStatus;
  crewId: string | null;
  createdAt: Date;
  dueAt: Date | null;
  /** When it was first marked implemented (from interventions), if ever. */
  implementedAt: Date | null;
}

/** Recommendations that count: everything except ones superseded before anyone acted. */
const counted = (r: RecRow) =>
  r.status !== RecommendationStatus.SUPERSEDED || r.implementedAt !== null;

/** Share of recommended actions marked done. */
export function actionsFollowed(recs: RecRow[]) {
  const rows = recs.filter(counted);
  const done = rows.filter((r) => r.implementedAt !== null).length;
  return {
    done,
    total: rows.length,
    percent: rows.length ? Math.round((done / rows.length) * 100) : null,
  };
}

/** Done on time: before the due time, or within an hour for immediate actions. */
export function actionsOnTime(recs: RecRow[]) {
  const rows = recs.filter(counted);
  const onTime = rows.filter((r) => {
    if (!r.implementedAt) return false;
    const deadline = r.dueAt ?? new Date(r.createdAt.getTime() + HOUR);
    return r.implementedAt <= deadline;
  }).length;
  return { onTime, total: rows.length };
}

export interface EventRow {
  assignmentId: string;
  type: 'clock_in' | 'break_start' | 'break_end' | 'clock_out';
  at: Date;
}

/** Minutes spent on breaks: each break_start up to the next break_end / clock_out / `until`. */
export function pausedMinutes(events: EventRow[], until: Date): number {
  const byAssignment = new Map<string, EventRow[]>();
  for (const e of events)
    byAssignment.set(e.assignmentId, [
      ...(byAssignment.get(e.assignmentId) ?? []),
      e,
    ]);
  let total = 0;
  for (const list of byAssignment.values()) {
    const sorted = list.sort((a, b) => a.at.getTime() - b.at.getTime());
    let start: Date | null = null;
    for (const e of sorted) {
      if (e.type === 'break_start') start = e.at;
      else if ((e.type === 'break_end' || e.type === 'clock_out') && start) {
        total += (e.at.getTime() - start.getTime()) / 60_000;
        start = null;
      }
    }
    if (start)
      total += Math.max(0, (until.getTime() - start.getTime()) / 60_000);
  }
  return Math.round(total);
}
