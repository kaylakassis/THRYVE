# Shipping Ivy to the iOS App Store

End-to-end checklist for taking a release from `main` to the App Store.
Everything past the "Generate the iOS project" step has to happen on a
Mac - Xcode is required.

## Prerequisites (one-time)

- **Apple Developer Program** membership ($99/yr) on the Apple ID you'll
  use for App Store Connect. The team ID goes into Xcode's signing tab.
- **Xcode 16+** with the iOS 17 SDK. Install Command Line Tools
  (`xcode-select --install`).
- **CocoaPods 1.15+** (`sudo gem install cocoapods`). Capacitor pulls
  native dependencies via Pods.
- No TypeScript needed. The Capacitor config is `capacitor.config.json`.
  It was `.ts` (Capacitor refuses to read that without `typescript`
  installed, and the current `typescript` on npm no longer exposes the
  API Capacitor's loader uses) and briefly `.js` (on modern Node,
  `require()` of an ESM file returns a namespace wrapper, so Capacitor
  saw no `appId`). JSON has neither problem. The explanatory comments
  that used to live in the config are in "capacitor.config.json notes"
  below - keep them in sync if you change a value.
- **RevenueCat account** (free up to $2.5K MRR). Create a project named
  "Ivy" with one iOS app entry.
- **A `.env` file ON THE MAC** carrying the two build-time values below.
  This trips people up: the iOS bundle is produced by `npm run build`
  *on the Mac* and copied into the `.ipa` by `cap sync`, so these are
  baked in from the Mac's environment. Setting them in Vercel does
  nothing for the app - Vercel only builds the web app.
  - `VITE_API_BASE_URL` (e.g. `https://joinivy.ai`) - the cross-origin
    API base. Without it every API call from the device resolves to
    `https://localhost/api/…` and fails, in a signed build you won't
    notice until TestFlight.
  - `VITE_REVENUECAT_PUBLIC_KEY_IOS` - the iOS public SDK key (it ships
    in the JS bundle; it is NOT a secret). Without it the paywall loads
    with nothing to buy, which is a 3.1.1 rejection.

  `npm run ios:sync` runs `scripts/check-ios-env.mjs` first. The two are
  treated differently, because they are not equally fatal:
  a missing/malformed `VITE_API_BASE_URL` **stops the build** (the app
  would be completely non-functional), while a missing
  `VITE_REVENUECAT_PUBLIC_KEY_IOS` only **warns and continues** - that
  build is perfectly good for trying the app through TestFlight, it just
  has an empty paywall and must not be submitted for review. Override the
  fatal one with `IVY_SKIP_IOS_ENV_CHECK=1` for a throwaway simulator
  bundle.

  Both stay EMPTY in Vercel: the web app calls `/api` relatively and
  never touches StoreKit.
- Server-side vars that DO belong in Vercel (runtime, read by the API
  routes): `REVENUECAT_WEBHOOK_SECRET` - a long random string used as
  the bearer token for `/api/billing/revenuecat-webhook` - plus the
  `APNS_*` set in the push section below.

## App Store Connect setup

0. **Paid Applications Agreement - DO THIS FIRST.** Developer Program
   membership alone does not let you sell anything. Go to App Store
   Connect -> Business -> Agreements, Tax, and Banking, accept the
   **Paid Applications** agreement, then add a bank account and complete
   the tax forms. Subscriptions cannot be approved (and the app cannot
   ship) until the status reads **Active**. Bank/tax verification is the
   single slowest step in this document - it can take several business
   days - so start it before anything else and let it process while you
   work through the rest.
1. **Bundle ID:** `ai.joinivy.app` - must match `capacitor.config.json`.
2. **App record:** create under "My Apps" → primary language English,
   bundle ID matching above.
3. **In-app purchases:**
   - Create a **Subscription Group** called `Ivy`.
   - Add two auto-renewable subscriptions in that group:
     - Product ID `ivyos_weekly`, price $8.99 / week (Weekly is a native
       StoreKit duration, so it matches the web weekly plan exactly)
     - Product ID `ivyos_yearly`, price $375 / year
   - Both must be in the same group so Apple offers proration when
     users upgrade/downgrade between them.
   - **Add a 14-day Introductory Offer → Free Trial to each product**
     (App Store Connect → the subscription → Introductory Offers → Create
     → Free, 2 weeks). This is what makes the StoreKit sheet read
     "Free for 14 days, then $X" and is the iOS half of the
     hard-paywall-after-onboarding funnel. Apple grants one intro per
     Apple ID; our RevenueCat webhook stamps `trial_started_at` on the
     trial `INITIAL_PURCHASE` and `converted_at` on the first paid
     renewal. Keep the 14 days in sync with `TRIAL_DAYS`
     (`src/lib/pricing.js` / `api/_lib/billing.js`).
   - Submit at least one introductory screenshot per product, plus
     localized display name + description.
4. **App Privacy:** declare data collection per the questions:
   - Contact Info (email, name): yes - linked to user, for app
     functionality.
   - User Content (messages, files): yes - linked to user.
   - Identifiers (user ID): yes - linked to user.
   - Health / Financial / Location data: no.
5. **Sign in with Apple: NOT required.** Guideline 4.8 only applies to
   apps that offer a *third-party or social* login (Google, Facebook,
   etc.) for the primary account. Ivy authenticates with email +
   password only - the Google OAuth in this codebase is Calendar sync,
   not sign-in - so plain email/password does not trigger the
   requirement. Do not add the capability; it costs setup time and an
   extra review surface for nothing.

## RevenueCat setup

1. **Project → API keys:** copy the **iOS app public SDK key** into
   `VITE_REVENUECAT_PUBLIC_KEY_IOS` in Vercel.
2. **Products:** add `ivyos_weekly` and `ivyos_yearly` exactly as in
   App Store Connect.
3. **Entitlement:** create a single entitlement called `pro`. Attach
   both products to it. (We don't check entitlement name server-side
   - RC tells us *which* product was bought and we route on that - but
   the SDK needs an entitlement to surface the offering.)
4. **Offering:** create the default offering, add a "Weekly" package
   (linked to `ivyos_weekly`) and an "Annual" package (linked to
   `ivyos_yearly`). Order them Annual first so it's the highlighted
   default in the paywall.
5. **App Store Connect integration:** RC walks you through generating
   the App-Specific Shared Secret + the in-app purchase key (`.p8`).
   Without these RC can't validate Apple receipts.
6. **Webhook:**
   - URL: `https://joinivy.ai/api/billing/revenuecat-webhook`
   - Authorization header: paste the same string as
     `REVENUECAT_WEBHOOK_SECRET` above (RC sends it verbatim, we
     constant-time compare).

## Build the iOS project

The `ios/` directory IS committed and already configured (see the next
section for exactly what). Do **not** run `npx cap add ios` - it already
exists. From the repo root, on the Mac:

```bash
cp .env.example .env        # then fill in the two VITE_* values
npm install
npm run ios:sync           # env preflight + build + copy into ios/ + pod install
npm run ios:open           # opens ios/App/App.xcworkspace in Xcode
```

`ios/App/App/public` (a copy of `dist/`) and `ios/App/Pods` are
`.gitignore`d by `ios/.gitignore` and regenerated by `cap sync`, which
is why CocoaPods must be installed on the Mac. The first `pod install`
takes a few minutes.

## Xcode configuration

Almost all of this is committed in `ios/` already. What is pre-configured:

- **Info.plist:** the four usage strings (`NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSMicrophoneUsageDescription`,
  `NSLocationWhenInUseUsageDescription`).
- **project.pbxproj:** `IPHONEOS_DEPLOYMENT_TARGET = 16.0`,
  `TARGETED_DEVICE_FAMILY = 1` (iPhone only - no iPad screenshot set
  required), `MARKETING_VERSION = 1.0.0`, `CURRENT_PROJECT_VERSION = 1`,
  `CODE_SIGN_ENTITLEMENTS = App/App.entitlements`.
- **App.entitlements:** `aps-environment` (Push Notifications). Xcode
  shows the Push capability as enabled because of this, and automatic
  signing includes it in the profile.
- **App icon:** a 1024x1024 opaque PNG rendered from
  `public/icon-maskable.svg` (the site's lime check mark). To change
  it, replace `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`
  with any 1024x1024 PNG that has no alpha channel.

What still has to happen in Xcode, with the `App` target selected:

1. **Signing & Capabilities → Team:** pick your Apple Developer team.
   Confirm **Push Notifications** is listed. Add **In-App Purchase** if
   it is not (it carries no entitlement, so it may not auto-appear).
   Do NOT add **Sign in with Apple** - see the App Store Connect
   section above; email/password-only apps don't need it. Skip
   **Associated Domains** for v1 (only needed for universal links).
2. **Build number:** bump `CURRENT_PROJECT_VERSION` (General → Build)
   on every upload after the first. Apple refuses a reused build number.

### capacitor.config.json notes

These used to be comments inside the config file; JSON has no comments.

- **Distribution is bundled.** `dist/` is copied into the `.ipa`; there
  is no `server.url`. Every functional change ships as a normal App
  Store update, and Apple will not reject for "thin web wrapper" the
  way it would if `server.url` pointed at the live web app.
- **Why no `server.hostname`:** Capacitor's URL-scheme handler
  intercepts every request under the configured hostname and serves
  from the bundle, so hosting the bundle at `joinivy.ai` would 404
  every `/api/*` call. The WebView stays on `https://localhost` and
  `src/lib/api.js` prepends `VITE_API_BASE_URL` on native. CORS is
  handled by `middleware.js`; auth is `Authorization: Bearer` via
  `src/lib/nativeAuth.js`.
- **`server.iosScheme: "https"`:** the WebView origin becomes
  `https://localhost` rather than `capacitor://localhost`. Some SDKs
  (Stripe.js, OAuth providers) reject the capacitor scheme as an
  invalid origin; `https://localhost` is treated as a normal secure
  origin, and it is the exact origin `middleware.js` allows.
- **`ios.contentInset: "never"`:** stops iOS bouncing the whole WebView
  when scrolling past the top, which looks broken on a sticky header.
- **`ios.backgroundColor`:** the flash between native splash dismiss
  and first WebView paint; matches the cream `--page`.
- **`plugins.PushNotifications.presentationOptions`:** show
  notifications even while foregrounded - an owner mid-invoice still
  wants to see "New booking" arrive.

## Push notifications (APNs)

Native pushes ride the SAME pipeline as web push - every existing
`notifyOwnerSafe` call fans out to iOS devices automatically once this
is configured. Code: `api/_lib/apns.js` (sender), `api/push/device.js`
(token registry), `src/lib/nativePush.js` (registration + tap routing).

1. **Developer portal → Certificates, IDs & Profiles → Keys → “+”.**
   Create a key with **Apple Push Notifications service (APNs)**
   enabled. Download the `.p8` file (one-time download - keep it), note
   the **Key ID** and your **Team ID** (Membership page).
2. **Xcode → target → Signing & Capabilities → “+ Capability” → Push
   Notifications.** (No Background Modes needed for alert pushes.)
3. **Vercel env (Production):**
   - `APNS_TEAM_ID`     - 10-char Team ID
   - `APNS_KEY_ID`      - 10-char Key ID
   - `APNS_PRIVATE_KEY` - the full contents of the `.p8` file
   - `APNS_BUNDLE_ID`   - `ai.joinivy.app` (only if you changed it)
   - `APNS_ENV`         - leave unset. TestFlight + App Store use
     production APNs; set `sandbox` ONLY when testing a build run
     directly from Xcode.
4. Redeploy, then install a TestFlight build, allow notifications, and
   send yourself a booking - the phone should light up.

Notes:
- Permission is requested in-app from the notifications prompt /
  Account → Notifications toggle (same surfaces as web push), never
  cold on launch - Apple rejects permission ambushes.
- Dead tokens self-clean: Apple's 410/Unregistered responses delete the
  row, same as web push 404/410 handling.

## Submission

```bash
npm run ios:sync           # build + cap sync; idempotent
# In Xcode:
# Product → Archive
# Organizer → Distribute App → App Store Connect → Upload
```

After upload, in App Store Connect:

1. Wait for the build to finish processing (~10 min).
2. Add the build to the version, fill in:
   - **What to Test** (TestFlight) or release notes.
   - Demo account credentials - REQUIRED. Create a fresh demo workspace
     with at least one client, one booking, one invoice, one document.
     Reviewers will sign in as this user.
   - **App Review notes:** explain that Ivy is a business-management
     SaaS, that the iOS app uses the same backend as the web app, and
     that the StoreKit subscription unlocks the same workspace the web
     app does (i.e. it's not a separate product).
3. Submit for review.

## Common rejection causes (and our defenses)

- **3.1.1 - IAP required for digital goods sold in-app.** Our paywall
  uses StoreKit on iOS (see `src/features/billing/Paywall.jsx`); the
  Stripe checkout path is never reachable when `isIos()` is true.
- **3.1.1 - Restore Purchases.** Visible button on the paywall in the
  iOS build (`Restore purchases` next to the trial / log-out row).
- **5.1.1(v) - Account deletion.** Already implemented at
  `/account` → Delete account (`api/account/delete.js`).
- **2.1 - Demo account.** Provide a working demo workspace in App
  Review Notes (see Submission step 2).
- **4.0 - Spam / minimum functionality.** Ivy is a full SaaS -
  bookings, invoices, messaging, documents - so this shouldn't fire.
  Make sure screenshots cover at least 4 distinct features.

## Post-release plumbing

- **Webhook health:** RevenueCat dashboard → Webhooks → Logs shows
  every delivery. Replay from there if our endpoint was down.
- **Subscription state in Postgres:** `workspaces.subscription_source =
  'apple'` for iOS-billed workspaces; `apple_product_id` /
  `apple_original_transaction_id` for forensics. Audit query:
  ```sql
  SELECT id, subscription_status, apple_product_id,
         subscription_period_end
    FROM workspaces
   WHERE subscription_source = 'apple'
   ORDER BY created_at DESC LIMIT 50;
  ```
- **Cancel UX on iOS:** users cancel in Apple's Subscriptions UI (deep
  link: `itms-apps://apps.apple.com/account/subscriptions`). The
  "Manage billing" button is hidden on iOS - replaced by the Restore
  Purchases / system Settings flow.
