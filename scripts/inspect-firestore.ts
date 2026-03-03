import { deleteApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { initializeAdminForInspection } from "../lib/admin/firebaseAdmin";

function printSection(title: string) {
  console.log(`\n=== ${title} ===`);
}

function collectKeys(rows: Array<Record<string, unknown>>): string[] {
  const keys = new Set<string>();

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      keys.add(key);
    });
  });

  return Array.from(keys).sort();
}

async function main() {
  let app: App | undefined;

  try {
    process.env.FIRESTORE_PREFER_REST = "true";
    const initialized = await initializeAdminForInspection();
    app = initialized.app;

    printSection("Firebase Admin Auth");
    console.log(`Mode: ${initialized.authMode}`);
    if (initialized.adcPath) {
      console.log(`ADC file: ${initialized.adcPath}`);
    }
    if (initialized.serviceAccountPath) {
      console.log(`Service account: ${initialized.serviceAccountPath}`);
    }

    const db = getFirestore(app);

    printSection("Top-Level Collections");
    try {
      const collections = await db.listCollections();
      console.log(collections.map((collection) => collection.id).join(", ") || "(none found)");
    } catch (collectionError) {
      const message = collectionError instanceof Error ? collectionError.message : "Unable to list collections.";
      console.log(`Best effort only: ${message}`);
    }

    const campaignSnapshot = await db.collection("campaigns").limit(5).get();

    printSection("Campaign Samples");
    if (campaignSnapshot.empty) {
      console.log("No documents found in campaigns.");
      return;
    }

    const campaignRows = campaignSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data()
    }));

    campaignRows.forEach((row, index) => {
      console.log(`Campaign ${index + 1}:`);
      console.log(JSON.stringify(row, null, 2));
    });

    console.log(`Discovered Campaign keys: ${collectKeys(campaignRows).join(", ")}`);

    const firstCampaign = campaignSnapshot.docs[0];

    printSection("Android Schema Confirmation");
    console.log("Players are stored at campaigns/{campaignId}/players/{playerId}.");
    console.log("Sheet state is stored at campaigns/{campaignId}/sheets/{playerId}.");
    console.log(`Inspecting campaign: ${firstCampaign.id}`);

    const playerSnapshot = await firstCampaign.ref.collection("players").limit(10).get();
    const playerRows = playerSnapshot.docs.map((document) => ({
      id: document.id,
      ...document.data()
    }));

    printSection("Player Samples");
    if (!playerRows.length) {
      console.log("No player docs found under campaigns/{campaignId}/players.");
    } else {
      playerRows.forEach((row, index) => {
        console.log(`Player ${index + 1}:`);
        console.log(JSON.stringify(row, null, 2));
      });
      console.log(`Discovered Player keys: ${collectKeys(playerRows).join(", ")}`);
    }

    const playerIds = playerRows.map((row) => String(row.id)).slice(0, 10);
    const sheetRows = await Promise.all(
      playerIds.map(async (playerId) => {
        const sheetDoc = await firstCampaign.ref.collection("sheets").doc(playerId).get();
        return sheetDoc.exists ? { id: sheetDoc.id, ...sheetDoc.data() } : null;
      })
    );
    const hydratedSheets = sheetRows.filter(
      (row): row is { id: string } & Record<string, unknown> => Boolean(row)
    );

    printSection("Sheet Samples");
    if (!hydratedSheets.length) {
      console.log("No matching sheet docs were found for the sampled players.");
    } else {
      hydratedSheets.forEach((row, index) => {
        console.log(`Sheet ${index + 1}:`);
        console.log(JSON.stringify(row, null, 2));
      });
      console.log(`Discovered Sheet keys: ${collectKeys(hydratedSheets).join(", ")}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Firestore inspection failed.");
    console.error(message);
    console.error("Auth order:");
    console.error("1. Application Default Credentials: run `gcloud auth application-default login`.");
    console.error("2. Fallback: place a downloaded service account JSON at ./secrets/serviceAccountKey.json.");
    process.exitCode = 1;
  } finally {
    if (app) {
      await deleteApp(app);
    }
  }
}

void main();
