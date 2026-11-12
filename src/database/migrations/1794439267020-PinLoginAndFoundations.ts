import { MigrationInterface, QueryRunner } from 'typeorm';

export class PinLoginAndFoundations1794439267020 implements MigrationInterface {
  name = 'PinLoginAndFoundations1794439267020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ID + PIN login. Keep existing hashes (they now act as the PIN until an admin resets it).
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "passwordHash" TO "pinHash"`,
    );
    // Give existing accounts a login ID before making it required:
    // workers get their employee code, everyone else a generated ID an admin can change.
    await queryRunner.query(
      `ALTER TABLE "users" ADD "loginId" character varying`,
    );
    await queryRunner.query(
      `UPDATE "users" u SET "loginId" = UPPER(w."employeeCode") FROM "workers" w WHERE u."workerId" = w."id"`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "loginId" = 'U-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8)) WHERE "loginId" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "loginId" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sites" ADD "emergencyNumber" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sites" ADD "shifts" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" ADD "readAloud" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "failedLoginCount" integer NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "lockedUntil" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9ee6fc00a8c37fdd3a2718cf0"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."consents_purpose_enum" ADD VALUE 'wearable_band'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."consents_purpose_enum" ADD VALUE 'symptom_reports'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9ee6fc00a8c37fdd3a2718cf0" ON "consents"  ("workerId", "purpose", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_83a28d5385ec846e0c58c84961" ON "users"  ("loginId") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: accounts without an email cannot be restored to email login.
    await queryRunner.query(
      `DROP INDEX "public"."IDX_83a28d5385ec846e0c58c84961"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9ee6fc00a8c37fdd3a2718cf0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consents_purpose_enum_old" AS ENUM('health_data_processing')`,
    );
    await queryRunner.query(
      `ALTER TABLE "consents" ALTER COLUMN "purpose" TYPE "public"."consents_purpose_enum_old" USING "purpose"::"text"::"public"."consents_purpose_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."consents_purpose_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."consents_purpose_enum_old" RENAME TO "consents_purpose_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9ee6fc00a8c37fdd3a2718cf0" ON "consents" USING btree ("createdAt", "purpose", "workerId") `,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lockedUntil"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "failedLoginCount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" RENAME COLUMN "pinHash" TO "passwordHash"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "loginId"`);
    await queryRunner.query(`ALTER TABLE "workers" DROP COLUMN "readAloud"`);
    await queryRunner.query(`ALTER TABLE "sites" DROP COLUMN "shifts"`);
    await queryRunner.query(
      `ALTER TABLE "sites" DROP COLUMN "emergencyNumber"`,
    );
  }
}
