import { MigrationInterface, QueryRunner } from 'typeorm';

export class ForecastUncertainty1794438073465 implements MigrationInterface {
  name = 'ForecastUncertainty1794438073465';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastConfidence" character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastConfidenceNote" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastPossiblePeakLevel" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" ADD "forecastPossiblePeakAt" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastPossiblePeakAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastPossiblePeakLevel"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastConfidenceNote"`,
    );
    await queryRunner.query(
      `ALTER TABLE "risk_assessments" DROP COLUMN "forecastConfidence"`,
    );
  }
}
