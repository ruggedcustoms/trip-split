// A stand-in for the Cloudflare D1 binding that talks to D1 over Cloudflare's
// HTTP API, so the API can run outside Cloudflare (on Vercel). It covers the
// calls the API makes: prepare().bind().first()/all() and batch().

export function d1OverHttp({ accountId, databaseId, apiToken }) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  // Runs the statements in one request, in order. Returns one result per statement.
  async function exec(statements) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiToken}`, "content-type": "application/json" },
      body: JSON.stringify({ batch: statements.map((s) => ({ sql: s.sql, params: s.params })) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.success) {
      const why = data && data.errors && data.errors.map((e) => e.message).join("; ");
      throw new Error(`D1 query failed (${res.status}): ${why || "no details"}`);
    }
    return data.result.map((r) => ({ results: r.results || [], success: true, meta: r.meta }));
  }

  class Statement {
    constructor(sql, params = []) { this.sql = sql; this.params = params; }
    bind(...params) { return new Statement(this.sql, params); }
    async first(column) {
      const [r] = await exec([this]);
      const row = r.results[0];
      if (!row) return null;
      return column ? row[column] : row;
    }
    async all() { return (await exec([this]))[0]; }
    async run() { return (await exec([this]))[0]; }
  }

  return {
    prepare: (sql) => new Statement(sql),
    batch: (statements) => exec(statements),
  };
}
