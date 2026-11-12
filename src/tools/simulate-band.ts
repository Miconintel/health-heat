/* Wearable band simulator for demos (there is no real band hardware).
 *
 *   npm run band:simulate -- W-0412 1234 --profile strained --minutes 30 [--follow] [--api http://localhost:3000/api/v1]
 *
 * Logs in as the worker (ID + PIN), pairs a simulated band ("SIM-<id>"), backfills one
 * reading per minute for the last N minutes, and with --follow keeps sending one a minute.
 * Needs WEARABLES_ENABLED=true on the API and the worker's "Wearable band" consent.
 */

type Profile = 'resting' | 'working' | 'strained';

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [loginId, pin] = args.filter(
  (a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'),
);
const api = flag(
  'api',
  process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api/v1`,
);
const profile = (flag('profile', 'working') as Profile) ?? 'working';
const minutes = Number(flag('minutes', '30'));
const follow = args.includes('--follow');

/** Heart rate and skin temperature `minAgo` minutes ago for a profile (with a little noise). */
function sample(p: Profile, minutesIntoWindow: number) {
  const noise = (n: number) => (Math.random() - 0.5) * n;
  const t = minutesIntoWindow;
  switch (p) {
    case 'resting':
      return {
        heartRateBpm: Math.round(76 + noise(8)),
        skinTempC: +(33.4 + noise(0.2)).toFixed(1),
      };
    case 'working':
      return {
        heartRateBpm: Math.round(108 + noise(10)),
        skinTempC: +(34.4 + t * 0.01 + noise(0.2)).toFixed(1),
      };
    case 'strained': // climbing heart rate and skin temperature
      return {
        heartRateBpm: Math.round(Math.min(165, 112 + t * 1.4 + noise(6))),
        skinTempC: +Math.min(36.8, 34.5 + t * 0.06 + noise(0.15)).toFixed(1),
      };
  }
}

async function call<T>(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function main() {
  if (!loginId || !pin) {
    console.error(
      'Usage: npm run band:simulate -- <loginId> <pin> [--profile resting|working|strained] [--minutes 30] [--follow]',
    );
    process.exit(1);
  }
  const { accessToken } = await call<{ accessToken: string }>(
    'POST',
    '/auth/login',
    undefined,
    { loginId, pin },
  );
  const deviceId = `SIM-${loginId.toUpperCase()}`;
  await call('PUT', '/me/wearable', accessToken, {
    deviceId,
    model: 'HeatGuard band simulator',
  });

  const now = Date.now();
  const readings = Array.from({ length: minutes }, (_, i) => ({
    at: new Date(now - (minutes - 1 - i) * 60_000).toISOString(),
    ...sample(profile, i),
  }));
  const res = await call<{ accepted: number }>(
    'POST',
    '/me/wearable/readings',
    accessToken,
    {
      deviceId,
      batteryPercent: 82,
      readings,
    },
  );
  const last = readings[readings.length - 1];
  console.log(
    `${deviceId}: sent ${res.accepted} readings (${profile}); latest ${last.heartRateBpm} bpm, ${last.skinTempC} °C`,
  );

  if (!follow) return;
  let i = minutes;
  console.log('Following: one reading a minute (Ctrl+C to stop)');
  setInterval(() => {
    const r = { at: new Date().toISOString(), ...sample(profile, i++) };
    call('POST', '/me/wearable/readings', accessToken, {
      deviceId,
      readings: [r],
    })
      .then(() =>
        console.log(`${r.at}  ${r.heartRateBpm} bpm  ${r.skinTempC} °C`),
      )
      .catch((e: Error) => console.error(e.message));
  }, 60_000);
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
