const BASE = import.meta.env.BASE_URL;

export function apiUrl(path: string): string {
  const clean = path.replace(/^\//, "");
  return `${BASE}api/${clean}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(apiUrl(path));
  if (!r.ok) throw new Error((await r.json()).error || r.statusText);
  return (await r.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const r = await fetch(apiUrl(path), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      msg = (await r.json()).error || msg;
    } catch {}
    throw new Error(msg);
  }
  return (await r.json()) as T;
}
