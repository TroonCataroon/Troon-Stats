import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../supabase/migrations/003_private_deal_snapshots.sql", import.meta.url),
  "utf8",
);

test("private deal token hashing schema-qualifies pgcrypto digest", () => {
  assert.match(migration, /extensions\.digest\(p_access_token,\s*'sha256'\)/);
  assert.doesNotMatch(migration, /(?<!extensions\.)digest\(p_access_token,\s*'sha256'\)/);
});
