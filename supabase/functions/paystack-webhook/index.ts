// supabase/functions/paystack-webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-paystack-signature",
};

async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === signature;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const signature = req.headers.get("x-paystack-signature") || "";
    const body = await req.text();
    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY") || "";

    if (!(await verifySignature(body, signature, secretKey))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(body);

    if (event.event !== "charge.success") {
      return new Response(JSON.stringify({ received: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tx = event.data;
    const orderId = tx.metadata?.order_id || tx.metadata?.custom_fields?.find((f: any) => f.variable_name === "order_id")?.value;

    if (!orderId) {
      return new Response(JSON.stringify({ received: true, ignored: "no order_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: order } = await supabase
      .from("platform_orders")
      .select("id, total, currency_code, payment_status, payment_reference")
      .eq("id", orderId)
      .single();

    if (!order) {
      return new Response(JSON.stringify({ received: true, ignored: "order not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotent: already paid with this reference
    if (order.payment_status === "paid" && order.payment_reference === tx.reference) {
      return new Response(JSON.stringify({ received: true, already_processed: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const expected = Math.round(Number(order.total) * 100);
    const valid = tx.status === "success" && tx.amount === expected && tx.currency === "GHS";

    if (valid) {
      const { error: updateErr } = await supabase
        .from("platform_orders")
        .update({ payment_status: "paid", payment_reference: tx.reference })
        .eq("id", orderId);

      if (updateErr) {
        return new Response(JSON.stringify({ error: "Update failed" }), { status: 500 });
      }
    }

    return new Response(JSON.stringify({ received: true, paid: valid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
});
