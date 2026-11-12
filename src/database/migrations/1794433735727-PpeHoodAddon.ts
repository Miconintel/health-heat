import { MigrationInterface, QueryRunner } from 'typeorm';

export class PpeHoodAddon1794433735727 implements MigrationInterface {
  name = 'PpeHoodAddon1794433735727';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."ppe_items_engineaddon_enum" AS ENUM('hood')`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" ADD "engineAddon" "public"."ppe_items_engineaddon_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "ppeNotModelled" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "ppeNotModelled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ppe_items" DROP COLUMN "engineAddon"`,
    );
    await queryRunner.query(`DROP TYPE "public"."ppe_items_engineaddon_enum"`);
  }
}
