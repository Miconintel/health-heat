# HeatGuard AI – API

Backend for HeatGuard AI: personalised, privacy-preserving heat-risk decision support for outdoor workers.
NestJS 11 · TypeScript · PostgreSQL · TypeORM.

**Risk is computed by the external HeatGuard AI engine** (built by the AI team, see `heat ai/AI_BACKEND_GUIDE.md`
and `heat ai/openapi.json`). This API supplies the engine with context, stores its answers, builds supervisor and
crew views, and enforces who may see what.

## Quick start

```bash
cp .env.example .env            # then fill the secrets:
openssl rand -base64 32         # -> HEALTH_DATA_ENCRYPTION_KEY
openssl rand -base64 48         # -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET
# ENGINE_API_KEY: ask the engine owner (sent privately, never commit it)

docker compose up -d            # Postgres on localhost:5433
npm install
npm run migration:run
npm run seed                    # PPE catalogue, activities, first admin (SEED_ADMIN_ID / SEED_ADMIN_PIN)
npm run seed:demo               # demo site, crews A–D, 29 workers, today's 07:00–17:00 shift
npm run start:dev
```

### Demo logins

Everyone signs in with an **ID and a PIN** (`POST /api/v1/auth/login` with `{ "loginId", "pin" }`). The demo PIN is `SEED_DEMO_PIN` (default `1234`).

| Who | Login ID |
|---|---|
| Supervisor | `S-001` |
| Occupational health | `O-001` |
| Admin | `A-002` (`A-001` from `npm run seed` uses `SEED_ADMIN_PIN`) |
| Crew A to D workers | `W-0301`–`W-0308`, `W-0382`–`W-0388`, `W-0409`–`W-0414`, `W-0501`–`W-0508` |
| Featured | `W-0412` (Crew C, high-priority precautions), `W-0388` (Crew B) |

- **Re-run `npm run seed:demo` on each demo day** to create that day's shift. It is idempotent.
- To demo outside 07:00 to 17:00 Abuja time, run `npm run seed:demo:now`, which creates a shift running right now.
- Precaution levels: the occupational health screen is not in the frontend, so the demo seed sets them (W-0412 high-priority, W-0384 enhanced). To change one, run `npm run precaution:set -- W-0384 enhanced "Extra 10 min break each hour at level 3 and above"` (signs in as `O-001`, audited).
- After 5 wrong PINs an account is locked for 5 minutes. An admin can set a new PIN, which also unlocks it, with `PUT /api/v1/users/:id/pin`.

- API: `http://localhost:3000/api/v1` (set `PORT` if 3000 is taken)
- Swagger: `http://localhost:3000/docs` (off when `NODE_ENV=production`, unless `SWAGGER_ENABLED=true`)
- Response examples in Swagger: endpoints that return plain objects get their schema and example from `src/docs/response-examples.ts`. After changing a response, refresh it against a **local** server on a freshly seeded demo database with `WEARABLES_ENABLED=true`: `npm run docs:examples -- http://localhost:3000/api/v1`, then reseed (it creates test data). It refuses non-localhost URLs.

## Deploying on Render

- **Build Command:** `npm install --include=dev && npm run build`. The build needs the Nest CLI and TypeScript, which are dev dependencies; with `NODE_ENV=production` a plain `npm install` skips them and the build fails with `nest: not found`.
- **Start Command:** `npm run start:prod` (runs the compiled `dist/main`; `npm start` recompiles at startup and runs out of memory on the free plan).
- Environment: every variable in `.env.example`, with the real values. `SWAGGER_ENABLED=true` keeps `/docs` on when `NODE_ENV=production`.

## Demo day (Render free plan)

Render's free plan puts a service to sleep after about 15 minutes without incoming requests, and waking takes 20 to 60 seconds. A sleeping backend also runs none of its timed jobs.

| What | Who calls whom | How often | Purpose |
|---|---|---|---|
| cron-job.org job (set up on their website) | cron-job.org calls this backend's `/api/v1/health` | every 10 min | Keeps this NestJS backend awake |
| `ENGINE_KEEPALIVE=true` | this backend calls the AI engine's `/health` | every 10 min | Keeps the AI engine awake (only while this backend is awake) |
| `WEATHER_POLLING_ENABLED=true` | this backend refreshes weather, then reassesses workers | weather every 60 min, workers every 15 min | Keeps risk levels up to date |

```
cron-job.org ──every 10 min──▶ NestJS backend ──every 10 min──▶ AI engine
```

Demo-day checklist:
1. Backend env on Render: `ENGINE_API_KEY` (real key), `ENGINE_KEEPALIVE=true`, `WEATHER_POLLING_ENABLED=true`. Changing env restarts the service, so do it before people start using the app.
2. cron-job.org: call `https://<your-backend>.onrender.com/api/v1/health` every 10 minutes.
3. Demo data that morning: `npm run seed:demo` (or `npm run seed:demo:now` outside 07:00 to 17:00 Abuja time).
4. A minute before presenting, open the backend's `/api/v1/health` and the engine's `/health`.
5. After the demo, set the two switches back to `false` and pause the cron job, to save Render's free hours.

A paid always-on plan for the backend removes the need for the cron job.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm test` | Unit tests (engine mapping, engine client, fail-safe, recommendation rules, WBGT, encryption) |
| `npm run test:e2e` | E2E tests (needs Postgres; uses a placeholder engine key if none is set) |
| `npm run migration:generate --name=Foo` | Generate a migration from entity changes |
| `npm run migration:run` / `migration:revert` | Apply / roll back migrations |
| `npm run seed` | Idempotent seed of reference data |

`synchronize` is off. All schema changes go through migrations.

## Architecture

```
Open-Meteo / sensors ─► environment (WBGT) ─┐
workers · shifts/breaks · PPE · precaution ─┼─► risk-engine (orchestration) ─► HeatGuard AI engine (HTTP)
                                            │          │  stores answers, fail-safe
                                            │          ▼
                                            └── recommendations (supervisor/crew rules) ─► interventions
```

| Module | Responsibility |
| --- | --- |
| `ai-engine` | `EngineClient`: `X-API-Key`, timeout, retry, warm-up, `/v1/rules` cache, keep-alive cron |
| `risk-engine` | Builds engine requests, runs sites (serialised per site), fail-safe, worker/supervisor/OH views, scheduler |
| `auth` | ID + PIN login (lockout after 5 wrong PINs), JWT access and refresh tokens |
| `me` | `GET /me`, `PATCH /me/preferences`, `PUT /me/consents`, water tracker (`GET/POST /me/water`), `GET /me/access-log` ("Who looked at your data") |
| `help-requests` | Symptom reports and "Alert first aider" (`POST /me/symptom-reports`, `POST /me/first-aid-alert`). Supervisors see who needs help (`GET /sites/:id/help-requests`, acknowledge or resolve), never symptoms. OH sees shared details (`GET /symptom-reports`, audited) |
| `supervisor` | `GET /sites/:id/today` (whole Today page: site heat now, peak and hour by hour, workers by level incl. "No recent data", hazards, system health, needs attention, actions today, today so far, crews, last 7 days; `?crewId=`, `?activity=`), `GET /sites/:id/crews-summary`, `GET /sites/:id/history?days=7` |
| `plans` | Shift plan: `GET /sites/:id/plan` (current and suggested plans, site heat per hour, too-hot evaluation), `PUT` (edit), `POST /plan/send` (apply; moves planned breaks and feeds per-hour work to engine forecasts) |
| `measures` | `GET /sites/:id/measures?period=7d\|30d\|season`, crew-level only (crews under 5 are grouped). Forecast-accuracy and compliance figures are **provisional** until the AI team defines them (D6) |
| `wearables` | Optional band (heart rate, skin temperature), off unless `WEARABLES_ENABLED=true`: `GET/PUT/DELETE /me/wearable` (status, pair, unpair), `POST /me/wearable/readings` (batch from the phone), `GET /me/wearable/readings`, `GET /workers/:id/wearable/readings` (OH, audited). Simulator: `npm run band:simulate -- W-0412 1234 --profile strained --minutes 30` |
| `users` | Accounts and roles: `admin`, `occupational_health`, `supervisor`, `worker` |
| `organizations` | Sites (lat/lon), crews |
| `workers` | Operational worker record, acclimatisation, language. **No health data.** |
| `health-profiles` | Encrypted health data, consent, OH approval of the precaution level, GDPR export and erasure |
| `ppe` | PPE catalogue mapped to engine clothing classes, assignments to workers |
| `workload` | Activities, work assignments, planned breaks, **clock-in / break / clock-out** |
| `environment` | Weather provider (Open-Meteo), sensor readings, WBGT estimate |
| `recommendations` | Worker actions from the engine, supervisor/crew rules, reconciled on every run |
| `interventions` | Acknowledged / implemented / dismissed tracking |
| `audit` | Append-only log of access to sensitive data |

### How an assessment runs

1. **Triggers.** A run happens on `POST /sites/:id/assessments/run`, the 15-minute scheduler, or an event: a new assignment, a PPE change, clock-in, or a break starting or ending. Events coalesce, and runs for the same site never overlap.
2. **Inputs we send the engine** for each worker with an active assignment:
   - WBGT: sun or shade value depending on the work environment, plus `last_known`
   - workload
   - the most heat-retaining PPE class
   - acclimatisation
   - precaution level (only that field is read from `health_profiles`)
   - `minutes_exposed` and `minutes_since_last_break`, from clock-in and break tracking
   - language
3. **Calls.** We call `POST /v1/assess/worker` and `POST /v1/forecast/worker`. The forecast covers the remaining shift hours, with `rest_break` set from the planned breaks.
4. **Storage.** We store the engine's answer. `reasons` is encrypted at rest. The forecast hours are kept so the worker app can keep warning offline.
5. **Recommendations.** The worker gets the engine's `action` in their language. Supervisors and crews get rule-based actions built only from level, PPE class and forecast.

**Fail safe, not silent.** If the engine is unreachable, or returns 401/422/503, we store a fallback assessment: level High, or the last engine level from the past hour if that was higher, with `dataQuality: degraded` and `source: fallback`. 401, 422 and 503 are logged as errors because they mean misconfiguration.

### Supervisor rules

- **Site heat level** per hour is the engine's answer for a reference worker: moderate work, standard clothing, acclimatised. It's refreshed on every site run, and the forecast history is kept for warning lead-time measures.
- **No recent data:** a worker whose app has sent heartbeats (`POST /me/heartbeat`) but has been silent for over 15 minutes counts as High.
- **Precaution alerts (D1)** say only what to do ("needs reduced exposure today" or "needs earlier breaks today"), never the level or the reason.
- **Too-hot rule:** heavy work at level 3 or above, or moderate work at level 4, counting "possible" levels.
- **Suggested plan:** rearranges each crew's tasks so heavy work lands in the coolest hours, then steps down whatever is still too hot. Breaks and working hours stay the same.
- **Shift filter:** `GET /sites/:id/today?shift=Night shift` shows that shift's hours and workers. The response lists `shifts` for the dropdown.
- **Wearable band:**
  - needs the worker's "Wearable band" consent
  - readings are encrypted, kept 7 days, and deleted when consent is turned off or health data is erased
  - workers and OH (audited) can see them; supervisors see only the connected count
- **Hazards** come from Open-Meteo: dust and PM10 from the air-quality API, thunderstorms from weather codes 95 to 99. The thresholds are placeholders.

### Worker data rules

- **Acclimatisation** is derived from a start date: acclimatised = 14 or more days since it (in `workers/acclimatization.ts`; to confirm with the engine owner).
  - The worker's health-profile answer sets the start date. Staff can set it with `PUT /workers/:id/acclimatization`.
  - When both set it, the later, more cautious date wins.
  - Moving the date earlier needs a reason and is audited.
- **Symptom reports.** The alert always reaches the supervisor. Symptom codes and notes are stored, encrypted, only if the worker consented to symptom reports.
- **Retention.** A nightly job erases the health profile, symptom details and water log 30 days after a worker leaves (`isActive: false` sets `leftOn`).
- **Erasure.** "Delete my health information" removes the health profile and symptom details. The record that an alert was raised is kept.

### Privacy (server-enforced)

| Data | Worker | Occupational health | Supervisor | Admin |
| --- | --- | --- | --- | --- |
| Own level, label, action, reasons, saved forecast (`GET /me/risk`) | ✔ | | | |
| Any worker's full view incl. reasons (`GET /workers/:id/risk`, audited) | | ✔ | | |
| Site overview: level, label, action, forecast levels only (`GET /sites/:id/risk-overview`) | | ✔ | ✔ | |
| Health profile | own | ✔ | | |
| Engine rules (`GET /risk-rules`) | | ✔ | | ✔ |

- Supervisor views never contain `reasons` or the precaution level (engine guide §6). Supervisor and crew recommendations are built without them.
- Health fields and engine `reasons` are AES-256-GCM encrypted. **Losing `HEALTH_DATA_ENCRYPTION_KEY` makes them unreadable.**
- Consent is required before a worker can store health data. Workers can export their data (`GET /workers/:id/data-export`) and erase it (`DELETE /workers/:id/health-profile`).
- The engine API key stays on the server. Clients never talk to the engine.

## Engine configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `OPEN_METEO_AIR_QUALITY_URL` | `https://air-quality-api.open-meteo.com/v1/air-quality` | Dust and PM10 for hazards |
| `CORS_ORIGINS` | `https://heat-guard-nine.vercel.app,http://localhost:5173,https://heat-guard-*-ahmads-projects-727aea25.vercel.app` | Browser origins allowed to call the API. `*` matches one part of a host name (no dots); the last entry allows the frontend team's Vercel previews |
| `SWAGGER_ENABLED` | (unset) | Swagger at `/docs` and `/docs-json` is on unless `NODE_ENV=production`. Set `true` to keep it on in production (the frontend reads `/docs-json`) |
| `ENGINE_BASE_URL` | `https://heatguard-ai-engine.onrender.com` | |
| `ENGINE_API_KEY` | (required) | From the engine owner |
| `ENGINE_TIMEOUT_MS` | `60000` | A sleeping Render instance takes 20–60 s to wake |
| `ENGINE_KEEPALIVE` | `false` | Pings `/health` every 10 min so the free plan doesn't sleep |
| `ENGINE_WBGT_ENABLED` | `true` | WBGT from the engine's `POST /v1/wbgt` (Liljegren). `false` stores weather without WBGT |
| `WEARABLES_ENABLED` | `false` | Band feature: pairing, readings, "Your band", supervisor connected count |
| `ENGINE_SUPPORTS_WEARABLES` | `false` | Send band summaries to the engine (engine request #5); needs `WEARABLES_ENABLED` too |
| `ENGINE_SUPPORTS_HOOD` | `false` | Send the `hood` field. Turn on when the engine accepts it, because it 422s on unknown fields |
| `WEATHER_POLLING_ENABLED` | `false` | Hourly weather refresh plus 15-minute reassessment |

## Open items with the AI team

- **WBGT: live, from the engine's `POST /v1/wbgt` (Liljegren).**
  - Each site refresh sends now plus 12 forecast hours of weather in one call. We store `wbgt_c` (full sun) as `wbgtSunC`, labelled `engine/liljegren_2008`. There is no shade value yet, so every worker gets the sun value (the cautious choice).
  - A null weather value is sent as null; that hour comes back `wbgt_c: null` and reaches the risk engine as null (its safe fallback).
  - If the call fails, the refresh fails and existing readings are kept. The risk engine then uses `last_known`, or its own staleness rule. There is no second formula.
- **Hoods: our side is ready.**
  - PPE items flagged `engineAddon: hood` are detected per worker.
  - While `ENGINE_SUPPORTS_HOOD=false` (default), we don't send the field, because the engine rejects unknown fields with a 422. Instead the assessment records `ppeNotModelled: ["hood"]`, which is shown to the worker and supervisor, and the supervisor PPE-review recommendation fires.
  - Once the engine accepts it, set `ENGINE_SUPPORTS_HOOD=true` and we send `hood: true|false` on assess and forecast. No code change is needed.
  - Proposal for the engine (see below).
- **Double-layer clothing** (+3 °C in ACGIH) has no engine class, so it is left out of the catalogue rather than under-rated.

### `/v1/wbgt` contract (what the backend calls)

Source of truth: the engine's live schema, `https://heatguard-ai-engine.onrender.com/openapi.json` (also `AI_BACKEND_GUIDE.md` section 10). `POST /v1/wbgt` with the `X-API-Key` header, once per site per weather refresh.

```json
{
  "latitude": 9.06,
  "longitude": 7.49,
  "hours": [
    {
      "time": "2026-03-15T12:30:00Z",
      "temperature_2m_c": 33.6,
      "dew_point_2m_c": 20.0,
      "surface_pressure_hpa": 960.0,
      "wind_speed_10m_kmh": 8.0,
      "shortwave_radiation_wm2": 920.0,
      "radiation_period_min": 15
    }
  ]
}
```

- Open-Meteo fields: `temperature_2m`, `dew_point_2m`, `surface_pressure` (not `pressure_msl`), `wind_speed_10m` in km/h (default units), `shortwave_radiation`.
- `radiation_period_min: 15` only on the current observation (Open-Meteo `current` is a 15-minute average); hourly entries use the default 60.
- Every field must be present; missing values are `null`. Unknown fields are rejected (422).
- Accepted ranges (schema): temperature and dew point -40 to 60, pressure 500 to 1100, wind 0 to 250 km/h, radiation 0 to 1500, 1 to 400 hours. A value outside its range is sent as `null` so one bad value can't fail the whole site.

Response: `{ "method": "liljegren_2008", "hours": [{ "time", "wbgt_c", "wbgt_source": "estimated", "data_quality", "globe_c", "natural_wet_bulb_c", "wind_2m_ms" }] }`. We match hours by instant and read only `wbgt_c`.

### Proposal to the engine owner: `hood`

> Add an optional boolean `hood` (default `false`) to `AssessWorkerRequest` and `ForecastRequest`.
> When `true`, add the ACGIH hood adjustment (about +1 °C WBGT) on top of the `ppe` clothing value,
> and list it in `GET /v1/rules` with its source like the other adjustments. Helmets don't need a field:
> their effect is about 0. Please also confirm whether the +11 °C for `impermeable` already assumes a
> hood, so a sealed suit isn't counted twice. The backend is ready and will start sending it when you
> confirm.
- **Languages.** The engine supports en, ha, yo and ig. Others, e.g. Nigerian Pidgin, are sent as `en`. When the engine adds `pcm`, add it to `EngineLanguage` in `src/common/enums/index.ts` and generate a migration, because the stored language column is a database enum.
- **Hour-by-hour shift plans.** Forecast workload repeats the current task until shift plans exist.

## Known gaps

- Supervisors are scoped to the organisation, not yet to their own crews or sites.
- Not built yet: refresh-token revocation and rate limiting; push notifications, SMS fallback and notifying crews when a plan is sent; an incident log; using band data in the risk level (waiting on engine request #5).
- Activity default workloads are our own placeholders (`isPlaceholder`).
