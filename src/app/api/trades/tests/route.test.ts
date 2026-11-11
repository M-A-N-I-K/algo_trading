import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// In-memory trades table: enough of Prisma for the create path.
const rows = new Map<string, Record<string, unknown>>();
vi.mock("@/lib/auth", () => ({ authenticateRequest: async () => ({ id: "u1", defaultStrategy: "smc" }), authChallengeResponse: () => new Response(null, { status: 401 }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    trade: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => { const r = rows.get(where.id); return r && r.userId === where.userId ? r : null; },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        // Yield first, like a real round trip, so two requests can race.
        await new Promise((r) => setTimeout(r, 5));
        const id = (data.id as string) ?? crypto.randomUUID();
        if (rows.has(id)) throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        const row = { ...data, id };
        rows.set(id, row);
        return row;
      },
    },
  },
}));

const { POST } = await import("../route");
const body = (requestId?: string) => ({ time: "2026-11-11 16:41", symbol: "XAUUSD", side: "SHORT", quantity: 0.03, entryPrice: 4009.55, exitPrice: 4000, pnl: 28.65, requestId });
const post = (b: unknown) => POST(new NextRequest("http://x/api/trades", { method: "POST", body: JSON.stringify(b) }));

describe("POST /api/trades", () => {
  beforeEach(() => rows.clear());
  it("saves a repeated request once", async () => {
    const id = crypto.randomUUID();
    const first = await post(body(id));
    const again = await post(body(id));
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(rows.size).toBe(1);
  });
  it("saves two copies sent at the same moment once", async () => {
    const id = crypto.randomUUID();
    const res = await Promise.all([post(body(id)), post(body(id)), post(body(id))]);
    expect(res.every((r) => r.status < 300)).toBe(true);
    expect(rows.size).toBe(1);
  });
  it("still saves separate trades without a request id", async () => {
    await post(body());
    await post(body());
    expect(rows.size).toBe(2);
  });
});
