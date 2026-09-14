import { NextResponse } from "next/server";
import { auth } from "@/auth";

const apiRoutes = ["/api/account", "/api/admin", "/api/assistant", "/api/coach", "/api/health", "/api/programs", "/api/workout"];
const tokenProtectedApiRoutes = ["/api/health/connect/sync", "/api/health/samsung/sync"];

function isApiRoute(pathname: string) {
  return apiRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function isTokenProtectedApiRoute(pathname: string) {
  return tokenProtectedApiRoutes.includes(pathname);
}

function getLoginUrl(requestUrl: string, pathname: string, search: string) {
  const url = new URL("/login", requestUrl);
  url.searchParams.set("callbackUrl", `${pathname}${search}`);
  return url;
}

export default auth((request) => {
  const isConnected = Boolean(request.auth?.user?.email);
  const { pathname, search } = request.nextUrl;

  // The exercise template pilot is intentionally reviewable on Vercel previews
  // without a Google OAuth callback. It is never public on production.
  const isPublicPreviewPilot =
    process.env.VERCEL_ENV === "preview" &&
    pathname === "/exercises/lat-pulldown-machine";

  if (isPublicPreviewPilot) {
    return NextResponse.next();
  }

  if (isTokenProtectedApiRoute(pathname)) {
    return NextResponse.next();
  }

  if (isConnected) {
    return NextResponse.next();
  }

  if (isApiRoute(pathname)) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  return NextResponse.redirect(getLoginUrl(request.url, pathname, search));
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/exercises/:path*",
    "/history/:path*",
    "/programs/:path*",
    "/progress/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/workout/:path*",
    "/api/account/:path*",
    "/api/admin/:path*",
    "/api/assistant/:path*",
    "/api/coach/:path*",
    "/api/health/:path*",
    "/api/programs/:path*",
    "/api/workout/:path*",
  ],
};
