import { MigrationInterface, QueryRunner } from 'typeorm';

export class UseExternalEngine1794432658478 implements MigrationInterface {
  name = 'UseExternalEngine1794432658478';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Risk rules now live in the external HeatGuard AI engine (GET /v1/rules).
    await queryRunner.query(`DROP TABLE IF EXISTS "risk_thresholds"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."risk_thresholds_workload_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."risk_thresholds_workrestband_enum"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "precaution_adjustments"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."precaution_adjustments_precautionlevel_enum"`,
    );
    // Assessment and recommendation shapes change completely; old rows can't be converted.
    await queryRunner.query(
      `TRUNCATE TABLE "interventions", "recommendations", "risk_assessments"`,
    );

    await queryRunner.query(
      `ALTER TABLE "ppe_items" DROP COLUMN "wbgtAdjustmentC"`,
    );
    await queryRunner.query(`ALTER TABLE "ppe_items" DROP COLUMN "source"`);
    await queryRunner.query(
      `ALTER TABLE "ppe_items" DROP COLUMN "isPlaceholder"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "effectiveWbgtC"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "wbgtMethod"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_wbgtmethod_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "confidence"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_confidence_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "factors"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "usesPlaceholderValues"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "workMinutesPerHour"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ppe_items_engineclass_enum" AS ENUM('standard', 'coverall', 'chemical_resistant', 'impermeable')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" ADD "engineClass" "public"."ppe_items_engineclass_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_source_enum" AS ENUM('engine', 'fallback')`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "source" "public"."risk_assessments_source_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "label" character varying NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_language_enum" AS ENUM('en', 'ha', 'yo', 'ig')`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "language" "public"."risk_assessments_language_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "reasons" text NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "action" jsonb NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "wbgtC" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "wbgtSource" character varying(16)`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_dataquality_enum" AS ENUM('ok', 'degraded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "dataQuality" "public"."risk_assessments_dataquality_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastFirstReached" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastHours" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "plannedBreaks" TIMESTAMP WITH TIME ZONE array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "clockedInAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "clockedOutAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "onBreakSince" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "lastBreakEndedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'risk.detail_read'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: does not recreate risk_thresholds / precaution_adjustments or restore truncated rows.
    await queryRunner.query(
      `TRUNCATE TABLE "interventions", "recommendations", "risk_assessments"`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum_old" AS ENUM('health_profile.read', 'health_profile.write', 'health_profile.approve', 'health_profile.review_requested', 'health_profile.erased', 'consent.changed', 'worker.data_exported', 'risk_threshold.changed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "public"."audit_logs_action_enum_old" USING "action"::"text"::"public"."audit_logs_action_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum_old" RENAME TO "audit_logs_action_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "lastBreakEndedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "onBreakSince"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "clockedOutAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "clockedInAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "plannedBreaks"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastHours"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastFirstReached"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "dataQuality"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_dataquality_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "wbgtSource"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "wbgtC"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "action"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "reasons"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "language"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_language_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "label"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "source"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_source_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" DROP COLUMN "engineClass"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ppe_items_engineclass_enum"`);
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "workMinutesPerHour" integer NOT NULL DEFAULT '60'`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "usesPlaceholderValues" boolean NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "factors" jsonb NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_confidence_enum" AS ENUM('high', 'medium', 'low')`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "confidence" "public"."risk_assessments_confidence_enum" NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_wbgtmethod_enum" AS ENUM('measured', 'estimated')`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "wbgtMethod" "public"."risk_assessments_wbgtmethod_enum" NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "effectiveWbgtC" double precision NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" ADD "isPlaceholder" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`ALTER TABLE "ppe_items" ADD "source" text`);
    await queryRunner.query(
      `ALTER TABLE "ppe_items" ADD "wbgtAdjustmentC" double precision NOT NULL DEFAULT '0'`,
    );
  }
}
