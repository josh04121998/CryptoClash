import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // db.test.ts and api.test.ts both hit the same live Postgres (DATABASE_URL) and
    // wipe the whole `accounts` table in their beforeEach/afterEach hooks — running
    // test *files* in parallel (vitest's default) races those hooks against each
    // other's fixtures, causing intermittent cross-file failures unrelated to any
    // real bug (observed directly: an unmodified rerun flipped a failure to a pass).
    fileParallelism: false,
  },
});
