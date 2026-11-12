import type { AcclimatisationAnswer } from '../health-profiles/profile-options';

/**
 * Acclimatisation is derived from a start date (decision D4), never toggled by hand:
 *   acclimatized = days since start >= ACCLIMATIZATION_DAYS
 * The engine guide says 1 to 2 weeks; 14 is the cautious end, confirmed by the engine
 * owner on 12 Nov 2026 (NIOSH 2016: 7 to 14 days).
 */
export const ACCLIMATIZATION_DAYS = 14;

const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" → UTC midnight of that date. */
const dateOnly = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const isoDate = (t: number | Date) =>
  new Date(typeof t === 'number' ? t : t.getTime()).toISOString().slice(0, 10);

export const addDays = (d: string, days: number) =>
  isoDate(dateOnly(d) + days * DAY_MS);

export function acclimatizationStatus(startedOn: string | null, today: string) {
  if (!startedOn) {
    // Unknown history: treat as not acclimatised (the cautious side).
    return { acclimatized: false, startedOn: null, daysSinceStart: null };
  }
  const days = Math.floor((dateOnly(today) - dateOnly(startedOn)) / DAY_MS);
  return {
    acclimatized: days >= ACCLIMATIZATION_DAYS,
    startedOn,
    daysSinceStart: days,
  };
}

/** Start date implied by the worker's health-profile answer, given today's date. */
export function startDateFromAnswer(
  answer: AcclimatisationAnswer,
  today: string,
): string {
  switch (answer) {
    case 'new':
      return today; // less than 1 week: assume just started
    case 'adjusting':
      return addDays(today, -7); // 1 to 2 weeks: the cautious end
    case 'over2':
      return addDays(today, -ACCLIMATIZATION_DAYS);
    case 'back':
      return today; // back after a week or more away: starts again
  }
}

/** When two sources give a start date, the later one is the more cautious and wins. */
export const laterDate = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a >= b ? a : b;

/** How far back shift history is checked for an absence. */
export const ABSENCE_LOOKBACK_DAYS = 60;

/**
 * Acclimatisation is lost after time away (engine owner, 12 Nov 2026, following NIOSH and
 * OSHA guidance for workers returning after a week or more). Setting:
 * ACCLIMATIZATION_ABSENCE_DAYS (default 7; 0 turns the rule off).
 *
 * Given the site-local dates the worker had a shift (any order, repeats fine), returns the
 * most recent date the worker came back after `absenceDays` or more days with no shift,
 * or null if there was no such absence. Only gaps between known shifts count: a worker
 * with no earlier shift on record is left alone.
 */
export function returnAfterAbsence(
  workDays: string[],
  absenceDays: number,
): string | null {
  if (absenceDays <= 0) return null;
  const days = [...new Set(workDays)].sort().reverse();
  for (let i = 0; i < days.length - 1; i++) {
    const away =
      Math.round((dateOnly(days[i]) - dateOnly(days[i + 1])) / DAY_MS) - 1;
    if (away >= absenceDays) return days[i];
  }
  return null;
}
