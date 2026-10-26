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
  let approval = "";
  let history = [];
  let historyNote = "";
  let installEvent = null;
  let sessionUser = null;
  let locState = "off";
  let selectedHistory = "";
  let homeKey = "";
  let activityKey = "";
  let inboxKey = "";
  let toastTimer = 0;
  let confirmAction = null;
  let audioCtx = null;
  let ringTimer = 0;
  const seenKey = "sobers-rider-seen";
  const inboxKeyName = "sobers-rider-inbox";

  function stored(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (error) { return []; }
  }
  function saveStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function unlockAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }
  function stopRing() {
    window.clearTimeout(ringTimer);
    ringTimer = 0;
    if (navigator.vibrate) navigator.vibrate(0);
  }
  function ringMuted() {
    return localStorage.getItem("sobers-rider-ring") === "off";
  }
  function setRingMuted(off) {
    localStorage.setItem("sobers-rider-ring", off ? "off" : "on");
    if (off) stopRing();
    homeKey = "";
    paint();
    toast(off ? "Ring is off. New orders still show in Inbox." : "Ring is on for new orders.");
  }
  function ringForTenSeconds() {
    if (ringMuted()) return;
    unlockAudio();
    stopRing();
    const started = Date.now();
    const beep = () => {
      if (Date.now() - started >= 10000) return;
      if (audioCtx && audioCtx.state === "running") {
        const tone = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        tone.type = "square";
        tone.frequency.setValueAtTime(880, audioCtx.currentTime);
        tone.frequency.setValueAtTime(660, audioCtx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, audioCtx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.36);
        tone.connect(gain);
        gain.connect(audioCtx.destination);
        tone.start();
        tone.stop(audioCtx.currentTime + 0.4);
      }
      ringTimer = window.setTimeout(beep, 700);
    };
    beep();
    if (navigator.vibrate) navigator.vibrate([500, 200, 500, 200, 500, 200, 800]);
  }
  function pushInbox(order) {
    const items = stored(inboxKeyName).filter((item) => item.id !== order.order_id);
    items.unshift({
      id: order.order_id,
      title: "New delivery " + (order.order_number || ""),
      body: (order.branch_name || "Sobers") + " · " + (order.delivery_address || "Address on the order"),
      at: new Date().toISOString(),
      read: false
    });
    saveStore(inboxKeyName, items.slice(0, 40));
    inboxKey = "";
  }
  function unreadCount() {
    return stored(inboxKeyName).filter((item) => !item.read).length;
  }
  function noticeNewOrders() {
    if (!available || (approval !== "approved" && approval !== "legacy")) return;
    const seen = stored(seenKey);
    const fresh = queue.filter((order) => order.order_id && !seen.includes(order.order_id));
    if (!fresh.length) return;
    saveStore(seenKey, seen.concat(fresh.map((order) => order.order_id)).slice(-200));
    fresh.forEach(pushInbox);
    ringForTenSeconds();
    const first = fresh[0];
    toast(fresh.length === 1 ? "New order " + (first.order_number || "") : fresh.length + " new orders");
    if (window.Notification && Notification.permission === "granted") {
      fresh.slice(0, 3).forEach((order) => {
        new Notification("Sobers delivery", { body: (order.order_number || "New order") + " is ready", tag: order.order_id });
      });
    }
  }

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
      map = window.L.map(host, { zoomControl: true, attributionControl: true }).setView(latlng, 16);
      window.L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
        maxZoom: 16,
        attribution: "Tiles &copy; Esri — Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
      }).addTo(map);
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
    return `<button class="back" type="button" id="historyBack">Back to earnings</button><article class="card ticket"><div class="ticket-top"><p class="kicker">${esc(order.branch_name || "Sobers")}</p><span class="chip">Delivered</span></div><h2>${esc(order.order_number)}</h2><p class="who">${esc(order.customer_name || "Customer")}</p><p class="addr">${esc(order.delivery_address || "No address saved")}</p><p class="when">${esc(when)}</p><p class="fare">${money(order.order_total)}</p></article>`;
  }

  function availabilityCard() {
    if (available) {
      return `<article class="card"><div class="ticket-top"><p class="kicker">Availability</p><span class="chip live">Online</span></div><p class="copy">You can accept ready deliveries. ${ringMuted() ? "The ring is silenced. New orders still appear here and in Inbox." : "A new order rings for 10 seconds."}</p><button class="ghost" type="button" id="availabilityToggle">Go offline</button><button class="text" type="button" id="silenceRing">${ringMuted() ? "Turn ring on" : "Silence ring"}</button></article>`;
    }
    return `<article class="card live-call"><p class="kicker">Your shift</p><div class="point" aria-hidden="true"><i></i><i></i><i></i></div><button class="go go-live" type="button" id="availabilityToggle">Go online</button><p class="copy">${ringMuted() ? "The ring is off. You can turn it on below." : "Tap this. A new order rings for 10 seconds."}</p><button class="text" type="button" id="silenceRing">${ringMuted() ? "Turn ring on" : "Silence ring"}</button></article>`;
  }

  function sum(rows) {
    return rows.reduce((total, order) => total + Number(order.order_total || 0), 0);
  }

  function reward(label, done, goal) {
    return `<article class="reward ${done >= goal ? "on" : ""}"><b>${done >= goal ? "Unlocked" : "Locked"}</b><span>${esc(label)}</span></article>`;
  }

  function paintEarnings(activeCount) {
    const host = $("#earningsView");
    if (!host) return;
    const today = history.filter((order) => sameDay(order.updated_at, 0));
    const week = history.filter((order) => Date.now() - Date.parse(order.updated_at) < 7 * 86400000);
    const done = history.length;
    const list = selectedHistory
      ? ""
      : historyNote
        ? `<p class="empty">${esc(historyNote)}</p>`
        : !history.length
          ? `<p class="empty">Completed deliveries from the last 60 days show here.</p>`
          : [["Today", today], ["Yesterday", history.filter((order) => sameDay(order.updated_at, 1))], ["Earlier", history.filter((order) => !sameDay(order.updated_at, 0) && !sameDay(order.updated_at, 1))]]
            .filter(([, rows]) => rows.length)
            .map(([name, rows]) => `<section class="group"><h3>${name}</h3><div class="board">${rows.map(historyCard).join("")}</div></section>`)
            .join("");
    const detail = selectedHistory
      ? (() => {
        const order = history.find((item) => item.order_id === selectedHistory);
        return order ? detailCard(order) : `<button class="back" type="button" id="historyBack">Back</button><p class="empty">That delivery is no longer in this list.</p>`;
      })()
      : "";
    host.innerHTML = detail || `<div class="stats"><div class="stat"><b>${money(sum(today))}</b><span>Delivered today</span></div><div class="stat"><b>${money(sum(week))}</b><span>Last 7 days</span></div></div><article class="card"><p class="kicker">Recognition</p><h2>${done} completed</h2><p class="copy">These marks count finished deliveries. They are not cash bonuses.</p><div class="reward-row">${reward("First delivery", done, 1)}${reward("5 deliveries", done, 5)}${reward("10 deliveries", done, 10)}${reward("25 deliveries", done, 25)}</div></article><p class="copy">Assigned right now: ${activeCount}. The amounts are the order totals you delivered.</p>${list}`;
  }

  function paintInbox() {
    const host = $("#inboxView");
    if (!host) return;
    const items = stored(inboxKeyName);
    host.innerHTML = items.length
      ? `<button class="ghost" type="button" id="clearInbox">Clear inbox</button>` + items.map((item) => `<article class="card"><p class="kicker">${item.read ? "Seen" : "New"}</p><h2>${esc(item.title)}</h2><p class="copy">${esc(item.body)}</p><p class="when">${esc(item.at ? new Date(item.at).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "")}</p></article>`).join("")
      : `<p class="empty">New ready orders appear here while you are online, with a 10-second ring.</p>`;
  }

  function paint() {
    const titles = {
      home: ["Now", "Home"],
      discover: ["Two kitchens", "Discover"],
      earnings: ["Last 60 days", "Earnings"],
      inbox: ["Alerts", "Inbox"],
      menu: ["You", "Menu"],
      safety: ["On the road", "Safety"],
      help: ["How a run works", "Help"]
    };
    const title = titles[tab] || titles.home;
    $("#deskKicker").textContent = title[0];
    $("#deskTitle").textContent = tab === "home" ? riderLabel() : title[1];
    document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("on", button.dataset.tab === tab));
    const active = jobs.filter((order) => order.status === "out_for_delivery");
    const waiting = jobs.filter((order) => order.status === "ready");
    const todayCount = history.filter((order) => sameDay(order.updated_at, 0)).length;
    setPill();
    ["home", "discover", "earnings", "inbox", "menu", "safety", "help"].forEach((name) => {
      const view = document.getElementById(name + "View");
      if (view) view.classList.toggle("hidden", tab !== name);
    });
    const nextHome = [waiting.map((order) => order.order_id).join(), active.map((order) => order.order_id).join(), todayCount, available ? "on" : "off", approval, queue.map((order) => order.order_id).join(), queueNote].join("|");
    if (nextHome !== homeKey) {
      destroyMap();
      homeKey = nextHome;
      const blocked = approval !== "approved" && approval !== "legacy";
      $("#homeView").innerHTML = blocked
        ? `<article class="card"><p class="kicker">Application</p><h2>${esc(approvalLabel(approval))}</h2><p class="copy">${esc(approvalCopy(approval))}</p></article>`
        : `<div class="stats"><div class="stat"><b>${todayCount}</b><span>Completed today</span></div><div class="stat"><b>${waiting.length + active.length}</b><span>Assigned now</span></div></div>${availabilityCard()}` + (queueNote ? `<p class="empty">${esc(queueNote)}</p>` : queue.length ? `<div class="board">${queue.map(offer => `<article class="card ticket"><div class="ticket-top"><p class="kicker">${esc(offer.branch_name || "Sobers")}</p><span class="chip">Ready</span></div><h2>${esc(offer.order_number)}</h2><p class="addr">${esc(offer.delivery_address || "Address not saved")}</p><p class="fare">${money(offer.order_total)}</p><div class="actions"><button class="go" type="button" data-action="accept" data-order="${offer.order_id}">Accept order</button></div></article>`).join("")}</div>` : (available ? `<p class="empty">No delivery is waiting. A ready order with no rider shows here.</p>` : "")) + (active.length
        ? ticket(active[0], "active")
        : waiting.length
          ? `<div class="board">${waiting.map((order) => ticket(order, "job")).join("")}</div>`
          : (!queue.length ? `<p class="empty">No delivery is assigned. A job appears here when you accept it.</p>` : ""));
    }
    const nextActivity = selectedHistory + "|" + history.map((order) => order.order_id).join() + "|" + historyNote;
    if (tab === "earnings" && nextActivity !== activityKey) {
      activityKey = nextActivity;
      paintEarnings(waiting.length + active.length);
    }
    const nextInbox = stored(inboxKeyName).map((item) => item.id + (item.read ? "1" : "0")).join();
    if (tab === "inbox" && nextInbox !== inboxKey) {
      inboxKey = nextInbox;
      paintInbox();
    }
    const count = unreadCount();
    document.querySelectorAll(".inbox-count").forEach((badge) => {
      badge.hidden = count === 0;
      badge.textContent = count > 9 ? "9+" : String(count);
    });
    if (tab === "home" && active.length) updateMap();
    if ($("#riderName")) $("#riderName").textContent = riderLabel();
    if ($("#riderEmail") && sessionUser) $("#riderEmail").textContent = sessionUser.email || "";
    const status = $("#accountStatus");
    if (status) status.textContent = approval && approval !== "approved" && approval !== "legacy" ? approvalLabel(approval) : active.length ? "On a delivery" : available ? "Online" : "Offline";
    const phoneLine = $("#riderPhone");
    if (phoneLine) phoneLine.textContent = riderPhone || "Not saved";
    const ringButton = $("#silenceRingMenu");
    if (ringButton) ringButton.textContent = ringMuted() ? "Off" : "On";
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
      queueNote = error.message;
      return;
    }
    queue = data || [];
    queueNote = "";
  }

  let riderPhone = "";

  function approvalLabel(status) {
    if (status === "pending") return "Pending approval";
    if (status === "rejected") return "Not approved";
    if (status === "suspended") return "Suspended";
    if (status === "approved") return "Approved";
    return "Application not received";
  }
  function approvalCopy(status) {
    if (status === "pending") return "Sobers has your application. You can go online after it is approved.";
    if (status === "rejected") return "This business did not approve the application. You cannot take deliveries.";
    if (status === "suspended") return "This business has paused your deliveries. You cannot go online until you are reactivated.";
    return "Sign in again after the rider application is in the database.";
  }
  function missingRiderFunction(error) {
    return /could not find|does not exist|schema cache/i.test(error?.message || "");
  }
  async function submitApplication() {
    const { data, error } = await db.rpc("sobers_submit_rider_application", { p_business_slug: "sobers-pizza" });
    if (error) return { error: missingRiderFunction(error) ? "legacy" : error.message };
    return { status: data || "" };
  }
  async function loadAccess() {
    const { data, error } = await db.rpc("sobers_my_rider_status");
    if (error) {
      approval = missingRiderFunction(error) ? "legacy" : "";
      if (!approval) available = false;
      return;
    }
    const row = (data || []).find((item) => item.business_slug === "sobers-pizza") || (data || [])[0];
    if (!row) {
      approval = "";
      available = false;
      return;
    }
    approval = row.approval_status || "";
    riderPhone = row.phone || "";
    if (row.display_name && sessionUser) sessionUser.user_metadata = Object.assign({}, sessionUser.user_metadata, { full_name: row.display_name });
    available = approval === "approved" && Boolean(row.is_available);
  }

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
    let applicationError = "";
    await loadAccess();
    if (!approval) {
      const submitted = await submitApplication();
      if (submitted.error === "legacy") approval = "legacy";
      else if (submitted.error) applicationError = submitted.error;
      else await loadAccess();
    }
    if (approval === "legacy") await loadProfile();
    const { data, error } = await db.rpc("sobers_rider_orders");
    if (error) {
      jobs = [];
      showPanel("work");
      return message(applicationError || (navigator.onLine ? error.message : "You’re offline. We’ll retry when data returns."));
    }
    jobs = data || [];
    const active = jobs.find((order) => order.status === "out_for_delivery");
    if (active) startShare(active.order_id);
    else if (sharingOrderId) stopShare();
    await loadHistory();
    await loadQueue();
    noticeNewOrders();
    showPanel("work");
    if (applicationError && !approval) message(applicationError);
    else if (approval && approval !== "approved" && approval !== "legacy") message("");
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
      options: {
        data: {
          full_name: form.elements.full_name.value.trim(),
          phone: form.elements.phone.value.trim(),
          account_type: "rider",
          business_slug: "sobers-pizza"
        },
        emailRedirectTo: redirectHere()
      }
    });
    form.elements.password.value = "";
    form.elements.confirm.value = "";
    busy(form, false);
    if (error) return message(error.message);
    await load();
    if (!data.session) message("Account created. Confirm the email if asked, then sign in. Deliveries stay locked until Sobers approves you.");
    else if (approval) message("");
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
    if (tabButton) {
      tab = tabButton.dataset.tab;
      selectedHistory = "";
      if (tab === "inbox") {
        saveStore(inboxKeyName, stored(inboxKeyName).map((item) => Object.assign({}, item, { read: true })));
        inboxKey = "";
      }
      message("");
      paint();
      return;
    }
    if (event.target.id === "clearInbox") {
      saveStore(inboxKeyName, []);
      inboxKey = "";
      paint();
      return;
    }
    if (event.target.id === "silenceRing" || event.target.id === "silenceRingMenu") {
      setRingMuted(!ringMuted());
      return;
    }
    if (event.target.id === "availabilityToggle") {
      unlockAudio();
      if (window.Notification && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      if (approval !== "approved" && approval !== "legacy") return message(approvalCopy(approval));
      const next = !available;
      if (!next) stopRing();
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
    if (historyButton && tab === "earnings" && !selectedHistory) {
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
      if (approval !== "approved" && approval !== "legacy") return message(approvalCopy(approval));
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
    stopRing();
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
