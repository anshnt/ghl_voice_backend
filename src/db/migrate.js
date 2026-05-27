import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';
import { logger } from '../utils/logger.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(dirname, 'migrations');

async function runMigrations() {
  try {
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files.filter((file) => file.endsWith('.sql')).sort();

    for (const file of migrationFiles) {
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      logger.info(`Applied migration ${file}`);
    }
  } catch (error) {
    logger.error('Migration failed', { message: error.message });
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

await runMigrations();
