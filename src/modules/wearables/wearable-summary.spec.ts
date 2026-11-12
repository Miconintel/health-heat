import { summarise } from './wearable-summary';

const now = new Date('2026-11-12T10:30:00Z');
const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000);

describe('summarise (band data sent to the engine)', () => {
  it('is null without fresh data', () => {
    expect(summarise([], now)).toBeNull();
    expect(
      summarise([{ at: at(15), heartRateBpm: 100, skinTempC: 34 }], now),
    ).toBeNull();
  });

  it('summarises the last 30 minutes', () => {
    const samples = Array.from({ length: 31 }, (_, i) => ({
      at: at(30 - i),
      heartRateBpm: 100 + i, // rising from 100 to 130
      skinTempC: 34 + i * 0.05,
    }));
    const s = summarise(samples, now)!;
    expect(s.heartRateBpm).toBe(130);
    expect(s.heartRateAvg10MinBpm).toBe(125); // 120..130
    expect(s.minutesHeartRateAtOrAbove120).toBe(11);
    expect(s.skinTempC).toBeCloseTo(35.5, 5);
    expect(s.skinTempChange30MinC).toBe(1.5);
    expect(s.minutesOfData).toBe(31);
  });

  it('ignores readings outside the window or in the future', () => {
    const s = summarise(
      [
        { at: at(45), heartRateBpm: 180, skinTempC: null },
        { at: at(2), heartRateBpm: 90, skinTempC: null },
        {
          at: new Date(now.getTime() + 60_000),
          heartRateBpm: 200,
          skinTempC: null,
        },
      ],
      now,
    )!;
    expect(s.heartRateBpm).toBe(90);
    expect(s.minutesHeartRateAtOrAbove120).toBe(0);
    expect(s.skinTempChange30MinC).toBeNull();
  });
});
