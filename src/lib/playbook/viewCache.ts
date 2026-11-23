// The Playbook's last view, kept in this browser so a reload shows it at once.
// Keyed by user as well as account (account ids are the same for everyone),
// and cleared on sign-out, so nobody else using this browser sees it.

const PREFIX = "playbook:view:";

export const viewCacheKey = (userId: string, accountId: string) => `${PREFIX}${userId}:${accountId}`;

export function readCachedView<T>(userId: string, accountId: string): T | undefined {
  try {
    const saved = localStorage.getItem(viewCacheKey(userId, accountId));
    return saved ? (JSON.parse(saved) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedView(userId: string, accountId: string, view: unknown) {
  try {
    localStorage.setItem(viewCacheKey(userId, accountId), JSON.stringify(view));
    // The first version keyed views by account only: drop those.
    localStorage.removeItem(PREFIX + accountId);
  } catch {
    // Storage full or blocked: the page just loads without a cached view.
  }
}

/** Removes every cached view (any user's). Called on sign-out. */
export function clearCachedViews() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k);
  } catch {}
}
