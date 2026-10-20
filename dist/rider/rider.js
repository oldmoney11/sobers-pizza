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
  let sharingOrderId = null;
  let watchId = null;
  let lastSent = 0;

  function stopShare() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    sharingOrderId = null;
    lastSent = 0;
  }

  function startShare(orderId, force = false) {
    if (!orderId) return;
    if (!force && sharingOrderId === orderId && watchId != null) return;
    if (!navigator.geolocation) {
      message("This browser cannot share location.");
      return;
    }
    stopShare();
    sharingOrderId = orderId;
    watchId = navigator.geolocation.watchPosition(async (position) => {
      if (sharingOrderId !== orderId) return;
      const now = Date.now();
      if (now - lastSent < 8000) return;
      lastSent = now;
      const { error } = await db.rpc("sobers_rider_location", {
        p_order: orderId,
        p_lat: position.coords.latitude,
        p_lng: position.coords.longitude,
        p_accuracy: position.coords.accuracy
      });
      if (sharingOrderId !== orderId) return;
      message(error ? error.message : "Sharing your location with the customer.");
    }, (error) => {
      message(error && error.code === 1
        ? "Location permission was blocked. Allow location for this site, then press Share location."
        : "Location is unavailable right now.");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }


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
      return `<article class="delivery"><h2>${esc(order.order_number)}</h2><p><strong>${esc(order.customer_name || "Customer")}</strong> · ${esc(order.branch_name || "Sobers Pizza")}</p><p>${esc(order.delivery_address || "No address saved")}</p>${order.customer_note ? `<p>Note: ${esc(order.customer_note)}</p>` : ""}<p>${esc(status)} · GH₵${Number(order.order_total || 0).toFixed(2)}</p><div class="actions">${phone ? `<a class="secondary" href="tel:${esc(phone)}">Call customer</a>` : ""}<button type="button" data-action="start" data-order="${order.order_id}" ${order.status === "ready" ? "" : "disabled"}>Start delivery</button><button type="button" data-action="share" data-order="${order.order_id}" ${order.status === "out_for_delivery" ? "" : "disabled"}>${sharingOrderId === order.order_id ? "Sharing location" : "Share location"}</button><button type="button" data-action="delivered" data-order="${order.order_id}" ${order.status === "out_for_delivery" ? "" : "disabled"}>Mark delivered</button></div></article>`;
    }).join("");
  }

  let recovery = false;
  let panel = "login";

  function showPanel(name) {
    panel = name;
    document.querySelectorAll("[data-screen]").forEach((screen) => {
      screen.classList.toggle("hidden", screen.dataset.screen !== name);
    });
  }

  function redirectHere() {
    return new URL(window.location.pathname, window.location.origin).href;
  }

  async function load() {
    const { data: { session } } = await db.auth.getSession();
    if (recovery) {
      showPanel("reset");
      return;
    }
    if (!session) {
      window.clearInterval(timer);
      showPanel(panel === "work" || panel === "reset" ? "login" : panel);
      return;
    }
    showPanel("work");
    const email = $("#riderEmail");
    if (email) email.textContent = session.user.email || "";
    const { data, error } = await db.rpc("sobers_rider_orders");
    if (error) return message(error.message);
    const rows = data || [];
    const active = rows.find((order) => order.status === "out_for_delivery");
    if (active) startShare(active.order_id);
    else if (sharingOrderId) stopShare();
    render(rows);
  }

  async function update(orderId, action) {
    message(action === "start" ? "Starting delivery…" : "Marking delivered…");
    const { error } = await db.rpc("sobers_rider_update", { p_order: orderId, p_action: action });
    if (error) return message(error.message);
    if (action === "start") startShare(orderId, true);
    if (action === "delivered" && sharingOrderId === orderId) stopShare();
    message(action === "start" ? "Delivery started. Allow location so the customer can see you." : "Order marked delivered. Location sharing stopped.");
    await load();
  }

  function busy(form, on) {
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = on;
  }

  $("#riderLogin").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    busy(form, true);
    message("Signing in…");
    const { error } = await db.auth.signInWithPassword({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value
    });
    form.elements.password.value = "";
    busy(form, false);
    if (error) return message(error.message);
    message("");
    await load();
  };

  $("#riderSignup").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const password = form.elements.password.value;
    if (password.length < 8) return message("Use at least 8 characters.");
    if (password !== form.elements.confirm.value) return message("The two passwords do not match.");
    busy(form, true);
    message("Creating account…");
    const { data, error } = await db.auth.signUp({
      email: form.elements.email.value.trim(),
      password,
      options: {
        data: { full_name: form.elements.full_name.value.trim() },
        emailRedirectTo: redirectHere()
      }
    });
    form.elements.password.value = "";
    form.elements.confirm.value = "";
    busy(form, false);
    if (error) return message(error.message);
    message(data.session
      ? "Account created. Ask Sobers admin to add this email under Riders before orders will appear."
      : "Account created. Confirm the email if Sobers asks you to, then ask admin to add this email under Riders.");
    await load();
  };

  $("#riderForgot").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    busy(form, true);
    message("Sending reset link…");
    const { error } = await db.auth.resetPasswordForEmail(form.elements.email.value.trim(), { redirectTo: redirectHere() });
    busy(form, false);
    if (error) return message(error.message);
    message("If this email has a rider account, a reset link is on its way. Check the inbox and spam folder.");
  };

  $("#riderReset").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const password = form.elements.password.value;
    if (password.length < 8) return message("Use at least 8 characters.");
    if (password !== form.elements.confirm.value) return message("The two passwords do not match.");
    busy(form, true);
    message("Saving your new password…");
    const { error } = await db.auth.updateUser({ password });
    form.elements.password.value = "";
    form.elements.confirm.value = "";
    busy(form, false);
    if (error) return message(error.message);
    recovery = false;
    message("Password updated.");
    await load();
  };

  document.querySelectorAll("[data-panel]").forEach((button) => {
    button.onclick = () => {
      const destination = button.dataset.panel;
      if (destination === "forgot") {
        const from = $("#riderLogin").elements.email.value.trim();
        if (from) $("#riderForgot").elements.email.value = from;
      }
      message("");
      showPanel(destination);
    };
  });

  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.onclick = () => {
      const input = button.parentElement.querySelector("input");
      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.textContent = showing ? "Show" : "Hide";
    };
  });

  $("#signOut").onclick = async () => { stopShare(); recovery = false; await db.auth.signOut(); message(""); await load(); };
  $("#deliveries").onclick = (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    if (button.dataset.action === "share") {
      startShare(button.dataset.order, true);
      message("Requesting location…");
      return;
    }
    update(button.dataset.order, button.dataset.action);
  };

  db.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true;
      showPanel("reset");
      message("Choose a new password for this rider account.");
      return;
    }
    load();
  });
  load().then(() => { timer = window.setInterval(load, 15000); });
})();
