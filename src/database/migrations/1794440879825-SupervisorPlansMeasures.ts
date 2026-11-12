import { MigrationInterface, QueryRunner } from 'typeorm';

export class SupervisorPlansMeasures1794440879825 implements MigrationInterface {
  name = 'SupervisorPlansMeasures1794440879825';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "device_status" ("workerId" uuid NOT NULL, "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL, "batteryPercent" integer, "charging" boolean, CONSTRAINT "PK_933559d88ef7a653404a0cb3e8e" PRIMARY KEY ("workerId"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "shift_plans" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "siteId" uuid NOT NULL, "date" date NOT NULL, "hours" jsonb NOT NULL, "crews" jsonb NOT NULL, "status" character varying(8) NOT NULL DEFAULT 'draft', "sentAt" TIMESTAMP WITH TIME ZONE, "updatedByUserId" uuid, CONSTRAINT "UQ_85d561ba7abb39554dd877925af" UNIQUE ("siteId", "date"), CONSTRAINT "PK_3c2ad0fd93e7bcbb9c179e8f7ed" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "site_hourly_levels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "siteId" uuid NOT NULL, "hourStart" TIMESTAMP WITH TIME ZONE NOT NULL, "observedLevel" integer, "observedWbgtC" double precision, "observedAt" TIMESTAMP WITH TIME ZONE, "firstForecastLevel" integer, "firstForecastAt" TIMESTAMP WITH TIME ZONE, "firstWarningAt" TIMESTAMP WITH TIME ZONE, "latestForecastLevel" integer, "latestPossibleLevel" integer, "latestConfidence" character varying(16), "latestForecastAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "UQ_f5549cfc87001f919f7daa7e633" UNIQUE ("siteId", "hourStart"), CONSTRAINT "PK_b2323b6b6b706f07e6ae88299cf" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f5549cfc87001f919f7daa7e63" ON "site_hourly_levels"  ("siteId", "hourStart") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."work_events_type_enum" AS ENUM('clock_in', 'break_start', 'break_end', 'clock_out')`,
    );
    await queryRunner.query(
      `CREATE TABLE "work_events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "siteId" uuid NOT NULL, "workerId" uuid NOT NULL, "assignmentId" uuid NOT NULL, "type" "public"."work_events_type_enum" NOT NULL, "at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_71ecf741ef8c46506959ae9bbee" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_641fe79813dbcab4b1a7bed7da" ON "work_events"  ("workerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c473a42907c52b88e812ef6837" ON "work_events"  ("siteId", "at") `,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "weatherCode" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "dustUgM3" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "pm10UgM3" double precision`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."interventions_status_enum" ADD VALUE 'reassigned'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."interventions_status_enum_old" AS ENUM('acknowledged', 'implemented', 'dismissed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "interventions" ALTER COLUMN "status" TYPE "public"."interventions_status_enum_old" USING "status"::"text"::"public"."interventions_status_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."interventions_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."interventions_status_enum_old" RENAME TO "interventions_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "pm10UgM3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "dustUgM3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "weatherCode"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c473a42907c52b88e812ef6837"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_641fe79813dbcab4b1a7bed7da"`,
    );
    await queryRunner.query(`DROP TABLE "work_events"`);
    await queryRunner.query(`DROP TYPE "public"."work_events_type_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f5549cfc87001f919f7daa7e63"`,
    );
    await queryRunner.query(`DROP TABLE "site_hourly_levels"`);
    await queryRunner.query(`DROP TABLE "shift_plans"`);
    await queryRunner.query(`DROP TABLE "device_status"`);
  }
}
