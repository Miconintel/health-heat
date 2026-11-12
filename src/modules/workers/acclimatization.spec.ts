import {
  ACCLIMATIZATION_DAYS,
  acclimatizationStatus,
  addDays,
  laterDate,
  startDateFromAnswer,
  returnAfterAbsence,
} from './acclimatization';

const today = '2026-11-12';

describe('acclimatizationStatus', () => {
  it('is not acclimatised without a start date (the cautious default)', () => {
    expect(acclimatizationStatus(null, today)).toEqual({
      acclimatized: false,
      startedOn: null,
      daysSinceStart: null,
    });
  });

  it(`turns true after ${ACCLIMATIZATION_DAYS} days`, () => {
    expect(acclimatizationStatus(addDays(today, -13), today).acclimatized).toBe(
      false,
    );
    expect(acclimatizationStatus(addDays(today, -14), today).acclimatized).toBe(
      true,
    );
  });
});

describe('startDateFromAnswer', () => {
  it.each([
    ['new', today, false],
    ['adjusting', '2026-11-05', false],
    ['over2', '2026-10-29', true],
    ['back', today, false],
  ] as const)(
    '%s → starts %s (acclimatised now: %s)',
    (answer, start, acclimatized) => {
      expect(startDateFromAnswer(answer, today)).toBe(start);
      expect(acclimatizationStatus(start, today).acclimatized).toBe(
        acclimatized,
      );
    },
  );

  it('"1 to 2 weeks" becomes acclimatised a week later, by itself', () => {
    const start = startDateFromAnswer('adjusting', today);
    expect(acclimatizationStatus(start, addDays(today, 7)).acclimatized).toBe(
      true,
    );
  });
});

describe('laterDate (worker answer vs supervisor reset)', () => {
  it('keeps the later, more cautious date', () => {
    expect(laterDate('2026-09-01', '2026-11-12')).toBe('2026-11-12');
    expect(laterDate('2026-11-12', '2026-10-29')).toBe('2026-11-12');
    expect(laterDate(null, '2026-10-29')).toBe('2026-10-29');
  });

  it('a worker answering "over 2 weeks" cannot override a recent supervisor reset', () => {
    const supervisorReset = today; // returned after leave
    const fromAnswer = startDateFromAnswer('over2', today);
    const effective = laterDate(supervisorReset, fromAnswer);
    expect(acclimatizationStatus(effective, today).acclimatized).toBe(false);
  });
});

describe('returnAfterAbsence', () => {
  it('finds the day a worker came back after 7 or more days away', () => {
    // Away 13th to 19th (7 days), back on the 20th.
    expect(
      returnAfterAbsence(['2026-11-12', '2026-11-20', '2026-11-21'], 7),
    ).toBe('2026-11-20');
  });

  it('ignores shorter gaps such as weekends', () => {
    expect(
      returnAfterAbsence(
        ['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-16'],
        7,
      ),
    ).toBeNull(); // longest gap: 11th to 15th, 5 days
    expect(returnAfterAbsence(['2026-11-12', '2026-11-19'], 7)).toBeNull(); // 6 days
  });

  it('uses the most recent absence, in any input order, with repeats', () => {
    expect(
      returnAfterAbsence(
        ['2026-11-30', '2026-10-01', '2026-11-12', '2026-11-30', '2026-10-20'],
        7,
      ),
    ).toBe('2026-11-30');
  });

  it('does nothing with no earlier shift on record, or when switched off', () => {
    expect(returnAfterAbsence(['2026-11-12'], 7)).toBeNull();
    expect(returnAfterAbsence([], 7)).toBeNull();
    expect(returnAfterAbsence(['2026-10-01', '2026-11-12'], 0)).toBeNull();
  });
});
