import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SignInForm from "@/components/account/SignInForm";
import { supabaseConfigured } from "@/lib/supabase/config";
import { currentMember } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

interface Props {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function SignInPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/app") ? next : "/app";
  if (await currentMember()) redirect(safeNext);
  return (
    <div className="shell grid min-h-[70vh] place-items-center py-16">
      <div className="w-full max-w-md">
        <h1 className="font-serif text-display-md text-ink">Sign in to AURA</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ash">
          Enter your work email and we will send you a sign-in link. No password needed.
        </p>
        {supabaseConfigured() ? (
          <SignInForm next={safeNext} initialError={error === "link" ? "That sign-in link has expired or was already used. Request a new one." : ""} />
        ) : (
          <div className="panel mt-8 p-6" role="status">
            <p className="text-sm font-medium text-ink">Accounts are not connected on this deployment yet.</p>
            <p className="caption mt-2">
              The public portfolio works without an account. To enable sign-in, projects and share links, connect Supabase as described in docs/SUPABASE-SETUP.md.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
