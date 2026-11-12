import { mixesNone } from './profile-options';

describe('mixesNone', () => {
  it('rejects "none" combined with another answer', () => {
    expect(mixesNone(['none', 'heart'])).toBe(true);
    expect(mixesNone(['none'])).toBe(false);
    expect(mixesNone(['heart', 'lungs'])).toBe(false);
    expect(mixesNone(undefined)).toBe(false);
  });
});
