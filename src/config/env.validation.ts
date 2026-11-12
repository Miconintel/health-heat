import { plainToInstance, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  PORT: number = 3000;

  /** Swagger (/docs, /docs-json) is on outside production; "true" also turns it on in production. */
  @IsOptional() @IsIn(['true', 'false']) SWAGGER_ENABLED?: string;

  /** Full connection URL (e.g. Render's "External Database URL"). When set, DB_HOST... are not needed. */
  @IsOptional() @IsString() DATABASE_URL?: string;
  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_HOST?: string;
  @Type(() => Number) @IsInt() DB_PORT: number = 5432;
  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_USER?: string;
  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_PASSWORD?: string;
  @ValidateIf((o: EnvironmentVariables) => !o.DATABASE_URL)
  @IsString()
  DB_NAME?: string;
  /** "true" for hosted databases that require SSL (e.g. Render, from outside Render). */
  @IsOptional() @IsIn(['true', 'false']) DB_SSL?: string;

  @IsString() @MinLength(32) JWT_ACCESS_SECRET!: string;
  @IsString() @MinLength(32) JWT_REFRESH_SECRET!: string;
  @IsString() JWT_ACCESS_TTL: string = '15m';
  @IsString() JWT_REFRESH_TTL: string = '7d';

  /** 32 random bytes, base64. Generate with: openssl rand -base64 32 */
  @IsString() HEALTH_DATA_ENCRYPTION_KEY!: string;

  /**
   * Comma-separated browser origins allowed to call the API. `*` matches one part of a
   * host name (no dots), used here for the frontend team's Vercel preview deployments.
   */
  @IsString()
  @IsOptional()
  CORS_ORIGINS: string =
    'https://heat-guard-nine.vercel.app,http://localhost:5173,https://heat-guard-*-ahmads-projects-727aea25.vercel.app';

  @IsString()
  @IsOptional()
  OPEN_METEO_AIR_QUALITY_URL: string =
    'https://air-quality-api.open-meteo.com/v1/air-quality';

  @IsString() OPEN_METEO_BASE_URL: string =
    'https://api.open-meteo.com/v1/forecast';

  @IsBoolean()
  @IsOptional()
  WEATHER_POLLING_ENABLED: boolean = false;

  /** External HeatGuard AI risk engine. */
  @IsUrl({ require_tld: false })
  ENGINE_BASE_URL: string = 'https://heatguard-ai-engine.onrender.com';

  /** Sent as X-API-Key. Server-side only; never expose to the frontend. */
  @IsString() @MinLength(1) ENGINE_API_KEY!: string;

  /** Generous default: a sleeping Render instance takes 20–60 s to wake. */
  @Type(() => Number) @IsInt() @Min(1000) ENGINE_TIMEOUT_MS: number = 60_000;

  @IsBoolean()
  @IsOptional()
  ENGINE_KEEPALIVE: boolean = false;

  /** Turn on once the engine accepts the `hood` field; until then sending it would cause 422s. */
  @IsBoolean()
  @IsOptional()
  ENGINE_SUPPORTS_HOOD: boolean = false;

  /** WBGT from the engine's POST /v1/wbgt (on by default). Off = readings stored without WBGT. */
  @IsBoolean()
  @IsOptional()
  ENGINE_WBGT_ENABLED: boolean = true;

  /** Wearable band feature (pairing, readings, display). Off until wanted. */
  @IsBoolean()
  @IsOptional()
  WEARABLES_ENABLED: boolean = false;

  /** Send band summaries to the engine. Turn on once the engine accepts the `wearable` field (422 otherwise). */
  @IsBoolean()
  @IsOptional()
  ENGINE_SUPPORTS_WEARABLES: boolean = false;
}

export function validateEnv(config: Record<string, unknown>) {
  const normalised = {
    ...config,
    // An empty value (`SWAGGER_ENABLED=`) means "not set".
    SWAGGER_ENABLED: config.SWAGGER_ENABLED || undefined,
    WEATHER_POLLING_ENABLED: config.WEATHER_POLLING_ENABLED === 'true',
    ENGINE_KEEPALIVE: config.ENGINE_KEEPALIVE === 'true',
    ENGINE_SUPPORTS_HOOD: config.ENGINE_SUPPORTS_HOOD === 'true',
    ENGINE_WBGT_ENABLED: config.ENGINE_WBGT_ENABLED !== 'false',
    WEARABLES_ENABLED: config.WEARABLES_ENABLED === 'true',
    ENGINE_SUPPORTS_WEARABLES: config.ENGINE_SUPPORTS_WEARABLES === 'true',
  };
  const validated = plainToInstance(EnvironmentVariables, normalised, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }
  return validated;
}
