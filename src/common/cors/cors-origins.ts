/**
 * CORS_ORIGINS is a comma-separated list of browser origins. An entry may contain `*`,
 * which matches one DNS label part (letters, digits, hyphens; never a dot), e.g.
 *   https://heat-guard-*-ahmads-projects-727aea25.vercel.app
 * allows the frontend's Vercel preview deployments, and only that Vercel team's,
 * because the team suffix can't be claimed by anyone else.
 */
export function corsOriginMatcher(
  list: string,
): (origin: string | undefined) => boolean {
  const entries = list
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const exact = new Set(entries.filter((e) => !e.includes('*')));
  const patterns = entries
    .filter((e) => e.includes('*'))
    .map(
      (e) =>
        new RegExp(
          `^${e
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('[a-z0-9-]+')}$`,
          'i',
        ),
    );
  return (origin) =>
    !!origin && (exact.has(origin) || patterns.some((p) => p.test(origin)));
}
