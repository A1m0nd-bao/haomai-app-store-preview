const screenshots = [
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

const rail = document.querySelector("#screenshotRail");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector("p");
const closeButton = lightbox.querySelector(".close");

function labelFromName(name) {
  return name.replace(/^\d+-/, "").replace(/\.png$/, "").replaceAll("-", " / ");
}

function createCard(name) {
  const label = labelFromName(name);
  const figure = document.createElement("figure");
  figure.className = "shot-card";

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", `放大预览 ${label}`);
  button.addEventListener("click", () => openLightbox(name, label));

  const img = document.createElement("img");
  img.src = `./AppStore输出/${name}`;
  img.alt = label;
  img.loading = "lazy";

  const caption = document.createElement("figcaption");
  caption.textContent = label;

  button.appendChild(img);
  figure.append(button, caption);
  return figure;
}

function openLightbox(name, label) {
  lightboxImage.src = `./AppStore输出/${name}`;
  lightboxImage.alt = label;
  lightboxCaption.textContent = label;
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
}

screenshots.forEach((name) => {
  rail.appendChild(createCard(name));
});

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
