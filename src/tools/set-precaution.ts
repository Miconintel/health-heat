/* Back-office: set a worker's precaution level without an occupational health screen.
 *
 *   npm run precaution:set -- W-0384 enhanced ["Extra 10 min break each hour at level 3 and above"]
 *   levels: standard | enhanced | high_priority
 *
 * Signs in as an occupational health account (OH_LOGIN_ID / OH_PIN, default O-001 and
 * SEED_DEMO_PIN), so the change is made by the right role and appears in the audit log
 * and in the worker's "Who looked at your data". The worker is reassessed straight away.
 */
import 'dotenv/config';

const [workerCode, level, ...restrictions] = process.argv.slice(2);
const api =
  process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}/api/v1`;
const ohId = process.env.OH_LOGIN_ID ?? 'O-001';
const ohPin = process.env.OH_PIN ?? process.env.SEED_DEMO_PIN ?? '1234';
const LEVELS = ['standard', 'enhanced', 'high_priority'];

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
  if (!workerCode || !LEVELS.includes(level)) {
    console.error(
      'Usage: npm run precaution:set -- <workerId e.g. W-0384> <standard|enhanced|high_priority> ["restriction" ...]',
    );
    process.exit(1);
  }
  const { accessToken } = await call<{ accessToken: string }>(
    'POST',
    '/auth/login',
    undefined,
    {
      loginId: ohId,
      pin: ohPin,
    },
  );
  const workers = await call<{ id: string; employeeCode: string }[]>(
    'GET',
    '/workers',
    accessToken,
  );
  const worker = workers.find(
    (w) => w.employeeCode.toUpperCase() === workerCode.toUpperCase(),
  );
  if (!worker) throw new Error(`No worker ${workerCode}`);
  await call(
    'POST',
    `/workers/${worker.id}/health-profile/approve`,
    accessToken,
    {
      precautionLevel: level,
      ...(restrictions.length ? { restrictions } : {}),
    },
  );
  console.log(
    `${worker.employeeCode}: precaution level set to ${level}${restrictions.length ? ` (${restrictions.length} restriction(s))` : ''}`,
  );
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
