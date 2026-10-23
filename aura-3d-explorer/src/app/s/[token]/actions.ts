"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { shareCookie, validShareToken } from "@/lib/share";

/** Remember the password for this one link (httpOnly cookie named per link, 12 hours), then reload the page. */
export async function unlockShare(token: string, form: FormData) {
  if (!validShareToken(token)) redirect("/");
  const password = String(form.get("password") ?? "").slice(0, 72);
  (await cookies()).set(shareCookie(token), password, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
  redirect(`/s/${token}`);
}
