"use server";
/**
 * Share links. The token is 32 random bytes (base64url, 43 characters) shown
 * to the owner once; only its SHA-256 is stored. Passwords are bcrypt-hashed in
 * the database (pgcrypto). Revoking takes effect on the next request because
 * every view re-resolves the token (aura.resolve_share).
 */
import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { currentMember } from "@/lib/supabase/server";

export interface ShareLinkResult {
  error?: string;
  /** The full URL, returned exactly once. */
  url?: string;
}

export async function createShareLink(projectId: string, options: { label: string; expiresInDays: number | null; password: string; shareFinancials: boolean }, origin: string): Promise<ShareLinkResult> {
  const member = await currentMember();
  if (!member?.org) return { error: "Sign in again to create a share link." };
  const label = options.label.trim().slice(0, 80) || null;
  const days = options.expiresInDays;
  if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365)) return { error: "Expiry must be between 1 and 365 days." };
  const password = options.password.trim();
  if (password && (password.length < 6 || password.length > 72)) return { error: "Passwords need 6 to 72 characters." };
  let passwordHash: string | null = null;
  if (password) {
    const { data, error } = await member.supabase.rpc("hash_share_password", { password });
    if (error || typeof data !== "string") return { error: "The password could not be set. Try again." };
    passwordHash = data;
  }
  const token = randomBytes(32).toString("base64url");
  const { error } = await member.supabase.from("share_links").insert({
    project_id: projectId,
    org_id: member.org.id,
    token_hash: createHash("sha256").update(token).digest("hex"),
    label,
    expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    password_hash: passwordHash,
    share_financials: options.shareFinancials,
    created_by: member.user.id,
  });
  if (error) return { error: "The link could not be created. Check that this project belongs to your company." };
  revalidatePath(`/app/projects/${projectId}`);
  const base = /^https?:\/\/[^/]+$/.test(origin) ? origin : "";
  return { url: `${base}/s/${token}` };
}

export async function revokeShareLink(projectId: string, linkId: string): Promise<{ error?: string }> {
  const member = await currentMember();
  if (!member?.org) return { error: "Sign in again to revoke this link." };
  const { data, error } = await member.supabase.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("project_id", projectId).select("id");
  if (error || !data?.length) return { error: "The link could not be revoked." };
  revalidatePath(`/app/projects/${projectId}`);
  return {};
}

export async function listShareLinks(projectId: string) {
  const member = await currentMember();
  if (!member?.org) return [];
  const { data } = await member.supabase.from("share_links").select("id, label, expires_at, share_financials, revoked_at, created_at, password_hash").eq("project_id", projectId).order("created_at", { ascending: false });
  return (data ?? []).map((l) => ({ id: l.id as string, label: l.label as string | null, expiresAt: l.expires_at as string | null, shareFinancials: l.share_financials as boolean, revokedAt: l.revoked_at as string | null, createdAt: l.created_at as string, hasPassword: !!l.password_hash }));
}
export type ShareLinkSummary = Awaited<ReturnType<typeof listShareLinks>>[number];
