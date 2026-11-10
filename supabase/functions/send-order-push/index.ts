import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  const expected = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
  const provided = req.headers.get("x-webhook-secret") || "";
  if (!expected || provided !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  if (!publicKey || !privateKey) {
    return new Response(JSON.stringify({ error: "push keys are not configured" }), { status: 500, headers });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid payload" }), { status: 400, headers });
  }

  const record = (body.record || body) as Record<string, unknown>;
  const businessId = String(record.business_id || "");
  if (!businessId) {
    return new Response(JSON.stringify({ error: "missing business" }), { status: 400, headers });
  }

  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:admin@soberspizza.com",
    publicKey,
    privateKey,
  );

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  );

  const { data: subscriptions, error } = await supabase
    .from("admin_push_subscriptions")
    .select("id,endpoint,p256dh,auth,alerts_enabled")
    .eq("business_id", businessId);

  if (error) {
    return new Response(JSON.stringify({ error: "could not load devices" }), { status: 500, headers });
  }

  const orderNumber = String(record.order_number || record.display_order_number || "New order");
  const customer = String(record.customer_name || "").trim();
  const total = Number(record.total || 0).toFixed(2);
  const bodyText = `${orderNumber}${customer ? ` · ${customer}` : ""} · GH₵${total}`;

  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions || []) {
    const payload = JSON.stringify({
      title: "New Sobers Pizza order",
      body: bodyText,
      tag: `order-${record.id || orderNumber}`,
      silent: subscription.alerts_enabled === false,
      url: "./#orders",
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
      sent += 1;
    } catch (pushError) {
      const statusCode = Number((pushError as { statusCode?: number }).statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await supabase.from("admin_push_subscriptions").delete().eq("id", subscription.id);
        removed += 1;
      }
    }
  }

  return new Response(JSON.stringify({ sent, removed }), { headers });
});
