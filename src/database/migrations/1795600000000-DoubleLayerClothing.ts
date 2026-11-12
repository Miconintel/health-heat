import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The engine added the `double_layer` clothing class (ACGIH +3 °C) on 12 Nov 2026.
 * Adding an enum value keeps existing rows untouched.
 */
export class DoubleLayerClothing1795600000000 implements MigrationInterface {
  name = 'DoubleLayerClothing1795600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."ppe_items_engineclass_enum" ADD VALUE IF NOT EXISTS 'double_layer' BEFORE 'chemical_resistant'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres can't drop an enum value: rebuild the type without it. Items that used
    // double_layer fall back to coverall (the next class down) so nothing breaks.
    await queryRunner.query(
      `UPDATE "ppe_items" SET "engineClass" = 'coverall' WHERE "engineClass" = 'double_layer'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."ppe_items_engineclass_enum" RENAME TO "ppe_items_engineclass_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ppe_items_engineclass_enum" AS ENUM('standard', 'coverall', 'chemical_resistant', 'impermeable')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" ALTER COLUMN "engineClass" TYPE "public"."ppe_items_engineclass_enum" USING "engineClass"::text::"public"."ppe_items_engineclass_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."ppe_items_engineclass_enum_old"`,
    );
  }
}
