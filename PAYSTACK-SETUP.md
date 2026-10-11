# Paystack Ghana MoMo Integration — Setup Instructions

## Required Supabase Secrets (set in Dashboard → Edge Functions → Secrets)

- `PAYSTACK_SECRET_KEY` — Your Paystack secret key (start with Test Secret Key)
- `SUPABASE_URL` — Automatically available
- `SUPABASE_SERVICE_ROLE_KEY` — Automatically available in Edge Functions

**Never** put the secret key in frontend code or Git.

## Deploy Edge Functions

```bash
# From project root (after installing Supabase CLI)
supabase functions deploy initialize-paystack
supabase functions deploy verify-paystack
supabase functions deploy paystack-webhook
```

## Frontend Changes Made

- Added payment method radio buttons in checkout (WhatsApp vs Pay now with MoMo).
- After a successful database order, if MoMo is selected, the frontend calls the `initialize-paystack` Edge Function and redirects to Paystack.
- Existing WhatsApp flow is preserved as the default.

## Next Steps Before Hosting

1. Deploy the three Edge Functions to your production Supabase project.
2. Set the `PAYSTACK_SECRET_KEY` secret to your **Test** key first.
3. Update the frontend fetch URL if needed (currently relative `/functions/v1/...` — adjust for your hosting).
4. Test a full flow in Paystack test mode.
5. Once verified, switch the secret to the Live key and confirm MoMo is enabled on your Paystack dashboard.
6. Rebuild / copy updated files into `dist/` before deploying the static site.

## Verification

After payment, call the `verify-paystack` function with the reference, or rely on the webhook (recommended for production).

Webhook URL to set in Paystack Dashboard:  
`https://<your-project-ref>.supabase.co/functions/v1/paystack-webhook`
