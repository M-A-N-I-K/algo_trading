// Shared client-side fetch helper for the app's own API routes. Surfaces
// the server's structured error `message` (see src/lib/errors) rather than
// a generic "fetch failed", and never throws unhandled raw Response objects.
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.message || `Request failed (${res.status})`);
  }
  return body as T;
}
