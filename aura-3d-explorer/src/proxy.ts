import { NextRequest, NextResponse } from 'next/server';

/** Fresh script nonces prevent arbitrary inline scripts from executing. */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const development = process.env.NODE_ENV === 'development';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${development ? " 'unsafe-eval'" : ''}`,
    // Three, Radix and Motion position elements with inline style properties.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "font-src 'self'", "media-src 'self' blob:",
    `connect-src 'self' blob:${development ? ' ws: wss:' : ''}`,
    "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/projects/:path*', '/studio', '/developers', '/engine', '/tour', '/render/:path*'] };
