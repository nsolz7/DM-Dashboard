import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getSelectedCampaignIdFromCookieHeader, routeNeedsCampaign } from "@/lib/campaignSelection";
import { hasAuthSession } from "@/lib/firebase/authSession";

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const cookieHeader = request.headers.get("cookie");
  const isAuthenticated = hasAuthSession(cookieHeader);
  const selectedCampaignId = getSelectedCampaignIdFromCookieHeader(cookieHeader);

  if (pathname === "/") {
    if (!isAuthenticated) {
      return redirectTo(request, "/login");
    }

    return redirectTo(request, selectedCampaignId ? "/dashboard" : "/campaigns");
  }

  if (pathname === "/login") {
    if (isAuthenticated) {
      return redirectTo(request, selectedCampaignId ? "/dashboard" : "/campaigns");
    }

    return NextResponse.next();
  }

  if (!isAuthenticated) {
    return redirectTo(request, "/login");
  }

  if (routeNeedsCampaign(pathname) && !selectedCampaignId) {
    return redirectTo(request, "/campaigns");
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
