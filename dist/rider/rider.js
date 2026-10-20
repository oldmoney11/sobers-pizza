(() => {
  "use strict";
  const db = window.supabase.createClient(
    "https://inthadecmxmbqexufzpe.supabase.co",
    "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80",
    { auth: { storageKey: "sobers-rider-auth" } }
  );
  const $ = (selector) => document.querySelector(selector);
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll(".theme-toggle").forEach((button) => { button.textContent = theme === "day" ? "Night" : "Day"; });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "day" ? "#ffffff" : "#0d0d0f";
  }
  applyTheme(localStorage.getItem("rider-theme") || "night");
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".theme-toggle")) return;
    const next = document.documentElement.dataset.theme === "day" ? "night" : "day";
    localStorage.setItem("rider-theme", next);
    applyTheme(next);
  });
  const esc = (value) => String(value ?? "").replace(/[&<>"\']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
  let timer = 0;
  let sharingOrderId = null;
  let watchId = null;
  let lastSent = 0;
  let lastPosition = null;
  let map = null;
  let marker = null;
  let recovery = false;
  let panel = "login";
  let tab = "jobs";
  let jobs = [];
  let history = [];
  let historyNote = "";
  let installEvent = null;

  function message(text) {
    const value = text || "";
    if ($("#gateMessage")) $("#gateMessage").textContent = value;
    if ($("#riderMessage")) $("#riderMessage").textContent = value;
  }

  function stopShare() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    sharingOrderId = null;
    lastSent = 0;
  }

  function updateMap() {
    const host = $("#riderMap");
    if (!host || !lastPosition || !window.L) return;
    const latlng = [lastPosition.lat, lastPosition.lng];
    if (!map || map.getContainer() !== host) {
      map = window.L.map(host, { zoomControl: false, attributionControl: false }).setView(latlng, 16);
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      marker = window.L.circleMarker(latlng, { radius: 9, color: "#fff7e8", weight: 2, fillColor: "#ef233c", fillOpacity: 1 }).addTo(map);
    } else {
      marker.setLatLng(latlng);
      map.panTo(latlng);
    }
    window.setTimeout(() => map.invalidateSize(), 60);
  }

  function startShare(orderId, force = false) {
    if (!orderId) return;
    if (!force && sharingOrderId === orderId && watchId != null) return;
    if (!navigator.geolocation) {
      message("This phone cannot share location.");
      return;
    }
    stopShare();
    map = null;
    sharingOrderId = orderId;
    watchId = navigator.geolocation.watchPosition(async (position) => {
      if (sharingOrderId !== orderId) return;
      lastPosition = { lat: position.coords.latitude, lng: position.coords.longitude };
      updateMap();
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
      message(error ? error.message : "The customer can see your latest location.");
      $("#livePill").textContent = "Live";
      $("#livePill").classList.add("live");
    }, (error) => {
      message(error && error.code === 1
        ? "Location permission was blocked. Allow location, then open the active delivery."
        : "Location is unavailable right now.");
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }

  function money(value) { return "GH\u20b5" + Number(value || 0).toFixed(2); }

  function ticket(order, mode) {
    const phone = String(order.customer_phone || "").replace(/\D/g, "");
    const address = order.delivery_address || "";
    const klass = order.status === "out_for_delivery" ? "on-road" : order.status === "completed" ? "done" : "ready";
    const status = order.status === "out_for_delivery" ? "On the road" : order.status === "completed" ? "Delivered" : "Ready for pickup";
    const maps = address ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}">Navigate</a>` : "";
    const call = phone ? `<a href="tel:${esc(phone)}">Call</a>` : "";
    const body = `<div class="ticket-body"><div class="ticket-top"><p class="kicker">${esc(order.branch_name || "Assigned delivery")}</p><span class="chip">${esc(status)}</span></div><div class="ticket-main"><h2>${esc(order.order_number)}</h2><strong class="fare">${money(order.order_total)}</strong></div><p class="who">${esc(order.customer_name || "Customer")}</p><p class="addr">${esc(address || "No address saved")}</p>${order.customer_note ? `<p class="addr">Note: ${esc(order.customer_note)}</p>` : ""}`;
    if (mode === "job") {
      return `<article class="ticket ${klass}">${body}<div class="actions"><button type="button" data-action="start" data-order="${order.order_id}">Pick up and start</button>${call}</div></div></article>`;
    }
    if (mode === "active") {
      return `<article class="ticket ${klass} active-job"><div id="riderMap"></div>${body}<div class="actions">${maps}${call}<button type="button" data-action="share" data-order="${order.order_id}">${sharingOrderId === order.order_id ? "Location is live" : "Share location"}</button><button class="go" type="button" data-action="delivered" data-order="${order.order_id}">Mark delivered</button></div></div></article>`;
    }
    return `<article class="ticket ${klass}">${body}</div></article>`;
  }

  function paint() {
    const titles = { jobs: ["Today", "Jobs"], active: ["On the road", "Active"], history: ["Last 60 days", "History"], account: ["You", "Account"] };
    $("#deskKicker").textContent = titles[tab][0];
    $("#deskTitle").textContent = titles[tab][1];
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("on", button.dataset.tab === tab));
    const active = jobs.filter((order) => order.status === "out_for_delivery");
    const waiting = jobs.filter((order) => order.status === "ready");
    document.querySelectorAll("[data-tab='active'] .count").forEach((badge) => { badge.textContent = active.length ? String(active.length) : ""; });
    $("#livePill").textContent = sharingOrderId ? "Live" : "Off shift";
    $("#livePill").classList.toggle("live", !!sharingOrderId);
    $("#jobsView").classList.toggle("hidden", tab !== "jobs");
    $("#activeView").classList.toggle("hidden", tab !== "active");
    $("#historyView").classList.toggle("hidden", tab !== "history");
    $("#accountView").classList.toggle("hidden", tab !== "account");
    $("#jobsView").innerHTML = `<div class="stats"><div class="stat"><b>${waiting.length}</b><span>Waiting at the branch</span></div><div class="stat"><b>${active.length}</b><span>On the road</span></div></div><div class="board">${waiting.length ? waiting.map((order) => ticket(order, "job")).join("") : `<p class="empty">No pickup is waiting. A job appears when it is marked Ready and assigned to you.</p>`}</div>`;
    $("#activeView").innerHTML = active.length ? active.map((order) => ticket(order, "active")).join("") : `<p class="empty">Nothing is on the road. Start a job and this becomes the delivery screen.</p>`;
    const deliveredValue = history.reduce((sum, order) => sum + Number(order.order_total || 0), 0);
    $("#historyView").innerHTML = historyNote
      ? `<p class="empty">${esc(historyNote)}</p>`
      : `<div class="stats"><div class="stat"><b>${history.length}</b><span>Delivered</span></div><div class="stat"><b>${money(deliveredValue)}</b><span>Order value, not rider pay</span></div></div><div class="board">${history.length ? history.map((order) => ticket(order, "history")).join("") : `<p class="empty">Completed deliveries from the last 60 days show here.</p>`}</div>`;
    if (tab === "active") updateMap();
  }

  function showPanel(name) {
    panel = name;
    const working = name === "work";
    $("#gate").classList.toggle("hidden", working);
    $("#desk").classList.toggle("hidden", !working);
    document.querySelectorAll("#gate [data-screen]").forEach((screen) => {
      screen.classList.toggle("hidden", screen.dataset.screen !== name);
    });
    if (working) paint();
  }

  function redirectHere() {
    return new URL(window.location.pathname, window.location.origin).href;
  }

  async function loadHistory() {
    const { data, error } = await db.rpc("sobers_rider_history");
    if (error) {
      history = [];
      historyNote = "History will show after the rider history script is run once in Supabase.";
      return;
    }
    history = data || [];
    historyNote = "";
  }

  async function load() {
    const { data: { session } } = await db.auth.getSession();
    if (recovery) { showPanel("reset"); return; }
    if (!session) {
      window.clearInterval(timer);
      stopShare();
      showPanel(panel === "work" || panel === "reset" ? "login" : panel);
      return;
    }
    if ($("#riderEmail")) $("#riderEmail").textContent = session.user.email || "";
    const { data, error } = await db.rpc("sobers_rider_orders");
    if (error) return message(error.message);
    jobs = data || [];
    const active = jobs.find((order) => order.status === "out_for_delivery");
    if (active) startShare(active.order_id);
    else if (sharingOrderId) stopShare();
    await loadHistory();
    showPanel("work");
  }

  async function update(orderId, action) {
    message(action === "start" ? "Starting delivery…" : "Marking delivered…");
    const { error } = await db.rpc("sobers_rider_update", { p_order: orderId, p_action: action });
    if (error) return message(error.message);
    if (action === "start") {
      tab = "active";
      startShare(orderId, true);
      message("Delivery started. Allow location so the customer can follow you.");
    } else if (sharingOrderId === orderId) {
      stopShare();
      tab = "jobs";
      message("Delivered. Location sharing stopped.");
    }
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
    const { error } = await db.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
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
      options: { data: { full_name: form.elements.full_name.value.trim() }, emailRedirectTo: redirectHere() }
    });
    form.elements.password.value = "";
    form.elements.confirm.value = "";
    busy(form, false);
    if (error) return message(error.message);
    message(data.session
      ? "Account created. Ask the business to add this email under Riders before jobs appear."
      : "Account created. Confirm the email if asked, then have the business add it under Riders.");
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
    message("If this email has an account, a reset link is on its way. Check the inbox and spam folder.");
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
      if (button.dataset.panel === "forgot") {
        const from = $("#riderLogin").elements.email.value.trim();
        if (from) $("#riderForgot").elements.email.value = from;
      }
      message("");
      showPanel(button.dataset.panel);
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

  document.body.addEventListener("click", (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) { tab = tabButton.dataset.tab; message(""); paint(); return; }
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    if (button.dataset.action === "share") { startShare(button.dataset.order, true); message("Requesting location…"); return; }
    update(button.dataset.order, button.dataset.action);
  });

  $("#signOut").onclick = async () => { stopShare(); recovery = false; await db.auth.signOut(); message(""); await load(); };
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installEvent = event;
    $("#installApp").hidden = false;
  });
  $("#installApp").onclick = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    installEvent = null;
    $("#installApp").hidden = true;
  };

  db.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true;
      showPanel("reset");
      message("Choose a new password.");
      return;
    }
    load();
  });
  load().then(() => { timer = window.setInterval(() => { if (panel === "work") load(); }, 15000); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
