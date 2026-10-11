// supabase/functions/verify-paystack/index.ts
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
    const { reference } = await req.json();
    if (!reference) throw new Error("Missing reference");

    const secretKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secretKey) throw new Error("PAYSTACK_SECRET_KEY not configured");

    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });

    const verifyData = await verifyRes.json();
    if (!verifyData.status) {
      throw new Error(verifyData.message || "Verification failed");
    }

    const tx = verifyData.data;
    const orderId = tx.metadata?.order_id || tx.metadata?.custom_fields?.find((f: any) => f.variable_name === "order_id")?.value;

    if (!orderId) throw new Error("No order_id associated with this transaction");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch order to validate amount
    const { data: order, error: orderErr } = await supabase
      .from("platform_orders")
      .select("id, total, payment_status")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) throw new Error("Order not found");

    const expectedPesewas = Math.round(Number(order.total) * 100);
    const isSuccess = tx.status === "success" && tx.amount === expectedPesewas && tx.currency === "GHS";

    const newStatus = isSuccess ? "paid" : (tx.status === "failed" || tx.status === "abandoned" ? "failed" : "pending");

    await supabase
      .from("platform_orders")
      .update({
        payment_status: newStatus,
        payment_reference: reference,
      })
      .eq("id", orderId);

    return new Response(
      JSON.stringify({
        verified: isSuccess,
        status: tx.status,
        order_id: orderId,
        payment_status: newStatus,
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
