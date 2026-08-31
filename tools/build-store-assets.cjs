const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const assets = path.join(root, "store-listing", "assets");
const source = path.join(root, "store-listing", "source");
const icons = path.join(root, "icons");

const esc = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

const svgData = (file) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`;

function logo({ x, y, size }) {
  const s = size / 128;
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M16 8h70l26 26v78H42L16 86z" fill="#101516" stroke="#e7ff13" stroke-width="5"/>
    <path d="M39 34v47h20" fill="none" stroke="#f3f0e7" stroke-width="7"/>
    <path d="m54 82 14-47 15 47M59 65h18" fill="none" stroke="#e7ff13" stroke-width="6"/>
    <path d="m81 35 20 22M101 35 81 57" fill="none" stroke="#ff6a4f" stroke-width="7"/>
  </g>`;
}

function screenshotSvg({ language, compact = false }) {
  const zh = language === "zh-CN";
  const eyebrow = compact ? "QUICK TERMINAL / COMPACT MODE" : "DANBOORU / VISION / PROMPT";
  const title = compact
    ? (zh ? ["小窗工作，", "不挤占网页。"] : ["Stay focused.", "Keep the page wide."])
    : (zh ? ["从帖子链接，", "到可用提示词。"] : ["From post URL", "to usable prompt."]);
  const body = compact
    ? (zh ? ["右上角小窗只保留必要操作。", "粘贴链接、生成、复制，一气呵成。"] : ["The compact popup keeps only what matters:", "paste, generate, and copy."])
    : (zh ? ["一次提取 Danbooru 标签，并让视觉模型", "从构图、光色和绘制方法重建画面语言。"] : ["Extract Danbooru tags, then reconstruct the image", "through composition, lighting, color, and drawing method."]);
  const chips = compact
    ? (zh ? ["不占宽度", "一键复制", "复用设置"] : ["NO PAGE WIDTH", "ONE-CLICK COPY", "SAVED SETTINGS"])
    : (zh ? ["标签提取", "视觉分析", "合并输出"] : ["TAG EXTRACTION", "VISION ANALYSIS", "MERGED OUTPUT"]);
  const panelX = compact ? 735 : 846;
  const panelY = compact ? 210 : 40;
  const panelW = compact ? 480 : 360;
  const panelH = compact ? 480 : 720;
  const imageFit = compact ? "xMidYMid meet" : "xMidYMid meet";
  const chipSvg = chips.map((chip, i) => `<g transform="translate(${86 + i * 190} 642)">
    <path d="M0 0h174l14 14v42H0z" fill="${i === 0 ? "#e7ff13" : "#171d1f"}" stroke="${i === 0 ? "#e7ff13" : "#465053"}"/>
    <text x="18" y="35" fill="${i === 0 ? "#111617" : "#d8dedb"}" font-size="14" font-weight="800" letter-spacing="1">${esc(chip)}</text>
  </g>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800" viewBox="0 0 1280 800">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a0d0e"/><stop offset="1" stop-color="#151b1d"/></linearGradient>
      <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#30383a" stroke-width="1" opacity=".35"/></pattern>
      <filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000" flood-opacity=".65"/></filter>
    </defs>
    <rect width="1280" height="800" fill="url(#bg)"/><rect width="1280" height="800" fill="url(#grid)"/>
    <path d="M0 0h610L485 800H0z" fill="#0c1011" opacity=".72"/>
    <path d="M0 0h18v800H0z" fill="#e7ff13"/><path d="M18 0h5v800h-5z" fill="#ff684e"/>
    ${logo({ x: 82, y: 65, size: 74 })}
    <text x="178" y="94" fill="#f4f1e9" font-family="Segoe UI, Arial" font-size="22" font-weight="800" letter-spacing="2">LAX PROMPT LENS</text>
    <text x="178" y="121" fill="#899395" font-family="Consolas, monospace" font-size="12" font-weight="700" letter-spacing="2">${eyebrow}</text>
    <path d="M84 162h506" stroke="#3a4446"/><path d="M84 162h88" stroke="#ff694f" stroke-width="3"/>
    <text x="82" y="254" fill="#f2efe7" font-family="Segoe UI, Microsoft YaHei, Arial" font-size="58" font-weight="800">${esc(title[0])}</text>
    <text x="82" y="324" fill="#f2efe7" font-family="Segoe UI, Microsoft YaHei, Arial" font-size="58" font-weight="800">${esc(title[1])}</text>
    <text x="86" y="402" fill="#9da6a6" font-family="Segoe UI, Microsoft YaHei, Arial" font-size="21">${esc(body[0])}</text>
    <text x="86" y="438" fill="#9da6a6" font-family="Segoe UI, Microsoft YaHei, Arial" font-size="21">${esc(body[1])}</text>
    <g transform="translate(86 502)"><circle cx="20" cy="20" r="20" fill="#e7ff13"/><text x="14" y="27" fill="#101516" font-family="Consolas" font-size="18" font-weight="800">1</text><path d="M52 20h92" stroke="#586265" stroke-width="2"/><circle cx="166" cy="20" r="20" fill="#ffad45"/><text x="160" y="27" fill="#101516" font-family="Consolas" font-size="18" font-weight="800">2</text><path d="M198 20h92" stroke="#586265" stroke-width="2"/><circle cx="312" cy="20" r="20" fill="#ff684e"/><text x="306" y="27" fill="#101516" font-family="Consolas" font-size="18" font-weight="800">3</text></g>
    ${chipSvg}
    <g filter="url(#shadow)"><path d="M${panelX - 18} ${panelY - 18}h${panelW + 20}l18 18v${panelH + 18}h-${panelW + 38}z" fill="#080b0c" stroke="#596366" stroke-width="2"/></g>
    <path d="M814 22h430v4H814z" fill="#e7ff13"/><path d="M1202 765h42v5h-42z" fill="#ff684e"/>
  </svg>`;
}

async function main() {
  fs.mkdirSync(assets, { recursive: true });
  fs.mkdirSync(icons, { recursive: true });

  const iconMaster = fs.readFileSync(path.join(icons, "icon.svg"));
  for (const size of [16, 32, 48, 128]) {
    const artSize = Math.round(size * .75);
    const offset = Math.round((size - artSize) / 2);
    const art = await sharp(iconMaster).resize(artSize, artSize).png().toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: art, left: offset, top: offset }])
      .png().toFile(path.join(icons, `icon-${size}.png`));
  }
  fs.copyFileSync(path.join(icons, "icon-128.png"), path.join(assets, "store-icon-128.png"));

  const backdrop = sharp(path.join(source, "promo-backdrop.png"));
  const marqueeOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="560"><defs><linearGradient id="v" x1="0" x2="1"><stop stop-color="#050708" stop-opacity=".35"/><stop offset=".5" stop-color="#050708" stop-opacity="0"/><stop offset="1" stop-color="#050708" stop-opacity=".3"/></linearGradient></defs><rect width="1400" height="560" fill="url(#v)"/>${logo({ x: 74, y: 64, size: 108 })}<path d="M74 190h350" stroke="#e7ff13" stroke-width="4"/><path d="M74 202h145" stroke="#ff684e" stroke-width="2"/></svg>`);
  await backdrop.clone().resize(1400, 560, { fit: "cover" }).composite([{ input: marqueeOverlay }]).png().toFile(path.join(assets, "marquee-1400x560.png"));

  const smallOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280"><rect width="440" height="280" fill="#040607" opacity=".12"/>${logo({ x: 24, y: 24, size: 72 })}<path d="M24 105h148" stroke="#e7ff13" stroke-width="3"/></svg>`);
  await backdrop.clone().resize(440, 280, { fit: "cover", position: "centre" }).composite([{ input: smallOverlay }]).png().toFile(path.join(assets, "small-promo-440x280.png"));

  for (const language of ["en", "zh-CN"]) {
    const out = path.join(assets, language);
    fs.mkdirSync(out, { recursive: true });
    const fullUi = await sharp(path.join(root, "docs", "assets", "full-panel.png")).resize(360, 720, { fit: "contain" }).png().toBuffer();
    await sharp(Buffer.from(screenshotSvg({ language, compact: false })))
      .composite([{ input: fullUi, left: 846, top: 40 }])
      .png().toFile(path.join(out, "screenshot-01-full-workflow-1280x800.png"));
    const compactUi = await sharp(path.join(root, "docs", "assets", "compact-popup.png")).resize(480, 480, { fit: "contain", background: { r: 8, g: 11, b: 12, alpha: 1 } }).png().toBuffer();
    await sharp(Buffer.from(screenshotSvg({ language, compact: true })))
      .composite([{ input: compactUi, left: 735, top: 210 }])
      .png().toFile(path.join(out, "screenshot-02-compact-mode-1280x800.png"));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
