// supabase/functions/initialize-paystack/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id, email, amount_ghs, phone, provider } = await req.json();

    if (!order_id || !email || !amount_ghs) {
      throw new Error("Missing required fields: order_id, email, amount_ghs");
    }

    const amountPesewas = Math.round(Number(amount_ghs) * 100);
    if (amountPesewas < 100) throw new Error("Amount too small");

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY not configured");

    const reference = `sobers_${order_id}_${Date.now()}`;

    const payload: any = {
      email,
      amount: amountPesewas,
      currency: "GHS",
      reference,
      channels: ["mobile_money", "card"],
      metadata: {
        order_id,
        custom_fields: [
          { display_name: "Order ID", variable_name: "order_id", value: order_id }
        ]
      }
    };

    // Optional: pre-fill mobile money if provided
    if (phone && provider) {
      payload.mobile_money = { phone, provider };
    }

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const paystackData = await paystackRes.json();
    if (!paystackData.status) {
      throw new Error(paystackData.message || "Paystack initialization failed");
    }

    // Optionally store reference on the order (requires service role)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    await supabase
      .from("platform_orders")
      .update({ payment_reference: reference, payment_status: "pending" })
      .eq("id", order_id);

    return new Response(
      JSON.stringify({
        authorization_url: paystackData.data.authorization_url,
        access_code: paystackData.data.access_code,
        reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
