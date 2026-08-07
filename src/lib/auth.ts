import { scryptSync, randomBytes } from "crypto";
import { prisma } from "./db";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password: string, hash: string): boolean {
  const parts = hash.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [salt, key] = parts;
  const derivedKey = scryptSync(password, salt, 64).toString("hex");
  return derivedKey === key;
}

export async function authenticateRequest(request: Request) {
  // 1. Try NextAuth browser session first (Google Login)
  try {
    const session = await getServerSession(authOptions);
    if (session?.user) {
      const userId = (session.user as any).id;
      if (userId) {
        const user = await prisma.user.findUnique({
          where: { id: userId }
        });
        if (user) {
          return user;
        }
      }
    }
  } catch (e) {
    console.error("NextAuth session check failed:", e);
  }

  // 2. Fallback to HTTP Basic Auth (CLI/API executions)
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return null;
  }

  try {
    const base64Credentials = authHeader.split(" ")[1];
    const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
    const parts = credentials.split(":");
    if (parts.length < 2) {
      return null;
    }
    const username = parts[0].trim().toLowerCase();
    const password = parts.slice(1).join(":");

    if (!username || !password) {
      return null;
    }

    let user = await prisma.user.findUnique({
      where: { username }
    });

    if (user) {
      const isValid = verifyPassword(password, user.passwordHash || "");
      if (!isValid) {
        return null;
      }
      return user;
    } else {
      // Auto-register Basic Auth user on first sight for CLI requests
      const passwordHash = hashPassword(password);
      user = await prisma.user.create({
        data: {
          username,
          passwordHash
        }
      });
      return user;
    }
  } catch (e) {
    console.error("Basic Auth check failed:", e);
    return null;
  }
}

export function authChallengeResponse() {
  return new NextResponse(
    JSON.stringify({ error: "Access denied. Credentials required." }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Basic realm="AuraJournal Login"'
      }
    }
  );
}
