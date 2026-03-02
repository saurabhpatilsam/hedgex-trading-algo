import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Check if auth is disabled
  const isAuthDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true';
  
  // If auth is disabled, allow all requests
  if (isAuthDisabled) {
    return NextResponse.next();
  }
  
  // Public routes that don't require authentication
  const publicRoutes = ['/sign-in', '/sign-up', '/login', '/'];
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  
  // Protected routes that require authentication
  const protectedRoutes = ['/dashboard'];
  const isProtectedRoute = protectedRoutes.some(route => pathname === route || pathname.startsWith(route + '/'));
  
  // Get token from cookie (if you're using cookies) or check for auth header
  // Note: Since you're using localStorage, we can't check server-side
  // This middleware serves as a backup - main auth check is client-side
  
  // If trying to access protected route, the client-side AuthGuard will handle it
  // This middleware just ensures proper routing structure
  
  // If user is on root path, redirect based on auth status
  if (pathname === '/') {
    // Client-side will handle the redirect in page.tsx
    return NextResponse.next();
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
