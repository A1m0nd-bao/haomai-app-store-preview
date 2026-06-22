const assetVersion = "multi-product-20260622";

const main = document.querySelector("main");
const nav = document.querySelector("nav");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector("p");
const closeButton = lightbox.querySelector(".close");

let products = [];
let screenshotStyles = [];
let currentProduct = null;
let currentStyle = null;

async function loadJson(path, fallback) {
  try {
    const response = await fetch(`${path}?v=${Date.now()}`);
    if (!response.ok) throw new Error(`Unable to load ${path}`);
    return await response.json();
  } catch {
    return fallback;
  }
}

async function boot() {
  const [productData, screenshotData] = await Promise.all([
    loadJson("./data/products.json", { products: [] }),
    loadJson("./data/screenshots.json", { styles: [] }),
  ]);

  products = Array.isArray(productData.products) ? productData.products : [];
  screenshotStyles = Array.isArray(screenshotData.styles) ? screenshotData.styles : [];

  const requestedProduct = new URLSearchParams(window.location.search).get("product");
  if (requestedProduct) {
    renderProductPage(requestedProduct);
  } else {
    renderHomePage();
  }
}

function setNav(mode) {
  nav.replaceChildren();

  if (mode === "home") {
    nav.append(navLink("#products", "产品"), navLink("#company", "信息"));
    return;
  }

  const back = navLink("./", "产品");
  const preview = navLink("#screenshots", "预览");
  const details = navLink("#details", "详情");
  const info = navLink("#info", "信息");
  nav.append(back, preview, details, info);
}

function navLink(href, label) {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = label;
  return link;
}

function renderHomePage() {
  setNav("home");
  document.title = "产品预览集合 - App Store";
  currentProduct = null;
  currentStyle = null;

  main.replaceChildren(
    createHomeHero(),
    createProductCollection(),
    createCompanyInfo(),
  );
}

function createHomeHero() {
  const section = document.createElement("section");
  section.className = "collection-hero";
  section.innerHTML = `
    <p class="collection-kicker">App Store Preview Collection</p>
    <h1>产品预览集合</h1>
    <p>集中维护公司不同软件的 App Store 风格预览页，按产品分开浏览截图、文案、类别和基础信息。</p>
  `;
  return section;
}

function createProductCollection() {
  const section = document.createElement("section");
  section.className = "product-collection";
  section.id = "products";

  const heading = document.createElement("div");
  heading.className = "section-heading";
  heading.innerHTML = `
    <div>
      <h2>产品</h2>
    </div>
    <span class="device-label">${products.length} Apps</span>
  `;

  const grid = document.createElement("div");
  grid.className = "product-grid";
  products.forEach((product) => grid.append(createProductCard(product)));

  section.append(heading, grid);
  return section;
}

function createProductCard(product) {
  const link = document.createElement("a");
  link.className = "product-card";
  link.href = `?product=${encodeURIComponent(product.id)}`;

  const screenshotCount = stylesForProduct(product.id).reduce((count, style) => count + style.screenshots.length, 0);
  link.innerHTML = `
    ${appIconMarkup(product, "product-card-icon")}
    <div class="product-card-meta">
      <h2>${escapeHtml(product.name)}</h2>
      <p>${escapeHtml(product.subtitle)}</p>
      <div class="product-tags">${(product.tags || []).slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
    <div class="product-card-side">
      <strong>${screenshotCount || "待上传"}</strong>
      <span>${screenshotCount ? "张预览" : "截图"}</span>
    </div>
  `;
  return link;
}

function createCompanyInfo() {
  const section = document.createElement("section");
  section.className = "app-info";
  section.id = "company";
  section.innerHTML = `
    <h2>信息</h2>
    <dl>
      <div>
        <dt>维护方式</dt>
        <dd>通过飞书表格上传截图并同步到 GitHub Pages</dd>
      </div>
      <div>
        <dt>展示规范</dt>
        <dd>遵循 App Store 产品页的信息层级：图标、名称、副标题、评分/类别、预览、简介、信息</dd>
      </div>
      <div>
        <dt>当前产品</dt>
        <dd>${products.map((product) => escapeHtml(product.name)).join("、")}</dd>
      </div>
    </dl>
  `;
  return section;
}

function renderProductPage(productId) {
  currentProduct = products.find((product) => product.id === productId) || products[0];
  if (!currentProduct) {
    renderHomePage();
    return;
  }

  setNav("product");
  document.title = `${currentProduct.name} - App Store 预览`;
  const productStyles = stylesForProduct(currentProduct.id);
  currentStyle = productStyles[0] || null;

  main.replaceChildren(
    createAppHero(currentProduct),
    createStats(currentProduct),
    createPreviewStage(productStyles),
    createDescription(currentProduct),
    createAppInfo(currentProduct),
  );

  renderTabs(productStyles);
  renderRail(productStyles);
}

function createAppHero(product) {
  const section = document.createElement("section");
  section.className = "app-hero";
  section.setAttribute("aria-label", "App 信息");
  section.innerHTML = `
    ${appIconMarkup(product, "app-icon")}
    <div class="app-meta">
      <h1>${escapeHtml(product.name)}</h1>
      <p class="subtitle">${escapeHtml(product.subtitle)}</p>
      <p class="developer">${escapeHtml(product.developer)}</p>
      <div class="actions">
        <button type="button">获取</button>
        <span>${escapeHtml(product.priceNote || "App 内购买")}</span>
      </div>
    </div>
  `;
  return section;
}

function createStats(product) {
  const section = document.createElement("section");
  section.className = "stats";
  section.setAttribute("aria-label", "App Store 信息");
  section.innerHTML = `
    <article>
      <span class="stat-label">评分</span>
      <strong>${escapeHtml(product.rating || "新 App")}</strong>
      <span class="stars">${product.rating && product.rating !== "新 App" ? "★★★★★" : "待发布"}</span>
    </article>
    <article>
      <span class="stat-label">年龄</span>
      <strong>${escapeHtml(product.age || "4+")}</strong>
      <span>岁以上</span>
    </article>
    <article>
      <span class="stat-label">类别</span>
      <strong>${escapeHtml(product.category || "工具")}</strong>
      <span>${escapeHtml(product.categoryDetail || "")}</span>
    </article>
    <article>
      <span class="stat-label">开发者</span>
      <strong>${escapeHtml(product.developer || "好麦")}</strong>
      <span>${escapeHtml((product.tags || [])[0] || "")}</span>
    </article>
  `;
  return section;
}

function createPreviewStage(productStyles) {
  const section = document.createElement("section");
  section.className = "preview-stage";
  section.id = "screenshots";
  section.setAttribute("aria-label", "App Store 截图预览");
  section.innerHTML = `
    <div class="section-heading">
      <div>
        <h2>预览</h2>
      </div>
      <span class="device-label">iPhone</span>
    </div>
    <div class="style-tabs" id="styleTabs" role="tablist" aria-label="截图风格"></div>
    <div class="screenshot-rail" id="screenshotRail" tabindex="0" aria-label="横向截图列表"></div>
  `;

  if (productStyles.length === 0) {
    section.querySelector("#screenshotRail").replaceWith(createEmptyPreview());
  }

  return section;
}

function createEmptyPreview() {
  const empty = document.createElement("div");
  empty.className = "empty-preview";
  empty.innerHTML = `
    <strong>截图待上传</strong>
    <p>在飞书维护表中使用该产品的产品ID上传截图后，这里会自动生成 App Store 预览。</p>
  `;
  return empty;
}

function createDescription(product) {
  const section = document.createElement("section");
  section.className = "description";
  section.id = "details";
  section.innerHTML = `
    <div>
      <h2>简介</h2>
      <p>${escapeHtml(product.summary || "")}</p>
    </div>
    <div class="whats-new">
      <h2>核心亮点</h2>
      <ul>${(product.highlights || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
  return section;
}

function createAppInfo(product) {
  const section = document.createElement("section");
  section.className = "app-info";
  section.id = "info";
  section.setAttribute("aria-label", "App 信息");
  section.innerHTML = `
    <h2>信息</h2>
    <dl>
      <div>
        <dt>供应商</dt>
        <dd>${escapeHtml(product.developer || "")}</dd>
      </div>
      <div>
        <dt>类别</dt>
        <dd>${escapeHtml(product.category || "")}</dd>
      </div>
      <div>
        <dt>兼容性</dt>
        <dd>${escapeHtml(product.compatibility || "iPhone")}</dd>
      </div>
      <div>
        <dt>语言</dt>
        <dd>${escapeHtml(product.language || "简体中文")}</dd>
      </div>
      <div>
        <dt>年龄分级</dt>
        <dd>${escapeHtml(product.age || "4+")}</dd>
      </div>
    </dl>
  `;
  return section;
}

function stylesForProduct(productId) {
  return screenshotStyles
    .filter((style) => (style.productId || "haomai") === productId)
    .map((style) => ({
      id: style.id,
      label: style.label,
      category: style.category || "其他风格",
      screenshots: Array.isArray(style.screenshots)
        ? style.screenshots
            .filter((item) => item?.src)
            .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        : [],
    }))
    .filter((style) => style.id && style.label && style.screenshots.length > 0);
}

function labelFromScreenshot(item) {
  return item.title || item.src.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
}

function imagePath(item) {
  return `${item.src}?v=${item.version || assetVersion}`;
}

function createCard(style, item) {
  const label = labelFromScreenshot(item);
  const figure = document.createElement("figure");
  figure.className = "shot-card";

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `放大预览 ${style.label} - ${label}`);
  button.addEventListener("click", () => openLightbox(style, item, label));

  const img = document.createElement("img");
  img.src = imagePath(item);
  img.alt = `${style.label} - ${label}`;
  img.loading = "lazy";

  const caption = document.createElement("figcaption");
  caption.textContent = `${style.label} - ${label}`;

  button.appendChild(img);
  figure.append(button, caption);
  return figure;
}

function renderTabs(productStyles) {
  const tabs = document.querySelector("#styleTabs");
  if (!tabs) return;
  tabs.replaceChildren();
  const groupedStyles = productStyles.reduce((groups, style) => {
    const category = style.category || "其他风格";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(style);
    return groups;
  }, new Map());

  groupedStyles.forEach((styles, category) => {
    const group = document.createElement("div");
    group.className = "style-tab-group";

    const label = document.createElement("span");
    label.className = "style-tab-category";
    label.textContent = category;
    group.appendChild(label);

    styles.forEach((style) => {
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.id = `style-tab-${style.id}`;
      button.textContent = style.label;
      button.setAttribute("aria-controls", "screenshotRail");
      button.setAttribute("aria-selected", style.id === currentStyle?.id ? "true" : "false");
      button.addEventListener("click", () => {
        currentStyle = style;
        tabs.querySelectorAll("button").forEach((item) => {
          item.setAttribute("aria-selected", item.id === `style-tab-${style.id}` ? "true" : "false");
        });
        renderRail(productStyles);
      });
      group.appendChild(button);
    });

    tabs.appendChild(group);
  });
}

function renderRail(productStyles) {
  const rail = document.querySelector("#screenshotRail");
  if (!rail || !currentStyle) return;
  rail.replaceChildren();
  currentStyle.screenshots.forEach((item) => {
    rail.appendChild(createCard(currentStyle, item));
  });
  rail.scrollLeft = 0;
}

function openLightbox(style, item, label) {
  lightboxImage.src = imagePath(item);
  lightboxImage.alt = `${style.label} - ${label}`;
  lightboxCaption.textContent = `${style.label} - ${label}`;
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
}

function appIconMarkup(product, className) {
  if (product.icon) {
    return `<img class="${className}" src="${escapeHtml(product.icon)}" alt="${escapeHtml(product.name)} 图标" />`;
  }

  return `<div class="${className} app-icon-fallback" aria-hidden="true">${escapeHtml(product.iconText || product.name.slice(0, 1))}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

closeButton.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeLightbox();
});

boot();
