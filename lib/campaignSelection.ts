const CAMPAIGN_STORAGE_KEY = "septagon:selected-campaign";
export const CAMPAIGN_COOKIE_NAME = "septagon_campaign_id";
export const CAMPAIGN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

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

  const rawValue = cookieEntry.slice(name.length + 1);
  return decodeURIComponent(rawValue);
}

export function normalizeCampaignId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function getSelectedCampaignIdFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  return normalizeCampaignId(parseCookieValue(cookieHeader, CAMPAIGN_COOKIE_NAME));
}

export function getSelectedCampaignIdFromBrowser(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const fromCookie = getSelectedCampaignIdFromCookieHeader(document.cookie);
  if (fromCookie) {
    return fromCookie;
  }

  return normalizeCampaignId(window.localStorage.getItem(CAMPAIGN_STORAGE_KEY));
}

export function setSelectedCampaignIdInBrowser(campaignId: string): string {
  if (typeof window === "undefined") {
    return campaignId;
  }

  const normalized = normalizeCampaignId(campaignId);

  if (!normalized) {
    clearSelectedCampaignIdInBrowser();
    return "";
  }

  document.cookie = `${CAMPAIGN_COOKIE_NAME}=${encodeURIComponent(normalized)}; path=/; max-age=${CAMPAIGN_COOKIE_MAX_AGE}; SameSite=Lax`;
  window.localStorage.setItem(CAMPAIGN_STORAGE_KEY, normalized);
  return normalized;
}

export function clearSelectedCampaignIdInBrowser(): void {
  if (typeof window === "undefined") {
    return;
  }

  document.cookie = `${CAMPAIGN_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  window.localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
}

export function routeNeedsCampaign(pathname: string): boolean {
  const requiredPrefixes = ["/dashboard", "/party", "/players", "/scenario", "/compendium"];
  return requiredPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
