/**
 * "Other climate hazards today" (worker home "Also today", supervisor Today).
 * Rule-based from the stored weather and air-quality readings.
 *
 * PLACEHOLDER thresholds: confirm with the team (WHO 24-h PM10 guideline is
 * 45 µg/m³; Harmattan dust in Abuja regularly exceeds 150).
 */
export const DUST_MODERATE_PM10 = 150;
export const DUST_HIGH_PM10 = 250;
export const DUST_MODERATE_DUST = 100;
export const DUST_HIGH_DUST = 300;
/** WMO codes: 95 thunderstorm, 96/99 thunderstorm with hail. */
export const THUNDERSTORM_CODES = new Set([95, 96, 99]);

export interface HazardReading {
  observedAt: Date;
  weatherCode: number | null;
  dustUgM3: number | null;
  pm10UgM3: number | null;
}

export type Hazard =
  | {
      type: 'dust';
      severity: 'moderate' | 'high';
      from: Date;
      to: Date;
      peakPm10UgM3: number | null;
      peakDustUgM3: number | null;
    }
  | { type: 'thunderstorm'; severity: 'possible'; from: Date; to: Date };

const HOUR = 3_600_000;

export function detectHazards(readings: HazardReading[]): Hazard[] {
  const rows = [...readings].sort(
    (a, b) => a.observedAt.getTime() - b.observedAt.getTime(),
  );
  const out: Hazard[] = [];

  const dustLevel = (r: HazardReading): 0 | 1 | 2 => {
    const pm = r.pm10UgM3 ?? -1;
    const d = r.dustUgM3 ?? -1;
    if (pm >= DUST_HIGH_PM10 || d >= DUST_HIGH_DUST) return 2;
    if (pm >= DUST_MODERATE_PM10 || d >= DUST_MODERATE_DUST) return 1;
    return 0;
  };
  const dusty = rows.filter((r) => dustLevel(r) > 0);
  if (dusty.length) {
    const max = (xs: (number | null)[]) =>
      xs.some((x) => x !== null)
        ? Math.max(...xs.filter((x): x is number => x !== null))
        : null;
    out.push({
      type: 'dust',
      severity: dusty.some((r) => dustLevel(r) === 2) ? 'high' : 'moderate',
      from: dusty[0].observedAt,
      to: new Date(dusty[dusty.length - 1].observedAt.getTime() + HOUR),
      peakPm10UgM3: max(dusty.map((r) => r.pm10UgM3)),
      peakDustUgM3: max(dusty.map((r) => r.dustUgM3)),
    });
  }

  const storms = rows.filter(
    (r) => r.weatherCode !== null && THUNDERSTORM_CODES.has(r.weatherCode),
  );
  if (storms.length) {
    out.push({
      type: 'thunderstorm',
      severity: 'possible',
      from: storms[0].observedAt,
      to: new Date(storms[storms.length - 1].observedAt.getTime() + HOUR),
    });
  }
  return out;
}
