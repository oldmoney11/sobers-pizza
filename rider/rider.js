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
    const day = theme === "day";
    const icon = day
      ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><path stroke="currentColor" stroke-width="2" d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>';
    document.querySelectorAll(".theme-toggle").forEach((button) => {
      button.innerHTML = icon;
      button.setAttribute("aria-label", day ? "Switch to night" : "Switch to day");
      button.title = button.getAttribute("aria-label");
    });
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = day ? "#f3f3f5" : "#0c0c0e";
  }
  applyTheme(localStorage.getItem("rider-theme") || "night");
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".theme-toggle")) return;
    const next = document.documentElement.dataset.theme === "day" ? "night" : "day";
    localStorage.setItem("rider-theme", next);
    applyTheme(next);
  });
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "\u0026amp;", "<": "\u0026lt;", ">": "\u0026gt;", "\"": "\u0026quot;", "'": "\u0026#39;" })[character]);
  let timer = 0;
  let sharingOrderId = null;
  let watchId = null;
  let lastOk = 0;
  let sending = false;
  let lastPosition = null;
  let map = null;
  let marker = null;
  let recovery = false;
  let panel = "login";
  let tab = "home";
  let jobs = [];
  let queue = [];
  let queueNote = "";
  let available = false;
  let history = [];
  let historyNote = "";
  let installEvent = null;
  let sessionUser = null;
  let locState = "off";
  let selectedHistory = "";
  let homeKey = "";
  let activityKey = "";
  let toastTimer = 0;
  let confirmAction = null;

  function message(text) {
    const value = text || "";
    if ($("#gateMessage")) $("#gateMessage").textContent = value;
    if ($("#riderMessage")) $("#riderMessage").textContent = value;
  }

  function toast(text) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { el.hidden = true; }, 3200);
  }

  function riderLabel() {
    const meta = (sessionUser && sessionUser.user_metadata) || {};
    return meta.full_name || meta.name || ((sessionUser && sessionUser.email) || "Rider").split("@")[0];
  }

  function money(value) { return "GH\u20b5" + Number(value || 0).toFixed(2); }

  function ageText(ms) {
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return seconds + "s ago";
    return Math.round(seconds / 60) + " min ago";
  }

  function sameDay(iso, offset) {
    const d = new Date(iso);
    const n = new Date();
    n.setDate(n.getDate() - offset);
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }

  function setPill() {
    const pill = $("#livePill");
    if (!pill) return;
    const online = navigator.onLine;
    let text = "Off shift";
    let kind = "";
    if (!online) { text = "Offline"; kind = "bad"; }
    else if (locState === "denied") { text = "Location permission required"; kind = "bad"; }
    else if (locState === "unavailable") { text = "Location unavailable"; kind = "warn"; }
    else if (locState === "paused") { text = "Location paused"; kind = "warn"; }
    else if (locState === "syncing") { text = "Syncing"; kind = "warn"; }
    else if (locState === "live") { text = "Live · " + ageText(lastOk); kind = "live"; }
    else if (sharingOrderId) { text = "Connecting"; kind = "warn"; }
    pill.textContent = text;
    pill.className = "pill" + (kind ? " " + kind : "");
    const net = $("#accountNet");
    if (net) net.textContent = online ? "Online" : "Offline";
  }

  function destroyMap() {
    if (map) { map.remove(); map = null; marker = null; }
  }

  function updateMap() {
    const host = $("#riderMap");
    if (!host || !lastPosition || !window.L) return;
    const latlng = [lastPosition.lat, lastPosition.lng];
    if (!map || map.getContainer() !== host) {
      map = window.L.map(host, { zoomControl: true, attributionControl: false }).setView(latlng, 16);
      window.L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(map);
      marker = window.L.circleMarker(latlng, { radius: 10, color: "#ffffff", weight: 3, fillColor: "#ef233c", fillOpacity: 1 }).addTo(map);
    } else {
      marker.setLatLng(latlng);
      map.panTo(latlng);
    }
    window.setTimeout(() => map.invalidateSize(), 60);
  }

  function stopShare() {
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    watchId = null;
    sharingOrderId = null;
    sending = false;
    locState = "off";
    setPill();
  }

  function startShare(orderId, force) {
    if (!orderId) return;
    if (!force && sharingOrderId === orderId && watchId != null) return;
    if (!navigator.geolocation) {
      locState = "unavailable";
      message("This phone cannot share location.");
      setPill();
      return;
    }
    if (watchId != null) navigator.geolocation.clearWatch(watchId);
    sharingOrderId = orderId;
    locState = "syncing";
    setPill();
    watchId = navigator.geolocation.watchPosition(async (position) => {
      if (sharingOrderId !== orderId) return;
      lastPosition = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      updateMap();
      const stamp = $("#locStamp");
      if (!navigator.onLine) {
        locState = "paused";
        if (stamp) stamp.textContent = "You’re offline. Location will retry when data returns.";
        setPill();
        return;
      }
      if (sending || (lastOk && Date.now() - lastOk < 15000)) {
        if (stamp && lastOk) stamp.textContent = "Last update " + ageText(lastOk);
        setPill();
        return;
      }
      sending = true;
      locState = "syncing";
      setPill();
      const { error } = await db.rpc("sobers_rider_location", {
        p_order: orderId,
        p_lat: position.coords.latitude,
        p_lng: position.coords.longitude,
        p_accuracy: position.coords.accuracy
      });
      sending = false;
      if (sharingOrderId !== orderId) return;
      if (error) {
        locState = "paused";
        message(error.message);
        if (stamp) stamp.textContent = "Location paused";
      } else {
        lastOk = Date.now();
        locState = "live";
        message("");
        if (stamp) stamp.textContent = "Last update " + ageText(lastOk);
      }
      setPill();
    }, (error) => {
      locState = error && error.code === 1 ? "denied" : "unavailable";
      message(locState === "denied"
        ? "Location access is required while delivering. Allow location for this site, then tap Share location."
        : "Location is unavailable right now.");
      setPill();
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }

  function openConfirm(title, copy, yes, action) {
    confirmAction = action;
    $("#confirmTitle").textContent = title;
    $("#confirmCopy").textContent = copy;
    $("#confirmYes").textContent = yes;
    $("#confirmSheet").classList.remove("hidden");
    $("#confirmYes").focus();
  }

  function closeConfirm() {
    confirmAction = null;
    $("#confirmSheet").classList.add("hidden");
  }

  function ticket(order, mode) {
    const phone = String(order.customer_phone || "").replace(/\D/g, "");
    const address = order.delivery_address || "";
    const status = order.status === "out_for_delivery" ? "On the way" : "Ready for pickup";
    const maps = address ? `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}" target="_blank" rel="noopener">Navigate</a>` : "";
    const call = phone ? `<a href="tel:${esc(phone)}">Call</a>` : "";
    const head = `<div class="ticket-top"><p class="kicker">${esc(order.branch_name || "Assigned")}</p><span class="chip">${esc(status)}</span></div><div class="ticket-main"><h2>${esc(order.order_number)}</h2><strong class="fare">${money(order.order_total)}</strong></div><p class="who">${esc(order.customer_name || "Customer")}</p><p class="addr">${esc(address || "No address saved")}</p>${order.customer_note ? `<p class="addr">Note: ${esc(order.customer_note)}</p>` : ""}`;
    if (mode === "active") {
      return `<article class="card active-layout"><div id="riderMap"></div><div class="ticket">${head}<p class="addr" id="locStamp">Waiting for the first location</p><div class="actions">${maps}${call}<button type="button" data-action="share" data-order="${order.order_id}">Share location</button><button class="go" type="button" data-action="ask-delivered" data-order="${order.order_id}">Mark delivered</button></div></div></article>`;
    }
    return `<article class="card ticket">${head}<div class="actions"><button class="go" type="button" data-action="ask-start" data-order="${order.order_id}">Pick up and start</button>${call}</div></article>`;
  }

  function historyCard(order) {
    const when = order.updated_at ? new Date(order.updated_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "";
    return `<button class="history-btn" type="button" data-history="${esc(order.order_id)}"><article class="card ticket"><div class="ticket-top"><p class="kicker">${esc(order.branch_name || "Sobers")}</p><span class="chip">Delivered</span></div><h2>${esc(order.order_number)}</h2><p class="who">${esc(order.customer_name || "Customer")}</p><p class="addr">${esc(order.delivery_address || "No address saved")}</p><p class="when">${esc(when)} · ${money(order.order_total)}</p></article></button>`;
  }

  function detailCard(order) {
    const when = order.updated_at ? new Date(order.updated_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "";
    return `<button class="back" type="button" id="historyBack">Back to activity</button><article class="card ticket"><div class="ticket-top"><p class="kicker">${esc(order.branch_name || "Sobers")}</p><span class="chip">Delivered</span></div><h2>${esc(order.order_number)}</h2><p class="who">${esc(order.customer_name || "Customer")}</p><p class="addr">${esc(order.delivery_address || "No address saved")}</p><p class="when">${esc(when)}</p><p class="fare">${money(order.order_total)}</p></article>`;
  }

  function paint() {
    const titles = { home: ["Now", "Home"], activity: ["Last 60 days", "Activity"], account: ["You", "Account"] };
    $("#deskKicker").textContent = titles[tab][0];
    $("#deskTitle").textContent = tab === "home" ? riderLabel() : titles[tab][1];
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("on", button.dataset.tab === tab));
    const active = jobs.filter((order) => order.status === "out_for_delivery");
    const waiting = jobs.filter((order) => order.status === "ready");
    const todayCount = history.filter((order) => sameDay(order.updated_at, 0)).length;
    setPill();
    $("#homeView").classList.toggle("hidden", tab !== "home");
    $("#activityView").classList.toggle("hidden", tab !== "activity");
    $("#accountView").classList.toggle("hidden", tab !== "account");
    const nextHome = [waiting.map((order) => order.order_id).join(), active.map((order) => order.order_id).join(), todayCount, available ? "on" : "off", queue.map((order) => order.order_id).join(), queueNote].join("|");
    if (nextHome !== homeKey) {
      destroyMap();
      homeKey = nextHome;
      $("#homeView").innerHTML = `<div class="stats"><div class="stat"><b>${todayCount}</b><span>Completed today</span></div><div class="stat"><b>${waiting.length + active.length}</b><span>Assigned now</span></div></div><article class="card"><div class="ticket-top"><p class="kicker">Availability</p><span class="chip ${available ? "live" : ""}">${available ? "Online" : "Offline"}</span></div><p class="copy">${available ? "You can accept ready deliveries." : "Go online to see new deliveries. A job you already accepted stays here."}</p><button class="go" type="button" id="availabilityToggle">${available ? "Go offline" : "Go online"}</button></article>` + (queueNote ? `<p class="empty">${esc(queueNote)}</p>` : queue.length ? `<div class="board">${queue.map(offer => `<article class="card ticket"><div class="ticket-top"><p class="kicker">${esc(offer.branch_name || "Sobers")}</p><span class="chip">Ready</span></div><h2>${esc(offer.order_number)}</h2><p class="addr">${esc(offer.delivery_address || "Address not saved")}</p><p class="fare">${money(offer.order_total)}</p><div class="actions"><button class="go" type="button" data-action="accept" data-order="${offer.order_id}">Accept delivery</button></div></article>`).join("")}</div>` : (available ? `<p class="empty">No delivery is waiting. A ready order with no rider shows here.</p>` : "")) + (active.length
        ? ticket(active[0], "active")
        : waiting.length
          ? `<div class="board">${waiting.map((order) => ticket(order, "job")).join("")}</div>`
          : (!queue.length ? `<p class="empty">No delivery is assigned. A job appears here when you accept it, or when the branch assigns it to you.</p>` : ""));
    }
    const nextActivity = selectedHistory + "|" + history.map((order) => order.order_id).join() + "|" + historyNote;
    if (nextActivity !== activityKey) {
      activityKey = nextActivity;
      if (historyNote) $("#activityView").innerHTML = `<p class="empty">${esc(historyNote)}</p>`;
      else if (selectedHistory) {
        const order = history.find((item) => item.order_id === selectedHistory);
        $("#activityView").innerHTML = order ? detailCard(order) : `<button class="back" type="button" id="historyBack">Back</button><p class="empty">That delivery is no longer in this list.</p>`;
      } else if (!history.length) $("#activityView").innerHTML = `<p class="empty">Completed deliveries from the last 60 days show here.</p>`;
      else {
        const buckets = [
          ["Today", history.filter((order) => sameDay(order.updated_at, 0))],
          ["Yesterday", history.filter((order) => sameDay(order.updated_at, 1))],
          ["Earlier", history.filter((order) => !sameDay(order.updated_at, 0) && !sameDay(order.updated_at, 1))]
        ];
        $("#activityView").innerHTML = buckets.filter(([, rows]) => rows.length).map(([name, rows]) => `<section class="group"><h3>${name}</h3><div class="board">${rows.map(historyCard).join("")}</div></section>`).join("");
      }
    }
    if (tab === "home" && active.length) updateMap();
    if ($("#riderName")) $("#riderName").textContent = riderLabel();
    if ($("#riderEmail") && sessionUser) $("#riderEmail").textContent = sessionUser.email || "";
    const status = $("#accountStatus");
    if (status) status.textContent = active.length ? "On a delivery" : available ? "Online" : "Offline";
    const phoneLine = $("#riderPhone");
    if (phoneLine) phoneLine.textContent = riderPhone || "Not saved";
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

  async function loadQueue() {
    const { data, error } = await db.rpc("sobers_rider_queue");
    if (error) {
      queue = [];
      queueNote = /sobers_rider_queue|schema cache|does not exist/i.test(error.message)
        ? "Dispatch opens after the dispatch SQL is run once in Supabase."
        : error.message;
      return;
    }
    queue = data || [];
    queueNote = "";
  }

  let riderPhone = "";

  async function loadProfile() {
    const { data, error } = await db.rpc("sobers_rider_profile");
    if (error || !data || !data.length) return;
    available = Boolean(data[0].is_available);
    riderPhone = data[0].phone || "";
    if (data[0].display_name && sessionUser) sessionUser.user_metadata = Object.assign({}, sessionUser.user_metadata, { full_name: data[0].display_name });
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
      sessionUser = null;
      showPanel(panel === "work" || panel === "reset" ? "login" : panel);
      return;
    }
    sessionUser = session.user;
    const { data, error } = await db.rpc("sobers_rider_orders");
    if (error) return message(navigator.onLine ? error.message : "You’re offline. We’ll retry when data returns.");
    jobs = data || [];
    const active = jobs.find((order) => order.status === "out_for_delivery");
    if (active) startShare(active.order_id);
    else if (sharingOrderId) stopShare();
    await loadHistory();
    await loadProfile();
    await loadQueue();
    showPanel("work");
  }

  async function update(orderId, action) {
    message(action === "start" ? "Starting delivery…" : "Marking delivered…");
    const { error } = await db.rpc("sobers_rider_update", { p_order: orderId, p_action: action });
    if (error) return message(error.message);
    homeKey = "";
    if (action === "start") {
      tab = "home";
      startShare(orderId, true);
      message("");
      toast("Delivery started. Keep this app open while you ride.");
    } else {
      stopShare();
      destroyMap();
      lastPosition = null;
      tab = "home";
      message("");
      toast("Delivery completed.");
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
    if (error) return message(error.message === "Invalid login credentials" ? "Email or password is not correct." : error.message);
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
      options: { data: { full_name: form.elements.full_name.value.trim(), phone: form.elements.phone.value.trim() }, emailRedirectTo: redirectHere() }
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

  document.body.addEventListener("click", async (event) => {
    const tabButton = event.target.closest("[data-tab]");
    if (tabButton) { tab = tabButton.dataset.tab; selectedHistory = ""; message(""); paint(); return; }
    if (event.target.id === "availabilityToggle") {
      const next = !available;
      message(next ? "Going online…" : "Going offline…");
      const { data, error } = await db.rpc("sobers_rider_availability", { p_available: next });
      if (error) return message(error.message);
      available = Boolean(data);
      message("");
      homeKey = "";
      await load();
      return;
    }
    if (event.target.id === "historyBack") { selectedHistory = ""; paint(); return; }
    const historyButton = event.target.closest("[data-history]");
    if (historyButton && tab === "activity" && !selectedHistory) {
      selectedHistory = historyButton.dataset.history;
      paint();
      return;
    }
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const orderId = button.dataset.order;
    if (button.dataset.action === "ask-start") {
      openConfirm("Start this delivery?", "Your location will be shared while this delivery is active so the customer can track you.", "Pick up and start", () => update(orderId, "start"));
      return;
    }
    if (button.dataset.action === "ask-delivered") {
      openConfirm("Confirm this order has been delivered?", "Location sharing stops after you confirm.", "Confirm delivery", () => update(orderId, "delivered"));
      return;
    }
    if (button.dataset.action === "accept") {
      button.disabled = true;
      message("Accepting…");
      const { error } = await db.rpc("sobers_rider_accept", { p_order: orderId });
      message(error ? error.message : "");
      if (!error) toast("Delivery accepted. Pick it up when you have the order.");
      homeKey = "";
      await load();
      return;
    }
    if (button.dataset.action === "share") {
      startShare(orderId, true);
      message("Requesting location…");
    }
  });

  $("#confirmNo").onclick = closeConfirm;
  $("#confirmYes").onclick = () => {
    const action = confirmAction;
    closeConfirm();
    if (action) action();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeConfirm();
  });

  $("#signOut").onclick = async () => {
    stopShare();
    destroyMap();
    recovery = false;
    await db.auth.signOut();
    message("");
    await load();
  };
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

  function net() {
    const bar = $("#netBar");
    if (bar) bar.hidden = navigator.onLine;
    setPill();
  }
  window.addEventListener("online", () => { net(); if (panel === "work") load(); });
  window.addEventListener("offline", net);
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then((result) => {
      const el = $("#permState");
      if (!el) return;
      const label = () => result.state === "granted" ? "Allowed" : result.state === "denied" ? "Blocked" : "Not asked yet";
      el.textContent = label();
      result.onchange = () => { el.textContent = label(); };
    }).catch(() => {});
  }

  db.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recovery = true;
      showPanel("reset");
      message("Choose a new password.");
      return;
    }
    if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") load();
  });
  net();
  timer = window.setInterval(() => { if (panel === "work") load(); }, 20000);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
})();
