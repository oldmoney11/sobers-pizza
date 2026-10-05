# Sobers security rollout

The deployment folder stays `dist`. These changes follow audited baseline `f4db920f7dc7b7f14b1be33fa49c268527fd99d9`.

## Deployment sequence

1. Apply `supabase/18-sobers-api-access-hardening.sql` in a transaction. It blocks legacy Sobers order endpoints, validates item options, serializes order-limit checks, adds a 500-orders-per-five-minutes business circuit breaker, restricts tracking to UUID references with a 12-lookups-per-minute reference/phone limit, and limits each public kiosk to 100 orders per five minutes.
2. Deploy this branch using `dist`. Customer tracking links already use UUID request references. Typing a predictable order number is no longer supported. Walk-in customers can use the kiosk without signing in.
3. Sign into the admin UI and enroll/verify an authenticator. The UI requires MFA before loading administration. Verify password recovery and subsequent MFA challenges on the final hosted URL.
4. Apply `supabase/19-sobers-admin-mfa-enforcement.sql` only after the new admin UI is available. It requires an AAL2 session for Sobers administrative database permission checks. Until this migration is applied, frontend MFA is not a backend security boundary.

## Verification

- `node --test tools/security-client-tests.cjs` checks fail-closed MFA behavior using synthetic credentials.
- `tools/audit_sobers.ps1` verifies launch checks and source/deployment parity.
- In a transaction that will roll back, apply migration 18, then run `tools/security-database-checks.sql`. These tests validate blocked legacy routes and anonymous kiosk item validation, allowed catalog selections, invalid selections, and the tracking throttle without creating orders.
- For migration 19, run `tools/security-mfa-checks.sql` within the same rolled-back transaction. This fixture uses the existing Sobers owner identity to assert AAL1 denial and AAL2 permission checks. It does not establish a real MFA session or enroll a factor.
- The SQL migrations and checks passed against the actual database in a rolled-back transaction during preparation. Client tests and local launch checks passed.

## Remaining launch work

- MFA enrollment belongs to the owner; no secret/code should be sent through chat. Database enforcement must follow frontend deployment.
- The legacy shared `orders` table still has a public INSERT policy. It is not the Sobers order path. Determine which other project still uses it before retiring it; do not break shared applications blindly.
- Phone limits plus a business circuit breaker do not replace ingress/device/IP controls. Add these at a suitable API boundary and monitor abusive traffic. The circuit breaker should be tuned to actual operating volume.
- Configure password/email protections, recovery URLs, backups, monitoring, storage policies, and verify the host's actual HTTPS/security headers.
- Conduct successful order/payment and cross-account tests in a staging environment. This review did not create production orders or capture owner credentials.

Reference: https://supabase.com/docs/guides/auth/auth-mfa/totp

This is defense in depth, not a promise of immunity from attack.
