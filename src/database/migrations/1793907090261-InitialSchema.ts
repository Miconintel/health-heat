import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1793907090261 implements MigrationInterface {
  name = 'InitialSchema1793907090261';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_actorrole_enum" AS ENUM('admin', 'occupational_health', 'supervisor', 'worker')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."audit_logs_action_enum" AS ENUM('health_profile.read', 'health_profile.write', 'health_profile.approve', 'health_profile.review_requested', 'health_profile.erased', 'consent.changed', 'worker.data_exported', 'risk_threshold.changed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "actorUserId" uuid NOT NULL, "actorRole" "public"."audit_logs_actorrole_enum" NOT NULL, "action" "public"."audit_logs_action_enum" NOT NULL, "subjectWorkerId" uuid, "entityType" text, "entityId" uuid, "metadata" jsonb, CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8ef9d671fa8b7c692a865edbc1" ON "audit_logs"  ("subjectWorkerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9885c0f9a2e4081ebae4313d87" ON "audit_logs"  ("organizationId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."environmental_readings_source_enum" AS ENUM('weather_api', 'sensor')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."environmental_readings_wbgtmethod_enum" AS ENUM('measured', 'estimated')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."environmental_readings_confidence_enum" AS ENUM('high', 'medium', 'low')`,
    );
    await queryRunner.query(
      `CREATE TABLE "environmental_readings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "siteId" uuid NOT NULL, "observedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "isForecast" boolean NOT NULL DEFAULT false, "source" "public"."environmental_readings_source_enum" NOT NULL, "airTempC" double precision, "relativeHumidity" double precision, "solarRadiationWm2" double precision, "windSpeedMs" double precision, "precipitationMm" double precision, "wbgtSunC" double precision, "wbgtShadeC" double precision, "wbgtMethod" "public"."environmental_readings_wbgtmethod_enum" NOT NULL, "wbgtModel" text, "confidence" "public"."environmental_readings_confidence_enum" NOT NULL, CONSTRAINT "PK_dc4b68d42f98b0a4b482b1c07ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c82fca001b118e21b71aec916d" ON "environmental_readings"  ("siteId", "observedAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."consents_purpose_enum" AS ENUM('health_data_processing')`,
    );
    await queryRunner.query(
      `CREATE TABLE "consents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "workerId" uuid NOT NULL, "purpose" "public"."consents_purpose_enum" NOT NULL, "granted" boolean NOT NULL, "policyVersion" character varying NOT NULL, "recordedByUserId" uuid NOT NULL, CONSTRAINT "PK_9efc68eb6aba7d638fb6ea034dd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9ee6fc00a8c37fdd3a2718cf0" ON "consents"  ("workerId", "purpose", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying NOT NULL, CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "sites" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "name" character varying NOT NULL, "latitude" double precision NOT NULL, "longitude" double precision NOT NULL, "timezone" character varying NOT NULL DEFAULT 'UTC', CONSTRAINT "PK_4f5eccb1dfde10c9170502595a7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_adb9781864a04730f7223964cc" ON "sites"  ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "crews" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "siteId" uuid NOT NULL, "name" character varying NOT NULL, "supervisorUserId" uuid, CONSTRAINT "PK_4316f43ffc0d2bbb0c4c767ba5c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_98247e42cb222661735535c9f4" ON "crews"  ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a911c34caa241f37cb029cb753" ON "crews"  ("siteId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "workers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "employeeCode" character varying NOT NULL, "displayName" character varying NOT NULL, "crewId" uuid, "preferredLanguage" character varying NOT NULL DEFAULT 'en', "acclimatized" boolean NOT NULL DEFAULT false, "acclimatizationStartedOn" date, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_e950c9aba3bd84a4f193058d838" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a760eccecba26c8d25138576d9" ON "workers"  ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7078a5d20360df7f784b7ec015" ON "workers"  ("crewId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."health_profiles_precautionlevel_enum" AS ENUM('standard', 'enhanced', 'high_priority')`,
    );
    await queryRunner.query(
      `CREATE TABLE "health_profiles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "workerId" uuid NOT NULL, "ageRange" text, "healthConditions" text, "medicalHistory" text, "medications" text, "precautionNotes" text, "precautionLevel" "public"."health_profiles_precautionlevel_enum" NOT NULL DEFAULT 'standard', "approvedByUserId" uuid, "approvedAt" TIMESTAMP WITH TIME ZONE, "reviewRequested" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_b5fdbed8618156bd65849a387c3" UNIQUE ("workerId"), CONSTRAINT "REL_b5fdbed8618156bd65849a387c" UNIQUE ("workerId"), CONSTRAINT "PK_bfcb0de64c3eaf755e66ebb2211" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."interventions_status_enum" AS ENUM('acknowledged', 'implemented', 'dismissed')`,
    );
    await queryRunner.query(
      `CREATE TABLE "interventions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "recommendationId" uuid NOT NULL, "status" "public"."interventions_status_enum" NOT NULL, "recordedByUserId" uuid NOT NULL, "note" text, CONSTRAINT "PK_39babe074cbaa90750582bfc38d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a6c62eddeb7b1e0d08b763451d" ON "interventions"  ("recommendationId") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ppe_items_category_enum" AS ENUM('clothing', 'head', 'respiratory', 'other')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ppe_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid, "code" character varying NOT NULL, "name" character varying NOT NULL, "category" "public"."ppe_items_category_enum" NOT NULL, "wbgtAdjustmentC" double precision NOT NULL DEFAULT '0', "source" text, "isPlaceholder" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_9b86d1225b945304eb7cd744112" UNIQUE ("code"), CONSTRAINT "PK_78fc9f5dc36e59e26ed0868171f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9020a2a940446ee56efc07c62e" ON "ppe_items"  ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE TABLE "worker_ppe" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "workerId" uuid NOT NULL, "ppeItemId" uuid NOT NULL, CONSTRAINT "UQ_b2a537acba53428914e3b595724" UNIQUE ("workerId", "ppeItemId"), CONSTRAINT "PK_cda5cefaebefd1a8ace7c23cd55" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recommendations_audience_enum" AS ENUM('worker', 'supervisor')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recommendations_timing_enum" AS ENUM('immediate', 'scheduled', 'precaution')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recommendations_status_enum" AS ENUM('open', 'acknowledged', 'implemented', 'dismissed', 'superseded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recommendations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "siteId" uuid NOT NULL, "riskAssessmentId" uuid, "workerId" uuid, "crewId" uuid, "audience" "public"."recommendations_audience_enum" NOT NULL, "code" character varying NOT NULL, "riskLevel" integer NOT NULL, "whatHappened" text NOT NULL, "whyItMatters" text NOT NULL, "whoIsAffected" text NOT NULL, "action" text NOT NULL, "timing" "public"."recommendations_timing_enum" NOT NULL, "dueAt" TIMESTAMP WITH TIME ZONE, "status" "public"."recommendations_status_enum" NOT NULL DEFAULT 'open', CONSTRAINT "PK_23a8d2db26db8cabb6ae9d6cd87" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c484f36f2a624cba6c75900223" ON "recommendations"  ("workerId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c071aae087f5105ae49ab200f1" ON "recommendations"  ("siteId", "createdAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."precaution_adjustments_precautionlevel_enum" AS ENUM('standard', 'enhanced', 'high_priority')`,
    );
    await queryRunner.query(
      `CREATE TABLE "precaution_adjustments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "precautionLevel" "public"."precaution_adjustments_precautionlevel_enum" NOT NULL, "thresholdReductionC" double precision NOT NULL DEFAULT '0', "minimumLevelWhenElevated" integer NOT NULL DEFAULT '1', "isPlaceholder" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_eca7f201edde689e0a0086582c4" UNIQUE ("precautionLevel"), CONSTRAINT "PK_1ae45c857bd37615fc2e6b0fd2a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_wbgtmethod_enum" AS ENUM('measured', 'estimated')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_assessments_confidence_enum" AS ENUM('high', 'medium', 'low')`,
    );
    await queryRunner.query(
      `CREATE TABLE "risk_assessments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "siteId" uuid NOT NULL, "workerId" uuid NOT NULL, "crewId" uuid, "workAssignmentId" uuid NOT NULL, "assessedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "level" integer NOT NULL, "effectiveWbgtC" double precision NOT NULL, "wbgtMethod" "public"."risk_assessments_wbgtmethod_enum" NOT NULL, "confidence" "public"."risk_assessments_confidence_enum" NOT NULL, "factors" jsonb NOT NULL, "forecastPeakLevel" integer, "forecastPeakAt" TIMESTAMP WITH TIME ZONE, "usesPlaceholderValues" boolean NOT NULL, CONSTRAINT "PK_2717ff3f294d30390a712653d63" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_650e0ff79ad6be7f6908adfc4d" ON "risk_assessments"  ("siteId", "assessedAt") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6026cbc4fac573fec5523e223" ON "risk_assessments"  ("workerId", "assessedAt") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_thresholds_workload_enum" AS ENUM('light', 'moderate', 'heavy', 'very_heavy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."risk_thresholds_workrestband_enum" AS ENUM('75_100', '50_75', '25_50', '0_25')`,
    );
    await queryRunner.query(
      `CREATE TABLE "risk_thresholds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "workload" "public"."risk_thresholds_workload_enum" NOT NULL, "acclimatized" boolean NOT NULL, "workRestBand" "public"."risk_thresholds_workrestband_enum" NOT NULL, "elevatedFromC" double precision NOT NULL, "highFromC" double precision NOT NULL, "criticalFromC" double precision NOT NULL, "source" text, "isPlaceholder" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_cd69a58b716b6beef525242065c" UNIQUE ("workload", "acclimatized", "workRestBand"), CONSTRAINT "PK_57ee7f5883f9daaf7b5549db245" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'occupational_health', 'supervisor', 'worker')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "email" character varying NOT NULL, "passwordHash" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "workerId" uuid, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_5850372d088b782825485584177" UNIQUE ("workerId"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f3d6aea8fcca58182b2e80ce97" ON "users"  ("organizationId") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."activity_categories_defaultworkload_enum" AS ENUM('light', 'moderate', 'heavy', 'very_heavy')`,
    );
    await queryRunner.query(
      `CREATE TABLE "activity_categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "code" character varying NOT NULL, "name" character varying NOT NULL, "defaultWorkload" "public"."activity_categories_defaultworkload_enum" NOT NULL, "isPlaceholder" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_c81324fcd56d540bab457b270a9" UNIQUE ("code"), CONSTRAINT "PK_8cc7b00daa0d770af779497e32c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."work_assignments_workloadoverride_enum" AS ENUM('light', 'moderate', 'heavy', 'very_heavy')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."work_assignments_workenvironment_enum" AS ENUM('direct_sun', 'shade', 'indoor')`,
    );
    await queryRunner.query(
      `CREATE TABLE "work_assignments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" uuid NOT NULL, "workerId" uuid NOT NULL, "siteId" uuid NOT NULL, "activityCategoryId" uuid NOT NULL, "workloadOverride" "public"."work_assignments_workloadoverride_enum", "workEnvironment" "public"."work_assignments_workenvironment_enum" NOT NULL, "startsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "endsAt" TIMESTAMP WITH TIME ZONE NOT NULL, "workMinutesPerHour" integer NOT NULL DEFAULT '60', CONSTRAINT "PK_544be1ffd82eb7a344e1d550418" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d5e3b73494e8df46e47f0557d0" ON "work_assignments"  ("siteId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9e6e7b7fb6d06283839ee0272" ON "work_assignments"  ("workerId", "startsAt") `,
    );
    await queryRunner.query(
      `ALTER TABLE "sites" ADD CONSTRAINT "FK_adb9781864a04730f7223964cce" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "crews" ADD CONSTRAINT "FK_a911c34caa241f37cb029cb7530" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" ADD CONSTRAINT "FK_7078a5d20360df7f784b7ec015c" FOREIGN KEY ("crewId") REFERENCES "crews"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" ADD CONSTRAINT "FK_b5fdbed8618156bd65849a387c3" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "worker_ppe" ADD CONSTRAINT "FK_11089ccdfed8a1b6b3a3d22740b" FOREIGN KEY ("ppeItemId") REFERENCES "ppe_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_assignments" ADD CONSTRAINT "FK_b38b23c7877993b3ef591c5db99" FOREIGN KEY ("activityCategoryId") REFERENCES "activity_categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "work_assignments" DROP CONSTRAINT "FK_b38b23c7877993b3ef591c5db99"`,
    );
    await queryRunner.query(
      `ALTER TABLE "worker_ppe" DROP CONSTRAINT "FK_11089ccdfed8a1b6b3a3d22740b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "health_profiles" DROP CONSTRAINT "FK_b5fdbed8618156bd65849a387c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "workers" DROP CONSTRAINT "FK_7078a5d20360df7f784b7ec015c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "crews" DROP CONSTRAINT "FK_a911c34caa241f37cb029cb7530"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sites" DROP CONSTRAINT "FK_adb9781864a04730f7223964cce"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b9e6e7b7fb6d06283839ee0272"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d5e3b73494e8df46e47f0557d0"`,
    );
    await queryRunner.query(`DROP TABLE "work_assignments"`);
    await queryRunner.query(
      `DROP TYPE "public"."work_assignments_workenvironment_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."work_assignments_workloadoverride_enum"`,
    );
    await queryRunner.query(`DROP TABLE "activity_categories"`);
    await queryRunner.query(
      `DROP TYPE "public"."activity_categories_defaultworkload_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f3d6aea8fcca58182b2e80ce97"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(`DROP TABLE "risk_thresholds"`);
    await queryRunner.query(
      `DROP TYPE "public"."risk_thresholds_workrestband_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_thresholds_workload_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f6026cbc4fac573fec5523e223"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_650e0ff79ad6be7f6908adfc4d"`,
    );
    await queryRunner.query(`DROP TABLE "risk_assessments"`);
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_confidence_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."risk_assessments_wbgtmethod_enum"`,
    );
    await queryRunner.query(`DROP TABLE "precaution_adjustments"`);
    await queryRunner.query(
      `DROP TYPE "public"."precaution_adjustments_precautionlevel_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c071aae087f5105ae49ab200f1"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c484f36f2a624cba6c75900223"`,
    );
    await queryRunner.query(`DROP TABLE "recommendations"`);
    await queryRunner.query(`DROP TYPE "public"."recommendations_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."recommendations_timing_enum"`);
    await queryRunner.query(
      `DROP TYPE "public"."recommendations_audience_enum"`,
    );
    await queryRunner.query(`DROP TABLE "worker_ppe"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9020a2a940446ee56efc07c62e"`,
    );
    await queryRunner.query(`DROP TABLE "ppe_items"`);
    await queryRunner.query(`DROP TYPE "public"."ppe_items_category_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a6c62eddeb7b1e0d08b763451d"`,
    );
    await queryRunner.query(`DROP TABLE "interventions"`);
    await queryRunner.query(`DROP TYPE "public"."interventions_status_enum"`);
    await queryRunner.query(`DROP TABLE "health_profiles"`);
    await queryRunner.query(
      `DROP TYPE "public"."health_profiles_precautionlevel_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7078a5d20360df7f784b7ec015"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a760eccecba26c8d25138576d9"`,
    );
    await queryRunner.query(`DROP TABLE "workers"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a911c34caa241f37cb029cb753"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_98247e42cb222661735535c9f4"`,
    );
    await queryRunner.query(`DROP TABLE "crews"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_adb9781864a04730f7223964cc"`,
    );
    await queryRunner.query(`DROP TABLE "sites"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9ee6fc00a8c37fdd3a2718cf0"`,
    );
    await queryRunner.query(`DROP TABLE "consents"`);
    await queryRunner.query(`DROP TYPE "public"."consents_purpose_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c82fca001b118e21b71aec916d"`,
    );
    await queryRunner.query(`DROP TABLE "environmental_readings"`);
    await queryRunner.query(
      `DROP TYPE "public"."environmental_readings_confidence_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."environmental_readings_wbgtmethod_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."environmental_readings_source_enum"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9885c0f9a2e4081ebae4313d87"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8ef9d671fa8b7c692a865edbc1"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_action_enum"`);
    await queryRunner.query(`DROP TYPE "public"."audit_logs_actorrole_enum"`);
  }
}
