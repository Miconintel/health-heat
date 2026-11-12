import { Confidence } from '../../../common/enums';
import { estimateWbgt } from './wbgt-estimator';

describe('estimateWbgt', () => {
  it('matches the BoM approximation for a known point (30 °C, 50 % RH)', () => {
    // e = 0.5 * 6.105 * exp(17.27*30/267.7) ≈ 21.2 hPa → WBGT ≈ 0.567*30 + 0.393*21.2 + 3.94 ≈ 29.3
    const r = estimateWbgt({
      airTempC: 30,
      relativeHumidity: 50,
      solarRadiationWm2: 0,
    });
    expect(r.shadeC).toBeCloseTo(29.3, 1);
    expect(r.sunC).toBe(r.shadeC);
  });

  it('adds a capped solar increment in sun', () => {
    const r = estimateWbgt({
      airTempC: 30,
      relativeHumidity: 50,
      solarRadiationWm2: 2000,
    });
    expect(r.sunC! - r.shadeC!).toBeCloseTo(3, 1);
  });

  it('never reports HIGH confidence for an estimate', () => {
    expect(
      estimateWbgt({
        airTempC: 30,
        relativeHumidity: 50,
        solarRadiationWm2: 500,
      }).confidence,
    ).toBe(Confidence.MEDIUM);
    expect(
      estimateWbgt({
        airTempC: 30,
        relativeHumidity: 50,
        solarRadiationWm2: null,
      }).confidence,
    ).toBe(Confidence.LOW);
  });

  it('returns nulls when inputs are missing', () => {
    expect(
      estimateWbgt({
        airTempC: null,
        relativeHumidity: 50,
        solarRadiationWm2: 0,
      }).shadeC,
    ).toBeNull();
  });
});
