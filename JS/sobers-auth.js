(function () {
  "use strict";
  const URL = "https://inthadecmxmbqexufzpe.supabase.co";
  const KEY = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const SESSION_KEY = "sobersCustomerAuthV1";
  const PROFILE_KEY = "sobersCustomerProfileV1";
  const FAVOURITES_KEY = "sobersCustomerFavouritesV1";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const read = (key, fallback = null) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch (_) {} };
  let session = read(SESSION_KEY);
  let mode = "signin";
  let businessId = null;

  window.SobersCustomerAuth = { getAccessToken: () => session?.access_token || null };

  async function request(path, options = {}) {
    const response = await fetch(`${URL}${path}`, {
      ...options,
      headers: { apikey: KEY, Authorization: `Bearer ${session?.access_token || KEY}`, "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.msg || body?.message || body?.error_description || "That request could not be completed.");
    return body;
  }

  async function refresh() {
    if (!session?.refresh_token) return;
    try {
      session = await request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
      write(SESSION_KEY, session);
    } catch (_) { session = null; write(SESSION_KEY, null); }
  }

  async function getBusinessId() {
    if (businessId) return businessId;
    const rows = await request("/rest/v1/businesses?slug=eq.sobers-pizza&select=id&limit=1");
    businessId = rows?.[0]?.id || null;
    return businessId;
  }

  function showAccountState() {
    const signedIn = Boolean(session?.user);
    const profile = read(PROFILE_KEY, {});
    if ($("#spAccountStatus")) $("#spAccountStatus").textContent = signedIn ? "SIGNED IN SECURELY" : "GUEST EXPERIENCE";
    if ($("#spCustomerName")) $("#spCustomerName").textContent = profile.name ? `Hi, ${profile.name.split(" ")[0]}` : "Welcome, pizza lover";
    if ($("#spAccountSummary")) $("#spAccountSummary").textContent = signedIn ? session.user.email : "Sign in only if you want synced favourites and purchase history.";
    if ($("#spAuthActionLabel")) $("#spAuthActionLabel").textContent = signedIn ? "Account connected" : "Sign in or create account";
    $("[data-auth-signout]")?.toggleAttribute("hidden", !signedIn);
  }

  function setMode(nextMode) {
    mode = nextMode;
    const dialog = $("#spAuthDialog");
    $$('[data-auth-mode]', dialog).forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
    $(".sp-auth-name", dialog).hidden = mode !== "signup";
    $("#spAuthTitle").textContent = mode === "signup" ? "Join the Sobers circle." : "Welcome back.";
    $("#spAuthSubmit").textContent = mode === "signup" ? "Create secure account" : "Sign in securely";
  }

  function openAuth() {
    if (session?.user) return;
    const dialog = $("#spAuthDialog"); dialog.hidden = false; dialog.setAttribute("aria-hidden", "false"); setMode("signin");
  }
  function closeAuth() { const dialog = $("#spAuthDialog"); dialog.hidden = true; dialog.setAttribute("aria-hidden", "true"); }

  async function loadProfile() {
    if (!session?.user) return;
    const rows = await request(`/rest/v1/customer_profiles?id=eq.${session.user.id}&select=full_name,phone,delivery_address&limit=1`);
    if (rows?.[0]) write(PROFILE_KEY, { name: rows[0].full_name || "", phone: rows[0].phone || "", address: rows[0].delivery_address || "" });
    showAccountState();
  }

  async function syncProfile() {
    if (!session?.user) return;
    const profile = read(PROFILE_KEY, {}); const prefs = read("sobersCustomerPrefsV1", {});
    await request("/rest/v1/customer_profiles?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ id: session.user.id, full_name: profile.name || "", phone: profile.phone || "", delivery_address: profile.address || "", promo_opt_in: prefs.promos !== false, location_opt_in: prefs.location === true }) });
  }

  async function loadFavourites() {
    if (!session?.user) return;
    const id = await getBusinessId();
    const rows = await request(`/rest/v1/customer_favourites?user_id=eq.${session.user.id}&business_id=eq.${id}&select=product_key,product_name,image_url,price_label`);
    const localFavourites = read(FAVOURITES_KEY, []);
    const remoteFavourites = rows.map(row => ({ key: row.product_key, name: row.product_name, image: row.image_url, price: row.price_label }));
    const favourites = [...remoteFavourites];
    localFavourites.forEach(item => { if (!favourites.some(saved => saved.key === item.key)) favourites.push(item); });
    write(FAVOURITES_KEY, favourites);
    const missingRemotely = localFavourites.filter(item => !remoteFavourites.some(saved => saved.key === item.key));
    if (missingRemotely.length) {
      await request("/rest/v1/customer_favourites?on_conflict=user_id,business_id,product_key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(missingRemotely.map(item => ({ user_id: session.user.id, business_id: id, product_key: item.key, product_name: item.name, image_url: item.image, price_label: item.price }))),
      });
    }
    $$('[data-favourite-key]').forEach(button => { const saved = favourites.some(item => item.key === button.dataset.favouriteKey); const symbol = saved ? '♥' : '♡'; button.classList.toggle('saved', saved); if (button.textContent !== symbol) button.textContent = symbol; });
  }

  async function syncFavourite(button) {
    if (!session?.user || !button) return;
    const id = await getBusinessId(); const saved = button.classList.contains("saved");
    const item = { user_id: session.user.id, business_id: id, product_key: button.dataset.favouriteKey, product_name: button.dataset.name, image_url: button.dataset.image, price_label: button.dataset.price };
    if (saved) await request("/rest/v1/customer_favourites?on_conflict=user_id,business_id,product_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(item) });
    else await request(`/rest/v1/customer_favourites?user_id=eq.${session.user.id}&business_id=eq.${id}&product_key=eq.${encodeURIComponent(item.product_key)}`, { method: "DELETE" });
  }

  async function renderOrders(tab) {
    if (!session?.user || !["active", "history"].includes(tab)) return;
    const host = $("#spPurchaseContent");
    host.innerHTML = '<div class="sp-empty-state"><span>◌</span><h3>Loading purchases…</h3></div>';
    try {
      const statuses = tab === "active" ? "new,confirmed,preparing,ready" : "completed,cancelled";
      const remoteOrders = await request(`/rest/v1/platform_orders?customer_user_id=eq.${session.user.id}&status=in.(${statuses})&select=id,order_number,client_request_id,status,total,created_at,fulfilment&order=created_at.desc&limit=30`);
      const localOrders = window.SobersPurchases?.getLocalOrders?.() || [];
      const allOrders = [...localOrders];
      remoteOrders.forEach(remote => {
        const index = allOrders.findIndex(local => local.id === remote.id || (remote.client_request_id && local.client_request_id === remote.client_request_id));
        if (index >= 0) allOrders[index] = { ...allOrders[index], ...remote, synced: true };
        else allOrders.push({ ...remote, synced: true });
      });
      write("sobersCustomerOrdersV1", allOrders);
      window.SobersPurchases?.render?.(tab);
    } catch (error) { host.innerHTML = `<div class="sp-empty-state"><span>!</span><h3>Could not load purchases</h3><p>${String(error.message ?? "Could not load purchases").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"})[c])}</p></div>`; }
  }

  async function syncRemoteOrders() {
    if (!session?.user) return;
    const remoteOrders = await request(`/rest/v1/platform_orders?customer_user_id=eq.${session.user.id}&select=id,order_number,client_request_id,status,total,created_at,fulfilment&order=created_at.desc&limit=100`);
    const allOrders = [...(window.SobersPurchases?.getLocalOrders?.() || [])];
    remoteOrders.forEach(remote => {
      const index = allOrders.findIndex(local => local.id === remote.id || (remote.client_request_id && local.client_request_id === remote.client_request_id));
      if (index >= 0) allOrders[index] = { ...allOrders[index], ...remote, synced: true };
      else allOrders.push({ ...remote, synced: true });
    });
    write("sobersCustomerOrdersV1", allOrders);
    window.dispatchEvent(new CustomEvent("sobers:orders-updated"));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    $("[data-auth-open]")?.addEventListener("click", openAuth);
    $("[data-auth-close]")?.addEventListener("click", closeAuth);
    $$('[data-auth-mode]').forEach(button => button.addEventListener("click", () => setMode(button.dataset.authMode)));
    $("#spAuthForm")?.addEventListener("submit", async event => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const message = $("#spAuthMessage"); message.className = ""; message.textContent = "Please wait…";
      try {
        if (mode === "signup") {
          const result = await request("/auth/v1/signup", { method: "POST", body: JSON.stringify({ email: String(data.get("email")).trim(), password: String(data.get("password")), data: { full_name: String(data.get("full_name") || "").trim() } }) });
          if (!result.access_token) { message.className = "sp-auth-success"; message.textContent = "Account created. Confirm the email, then sign in."; setMode("signin"); return; }
          session = result; write(PROFILE_KEY, { name: String(data.get("full_name") || "").trim(), phone: "", address: "" });
        } else session = await request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: String(data.get("email")).trim(), password: String(data.get("password")) }) });
        write(SESSION_KEY, session); await loadProfile(); await loadFavourites(); await syncRemoteOrders(); closeAuth(); showAccountState();
      } catch (error) { message.className = "sp-auth-error"; message.textContent = error.message; }
    });
    $("[data-auth-signout]")?.addEventListener("click", async () => { try { await request("/auth/v1/logout", { method: "POST" }); } catch (_) {} session = null; write(SESSION_KEY, null); showAccountState(); });
    $("#spProfileDialog form")?.addEventListener("submit", () => setTimeout(() => syncProfile().catch(console.warn), 0));
    $("#spMenuGrid")?.addEventListener("click", event => { const heart = event.target.closest("[data-favourite-key]"); if (heart) setTimeout(() => syncFavourite(heart).catch(console.warn), 0); }, true);
    $$('[data-purchase-tab]').forEach(button => button.addEventListener("click", () => setTimeout(() => renderOrders(button.dataset.purchaseTab), 0)));
    $("[data-customer-panel='purchases']")?.addEventListener("click", () => setTimeout(() => renderOrders("active"), 0));
    $("[data-customer-panel='rewards']")?.addEventListener("click", () => syncRemoteOrders().catch(console.warn));
    window.SobersAuth = { syncOrders: () => syncRemoteOrders() };
    await refresh(); showAccountState(); if (session?.user) { await loadProfile().catch(console.warn); await loadFavourites().catch(console.warn); await syncRemoteOrders().catch(console.warn); }
  });
})();
