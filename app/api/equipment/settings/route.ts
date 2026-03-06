import { NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";

import { initializeAdminForServer } from "@/lib/admin/firebaseAdmin";
import {
  getOrSeedCampaignEquipSettings,
  mapEquipmentError,
  saveCampaignEquipSettings
} from "@/lib/equipment/server";
import { hasAuthSession } from "@/lib/firebase/authSession";
import { toStringValue } from "@/lib/utils";

interface SaveSettingsRequestBody {
  campaignId: string;
  settings: unknown;
}

function unauthorized() {
  return NextResponse.json({ error: "A DM login session is required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const campaignId = toStringValue(url.searchParams.get("campaignId"));

  if (!campaignId) {
    return badRequest("campaignId is required.");
  }

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const settings = await getOrSeedCampaignEquipSettings(db, campaignId);
    return NextResponse.json({ settings });
  } catch (error) {
    const mapped = mapEquipmentError(error);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
  }
}

export async function POST(request: Request) {
  if (!hasAuthSession(request.headers.get("cookie"))) {
    return unauthorized();
  }

  let body: SaveSettingsRequestBody;

  try {
    body = (await request.json()) as SaveSettingsRequestBody;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  const campaignId = toStringValue(body.campaignId);

  if (!campaignId) {
    return badRequest("campaignId is required.");
  }

  try {
    const initialized = await initializeAdminForServer();
    const db = getFirestore(initialized.app);
    const settings = await saveCampaignEquipSettings(db, campaignId, body.settings);
    return NextResponse.json({ settings });
  } catch (error) {
    const mapped = mapEquipmentError(error);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status });
  }
}
