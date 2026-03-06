# septagon-dm-dashboard-web

Local-first DM dashboard for managing Dungeons & Dragons campaigns with Next.js, TypeScript, Tailwind CSS, Firebase, and 8-bit styled UI primitives.

## What This Repo Includes

- Firebase Auth email/password login for the DM only
- Protected `/campaigns` selector plus campaign-scoped dashboard routes
- A shared campaign selection helper that persists the selected `campaignId` in a cookie and localStorage
- Firestore reads aligned to the Android app schema:
  - `campaigns/{campaignId}`
  - `campaigns/{campaignId}/players/{playerId}`
  - `campaigns/{campaignId}/sheets/{playerId}`
  - `campaigns/{campaignId}/party/summary`
  - `campaigns/{campaignId}/scenario/current`
- Compendium search/results/detail pages backed by the local DnData API
- Scenario page barter tools for DM-controlled currency awards, charges, transfers, and a reversible ledger
- Campaign-scoped transactions / notifications with a DM inbox, header dropdown, and DM-only toasts
- An optional read-only Firestore inspection script

## Step 0 Findings

### Septagon Android repo

This repo clones the Android app into `_external/Septagon` for inspection only. `_external/` is gitignored and should never be committed.

Confirmed schema from the Android repo:

- Players are stored under `campaigns/{campaignId}/players/{playerId}`
- Dynamic stats are stored under `campaigns/{campaignId}/sheets/{playerId}`
- Party quick view reads `campaigns/{campaignId}/party/summary`
- Scenario reads `campaigns/{campaignId}/scenario/current`
- Player currency currently lives in `campaigns/{campaignId}/sheets/{playerId}` under `resources.currency.{cp,sp,ep,gp,pp}`

### DnData local API

Confirmed local run command from `/Users/nicholas_soltis/Desktop/DnData`:

```bash
python3 local_api/server.py --host 0.0.0.0 --port 8080
```

Useful endpoints already centralized in [`lib/compendium/api.ts`](/Users/nicholas_soltis/Desktop/septagon-dm-dashboard-web/lib/compendium/api.ts):

- `GET /api/search`
- `GET /api/search/suggest`
- `GET /api/{dataset}`
- `GET /api/{dataset}/{id}`

If DnData changes, update the endpoint strings in that single module.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.local.example`.

3. In Firebase Console, create a Web App inside the existing `septagon-a676f` project:
   - Open Firebase Console
   - Select `septagon-a676f`
   - Go to Project settings
   - Under "Your apps", click the Web (`</>`) icon
   - Register a new web app (any name is fine, for example `septagon-dm-dashboard-web`)
   - Copy the resulting web config values into `.env.local`

Required web config values:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

The provided example already pins the known project values for:

- `projectId`: `septagon-a676f`
- `storageBucket`: `septagon-a676f.firebasestorage.app`
- `messagingSenderId`: `437050273227`

4. Create the DM auth user manually in Firebase Console:
   - Firebase Console
   - Authentication
   - Users
   - Add user
   - Use email/password

5. Start the DnData API locally:

```bash
cd /Users/nicholas_soltis/Desktop/DnData
python3 local_api/server.py --host 0.0.0.0 --port 8080
```

6. Start the web app:

```bash
npm run dev:lan
```

Then open the dashboard on this machine at [http://localhost:3000](http://localhost:3000), or from another device on the same network at `http://YOUR_LAN_IP:3000`.

For LAN testing, set `NEXT_PUBLIC_DNDATA_BASE_URL` in `.env.local` to `http://YOUR_LAN_IP:8080` so browser clients on phones/tablets hit your desktop API instead of their own loopback interface.

## Optional Firestore Inspection

The repo includes a safe read-only script that samples live Firestore documents and prints discovered keys.

Run:

```bash
npm run inspect:firestore
```

Auth order:

1. Application Default Credentials (preferred)
   - Run `gcloud auth application-default login`
2. Fallback service account file
   - Download a private key from Firebase Console > Project settings > Service Accounts
   - Save it as `./secrets/serviceAccountKey.json`

The script never writes to Firestore.

## Barter / Currency Ledger

The Scenario page now includes a DM-facing barter workflow:

- award coins to the party, one player, or a multi-select
- charge coins from the party, one player, or a multi-select
- transfer coins from one player to another
- preview per-player deltas before confirming
- store every change in `campaigns/{campaignId}/currency_transactions/{txId}`
- reverse prior transactions without deleting history

Currency writes are applied server-side through:

- `POST /api/barter/apply`
- `POST /api/barter/reverse`
- `GET /api/barter/list`

The server uses the Firebase Admin SDK already configured for this repo, so no new client-side Firestore write rules are required for barter. Existing read access still needs to allow the current app to read:

- `campaigns/{campaignId}/players`
- `campaigns/{campaignId}/sheets`
- `campaigns/{campaignId}/scenario`

Ledger document shape:

- `createdAt`
- `createdByUid`
- `type`
- `reason`
- `targets[]`
- `metadata.autoMakeChange`
- `metadata.allowNegative`
- `metadata.splitMode`
- `metadata.reversalOfTxId`
- `metadata.reversedByTxId`

Currency math is covered by:

```bash
npm run test:currency
```

## Character Advancement / Level Up

The player sheet now includes a DM-facing `Character Advancement` panel that:

- runs a preflight schema mapping against the live `players/{playerId}` + `sheets/{playerId}` docs
- disables `Level Up` until required fields are mapped
- increments level, class level, HP, and hit dice safely through a server-side Firestore transaction
- appends a manual-review prompt into `pendingChoicePrompts` so class features / ASI work can be finished explicitly
- records every level-up in `campaigns/{campaignId}/players/{playerId}/level_history/{historyId}`

The leveling write path is server-side only:

- `GET /api/players/{playerId}/level-up`
- `POST /api/players/{playerId}/level-up`

The player + sheet field-path updates are assembled only in:

- [`src/lib/leveling/playerSchemaAdapter.ts`](/Users/nicholas_soltis/Desktop/septagon-dm-dashboard-web/src/lib/leveling/playerSchemaAdapter.ts)

That adapter currently prefers the Septagon schema already in your live data:

- player level: `level`
- class levels: `classLevels`
- class id: `classId`
- abilities: `stats.{str,dex,con,int,wis,cha}`
- HP: `vitals.hpCurrent`, `vitals.hpMax`
- hit dice: `resources.hitDice`
- manual selections / follow-up prompts: `pendingChoicePrompts`

No extra client-side Firestore write rules are required for leveling in local dev because the web UI calls the Next.js server route, and the server uses the Admin SDK. The only requirement is that `./secrets/serviceAccountKey.json` (or ADC) is available so the local server can write.

Leveling math tests are covered by:

```bash
npm run test:leveling
```

## Transactions / Notifications

The DM dashboard now reads campaign-scoped notifications from:

- `campaigns/{campaignId}/transactions/{txId}`

Implemented on the web side:

- `/notifications` inbox route
- header bell dropdown with unread badge
- DM-only bottom-right toast popups for new unread messages
- DM-side read / respond / close actions through `PATCH /api/transactions/{txId}`
- DM-side test sender in `/notifications` (Send Info / Send Prompt)
- automatic transaction creation from:
  - barter apply / reverse
  - level-up apply
  - compendium assign (item/spell/trait)

The client query shape is:

- `where("recipientKeys", "array-contains", "dm_<uid>")`
- `orderBy("createdAt", "desc")`
- `limit(50)` for the inbox and `limit(10)` for the header dropdown

Because of that query, Firestore will typically require a composite index on:

- collection: `campaigns/{campaignId}/transactions`
- fields: `recipientKeys` (array) + `createdAt` (descending)

The dashboard now includes a fallback query path if that index is missing, so notifications still load while you create the index.

An index template is included in this repo at:

- [`firestore.indexes.json`](/Users/nicholas_soltis/Desktop/septagon-dm-dashboard-web/firestore.indexes.json)

Minimal Firestore rules expectations for this feature:

- authenticated DMs can read/write transactions where `recipientKeys` contains `dm_<uid>`
- players should eventually be limited to transactions where `recipientKeys` contains either `player_<playerId>` or `party_<campaignId>`, and the app’s player auth mapping confirms access
- on this web app, writes are DM-only and flow through the local Next.js API route, which uses the Admin SDK

Transaction recipient key formats are fixed:

- `dm_<dmUid>`
- `player_<playerId>`
- `party_<campaignId>`

## Loot Drops

DM-side loot delivery is now available on:

- `/scenario` (Loot Builder panel)
- `/loot` (recent loot drops and claim status viewer)

Firestore collections used:

- `campaigns/{campaignId}/loot_drops/{lootId}`
- `campaigns/{campaignId}/custom_items/{customItemId}`
- `campaigns/{campaignId}/transactions/{txId}` (category `loot`)

Loot send flow creates:

1. a `loot_drops` document with entries, optional coins, delivery mode, and claimState scaffold
2. a `transactions` document with `kind: "prompt"` and `category: "loot"` referencing `lootId`

Current DM APIs:

- `POST /api/loot/send`
- `GET /api/loot/list`
- `GET /api/loot/[lootId]?campaignId=...`
- `GET /api/custom-items?campaignId=...`
- `POST /api/custom-items`

Index notes:

- the existing `transactions` composite index (`recipientKeys` array + `createdAt desc`) is still required for notification queries
- `loot_drops` and `custom_items` currently use simple `orderBy(createdAt desc)` queries (no extra composite index needed for current DM flows)

Minimal security-rules expectations:

- authenticated DM can create/read campaign `loot_drops` and `custom_items`
- authenticated DM can create loot-related campaign `transactions`
- player clients should only read/claim `loot_drops` targeted to their `player_<id>` or `party_<campaignId>` recipient keys
- claim updates should remain transaction-safe and scoped to each targeted drop doc

## Equip / Equipped System

DM-side equipment management is now available on:

- `/players/{playerId}` (slot grid + inventory equip controls)
- `/settings` (campaign equip rules)

Campaign settings path:

- `campaigns/{campaignId}/settings/equip`

If this settings doc is missing, the server seeds it on first read with defaults:

- slot counts for head/body/cloak/hands/feet/bracers/neck/mainHand/offHand and `rings: 2`
- `enforceAttunementLimit: true`
- `attunementLimit: 3`
- `enforceWeight: false`

Player equipment path:

- `campaigns/{campaignId}/players/{playerId}` -> `equipment`

Server endpoints (DM auth required):

- `GET /api/equipment/settings?campaignId=...`
- `POST /api/equipment/settings`
- `POST /api/equipment/equip`
- `POST /api/equipment/unequip`
- `POST /api/equipment/swap`

Equipment writes run inside Firestore transactions and also update legacy sheet compatibility fields at:

- `campaigns/{campaignId}/sheets/{playerId}` -> `equipment.equippedWeaponIds`
- `campaigns/{campaignId}/sheets/{playerId}` -> `equipment.equippedArmorId`

DM-driven equip changes emit campaign transactions with:

- `category: "equip"`
- `kind: "info"`
- recipient key includes `player_<playerId>` (and DM key when available)

Minimal security-rules expectations:

- authenticated DM can read/write `campaigns/{campaignId}/settings/equip`
- authenticated DM can read/write targeted `campaigns/{campaignId}/players/{playerId}` and `campaigns/{campaignId}/sheets/{playerId}`
- authenticated DM can create equip notifications in `campaigns/{campaignId}/transactions/{txId}`

## Project Notes

- Footer GitHub links are placeholder URLs in [`components/shell/AppFooter.tsx`](/Users/nicholas_soltis/Desktop/septagon-dm-dashboard-web/components/shell/AppFooter.tsx). Replace them with your final repo URLs.
- `8bitcn/ui` is a shadcn-style registry, not a single npm runtime package. This scaffold uses local 8-bit themed UI primitives so you can run immediately, and you can swap them with generated 8bitcn components later if you want.
- This build is intentionally read-only for now. It focuses on routing, auth, campaign scoping, and data display.
