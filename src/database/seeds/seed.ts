import 'reflect-metadata';
import * as bcrypt from 'bcryptjs';
import dataSource from '../data-source';
import {
  EnginePpeAddon,
  EnginePpeClass,
  Role,
  WorkloadLevel,
} from '../../common/enums';
import {
  PpeCategory,
  PpeItem,
} from '../../modules/ppe/entities/ppe-item.entity';
import { ActivityCategory } from '../../modules/workload/entities/activity-category.entity';
import { Organization } from '../../modules/organizations/entities/organization.entity';
import { User } from '../../modules/users/entities/user.entity';

/**
 * Reference data. Risk thresholds and PPE heat adjustments live in the external
 * risk engine (GET /api/v1/risk-rules); here we only map our PPE catalogue onto
 * the engine's clothing classes and set default workloads per activity.
 */

const ppe: Partial<PpeItem>[] = [
  {
    code: 'standard_work_clothing',
    name: 'Standard work clothing',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.STANDARD,
  },
  {
    code: 'cloth_coveralls',
    name: 'Industrial coveralls (woven cloth)',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.COVERALL,
  },
  {
    code: 'sms_polypropylene_coveralls',
    name: 'SMS polypropylene coveralls',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.CHEMICAL_RESISTANT,
  },
  {
    code: 'chemical_resistant_coveralls',
    name: 'Chemical-resistant (polyolefin) coveralls',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.CHEMICAL_RESISTANT,
  },
  {
    code: 'double_layer_clothing',
    name: 'Double-layer woven clothing (e.g. coveralls over work clothes)',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.DOUBLE_LAYER,
  },
  {
    code: 'impermeable_suit',
    name: 'Impermeable / vapour-barrier protective suit',
    category: PpeCategory.CLOTHING,
    engineClass: EnginePpeClass.IMPERMEABLE,
  },
  // Helmets don't change heat strain meaningfully. Hoods are an add-on sent as the
  // engine's `hood` field (ENGINE_SUPPORTS_HOOD); welding leathers aren't modelled at all.
  {
    code: 'hard_hat',
    name: 'Protective helmet',
    category: PpeCategory.HEAD,
    engineClass: null,
  },
  {
    code: 'hood',
    name: 'Hood (encloses head and neck)',
    category: PpeCategory.HEAD,
    engineClass: null,
    engineAddon: EnginePpeAddon.HOOD,
  },
  {
    code: 'welding_jacket',
    name: 'Welding jacket / leathers',
    category: PpeCategory.OTHER,
    engineClass: null,
  },
];

const activities: Partial<ActivityCategory>[] = [
  {
    code: 'supervision',
    name: 'Supervision / inspection',
    defaultWorkload: WorkloadLevel.LIGHT,
  },
  {
    code: 'vehicle_operation',
    name: 'Driving / equipment operation',
    defaultWorkload: WorkloadLevel.LIGHT,
  },
  { code: 'welding', name: 'Welding', defaultWorkload: WorkloadLevel.MODERATE },
  {
    code: 'general_construction',
    name: 'General construction',
    defaultWorkload: WorkloadLevel.MODERATE,
  },
  {
    code: 'agricultural_general',
    name: 'Agricultural work (general)',
    defaultWorkload: WorkloadLevel.MODERATE,
  },
  {
    code: 'excavation',
    name: 'Manual excavation / digging',
    defaultWorkload: WorkloadLevel.HEAVY,
  },
  {
    code: 'materials_handling',
    name: 'Manual materials handling',
    defaultWorkload: WorkloadLevel.HEAVY,
  },
  { code: 'roofing', name: 'Roofing', defaultWorkload: WorkloadLevel.HEAVY },
  {
    code: 'harvesting',
    name: 'Manual harvesting',
    defaultWorkload: WorkloadLevel.HEAVY,
  },
  {
    code: 'concrete_work',
    name: 'Concrete work',
    defaultWorkload: WorkloadLevel.HEAVY,
  },
  {
    code: 'site_logistics',
    name: 'Site logistics',
    defaultWorkload: WorkloadLevel.LIGHT,
  },
  {
    code: 'road_paving',
    name: 'Road paving / asphalt',
    defaultWorkload: WorkloadLevel.VERY_HEAVY,
  },
];

async function seed() {
  await dataSource.initialize();
  const m = dataSource.manager;

  await m.upsert(
    PpeItem,
    ppe.map((p) => ({ ...p, organizationId: null })),
    { conflictPaths: ['code'] },
  );
  // Default workloads per activity are still our own placeholders.
  await m.upsert(
    ActivityCategory,
    activities.map((a) => ({ ...a, isPlaceholder: true })),
    { conflictPaths: ['code'] },
  );

  // First organisation + admin (ID + PIN), so the API can be used straight away.
  const loginId = process.env.SEED_ADMIN_ID?.trim().toUpperCase();
  const pin = process.env.SEED_ADMIN_PIN;
  if (loginId && pin && !(await m.existsBy(User, { loginId }))) {
    if (!/^\d{4,6}$/.test(pin))
      throw new Error('SEED_ADMIN_PIN must be 4 to 6 digits');
    const org =
      (await m.findOneBy(Organization, { name: 'Demo Organisation' })) ??
      (await m.save(m.create(Organization, { name: 'Demo Organisation' })));
    await m.save(
      m.create(User, {
        organizationId: org.id,
        loginId,
        email: null,
        pinHash: await bcrypt.hash(pin, 12),
        role: Role.ADMIN,
        workerId: null,
      }),
    );
    console.log(`Admin ${loginId} created in organisation ${org.id}`);
  }

  console.log(
    `Seeded ${ppe.length} PPE items and ${activities.length} activities.`,
  );
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
