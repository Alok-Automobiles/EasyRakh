import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  CACHE_WRITE_BARRIER_COOKIE,
  CACHE_WRITE_BARRIER_SECONDS,
} from '@/lib/cache-consistency';

export function proxy(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
  const { pathname } = request.nextUrl;
  const shouldShowLanding = request.nextUrl.searchParams.get('view') === 'landing';

  if (pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    const method = request.method.toUpperCase();
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (isWrite) {
      response.cookies.set(CACHE_WRITE_BARRIER_COOKIE, '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api',
        maxAge: CACHE_WRITE_BARRIER_SECONDS,
      });
    }

    return response;
  }

  if (pathname === '/forgot-password' || pathname.startsWith('/forgot-password/')) {
    return NextResponse.next();
  }

  const publicRoutes = ['/', '/about', '/privacy', '/terms', '/login', '/register', '/forgot-password'];
  const isPublicRoute = publicRoutes.some((route) => {
    if (route === '/') return pathname === '/';
    return pathname === route || pathname.startsWith(`${route}/`);
  });

  if (!token && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && pathname === '/' && !shouldShowLanding) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  if (token && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*',
    /*
     * Match all request paths except for the ones starting with:
     * - api (handled by the explicit API matcher above)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - manifest.json (PWA manifest)
     * - sw.js (service worker)
     * - public folder assets (images)
     * - forgot-password flow (handled client-side)
     */
    '/((?!api|_next/static|_next/image|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$|manifest\\.json$|sw\\.js$|forgot-password|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
