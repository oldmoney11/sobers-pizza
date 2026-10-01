(function () {
  "use strict";

  const SUPABASE_URL = "https://inthadecmxmbqexufzpe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
  const PENDING_KEY = "sobersPendingDatabaseOrders";
  const CUSTOMER_ORDERS_KEY = "sobersCustomerOrdersV1";

  function customerOrders() {
    try {
      const value = JSON.parse(localStorage.getItem(CUSTOMER_ORDERS_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) { return []; }
  }

  function saveCustomerOrder(receipt) {
    const orders = customerOrders();
    const index = orders.findIndex(item => item.client_request_id === receipt.client_request_id);
    if (index >= 0) orders[index] = { ...orders[index], ...receipt };
    else orders.push(receipt);
    localStorage.setItem(CUSTOMER_ORDERS_KEY, JSON.stringify(orders.slice(-50)));
    window.dispatchEvent(new CustomEvent("sobers:orders-updated", { detail: receipt }));
  }

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
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_public_order_v2`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${customerToken || SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(order),
      keepalive: true,
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
      const saved = Array.isArray(result) ? result[0] : result;
      saveCustomerOrder({
        client_request_id: order.client_request_id,
        id: saved?.order_id || null,
        order_number: saved?.order_number || order.client_request_id,
        total: Number(saved?.order_total || 0),
        status: "new",
        synced: true,
      });
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

  window.SobersPlatformOrders = { submit, retryPending, saveCustomerOrder };
  window.addEventListener("online", retryPending);
  window.addEventListener("load", retryPending);
})();
