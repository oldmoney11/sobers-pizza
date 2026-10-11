# Paystack Ghana MoMo Integration — Setup

## Required Supabase Secrets
Set in Dashboard → Edge Functions → Secrets:
- `PAYSTACK_SECRET_KEY` — Start with your **Test** secret key. Switch to Live only after full end-to-end testing and explicit approval.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to Edge Functions.

## Deployed Functions
- `initialize-paystack` — Derives amount from `platform_orders.total`, creates Paystack transaction, saves reference.
- `verify-paystack` — Verifies with Paystack API, validates amount/currency/reference, updates payment_status.
- `paystack-webhook` — Validates HMAC-SHA512 signature, processes `charge.success` idempotently.

## Callback URL
The frontend passes `callback_url` based on the current page origin when calling initialize.  
For production, ensure your hosted site is reachable at the URL customers use. No domain is hardcoded.

## Switching Test → Live
1. Complete a successful test transaction in Paystack Test Mode.
2. In Supabase Secrets, replace `PAYSTACK_SECRET_KEY` with the Live secret.
3. In Paystack Dashboard (Live), set the webhook URL to:  
   `https://inthadecmxmbqexufzpe.supabase.co/functions/v1/paystack-webhook`
4. Confirm Mobile Money is enabled for Ghana on the live account.

## End-to-end test steps (Test Mode)
1. Place an order and choose “Pay now with Mobile Money”.
2. Complete the Paystack test checkout.
3. Confirm you are redirected back and the verification screen appears.
4. Check the order in admin — payment_status should be `paid` only after verification succeeds.
5. Test a failed/cancelled flow and confirm the order is not marked paid.

## JWT notes
- `paystack-webhook` should be deployed with `--no-verify-jwt` (signature is the auth).
- Guest checkout uses the public key as a fallback Authorization header; all validation remains server-side.

No secrets are stored in the repository.
