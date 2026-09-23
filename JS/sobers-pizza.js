document.addEventListener("DOMContentLoaded", () => {
  const welcome = document.querySelector("#spWelcome");
  const welcomeKey = "sobers-short-welcome-v1";

  if (welcome) {
    let hasSeenWelcome = false;

    try {
      hasSeenWelcome = localStorage.getItem(welcomeKey) === "1";
    } catch (_error) {
      hasSeenWelcome = false;
    }

    if (hasSeenWelcome) {
      welcome.remove();
    } else {
      welcome.hidden = false;
      welcome.setAttribute("aria-hidden", "false");
      document.body.classList.add("sp-welcome-open");

      window.setTimeout(() => welcome.classList.add("is-leaving"), 1650);
      window.setTimeout(() => {
        document.body.classList.remove("sp-welcome-open");
        welcome.remove();

        try {
          localStorage.setItem(welcomeKey, "1");
        } catch (_error) {
          /* The welcome remains optional when browser storage is unavailable. */
        }
      }, 2250);
    }
  }

  /* =====================================================
       SOBERS PIZZA BUSINESS SETTINGS
    ===================================================== */

  const BUSINESS = {
    whatsappNumber: "233204863743",
    currency: "GH₵",
    storageKey: "sobersPizzaCart",
    branchStorageKey: "sobersPizzaBranch",
  };
  const FALLBACK_BRANCHES = [
    { code: "MAIN-BRANCH", name: "PAKOS Road", address: "PAKOS Road, opposite Donewell Insurance Company", whatsapp_number: "233247836769", is_active: true },
    { code: "TTU-MAIN-CAMPUS", name: "TTU Main Campus", address: "Takoradi Technical University Main Campus", whatsapp_number: "233204863743", is_active: true },
  ];
  let branches = [...FALLBACK_BRANCHES];
  let selectedBranch = null;
  let settingsSync = Promise.resolve();

  function normalizeGhanaNumber(value) {
    let number = String(value || "").replace(/\D/g, "");
    if (number.startsWith("0")) number = `233${number.slice(1)}`;
    return number;
  }

  function chooseBranch(branch, remember = true) {
    if (!branch) return;
    selectedBranch = branch;
    const number = normalizeGhanaNumber(branch.whatsapp_number || branch.phone);
    if (number) applyWhatsAppNumber(number);
    document.querySelector("#spBranchLabel")?.replaceChildren(document.createTextNode(branch.name));
    document.querySelector("#spCheckoutBranchName")?.replaceChildren(document.createTextNode(branch.name));
    document.querySelectorAll("[data-branch-code]").forEach(button => button.classList.toggle("active", button.dataset.branchCode === branch.code));
    if (remember) try { localStorage.setItem(BUSINESS.branchStorageKey, branch.code); } catch (_) {}
  }

  function renderBranches() {
    const host = document.querySelector("#spBranchList");
    if (!host) return;
    host.innerHTML = branches.map(branch => `<button type="button" data-branch-code="${branch.code}"><span>⌖</span><span><strong>${branch.name}</strong><small>${branch.address || "Order from this location"}</small></span><i>→</i></button>`).join("");
    host.querySelectorAll("[data-branch-code]").forEach(button => button.addEventListener("click", () => { chooseBranch(branches.find(branch => branch.code === button.dataset.branchCode)); closeBranchChooser(); }));
  }

  function openBranchChooser() {
    const overlay = document.querySelector("#spBranchOverlay");
    if (!overlay) return;
    overlay.classList.add("active"); overlay.setAttribute("aria-hidden", "false"); document.body.classList.add("sp-modal-open");
  }

  function closeBranchChooser() {
    const overlay = document.querySelector("#spBranchOverlay");
    if (!overlay || !selectedBranch) return;
    overlay.classList.remove("active"); overlay.setAttribute("aria-hidden", "true"); document.body.classList.remove("sp-modal-open");
  }

  function applyWhatsAppNumber(number) {
    const normalized = String(number || "").replace(/\D/g, "");
    if (!normalized) return;
    BUSINESS.whatsappNumber = normalized;
    document.querySelectorAll("[data-business-whatsapp]").forEach((link) => {
      link.href = `https://wa.me/${normalized}`;
    });
  }

  async function syncBusinessSettings() {
    const supabaseUrl = "https://inthadecmxmbqexufzpe.supabase.co";
    const publishableKey = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";
    const headers = { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` };
    try {
      const businessResponse = await fetch(
        `${supabaseUrl}/rest/v1/businesses?slug=eq.sobers-pizza&status=eq.active&select=id&limit=1`,
        { headers, cache: "no-store" },
      );
      const [businessRow] = businessResponse.ok ? await businessResponse.json() : [];
      if (!businessRow) return BUSINESS.whatsappNumber;
      const [settingsResponse, branchesResponse] = await Promise.all([
        fetch(`${supabaseUrl}/rest/v1/business_settings?business_id=eq.${businessRow.id}&select=whatsapp_number&limit=1`, { headers, cache: "no-store" }),
        fetch(`${supabaseUrl}/rest/v1/branches?business_id=eq.${businessRow.id}&is_active=eq.true&select=id,code,name,address,phone,whatsapp_number,is_active&order=name.asc`, { headers, cache: "no-store" }),
      ]);
      const [settings] = settingsResponse.ok ? await settingsResponse.json() : [];
      const liveBranches = branchesResponse.ok ? await branchesResponse.json() : [];
      if (liveBranches.length) branches = liveBranches;
      renderBranches();
      let savedCode = "";
      try { savedCode = localStorage.getItem(BUSINESS.branchStorageKey) || ""; } catch (_) {}
      chooseBranch(branches.find(branch => branch.code === savedCode) || branches.find(branch => branch.code === "MAIN-BRANCH") || branches[0], false);
      if (!savedCode) window.setTimeout(openBranchChooser, 2350);
      if (!selectedBranch) applyWhatsAppNumber(settings?.whatsapp_number);
    } catch (error) {
      console.warn("Sobers settings could not be refreshed; using the last available number.");
    }
    return BUSINESS.whatsappNumber;
  }

  renderBranches();
  let initialBranchCode = "";
  try { initialBranchCode = localStorage.getItem(BUSINESS.branchStorageKey) || ""; } catch (_) {}
  chooseBranch(branches.find(branch => branch.code === initialBranchCode) || branches[0], false);
  document.querySelector("#spBranchButton")?.addEventListener("click", openBranchChooser);
  document.querySelector("#spCheckoutBranch")?.addEventListener("click", openBranchChooser);
  document.querySelector("#spBranchClose")?.addEventListener("click", closeBranchChooser);

  /* =====================================================
       SOBERS MENU
    ===================================================== */

  const MENU = {
    margherita: {
      name: "Margherita",
      price: 100,
      featured: true,
      category: "classic",
      image: "/assets/sobers-pizza/pizzas/margherita.jpg",
      description: "Tomato, mozzarella and fresh herbs.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            olives: ["Olives", 10],
            jalapeno: ["Jalapeños", 8],
          },
        ],
      },
    },

    pepperoni: {
      name: "Pepperoni Feast",
      price: 115,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/pepperoni.jpg",
      description: "Loaded with pepperoni, mozzarella and rich tomato sauce.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            pepperoni: ["Extra pepperoni", 20],
            jalapeno: ["Jalapeños", 8],
          },
        ],
      },
    },

    chicken: {
      name: "Pineapple Pizza",
      price: 120,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/pineapple.jpg",
      description: "Pineapple, sweet pepper, onion and mozzarella.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            chicken: ["Extra chicken", 20],
            mushroom: ["Mushrooms", 10],
          },
        ],
      },
    },

    meat: {
      name: "Meat Lovers",
      price: 135,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/meat-lovers.jpg",
      description: "A bold mix of chicken, beef, sausage and pepperoni.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            sausage: ["Extra sausage", 18],
            beef: ["Extra beef", 20],
          },
        ],
      },
    },

    bbqChicken: {
      name: "BBQ Chicken",
      price: 125,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/bbq-chicken.jpg",
      description: "Tender chicken, smoky BBQ sauce, onions and mozzarella.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            chicken: ["Extra chicken", 20],
            jalapeno: ["Jalapeños", 8],
          },
        ],
      },
    },

    beefPepper: {
      name: "Beef & Pepper",
      price: 125,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/beef-pepper.jpg",
      description: "Seasoned beef, peppers, onions and melted mozzarella.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            beef: ["Extra beef", 20],
            jalapeno: ["Jalapeños", 8],
          },
        ],
      },
    },

    veggie: {
      name: "Veggie Supreme",
      price: 110,
      featured: true,
      category: "classic",
      image: "/assets/sobers-pizza/pizzas/veggie.jpg",
      description: "Fresh peppers, onions, mushrooms, olives and mozzarella.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            olives: ["Extra olives", 10],
            mushroom: ["Extra mushrooms", 10],
          },
        ],
      },
    },

    spicySobers: {
      name: "Spicy Sobers",
      price: 125,
      featured: true,
      category: "meat",
      image: "/assets/sobers-pizza/pizzas/spicy-sobers.jpg",
      description: "A fiery combination of spicy toppings, peppers and mozzarella.",
      options: {
        size: [
          "Size",
          "radio",
          {
            regular: ["Regular", 80],
            large: ["Large", 100],
            family: ["Family", 150],
          },
        ],
        extras: [
          "Extra toppings",
          "checkbox",
          {
            cheese: ["Extra cheese", 12],
            pepperoni: ["Extra pepperoni", 20],
            jalapeno: ["Extra Jalapeños", 8],
          },
        ],
      },
    },

    wings: {
      name: "Spicy Chicken Wings",
      price: 65,
      category: "sides",
      image: "/assets/sobers-pizza/sides/wings.jpg",
      description: "Crispy wings tossed in a spicy Sobers sauce.",
      options: {},
    },

    fries: {
      name: "French Fries",
      price: 40,
      category: "sides",
      image: "/assets/sobers-pizza/sides/fries.jpg",
      description: "Golden, crispy and perfectly seasoned.",
      options: {},
    },

    loadedFries: {
      name: "Loaded Fries",
      price: 65,
      category: "sides",
      image: "/assets/sobers-pizza/sides/loaded-fries.jpg",
      description: "Crispy fries loaded with delicious toppings.",
      options: {},
    },

    chickenStrips: {
      name: "Chicken Strips",
      price: 60,
      category: "sides",
      image: "/assets/sobers-pizza/sides/chicken-strips.jpg",
      description: "Crispy golden chicken strips served fresh.",
      options: {},
    },

    coke: {
      name: "Coca-Cola",
      price: 15,
      category: "sides",
      image: "/assets/sobers-pizza/drinks/coke.jpg",
      description: "Ice-cold Coca-Cola.",
      options: {},
    },

    fanta: {
      name: "Fanta",
      price: 15,
      category: "sides",
      image: "/assets/sobers-pizza/drinks/fanta.jpg",
      description: "Refreshing Fanta.",
      options: {},
    },

    sprite: {
      name: "Sprite",
      price: 15,
      category: "sides",
      image: "/assets/sobers-pizza/drinks/sprite.jpg",
      description: "Refreshing Sprite.",
      options: {},
    },

    water: {
      name: "Bottled Water",
      price: 10,
      category: "sides",
      image: "/assets/sobers-pizza/drinks/water.jpg",
      description: "Chilled bottled water.",
      options: {},
    },
  };

  /* =====================================================
       LIVE MENU SYNC
       The built-in menu remains the offline fallback.
    ===================================================== */

  async function syncMenuFromDatabase() {
    const supabaseUrl = "https://inthadecmxmbqexufzpe.supabase.co";

    const publishableKey = "sb_publishable_G6-TdmABB0bA93gzDZVElw_Q2VrwE80";

    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
    };

    try {
      const businessResponse = await fetch(
        `${supabaseUrl}/rest/v1/businesses?slug=eq.sobers-pizza&status=eq.active&select=id&limit=1`,
        { headers },
      );

      if (!businessResponse.ok) {
        throw new Error("Sobers business settings could not be loaded.");
      }

      const [businessRow] = await businessResponse.json();

      if (!businessRow) {
        throw new Error("Sobers is not active in the platform database.");
      }

      const [productsResponse, settingsResponse] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/products?business_id=eq.${businessRow.id}&is_active=eq.true&is_available=eq.true&select=slug,name,description,image_url,base_price,options,sort_order,categories!inner(slug,name,is_active)&categories.is_active=eq.true&order=sort_order.asc`,
          { headers },
        ),
        fetch(
          `${supabaseUrl}/rest/v1/business_settings?business_id=eq.${businessRow.id}&select=whatsapp_number&limit=1`,
          { headers },
        ),
      ]);

      if (!productsResponse.ok) {
        throw new Error("The live Sobers menu could not be loaded.");
      }

      const liveProducts = await productsResponse.json();

      if (!liveProducts.length) {
        return;
      }

      Object.keys(MENU).forEach((key) => delete MENU[key]);

      liveProducts.forEach((product) => {
        MENU[product.slug] = {
          name: product.name,
          price: Number(product.base_price),
          featured: false,
          category: product.categories.slug,
          image: product.image_url || "assets/logo/favicon-512.png",
          description: product.description || "",
          options: product.options || {},
        };
      });

      const categoryHost = document.querySelector(".sp-category-pills");
      if (categoryHost) {
        const categoryLabels = new Map(liveProducts.map(product => [product.categories.slug, product.categories.name]));
        categoryHost.innerHTML = `<button type="button" class="active" data-filter="all">All menu</button>${[...categoryLabels].map(([slug,label]) => `<button type="button" data-filter="${slug}">${label}</button>`).join("")}`;
      }

      if (settingsResponse.ok) {
        const [settings] = await settingsResponse.json();

        if (settings?.whatsapp_number && !selectedBranch) {
          applyWhatsAppNumber(settings.whatsapp_number);
        }
      }

      renderMenu();
    } catch (error) {
      console.warn("Sobers live menu unavailable; using the offline menu:", error);
    }
  }

  /* =====================================================
       HELPERS
    ===================================================== */

  const $ = (selector) => document.querySelector(selector);

  const money = (amount) => `${BUSINESS.currency}${Number(amount).toFixed(2)}`;

  const availableProductChoices = (groupKey, choices = {}) =>
    Object.entries(choices).filter(
      ([choiceKey]) => groupKey !== "size" || choiceKey !== "mini",
    );

  const productStartingPrice = (product) => {
    const sizeChoices = product?.options?.size?.[2];
    const firstAvailable = sizeChoices
      ? availableProductChoices("size", sizeChoices).sort((left, right) => {
          const order = ["small", "medium", "large", "x_large", "regular", "family"];
          const a = order.indexOf(left[0]);
          const b = order.indexOf(right[0]);
          return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
        })[0]?.[1]
      : null;
    return Number(product?.price || 0) + Number(firstAvailable?.[1] || 0);
  };

  const appAssetUrl = (value) => {
    if (!value) {
      return "assets/logo/favicon-512.png";
    }

    if (/^(?:https?:|data:|blob:)/i.test(value)) {
      return value;
    }

    return value.replace(/^\/+/, "");
  };

  /* =====================================================
       CART
    ===================================================== */

  let cart = [];

  try {
    cart = JSON.parse(localStorage.getItem(BUSINESS.storageKey)) || [];
  } catch (error) {
    console.warn("Could not load Sobers cart:", error);

    cart = [];
  }

  /* =====================================================
       ACTIVE PRODUCT STATE
    ===================================================== */

  let activeProduct = null;
  let activeProductKey = null;
  let activeOptions = {};
  let activeQty = 1;

  /* =====================================================
       PRODUCT MODAL
    ===================================================== */

  const productModal = document.createElement("div");

  productModal.className = "sp-product-overlay";

  productModal.innerHTML = `

        <section
            class="sp-product-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Customize product"
        >

            <button
                type="button"
                class="sp-modal-close"
                aria-label="Close"
            >
                ×
            </button>

            <img
                src=""
                alt=""
            >

            <div>

                <p>SOBERS PIZZA</p>

                <h2></h2>

                <span
                    class="sp-product-description"
                ></span>

                <div
                    class="sp-option-groups"
                ></div>

                <div class="sp-modal-bottom">

                    <div class="sp-quantity">

                        <button
                            type="button"
                            data-qty="-1"
                            aria-label="Decrease quantity"
                        >
                            −
                        </button>

                        <strong>1</strong>

                        <button
                            type="button"
                            data-qty="1"
                            aria-label="Increase quantity"
                        >
                            +
                        </button>

                    </div>

                    <button
                        type="button"
                        class="sp-add-button"
                    >
                        Add to cart · <b></b>
                    </button>

                </div>

            </div>

        </section>

    `;

  document.body.appendChild(productModal);

  /* =====================================================
       PRODUCT TOTAL
    ===================================================== */

  function productTotal() {
    if (!activeProduct) {
      return 0;
    }

    let total = activeProduct.price;

    Object.entries(activeOptions).forEach(([groupKey, value]) => {
      const choices = activeProduct.options[groupKey]?.[2];

      if (!choices) {
        return;
      }

      const selected = Array.isArray(value) ? value : [value];

      selected.forEach((choice) => {
        total += Number(choices[choice]?.[1] || 0);
      });
    });

    return total * activeQty;
  }

  /* =====================================================
       OPTION NAMES
    ===================================================== */

  function optionNames(item) {
    if (!item || !item.options) {
      return [];
    }

    const menuProduct = MENU[item.key];

    if (!menuProduct) {
      return [];
    }

    const names = [];

    Object.entries(item.options).forEach(([groupKey, value]) => {
      const group = menuProduct.options[groupKey];

      if (!group) {
        return;
      }

      const choices = group[2];

      const selected = Array.isArray(value) ? value : [value];

      selected.forEach((choice) => {
        const name = choices[choice]?.[0];

        if (name) {
          names.push(name);
        }
      });
    });

    return names;
  }

  /* =====================================================
       SAVE CART
    ===================================================== */

  function save() {
    try {
      localStorage.setItem(BUSINESS.storageKey, JSON.stringify(cart));
    } catch (error) {
      console.error("Sobers Pizza cart save failed:", error);
    }
  }

  /* =====================================================
   RENDER MENU
   GROUP PRODUCTS BY CATEGORY
===================================================== */

  let activeMenuFilter = "all";
  let menuSearchQuery = "";

  function renderMenu(filter = activeMenuFilter) {
    activeMenuFilter = filter;
    const grid = $("#spMenuGrid");

    if (!grid) {
      console.warn("Sobers menu grid #spMenuGrid was not found.");

      return;
    }

    grid.innerHTML = "";

    /* =================================================
       CATEGORY NAMES
    ================================================= */

    const categoryNames = {
      pizza: "PIZZA",

      classic: "PIZZA CLASSIC",

      meat: "MEAT LOVERS",

      sides: "SIDES",

      drinks: "DRINKS",

      shawarma: "SHAWARMA",

      promo: "PROMO",

      promotions: "PROMO",
    };

    /* =================================================
       CATEGORY ORDER
    ================================================= */

    const categoryOrder = [
      "meat-pack",
      "veggie-pack",
      "seafood",
      "sobers-special",
      "fruity-pack",
      "pizza-pies",
      "shawarma",
      "chicken-sides",
      "loaded-fries",
      "ice-cream",
      "drinks",
      "juice-bar",
      "promo-packs",
      "pizza",

      "classic",

      "meat",

      "shawarma",

      "sides",

      "drinks",

      "promo",

      "promotions",
    ];

    /* =================================================
       FILTER PRODUCTS
    ================================================= */

    const products = Object.entries(MENU).filter(([, product]) => {
      const inCategory = filter === "all" || product.category === filter;
      const searchable = `${product.name} ${product.description} ${product.category}`.toLowerCase();
      return inCategory && (!menuSearchQuery || searchable.includes(menuSearchQuery));
    });

    const searchStatus = $("#spSearchStatus");
    if (searchStatus) searchStatus.textContent = menuSearchQuery ? `${products.length} matching item${products.length === 1 ? "" : "s"}` : `${products.length} menu item${products.length === 1 ? "" : "s"}`;
    if (!products.length) {
      grid.innerHTML = `<div class="sp-menu-empty"><strong>No menu item found</strong><span>Try another name or choose All menu.</span></div>`;
      return;
    }

    /* =================================================
       GROUP PRODUCTS BY CATEGORY
    ================================================= */

    const grouped = {};

    products.forEach(([key, product]) => {
      const category = product.category || "other";

      if (!grouped[category]) {
        grouped[category] = [];
      }

      grouped[category].push([key, product]);
    });

    /* =================================================
       DETERMINE CATEGORY ORDER
    ================================================= */

    const categories = Object.keys(grouped).sort((a, b) => {
      const indexA = categoryOrder.indexOf(a);

      const indexB = categoryOrder.indexOf(b);

      if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
      }

      if (indexA === -1) {
        return 1;
      }

      if (indexB === -1) {
        return -1;
      }

      return indexA - indexB;
    });

    /* =================================================
       RENDER EACH CATEGORY SECTION
    ================================================= */

    let imageRenderIndex = 0;

    categories.forEach((category) => {
      const section = document.createElement("section");

      section.className = "sp-menu-category";

      /* -----------------------------------------
               CATEGORY TITLE
            ----------------------------------------- */

      const heading = document.createElement("h2");

      heading.className = "sp-menu-category-title";

      heading.textContent = categoryNames[category] || category.replace(/[-_]/g, " ").toUpperCase();

      section.appendChild(heading);

      /* -----------------------------------------
               CATEGORY PRODUCT GRID
            ----------------------------------------- */

      const categoryGrid = document.createElement("div");

      categoryGrid.className = "sp-menu-category-grid";

      /* -----------------------------------------
               RENDER PRODUCTS
            ----------------------------------------- */

      grouped[category].forEach(([key, product]) => {
        const imagePriority = imageRenderIndex++;
        const card = document.createElement("article");

        card.className = "sp-menu-card";

        card.innerHTML = `

                        <div class="sp-menu-image">

                            <img
                                src="${appAssetUrl(product.image)}"
                                alt="${product.name}"
                                loading="${imagePriority < 4 ? "eager" : "lazy"}"
                                decoding="async"
                                fetchpriority="${imagePriority < 4 ? "high" : "auto"}"
                            >

                            ${
                              product.featured
                                ? `
                                        <span
                                            class="sp-menu-badge"
                                        >
                                            BEST SELLER
                                        </span>
                                    `
                                : ""
                            }

                        </div>


                        <div>

                            <div>

                                <p>
                                    ${
                                      categoryNames[category] ||
                                      category.replace(/[-_]/g, " ").toUpperCase()
                                    }
                                </p>


                                <h3>
                                    ${product.name}
                                </h3>


                                <span>
                                    ${product.description}
                                </span>


                                <footer>

                                    <strong>
                                        From
                                        ${money(productStartingPrice(product))}
                                    </strong>


                                    <button
                                        type="button"
                                        data-product="${key}"
                                    >
                                        View & Order
                                    </button>

                                </footer>

                            </div>

                        </div>

                    `;

        categoryGrid.appendChild(card);
      });

      section.appendChild(categoryGrid);

      grid.appendChild(section);
    });
  }

  /* =====================================================
       RENDER CART
    ===================================================== */

  function renderCart() {
    const list = $("#spCartItems");

    if (!list) {
      return;
    }

    const total = cart.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
      0,
    );

    const count = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

    const cartCount = $("#spCartCount");

    if (cartCount) {
      cartCount.textContent = count;
    }
    const dockCount = $("#spDockCartCount");
    if (dockCount) dockCount.textContent = count;

    const cartTotal = $("#spCartTotal");

    if (cartTotal) {
      cartTotal.textContent = money(total);
    }

    const checkoutTotal = $("#spCheckoutTotal");

    if (checkoutTotal) {
      checkoutTotal.textContent = money(total);
    }

    const empty = $("#spEmpty");

    if (empty) {
      empty.hidden = cart.length > 0;
    }

    list.innerHTML = cart
      .map(
        (item) => `

                        <article
                            class="sp-cart-item"
                        >

                            <div>

                                <h3>
                                    ${item.name}
                                </h3>

                                <small>
                                    ${optionNames(item).join(" · ")}
                                </small>

                                <span>
                                    ${money(Number(item.price) * Number(item.qty))}
                                </span>

                            </div>

                            <div
                                class="sp-cart-controls"
                            >

                                <button
                                    type="button"
                                    data-cart="minus"
                                    data-id="${item.id}"
                                >
                                    −
                                </button>

                                <b>
                                    ${item.qty}
                                </b>

                                <button
                                    type="button"
                                    data-cart="plus"
                                    data-id="${item.id}"
                                >
                                    +
                                </button>

                                <button
                                    type="button"
                                    data-cart="remove"
                                    data-id="${item.id}"
                                    aria-label="Remove item"
                                >
                                    ×
                                </button>

                            </div>

                        </article>

                    `,
      )
      .join("");

    save();
  }

  /* =====================================================
       OPEN PRODUCT
    ===================================================== */

  function openProduct(key) {
    if (!MENU[key]) {
      return;
    }

    activeProductKey = key;

    activeProduct = MENU[key];

    activeOptions = {};

    activeQty = 1;

    const image = productModal.querySelector("img");

    const title = productModal.querySelector("h2");

    const description = productModal.querySelector(".sp-product-description");

    const groups = productModal.querySelector(".sp-option-groups");

    if (image) {
      image.src = appAssetUrl(activeProduct.image);

      image.alt = activeProduct.name;
    }

    if (title) {
      title.textContent = activeProduct.name;
    }

    if (description) {
      description.textContent = activeProduct.description;
    }

    if (groups) {
      groups.innerHTML = "";

      Object.entries(activeProduct.options || {}).forEach(([groupKey, groupData]) => {
        const [label, type, choices] = groupData;

        const field = document.createElement("fieldset");

        field.innerHTML = `<legend>${label}</legend>`;

        const choiceOrder = ["mini","mini_small","small","medium","large","x_large","regular","family","two","four","seven","eight","twelve","fifteen","twenty_four"];
        const orderedChoices = availableProductChoices(groupKey, choices).sort(([left],[right]) => {
          const a = choiceOrder.indexOf(left), b = choiceOrder.indexOf(right);
          return (a < 0 ? 999 : a) - (b < 0 ? 999 : b);
        });
        orderedChoices.forEach(([choiceKey, choiceData], choiceIndex) => {
          const [name, extra] = choiceData;

          const entry = document.createElement("label");

          entry.innerHTML = `

                                    <input
                                        type="${type}"
                                        name="${groupKey}"
                                        value="${choiceKey}"
                                    >

                                    <span>
                                        ${name}
                                    </span>

                                    <em>
                                        ${type === "radio" ? money(activeProduct.price + Number(extra || 0)) : (extra ? `+${money(extra)}` : "Included")}
                                    </em>

                                `;

          const input = entry.querySelector("input");

          if (input) {
            if (type === "radio" && choiceIndex === 0) {
              input.checked = true;
              activeOptions[groupKey] = choiceKey;
            }
            input.addEventListener("change", (event) => {
              if (type === "radio") {
                activeOptions[groupKey] = event.target.value;
              } else {
                const values = activeOptions[groupKey] || [];

                activeOptions[groupKey] = event.target.checked
                  ? [...values, choiceKey]
                  : values.filter((value) => value !== choiceKey);
              }

              updateProductTotal();
            });
          }

          field.appendChild(entry);
        });

        groups.appendChild(field);
      });
    }

    updateProductTotal();

    productModal.classList.add("active");

    document.body.classList.add("sp-modal-open");
  }

  /* =====================================================
       PRODUCT TOTAL UI
    ===================================================== */

  function updateProductTotal() {
    const quantity = productModal.querySelector(".sp-quantity strong");

    const addButton = productModal.querySelector(".sp-add-button b");

    if (quantity) {
      quantity.textContent = activeQty;
    }

    if (addButton) {
      addButton.textContent = money(productTotal());
    }
  }

  /* =====================================================
       CLOSE PRODUCT
    ===================================================== */

  function closeProduct() {
    productModal.classList.remove("active");

    document.body.classList.remove("sp-modal-open");
  }

  /* =====================================================
       ADD PRODUCT
    ===================================================== */

  function addProduct() {
    if (!activeProduct) {
      return;
    }

    const signature = JSON.stringify(activeOptions);

    const encodedSignature = btoa(encodeURIComponent(signature));

    const id = `${activeProductKey}-${encodedSignature}`;

    const unitPrice = productTotal() / activeQty;

    const found = cart.find((item) => item.id === id);

    if (found) {
      found.qty += activeQty;
    } else {
      cart.push({
        id,

        key: activeProductKey,

        name: activeProduct.name,

        price: unitPrice,

        qty: activeQty,

        options: JSON.parse(JSON.stringify(activeOptions)),
      });
    }

    renderCart();

    closeProduct();

    openCart();
  }

  /* =====================================================
       CART
    ===================================================== */

  function openCart() {
    const cartPanel = $("#spCart");

    const overlay = $("#spCartOverlay");

    if (!cartPanel || !overlay) {
      return;
    }

    cartPanel.classList.add("active");

    overlay.classList.add("active");

    cartPanel.setAttribute("aria-hidden", "false");

    document.body.classList.add("sp-cart-open");
  }

  function closeCart() {
    const cartPanel = $("#spCart");

    const overlay = $("#spCartOverlay");

    if (!cartPanel || !overlay) {
      return;
    }

    cartPanel.classList.remove("active");

    overlay.classList.remove("active");

    cartPanel.setAttribute("aria-hidden", "true");

    document.body.classList.remove("sp-cart-open");
  }

  /* =====================================================
       CHECKOUT
    ===================================================== */

  function openCheckout() {
    if (!cart.length) {
      alert("Your cart is empty.");

      return;
    }

    closeCart();

    const checkoutOverlay = $("#spCheckoutOverlay");

    if (!checkoutOverlay) {
      return;
    }

    checkoutOverlay.classList.add("active");

    checkoutOverlay.setAttribute("aria-hidden", "false");

    document.body.classList.add("sp-modal-open");
  }

  function closeCheckout() {
    const checkoutOverlay = $("#spCheckoutOverlay");

    if (!checkoutOverlay) {
      return;
    }

    checkoutOverlay.classList.remove("active");

    checkoutOverlay.setAttribute("aria-hidden", "true");

    document.body.classList.remove("sp-modal-open");
  }

  /* =====================================================
       CLEAR CART AFTER ORDER
    ===================================================== */

  function clearCartAfterOrder() {
    cart = [];

    localStorage.removeItem(BUSINESS.storageKey);

    renderCart();

    const checkoutForm = $("#spCheckoutForm");

    if (checkoutForm) {
      checkoutForm.reset();
    }

    closeCheckout();
  }

  /* =====================================================
       MENU CLICK
    ===================================================== */

  const menuGrid = $("#spMenuGrid");

  if (menuGrid) {
    menuGrid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-product]");

      if (!button) {
        return;
      }

      openProduct(button.dataset.product);
    });
  }

  /* =====================================================
       FILTERS
    ===================================================== */

  document.addEventListener("click", event => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      if (button.tagName === "A") event.preventDefault();
      const filter = button.dataset.filter;

      document.querySelectorAll("[data-filter]").forEach((item) => {
        item.classList.toggle("active", item.dataset.filter === filter);
      });

      renderMenu(filter);

      const menuSection = $("#menu");

      if (menuSection) {
        menuSection.scrollIntoView({
          behavior: "smooth",
        });
      }
  });

  const menuSearch = $("#spMenuSearch");
  if (menuSearch) menuSearch.addEventListener("input", event => { menuSearchQuery = event.target.value.trim().toLowerCase(); renderMenu(); });
  $("#spSearchClear")?.addEventListener("click", () => { menuSearch.value = ""; menuSearchQuery = ""; renderMenu(); menuSearch.focus(); });
  document.querySelector("[data-mobile-search]")?.addEventListener("click", () => { $("#menu")?.scrollIntoView({behavior:"smooth"}); setTimeout(() => menuSearch?.focus(), 450); });
  document.querySelector("[data-mobile-cart]")?.addEventListener("click", () => $("#spCartButton")?.click());

  /* =====================================================
       PRODUCT MODAL EVENTS
    ===================================================== */

  const productClose = productModal.querySelector(".sp-modal-close");

  if (productClose) {
    productClose.addEventListener("click", closeProduct);
  }

  productModal.addEventListener("click", (event) => {
    if (event.target === productModal) {
      closeProduct();

      return;
    }

    const button = event.target.closest("button[data-qty]");

    if (!button) {
      return;
    }

    activeQty = Math.max(1, activeQty + Number(button.dataset.qty));

    updateProductTotal();
  });

  const addButton = productModal.querySelector(".sp-add-button");

  if (addButton) {
    addButton.addEventListener("click", addProduct);
  }

  /* =====================================================
       CART EVENTS
    ===================================================== */

  const cartButton = $("#spCartButton");

  if (cartButton) {
    cartButton.addEventListener("click", openCart);
  }

  const cartClose = $("#spCartClose");

  if (cartClose) {
    cartClose.addEventListener("click", closeCart);
  }

  const cartOverlay = $("#spCartOverlay");

  if (cartOverlay) {
    cartOverlay.addEventListener("click", closeCart);
  }

  const cartItems = $("#spCartItems");

  if (cartItems) {
    cartItems.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-cart]");

      if (!button) {
        return;
      }

      const item = cart.find((entry) => entry.id === button.dataset.id);

      if (!item) {
        return;
      }

      if (button.dataset.cart === "plus") {
        item.qty++;
      }

      if (button.dataset.cart === "minus") {
        item.qty--;
      }

      if (button.dataset.cart === "remove" || item.qty < 1) {
        cart = cart.filter((entry) => entry.id !== item.id);
      }

      renderCart();
    });
  }

  /* =====================================================
       CHECKOUT EVENTS
    ===================================================== */

  const checkoutButton = $("#spCheckoutButton");

  if (checkoutButton) {
    checkoutButton.addEventListener("click", openCheckout);
  }

  const checkoutClose = $("#spCheckoutClose");

  if (checkoutClose) {
    checkoutClose.addEventListener("click", closeCheckout);
  }

  const checkoutOverlay = $("#spCheckoutOverlay");

  if (checkoutOverlay) {
    checkoutOverlay.addEventListener("click", (event) => {
      if (event.target === checkoutOverlay) {
        closeCheckout();
      }
    });
  }

  /* =====================================================
       DELIVERY / PICKUP
    ===================================================== */

  const fulfilmentInputs = document.querySelectorAll('input[name="fulfilment"]');

  fulfilmentInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const selected = document.querySelector('input[name="fulfilment"]:checked');

      if (!selected) {
        return;
      }

      const delivery = selected.value === "Delivery";

      const addressField = $("#spAddressField");

      const checkoutForm = $("#spCheckoutForm");

      if (addressField) {
        addressField.hidden = !delivery;
      }

      if (checkoutForm && checkoutForm.elements.address) {
        checkoutForm.elements.address.required = delivery;
      }
    });
  });

  /* =====================================================
       WHATSAPP CHECKOUT
    ===================================================== */

  const checkoutForm = $("#spCheckoutForm");

  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!cart.length) {
        alert("Your cart is empty.");

        return;
      }

      const submitButton = checkoutForm.querySelector('button[type="submit"]');

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const form = new FormData(event.target);

        const total = cart.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);

        const customerName = String(form.get("name") || "").trim();

        const customerPhone = String(form.get("phone") || "").trim();

        const fulfilment = String(form.get("fulfilment") || "").trim();

        const address = String(form.get("address") || "").trim();

        const note = String(form.get("note") || "").trim();

        if (!customerName) {
          alert("Please enter your name.");

          return;
        }

        if (!customerPhone) {
          alert("Please enter your phone number.");

          return;
        }

        const normalizedCustomerPhone = customerPhone.replace(/[^+\d]/g, "");

        if (!/^\+?\d{10,15}$/.test(normalizedCustomerPhone)) {
          alert("Please enter a valid phone number with 10 to 15 digits.");

          return;
        }

        if (!fulfilment) {
          alert("Please select Delivery or Pickup.");

          return;
        }

        if (fulfilment === "Delivery" && !address) {
          alert("Please enter your delivery address.");

          return;
        }

        /* =========================================
                       SAVE ORDER TO PLATFORM DATABASE
                       WhatsApp remains available if offline.
                    ========================================= */

        const databaseOrder = {
          business_slug: "sobers-pizza",

          branch_code: selectedBranch?.code || "MAIN-BRANCH",

          customer_name: customerName,

          customer_phone: customerPhone,

          fulfilment: fulfilment.toLowerCase(),

          delivery_address: fulfilment === "Delivery" ? address : null,

          customer_note: note || null,

          requested_items: cart.map((item) => ({
            product_key: item.key,

            quantity: Number(item.qty),

            selected_options: item.options || {},
          })),
        };

        // Open the destination synchronously while the submit gesture is still
        // active. Mobile browsers may block a new window opened after awaits.
        const whatsappWindow = window.open("about:blank", "_blank");

        if (whatsappWindow) {
          whatsappWindow.opener = null;
          whatsappWindow.document.title = "Preparing Sobers order";
          whatsappWindow.document.body.textContent = "Preparing your WhatsApp order…";
        }

        const databasePromise = window.SobersPlatformOrders
          ? window.SobersPlatformOrders.submit(databaseOrder)
          : Promise.resolve({ saved: false, queued: false, result: null });

        await settingsSync;
        const [, databaseResult] = await Promise.all([syncBusinessSettings(), databasePromise]);

        const orderNumber = databaseResult.result?.order_number || "";

        /* =========================================
                       CREATE WHATSAPP ORDER MESSAGE
                    ========================================= */

        const lines = cart.map((item, index) => {
          const options = optionNames(item);

          return (
            `${index + 1}. ` +
            `${item.qty} × ` +
            `${item.name}` +
            (options.length ? ` (${options.join(", ")})` : "") +
            ` — ${money(Number(item.price) * Number(item.qty))}`
          );
        });

        const message = [
          "*NEW SOBERS PIZZA ORDER*",

          orderNumber ? `Order: ${orderNumber}` : "",

          `Branch: ${selectedBranch?.name || "PAKOS Road"}`,

          "",

          ...lines,

          "",

          `*Subtotal: ${money(total)}*`,

          "Delivery fee: to be confirmed",

          "",

          `Name: ${customerName}`,

          `Phone: ${customerPhone}`,

          `Order type: ${fulfilment}`,

          fulfilment === "Delivery" ? `Address: ${address}` : "Pickup",

          note ? `Note: ${note}` : "",
        ]
          .filter(Boolean)
          .join("\n");

        /* =========================================
                       OPEN WHATSAPP
                    ========================================= */

        const whatsappURL =
          `https://wa.me/${BUSINESS.whatsappNumber}` + `?text=${encodeURIComponent(message)}`;

        if (whatsappWindow) {
          whatsappWindow.location.replace(whatsappURL);
        } else {
          window.location.href = whatsappURL;
        }

        /* =========================================
                       CLEAR CART
                    ========================================= */

        clearCartAfterOrder();

        alert(
          databaseResult.saved
            ? "Your order has been saved. WhatsApp will open so you can send it to Sobers Pizza."
            : databaseResult.queued
              ? "WhatsApp will open now. The online copy will retry automatically when your connection returns."
              : "WhatsApp will open now. We could not confirm the database copy, so please send the WhatsApp message to complete your order.",
        );
      } catch (error) {
        console.error("Sobers Pizza checkout error:", error);

        alert("Something went wrong while preparing your order. Please try again.");
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  /* =====================================================
       ESC KEY
    ===================================================== */

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    closeProduct();
    closeCart();
    closeCheckout();
  });

  /* =====================================================
       INITIAL RENDER
    ===================================================== */

  renderMenu();
  renderCart();
  settingsSync = syncBusinessSettings();
  syncMenuFromDatabase();
});
