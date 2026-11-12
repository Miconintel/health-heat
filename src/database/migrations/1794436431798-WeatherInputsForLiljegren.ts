import { MigrationInterface, QueryRunner } from 'typeorm';

export class WeatherInputsForLiljegren1794436431798 implements MigrationInterface {
  name = 'WeatherInputsForLiljegren1794436431798';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "directRadiationWm2" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "diffuseRadiationWm2" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" ADD "surfacePressureHpa" double precision`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "surfacePressureHpa"`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "diffuseRadiationWm2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "environmental_readings" DROP COLUMN "directRadiationWm2"`,
    );
  }
}
