(() => {
  "use strict";
  const db = window.supabase.createClient(
    "https://inthadecmxmbqexufzpe.supabase.co",
    "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80",
    { auth: { storageKey: "sobers-rider-auth" } }
  );
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  let timer = 0;

  function message(text) { $("#riderMessage").textContent = text || ""; }

  function render(rows) {
    const host = $("#deliveries");
    if (!rows.length) {
      host.innerHTML = "<p>No orders are assigned to you right now. Orders appear here when the kitchen marks them Ready and admin assigns you.</p>";
      return;
    }
    host.innerHTML = rows.map((order) => {
      const phone = String(order.customer_phone || "").replace(/\D/g, "");
      const status = order.status === "out_for_delivery" ? "Out for delivery" : "Ready for pickup from the branch";
      return `<article class="delivery"><h2>${esc(order.order_number)}</h2><p><strong>${esc(order.customer_name || "Customer")}</strong> · ${esc(order.branch_name || "Sobers Pizza")}</p><p>${esc(order.delivery_address || "No address saved")}</p>${order.customer_note ? `<p>Note: ${esc(order.customer_note)}</p>` : ""}<p>${esc(status)} · GH₵${Number(order.order_total || 0).toFixed(2)}</p><div class="actions">${phone ? `<a class="secondary" href="tel:${esc(phone)}">Call customer</a>` : ""}<button type="button" data-action="start" data-order="${order.order_id}" ${order.status === "ready" ? "" : "disabled"}>Start delivery</button><button type="button" data-action="delivered" data-order="${order.order_id}" ${order.status === "out_for_delivery" ? "" : "disabled"}>Mark delivered</button></div></article>`;
    }).join("");
  }

  async function load() {
    const { data: { session } } = await db.auth.getSession();
    $("#riderLogin").classList.toggle("hidden", !!session);
    $("#riderSignup").classList.toggle("hidden", !!session);
    $("#riderWork").classList.toggle("hidden", !session);
    if (!session) { window.clearInterval(timer); return; }
    const { data, error } = await db.rpc("sobers_rider_orders");
    if (error) return message(error.message);
    render(data || []);
  }

  async function update(orderId, action) {
    message(action === "start" ? "Starting delivery…" : "Marking delivered…");
    const { error } = await db.rpc("sobers_rider_update", { p_order: orderId, p_action: action });
    if (error) return message(error.message);
    message(action === "start" ? "Customer tracking now shows On the way." : "Order marked delivered.");
    await load();
  }

  $("#riderLogin").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    message("Signing in…");
    const { error } = await db.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
    form.elements.password.value = "";
    if (error) return message(error.message);
    await load();
  };

  $("#riderSignup").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const password = form.elements.password.value;
    if (password.length < 8) return message("Use at least 8 characters.");
    message("Creating account…");
    const { error } = await db.auth.signUp({ email: form.elements.email.value.trim(), password, options: { data: { full_name: form.elements.full_name.value.trim() } } });
    form.elements.password.value = "";
    if (error) return message(error.message);
    message("Account created. If Sobers asks you to confirm the email, do that, then ask admin to add this email under Riders.");
    await load();
  };

  $("#signOut").onclick = async () => { await db.auth.signOut(); message(""); await load(); };
  $("#deliveries").onclick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    update(button.dataset.order, button.dataset.action);
  };

  db.auth.onAuthStateChange(() => load());
  load().then(() => { timer = window.setInterval(load, 15000); });
})();
