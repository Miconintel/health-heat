import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkerEssentials1794439981909 implements MigrationInterface {
  name = 'WorkerEssentials1794439981909';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Acclimatisation is now derived from a start date (decision D4).
    // Keep everyone's current status: acclimatised workers without a date get one 60 days back.
    await queryRunner.query(
      `UPDATE "workers" SET "acclimatizationStartedOn" = CURRENT_DATE - 60 WHERE "acclimatized" = true AND "acclimatizationStartedOn" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "acclimatized"`);
    await queryRunner.query(
      `CREATE TYPE "public"."help_requests_kind_enum" AS ENUM('symptom_report', 'first_aid_alert')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."help_requests_status_enum" AS ENUM('open', 'acknowledged', 'resolved')`,
    );
    await queryRunner.query(
      `CREATE TABLE "help_requests" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "workerId" uuid NOT NULL, "siteId" uuid, "crewId" uuid, "kind" "public"."help_requests_kind_enum" NOT NULL, "status" "public"."help_requests_status_enum" NOT NULL DEFAULT 'open', "detailsShared" boolean NOT NULL DEFAULT false, "symptoms" text, "note" text, "acknowledgedByUserId" uuid, "acknowledgedAt" TIMESTAMP WITH TIME ZONE, "resolvedByUserId" uuid, "resolvedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_2990700cfcb0ce6fbdd7b3d532f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_89d06e4cf57165cb9285e0f32b" ON "help_requests"  ("workerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dfddb6262df7ade1bc4a935f1b" ON "help_requests"  ("siteId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "water_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workerId" uuid NOT NULL, "loggedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "cups" integer NOT NULL DEFAULT '1', CONSTRAINT "PK_7793241dc433ad0ac30ec9a906e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6e7355b2b2baaf1235585d7fd0" ON "water_logs"  ("workerId", "loggedAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" ADD "heatIllness" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" ADD "acclimatisationAnswer" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" ADD "restrictions" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" ADD "nextReviewOn" date`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD "breakMinutes" integer NOT NULL DEFAULT '15'`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "actorUserId" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "actorRole" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'worker.acclimatization_changed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'symptom_report.read'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'risk.overview_viewed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'health_data.retention_erased'`,
    );
    await queryRunner.query(`ALTER TABLE "workers" ADD "leftOn" date`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "leftOn"`);
    await queryRunner.query(
      `ALTER TABLE "workers" ADD "acclimatized" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE "workers" SET "acclimatized" = COALESCE("acclimatizationStartedOn" <= CURRENT_DATE - 14, false)`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum_old" AS ENUM('health_profile.read', 'health_profile.write', 'health_profile.approve', 'health_profile.review_requested', 'health_profile.erased', 'consent.changed', 'worker.data_exported', 'risk_threshold.changed', 'risk.detail_read')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "public"."audit_logs_action_enum_old" USING "action"::"text"::"public"."audit_logs_action_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum_old" RENAME TO "audit_logs_action_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "actorRole" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "actorUserId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP COLUMN "breakMinutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" DROP COLUMN "nextReviewOn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" DROP COLUMN "restrictions"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" DROP COLUMN "acclimatisationAnswer"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" DROP COLUMN "heatIllness"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_6e7355b2b2baaf1235585d7fd0"`,
    );
    await queryRunner.query(`DROP TABLE "water_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dfddb6262df7ade1bc4a935f1b"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_89d06e4cf57165cb9285e0f32b"`,
    );
    await queryRunner.query(`DROP TABLE "help_requests"`);
    await queryRunner.query(`DROP TYPE "public"."help_requests_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."help_requests_kind_enum"`);
  }
}
