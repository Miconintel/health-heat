import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { typeormOptions } from './typeorm.config';

config();

/** Used by `npm run migration:*` and the seed script. */
export default new DataSource(typeormOptions());
