import {
  ACCLIMATIZATION_DAYS,
  acclimatizationStatus,
  addDays,
  laterDate,
  startDateFromAnswer,
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
