import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Runs before each test file. Only unapplied migrations run, so it is idempotent.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
