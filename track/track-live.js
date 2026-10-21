(() => {
  "use strict";
  const url = "https://inthadecmxmbqexufzpe.supabase.co";
  const key = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", "\"": "\u0026quot;", "'": "\u0026#39;" })[character]);
  const money = (value) => `GH₵${Number(value || 0).toFixed(2)}`;
  let pollTimer = 0;
  let activeLookup = null;
  let lastManualLookupAt = 0;
  let autoTries = 0;

  function progressSteps(order) {
    return order.fulfilment === "pickup"
      ? [["new", "Received"], ["confirmed", "Confirmed"], ["preparing", "Preparing"], ["ready", "Ready"], ["completed", "Collected"]]
      : [["new", "Received"], ["confirmed", "Confirmed"], ["preparing", "Preparing"], ["ready", "Ready"], ["out_for_delivery", "On the way"], ["completed", "Delivered"]];
  }

  function statusLabel(order) {
    if (order.status === "cancelled") return "Cancelled";
    if (order.status === "new") return "Received";
    if (order.status === "confirmed") return "Confirmed";
    if (order.status === "preparing") return "Preparing";
    if (order.status === "ready") return "Ready";
    if (order.status === "out_for_delivery") return "On the way";
    if (order.status === "completed") return order.fulfilment === "pickup" ? "Collected" : "Delivered";
    return String(order.status || "Received").replace(/_/g, " ");
  }

  function headline(order) {
    if (order.status === "cancelled") return "This order was cancelled";
    if (order.status === "new") return "We’ve received your order";
    if (order.status === "confirmed") return "The branch confirmed it";
    if (order.status === "preparing") return "Your food is being prepared";
    if (order.status === "ready") return order.fulfilment === "pickup" ? "Ready for pickup" : "Ready for a rider";
    if (order.status === "out_for_delivery") return "Your order is on the way";
    if (order.status === "completed") return order.fulfilment === "pickup" ? "Collected" : "Delivered";
    return statusLabel(order);
  }

  function render(order) {
    const steps = progressSteps(order);
    const current = order.status === "cancelled" ? -1 : steps.findIndex(([status]) => status === order.status);
    const label = statusLabel(order);
    const shownNumber = order.display_order_number || order.order_number;
    $("#receiptNumber").textContent = shownNumber;
    $("#receiptStatus").textContent = label;
    $("#statusHeadline").textContent = headline(order);
    $("#orderProgress").innerHTML = steps.map(([status, name], index) => {
      const state = index < current ? "done" : index === current ? "current" : "next";
      return `<li class="${state}"><span class="dot" aria-hidden="true"></span><span>${esc(name)}</span></li>`;
    }).join("");
    const prep = order.prep_min_minutes && order.prep_max_minutes ? `${order.prep_min_minutes}–${order.prep_max_minutes} min` : "Confirming";
    const when = new Date(order.updated_at || order.created_at);
    $("#receiptMeta").innerHTML = [
      ["Branch", order.branch_name || "Sobers Pizza"],
      ["Type", String(order.fulfilment || "").replace(/_/g, " ")],
      ["Payment", order.payment_status || "—"],
      ["Prep window", prep],
      ["Updated", when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })]
    ].map(([name, value]) => `<div><small>${esc(name)}</small><strong>${esc(value)}</strong></div>`).join("");
    $("#receiptItems").innerHTML = (order.items || []).map((item) => `<div class="item"><div><b>${Number(item.quantity)} × ${esc(item.name)}</b></div><strong>${money(item.line_total)}</strong></div>`).join("") || `<p class="muted">No items were returned for this order.</p>`;
    const costs = [["Subtotal", order.subtotal]];
    if (order.delivery_fee != null) costs.push(["Delivery", order.delivery_fee]);
    if (Number(order.discount_total)) costs.push(["Discount", order.discount_total]);
    $("#receiptCosts").innerHTML = costs.map(([name, value]) => `<p><span>${esc(name)}</span><strong>${money(value)}</strong></p>`).join("");
    $("#receiptTotal").textContent = money(order.total);
    const contact = $("#branchContact");
    const whatsapp = String(order.branch_whatsapp_number || order.branch_phone || "").replace(/\D/g, "").replace(/^0/, "233");
    if (whatsapp) {
      contact.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hello Sobers Pizza ${order.branch_name || ""}, I need help with order ${shownNumber}.`)}`;
      contact.textContent = `Contact ${order.branch_name || "this branch"} on WhatsApp`;
      contact.classList.remove("hidden");
    } else contact.classList.add("hidden");
    const onRoad = order.fulfilment !== "pickup" && order.status === "out_for_delivery";
    $("#onWayCard").classList.toggle("hidden", !onRoad);
    $("#wayBranch").textContent = order.branch_name || "Sobers Pizza";
    $("#wayRef").textContent = shownNumber;
    $("#liveLayout").classList.toggle("is-live", onRoad);
    $("#liveState").textContent = ["completed", "cancelled"].includes(order.status) ? "Tracking complete" : "Live updates on";
    $("#lookup").classList.add("compact");
    $("#receipt").classList.remove("hidden");
    $("#trackMessage").textContent = "";
  }

  async function refreshMap(order) {
    if (!window.SobersDeliveryMap) return;
    if (order.fulfilment === "pickup" || order.status !== "out_for_delivery" || !activeLookup) {
      window.SobersDeliveryMap.hide();
      return;
    }
    try {
      const response = await fetch(`${url}/rest/v1/rpc/sobers_track_location`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          p_business_slug: "sobers-pizza",
          p_order_number: activeLookup.reference,
          p_customer_phone: activeLookup.phone
        }),
        cache: "no-store"
      });
      const point = await response.json();
      if (!response.ok) {
        window.SobersDeliveryMap.show(null);
        return;
      }
      window.SobersDeliveryMap.show(point);
    } catch (_) {
      const note = $("#mapFreshness");
      if (note && !$("#deliveryMap").hidden) note.textContent = "Connection interrupted. Trying again…";
      else window.SobersDeliveryMap.show(null);
    }
  }

  async function lookup(reference, phone, quiet = false) {
    const response = await fetch(`${url}/rest/v1/rpc/track_public_order`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_business_slug: "sobers-pizza", p_order_number: reference, p_customer_phone: phone }),
      cache: "no-store"
    });
    const order = await response.json();
    if (!response.ok) throw new Error("Connection interrupted. Trying again…");
    if (!order) {
      if (quiet) return null;
      throw new Error("We couldn’t find that order. Check the tracking reference and phone number.");
    }
    render(order);
    activeLookup = { reference, phone };
    autoTries = 0;
    try { localStorage.setItem("sobersLastTracking", JSON.stringify(activeLookup)); } catch (_) {}
    await refreshMap(order);
    window.clearTimeout(pollTimer);
    if (!["completed", "cancelled"].includes(order.status)) {
      pollTimer = window.setTimeout(refresh, order.status === "out_for_delivery" ? 12000 : 20000);
    }
    return order;
  }

  async function refresh() {
    if (!activeLookup || document.hidden) {
      pollTimer = window.setTimeout(refresh, 8000);
      return;
    }
    try {
      const order = await lookup(activeLookup.reference, activeLookup.phone, true);
      if (!order) {
        $("#liveState").textContent = "Connection interrupted. Trying again…";
        pollTimer = window.setTimeout(refresh, 12000);
      }
    } catch (_) {
      $("#liveState").textContent = "Connection interrupted. Trying again…";
      pollTimer = window.setTimeout(refresh, 15000);
    }
  }

  async function submit(reference, phone, automatic = false) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7) {
      $("#trackMessage").textContent = "Enter the phone number used at checkout.";
      return;
    }
    const now = Date.now();
    if (!automatic && now - lastManualLookupAt < 3000) {
      $("#trackMessage").textContent = "Please wait a moment before checking again.";
      return;
    }
    if (!automatic) {
      lastManualLookupAt = now;
      autoTries = 0;
    }
    const button = $("#trackForm button");
    button.disabled = true;
    $("#trackMessage").textContent = automatic ? "Loading your delivery…" : "Checking your order…";
    try {
      const order = await lookup(reference, phone);
      if (!order) throw new Error("missing");
    } catch (error) {
      if (automatic && autoTries < 4 && /couldn’t find|missing/.test(String(error.message))) {
        autoTries += 1;
        $("#trackMessage").textContent = "Loading your delivery…";
        pollTimer = window.setTimeout(() => submit(reference, phone, true), 3000);
      } else {
        $("#trackMessage").textContent = error.message === "missing"
          ? "We couldn’t find that order. Check the tracking reference and phone number."
          : error.message;
      }
    } finally {
      button.disabled = false;
    }
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
      reference = reference || (saved && saved.reference) || "";
      phone = phone || (saved && saved.phone) || "";
    } catch (_) {}
  }
  if (reference) $("#trackForm").elements.order_number.value = reference;
  if (phone) $("#trackForm").elements.customer_phone.value = phone;
  if (reference && phone) submit(reference, phone, true);
})();
