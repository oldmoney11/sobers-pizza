(() => {
  "use strict";
  const config = window.SobersKioskConfig;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const headers = { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` };
  let products = [];
  let categories = [];
  let cart = [];
  let idleTimer;
  let resetTimer;
  let confirmationTimer;
  let clientRequestId = null;
  let optionProduct = null;
  let optionSelections = {};

  const money = (value) => `${config.currency}${Number(value || 0).toFixed(2)}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
  const safeImageUrl = (value) => {
    const fallback = '../../assets/logo/favicon-512.png';
    if (!value) return fallback;
    try {
      const appRoot = new URL('../../', window.location.href);
      const url = new URL(value, appRoot);
      return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : fallback;
    } catch (_) {
      return fallback;
    }
  };
  const showScreen = (name) => $$('[data-screen]').forEach((screen) => screen.classList.toggle('active', screen.dataset.screen === name));
  const cartTotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  function optionUnitPrice(product, selections) {
    let total = Number(product?.base_price || 0);
    Object.entries(selections || {}).forEach(([groupKey, selectedValue]) => {
      const choices = product?.options?.[groupKey]?.[2] || {};
      (Array.isArray(selectedValue) ? selectedValue : [selectedValue]).forEach((choiceKey) => {
        total += Number(choices?.[choiceKey]?.[1] || 0);
      });
    });
    return total;
  }

  function optionNames(product, selections) {
    const names = [];
    Object.entries(selections || {}).forEach(([groupKey, selectedValue]) => {
      const choices = product?.options?.[groupKey]?.[2] || {};
      (Array.isArray(selectedValue) ? selectedValue : [selectedValue]).forEach((choiceKey) => {
        if (choices?.[choiceKey]?.[0]) names.push(choices[choiceKey][0]);
      });
    });
    return names;
  }

  function closeOptions() {
    optionProduct = null;
    optionSelections = {};
    $('[data-option-overlay]').classList.remove('active');
    $('[data-option-overlay]').setAttribute('aria-hidden', 'true');
  }

  function updateOptionTotal() {
    $('[data-option-total]').textContent = money(optionUnitPrice(optionProduct, optionSelections));
  }

  function orderedChoices(choices) {
    const sizeOrder = { mini:0, mini_small:1, small:2, medium:3, large:4, x_large:5, regular:6, family:7, two:8, four:9, seven:10, eight:11, twelve:12, fifteen:13, twenty_four:14 };
    return Object.entries(choices || {}).sort(([left], [right]) =>
      (sizeOrder[left] ?? 100) - (sizeOrder[right] ?? 100));
  }

  function openOptions(product) {
    optionProduct = product;
    optionSelections = {};
    const groups = Object.entries(product.options || {});
    groups.forEach(([groupKey, group]) => {
      const [, type, choices] = group;
      if (type === 'radio') optionSelections[groupKey] = orderedChoices(choices)[0]?.[0] || '';
      if (type === 'checkbox') optionSelections[groupKey] = [];
    });

    $('[data-option-name]').textContent = product.name;
    $('[data-option-description]').textContent = product.description || 'Made fresh to order.';
    $('[data-option-groups]').innerHTML = groups.map(([groupKey, group]) => {
      const [label, type, choices] = group;
      return `<fieldset class="option-group"><legend>${escapeHtml(label)}</legend><div class="option-choices">${orderedChoices(choices).map(([choiceKey, choice]) => `<label class="option-choice"><input data-option-input type="${type === 'radio' ? 'radio' : 'checkbox'}" name="option-${escapeHtml(groupKey)}" value="${escapeHtml(choiceKey)}" ${type === 'radio' && optionSelections[groupKey] === choiceKey ? 'checked' : ''}><span><b>${escapeHtml(choice[0])}</b><small>${type === 'radio' ? money(Number(product.base_price) + Number(choice[1])) : `+${money(choice[1])}`}</small></span></label>`).join('')}</div></fieldset>`;
    }).join('');
    updateOptionTotal();
    $('[data-option-overlay]').classList.add('active');
    $('[data-option-overlay]').setAttribute('aria-hidden', 'false');
  }

  async function loadMenu() {
    try {
      const businessResponse = await fetch(`${config.supabaseUrl}/rest/v1/businesses?slug=eq.${config.businessSlug}&status=eq.active&select=id&limit=1`, { headers, cache: 'no-store' });
      const [business] = await businessResponse.json();
      if (!business) throw new Error('Business unavailable');
      const [categoryResponse, productResponse] = await Promise.all([
        fetch(`${config.supabaseUrl}/rest/v1/categories?business_id=eq.${business.id}&is_active=eq.true&select=id,name,slug,sort_order&order=sort_order.asc`, { headers, cache: 'no-store' }),
        fetch(`${config.supabaseUrl}/rest/v1/products?business_id=eq.${business.id}&is_active=eq.true&is_available=eq.true&select=id,category_id,slug,name,description,image_url,base_price,options,sort_order&order=sort_order.asc`, { headers, cache: 'no-store' }),
      ]);
      categories = await categoryResponse.json();
      products = await productResponse.json();
      localStorage.setItem('sobersKioskCatalog', JSON.stringify({ categories, products }));
    } catch (error) {
      const cached = JSON.parse(localStorage.getItem('sobersKioskCatalog') || 'null');
      categories = cached?.categories || [];
      products = cached?.products || [];
    }
    renderCategories();
    renderProducts('all');
  }

  function renderCategories() {
    $('[data-categories]').innerHTML = [{ slug: 'all', name: 'All menu' }, ...categories]
      .map((category, index) => `<button class="${index === 0 ? 'active' : ''}" data-category="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</button>`)
      .join('');
  }

  function renderProducts(categorySlug) {
    const category = categories.find((item) => item.slug === categorySlug);
    const visible = category ? products.filter((item) => item.category_id === category.id) : products;
    $('[data-products]').innerHTML = visible.map((product) => `<button class="product-card" data-product="${escapeHtml(product.id)}"><img src="${safeImageUrl(product.image_url)}" alt=""><div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || 'Made fresh to order.')}</p><strong>From ${money(product.base_price)}</strong></div></button>`).join('');
    $('[data-empty-menu]').classList.toggle('hidden', visible.length > 0);
  }

  function renderCart() {
    const quantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    $('[data-cart-count]').textContent = quantity;
    $('[data-mobile-cart-count]').textContent = quantity;
    $('[data-cart-total]').textContent = money(cartTotal());
    $('[data-mobile-cart-total]').textContent = money(cartTotal());
    $('[data-review-total]').textContent = money(cartTotal());
    $('[data-empty-cart]').classList.toggle('hidden', cart.length > 0);
    $('[data-review-order]').disabled = cart.length === 0;
    $('[data-open-cart]').disabled = cart.length === 0;
    $('[data-cart-items]').innerHTML = cart.map((item) => `<div class="cart-row"><div><strong>${escapeHtml(item.name)}</strong>${item.optionNames.length ? `<small>${escapeHtml(item.optionNames.join(' · '))}</small>` : ''}<small>${money(item.price)} × ${item.quantity}</small></div><div><button data-cart-minus="${escapeHtml(item.id)}" aria-label="Remove one ${escapeHtml(item.name)}">−</button><button data-cart-plus="${escapeHtml(item.id)}" aria-label="Add one ${escapeHtml(item.name)}">+</button></div></div>`).join('');
  }

  function resetSession() {
    clearTimeout(idleTimer); clearTimeout(resetTimer); clearTimeout(confirmationTimer);
    cart = [];
    clientRequestId = null;
    closeOptions();
    $$('input[name="kioskFulfilment"]').forEach((input) => (input.checked = input.value === 'dine_in'));
    $('input[name="kioskName"]').value = '';
    $('input[name="kioskPhone"]').value = '';
    $('[data-order-message]').textContent = '';
    $('[data-place-order]').disabled = false;
    $('[data-place-order]').textContent = 'Place order';
    $('[data-idle-overlay]').classList.remove('active');
    $('[data-idle-overlay]').setAttribute('aria-hidden', 'true');
    $('.cart-panel').classList.remove('mobile-open');
    document.body.classList.remove('cart-sheet-open');
    renderCart(); showScreen('welcome');
  }

  function armIdleTimer() {
    clearTimeout(idleTimer); clearTimeout(resetTimer);
    if (!$('[data-screen="ordering"]').classList.contains('active') && !$('[data-screen="review"]').classList.contains('active')) return;
    idleTimer = setTimeout(() => {
      $('[data-idle-overlay]').classList.add('active');
      $('[data-idle-overlay]').setAttribute('aria-hidden', 'false');
      resetTimer = setTimeout(resetSession, config.idleResetMs);
    }, config.idleWarningMs);
  }

  $('[data-start-order]').onclick = () => { showScreen('ordering'); armIdleTimer(); };
  $('[data-cancel-order]').onclick = resetSession;
  $('[data-back-menu]').onclick = () => { showScreen('ordering'); $('.cart-panel').classList.remove('mobile-open'); document.body.classList.remove('cart-sheet-open'); armIdleTimer(); };
  $('[data-review-order]').onclick = () => { $('.cart-panel').classList.remove('mobile-open'); document.body.classList.remove('cart-sheet-open'); showScreen('review'); armIdleTimer(); };
  $('[data-open-cart]').onclick = () => { $('.cart-panel').classList.add('mobile-open'); document.body.classList.add('cart-sheet-open'); armIdleTimer(); };
  $('[data-close-cart]').onclick = () => { $('.cart-panel').classList.remove('mobile-open'); document.body.classList.remove('cart-sheet-open'); };
  $('[data-new-order]').onclick = resetSession;
  $('[data-reset-order]').onclick = resetSession;
  $('[data-continue-order]').onclick = () => { $('[data-idle-overlay]').classList.remove('active'); armIdleTimer(); };
  $('[data-categories]').onclick = (event) => { const button = event.target.closest('[data-category]'); if (!button) return; $$('[data-category]').forEach((item) => item.classList.toggle('active', item === button)); renderProducts(button.dataset.category); armIdleTimer(); };
  $('[data-products]').onclick = (event) => {
    const button = event.target.closest('[data-product]');
    if (!button) return;
    const product = products.find((item) => item.id === button.dataset.product);
    if (Object.keys(product.options || {}).length) {
      openOptions(product);
    } else {
      const existing = cart.find((item) => item.id === product.id);
      if (existing) existing.quantity += 1;
      else cart.push({ id: product.id, productKey: product.slug, name: product.name, price: Number(product.base_price), quantity: 1, options: {}, optionNames: [] });
      renderCart();
    }
    armIdleTimer();
  };
  $('[data-option-close]').onclick = closeOptions;
  $('[data-option-groups]').onchange = (event) => {
    const input = event.target.closest('[data-option-input]');
    if (!input || !optionProduct) return;
    const groupKey = input.name.replace(/^option-/, '');
    if (input.type === 'radio') optionSelections[groupKey] = input.value;
    else {
      const selected = optionSelections[groupKey] || [];
      optionSelections[groupKey] = input.checked ? [...new Set([...selected, input.value])] : selected.filter((value) => value !== input.value);
    }
    updateOptionTotal();
    armIdleTimer();
  };
  $('[data-option-add]').onclick = () => {
    if (!optionProduct) return;
    const selections = JSON.parse(JSON.stringify(optionSelections));
    const signature = `${optionProduct.id}-${JSON.stringify(selections)}`;
    const existing = cart.find((item) => item.id === signature);
    if (existing) existing.quantity += 1;
    else cart.push({
      id: signature,
      productKey: optionProduct.slug,
      name: optionProduct.name,
      price: optionUnitPrice(optionProduct, selections),
      quantity: 1,
      options: selections,
      optionNames: optionNames(optionProduct, selections),
    });
    closeOptions();
    renderCart();
    armIdleTimer();
  };
  $('[data-cart-items]').onclick = (event) => { const plus = event.target.closest('[data-cart-plus]'); const minus = event.target.closest('[data-cart-minus]'); const id = plus?.dataset.cartPlus || minus?.dataset.cartMinus; if (!id) return; const item = cart.find((entry) => entry.id === id); item.quantity += plus ? 1 : -1; cart = cart.filter((entry) => entry.quantity > 0); renderCart(); armIdleTimer(); };

  $('[data-place-order]').onclick = async () => {
    const button = $('[data-place-order]');
    const message = $('[data-order-message]');
    if (!cart.length || button.disabled) return;

    clientRequestId ||= crypto.randomUUID();
    button.disabled = true;
    button.textContent = 'Sending order…';
    message.textContent = '';

    const payload = {
      p_business_slug: config.businessSlug,
      p_branch_code: config.branchCode,
      p_kiosk_code: config.kioskCode,
      p_fulfilment: $('input[name="kioskFulfilment"]:checked')?.value || 'dine_in',
      p_requested_items: cart.map((item) => ({
        product_key: item.productKey,
        quantity: item.quantity,
        selected_options: item.options || {},
      })),
      p_client_request_id: clientRequestId,
      p_customer_name: $('input[name="kioskName"]').value.trim() || null,
      p_customer_phone: $('input[name="kioskPhone"]').value.trim() || null,
      p_customer_note: null,
    };

    try {
      const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/create_kiosk_order`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || 'The order could not be sent.');
      const order = Array.isArray(result) ? result[0] : result;
      if (!order?.order_number) throw new Error('The server did not return an order number.');

      $('[data-display-number]').textContent = order.display_order_number || order.order_number;
      $('[data-official-reference]').textContent = `Official reference: ${order.order_number} · ${money(order.order_total)}`;
      clearTimeout(idleTimer); clearTimeout(resetTimer);
      showScreen('confirmation');
      confirmationTimer = setTimeout(resetSession, config.confirmationResetMs);
    } catch (error) {
      message.textContent = navigator.onLine
        ? `${error.message} Please ask a Sobers team member for help.`
        : 'The kiosk is offline. Please ask a Sobers team member for help.';
      button.disabled = false;
      button.textContent = 'Try placing order again';
    }
  };

  ['pointerdown', 'keydown'].forEach((eventName) => document.addEventListener(eventName, armIdleTimer, { passive: true }));
  loadMenu(); renderCart();
})();
