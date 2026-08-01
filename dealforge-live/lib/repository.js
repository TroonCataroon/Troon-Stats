const TABLES = ["watchlist", "saved_searches", "settings", "alerts", "comparisons", "manual_imports", "alert_events"];

export class DealForgeRepository {
  constructor(client) {
    this.client = client;
  }

  async list(table, userId, { order = "created_at.desc", limit = 250 } = {}) {
    assertTable(table);
    return this.client.rest(table, {
      query: {
        select: "*",
        user_id: `eq.${userId}`,
        order,
        limit,
      },
    });
  }

  async insert(table, userId, row) {
    assertTable(table);
    const body = { ...row, user_id: userId };
    const result = await this.client.rest(table, {
      method: "POST",
      body,
      prefer: "return=representation",
    });
    return result?.[0] ?? result;
  }

  async upsert(table, userId, row, onConflict) {
    assertTable(table);
    const query = onConflict ? { on_conflict: onConflict } : {};
    const result = await this.client.rest(table, {
      method: "POST",
      query,
      body: { ...row, user_id: userId },
      prefer: "resolution=merge-duplicates,return=representation",
    });
    return result?.[0] ?? result;
  }

  async update(table, userId, id, patch) {
    assertTable(table);
    const result = await this.client.rest(table, {
      method: "PATCH",
      query: {
        id: `eq.${id}`,
        user_id: `eq.${userId}`,
      },
      body: { ...patch, user_id: userId },
      prefer: "return=representation",
    });
    return result?.[0] ?? result;
  }

  async remove(table, userId, id) {
    assertTable(table);
    await this.client.rest(table, {
      method: "DELETE",
      query: {
        id: `eq.${id}`,
        user_id: `eq.${userId}`,
      },
    });
  }

  async loadWorkspace(userId) {
    const [watchlist, savedSearches, settingsRows, alerts, comparisons, manualImports, alertEvents] =
      await Promise.all([
        this.list("watchlist", userId),
        this.list("saved_searches", userId),
        this.list("settings", userId, { order: "updated_at.desc", limit: 1 }),
        this.list("alerts", userId),
        this.list("comparisons", userId),
        this.list("manual_imports", userId),
        this.list("alert_events", userId),
      ]);

    return {
      watchlist,
      savedSearches,
      settings: settingsRows?.[0]?.preferences ?? {},
      alerts,
      comparisons,
      manualImports,
      alertEvents,
    };
  }

  async saveSettings(userId, preferences) {
    return this.upsert(
      "settings",
      userId,
      {
        user_id: userId,
        preferences,
        updated_at: new Date().toISOString(),
      },
      "user_id",
    );
  }
}

function assertTable(table) {
  if (!TABLES.includes(table)) throw new Error(`Unsupported table: ${table}`);
}
