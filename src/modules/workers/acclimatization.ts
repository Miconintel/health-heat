import type { AcclimatisationAnswer } from '../health-profiles/profile-options';

/**
 * Acclimatisation is derived from a start date (decision D4), never toggled by hand:
 *   acclimatized = days since start >= ACCLIMATIZATION_DAYS
 * The engine guide says 1 to 2 weeks; 14 is the cautious end.
 * TODO(team): confirm the day count with the engine owner.
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
