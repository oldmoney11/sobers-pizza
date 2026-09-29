(function () {
  "use strict";

  const SUPABASE_URL = "https://inthadecmxmbqexufzpe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const PENDING_KEY = "sobersPendingDatabaseOrders";

  function pendingOrders() {
    try {
      const value = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function savePending(orders) {
    localStorage.setItem(PENDING_KEY, JSON.stringify(orders.slice(-20)));
  }

  function queueOfflineOrder(order) {
    const queued = pendingOrders();
    const fingerprint = JSON.stringify(order);
    if (!queued.some((item) => JSON.stringify(item) === fingerprint)) {
      queued.push(order);
      savePending(queued);
    }
  }

  async function send(order) {
    const customerToken = window.SobersCustomerAuth?.getAccessToken?.();
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_order`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${customerToken || SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(order),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.message || "The online order could not be saved.");
    }
    return body;
  }

  async function submit(order) {
    if (navigator.onLine === false) {
      queueOfflineOrder(order);
      return { saved: false, queued: true, result: null };
    }

    try {
      const result = await send(order);
      return { saved: true, result };
    } catch (error) {
      // Do not automatically retry an ambiguous online failure. The server may
      // have accepted the request even when its response did not reach us.
      console.warn("Sobers online order save could not be confirmed:", error);
      return { saved: false, queued: false, result: null };
    }
  }

  async function retryPending() {
    const queued = pendingOrders();
    if (!queued.length) return;

    const remaining = [];
    for (const order of queued) {
      try {
        await send(order);
      } catch (error) {
        remaining.push(order);
      }
    }
    savePending(remaining);
  }

  window.SobersPlatformOrders = { submit, retryPending };
  window.addEventListener("online", retryPending);
  window.addEventListener("load", retryPending);
})();
