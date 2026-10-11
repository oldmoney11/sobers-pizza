# Paystack Ghana MoMo Integration — Setup

## Edge Function base URL
All functions are called at:
```
https://inthadecmxmbqexufzpe.supabase.co/functions/v1/
```

- Initialize: `https://inthadecmxmbqexufzpe.supabase.co/functions/v1/initialize-paystack`
- Verify: `https://inthadecmxmbqexufzpe.supabase.co/functions/v1/verify-paystack`
- Webhook: `https://inthadecmxmbqexufzpe.supabase.co/functions/v1/paystack-webhook`

## Required Supabase Secrets
Set in Dashboard → Edge Functions → Secrets:
- `PAYSTACK_SECRET_KEY` — Use the **Test** secret key until end-to-end testing is complete and you explicitly choose to go live.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

**Never** commit secrets to Git or expose them in frontend code.

## Deployed functions
- `initialize-paystack` — Loads the order from `platform_orders`, uses the saved `total` (pesewas), validates GHS and unpaid status, creates the Paystack transaction, and stores the reference.
- `verify-paystack` — Calls Paystack’s verify endpoint, checks reference match, amount, and currency, then updates `payment_status`.
- `paystack-webhook` — Validates the Paystack HMAC-SHA512 signature on the raw body, processes `charge.success` idempotently, and only marks paid after full checks.

## Deployment commands
```bash
supabase functions deploy initialize-paystack --project-ref inthadecmxmbqexufzpe --no-verify-jwt
supabase functions deploy verify-paystack --project-ref inthadecmxmbqexufzpe --no-verify-jwt
supabase functions deploy paystack-webhook --project-ref inthadecmxmbqexufzpe --no-verify-jwt
```

`--no-verify-jwt` is required for public guest checkout and for the webhook (Paystack cannot send a Supabase JWT). All validation stays server-side. The webhook authenticates solely via Paystack’s signature.

## Callback and return flow
The frontend sends `callback_url` as:
```
window.location.origin + window.location.pathname + "?paystack_return=1"
```
Paystack redirects back with `reference` or `trxref` plus `paystack_return=1`.

On page load the frontend:
1. Detects `paystack_return`.
2. Reads the reference.
3. Calls `verify-paystack`.
4. Shows confirmed / pending / failed.
5. Cleans the URL so a refresh does not re-verify.

No domain is hardcoded.

## Webhook URL
Set in Paystack Dashboard (Test mode first):
```
https://inthadecmxmbqexufzpe.supabase.co/functions/v1/paystack-webhook
```

## Switching Test → Live
1. Complete a successful test transaction and confirm the order is marked paid only after verification.
2. Replace `PAYSTACK_SECRET_KEY` in Supabase Secrets with the Live secret.
3. In Paystack Live mode, set the same webhook URL.
4. Confirm Mobile Money is enabled for Ghana on the live account.

## Acceptance checklist (future testing)
- [ ] Successful MoMo test transaction → order `payment_status` becomes `paid`.
- [ ] Failed or cancelled transaction → order is not marked paid.
- [ ] Pending transaction → status remains pending or is updated correctly.
- [ ] Duplicate webhook delivery does not re-mark or corrupt the order.
- [ ] Amount or currency mismatch is rejected.
- [ ] Guest checkout works (no bearer token required beyond the public key fallback).
- [ ] WhatsApp ordering path still works when MoMo is not selected.
- [ ] TTU / TOWN branch numbers remain correct.

No end-to-end payment test has been completed in this environment.
