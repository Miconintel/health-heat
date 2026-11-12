/**
 * What the backend sends the engine about a worker's band (proposed engine request #5):
 * a short summary of the last 30 minutes, never the raw stream.
 */

/** Band data older than this is not sent (the engine treats it as absent). */
export const WEARABLE_FRESH_MINUTES = 10;
const WINDOW_MIN = 30;

export interface Sample {
  at: Date;
  heartRateBpm: number | null;
  skinTempC: number | null;
}

export interface WearableSummary {
  measuredAt: Date;
  heartRateBpm: number | null;
  /** Mean heart rate over the last 10 minutes. */
  heartRateAvg10MinBpm: number | null;
  /** Minutes in the last 30 with heart rate at or above 120 bpm (context only; the engine applies its own limit). */
  minutesHeartRateAtOrAbove120: number;
  skinTempC: number | null;
  /** Change in skin temperature over the last 30 minutes, °C. */
  skinTempChange30MinC: number | null;
  /** Minutes covered by samples in the window. */
  minutesOfData: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Null when there is no fresh sample. */
export function summarise(
  samples: Sample[],
  now: Date,
): WearableSummary | null {
  const from = now.getTime() - WINDOW_MIN * 60_000;
  const rows = samples
    .filter((s) => s.at.getTime() >= from && s.at.getTime() <= now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  if (now.getTime() - last.at.getTime() > WEARABLE_FRESH_MINUTES * 60_000)
    return null;

  const hr10 = rows
    .filter(
      (r) =>
        r.at.getTime() >= now.getTime() - 10 * 60_000 &&
        r.heartRateBpm !== null,
    )
    .map((r) => r.heartRateBpm as number);
  const latest = <K extends 'heartRateBpm' | 'skinTempC'>(k: K) =>
    [...rows].reverse().find((r) => r[k] !== null)?.[k] ?? null;
  const temps = rows.filter((r) => r.skinTempC !== null);
  const minuteSet = (pred: (r: Sample) => boolean) =>
    new Set(rows.filter(pred).map((r) => Math.floor(r.at.getTime() / 60_000)))
      .size;

  return {
    measuredAt: last.at,
    heartRateBpm: latest('heartRateBpm'),
    heartRateAvg10MinBpm: hr10.length
      ? Math.round(hr10.reduce((a, b) => a + b, 0) / hr10.length)
      : null,
    minutesHeartRateAtOrAbove120: minuteSet(
      (r) => (r.heartRateBpm ?? 0) >= 120,
    ),
    skinTempC: latest('skinTempC'),
    skinTempChange30MinC:
      temps.length >= 2
        ? round1(
            (temps[temps.length - 1].skinTempC as number) -
              (temps[0].skinTempC as number),
          )
        : null,
    minutesOfData: minuteSet(() => true),
  };
}
