const AUTH_STORAGE_KEY = "septagon:auth-session";
const AUTH_UID_STORAGE_KEY = "septagon:auth-uid";
export const AUTH_COOKIE_NAME = "septagon_dm_auth";
export const AUTH_UID_COOKIE_NAME = "septagon_dm_uid";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function parseCookieValue(cookieSource: string | null | undefined, name: string): string | null {
  if (!cookieSource) {
    return null;
  }

  const cookieEntry = cookieSource
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookieEntry) {
    return null;
  }

  return decodeURIComponent(cookieEntry.slice(name.length + 1));
}

export function hasAuthSession(cookieHeader: string | null | undefined): boolean {
  return parseCookieValue(cookieHeader, AUTH_COOKIE_NAME) === "1";
}

export function getAuthSessionUid(cookieHeader: string | null | undefined): string | null {
  return parseCookieValue(cookieHeader, AUTH_UID_COOKIE_NAME);
}

export function markAuthSessionInBrowser(uid?: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `${AUTH_COOKIE_NAME}=1; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
  window.localStorage.setItem(AUTH_STORAGE_KEY, "1");

  if (uid) {
    document.cookie = `${AUTH_UID_COOKIE_NAME}=${encodeURIComponent(uid)}; path=/; max-age=${AUTH_COOKIE_MAX_AGE}; SameSite=Lax`;
    window.localStorage.setItem(AUTH_UID_STORAGE_KEY, uid);
  } else {
    document.cookie = `${AUTH_UID_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
    window.localStorage.removeItem(AUTH_UID_STORAGE_KEY);
  }
}

export function clearAuthSessionInBrowser(): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  document.cookie = `${AUTH_UID_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_UID_STORAGE_KEY);
}
