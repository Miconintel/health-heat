import { hourInstants, localDate, localDayStart } from './time';

describe('time helpers', () => {
  it('local date in Abuja is a day ahead late in the UTC evening', () => {
    expect(localDate('Africa/Lagos', new Date('2026-11-11T23:30:00Z'))).toBe(
      '2026-11-12',
    );
    expect(localDate('UTC', new Date('2026-11-11T23:30:00Z'))).toBe(
      '2026-11-11',
    );
  });

  it('local midnight in Abuja (UTC+1) is 23:00 UTC the previous day', () => {
    expect(
      localDayStart(
        'Africa/Lagos',
        new Date('2026-11-12T10:00:00Z'),
      ).toISOString(),
    ).toBe('2026-11-11T23:00:00.000Z');
    expect(
      localDayStart(
        'Africa/Lagos',
        new Date('2026-11-11T23:30:00Z'),
      ).toISOString(),
    ).toBe('2026-11-11T23:00:00.000Z');
  });

  it('works for UTC', () => {
    expect(
      localDayStart('UTC', new Date('2026-11-12T10:00:00Z')).toISOString(),
    ).toBe('2026-11-12T00:00:00.000Z');
  });
});

describe('hourInstants', () => {
  it('rolls a night shift over midnight', () => {
    const t = hourInstants('Africa/Lagos', '2026-11-12', [
      '22:00',
      '23:00',
      '00:00',
      '01:00',
    ]).map((d) => d.toISOString());
    expect(t).toEqual([
      '2026-11-12T21:00:00.000Z',
      '2026-11-12T22:00:00.000Z',
      '2026-11-12T23:00:00.000Z',
      '2026-11-13T00:00:00.000Z',
    ]);
  });
});
