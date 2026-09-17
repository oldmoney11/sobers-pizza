document.addEventListener("DOMContentLoaded", () => {
  const board = document.querySelector("#notices");
  const list = document.querySelector("#spNoticeList");
  if (!board || !list) return;

  const api = "https://inthadecmxmbqexufzpe.supabase.co";
  const key = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const esc = value => String(value ?? "").replace(/[&<>\"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[char]));
  const safeUrl = value => { try { const url = new URL(value, location.href); return ["http:","https:","tel:","mailto:"].includes(url.protocol) ? url.href : ""; } catch (_) { return ""; } };
  const dismissed = new Set(JSON.parse(localStorage.getItem("sobersDismissedNotices") || "[]"));

  async function loadNotices() {
    try {
      const headers = { apikey:key, Authorization:`Bearer ${key}` };
      const businessResponse = await fetch(`${api}/rest/v1/businesses?slug=eq.sobers-pizza&status=eq.active&select=id&limit=1`, {headers,cache:"no-store"});
      const [business] = businessResponse.ok ? await businessResponse.json() : [];
      if (!business) return;
      const now = new Date().toISOString();
      const response = await fetch(`${api}/rest/v1/business_notices?business_id=eq.${business.id}&is_active=eq.true&starts_at=lte.${encodeURIComponent(now)}&or=(ends_at.is.null,ends_at.gte.${encodeURIComponent(now)})&select=id,title,body,notice_type,image_url,cta_label,cta_url,starts_at,ends_at,priority&order=priority.desc,starts_at.desc`, {headers,cache:"no-store"});
      if (!response.ok) return;
      const notices = (await response.json()).filter(item => !dismissed.has(item.id));
      if (!notices.length) return;
      list.innerHTML = notices.map(item => {
        const image = safeUrl(item.image_url);
        const action = safeUrl(item.cta_url);
        const date = item.ends_at ? `Until ${new Date(item.ends_at).toLocaleDateString()}` : "Latest update";
        return `<article class="sp-notice-card" data-kind="${esc(item.notice_type)}" data-notice-id="${esc(item.id)}"><div class="sp-notice-content"><div class="sp-notice-meta"><span>${esc(item.notice_type)}</span><span>${esc(date)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p><div class="sp-notice-actions">${action && item.cta_label ? `<a href="${esc(action)}">${esc(item.cta_label)}</a>` : ""}<button class="sp-notice-dismiss" type="button" data-dismiss-notice>Dismiss</button></div></div>${image ? `<img class="sp-notice-image" src="${esc(image)}" alt="">` : ""}</article>`;
      }).join("");
      board.hidden = false;
    } catch (error) { console.warn("Sobers notices could not be refreshed."); }
  }

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-dismiss-notice]");
    if (!button) return;
    const card = button.closest("[data-notice-id]");
    dismissed.add(card.dataset.noticeId);
    localStorage.setItem("sobersDismissedNotices", JSON.stringify([...dismissed].slice(-30)));
    card.remove();
    if (!list.children.length) board.hidden = true;
  });
  loadNotices();
});
