import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured, supabaseOrigin } from '@/lib/supabase/config';

/** Account pages refresh the Supabase session cookie on every request. */
const ACCOUNT = /^\/(app|auth|sign-in)(\/|$)/;

/** Fresh script nonces prevent arbitrary inline scripts from executing. */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  // The browser talks to Supabase directly for sign-in, uploads and signed file URLs.
  const supabase = supabaseOrigin();
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
    // Three, Radix and Motion position elements with inline style properties.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supabase ? ` ${supabase}` : ''}`, "font-src 'self'", "media-src 'self' blob:",
    `connect-src 'self' blob:${supabase ? ` ${supabase}` : ''}${development ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  let response = NextResponse.next({ request: { headers } });

  if (supabaseConfigured() && ACCOUNT.test(request.nextUrl.pathname)) {
    const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          // Pages rendered for this request must see the refreshed session too.
          headers.set('cookie', request.cookies.toString());
          response = NextResponse.next({ request: { headers } });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    });
    // Refreshes an expiring session; the page itself checks who is signed in.
    await client.auth.getUser();
  }

  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/projects/:path*', '/studio', '/developers', '/engine', '/tour', '/render/:path*', '/app/:path*', '/auth/:path*', '/sign-in', '/s/:path*', '/o/:path*'] };
