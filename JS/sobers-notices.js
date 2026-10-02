document.addEventListener("DOMContentLoaded", () => {
  const board = document.querySelector("#notices");
  const list = document.querySelector("#spNoticeList");
  if (!board || !list) return;
  const api = "https://inthadecmxmbqexufzpe.supabase.co";
  const key = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[char]));
  const safeUrl = value => { try { const url = new URL(value, location.href); return ["http:","https:","tel:","mailto:"].includes(url.protocol) ? url.href : ""; } catch (_) { return ""; } };
  const readIds = name => { try { return new Set(JSON.parse(localStorage.getItem(name) || "[]")); } catch (_) { return new Set(); } };
  const saveIds = (name, values) => localStorage.setItem(name, JSON.stringify([...values].slice(-60)));
  const dismissed = readIds("sobersDismissedNotices");
  const seen = readIds("sobersSeenNoticesV2");
  let currentNotices = [];
  let loading = false;

  function updateCount() {
    const unread = currentNotices.filter(item => !seen.has(item.id)).length;
    document.querySelectorAll("[data-notice-count]").forEach(badge => {
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.hidden = unread === 0;
      badge.setAttribute("aria-label", `${unread} unread Sobers ${unread === 1 ? "notice" : "notices"}`);
    });
    window.dispatchEvent(new CustomEvent("sobers:notices-updated", { detail: { unread, notices: currentNotices } }));
  }
  function markSeen() {
    currentNotices.forEach(item => seen.add(item.id));
    saveIds("sobersSeenNoticesV2", seen);
    updateCount();
  }
  async function showDeviceAlert(item) {
    if (!item || !("Notification" in window) || Notification.permission !== "granted") return;
    const alerted = readIds("sobersAlertedNoticesV2");
    if (alerted.has(item.id)) return;
    try {
      const options = { body: item.body, icon: "./assets/logo/favicon-192.png", badge: "./assets/logo/favicon-192.png", tag: `sobers-notice-${item.id}`, data: { url: "./#notices" } };
      const registration = await navigator.serviceWorker?.ready;
      if (registration) await registration.showNotification(item.title, options);
      else new Notification(item.title, options);
      alerted.add(item.id); saveIds("sobersAlertedNoticesV2", alerted);
    } catch (error) { console.warn("Sobers alert could not be displayed:", error); }
  }
  function render() {
    const visible = currentNotices.filter(item => !dismissed.has(item.id));
    if (!visible.length) {
      list.innerHTML = '<div class="sp-notice-empty"><b>You are all caught up.</b><span>New updates from Sobers will appear here.</span></div>';
      board.hidden = currentNotices.length === 0; return;
    }
    list.innerHTML = visible.map(item => {
      const image = safeUrl(item.image_url); const action = safeUrl(item.cta_url);
      const date = item.ends_at ? `Until ${new Date(item.ends_at).toLocaleDateString()}` : "Latest update";
      return `<article class="sp-notice-card" data-kind="${esc(item.notice_type)}" data-notice-id="${esc(item.id)}"><div class="sp-notice-content"><div class="sp-notice-meta"><span>${esc(item.notice_type)}</span><span>${esc(date)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><div class="sp-notice-actions">${action && item.cta_label ? `<a href="${esc(action)}">${esc(item.cta_label)}</a>` : ""}<button class="sp-notice-dismiss" type="button" data-dismiss-notice>Dismiss</button></div></div>${image ? `<img class="sp-notice-image" src="${esc(image)}" alt="" loading="lazy" decoding="async">` : ""}</article>`;
    }).join(""); board.hidden = false;
  }
  async function loadNotices() {
    if (loading) return; loading = true;
    try {
      const businessResponse = await fetch(`${api}/rest/v1/businesses?slug=eq.sobers-pizza&status=eq.active&select=id&limit=1`, { headers, cache: "no-store" });
      if (!businessResponse.ok) throw new Error(`Business lookup failed (${businessResponse.status})`);
      const [business] = await businessResponse.json(); if (!business) throw new Error("Sobers Pizza is not active.");
      const now = new Date().toISOString();
      const query = new URLSearchParams({ business_id: `eq.${business.id}`, is_active: "eq.true", starts_at: `lte.${now}`, or: `(ends_at.is.null,ends_at.gte.${now})`, select: "id,title,body,notice_type,image_url,cta_label,cta_url,starts_at,ends_at,priority,updated_at", order: "priority.desc,starts_at.desc" });
      const response = await fetch(`${api}/rest/v1/business_notices?${query}`, { headers, cache: "no-store" });
      if (!response.ok) throw new Error(`Notice lookup failed (${response.status})`);
      currentNotices = await response.json(); render(); updateCount();
      const newestUnread = currentNotices.find(item => !seen.has(item.id)); if (newestUnread) showDeviceAlert(newestUnread);
    } catch (error) {
      console.warn("Sobers notices could not be refreshed:", error);
      list.innerHTML = '<div class="sp-notice-empty"><b>Updates could not refresh.</b><span>Please check your connection and try again.</span><button type="button" data-retry-notices>Try again</button></div>'; board.hidden = false;
    } finally { loading = false; }
  }
  list.addEventListener("click", event => {
    if (event.target.closest("[data-retry-notices]")) return loadNotices();
    const button = event.target.closest("[data-dismiss-notice]"); if (!button) return;
    const card = button.closest("[data-notice-id]"); dismissed.add(card.dataset.noticeId); saveIds("sobersDismissedNotices", dismissed); render();
  });
  document.querySelectorAll('[href="#notices"]').forEach(link => link.addEventListener("click", () => setTimeout(markSeen, 150)));
  window.SobersNotices = { refresh: loadNotices, markSeen, testNotification: () => showDeviceAlert({ id: `test-${Date.now()}`, title: "Sobers notifications are on", body: "Fresh offers and important updates can now reach you." }) };
  window.addEventListener("focus", loadNotices);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadNotices(); });
  window.setInterval(() => { if (!document.hidden) loadNotices(); }, 60000);
  loadNotices();
});
