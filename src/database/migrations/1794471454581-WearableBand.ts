import { MigrationInterface, QueryRunner } from 'typeorm';

export class WearableBand1794471454581 implements MigrationInterface {
  name = 'WearableBand1794471454581';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "wearable_devices" ("workerId" uuid NOT NULL, "deviceId" character varying NOT NULL, "model" character varying(80), "pairedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE, "batteryPercent" integer, CONSTRAINT "PK_9744ede9dccdde381c6bb42b96e" PRIMARY KEY ("workerId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "wearable_readings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workerId" uuid NOT NULL, "at" TIMESTAMP WITH TIME ZONE NOT NULL, "values" text NOT NULL, CONSTRAINT "UQ_a4e84895b8775560439cda6a5c1" UNIQUE ("workerId", "at"), CONSTRAINT "PK_4cc8abbbde3a33f217537b49c05" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a4e84895b8775560439cda6a5c" ON "wearable_readings"  ("workerId", "at") `,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum" ADD VALUE 'wearable.read'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum_old" AS ENUM('health_profile.read', 'health_profile.write', 'health_profile.approve', 'health_profile.review_requested', 'health_profile.erased', 'consent.changed', 'worker.data_exported', 'risk_threshold.changed', 'risk.detail_read', 'worker.acclimatization_changed', 'symptom_report.read', 'risk.overview_viewed', 'health_data.retention_erased')`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ALTER COLUMN "action" TYPE "public"."audit_logs_action_enum_old" USING "action"::"text"::"public"."audit_logs_action_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."audit_logs_action_enum_old" RENAME TO "audit_logs_action_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a4e84895b8775560439cda6a5c"`,
    );
    await queryRunner.query(`DROP TABLE "wearable_readings"`);
    await queryRunner.query(`DROP TABLE "wearable_devices"`);
  }
}
