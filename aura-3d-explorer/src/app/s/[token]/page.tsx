import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShare, shareCookie } from "@/lib/share";
import ShareView from "@/components/share/ShareView";
import { unlockShare } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const password = (await cookies()).get(shareCookie(token))?.value ?? null;
  const result = await resolveShare(token, password);
  if (result.kind === "unconfigured" || result.kind === "missing") {
    if (result.kind === "missing") notFound();
    return <main id="main" className="shell py-24"><h1 className="font-serif text-display-md text-ink">This link is not available.</h1></main>;
  }
  if (result.kind === "password") {
    return (
      <main id="main" className="shell grid min-h-[70vh] place-items-center py-16">
        <form action={unlockShare.bind(null, token)} className="panel w-full max-w-sm space-y-4 p-6">
          <h1 className="font-serif text-3xl text-ink">This presentation is password protected</h1>
          <label className="block"><span className="caption">Password</span><input type="password" name="password" required autoComplete="current-password" className="field mt-1" autoFocus /></label>
          {result.wrong && <p role="alert" className="text-sm text-negative">That password is not right. Try again.</p>}
          <button type="submit" className="btn-primary w-full">Open presentation</button>
        </form>
      </main>
    );
  }
  return (
    <>
      <ShareView share={result.share} exportTo={result.share.financials ? { endpoint: "/api/share/export", body: { token } } : null} />
      <footer className="border-t border-plaster py-8">
        <div className="shell flex flex-wrap items-center justify-between gap-3 text-[13px] text-ash">
          <span>© {result.share.branding.name}. Map data © OpenStreetMap contributors · Overture Maps.</span>
          <Link href="/" className="underline underline-offset-4">Powered by AURA</Link>
        </div>
      </footer>
    </>
  );
}
