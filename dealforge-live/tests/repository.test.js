import test from "node:test";
import assert from "node:assert/strict";
import { DealForgeRepository } from "../lib/repository.js";

test("repository scopes list requests to the authenticated user", async () => {
  const calls = [];
  const client = {
    rest: async (...args) => {
      calls.push(args);
      return [];
    },
  };
  const repository = new DealForgeRepository(client);
  await repository.list("watchlist", "user-1");
  assert.equal(calls[0][1].query.user_id, "eq.user-1");
});

test("repository forces inserted rows to the authenticated user", async () => {
  const calls = [];
  const client = {
    rest: async (...args) => {
      calls.push(args);
      return [{ id: "row-1" }];
    },
  };
  const repository = new DealForgeRepository(client);
  await repository.insert("alerts", "user-1", { user_id: "other", enabled: true });
  assert.equal(calls[0][1].body.user_id, "user-1");
});
