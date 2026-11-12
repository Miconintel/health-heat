import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import { EntityManager } from 'typeorm';
import dataSource from '../data-source';
import { addDays } from '../../modules/workers/acclimatization';
import {
  ConsentPurpose,
  PrecautionLevel,
  Role,
  WorkEnvironment,
  WorkloadLevel,
} from '../../common/enums';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import { Site } from '../../modules/organizations/entities/site.entity';
import { Crew } from '../../modules/organizations/entities/crew.entity';
import { Worker } from '../../modules/workers/entities/worker.entity';
import { User } from '../../modules/users/entities/user.entity';
import { PpeItem } from '../../modules/ppe/entities/ppe-item.entity';
import { WorkerPpe } from '../../modules/ppe/entities/worker-ppe.entity';
import { ActivityCategory } from '../../modules/workload/entities/activity-category.entity';
import { WorkAssignment } from '../../modules/workload/entities/work-assignment.entity';
import { HealthProfile } from '../../modules/health-profiles/entities/health-profile.entity';
import { Consent } from '../../modules/health-profiles/entities/consent.entity';

/**
 * Demo data matching the frontend's sample site (crews A to D, 29 workers,
 * W-0412 in Crew C with high-priority precautions, W-0388 in Crew B).
 *
 * Idempotent: safe to run again. Each run also creates today's day shift
 * (07:00 to 17:00 Abuja time) for any worker who doesn't have one yet,
 * so run it on every demo day:  npm run seed && npm run seed:demo
 * To demo outside working hours, create a shift running now instead:
 *   npm run seed:demo:now
 */

const ORG_NAME = 'Demo Organisation';
const SITE_NAME = 'Abuja Demo Site';
const TZ_OFFSET = '+01:00'; // Africa/Lagos, no daylight saving

interface CrewSpec {
  letter: 'A' | 'B' | 'C' | 'D';
  activity: string;
  workloadOverride: WorkloadLevel | null;
  ppe: string[];
  workerCodes: string[];
  /** Planned breaks, site-local "HH:MM". */
  breaks: string[];
}

const range = (prefix: string, from: number, to: number) =>
  Array.from(
    { length: to - from + 1 },
    (_, i) => `${prefix}${String(from + i).padStart(4, '0')}`,
  );

const CREWS: CrewSpec[] = [
  {
    letter: 'A',
    activity: 'concrete_work',
    workloadOverride: null,
    ppe: ['standard_work_clothing', 'hard_hat'],
    workerCodes: range('W-', 301, 308),
    breaks: ['11:00', '14:00'],
  },
  {
    letter: 'B',
    activity: 'excavation',
    workloadOverride: WorkloadLevel.VERY_HEAVY,
    ppe: ['cloth_coveralls', 'hard_hat'],
    workerCodes: range('W-', 382, 388),
    breaks: ['12:00', '16:00'],
  },
  {
    letter: 'C',
    activity: 'welding',
    workloadOverride: null,
    ppe: ['standard_work_clothing', 'welding_jacket'],
    workerCodes: range('W-', 409, 414),
    breaks: ['11:00', '15:00'],
  },
  {
    letter: 'D',
    activity: 'site_logistics',
    workloadOverride: null,
    ppe: ['standard_work_clothing'],
    workerCodes: range('W-', 501, 508),
    breaks: ['10:00', '13:00', '15:30'],
  },
];

/** Workers who are new to the heat (not acclimatised). */
const NEW_TO_HEAT = new Set(['W-0414', 'W-0508']);

/** Today's date in Abuja, as YYYY-MM-DD. */
function abujaToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(
    new Date(),
  );
}

const atLocal = (date: string, hhmm: string) =>
  new Date(`${date}T${hhmm}:00${TZ_OFFSET}`);

async function upsertUser(
  m: EntityManager,
  organizationId: string,
  loginId: string,
  role: Role,
  pinHash: string,
  workerId: string | null,
) {
  const existing = await m.findOneBy(User, { loginId });
  if (existing) return existing;
  return m.save(
    m.create(User, {
      organizationId,
      loginId,
      email: null,
      pinHash,
      role,
      workerId,
    }),
  );
}

async function seedDemo() {
  const pin = process.env.SEED_DEMO_PIN ?? '1234';
  if (!/^\d{4,6}$/.test(pin))
    throw new Error('SEED_DEMO_PIN must be 4 to 6 digits');

  await dataSource.initialize();
  const m = dataSource.manager;

  const activities = new Map(
    (await m.find(ActivityCategory)).map((a) => [a.code, a]),
  );
  const ppeItems = new Map((await m.find(PpeItem)).map((p) => [p.code, p]));
  for (const c of CREWS) {
    if (!activities.has(c.activity) || c.ppe.some((p) => !ppeItems.has(p))) {
      throw new Error('Reference data missing: run `npm run seed` first.');
    }
  }

  const pinHash = await bcrypt.hash(pin, 12);
  const org =
    (await m.findOneBy(Organization, { name: ORG_NAME })) ??
    (await m.save(m.create(Organization, { name: ORG_NAME })));

  const site =
    (await m.findOneBy(Site, { organizationId: org.id, name: SITE_NAME })) ??
    (await m.save(
      m.create(Site, {
        organizationId: org.id,
        name: SITE_NAME,
        latitude: 9.0579,
        longitude: 7.4951,
        timezone: 'Africa/Lagos',
        emergencyNumber: '112',
        shifts: [{ name: 'Day shift', start: '07:00', end: '17:00' }],
      }),
    ));

  // Staff accounts
  const supervisor = await upsertUser(
    m,
    org.id,
    'S-001',
    Role.SUPERVISOR,
    pinHash,
    null,
  );
  const oh = await upsertUser(
    m,
    org.id,
    'O-001',
    Role.OCCUPATIONAL_HEALTH,
    pinHash,
    null,
  );
  await upsertUser(m, org.id, 'A-002', Role.ADMIN, pinHash, null);

  const today = abujaToday();
  // SEED_DEMO_SHIFT=now: a 10-hour shift that started 3 hours ago, so a demo works at any time.
  const nowMode = process.env.SEED_DEMO_SHIFT === 'now';
  const hourStart = new Date();
  hourStart.setUTCMinutes(0, 0, 0);
  const shiftStart = nowMode
    ? new Date(hourStart.getTime() - 3 * 3_600_000)
    : atLocal(today, '07:00');
  const shiftEnd = nowMode
    ? new Date(shiftStart.getTime() + 10 * 3_600_000)
    : atLocal(today, '17:00');
  /** Break times: day-shift clock times, or the same offsets from the start in "now" mode. */
  const breakTimes = (breaks: string[]) =>
    breaks.map((b) => {
      if (!nowMode) return atLocal(today, b);
      const [h, mm] = b.split(':').map(Number);
      return new Date(shiftStart.getTime() + ((h - 7) * 60 + mm) * 60_000);
    });
  let createdAssignments = 0;

  for (const spec of CREWS) {
    const crewName = `Crew ${spec.letter}`;
    const crew =
      (await m.findOneBy(Crew, { siteId: site.id, name: crewName })) ??
      (await m.save(
        m.create(Crew, {
          organizationId: org.id,
          siteId: site.id,
          name: crewName,
          supervisorUserId: supervisor.id,
        }),
      ));

    for (const code of spec.workerCodes) {
      let worker = await m.findOneBy(Worker, {
        organizationId: org.id,
        employeeCode: code,
      });
      if (!worker) {
        worker = await m.save(
          m.create(Worker, {
            organizationId: org.id,
            employeeCode: code,
            displayName: code,
            crewId: crew.id,
            preferredLanguage: 'en',
            // New workers started today; everyone else has worked in this heat for 2 months.
            acclimatizationStartedOn: NEW_TO_HEAT.has(code)
              ? today
              : addDays(today, -60),
          }),
        );
        await m.save(
          spec.ppe.map((p) =>
            m.create(WorkerPpe, {
              workerId: worker!.id,
              ppeItemId: ppeItems.get(p)!.id,
            }),
          ),
        );
      }
      await upsertUser(m, org.id, code, Role.WORKER, pinHash, worker.id);

      // The shift, unless the worker already has one overlapping it.
      const startsAt = shiftStart;
      const endsAt = shiftEnd;
      const exists = await m
        .createQueryBuilder(WorkAssignment, 'a')
        .where('a.workerId = :w', { w: worker.id })
        .andWhere('a.startsAt < :end AND a.endsAt > :start', {
          start: startsAt,
          end: endsAt,
        })
        .getExists();
      if (!exists) {
        await m.save(
          m.create(WorkAssignment, {
            organizationId: org.id,
            workerId: worker.id,
            siteId: site.id,
            activityCategoryId: activities.get(spec.activity)!.id,
            workloadOverride: spec.workloadOverride,
            workEnvironment:
              spec.letter === 'C'
                ? WorkEnvironment.SHADE
                : WorkEnvironment.DIRECT_SUN,
            startsAt,
            endsAt,
            plannedBreaks: breakTimes(spec.breaks),
          }),
        );
        createdAssignments++;
      }
    }
  }

  // Workers with precaution levels. There is no occupational health screen, so the
  // demo sets them here (a qualified person would set them in a real deployment).
  const featured: {
    code: string;
    profile: Partial<HealthProfile>;
  }[] = [
    {
      // High-priority: the supervisor sees "needs reduced exposure today".
      code: 'W-0412',
      profile: {
        ageRange: '40_54',
        healthConditions: ['heart'],
        heatIllness: 'no',
        medications: ['bp'],
        precautionLevel: PrecautionLevel.HIGH_PRIORITY,
        restrictions: [
          'No heavy work at level 3 and above',
          'Recovery break every 30 min at level 3 and above',
        ],
      },
    },
    {
      // Enhanced: the supervisor sees "needs earlier breaks today".
      code: 'W-0384',
      profile: {
        ageRange: '25_39',
        healthConditions: ['none'],
        heatIllness: 'recent',
        medications: ['none'],
        precautionLevel: PrecautionLevel.ENHANCED,
        restrictions: ['Extra 10 min break each hour at level 3 and above'],
      },
    },
  ];
  for (const f of featured) {
    const worker = await m.findOneByOrFail(Worker, {
      organizationId: org.id,
      employeeCode: f.code,
    });
    const account = await m.findOneByOrFail(User, { loginId: f.code });
    if (!(await m.existsBy(Consent, { workerId: worker.id }))) {
      await m.save(
        [
          ConsentPurpose.HEALTH_DATA_PROCESSING,
          ConsentPurpose.SYMPTOM_REPORTS,
        ].map((purpose) =>
          m.create(Consent, {
            workerId: worker.id,
            purpose,
            granted: true,
            policyVersion: 'demo',
            recordedByUserId: account.id,
          }),
        ),
      );
    }
    if (!(await m.existsBy(HealthProfile, { workerId: worker.id }))) {
      await m.save(
        m.create(HealthProfile, {
          workerId: worker.id,
          medicalHistory: [],
          ...f.profile,
          approvedByUserId: oh.id,
          approvedAt: new Date(),
          nextReviewOn: addDays(today, 28),
          reviewRequested: false,
        }),
      );
    }
  }

  const workerCount = CREWS.reduce((n, c) => n + c.workerCodes.length, 0);
  console.log(
    `Demo site "${SITE_NAME}" (${site.id}): 4 crews, ${workerCount} workers.`,
  );
  console.log(
    nowMode
      ? `Shift running now (${shiftStart.toISOString()} to ${shiftEnd.toISOString()}): ${createdAssignments} new assignment(s).`
      : `Today's shift (${today}, 07:00 to 17:00 Abuja): ${createdAssignments} new assignment(s).`,
  );
  console.log('');
  console.log(`Log in with ID + PIN ${pin}:`);
  console.log('  Supervisor            S-001');
  console.log('  Occupational health   O-001');
  console.log('  Admin                 A-002');
  for (const c of CREWS) {
    console.log(
      `  Crew ${c.letter} workers        ${c.workerCodes[0]} to ${c.workerCodes[c.workerCodes.length - 1]}`,
    );
  }
  console.log(
    '  Featured: W-0412 (Crew C, high-priority precautions), W-0384 (Crew B, enhanced precautions), W-0388 (Crew B)',
  );
  await dataSource.destroy();
}

seedDemo().catch((err) => {
  console.error(err);
  process.exit(1);
});
