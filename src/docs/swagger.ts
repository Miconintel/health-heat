import { INestApplication, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { Role } from '../common/enums';
import { RESPONSE_EXAMPLES } from './response-examples';

const API_PREFIX = 'api/v1';

const DESCRIPTION = `
Backend for **HeatGuard AI**: personalised, privacy-preserving heat-risk decision support for outdoor workers.
Risk levels come from the external HeatGuard AI engine; this API stores context, calls the engine, and serves the
worker app and the supervisor dashboard.

### How to try it here
1. Open **auth** → \`POST /auth/login\` → *Try it out*, with \`{ "loginId": "S-001", "pin": "1234" }\`
   (demo logins: supervisor \`S-001\`, workers \`W-0301\` to \`W-0508\`, occupational health \`O-001\`).
2. Copy \`accessToken\`, click **Authorize** (top right) and paste it. It is remembered while this page is open.
3. Call any endpoint. Each one says **who can call it** at the top of its description.

Access tokens last 15 minutes; get a new one with \`POST /auth/refresh\`.

### Roles
| Role | Uses |
|---|---|
| \`worker\` | The worker app: own risk, consent, health profile, symptom reports, water, band, data rights |
| \`supervisor\` | The supervisor dashboard: site and crew risk (levels and actions only), plans, measures |
| \`occupational_health\` | Back-office only (no frontend screen): precaution levels, symptom details. Every read is audited |
| \`admin\` | Sites, crews, workers, accounts and PINs |

### Conventions
- **Raw data, not text:** codes (\`en\`, \`high_priority\`, \`heart\`), IDs and numbers. The app turns them into words.
- **Times** are ISO 8601 in UTC; show them in the site's timezone (\`site.timezone\`, e.g. \`Africa/Lagos\`).
- **Risk levels:** 1 Low, 2 Elevated, 3 High, 4 Critical. Use the number for logic; \`label\` is in the worker's language.
- **Errors:** \`{ "statusCode": 400, "message": "...", "error": "Bad Request" }\`. 401 = not logged in or token expired;
  403 = your role can't do this; 404 = not found; 409 = conflicts with the current state (e.g. "Already clocked in");
  503 = a feature switch is off or a dependency is down.

### Privacy (enforced by the server)
Supervisors never receive engine \`reasons\`, precaution levels, health answers, symptoms or band readings.
Health data and band readings are encrypted at rest. Reads of a worker's private data are audited and shown to the
worker in \`GET /me/access-log\`.

### Feature switches (server settings)
\`WEARABLES_ENABLED\`, \`ENGINE_SUPPORTS_WEARABLES\`, \`ENGINE_SUPPORTS_HOOD\`, \`ENGINE_WBGT_ENABLED\`,
\`WEATHER_POLLING_ENABLED\`. Endpoints behind a switch that is off answer 503.
`;

/** Tag order and descriptions as they appear on the page. */
const TAGS: [string, string][] = [
  ['auth', 'Log in with an ID and PIN; refresh the access token.'],
  [
    'me',
    'The signed-in person: profile, shift, consents, preferences, water tracker, app heartbeat, "Who looked at your data".',
  ],
  [
    'risk',
    "Risk levels from the AI engine: the worker's own view, the supervisor-safe site overview, running assessments, engine rules.",
  ],
  [
    'recommendations',
    'Recommended actions for the worker (from the engine) and for supervisors (rule-based, health-free).',
  ],
  [
    'interventions',
    'Record what was done about a recommendation: acknowledged, implemented, reassigned, dismissed.',
  ],
  [
    'help-requests',
    '"Alert first aider" and symptom reports. Supervisors see who needs help, never the symptoms.',
  ],
  [
    'supervisor',
    'The supervisor Today page in one call, the crews table and the last-days history.',
  ],
  [
    'shift-plan',
    'Crew x hour plan, the too-hot rule, the suggested plan, "Send to crews".',
  ],
  [
    'measures',
    'Safety and productivity measures, crew-level only. Some figures are provisional.',
  ],
  [
    'workload',
    'Activities, work assignments, and clock-in / break / clock-out (the engine needs them).',
  ],
  [
    'wearables',
    'Optional wristband (heart rate, skin temperature). Off unless WEARABLES_ENABLED=true; needs consent.',
  ],
  [
    'health-profiles',
    "Worker's private health answers, consents and data rights (export, erase). Occupational health sets precaution levels.",
  ],
  ['environment', 'Weather, WBGT and site sensor readings.'],
  [
    'workers',
    'Worker records (no health data) and acclimatisation start dates.',
  ],
  ['ppe', 'Protective equipment catalogue and what each worker wears.'],
  ['sites', 'Sites (location, timezone, shifts, emergency number) and crews.'],
  ['users', 'Login accounts and PIN resets.'],
  ['audit', 'Who accessed sensitive data, and when.'],
  ['health', 'Is the API up?'],
];

const ROLE_NAMES: Record<Role, string> = {
  [Role.WORKER]: 'Worker',
  [Role.SUPERVISOR]: 'Supervisor',
  [Role.OCCUPATIONAL_HEALTH]: 'Occupational health',
  [Role.ADMIN]: 'Admin',
};

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

/**
 * Who can call each route, read from the same @Public / @Roles metadata the guards use,
 * keyed by "METHOD /path/{param}" as in the OpenAPI document.
 */
function accessRules(app: INestApplication) {
  const rules = new Map<string, { public: boolean; roles: Role[] | null }>();
  for (const mod of app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const ctrl = wrapper.metatype as
        (new (...a: unknown[]) => unknown) | undefined;
      if (!ctrl?.prototype) continue;
      const base =
        (Reflect.getMetadata(PATH_METADATA, ctrl) as string | undefined) ?? '';
      const ctrlRoles = Reflect.getMetadata(ROLES_KEY, ctrl) as
        Role[] | undefined;
      const ctrlPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ctrl) as
        boolean | undefined;
      for (const name of Object.getOwnPropertyNames(ctrl.prototype)) {
        const handler = (ctrl.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function' || name === 'constructor') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (path === undefined || method === undefined) continue;
        const roles =
          (Reflect.getMetadata(ROLES_KEY, handler) as Role[] | undefined) ??
          ctrlRoles ??
          null;
        const isPublic = !!(
          (Reflect.getMetadata(IS_PUBLIC_KEY, handler) as
            boolean | undefined) ?? ctrlPublic
        );
        const openApiPath = join(API_PREFIX, base, path).replace(
          /:(\w+)/g,
          '{$1}',
        );
        rules.set(`${RequestMethod[method].toLowerCase()} ${openApiPath}`, {
          public: isPublic,
          roles,
        });
      }
    }
  }
  return rules;
}

type Operation = NonNullable<OpenAPIObject['paths'][string]['get']>;

/**
 * Endpoints that return plain objects have no response class, so Swagger can't describe
 * them. For those, use the schema and example captured from a real response with the
 * demo data (`npm run docs:examples`). Endpoints with a response class are left alone.
 */
function addCapturedResponse(op: Operation, key: string) {
  const captured = RESPONSE_EXAMPLES[key];
  if (!captured) return;
  const ok = Object.entries(op.responses).filter(([code]) =>
    code.startsWith('2'),
  );
  // A bare `{ type: "object" }` or a list of them (plain-object returns) says nothing, so it doesn't count.
  const documented = ok.find(([, r]) => {
    const schema =
      r && 'content' in r
        ? (r.content?.['application/json']?.schema as
            Record<string, unknown> | undefined)
        : undefined;
    const items = schema?.items as Record<string, unknown> | undefined;
    return (
      !!schema &&
      !!(
        schema.$ref ||
        schema.properties ||
        schema.allOf ||
        items?.$ref ||
        items?.properties
      )
    );
  });
  const examples = captured.examples
    ? { examples: captured.examples }
    : { example: captured.example };

  if (documented) {
    // Keep the class-based schema; add the real examples next to it.
    const [, r] = documented;
    const media = (
      r as unknown as { content: Record<string, Record<string, unknown>> }
    ).content['application/json'];
    Object.assign(media, examples);
    return;
  }
  const code = String(captured.status);
  const existing = op.responses[code] as { description?: string } | undefined;
  for (const [c] of ok) if (c !== code) delete op.responses[c];
  op.responses[code] = {
    description: `${existing?.description || 'OK'}. Schema and example come from a real response with the demo data; arrays in the example are shortened to 3 items.`,
    content: {
      'application/json': { schema: captured.schema, ...examples },
    },
  };
}

/** Adds "who can call this" and the common error responses to every operation. */
function annotate(doc: OpenAPIObject, app: INestApplication) {
  const rules = accessRules(app);
  const err = (description: string) => ({ description });
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const op = item[method];
      if (!op) continue;
      const rule = rules.get(`${method} ${path}`);
      const who = !rule
        ? null
        : rule.public
          ? 'Anyone (no login needed)'
          : rule.roles?.length
            ? rule.roles.map((r) => ROLE_NAMES[r]).join(', ')
            : 'Any logged-in user';
      if (who)
        op.description = `**Who can call:** ${who}${op.description ? `\n\n${op.description}` : ''}`;

      op.responses ??= {};
      addCapturedResponse(op, `${method} ${path}`);
      if (rule?.public) {
        op.security = [];
      } else {
        op.security = [{ bearer: [] }];
        op.responses['401'] ??= err(
          'Not logged in, or the access token expired (refresh it)',
        );
        if (rule?.roles?.length)
          op.responses['403'] ??= err('Your role is not allowed to do this');
      }
      if (path.includes('{'))
        op.responses['404'] ??= err('Not found (or not in your organisation)');
      if (op.requestBody || ['post', 'put', 'patch'].includes(method)) {
        op.responses['400'] ??= err(
          'The request is invalid; `message` lists what is wrong',
        );
      }
    }
  }
}

export function setupSwagger(app: INestApplication) {
  const builder = new DocumentBuilder()
    .setTitle('HeatGuard AI API')
    .setDescription(DESCRIPTION)
    .setVersion('0.1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'The accessToken from POST /auth/login',
      },
      'bearer',
    );
  for (const [name, description] of TAGS) builder.addTag(name, description);

  const doc = SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (controller, method) =>
      `${controller.replace(/Controller$/, '')}_${method}`,
  });
  annotate(doc, app);

  SwaggerModule.setup('docs', app, doc, {
    customSiteTitle: 'HeatGuard AI API',
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      // Links like /docs#/me/Me_logWater open that endpoint.
      deepLinking: true,
      docExpansion: 'none',
      filter: true,
      // Sections appear in the order of TAGS (the order they are added to the document).
      operationsSorter: 'alpha',
      tryItOutEnabled: true,
    },
  });
}
