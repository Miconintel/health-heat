import { corsOriginMatcher } from './cors-origins';

describe('corsOriginMatcher', () => {
  const allowed = corsOriginMatcher(
    'https://heat-guard-nine.vercel.app, http://localhost:5173, https://heat-guard-*-ahmads-projects-727aea25.vercel.app',
  );

  it('allows the exact origins', () => {
    expect(allowed('https://heat-guard-nine.vercel.app')).toBe(true);
    expect(allowed('http://localhost:5173')).toBe(true);
  });

  it("allows the team's Vercel previews", () => {
    expect(
      allowed(
        'https://heat-guard-abc123xyz-ahmads-projects-727aea25.vercel.app',
      ),
    ).toBe(true);
    expect(
      allowed(
        'https://heat-guard-git-feature-login-ahmads-projects-727aea25.vercel.app',
      ),
    ).toBe(true);
  });

  it('rejects look-alikes and everything else', () => {
    expect(allowed('https://heat-guard-evil.vercel.app')).toBe(false);
    expect(
      allowed(
        'https://heat-guard-x.evil.com-ahmads-projects-727aea25.vercel.app',
      ),
    ).toBe(false);
    expect(
      allowed(
        'https://heat-guard-x-ahmads-projects-727aea25.vercel.app.evil.com',
      ),
    ).toBe(false);
    expect(allowed('http://localhost:3000')).toBe(false);
    expect(allowed(undefined)).toBe(false);
  });
});
