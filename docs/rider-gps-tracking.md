# Sobers live delivery tracking

Implementation is saved for review. Nothing has been deployed, and migration 20 has not been applied to production or the hosted test database. Apply the migration to the isolated test project before serving this build there. The new checkout uses `create_public_order_v3`, so do not publish this frontend before its database migration.

## Architecture and authorization

The existing kitchen workflow (`new → confirmed → preparing → ready → completed`) and secure tracking reference are preserved. A separate delivery session moves through `assigned → out_for_delivery → stopped/ended`. Starting delivery requires the kitchen order to be `ready`. Customer tracking displays **Out for Delivery** and the existing timeline while the session is active. Delivered writes the existing `completed` status; cancellation and completion clear rider coordinates transactionally.

Migration: `supabase/20-sobers-rider-tracking.sql`, run once after migrations 13–18. Migration 19 remains a separate owner-MFA rollout step; do not apply it before owner enrollment has been verified.

New table: `public.sobers_delivery_sessions`, one latest position per order, with rider assignment, state, random notification topic, latitude, longitude, accuracy in metres, heading in degrees, speed in metres/second and server update time. No location history table is created. Stop, reassignment, cancellation and completion erase position fields. Customer delivery pins are stored on the existing order; existing branch coordinates are reused.

New RLS policy: **`sobers_delivery_assigned_read`**, SELECT for authenticated users. It permits the currently assigned, active Sobers rider or an administrator with the existing `orders.read` permission. No INSERT/UPDATE/DELETE policies or grants are given to clients. Anonymous users have no delivery-table access. Existing order RLS and admin MFA functions are unchanged.

Riders use a dedicated Supabase Auth account with an active `business_memberships` entry and the new `sobers_rider` role. That role receives **no general order permissions**. All rider RPCs check the actual authenticated user, active profile, active Sobers business membership, assignment and delivery/order state. A rider cannot assign themselves or access another rider’s order. Assignment requires the existing admin `orders.update` permission, including MFA when migration 19 is active. Do not give riders owner/admin credentials.

Customer reads use the unchanged audited UUID-and-matching-phone lookup, wrapped by the updated `track_public_order`. Its existing lookup throttle remains. Knowing an order ID, display number or Realtime topic does not grant GPS access. Direct table reads remain denied to customers. `sobers_track_order_base` is not executable by frontend roles.

Realtime uses `realtime.send` to broadcast **only `{}`** on a random delivery-session topic. Coordinates, order IDs, phone numbers and customer information are never in these messages. The browser treats each notification as an untrusted hint and re-fetches through the secure RPC. No `realtime.messages` RLS policies are changed, and the delivery table is not added to a Postgres Changes publication. A forged broadcast cannot place a rider marker. Polling continues as a fallback and reconnecting triggers a fresh authorized read. The rider subscribes to their active session so cancellation/reassignment stops the watcher after verification; server writes are rejected immediately once the order ends, even if the phone is disconnected.

## GPS cadence and failure handling

`watchPosition` requests high accuracy, a maximum cached age of five seconds and a 15-second GPS timeout. At most one update per delivery is accepted every **15 seconds**, enforced in PostgreSQL as well as the client. A movement of 20 metres can trigger a due update; the timer also sends a fresh latest fix. Only one request is in flight and only the latest fix is retained. Accuracy worse than 200 metres and fixes older than 20 seconds are not transmitted. Optional invalid heading/speed values are omitted.

The map shows “Waiting for a new rider location” once updates are older than 45 seconds and fades the stale rider marker. It never invents road routing or ETA; any distance is explicitly straight-line. Network recovery sends a fresh latest fix instead of replaying a trail. Rider RPCs and customer tracking reads have eight-second network timeouts. Superseded customer responses cannot overwrite a newer selected order, and pin adjustments cannot create a second uncertain checkout reference. Denied permission, unavailable GPS and poor accuracy produce visible messages. Refresh does not silently resume GPS: the rider taps Start Delivery again. Riders must keep Rider Mode open; background or closed-app tracking is not promised.

The written address remains required. Customers can optionally choose a map pin, request their current position, or explicitly reuse the location already saved in their customer preferences. Saved positions are not silently reused. Pickup ignores map pins. Leaflet 1.9.4 and its licence/assets are vendored locally. OpenStreetMap tiles show attribution, use normal browser caching, and receive only an origin referrer; the page's general `no-referrer` policy stays intact. No offline tile prefetching is added. OSM tiles are a best-effort service, not a guaranteed SLA: [tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Supabase setup

1. In the isolated project `jempabrwjfvwwpjoyzgu`, run migration 20 once. Keep production unchanged during testing.
2. Confirm Realtime Broadcast is available. The isolated project's two-client broadcast test passed. This design uses public channels carrying empty notifications; **do not relax an existing private-only production policy** to accommodate it. If production forbids public channels, keep that setting and arrange a private notification transport before launch; authorized polling still works meanwhile.
3. No new table-publication switch is needed. Do not enable anonymous SELECT on the delivery table.
4. Create/invite dedicated rider Auth accounts using Supabase's normal flow. The rider chooses their credentials. Then an authorized database administrator can add the membership below, using the rider's verified account ID. Do not change an existing owner's role.

```sql
insert into public.business_memberships (business_id, profile_id, role_id, status)
select b.id, p.id, r.id, 'active'
from public.businesses b
join public.profiles p on p.id = '<verified rider auth UUID>'::uuid
join public.roles r on r.name = 'sobers_rider'
where b.slug = 'sobers-pizza' and p.is_active
on conflict (business_id, profile_id) do nothing;
```

No new runtime environment variables or service-role key are required. The frontend follows the existing public Supabase URL/publishable-key pattern. For staging, substitute the isolated project's URL and publishable key in the staged copies of `JS/sobers-platform-orders.js`, `track/track-live.js`, `track/delivery-map.js`, `rider/rider.js`, and `admin/platform-config.js`; update matching CSP host allowances. Never substitute a service-role credential. Keep production source settings intact. All deployment output remains in `dist`.

## Two-phone test before production deployment

Serve the staging-configured build on a trusted **HTTPS test URL**, with migration 20 and a dedicated rider membership in the isolated Supabase project. Do not publish to the existing production site for this test. Ordinary PC HTTP/LAN addresses will not provide reliable secure-context geolocation on phones.

1. Customer phone: create a guest delivery with a written address and map pin. Keep its UUID tracking link and checkout phone. Open Tracking.
2. Admin: confirm, prepare and mark the order ready. Open its details and assign the dedicated rider. Never assign an owner account as a rider.
3. Rider phone: open `/rider/`, sign in, and tap Start Delivery. Grant location permission on that phone. Keep the app open.
4. Customer phone: verify Out for Delivery, the branch/destination/rider markers, advancing update age and rider movement without refreshing. Move safely; do not operate the phone while driving.
5. Disable the rider's connection briefly. Check the customer sees a waiting/stale state; reconnect and confirm a fresh latest position arrives. Refresh each page: customer tracking reconnects; rider must deliberately restart sharing.
6. Deny location permission in a separate attempt. Confirm a useful error and no falsely live position. Stop tracking and check the rider marker is removed.
7. Mark Delivered on the rider phone. Confirm GPS stops, the existing status becomes Delivered, the live map disappears, and further location RPCs are rejected. Repeat with admin cancellation and reassignment.
8. Try a second rider account, a different tracking UUID, a wrong phone and a direct delivery-table request. All must fail to reveal/update another delivery's coordinates.

## Verification completed and remaining

- 21 client tests passed, including existing checkout recovery and MFA regressions, denied GPS permission, poor accuracy, throttling/latest-only recovery, stale-fix suppression, server revocation and stopping during an in-flight request.
- PostgreSQL integration tests applied the existing foundation and migrations 13–18, then migration 20. Passed order creation with a pin; preparation/ready/start; customer GPS reads; wrong-phone/reference denial; unassigned rider denial; direct-write denial; location throttling; stop/restart; delivered/cancelled erasure; reassignment revocation; empty-only broadcast payloads. The separately staged migration 19 still rejects admin assignment at aal1.
- These database tests use real PostgreSQL through PGlite, with Supabase Auth identity and `realtime.send` transport explicitly stubbed. They do not claim to test Supabase's hosted trigger transport.
- A real two-client Realtime test against the isolated Supabase project joined both channels and delivered an empty broadcast. It sent no GPS. This verifies transport, not the full hosted trigger-to-phone flow.
- Local tracking UI was checked with synthetic positions at a phone-sized viewport: all three markers, no horizontal overflow, map tiles and the existing timeline. The screenshot is a synthetic UI preview, not evidence of physical rider movement.
- All launch checks passed, including 17 script syntax checks and 28 critical source/dist parity checks.
- Physical GPS movement, actual phone permission UI/background behaviour, and the combined hosted database-trigger → Realtime → two-phone flow remain the explicit pre-production acceptance test above. No 200-rider capacity claim is made.

Test commands:
```text
node --test tools/rider-gps-tests.cjs tools/customer-order-tests.cjs tools/tracking-recovery-tests.cjs tools/security-client-tests.cjs
node tools/rider-db-tests.cjs <PGlite module path> <foundation fixture directory>
node tools/rider-realtime-tests.cjs <isolated project's public config JSON>
```

The PostgreSQL harness expects the existing foundation fixtures `0001.sql`–`0008.sql`; the current workspace has them under `work/load-test/migrations`. PGlite is a test-only dependency, not part of the application. The Realtime test refuses a configured project other than the dedicated isolated project.

## Changed files

The exact source and deployment file inventory is listed below.

- `JS/sobers-delivery-pin.js`
- `JS/sobers-gps.js`
- `JS/sobers-pizza.js`
- `JS/sobers-platform-orders.js`
- `JS/sobers-pwa.js`
- `admin/business-admin.js`
- `admin/index.html`
- `css/sobers-delivery.css`
- `dist/JS/sobers-delivery-pin.js`
- `dist/JS/sobers-gps.js`
- `dist/JS/sobers-pizza.js`
- `dist/JS/sobers-platform-orders.js`
- `dist/JS/sobers-pwa.js`
- `dist/admin/business-admin.js`
- `dist/admin/index.html`
- `dist/css/sobers-delivery.css`
- `dist/index.html`
- `dist/legal/privacy.html`
- `dist/rider/index.html`
- `dist/rider/manifest.json`
- `dist/rider/rider-pwa.js`
- `dist/rider/rider.css`
- `dist/rider/rider.js`
- `dist/rider/sw.js`
- `dist/sw.js`
- `dist/track/delivery-map.js`
- `dist/track/index.html`
- `dist/track/track-live.js`
- `dist/vendor/leaflet/LICENSE`
- `dist/vendor/leaflet/images/layers-2x.png`
- `dist/vendor/leaflet/images/layers.png`
- `dist/vendor/leaflet/images/marker-icon-2x.png`
- `dist/vendor/leaflet/images/marker-icon.png`
- `dist/vendor/leaflet/images/marker-shadow.png`
- `dist/vendor/leaflet/leaflet.css`
- `dist/vendor/leaflet/leaflet.js`
- `docs/rider-gps-tracking.md`
- `index.html`
- `legal/privacy.html`
- `rider/index.html`
- `rider/manifest.json`
- `rider/rider-pwa.js`
- `rider/rider.css`
- `rider/rider.js`
- `rider/sw.js`
- `supabase/20-sobers-rider-tracking.sql`
- `sw.js`
- `tools/audit_sobers.ps1`
- `tools/customer-order-tests.cjs`
- `tools/rider-db-tests.cjs`
- `tools/rider-gps-tests.cjs`
- `tools/rider-realtime-tests.cjs`
- `tools/tracking-recovery-tests.cjs`
- `track/delivery-map.js`
- `track/index.html`
- `track/track-live.js`
- `vendor/leaflet/LICENSE`
- `vendor/leaflet/images/layers-2x.png`
- `vendor/leaflet/images/layers.png`
- `vendor/leaflet/images/marker-icon-2x.png`
- `vendor/leaflet/images/marker-icon.png`
- `vendor/leaflet/images/marker-shadow.png`
- `vendor/leaflet/leaflet.css`
- `vendor/leaflet/leaflet.js`
