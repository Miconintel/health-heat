import { detectHazards } from './hazards';

const r = (
  hh: number,
  o: { code?: number; dust?: number; pm10?: number } = {},
) => ({
  observedAt: new Date(`2026-03-15T${String(hh).padStart(2, '0')}:00:00Z`),
  weatherCode: o.code ?? null,
  dustUgM3: o.dust ?? null,
  pm10UgM3: o.pm10 ?? null,
});

describe('detectHazards', () => {
  it('finds nothing on a clear day', () => {
    expect(
      detectHazards([r(10, { code: 1, pm10: 40 }), r(11, { code: 2 })]),
    ).toEqual([]);
  });

  it('flags dust with its window and peak', () => {
    const [d] = detectHazards([
      r(9, { pm10: 80 }),
      r(10, { pm10: 170 }),
      r(11, { pm10: 260, dust: 120 }),
    ]);
    expect(d).toMatchObject({
      type: 'dust',
      severity: 'high',
      peakPm10UgM3: 260,
      peakDustUgM3: 120,
    });
    expect(d.from.toISOString()).toBe('2026-03-15T10:00:00.000Z');
    expect(d.to.toISOString()).toBe('2026-03-15T12:00:00.000Z');
  });

  it('flags possible thunderstorms from WMO codes 95 to 99', () => {
    const hz = detectHazards([
      r(15, { code: 3 }),
      r(16, { code: 95 }),
      r(17, { code: 96 }),
    ]);
    expect(hz).toEqual([
      {
        type: 'thunderstorm',
        severity: 'possible',
        from: new Date('2026-03-15T16:00:00Z'),
        to: new Date('2026-03-15T18:00:00Z'),
      },
    ]);
  });
});
