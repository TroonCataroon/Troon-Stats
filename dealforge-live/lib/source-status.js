const LABELS = {
  live: "Connected",
  connected: "Connected",
  ready: "Connected",
  "credentials-required": "Needs credentials",
  unavailable: "Unavailable",
  error: "Error",
  "manual-import": "Manual import",
  unknown: "Unknown",
};

export function buildSourceStatus(sources = {}) {
  return Object.fromEntries(
    Object.entries(sources).map(([key, source]) => {
      const status = source?.status ?? "unknown";
      return [
        key,
        {
          ...source,
          status,
          label: LABELS[status] ?? status,
          operational: ["live", "connected", "ready", "manual-import"].includes(status),
        },
      ];
    }),
  );
}
