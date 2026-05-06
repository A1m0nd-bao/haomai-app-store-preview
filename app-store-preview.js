const screenshotOrder = [
  "13-用户指引1.png",
  "14-用户指引2.png",
  "15-用户指引3.png",
  "02-任务模版页.png",
  "12-添加任务.png",
  "03-任务详情页-提示词详情和历史执行记录.png",
  "04-任务部署后思考.png",
  "01-任务总结页.png",
  "06-我的任务页-任务历史.png",
  "07-我的界面1.png",
];

const bubbleScreenshotOrder = [
  "01-任务总结页.png",
  "03-任务详情页-提示词详情和历史执行记录.png",
  "04-任务部署后思考.png",
  "06-我的任务页-任务历史.png",
  "07-我的界面1.png",
  "10-搜索页.png",
  "12-添加任务.png",
  "16-自定义任务.png",
  "02-任务模版页.png",
  "05-总结.png",
  "08-我的界面2.png",
  "09-我的界面3.png",
  "11-搜索页2.png",
  "13-用户指引1.png",
  "14-用户指引2.png",
  "15-用户指引3.png",
];

const styles = [
  {
    id: "glass",
    label: "深色玻璃光幕",
    base: "./AppStore多风格输出/01-深色玻璃光幕",
  },
  {
    id: "white-card",
    label: "白色大卡片",
    base: "./AppStore多风格输出/02-白色大卡片清爽风",
  },
  {
    id: "black-title",
    label: "黑底大标题",
    base: "./AppStore多风格输出/03-黑底大标题首版风",
  },
  {
    id: "blue-white",
    label: "蓝白清透",
    base: "./AppStore多风格输出/04-蓝白清透风",
  },
  {
    id: "graphite",
    label: "石墨极简",
    base: "./AppStore多风格输出/05-石墨极简质感风",
  },
  {
    id: "bubble-glass",
    label: "气泡增强｜深色玻璃",
    base: "./AppStore气泡弹窗增强输出/01-深色玻璃光幕",
  },
  {
    id: "bubble-white-card",
    label: "气泡增强｜白色卡片",
    base: "./AppStore气泡弹窗增强输出/02-白色大卡片清爽风",
  },
  {
    id: "bubble-black-title",
    label: "气泡增强｜黑底标题",
    base: "./AppStore气泡弹窗增强输出/03-黑底大标题首版风",
  },
  {
    id: "bubble-blue-white",
    label: "气泡增强｜蓝白清透",
    base: "./AppStore气泡弹窗增强输出/04-蓝白清透风",
  },
  {
    id: "bubble-graphite",
    label: "气泡增强｜石墨极简",
    base: "./AppStore气泡弹窗增强输出/05-石墨极简质感风",
  },
];

const assetVersion = "overflow-bubble-20260506-6";

const rail = document.querySelector("#screenshotRail");
const tabs = document.querySelector("#styleTabs");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector("p");
const closeButton = lightbox.querySelector(".close");

let currentStyle = styles[0];

function labelFromName(name) {
  return name.replace(/^\d+-/, "").replace(/\.png$/, "").replaceAll("-", " / ");
}

function imagePath(style, name) {
  return `${style.base}/${name}?v=${assetVersion}`;
}

function orderForStyle(style) {
  return style.id.startsWith("bubble-") ? bubbleScreenshotOrder : screenshotOrder;
}

function createCard(style, name) {
  const label = labelFromName(name);
  const figure = document.createElement("figure");
  figure.className = "shot-card";

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `放大预览 ${style.label} - ${label}`);
  button.addEventListener("click", () => openLightbox(style, name, label));

  const img = document.createElement("img");
  img.src = imagePath(style, name);
  img.alt = `${style.label} - ${label}`;
  img.loading = "lazy";

  const caption = document.createElement("figcaption");
  caption.textContent = `${style.label} - ${label}`;

  button.appendChild(img);
  figure.append(button, caption);
  return figure;
}

function renderTabs() {
  styles.forEach((style) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "tab";
    button.id = `style-tab-${style.id}`;
    button.textContent = style.label;
    button.setAttribute("aria-controls", "screenshotRail");
    button.setAttribute("aria-selected", style.id === currentStyle.id ? "true" : "false");
    button.addEventListener("click", () => {
      currentStyle = style;
      tabs.querySelectorAll("button").forEach((item) => {
        item.setAttribute("aria-selected", item.id === `style-tab-${style.id}` ? "true" : "false");
      });
      renderRail();
    });
    tabs.appendChild(button);
  });
}

function renderRail() {
  rail.replaceChildren();
  orderForStyle(currentStyle).forEach((name) => {
    rail.appendChild(createCard(currentStyle, name));
  });
  rail.scrollLeft = 0;
}

function openLightbox(style, name, label) {
  lightboxImage.src = imagePath(style, name);
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

renderTabs();
renderRail();

closeButton.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeLightbox();
  }
});
