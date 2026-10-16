// Calls the API under /api/. Errors carry .status (0 = offline).
export async function api(method, path, body) {
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Object.assign(new Error("You're offline. Check your internet and try again."), { status: 0 });
  }
  const type = r.headers.get("content-type") || "";
  if (!type.includes("json") && r.status !== 204) {
    throw Object.assign(new Error("Something went wrong. Reload and try again."), { status: r.status });
  }
  let d = null;
  try { d = await r.json(); } catch { /* empty body */ }
  if (!r.ok) throw Object.assign(new Error((d && d.error) || "Something went wrong. Try again."), { status: r.status });
  return d;
}

export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
