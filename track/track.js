(() => {
  'use strict';
  const url = 'https://inthadecmxmbqexufzpe.supabase.co';
  const key = 'sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const money = (value) => `GH₵${Number(value || 0).toFixed(2)}`;
  const statuses = ['new','confirmed','preparing','ready','completed'];

  $('#trackForm').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const button = event.currentTarget.querySelector('button');
    button.disabled = true; $('#trackMessage').textContent = 'Checking your order…'; $('#receipt').classList.add('hidden');
    try {
      const response = await fetch(`${url}/rest/v1/rpc/track_public_order`, {
        method: 'POST',
        headers: { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ p_business_slug:'sobers-pizza', p_order_number:String(form.get('order_number')).trim(), p_customer_phone:String(form.get('customer_phone')).trim() })
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order?.message || 'Tracking is temporarily unavailable.');
      if (!order) throw new Error('No matching order was found. Check the reference and phone number.');
      const current = order.status === 'cancelled' ? -1 : statuses.indexOf(order.status);
      $('#receiptNumber').textContent = order.order_number;
      $('#receiptStatus').textContent = order.status === 'cancelled' ? 'Cancelled' : order.status;
      $('#orderProgress').innerHTML = statuses.map((status,index) => `<span class="step ${index <= current ? 'done' : ''}" title="${esc(status)}"></span>`).join('');
      $('#receiptMeta').innerHTML = `<div><small>Order type</small><strong>${esc(order.fulfilment.replace(/_/g,' '))}</strong></div><div><small>Payment</small><strong>${esc(order.payment_status)}</strong></div><div><small>Placed</small><strong>${new Date(order.created_at).toLocaleString()}</strong></div>`;
      $('#receiptItems').innerHTML = order.items.map(item => `<div class="item"><div><b>${item.quantity} × ${esc(item.name)}</b></div><strong>${money(item.line_total)}</strong></div>`).join('');
      $('#receiptTotal').textContent = money(order.total);
      $('#trackMessage').textContent = ''; $('#receipt').classList.remove('hidden');
    } catch (error) { $('#trackMessage').textContent = error.message; }
    finally { button.disabled = false; }
  };
  $('#printReceipt').onclick = () => window.print();
})();

