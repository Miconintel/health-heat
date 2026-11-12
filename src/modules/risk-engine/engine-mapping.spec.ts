import {
  AssessmentSource,
  DataQuality,
  EnginePpeAddon,
  EnginePpeClass,
  PrecautionLevel,
  RiskLevel,
  WbgtMethod,
  WorkEnvironment,
  WorkloadLevel,
} from '../../common/enums';
import {
  buildAssessRequest,
  buildForecastRequest,
  enginePpeFor,
  engineLanguage,
  exposureMinutes,
  fallbackAssessment,
  pickWbgt,
  nextBreak,
  ppeAddonsFor,
  storedForecast,
  ReadingLike,
  WorkerContext,
} from './engine-mapping';

const t = (hhmm: string) => new Date(`2026-03-15T${hhmm}:00Z`);
const reading = (
  at: Date,
  sun: number | null,
  shade: number | null,
  method = WbgtMethod.ESTIMATED,
): ReadingLike => ({
  observedAt: at,
  wbgtSunC: sun,
  wbgtShadeC: shade,
  wbgtMethod: method,
});

const ctx = (o: Partial<WorkerContext> = {}): WorkerContext => ({
  workerId: 'w1',
  siteId: 's1',
  acclimatized: true,
  preferredLanguage: 'en',
  workload: WorkloadLevel.MODERATE,
  workEnvironment: WorkEnvironment.DIRECT_SUN,
  ppe: 'standard',
  addons: { hood: false, hoodSupported: false },
  precautionLevel: PrecautionLevel.STANDARD,
  shift: {
    startsAt: t('08:00'),
    endsAt: t('16:00'),
    plannedBreaks: [],
    clockedInAt: t('08:10'),
    onBreakSince: null,
    lastBreakEndedAt: null,
  },
  ...o,
});

describe('exposureMinutes', () => {
  const base = {
    startsAt: t('08:00'),
    clockedInAt: t('08:10'),
    onBreakSince: null,
    lastBreakEndedAt: null,
  };

  it('counts from clock-in', () => {
    expect(exposureMinutes(base, t('09:10'))).toEqual({
      minutesExposed: 60,
      minutesSinceLastBreak: 60,
    });
  });

  it('falls back to the planned start when not clocked in (safe overestimate)', () => {
    expect(
      exposureMinutes({ ...base, clockedInAt: null }, t('09:10'))
        .minutesExposed,
    ).toBe(70);
  });

  it('counts since the last break', () => {
    expect(
      exposureMinutes({ ...base, lastBreakEndedAt: t('09:00') }, t('09:25'))
        .minutesSinceLastBreak,
    ).toBe(25);
  });

  it('is zero since break while on a break', () => {
    expect(
      exposureMinutes({ ...base, onBreakSince: t('09:00') }, t('09:05'))
        .minutesSinceLastBreak,
    ).toBe(0);
  });

  it('never goes negative', () => {
    expect(exposureMinutes(base, t('07:00'))).toEqual({
      minutesExposed: 0,
      minutesSinceLastBreak: 0,
    });
  });
});

describe('enginePpeFor', () => {
  it('sends the most heat-retaining clothing class', () => {
    expect(
      enginePpeFor([
        { engineClass: EnginePpeClass.COVERALL },
        { engineClass: null },
        { engineClass: EnginePpeClass.IMPERMEABLE },
      ]),
    ).toBe('impermeable');
  });
  it('defaults to standard', () => {
    expect(enginePpeFor([])).toBe('standard');
    expect(enginePpeFor([{ engineClass: null }])).toBe('standard');
  });
});

describe('enginePpeFor: double_layer (engine, 12 Nov)', () => {
  it('ranks double-layer (+3 °C) above chemical-resistant (+1) and below impermeable (+11)', () => {
    const c = (engineClass: EnginePpeClass) => ({ engineClass });
    expect(
      enginePpeFor([
        c(EnginePpeClass.CHEMICAL_RESISTANT),
        c(EnginePpeClass.DOUBLE_LAYER),
      ]),
    ).toBe('double_layer');
    expect(
      enginePpeFor([
        c(EnginePpeClass.DOUBLE_LAYER),
        c(EnginePpeClass.IMPERMEABLE),
      ]),
    ).toBe('impermeable');
  });
});

describe('engineLanguage', () => {
  it('keeps supported languages and sends anything else as English', () => {
    expect(engineLanguage('ha')).toBe('ha');
    expect(engineLanguage('pcm')).toBe('en');
    expect(engineLanguage(null)).toBe('en');
  });
});

describe('pickWbgt', () => {
  it('uses the sun value in direct sun and shade otherwise', () => {
    const r = reading(t('12:00'), 31, 28);
    expect(pickWbgt(r, WorkEnvironment.DIRECT_SUN)).toEqual({
      wbgtC: 31,
      source: 'estimated',
    });
    expect(pickWbgt(r, WorkEnvironment.SHADE)).toEqual({
      wbgtC: 28,
      source: 'estimated',
    });
  });
  it('marks sensor readings as measured and clamps to the engine range', () => {
    expect(
      pickWbgt(
        reading(t('12:00'), 55, 55, WbgtMethod.MEASURED),
        WorkEnvironment.SHADE,
      ),
    ).toEqual({ wbgtC: 50, source: 'measured' });
  });
  it('returns null without a value', () => {
    expect(
      pickWbgt(reading(t('12:00'), null, null), WorkEnvironment.SHADE),
    ).toBeNull();
    expect(pickWbgt(null, WorkEnvironment.SHADE)).toBeNull();
  });
});

describe('buildAssessRequest', () => {
  it('builds a valid engine request', () => {
    const req = buildAssessRequest(
      ctx({ preferredLanguage: 'yo' }),
      reading(t('11:00'), 29, 27),
      null,
      t('11:10'),
    );
    expect(req).toEqual({
      worker_id: 'w1',
      site_id: 's1',
      timestamp: '2026-03-15T11:10:00.000Z',
      wbgt_c: 29,
      wbgt_source: 'estimated',
      wbgt_timestamp: '2026-03-15T11:00:00.000Z',
      workload: 'moderate',
      ppe: 'standard',
      acclimatized: true,
      precaution_level: 'standard',
      minutes_exposed: 180,
      minutes_since_last_break: 180,
      language: 'yo',
    });
  });

  it('sends null WBGT and last_known when the current reading has no value', () => {
    const req = buildAssessRequest(
      ctx(),
      reading(t('11:00'), null, null),
      reading(t('10:00'), 28, 26),
      t('11:10'),
    );
    expect(req.wbgt_c).toBeNull();
    expect(req.wbgt_source).toBeNull();
    expect(req.last_known).toEqual({
      wbgt_c: 28,
      wbgt_source: 'estimated',
      timestamp: '2026-03-15T10:00:00.000Z',
    });
  });
});

describe('buildForecastRequest', () => {
  it('sends future hours within the shift, oldest first, deduplicated, with planned breaks', () => {
    const rows = [
      reading(t('13:00'), 30, 28),
      reading(t('11:00'), 29, 27), // in the past relative to now: dropped
      reading(t('12:00'), 29.5, 27.5),
      reading(t('12:00'), 29.5, 27.5), // duplicate
      reading(t('17:00'), 31, 29), // after shift end: dropped
    ];
    const req = buildForecastRequest(
      ctx({ shift: { ...ctx().shift, plannedBreaks: [t('12:30')] } }),
      rows,
      t('11:10'),
    )!;
    expect(req.hours.map((h) => h.timestamp)).toEqual([
      '2026-03-15T12:00:00.000Z',
      '2026-03-15T13:00:00.000Z',
    ]);
    expect(req.hours[0].rest_break).toBe(true);
    expect(req.hours[1].rest_break).toBeUndefined();
    expect(req.minutes_exposed).toBe(230); // at the first hour, 08:10 -> 12:00
  });

  it('caps at 24 hours', () => {
    const rows = Array.from({ length: 30 }, (_, i) =>
      reading(new Date(t('00:00').getTime() + (i + 1) * 3_600_000), 25, 24),
    );
    const req = buildForecastRequest(
      ctx({
        shift: {
          ...ctx().shift,
          startsAt: t('00:00'),
          endsAt: new Date(t('00:00').getTime() + 40 * 3_600_000),
        },
      }),
      rows,
      t('00:00'),
    )!;
    expect(req.hours).toHaveLength(24);
  });

  it('returns null when there is nothing ahead', () => {
    expect(buildForecastRequest(ctx(), [], t('11:00'))).toBeNull();
  });
});

describe('fallbackAssessment', () => {
  it('assumes at least High with degraded data', () => {
    const fb = fallbackAssessment(null, t('12:00'));
    expect(fb.level).toBe(RiskLevel.HIGH);
    expect(fb.dataQuality).toBe(DataQuality.DEGRADED);
  });

  it('never goes below a recent engine level', () => {
    const prev = {
      level: RiskLevel.CRITICAL,
      assessedAt: t('11:30'),
      source: AssessmentSource.ENGINE,
    };
    expect(fallbackAssessment(prev, t('12:00')).level).toBe(RiskLevel.CRITICAL);
    expect(fallbackAssessment(prev, t('12:00')).action.when).toBe(
      'immediately',
    );
  });

  it('ignores stale previous levels', () => {
    const prev = {
      level: RiskLevel.CRITICAL,
      assessedAt: t('09:00'),
      source: AssessmentSource.ENGINE,
    };
    expect(fallbackAssessment(prev, t('12:00')).level).toBe(RiskLevel.HIGH);
  });
});

describe('hood (engine field, live since 12 Nov)', () => {
  const items = [{ engineAddon: EnginePpeAddon.HOOD }, { engineAddon: null }];

  it('flags a hood the engine cannot count yet', () => {
    expect(ppeAddonsFor(items, false)).toEqual({
      hood: true,
      hoodSupported: false,
      notModelled: ['hood'],
    });
    expect(ppeAddonsFor([{ engineAddon: null }], false).notModelled).toEqual(
      [],
    );
  });

  it('never sends `hood` while the engine does not support it (it would 422)', () => {
    const req = buildAssessRequest(
      ctx({ addons: { hood: true, hoodSupported: false } }),
      reading(t('11:00'), 29, 27),
      null,
      t('11:10'),
    );
    expect('hood' in req).toBe(false);
  });

  it('sends `hood` with impermeable suits too (the engine adds it: 11 + 1)', () => {
    const c = ctx({
      ppe: 'impermeable',
      addons: { hood: true, hoodSupported: true },
    });
    const req = buildAssessRequest(
      c,
      reading(t('11:00'), 29, 27),
      null,
      t('11:10'),
    );
    expect(req.ppe).toBe('impermeable');
    expect(req.hood).toBe(true);
    expect(
      ppeAddonsFor([{ engineAddon: EnginePpeAddon.HOOD }], true).notModelled,
    ).toEqual([]);
  });

  it('sends `hood` on assess and forecast once supported', () => {
    const c = ctx({ addons: { hood: true, hoodSupported: true } });
    expect(
      buildAssessRequest(c, reading(t('11:00'), 29, 27), null, t('11:10')).hood,
    ).toBe(true);
    expect(
      buildForecastRequest(c, [reading(t('12:00'), 29, 27)], t('11:10'))!.hood,
    ).toBe(true);
    const off = ctx({ addons: { hood: false, hoodSupported: true } });
    expect(
      buildAssessRequest(off, reading(t('11:00'), 29, 27), null, t('11:10'))
        .hood,
    ).toBe(false);
  });
});

describe('storedForecast (engine request #4: forecast uncertainty)', () => {
  const hour = (
    at: string,
    level: 1 | 2 | 3 | 4,
    extra: Record<string, unknown> = {},
  ) => ({
    worker_id: 'w1',
    timestamp: at,
    level,
    label: 'x',
    reasons: [],
    action: { what: 'a', when: 'now' as const },
    wbgt_c: 30,
    wbgt_source: 'estimated' as const,
    data_quality: 'ok' as const,
    ...extra,
  });
  const forecast = (
    hours: ReturnType<typeof hour>[],
    extra: Record<string, unknown> = {},
  ) => ({
    worker_id: 'w1',
    hours,
    first_reached: [],
    peak_level: Math.max(...hours.map((h) => h.level)),
    peak_label: 'x',
    peak_at: hours[0].timestamp,
    data_quality: 'ok' as const,
    ...extra,
  });

  it('works unchanged when the engine sends no uncertainty fields', () => {
    const s = storedForecast(forecast([hour('2026-03-15T12:00:00Z', 3)]));
    expect(s.hours[0]).toMatchObject({
      level: 3,
      possibleLevel: null,
      possibleLabel: null,
      confidence: null,
    });
    expect(s.confidence).toBeNull();
    expect(s.possiblePeak).toBeNull();
  });

  it('keeps a possible level above the definite level, with confidence', () => {
    const s = storedForecast(
      forecast(
        [
          hour('2026-03-15T12:00:00Z', 3),
          hour('2026-03-15T13:00:00Z', 3, {
            possible_level: 4,
            possible_label: 'Critical',
            confidence: 'moderate',
          }),
        ],
        {
          confidence: 'moderate',
          confidence_note: 'Forecast humidity is uncertain',
        },
      ),
    );
    expect(s.hours[1]).toMatchObject({
      possibleLevel: 4,
      possibleLabel: 'Critical',
      confidence: 'moderate',
    });
    expect(s.confidence).toBe('moderate');
    expect(s.confidenceNote).toBe('Forecast humidity is uncertain');
    expect(s.possiblePeak).toEqual({
      level: 4,
      at: new Date('2026-03-15T13:00:00Z'),
    });
  });

  it('ignores possible levels that are not higher, or invalid values', () => {
    const s = storedForecast(
      forecast([
        hour('2026-03-15T12:00:00Z', 3, { possible_level: 3 }),
        hour('2026-03-15T13:00:00Z', 2, {
          possible_level: 9,
          confidence: 'certain',
        }),
      ]),
    );
    expect(s.hours.map((h) => h.possibleLevel)).toEqual([null, null]);
    expect(s.hours[1].confidence).toBeNull();
    expect(s.possiblePeak).toBeNull();
  });

  it('falls back to an English label when the engine sends none', () => {
    const s = storedForecast(
      forecast([hour('2026-03-15T12:00:00Z', 2, { possible_level: 3 })]),
    );
    expect(s.hours[0].possibleLabel).toBe('High');
  });
});

describe('nextBreak', () => {
  const at = (hhmm: string) => new Date(`2026-03-15T${hhmm}:00Z`);
  const a = {
    plannedBreaks: [at('11:00'), at('14:00')],
    breakMinutes: 15,
    onBreakSince: null,
    endsAt: at('16:00'),
  };

  it('gives the next planned break and minutes until it', () => {
    expect(nextBreak(a, at('10:48'))).toEqual({
      onBreakNow: false,
      since: null,
      startsAt: at('11:00'),
      minutesUntil: 12,
      durationMinutes: 15,
    });
  });

  it('says on a break now', () => {
    expect(
      nextBreak({ ...a, onBreakSince: at('11:02') }, at('11:05')),
    ).toMatchObject({ onBreakNow: true, since: at('11:02') });
  });

  it('is null when no break is left in the shift', () => {
    expect(nextBreak(a, at('14:30'))).toBeNull();
  });
});

describe('forecast with a sent shift plan', () => {
  it('uses the planned workload and break for each hour', () => {
    const plan = new Map([
      [
        t('12:00').getTime(),
        { workload: WorkloadLevel.HEAVY, restBreak: false },
      ],
      [
        t('13:00').getTime(),
        { workload: WorkloadLevel.LIGHT, restBreak: true },
      ],
    ]);
    const req = buildForecastRequest(
      ctx({ hourPlan: plan }),
      [
        reading(t('12:00'), 29, 27),
        reading(t('13:00'), 30, 28),
        reading(t('14:00'), 30, 28),
      ],
      t('11:10'),
    )!;
    expect(req.hours.map((h) => [h.workload, h.rest_break ?? false])).toEqual([
      ['heavy', false],
      ['light', true],
      ['moderate', false], // no plan entry: the current workload
    ]);
  });
});

describe('wearable band summary (proposed engine request #5)', () => {
  const band = {
    measuredAt: t('11:08'),
    heartRateBpm: 128,
    heartRateAvg10MinBpm: 121,
    minutesHeartRateAtOrAbove120: 9,
    skinTempC: 35.6,
    skinTempChange30MinC: 0.8,
    minutesOfData: 30,
  };

  it('is not sent without a summary (switch off, no band, or stale data)', () => {
    const req = buildAssessRequest(
      ctx(),
      reading(t('11:00'), 29, 27),
      null,
      t('11:10'),
    );
    expect('wearable' in req).toBe(false);
  });

  it('is sent in the engine shape when present', () => {
    const req = buildAssessRequest(
      ctx({ wearable: band }),
      reading(t('11:00'), 29, 27),
      null,
      t('11:10'),
    );
    expect(req.wearable).toEqual({
      measured_at: '2026-03-15T11:08:00.000Z',
      heart_rate_bpm: 128,
      heart_rate_avg_10min_bpm: 121,
      minutes_heart_rate_at_or_above_120: 9,
      skin_temp_c: 35.6,
      skin_temp_change_30min_c: 0.8,
      minutes_of_data: 30,
    });
  });
});
