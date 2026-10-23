import { NextResponse } from "next/server";
import { isSameOrigin, requestOrigin } from "@/lib/apiGuard";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request, { requireOrigin: true })) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const supabase = await supabaseServer();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/", requestOrigin(request)), { status: 303 });
}
