(() => {
  "use strict";
  const url = "https://inthadecmxmbqexufzpe.supabase.co";
  const key = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const statuses = ["new", "confirmed", "preparing", "ready", "completed"];
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const money = (value) => `GH₵${Number(value || 0).toFixed(2)}`;
  let pollTimer = 0;
  let activeLookup = null;

  function statusLabel(order) {
    if (order.status === "cancelled") return "Cancelled";
    if (order.status === "new") return "Order received";
    if (order.status === "confirmed") return "Confirmed";
    if (order.status === "preparing") return "Preparing your food";
    if (order.status === "ready") return order.fulfilment === "pickup" ? "Ready for pickup" : "Ready for delivery";
    if (order.status === "completed") return order.fulfilment === "pickup" ? "Collected" : "Delivered";
    return String(order.status || "Received").replace(/_/g, " ");
  }

  function render(order) {
    const current = order.status === "cancelled" ? -1 : statuses.indexOf(order.status);
    const labels = ["Received", "Confirmed", "Preparing", order.fulfilment === "pickup" ? "Pickup" : "Ready", order.fulfilment === "pickup" ? "Collected" : "Delivered"];
    $("#receiptNumber").textContent = order.order_number;
    $("#receiptStatus").textContent = statusLabel(order);
    $("#orderProgress").innerHTML = statuses.map((status, index) => `<div class="progress-step ${index <= current ? "done" : ""} ${index === current ? "current" : ""}"><span class="step" title="${esc(status)}"></span><small>${esc(labels[index])}</small></div>`).join("");
    const prep = order.prep_min_minutes && order.prep_max_minutes ? `${order.prep_min_minutes}–${order.prep_max_minutes} min` : "Confirming";
    $("#receiptMeta").innerHTML = `<div><small>Branch</small><strong>${esc(order.branch_name || "Sobers Pizza")}</strong></div><div><small>Estimated prep</small><strong>${esc(prep)}</strong></div><div><small>Order type</small><strong>${esc(order.fulfilment.replace(/_/g, " "))}</strong></div><div><small>Payment</small><strong>${esc(order.payment_status)}</strong></div><div><small>Last updated</small><strong>${new Date(order.updated_at || order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></div>`;
    $("#receiptItems").innerHTML = (order.items || []).map((item) => `<div class="item"><div><b>${Number(item.quantity)} × ${esc(item.name)}</b></div><strong>${money(item.line_total)}</strong></div>`).join("");
    $("#receiptTotal").textContent = money(order.total);
    const contact = $("#branchContact");
    const whatsapp = String(order.branch_whatsapp_number || order.branch_phone || "").replace(/\D/g, "").replace(/^0/, "233");
    if (whatsapp) {
      contact.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello Sobers Pizza ${order.branch_name || ""}, I need help with order ${order.order_number}.`)}`;
      contact.textContent = `Contact ${order.branch_name || "this branch"} on WhatsApp`;
      contact.classList.remove("hidden");
    } else contact.classList.add("hidden");
    $("#trackMessage").textContent = "";
    $("#liveState").textContent = ["completed", "cancelled"].includes(order.status) ? "Tracking complete" : "Live updates on · checking automatically";
    $("#receipt").classList.remove("hidden");
  }

  async function lookup(reference, phone, quiet = false) {
    const response = await fetch(`${url}/rest/v1/rpc/track_public_order`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_business_slug: "sobers-pizza", p_order_number: reference, p_customer_phone: phone }),
      cache: "no-store",
    });
    const order = await response.json();
    if (!response.ok) throw new Error(order?.message || "Tracking is temporarily unavailable.");
    if (!order) {
      if (quiet) return null;
      throw new Error("We’re finalising this order. Keep this page open and we’ll check again automatically.");
    }
    render(order);
    activeLookup = { reference, phone };
    try { localStorage.setItem("sobersLastTracking", JSON.stringify(activeLookup)); } catch (_) {}
    window.clearTimeout(pollTimer);
    if (!["completed", "cancelled"].includes(order.status)) pollTimer = window.setTimeout(refresh, 10000);
    return order;
  }

  async function refresh() {
    if (!activeLookup || document.hidden) {
      pollTimer = window.setTimeout(refresh, 5000);
      return;
    }
    try {
      const order = await lookup(activeLookup.reference, activeLookup.phone, true);
      if (!order) pollTimer = window.setTimeout(refresh, 5000);
    } catch (_) { pollTimer = window.setTimeout(refresh, 12000); }
  }

  async function submit(reference, phone, automatic = false) {
    const button = $("#trackForm button");
    button.disabled = true;
    $("#trackMessage").textContent = automatic ? "Connecting to your live order…" : "Checking your order…";
    try { await lookup(reference, phone); }
    catch (error) {
      $("#trackMessage").textContent = error.message;
      if (automatic) pollTimer = window.setTimeout(() => submit(reference, phone, true), 3000);
    } finally { button.disabled = false; }
  }

  $("#trackForm").onsubmit = (event) => {
    event.preventDefault();
    window.clearTimeout(pollTimer);
    const form = new FormData(event.currentTarget);
    submit(String(form.get("order_number") || "").trim(), String(form.get("customer_phone") || "").trim());
  };
  $("#printReceipt").onclick = () => window.print();

  const shared = new URLSearchParams(window.location.hash.slice(1));
  let reference = shared.get("ref") || "";
  let phone = shared.get("phone") || "";
  if (!reference || !phone) {
    try {
      const saved = JSON.parse(localStorage.getItem("sobersLastTracking") || "null");
      reference ||= saved?.reference || "";
      phone ||= saved?.phone || "";
    } catch (_) {}
  }
  if (reference) $("#trackForm").elements.order_number.value = reference;
  if (phone) $("#trackForm").elements.customer_phone.value = phone;
  if (reference && phone) submit(reference, phone, true);
})();
