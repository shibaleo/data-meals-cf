/**
 * Auth for data-meals — Clerk JWT verification + lazy app_user provisioning.
 * The DB row owns the display name so edits in our Settings dialog persist
 * independently of the Clerk-side profile.
 */
import * as jose from "jose";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { appUser } from "@/lib/db/schema";

export interface AuthResult {
  authenticated: true;
  userId: string;     // app_user.id
  externalId: string; // Clerk userId
  name: string;
  email: string;
}

function getClerkDomain(): string | null {
  const pk = env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!pk) return null;
  const encoded = pk.replace(/^pk_(test|live)_/, "");
  try {
    return atob(encoded).replace(/\$$/, "");
  } catch {
    return null;
  }
}

let clerkJWKS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
function getClerkJWKS() {
  if (clerkJWKS) return clerkJWKS;
  const domain = getClerkDomain();
  if (!domain) return null;
  clerkJWKS = jose.createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  return clerkJWKS;
}

interface ClerkProfile {
  email: string | null;
  name: string | null;
}
const profileCache = new Map<string, { profile: ClerkProfile; expiresAt: number }>();
const PROFILE_CACHE_TTL = 10 * 60 * 1000;

async function fetchClerkProfile(userId: string): Promise<ClerkProfile> {
  const entry = profileCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) return entry.profile;
  const secret = env.CLERK_SECRET_KEY;
  if (!secret) return { email: null, name: null };
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return { email: null, name: null };
    const data = await res.json() as {
      email_addresses?: Array<{ email_address: string; id: string }>;
      primary_email_address_id?: string;
      first_name?: string | null;
      last_name?: string | null;
      username?: string | null;
    };
    const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id);
    const email = primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? null;
    const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
    const name = fullName || data.username || (email ? email.split("@")[0] : null);
    const profile: ClerkProfile = { email, name };
    profileCache.set(userId, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL });
    return profile;
  } catch {
    return { email: null, name: null };
  }
}

/**
 * Look up by externalId; fall back to email; otherwise insert. We never
 * rename via Clerk after the first creation — our Settings dialog is the
 * source of truth.
 */
async function getOrCreateAppUser(externalId: string, profile: ClerkProfile) {
  const byExt = await db.select().from(appUser).where(eq(appUser.externalId, externalId)).limit(1);
  if (byExt.length > 0) return byExt[0];

  if (profile.email) {
    const byEmail = await db.select().from(appUser).where(eq(appUser.email, profile.email)).limit(1);
    if (byEmail.length > 0) {
      // First Clerk-authenticated visit for an email we've seen — link it.
      const [linked] = await db.update(appUser)
        .set({ externalId, updatedAt: new Date() })
        .where(eq(appUser.id, byEmail[0].id))
        .returning();
      return linked;
    }
  }

  // No existing row — create one. Pull initial display name from Clerk.
  const email = profile.email ?? `${externalId}@clerk.local`;
  const name = profile.name ?? email.split("@")[0];
  try {
    const [created] = await db.insert(appUser)
      .values({ email, name, externalId })
      .returning();
    return created;
  } catch {
    // Concurrent insert race — re-select by externalId.
    const reread = await db.select().from(appUser).where(eq(appUser.externalId, externalId)).limit(1);
    return reread[0] ?? null;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const m = cookieHeader.match(/(?:^|;\s*)__session=([^;]*)/);
  return m ? m[1] : null;
}

export async function authenticate(req: Request): Promise<AuthResult | null> {
  const token = extractToken(req);
  if (!token) return null;
  const jwks = getClerkJWKS();
  if (!jwks) return null;
  try {
    const { payload } = await jose.jwtVerify(token, jwks);
    const externalId = payload.sub as string;
    if (!externalId) return null;
    const profile = await fetchClerkProfile(externalId);
    const dbUser = await getOrCreateAppUser(externalId, profile);
    if (!dbUser) return null;
    return {
      authenticated: true,
      userId: dbUser.id,
      externalId,
      name: dbUser.name,
      email: dbUser.email,
    };
  } catch {
    return null;
  }
}
