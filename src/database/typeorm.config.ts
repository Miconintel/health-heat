import { DataSourceOptions } from 'typeorm';
import { join } from 'node:path';

/**
 * Shared by the Nest app and the TypeORM CLI (migrations, seeds).
 *
 * Connection: either DATABASE_URL (e.g. Render's "External Database URL"), or
 * DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME.
 * DB_SSL=true encrypts the connection, which hosted databases such as Render require
 * from outside their network.
 */
export function typeormOptions(
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const ssl = env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
  const connection = env.DATABASE_URL
    ? { url: env.DATABASE_URL }
    : {
        host: env.DB_HOST,
        port: Number(env.DB_PORT ?? 5432),
        username: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
      };
  return {
    type: 'postgres',
    ...connection,
    ssl,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false, // schema changes go through migrations only
    migrationsRun: false,
  };
}
