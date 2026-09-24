import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Runs the Worker in workerd with a local D1 and rate limiter. Fully offline.
export default defineConfig({
  plugins: [
    cloudflareTest(async () => {
      const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
      return {
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/T000/B000/XXX',
          },
        },
      };
    }),
  ],
  test: {
    setupFiles: ['./test/apply-migrations.js'],
  },
});
