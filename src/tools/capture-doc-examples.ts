/**
 * Captures one real response per endpoint and writes src/docs/response-examples.ts,
 * which Swagger uses for the response schema and example of endpoints that return
 * plain objects (no response class).
 *
 *   npm run docs:examples                       # http://localhost:3000/api/v1
 *   npm run docs:examples -- http://localhost:3100/api/v1
 *
 * LOCAL ONLY: it logs in with the demo accounts and creates data (water logs, help
 * requests, a symptom report, a band, a sent plan, a test login), and erases W-0388's
 * health data. Run it against a local server on a freshly seeded demo database
 * (`npm run seed && npm run seed:demo`), with WEARABLES_ENABLED=true, then reseed.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Schema = Record<string, unknown>;

const api = (process.argv[2] ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(`${api}/`)) {
  console.error(
    `Refusing to run against ${api}: this tool writes data. Use a local server.`,
  );
  process.exit(1);
}
const PREFIX = new URL(api).pathname; // "/api/v1"

// ---- schema inference --------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function infer(v: Json): Schema {
  if (v === null) return { nullable: true };
  if (Array.isArray(v))
    return {
      type: 'array',
      items: v.length ? v.map(infer).reduce(merge) : {},
    };
  switch (typeof v) {
    case 'boolean':
      return { type: 'boolean' };
    case 'number':
      return { type: Number.isInteger(v) ? 'integer' : 'number' };
    case 'string':
      return UUID.test(v)
        ? { type: 'string', format: 'uuid' }
        : DATE_TIME.test(v)
          ? { type: 'string', format: 'date-time' }
          : DATE.test(v)
            ? { type: 'string', format: 'date' }
            : { type: 'string' };
    default: {
      const keys = Object.keys(v);
      // Maps keyed by IDs (e.g. a plan's crews by crewId) become additionalProperties.
      if (keys.length && keys.every((k) => UUID.test(k)))
        return {
          type: 'object',
          description: 'Keyed by ID',
          additionalProperties: keys.map((k) => infer(v[k])).reduce(merge),
        };
      return {
        type: 'object',
        properties: Object.fromEntries(keys.map((k) => [k, infer(v[k])])),
        required: keys,
      };
    }
  }
}

/** Combine two schemas seen for the same place (array items, nulls, merged objects). */
function merge(a: Schema, b: Schema): Schema {
  const nullable = !!(a.nullable || b.nullable);
  const ta = a.type as string | undefined;
  const tb = b.type as string | undefined;
  const typed = (s: Schema) => (nullable ? { ...s, nullable: true } : s);
  if (!ta) return typed({ ...b });
  if (!tb) return typed({ ...a });
  if (ta !== tb) {
    if (
      [ta, tb].every((t) => t === 'integer' || t === 'number') // 3 and 3.5
    )
      return typed({ type: 'number' });
    return typed({ oneOf: [strip(a), strip(b)] });
  }
  if (ta === 'array')
    return typed({
      type: 'array',
      items: merge((a.items as Schema) ?? {}, (b.items as Schema) ?? {}),
    });
  if (ta === 'object') {
    if (a.additionalProperties || b.additionalProperties)
      return typed({
        type: 'object',
        description: 'Keyed by ID',
        additionalProperties: merge(
          (a.additionalProperties as Schema) ?? {},
          (b.additionalProperties as Schema) ?? {},
        ),
      });
    const pa = (a.properties as Record<string, Schema>) ?? {};
    const pb = (b.properties as Record<string, Schema>) ?? {};
    const props: Record<string, Schema> = {};
    for (const k of new Set([...Object.keys(pa), ...Object.keys(pb)]))
      props[k] = pa[k] && pb[k] ? merge(pa[k], pb[k]) : (pa[k] ?? pb[k]);
    const ra = (a.required as string[]) ?? [];
    const rb = new Set((b.required as string[]) ?? []);
    return typed({
      type: 'object',
      properties: props,
      required: ra.filter((k) => rb.has(k)),
    });
  }
  if (ta === 'string' && a.format !== b.format)
    return typed({ type: 'string' });
  return typed({ ...a });
}

function strip(s: Schema): Schema {
  const rest = { ...s };
  delete rest.nullable;
  return rest;
}

/** Keep examples readable: at most 3 items per array, tokens replaced. */
function trim(v: Json, key = ''): Json {
  if (/token$/i.test(key) && typeof v === 'string')
    return 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => trim(x));
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, trim(x, k)]),
    );
  return v;
}

// ---- calls ---------------------------------------------------------------------

const out: Record<string, { status: number; schema: Schema; example: Json }> =
  {};
const failures: string[] = [];

async function call<T = Json>(
  method: string,
  /** Path with {params} as documented, e.g. "/sites/{siteId}/today". */
  docPath: string,
  params: Record<string, string>,
  token: string | null,
  body?: unknown,
  query = '',
): Promise<T | null> {
  const path = docPath.replace(/\{(\w+)\}/g, (_, k: string) => params[k]);
  const res = await fetch(`${api}${path}${query}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = (text ? JSON.parse(text) : null) as Json;
  const key = `${method.toLowerCase()} ${PREFIX}${docPath}`;
  if (!res.ok) {
    failures.push(`${key} -> ${res.status} ${text.slice(0, 160)}`);
    return null;
  }
  const schema = infer(data);
  const prev = out[key];
  out[key] = {
    status: res.status,
    schema: prev ? merge(prev.schema, schema) : schema,
    example: prev?.example ?? trim(data),
  };
  return data as T;
}

async function login(loginId: string, pin = '1234', record = false) {
  const body = { loginId, pin };
  const r = record
    ? await call<{ accessToken: string; refreshToken: string }>(
        'POST',
        '/auth/login',
        {},
        null,
        body,
      )
    : ((await (
        await fetch(`${api}/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json()) as { accessToken: string; refreshToken: string });
  if (!r?.accessToken) throw new Error(`Login failed for ${loginId}`);
  return r;
}

type Me = { worker: { id: string } };
type Site = { id: string };
type Help = { id: string };

async function main() {
  await call('GET', '/health', {}, null);

  const sup = await login('S-001', '1234', true);
  await call('POST', '/auth/refresh', {}, null, {
    refreshToken: sup.refreshToken,
  });
  const S = sup.accessToken;
  const A = (await login('A-002')).accessToken;
  const O = (await login('O-001')).accessToken;
  const W12 = (await login('W-0412')).accessToken;
  const W88 = (await login('W-0388')).accessToken;

  // ---- users (admin) ----
  await call('GET', '/users/me', {}, A);
  await call('GET', '/users', {}, A);
  const created = await call<{ id: string }>('POST', '/users', {}, A, {
    loginId: `O-DOC-${Date.now().toString(36).toUpperCase()}`,
    pin: '5678',
    role: 'occupational_health',
  });
  if (created)
    await call('PUT', '/users/{userId}/pin', { userId: created.id }, A, {
      pin: '8765',
    });

  // ---- site, environment, risk ----
  const sites = (await (
    await fetch(`${api}/sites`, { headers: { authorization: `Bearer ${S}` } })
  ).json()) as Site[];
  const siteId = sites[0].id;
  const s = { siteId };
  await call('POST', '/sites/{siteId}/environment/refresh', s, S);
  await call('GET', '/sites/{siteId}/environment', s, S);
  await call('POST', '/sites/{siteId}/assessments/run', s, S);
  await call('GET', '/sites/{siteId}/risk-overview', s, S);

  const me12 = (await (
    await fetch(`${api}/me`, { headers: { authorization: `Bearer ${W12}` } })
  ).json()) as Me;
  const me88 = (await (
    await fetch(`${api}/me`, { headers: { authorization: `Bearer ${W88}` } })
  ).json()) as Me;
  await call('GET', '/me/risk', {}, W12);
  await call('GET', '/me/risk', {}, W88);
  await call(
    'GET',
    '/workers/{workerId}/risk',
    { workerId: me12.worker.id },
    O,
  );

  // ---- worker W-0388: consents, water, heartbeat, help, band ----
  await call('PUT', '/me/consents', {}, W88, {
    healthPrecautions: true,
    wearableBand: true,
    symptomReports: true,
    policyVersion: '2026-11-v1',
  });
  await call('POST', '/me/water', {}, W88, { cups: 1 });
  await call('GET', '/me/water', {}, W88);
  await call('POST', '/me/heartbeat', {}, W88, {
    batteryPercent: 64,
    charging: false,
  });
  const report = await call<Help>('POST', '/me/symptom-reports', {}, W88, {
    symptoms: ['headache', 'dizzy'],
    note: 'Started after lunch',
  });
  const alert = await call<Help>('POST', '/me/first-aid-alert', {}, W88);
  await call('GET', '/me/help-requests', {}, W88);

  const deviceId = 'band-docs-0388';
  await call('PUT', '/me/wearable', {}, W88, {
    deviceId,
    model: 'HeatGuard band simulator',
  });
  const now = Date.now();
  await call('POST', '/me/wearable/readings', {}, W88, {
    deviceId,
    batteryPercent: 81,
    readings: Array.from({ length: 5 }, (_, i) => ({
      at: new Date(now - (4 - i) * 60_000).toISOString(),
      heartRateBpm: 118 + i * 3,
      skinTempC: 35.1 + i * 0.1,
    })),
  });
  await call('GET', '/me/wearable', {}, W88);
  await call('GET', '/me/wearable/readings', {}, W88);
  await call(
    'GET',
    '/workers/{workerId}/wearable/readings',
    { workerId: me88.worker.id },
    O,
  );

  // ---- supervisor pages ----
  await call('GET', '/sites/{siteId}/today', s, S);
  await call('GET', '/sites/{siteId}/crews-summary', s, S);
  await call('GET', '/sites/{siteId}/history', s, S);
  await call('GET', '/sites/{siteId}/help-requests', s, S);
  const plan = await call<{ current: { tasks: Json } }>(
    'GET',
    '/sites/{siteId}/plan',
    s,
    S,
  );
  if (plan) {
    await call('PUT', '/sites/{siteId}/plan', s, S, {
      crews: plan.current.tasks,
    });
    await call('POST', '/sites/{siteId}/plan/send', s, S, { use: 'current' });
  }
  await call('GET', '/sites/{siteId}/measures', s, S);
  if (alert)
    await call('POST', '/help-requests/{id}/acknowledge', { id: alert.id }, S);
  if (report)
    await call('POST', '/help-requests/{id}/resolve', { id: report.id }, S);

  // ---- occupational health and data rights ----
  await call('GET', '/symptom-reports', {}, O);
  await call('GET', '/health-profiles/pending-review', {}, O);
  await call(
    'POST',
    '/workers/{workerId}/health-profile/request-review',
    { workerId: me12.worker.id },
    W12,
  );
  await call('GET', '/me/access-log', {}, W12);
  await call(
    'GET',
    '/workers/{workerId}/data-export',
    { workerId: me88.worker.id },
    W88,
  );
  await call('DELETE', '/me/wearable', {}, W88);
  await call(
    'DELETE',
    '/workers/{workerId}/health-profile',
    { workerId: me88.worker.id },
    W88,
  );
}

main()
  .then(() => {
    const file = join(__dirname, '..', 'docs', 'response-examples.ts');
    const sorted = Object.fromEntries(
      Object.keys(out)
        .sort()
        .map((k) => [k, out[k]]),
    );
    writeFileSync(
      file,
      `// GENERATED by \`npm run docs:examples\` (src/tools/capture-doc-examples.ts). Do not edit by hand.\n` +
        `// One real response per endpoint, captured with the demo data. Used by src/docs/swagger.ts.\n\n` +
        `export const RESPONSE_EXAMPLES: Record<string, { status: number; schema: Record<string, unknown>; example: unknown }> = ${JSON.stringify(sorted, null, 2)};\n`,
    );
    execFileSync('npx', ['prettier', '--write', file], { stdio: 'ignore' });
    console.log(`Captured ${Object.keys(out).length} endpoints -> ${file}`);
    if (failures.length) {
      console.log(`\n${failures.length} calls failed:`);
      for (const f of failures) console.log(`  ${f}`);
      process.exitCode = 1;
    }
  })
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
