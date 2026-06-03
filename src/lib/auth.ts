/**
 * Auth for data-meals — Clerk JWT only (single-user app, no API keys).
 */
import * as jose from "jose";
import { env } from "@/lib/env";

export interface AuthResult {
  authenticated: true;
  userId: string;
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

const emailCache = new Map<string, { email: string | null; expiresAt: number }>();
const EMAIL_CACHE_TTL = 10 * 60 * 1000;

async function fetchClerkEmail(userId: string): Promise<string | null> {
  const entry = emailCache.get(userId);
  if (entry && Date.now() < entry.expiresAt) return entry.email;
  const secret = env.CLERK_SECRET_KEY;
  if (!secret) return null;
  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as {
      email_addresses?: Array<{ email_address: string; id: string }>;
      primary_email_address_id?: string;
      first_name?: string;
    };
    const primary = data.email_addresses?.find((e) => e.id === data.primary_email_address_id);
    const email = primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? null;
    emailCache.set(userId, { email, expiresAt: Date.now() + EMAIL_CACHE_TTL });
    return email;
  } catch {
    return null;
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
    const userId = payload.sub as string;
    if (!userId) return null;
    const email = await fetchClerkEmail(userId);
    return {
      authenticated: true,
      userId,
      name: email?.split("@")[0] ?? userId,
      email: email ?? "",
    };
  } catch {
    return null;
  }
}
