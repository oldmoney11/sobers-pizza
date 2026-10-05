(() => {
    const db = window.RichRepublicSupabase;
    const $ = selector => document.querySelector(selector);
    const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
    const money = value => `GH₵${Number(value || 0).toFixed(2)}`;
    const slugify = value => String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const officialProductImages = {"chicken-pizza-pie":"assets/sobers-pizza/official-products/chicken-pizza-pie.webp","pepperoni-pizza":"assets/sobers-pizza/official-products/pepperoni-pizza.webp","ceres-1l":"assets/sobers-pizza/official-products/ceres-red-grape.webp","don-simon-1l":"assets/sobers-pizza/official-products/don-simon-multifruits.webp","heineken-500ml":"assets/sobers-pizza/official-products/heineken.webp","kiss-cider-500ml":"assets/sobers-pizza/official-products/kiss-cider.webp","malta-guinness-330ml":"assets/sobers-pizza/official-products/malta-guinness.webp","tampico-500ml":"assets/sobers-pizza/official-products/tampico-citrus-punch.webp","tampico-1l":"assets/sobers-pizza/official-products/tampico-citrus-punch.webp","walch-473ml":"assets/sobers-pizza/official-products/welchs-grape.webp","can-drink":"assets/sobers-pizza/official-products/canned-drinks.webp"};
    Object.assign(officialProductImages, {"chicken-shawarma":"assets/sobers-pizza/official-products/chicken-shawarma.webp","beef-shawarma":"assets/sobers-pizza/official-products/beef-shawarma.webp","combo-shawarma":"assets/sobers-pizza/official-products/combo-shawarma.webp","summer-wave":"assets/sobers-pizza/official-products/juice-summer.webp","pine-paradise":"assets/sobers-pizza/official-products/juice-pine-paradise.webp","citrus-blaze":"assets/sobers-pizza/official-products/juice-citrus-blaze.webp","orchard-fresh":"assets/sobers-pizza/official-products/juice-orchard-fresh.webp","fruit-fiesta":"assets/sobers-pizza/official-products/juice-fruit-fiesta.webp","sobers-sunset":"assets/sobers-pizza/official-products/juice-sobers-sunset.webp","pizza-cooler-cocktail":"assets/sobers-pizza/official-products/juice-pizza-cooler-cocktail.webp","smile-spritz":"assets/sobers-pizza/official-products/juice-smile-spritz.webp","banana-power":"assets/sobers-pizza/official-products/juice-banana-power.webp","mango-magic":"assets/sobers-pizza/official-products/juice-mango-magic.webp","mixed-berry":"assets/sobers-pizza/official-products/juice-mixed-berry.webp","strawberry-bliss":"assets/sobers-pizza/official-products/juice-strawberry-bliss.webp","sobers-special-smoothie":"assets/sobers-pizza/official-products/juice-sobers-special-smoothie.webp","vanilla-dream":"assets/sobers-pizza/official-products/juice-vanilla-dream.webp","chocolate-bliss":"assets/sobers-pizza/official-products/juice-chocolate-bliss.webp","strawberry-shake":"assets/sobers-pizza/official-products/juice-strawberry-shake.webp","sobers-triple-treat":"assets/sobers-pizza/official-products/juice-sobers-triple-treat.webp"});
    officialProductImages["pineapple-pizza"] = "assets/sobers-pizza/official-products/pineapple-pizza.webp";
    const productImageUrl = value => {
        if (!value) return "";
        try {
            const direct = new URL(value);
            if (["http:", "https:", "data:", "blob:"].includes(direct.protocol)) return direct.href;
        } catch (_) {}
        const path = String(value)
            .replace(/^\.?\//, "")
            .replace(/^(assets\/sobers-pizza\/generated\/[^?#]+)\.png(?=([?#].*)?$)/i, "$1.webp");
        const base = new URL(window.RichRepublicConfig.customerAppBaseUrl);
        return new URL(path, base).href;
    };
    let business = null;
    let membership = null;
    let orders = [];
    let deliverySessions = [];
    let products = [];
    let categories = [];
    let branches = [];
    let paymentMethods = [];
    let notices = [];
    let orderChannel = null;
    let passwordRecovery = false;
    let recoveryInProgress = location.hash.includes('type=recovery');
    const dashboard = document.body.dataset;
    const businessSlug = dashboard.businessSlug;
    const businessLabel = dashboard.businessName || "Business";
    let notificationButton = null;
    const ADMIN_IDLE_LIMIT = 30 * 60 * 1000;
    let lastAdminActivity = Date.now();

    ["pointerdown", "keydown", "touchstart"].forEach(eventName => document.addEventListener(eventName, () => { lastAdminActivity = Date.now(); }, { passive: true }));
    window.setInterval(async () => {
        if (!business || Date.now() - lastAdminActivity < ADMIN_IDLE_LIMIT) return;
        await db.auth.signOut();
        business = null;
        showError("Your secure session expired after 30 minutes of inactivity. Please sign in again.");
    }, 60000);

    function mountNotificationControl() {
        const topbar = document.querySelector(".topbar");
        if (!topbar || topbar.querySelector("[data-notifications]")) return;
        notificationButton = document.createElement("button");
        notificationButton.type = "button";
        notificationButton.className = "secondary notification-button";
        notificationButton.dataset.notifications = "";
        notificationButton.onclick = enableNotifications;
        topbar.insertBefore(notificationButton, $("#signOut"));
        renderNotificationState();
    }

    function renderNotificationState() {
        if (!notificationButton) return;
        if (!("Notification" in window)) { notificationButton.textContent = "Alerts unavailable"; notificationButton.disabled = true; return; }
        notificationButton.textContent = Notification.permission === "granted" ? "🔔 Alerts on" : Notification.permission === "denied" ? "🔕 Alerts blocked" : "Enable alerts";
    }

    async function enableNotifications() {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") await Notification.requestPermission();
        renderNotificationState();
        if (Notification.permission === "granted") notifyOrder({ order_number: "Test", customer_name: businessLabel }, true);
    }

    async function notifyOrder(order, test = false) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        const title = test ? `${businessLabel} alerts enabled` : `New ${businessLabel} order`;
        const body = test ? "You will be notified when a new order arrives." : `${order?.order_number || "New order"}${order?.customer_name ? ` · ${order.customer_name}` : ""}`;
        try {
            const registration = await navigator.serviceWorker?.ready;
            if (registration) return registration.showNotification(title, { body, icon: "./assets/icon-192.png", badge: "./assets/icon-192.png", tag: test ? "alerts-test" : `order-${order?.id || Date.now()}`, data: { url: "./#orders" } });
            new Notification(title, { body, tag: test ? "alerts-test" : `order-${order?.id || Date.now()}` });
        } catch (error) { console.warn("Order notification could not be displayed:", error); }
    }

    function showLogin() { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); }
    function showError(message) { showLogin(); $("#loginMessage").textContent = message; }
    function parseJson(value, label) { try { const parsed = JSON.parse(value || "{}"); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error(); return parsed; } catch (error) { throw new Error(`${label} must be valid JSON.`); } }
    function openDialog(id) { $("#" + id).showModal(); }
    function closeDialog(id) { $("#" + id).close(); }

    function openPasswordDialog(recovery = false) {
        passwordRecovery = recovery;
        const form = $("#passwordForm");
        form.reset();
        form.elements.email.closest("label").classList.toggle("hidden", recovery);
        form.elements.new_password.closest("label").classList.toggle("hidden", !recovery);
        $("#passwordTitle").textContent = recovery ? "Choose a new password" : "Reset your password";
        $("#passwordHelp").textContent = recovery ? "Enter a new password with at least 8 characters." : "We will email you a secure password-reset link.";
        $("#passwordSubmit").textContent = recovery ? "Save new password" : "Send reset link";
        $("#passwordMessage").textContent = "";
        openDialog("passwordDialog");
    }

    async function session() {
        const { data: { session } } = await db.auth.getSession();
        if (!session) return showLogin();
        if (recoveryInProgress) return showLogin();
        try { await window.SobersAdminSecurity.ensure(); } catch (error) { return showError(error.message); }
        await db.rpc("accept_business_invitation");
        const { data: profile } = await db.from("profiles").select("full_name,is_platform_admin").eq("id", session.user.id).maybeSingle();
        const { data: foundBusiness } = await db.from("businesses").select("*").eq("slug", businessSlug).maybeSingle();
        if (!foundBusiness) return showError(`${businessLabel} has not been activated in Super Admin yet.`);
        business = foundBusiness;
        if (!profile?.is_platform_admin) {
            const { data: foundMembership } = await db.from("business_memberships").select("id,status,roles(name)").eq("business_id", business.id).eq("profile_id", session.user.id).eq("status", "active").maybeSingle();
            if (!foundMembership) { await db.auth.signOut(); return showError(`This account is not assigned to ${businessLabel}. Ask the platform owner to invite this email address.`); }
            membership = foundMembership;
        }
        $("#userName").textContent = profile?.full_name || session.user.email;
        $("#businessName").textContent = business.name;
        $("#login").classList.add("hidden");
        $("#app").classList.remove("hidden");
        await loadAll();
        subscribeToOrders();
    }

    async function loadAll() {
        if (!business) return;
        const [orderResult, productResult, categoryResult, branchResult, settingsResult, paymentResult, noticeResult, deliveryResult] = await Promise.all([
            db.from("platform_orders").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(500),
            db.from("products").select("*,categories(name)").eq("business_id", business.id).eq("is_active", true).order("sort_order"),
            db.from("categories").select("*").eq("business_id", business.id).order("sort_order"),
            db.from("branches").select("*").eq("business_id", business.id).order("name"),
            db.from("business_settings").select("*").eq("business_id", business.id).maybeSingle(),
            db.from("payment_methods").select("*").eq("business_id", business.id).order("sort_order"),
            db.from("business_notices").select("*").eq("business_id", business.id).order("priority", { ascending: false }).order("starts_at", { ascending: false }),
            db.from("sobers_delivery_sessions").select("order_id,state").eq("business_id", business.id)
        ]);
        const failed = [orderResult, productResult, categoryResult, branchResult, settingsResult, paymentResult].find(result => result.error);
        if (failed) return alert(failed.error.message);
        orders = orderResult.data || [];
        deliverySessions = deliveryResult.error ? [] : (deliveryResult.data || []);
        products = productResult.data || [];
        categories = categoryResult.data || [];
        branches = branchResult.data || [];
        paymentMethods = paymentResult.data || [];
        notices = noticeResult.error ? [] : (noticeResult.data || []);
        renderBranchFilter(); renderOrders(); renderProducts(); renderCategories(); renderNotices(); renderBranches(); renderPaymentMethods(); renderSettings(settingsResult.data); renderStats();
        $("#setupNotice").classList.add("hidden");
    }

    function soundNewOrder() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const context = new AudioContext();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = 880; gain.gain.value = 0.08; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.18);
        } catch (error) { console.warn("New-order sound was blocked:", error); }
    }
    function subscribeToOrders() {
        if (!business || orderChannel) return;
        orderChannel = db.channel(`business-orders-${business.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "platform_orders", filter: `business_id=eq.${business.id}` }, async payload => {
            await loadAll();
            $("#liveOrderNotice").classList.remove("hidden");
            soundNewOrder();
            notifyOrder(payload.new);
            setTimeout(() => $("#liveOrderNotice").classList.add("hidden"), 10000);
        }).on("postgres_changes", { event: "UPDATE", schema: "public", table: "platform_orders", filter: `business_id=eq.${business.id}` }, loadAll)
        .subscribe(status => {
            const notice = $("#setupNotice");
            if (status === "SUBSCRIBED" && notice) { notice.textContent = "Live order connection active"; notice.classList.remove("hidden"); setTimeout(() => notice.classList.add("hidden"), 2500); }
        });
    }

    function renderStats() {
        const scoped = scopedOrders();
        const count = status => scoped.filter(order => order.status === status).length;
        const validOrders = scoped.filter(order => order.status !== "cancelled");
        const activeQueue = scoped.filter(order => ["confirmed", "preparing", "ready"].includes(order.status)).length;
        const recordedValue = validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
        const pendingPayments = scoped.filter(order => ["unpaid", "pending", "failed"].includes(order.payment_status || "unpaid") && order.status !== "cancelled").length;
        const availableProducts = products.filter(product => product.is_active && product.is_available).length;
        const branchId = $("#branchFilter")?.value || "all";
        $("#statTotal").textContent = scoped.length;
        $("#statNew").textContent = count("new");
        $("#statPreparing").textContent = activeQueue;
        $("#statCompleted").textContent = count("completed");
        $("#statSales").textContent = money(recordedValue);
        $("#statAverage").textContent = money(validOrders.length ? recordedValue / validOrders.length : 0);
        $("#statPaymentPending").textContent = pendingPayments;
        $("#statAvailableProducts").textContent = availableProducts;
        $("#statProductHint").textContent = `${products.length - availableProducts} currently unavailable or hidden`;
        $("#overviewScopeLabel").textContent = branchId === "all" ? "All branches" : branchName(branchId);
        renderOverviewDetails(scoped);
    }
    function renderOverviewDetails(scoped) {
        const branchId = $("#branchFilter")?.value || "all";
        const visibleBranches = branches.filter(branch => branch.is_active && (branchId === "all" || branch.id === branchId));
        const branchHost = $("#branchPerformance");
        if (branchHost) branchHost.innerHTML = visibleBranches.length ? visibleBranches.map(branch => {
            const list = orders.filter(order => order.branch_id === branch.id);
            const live = list.filter(order => ["new", "confirmed", "preparing", "ready"].includes(order.status)).length;
            const completed = list.filter(order => order.status === "completed").length;
            const value = list.filter(order => order.status !== "cancelled").reduce((sum, order) => sum + Number(order.total || 0), 0);
            return `<article class="branch-summary-card"><div class="branch-summary-top"><span class="branch-pulse"></span><small>${branch.is_active ? "ACTIVE" : "INACTIVE"}</small></div><h3>${esc(branch.name)}</h3><p>${esc(branch.address || "Address not added")}</p><div class="branch-summary-metrics"><div><strong>${list.length}</strong><span>Orders</span></div><div><strong>${live}</strong><span>Live</span></div><div><strong>${completed}</strong><span>Done</span></div></div><footer><strong>${money(value)}</strong><span>Recorded value</span></footer></article>`;
        }).join("") : `<div class="overview-empty">No active branch is available in this view.</div>`;

        const statuses = [["new", "New"], ["confirmed", "Confirmed"], ["preparing", "Preparing"], ["ready", "Ready"], ["completed", "Completed"], ["cancelled", "Cancelled"]];
        const max = Math.max(1, ...statuses.map(([key]) => scoped.filter(order => order.status === key).length));
        const statusHost = $("#statusBreakdown");
        if (statusHost) statusHost.innerHTML = statuses.map(([key, label]) => {
            const value = scoped.filter(order => order.status === key).length;
            return `<div class="status-row"><div><span>${label}</span><strong>${value}</strong></div><i><b class="status-${key}" style="width:${Math.round(value / max * 100)}%"></b></i></div>`;
        }).join("");

        const recentHost = $("#overviewRecentOrders");
        const recent = [...scoped].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
        if (recentHost) recentHost.innerHTML = recent.length ? recent.map(order => `<button type="button" class="recent-order" data-order-view="${order.id}"><span class="recent-order-id"><small>${esc(branchName(order.branch_id))}</small><strong>${esc(order.display_order_number || order.order_number)}</strong></span><span><small>Customer</small><strong>${esc(order.customer_name || "Guest")}</strong></span><span><small>Status</small><b class="badge ${esc(order.status)}">${esc(order.status)}</b></span><span><small>Total</small><strong>${money(order.total)}</strong></span><span class="recent-order-arrow">→</span></button>`).join("") : `<div class="overview-empty">No orders have arrived in this view yet.</div>`;
    }
    function scopedOrders() {
        const branchId = $("#branchFilter")?.value || "all";
        return branchId === "all" ? orders : orders.filter(order => order.branch_id === branchId);
    }
    function branchName(branchId) { return branches.find(branch => branch.id === branchId)?.name || "Unassigned"; }
    function renderBranchFilter() {
        const select = $("#branchFilter"); if (!select) return;
        const selected = select.value || "all";
        select.innerHTML = `<option value="all">All branches</option>${branches.filter(branch => branch.is_active).map(branch => `<option value="${branch.id}">${esc(branch.name)}</option>`).join("")}`;
        select.value = [...select.options].some(option => option.value === selected) ? selected : "all";
    }
    function renderOrders() {
        const filter = $("#orderFilter").value;
        const scoped = scopedOrders();
        const list = filter === "all" ? scoped : scoped.filter(order => order.status === filter);
        $("#ordersEmpty").classList.toggle("hidden", list.length > 0);
        $("#ordersBody").innerHTML = list.map(order => `<tr><td data-label="Order"><button class="secondary" data-order-view="${order.id}">${esc(order.display_order_number || order.order_number)}</button><br><small class="muted">${esc(order.order_number)} · ${esc(order.source)}</small></td><td data-label="Branch"><span class="badge active">${esc(branchName(order.branch_id))}</span></td><td data-label="Customer">${esc(order.customer_name)}<br><small class="muted">${esc(order.customer_phone)}</small></td><td data-label="Type">${esc(order.fulfilment)}</td><td data-label="Total">${money(order.total)}</td><td data-label="Payment"><select data-payment-status="${order.id}">${["unpaid","pending","paid","failed","refunded"].map(status => `<option ${status === order.payment_status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td data-label="Status"><select data-order-status="${order.id}">${["new","confirmed","preparing","ready","completed","cancelled"].map(status => `<option ${status === order.status ? "selected" : ""}>${status}</option>`).join("")}</select></td><td data-label="Created">${new Date(order.created_at).toLocaleString()}</td></tr>`).join("");
    }
    function renderProducts() {
        $("#productsEmpty").classList.toggle("hidden", products.length > 0);
        $("#productsBody").innerHTML = products.map(product => { const image = officialProductImages[product.slug] || product.image_url; const name = product.slug === "walch-473ml" ? "Welch's 473ml" : product.name; return `<tr><td>${image ? `<img class="product-thumb" src="${esc(productImageUrl(image))}" alt="${esc(name)}" loading="lazy" decoding="async">` : ""}<strong>${esc(name)}</strong><br><small class="muted">${esc(product.description)}</small></td><td>${esc(product.categories?.name || "Uncategorised")}</td><td>${money(product.base_price)}</td><td><button class="secondary" data-product-toggle="${product.id}" data-value="${product.is_available}">${product.is_available ? "Available" : "Unavailable"}</button></td><td><button class="secondary" data-product-edit="${product.id}">Edit</button></td></tr>`; }).join("");
    }
    function renderCategories() {
        $("#categoriesEmpty").classList.toggle("hidden", categories.length > 0);
        $("#categoriesBody").innerHTML = categories.map(category => `<tr><td><strong>${esc(category.name)}</strong><br><small class="muted">${esc(category.description)}</small></td><td>${esc(category.slug)}</td><td>${category.sort_order}</td><td><span class="badge ${category.is_active ? "active" : "inactive"}">${category.is_active ? "Visible" : "Hidden"}</span></td><td><button class="secondary" data-category-edit="${category.id}">Edit</button></td></tr>`).join("");
    }
    function renderNotices() {
        $("#noticesEmpty").classList.toggle("hidden", notices.length > 0);
        const format = value => value ? new Date(value).toLocaleString() : "No expiry";
        const state = item => { const now = Date.now(); if (!item.is_active) return ["inactive","Hidden"]; if (new Date(item.starts_at).getTime() > now) return ["inactive","Scheduled"]; if (item.ends_at && new Date(item.ends_at).getTime() < now) return ["inactive","Expired"]; return ["active","Live"]; };
        $("#noticesBody").innerHTML = notices.map(item => { const [tone,label] = state(item); return `<tr><td><strong>${esc(item.title)}</strong><br><small class="muted">${esc(item.body)}</small></td><td>${esc(item.notice_type.replace(/_/g, " "))}</td><td>${esc(format(item.starts_at))}<br><small class="muted">to ${esc(format(item.ends_at))}</small></td><td><span class="badge ${tone}">${label}</span></td><td><button class="secondary" data-notice-toggle="${item.id}" data-value="${item.is_active}">${item.is_active ? "Hide" : "Publish"}</button> <button class="secondary" data-notice-edit="${item.id}">Edit</button></td></tr>`; }).join("");
    }
    function renderBranches() {
        $("#branchesEmpty").classList.toggle("hidden", branches.length > 0);
        $("#branchesBody").innerHTML = branches.map(branch => `<tr><td>${esc(branch.name)}</td><td>${esc(branch.code)}</td><td>${esc(branch.whatsapp_number || "")}</td><td><span class="badge ${branch.accepting_orders === false ? "inactive" : "active"}">${branch.accepting_orders === false ? "Paused" : "Accepting"}</span></td><td>${Number(branch.prep_min_minutes || 20)}–${Number(branch.prep_max_minutes || 30)} min</td><td>${esc(branch.address || "")}</td><td><span class="badge ${branch.is_active ? "active" : "inactive"}">${branch.is_active ? "Active" : "Inactive"}</span></td><td><button class="secondary" data-branch-edit="${branch.id}">Edit</button></td></tr>`).join("");
    }
    function renderPaymentMethods() {
        $("#paymentMethodsEmpty").classList.toggle("hidden", paymentMethods.length > 0);
        $("#paymentMethodsBody").innerHTML = paymentMethods.map(method => `<tr><td><strong>${esc(method.display_name)}</strong><br><small class="muted">${esc(method.method_type.replace(/_/g, " "))}</small></td><td>${esc(method.provider || "—")}</td><td>${esc(method.account_name || "")}${method.account_number ? `<br><small class="muted">${esc(method.account_number)}</small>` : ""}</td><td><span class="badge ${method.is_active ? "active" : "inactive"}">${method.is_active ? "Active" : "Inactive"}</span></td><td><button class="secondary" data-payment-edit="${method.id}">Edit</button></td></tr>`).join("");
    }
    function renderSettings(settings) {
        if (!settings) return;
        const form = $("#settingsForm");
        ["display_name","whatsapp_number","phone","email","default_delivery_fee"].forEach(key => form.elements[key].value = settings[key] ?? "");
        form.elements.opening_hours.value = JSON.stringify(settings.opening_hours || {}, null, 2);
        form.elements.delivery_enabled.checked = settings.delivery_enabled;
        form.elements.pickup_enabled.checked = settings.pickup_enabled;
    }

    function addOptionRow(container, value = {}) {
        const row = document.createElement("div");
        row.className = "option-row";
        const sizeRow = container.id === "sizeRows";
        row.innerHTML = `<label>Name<input data-option-name value="${esc(value.name || "")}" placeholder="e.g. Large"></label><label>${sizeRow ? "Final customer price" : "Added price"} (GH₵)<input data-option-price type="number" min="0" step="0.01" value="${Number(value.price || 0)}"></label><button class="danger" type="button" data-remove-option>Remove</button>`;
        row.querySelector("[data-remove-option]").onclick = () => row.remove();
        container.appendChild(row);
    }
    function loadOptionBuilder(options = {}, basePrice = 0) {
        $("#sizeRows").innerHTML = ""; $("#extraRows").innerHTML = "";
        const sizeChoices = options.size?.[2] || options.sizes?.[2] || {};
        const extraChoices = businessSlug === "barimaba" ? (options.color?.[2] || options.colors?.[2] || {}) : (options.extras?.[2] || {});
        Object.entries(sizeChoices).forEach(([key, value]) => addOptionRow($("#sizeRows"), { key, name: value[0], price: Number(basePrice) + Number(value[1]) }));
        Object.entries(extraChoices).forEach(([key, value]) => addOptionRow($("#extraRows"), { key, name: value[0], price: value[1] }));
    }
    function collectRows(container, priceOffset = 0) {
        const choices = {};
        container.querySelectorAll(".option-row").forEach((row, index) => {
            const name = row.querySelector("[data-option-name]").value.trim();
            if (!name) return;
            let key = slugify(name).replace(/-/g, "_") || `choice_${index + 1}`;
            while (choices[key]) key += "_2";
            choices[key] = [name, Math.max(0, Number(row.querySelector("[data-option-price]").value || 0) - priceOffset)];
        });
        return choices;
    }
    function optionsFromBuilder() {
        const sizes = collectRows($("#sizeRows"), Number($("#productForm").elements.base_price.value || 0));
        const extras = collectRows($("#extraRows"));
        const options = {};
        if (Object.keys(sizes).length) options.size = ["Size", "radio", sizes];
        if (Object.keys(extras).length) options[businessSlug === "barimaba" ? "color" : "extras"] = [businessSlug === "barimaba" ? "Color" : "Extra toppings", businessSlug === "barimaba" ? "radio" : "checkbox", extras];
        return options;
    }
    function optionSummary(selected = {}, product = null) {
        const definitions = product?.options || {};
        const labels = [];
        Object.entries(selected || {}).forEach(([group, value]) => {
            const values = Array.isArray(value) ? value : [value];
            values.forEach(key => labels.push(definitions[group]?.[2]?.[key]?.[0] || String(key).replace(/_/g, " ")));
        });
        return labels;
    }
    async function showOrder(order) {
        const { data: items, error } = await db.from("platform_order_items").select("*").eq("business_id", business.id).eq("order_id", order.id).order("created_at");
        if (error) return alert(error.message);
        $("#orderDialogTitle").textContent = order.order_number;
        const rows = (items || []).map(item => { const product = products.find(entry => entry.id === item.product_id || entry.slug === item.product_key); const options = optionSummary(item.selected_options, product); return `<tr><td><strong>${esc(item.quantity)} × ${esc(item.product_name)}</strong>${options.length ? `<span class="order-option">${options.map(esc).join(" · ")}</span>` : ""}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`; }).join("");
        $("#orderDetail").innerHTML = `<div class="order-meta"><div><small>Official reference</small><strong>${esc(order.order_number)}</strong></div><div><small>Preparing branch</small><strong>${esc(branchName(order.branch_id))}</strong></div>${order.display_order_number ? `<div><small>Kiosk number</small><strong>${esc(order.display_order_number)}</strong></div>` : ""}<div><small>Source</small>${esc(order.source)}</div><div><small>Customer</small><strong>${esc(order.customer_name)}</strong></div><div><small>Phone</small>${esc(order.customer_phone)}</div><div><small>Order type</small>${esc(order.fulfilment)}</div><div><small>Kitchen status</small>${esc(order.status)}${deliverySessions.find(s=>s.order_id===order.id)?.state === "out_for_delivery" ? " · Out for Delivery" : ""}</div><div><small>Payment status</small>${esc(order.payment_status || "unpaid")}</div>${order.payment_reference ? `<div><small>Payment reference</small>${esc(order.payment_reference)}</div>` : ""}${order.delivery_address ? `<div><small>Delivery address</small>${esc(order.delivery_address)}</div>` : ""}${order.customer_note ? `<div><small>Customer note</small>${esc(order.customer_note)}</div>` : ""}<div><small>Created</small>${new Date(order.created_at).toLocaleString()}</div></div><table class="order-items"><thead><tr><th>Item</th><th>Unit</th><th>Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan="2">Subtotal</th><td>${money(order.subtotal)}</td></tr><tr><th colspan="2">Delivery</th><td>${money(order.delivery_fee)}</td></tr><tr><th colspan="2">Order total</th><td><strong>${money(order.total)}</strong></td></tr></tfoot></table>`;
        if (order.fulfilment === "delivery" && !["completed","cancelled"].includes(order.status)) {
          const area=document.createElement("section");area.innerHTML='<h3>Assign delivery rider</h3><label>Rider<select id="deliveryRiderChoice"></select></label><button type="button" id="assignDeliveryRider">Assign rider</button><p id="deliveryAssignmentMessage" role="status"></p><a href="../rider/">Open Rider Mode</a>';$("#orderDetail").append(area);
          const {data:riders,error}=await db.rpc("sobers_available_riders",{p_business:business.id});
          area.querySelector("select").innerHTML=(riders||[]).map(r=>'<option value="'+esc(r.id)+'">'+esc(r.name||r.id)+'</option>').join('');
          if(error)area.querySelector("p").textContent="Rider tracking is not configured yet.";
          area.querySelector("button").disabled=!!error||!riders?.length;
          area.querySelector("button").onclick=async()=>{const button=area.querySelector("button");button.disabled=true;try{const {error}=await db.rpc("sobers_assign_delivery",{p_order:order.id,p_rider:area.querySelector("select").value});area.querySelector("p").textContent=error?error.message:"Rider assigned. Mark the kitchen order ready before starting delivery.";}finally{button.disabled=false;}};
        }
        const phone = String(order.customer_phone || "").replace(/\D/g, "");
        $("#orderCall").href = `tel:${phone}`; $("#orderWhatsApp").href = `https://wa.me/${phone}`; openDialog("orderDialog");
    }
    function editProduct(product = null) {
        const form = $("#productForm"); form.reset();
        form.elements.id.value = product?.id || ""; form.elements.name.value = product?.name || ""; form.elements.base_price.value = product?.base_price ?? ""; form.elements.sort_order.value = product?.sort_order ?? products.length; form.elements.description.value = product?.description || ""; form.elements.image_url.value = product?.image_url || ""; form.elements.is_available.checked = product?.is_available ?? true; loadOptionBuilder(product?.options || {}, product?.base_price || 0);
        form.elements.category_id.innerHTML = categories.filter(item => item.is_active || item.id === product?.category_id).map(item => `<option value="${item.id}" ${item.id === product?.category_id ? "selected" : ""}>${esc(item.name)}</option>`).join("");
        $("#productDialogTitle").textContent = product ? "Edit product" : "Add product"; $("#deleteProduct").classList.toggle("hidden", !product); $("#productMessage").textContent = ""; openDialog("productDialog");
    }
    function editCategory(category = null) {
        const form = $("#categoryForm"); form.reset(); form.elements.id.value = category?.id || ""; form.elements.name.value = category?.name || ""; form.elements.sort_order.value = category?.sort_order ?? categories.length; form.elements.description.value = category?.description || ""; form.elements.is_active.checked = category?.is_active ?? true;
        $("#categoryDialogTitle").textContent = category ? "Edit category" : "Add category"; $("#deleteCategory").classList.toggle("hidden", !category); $("#categoryMessage").textContent = ""; openDialog("categoryDialog");
    }
    function editNotice(item = null) {
        const form = $("#noticeForm"); form.reset();
        const localDate = value => { if (!value) return ""; const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0,16); };
        ["id","title","body","notice_type","cta_label","cta_url","image_url","priority"].forEach(key => form.elements[key].value = item?.[key] ?? (key === "priority" ? 0 : ""));
        form.elements.notice_type.value ||= "announcement";
        form.elements.starts_at.value = localDate(item?.starts_at || new Date()); form.elements.ends_at.value = localDate(item?.ends_at);
        form.elements.is_active.checked = item?.is_active ?? true;
        $("#noticeDialogTitle").textContent = item ? "Edit notice" : "Add notice"; $("#archiveNotice").classList.toggle("hidden", !item); $("#noticeMessage").textContent = ""; openDialog("noticeDialog");
    }
    function editBranch(branch = null) {
        const form = $("#branchForm"); form.reset(); ["id","name","code","phone","whatsapp_number","address"].forEach(key => form.elements[key].value = branch?.[key] || ""); form.elements.prep_min_minutes.value = branch?.prep_min_minutes ?? 20; form.elements.prep_max_minutes.value = branch?.prep_max_minutes ?? 30; form.elements.accepting_orders.checked = branch?.accepting_orders ?? true; form.elements.is_active.checked = branch?.is_active ?? true;
        $("#branchDialogTitle").textContent = branch ? "Edit branch" : "Add branch"; $("#deleteBranch").classList.toggle("hidden", !branch); $("#branchMessage").textContent = ""; openDialog("branchDialog");
    }
    function editPaymentMethod(method = null) {
        const form = $("#paymentMethodForm"); form.reset();
        ["id","method_type","display_name","provider","account_name","account_number","instructions","sort_order"].forEach(key => form.elements[key].value = method?.[key] ?? (key === "sort_order" ? 10 : ""));
        form.elements.method_type.value ||= "cash";
        form.elements.is_active.checked = method?.is_active ?? true;
        $("#paymentMethodDialogTitle").textContent = method ? "Edit payment method" : "Add payment method";
        $("#deactivatePaymentMethod").classList.toggle("hidden", !method || !method.is_active);
        $("#paymentMethodMessage").textContent = ""; openDialog("paymentMethodDialog");
    }

    async function uploadProductImage(file, productSlug) {
        if (!file?.size) return null;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Use a JPG, PNG or WebP product image.');
        if (file.size > 5 * 1024 * 1024) throw new Error('Product images must be 5 MB or smaller.');
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${business.id}/${productSlug}-${Date.now()}.${extension}`;
        const { error } = await db.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false });
        if (error) throw error;
        return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    async function uploadNoticeImage(file, noticeSlug) {
        if (!file?.size) return null;
        if (!["image/jpeg","image/png","image/webp"].includes(file.type)) throw new Error("Use a JPG, PNG or WebP notice image.");
        if (file.size > 5 * 1024 * 1024) throw new Error("Notice images must be 5 MB or smaller.");
        const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${business.id}/notices/${noticeSlug}-${Date.now()}.${extension}`;
        const { error } = await db.storage.from("product-images").upload(path, file, { cacheControl:"3600", upsert:false });
        if (error) throw error;
        return db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }

    $("#productForm").onsubmit = async event => {
        event.preventDefault(); const form = event.target; const id = form.elements.id.value; const slug = slugify(form.elements.name.value); $("#productMessage").textContent = "Saving product…";
        try {
            const options = optionsFromBuilder();
            const uploadedUrl = await uploadProductImage(form.elements.image.files[0], slug);
            const payload = { business_id: business.id, category_id: form.elements.category_id.value, name: form.elements.name.value.trim(), slug, description: form.elements.description.value.trim() || null, base_price: Number(form.elements.base_price.value), sort_order: Number(form.elements.sort_order.value || 0), options, image_url: uploadedUrl || form.elements.image_url.value || null, is_available: form.elements.is_available.checked, is_active: true };
            const result = id ? await db.from("products").update(payload).eq("id", id).eq("business_id", business.id) : await db.from("products").insert(payload);
            if (result.error) throw result.error; closeDialog("productDialog"); await loadAll();
        } catch (error) { $("#productMessage").textContent = error.message; }
    };
    $("#categoryForm").onsubmit = async event => {
        event.preventDefault(); const form = event.target; const id = form.elements.id.value; $("#categoryMessage").textContent = "Saving category…";
        const payload = { business_id: business.id, name: form.elements.name.value.trim(), slug: slugify(form.elements.name.value), description: form.elements.description.value.trim() || null, sort_order: Number(form.elements.sort_order.value || 0), is_active: form.elements.is_active.checked };
        const result = id ? await db.from("categories").update(payload).eq("id", id).eq("business_id", business.id) : await db.from("categories").insert(payload);
        if (result.error) return $("#categoryMessage").textContent = result.error.message; closeDialog("categoryDialog"); await loadAll();
    };
    $("#noticeForm").onsubmit = async event => {
        event.preventDefault(); const form = event.target; const id = form.elements.id.value; $("#noticeMessage").textContent = "Saving notice…";
        try {
          const uploadedUrl = await uploadNoticeImage(form.elements.image.files[0], slugify(form.elements.title.value));
          const payload = { business_id: business.id, title: form.elements.title.value.trim(), body: form.elements.body.value.trim(), notice_type: form.elements.notice_type.value, starts_at: new Date(form.elements.starts_at.value).toISOString(), ends_at: form.elements.ends_at.value ? new Date(form.elements.ends_at.value).toISOString() : null, cta_label: form.elements.cta_label.value.trim() || null, cta_url: form.elements.cta_url.value.trim() || null, image_url: uploadedUrl || form.elements.image_url.value.trim() || null, priority: Number(form.elements.priority.value || 0), is_active: form.elements.is_active.checked };
          if (payload.ends_at && payload.ends_at <= payload.starts_at) throw new Error("Expiry must be after the start date.");
          const result = id ? await db.from("business_notices").update(payload).eq("id", id).eq("business_id", business.id) : await db.from("business_notices").insert(payload);
          if (result.error) throw result.error; closeDialog("noticeDialog"); await loadAll();
        } catch (error) { $("#noticeMessage").textContent = error.message; }
    };
    $("#branchForm").onsubmit = async event => {
        event.preventDefault(); const form = event.target; const id = form.elements.id.value; $("#branchMessage").textContent = "Saving branch…";
        const prepMin = Number(form.elements.prep_min_minutes.value || 20); const prepMax = Number(form.elements.prep_max_minutes.value || 30);
        if (prepMax < prepMin) return $("#branchMessage").textContent = "Maximum preparation time must be greater than or equal to the minimum.";
        const payload = { business_id: business.id, name: form.elements.name.value.trim(), code: form.elements.code.value.trim().toUpperCase(), phone: form.elements.phone.value.trim() || null, whatsapp_number: form.elements.whatsapp_number.value.trim() || null, address: form.elements.address.value.trim() || null, accepting_orders: form.elements.accepting_orders.checked, prep_min_minutes: prepMin, prep_max_minutes: prepMax, is_active: form.elements.is_active.checked };
        const result = id ? await db.from("branches").update(payload).eq("id", id).eq("business_id", business.id) : await db.from("branches").insert(payload);
        if (result.error) return $("#branchMessage").textContent = result.error.message; closeDialog("branchDialog"); await loadAll();
    };
    $("#paymentMethodForm").onsubmit = async event => {
        event.preventDefault(); const form = event.target; const id = form.elements.id.value;
        $("#paymentMethodMessage").textContent = "Saving payment method…";
        const payload = {
            business_id: business.id,
            branch_id: null,
            method_type: form.elements.method_type.value,
            display_name: form.elements.display_name.value.trim(),
            provider: form.elements.provider.value.trim() || null,
            account_name: form.elements.account_name.value.trim() || null,
            account_number: form.elements.account_number.value.trim() || null,
            instructions: form.elements.instructions.value.trim() || null,
            sort_order: Number(form.elements.sort_order.value || 0),
            is_active: form.elements.is_active.checked
        };
        const result = id ? await db.from("payment_methods").update(payload).eq("id", id).eq("business_id", business.id) : await db.from("payment_methods").insert(payload);
        if (result.error) return $("#paymentMethodMessage").textContent = result.error.message;
        closeDialog("paymentMethodDialog"); await loadAll();
    };

    $("#newProduct").onclick = () => categories.length ? editProduct() : alert("Create a category before adding a product.");
    $("#newNotice").onclick = () => editNotice();
    $("#noticesBody").onclick = async event => { const edit = event.target.closest("[data-notice-edit]"); if (edit) return editNotice(notices.find(item => item.id === edit.dataset.noticeEdit)); const toggle = event.target.closest("[data-notice-toggle]"); if (!toggle) return; toggle.disabled = true; const { error } = await db.from("business_notices").update({ is_active: toggle.dataset.value !== "true" }).eq("id", toggle.dataset.noticeToggle).eq("business_id", business.id); if (error) alert(error.message); await loadAll(); };
    $("#archiveNotice").onclick = async () => { const id = $("#noticeForm").elements.id.value; if (!confirm("Archive this notice? It will disappear from the customer app.")) return; const { error } = await db.from("business_notices").update({ is_active:false }).eq("id", id).eq("business_id", business.id); if (error) return $("#noticeMessage").textContent = error.message; closeDialog("noticeDialog"); await loadAll(); };
    $("#newCategory").onclick = () => editCategory(); $("#newBranch").onclick = () => editBranch(); $("#newPaymentMethod").onclick = () => editPaymentMethod();
    $("#addSize").onclick = () => addOptionRow($("#sizeRows")); $("#addExtra").onclick = () => addOptionRow($("#extraRows"));
    $("#productsBody").onclick = async event => { const edit = event.target.closest("[data-product-edit]"); if (edit) return editProduct(products.find(item => item.id === edit.dataset.productEdit)); const toggle = event.target.closest("[data-product-toggle]"); if (!toggle) return; const { error } = await db.from("products").update({ is_available: toggle.dataset.value !== "true" }).eq("id", toggle.dataset.productToggle).eq("business_id", business.id); if (error) alert(error.message); else loadAll(); };
    $("#categoriesBody").onclick = event => { const button = event.target.closest("[data-category-edit]"); if (button) editCategory(categories.find(item => item.id === button.dataset.categoryEdit)); };
    $("#branchesBody").onclick = event => { const button = event.target.closest("[data-branch-edit]"); if (button) editBranch(branches.find(item => item.id === button.dataset.branchEdit)); };
    $("#paymentMethodsBody").onclick = event => { const button = event.target.closest("[data-payment-edit]"); if (button) editPaymentMethod(paymentMethods.find(item => item.id === button.dataset.paymentEdit)); };
    $("#deleteProduct").onclick = async () => { const id = $("#productForm").elements.id.value; if (!confirm("Remove this product from the customer menu? Historical orders will be preserved.")) return; const { error } = await db.from("products").update({ is_active: false, is_available: false }).eq("id", id).eq("business_id", business.id); if (error) return $("#productMessage").textContent = error.message; closeDialog("productDialog"); await loadAll(); };
    $("#deleteCategory").onclick = async () => { const id = $("#categoryForm").elements.id.value; if (products.some(item => item.category_id === id)) return $("#categoryMessage").textContent = "Move or remove this category's products first."; const { error } = await db.from("categories").update({ is_active: false }).eq("id", id).eq("business_id", business.id); if (error) return $("#categoryMessage").textContent = error.message; closeDialog("categoryDialog"); await loadAll(); };
    $("#deleteBranch").onclick = async () => { const id = $("#branchForm").elements.id.value; if (!confirm("Deactivate this branch?")) return; const { error } = await db.from("branches").update({ is_active: false }).eq("id", id).eq("business_id", business.id); if (error) return $("#branchMessage").textContent = error.message; closeDialog("branchDialog"); await loadAll(); };
    $("#deactivatePaymentMethod").onclick = async () => { const id = $("#paymentMethodForm").elements.id.value; if (!confirm("Deactivate this payment method? Customers will no longer see it.")) return; const { error } = await db.from("payment_methods").update({ is_active: false }).eq("id", id).eq("business_id", business.id); if (error) return $("#paymentMethodMessage").textContent = error.message; closeDialog("paymentMethodDialog"); await loadAll(); };
    document.querySelectorAll("[data-close-dialog]").forEach(button => button.onclick = () => closeDialog(button.dataset.closeDialog));

    $("#settingsForm").onsubmit = async event => { event.preventDefault(); const form = event.target; try { const openingHours = parseJson(form.elements.opening_hours.value, "Opening hours"); const { error } = await db.from("business_settings").update({ display_name: form.elements.display_name.value, whatsapp_number: form.elements.whatsapp_number.value, phone: form.elements.phone.value, email: form.elements.email.value || null, default_delivery_fee: Number(form.elements.default_delivery_fee.value || 0), opening_hours: openingHours, delivery_enabled: form.elements.delivery_enabled.checked, pickup_enabled: form.elements.pickup_enabled.checked }).eq("business_id", business.id); alert(error ? error.message : "Settings saved"); } catch (error) { alert(error.message); } };
    $("#ordersBody").onchange = async event => {
        const orderId = event.target.dataset.orderStatus || event.target.dataset.paymentStatus;
        if (!orderId) return;
        const update = event.target.dataset.orderStatus ? { status: event.target.value } : { payment_status: event.target.value };
        const { error } = await db.from("platform_orders").update(update).eq("id", orderId).eq("business_id", business.id);
        if (error) alert(error.message); else loadAll();
    };
    $("#ordersBody").onclick = event => { const button = event.target.closest("[data-order-view]"); if (button) showOrder(orders.find(order => order.id === button.dataset.orderView)); };
    $("#overviewRecentOrders").onclick = event => { const button = event.target.closest("[data-order-view]"); if (button) showOrder(orders.find(order => order.id === button.dataset.orderView)); };
    $("#orderFilter").onchange = renderOrders;
    $("#branchFilter").onchange = () => { renderOrders(); renderStats(); };
    function showView(viewName) { document.querySelectorAll(".nav button,.view").forEach(item => item.classList.remove("active")); document.querySelector(`.nav button[data-view="${viewName}"]`)?.classList.add("active"); $("#" + viewName)?.classList.add("active"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    $("#nav").onclick = event => { const button = event.target.closest("button[data-view]"); if (button) showView(button.dataset.view); };
    document.querySelectorAll("[data-jump-view]").forEach(button => button.onclick = () => showView(button.dataset.jumpView));
    document.addEventListener("click", event => { if (event.target.matches("[data-refresh]")) loadAll(); });
    $("#showSignup").onclick = () => { $("#loginForm").classList.add("hidden"); $("#signupForm").classList.remove("hidden"); };
    $("#showLogin").onclick = () => { $("#signupForm").classList.add("hidden"); $("#loginForm").classList.remove("hidden"); };
    $("#forgotPassword").onclick = () => openPasswordDialog(false);
    $("#passwordForm").onsubmit = async event => {
        event.preventDefault();
        const form = event.target;
        $("#passwordMessage").textContent = passwordRecovery ? "Saving password…" : "Sending reset link…";
        if (passwordRecovery) {
            const { error } = await db.auth.updateUser({ password: form.elements.new_password.value });
            if (error) return $("#passwordMessage").textContent = error.message;
            $("#passwordMessage").textContent = "Password updated. You can now continue securely.";
            recoveryInProgress = false;
            closeDialog("passwordDialog");
            await session();
            return;
        }
        const redirectTo = `${location.origin}${location.pathname}`;
        const { error } = await db.auth.resetPasswordForEmail(form.elements.email.value.trim().toLowerCase(), { redirectTo });
        $("#passwordMessage").textContent = error ? error.message : "Reset link sent. Please check your email.";
    };
    $("#signupForm").onsubmit = async event => { event.preventDefault(); const form = new FormData(event.target); $("#signupMessage").textContent = "Creating account…"; const { data, error } = await db.auth.signUp({ email: String(form.get("email")).trim().toLowerCase(), password: form.get("password"), options: { data: { full_name: String(form.get("full_name")).trim() } } }); if (error) return $("#signupMessage").textContent = error.message; if (data.session) { await db.rpc("accept_business_invitation"); return session(); } $("#signupMessage").textContent = "Account created. Check your email to confirm it, then return here to sign in."; };
    $("#loginForm").onsubmit = async event => {
        event.preventDefault();
        const formElement = event.target;
        const submitButton = formElement.querySelector('button[type="submit"]');
        const form = new FormData(formElement);
        const credentials = { email: String(form.get("email") || "").trim().toLowerCase(), password: form.get("password") };
        $("#loginMessage").textContent = "Signing in…";
        if (submitButton) submitButton.disabled = true;
        try {
            let result = await db.auth.signInWithPassword(credentials);
            if (result.error && /failed to fetch/i.test(result.error.message || "")) {
                $("#loginMessage").textContent = "Connection interrupted. Retrying…";
                result = await db.auth.signInWithPassword(credentials);
            }
            if (result.error) throw result.error;
            await session();
        } catch (error) {
            const networkFailure = /failed to fetch|network|load failed/i.test(error?.message || "");
            $("#loginMessage").textContent = networkFailure
                ? "Could not reach the secure login service. Check your connection, then tap Sign in again."
                : (error?.message || "Sign in failed. Please try again.");
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    };
    $("#signOut").onclick = async () => { await db.auth.signOut(); showLogin(); };

    mountNotificationControl();
    if (businessSlug === "barimaba") {
        const headings = document.querySelectorAll(".option-heading");
        if (headings[1]) { headings[1].querySelector("strong").textContent = "Colors"; headings[1].querySelector("small").textContent = "Available product colours."; $("#addExtra").textContent = "Add color"; }
    }
    db.auth.onAuthStateChange(event => { if (event === "PASSWORD_RECOVERY") { recoveryInProgress = true; setTimeout(() => openPasswordDialog(true), 0); } });

    if (document.body.dataset.allowPreview === "true" && new URLSearchParams(location.search).has("preview")) {
        business = { id: "preview", name: businessLabel }; $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); $("#userName").textContent = "Preview mode";
        categories = [{id:"c1",name:"Pizza",slug:"pizza",description:"Sobers signature pizzas",sort_order:1,is_active:true},{id:"c2",name:"Sides",slug:"sides",description:"Sides and extras",sort_order:2,is_active:true}];
        products = [
            {id:"p1",category_id:"c1",name:"Pepperoni Pizza",description:"Mozzarella, pepperoni and Sobers tomato sauce.",base_price:60,image_url:"assets/sobers-pizza/pizzas/pepperoni.jpg",sort_order:1,is_available:true,is_active:true,options:{},categories:{name:"Pizza"}},
            {id:"p2",category_id:"c1",name:"BBQ Chicken Pizza",description:"Smoky barbecue chicken with a rich cheese finish.",base_price:80,image_url:"assets/sobers-pizza/pizzas/bbq-chicken.jpg",sort_order:2,is_available:true,is_active:true,options:{},categories:{name:"Pizza"}},
            {id:"p3",category_id:"c1",name:"Meat Lover Pizza",description:"A generous, loaded meat selection.",base_price:50,image_url:"assets/sobers-pizza/pizzas/meat-lovers.jpg",sort_order:3,is_available:true,is_active:true,options:{},categories:{name:"Pizza"}},
            {id:"p4",category_id:"c2",name:"Loaded Fries",description:"Crispy fries finished with Sobers loaded toppings.",base_price:60,image_url:"assets/sobers-pizza/sides/loaded-fries.jpg",sort_order:4,is_available:true,is_active:true,options:{},categories:{name:"Sides"}}
        ]; branches=[]; paymentMethods=[]; orders=[]; renderProducts(); renderCategories(); renderBranches(); renderPaymentMethods(); renderOrders(); renderStats(); $("#setupNotice").textContent = "Visual preview only — sample data is not saved.";
    } else session();
})();
