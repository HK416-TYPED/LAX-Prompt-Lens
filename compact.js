import {
  buildCombinedPrompt,
  buildPostApiUrls,
  buildResponsesRequest,
  buildTagPrompt,
  buildVisionInstruction,
  chooseImageUrl,
  extractChatText,
  extractResponsesText,
  normalizeVisualPrompt,
  parsePostUrl,
  resolveApiEndpoint
} from "./core.js";

const DEFAULTS = {
  providerPreset: "jarless",
  apiMode: "responses",
  endpoint: "https://jarlessapi.com",
  model: "gpt-5.6-luna",
  reasoningEffort: "xhigh",
  disableStorage: true,
  imageQuality: "large",
  promptOrder: "tags-first",
  includeMeta: false,
  saveKey: false,
  apiKey: ""
};

const SETTING_KEYS = [
  "providerPreset", "apiMode", "endpoint", "model", "reasoningEffort",
  "disableStorage", "imageQuality", "promptOrder", "includeMeta", "saveKey", "apiKey"
];

const elements = {
  version: document.querySelector("#version"),
  postUrl: document.querySelector("#post-url"),
  generateButton: document.querySelector("#generate-button"),
  copyButton: document.querySelector("#copy-button"),
  fullModeButton: document.querySelector("#full-mode-button"),
  status: document.querySelector("#status"),
  statusText: document.querySelector("#status-text"),
  resultMeta: document.querySelector("#result-meta")
};

let combinedPrompt = "";
let settings = { ...DEFAULTS };

await initialize();

async function initialize() {
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  const [saved, session] = await Promise.all([
    chrome.storage.local.get(SETTING_KEYS),
    chrome.storage.session.get(["apiKey", "compactLastUrl", "compactLastPrompt", "compactLastMeta"])
  ]);
  settings = { ...DEFAULTS, ...saved };
  if (!settings.saveKey && session.apiKey) settings.apiKey = session.apiKey;

  if (session.compactLastUrl) elements.postUrl.value = session.compactLastUrl;
  if (session.compactLastPrompt) {
    combinedPrompt = session.compactLastPrompt;
    elements.copyButton.disabled = false;
    elements.resultMeta.textContent = session.compactLastMeta || "上一条结果已就绪";
    elements.resultMeta.classList.remove("is-hidden");
    setStatus("success", "上一条 TAG + NL 可直接复制");
  }

  elements.generateButton.addEventListener("click", runPipeline);
  elements.copyButton.addEventListener("click", copyCombinedPrompt);
  elements.fullModeButton.addEventListener("click", switchToFullMode);
  elements.postUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runPipeline();
  });
}

async function switchToFullMode() {
  const response = await chrome.runtime.sendMessage({ type: "set-ui-mode", mode: "full" });
  if (!response?.ok) {
    setStatus("error", response?.message || "无法切换到完整版");
    return;
  }

  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (currentWindow.id == null) throw new Error("无法识别当前 Chrome 窗口");
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    window.close();
  } catch (error) {
    setStatus("error", `${cleanError(error)}；再次点击工具栏图标可打开完整版`);
  }
}

async function runPipeline() {
  setBusy(true);
  combinedPrompt = "";
  elements.copyButton.disabled = true;
  elements.resultMeta.classList.add("is-hidden");

  try {
    const parsed = parsePostUrl(elements.postUrl.value);
    const apiKey = String(settings.apiKey || "").trim();
    if (!apiKey) throw new Error("请先在完整版填写 API Key；可保存到本机或直接切换到小窗");
    if (!String(settings.model || "").trim()) throw new Error("完整版设置中缺少模型名称");

    const endpoint = resolveApiEndpoint(settings.endpoint, settings.apiMode, settings.providerPreset);
    await verifyEndpointPermission(endpoint);

    setStatus("busy", `读取 Post #${parsed.id}…`);
    const post = await requestPost(parsed.normalizedUrl);
    const tagPrompt = buildTagPrompt(post, { includeMeta: Boolean(settings.includeMeta) });
    if (!tagPrompt) throw new Error("帖子没有可用标签");

    setStatus("busy", "分析主图与美术语言…");
    const imageUrl = chooseImageUrl(post, settings.imageQuality) || post.preview_file_url;
    if (!imageUrl) throw new Error("帖子没有可读取的主图 URL");
    const imageDataUrl = await fetchImageAsDataUrl(imageUrl, post.preview_file_url);
    const visualPrompt = await callVisionApi({ endpoint, apiKey, imageDataUrl });

    combinedPrompt = buildCombinedPrompt(tagPrompt, visualPrompt, settings.promptOrder);
    const tagCount = tagPrompt.split(", ").length;
    const wordCount = visualPrompt.trim().split(/\s+/).filter(Boolean).length;
    const meta = `${tagCount} TAGS / ${wordCount} NL WORDS`;
    await chrome.storage.session.set({
      compactLastUrl: parsed.normalizedUrl,
      compactLastPrompt: combinedPrompt,
      compactLastMeta: meta
    });

    elements.copyButton.disabled = false;
    elements.resultMeta.textContent = meta;
    elements.resultMeta.classList.remove("is-hidden");
    setStatus("success", "TAG + NL 已生成，可复制");
  } catch (error) {
    setStatus("error", cleanError(error));
  } finally {
    setBusy(false);
  }
}

async function requestPost(url) {
  const failures = [];
  for (const apiUrl of buildPostApiUrls(url)) {
    try {
      let response = await fetchDanbooruPost(apiUrl);
      if ([502, 503, 504].includes(response.status)) {
        await wait(700);
        response = await fetchDanbooruPost(apiUrl);
      }
      if (!response.ok) {
        failures.push(`${new URL(apiUrl).hostname}: HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        failures.push(`${new URL(apiUrl).hostname}: 非 JSON 响应`);
        continue;
      }
      return normalizePost(await response.json());
    } catch (error) {
      failures.push(`${new URL(apiUrl).hostname}: ${cleanError(error)}`);
    }
  }
  throw new Error(`无法读取帖子；请切换完整版查看诊断（${failures.join("；")}）`);
}

function normalizePost(post) {
  return {
    id: post.id,
    rating: post.rating,
    image_width: post.image_width,
    image_height: post.image_height,
    tag_string: post.tag_string || "",
    tag_string_artist: post.tag_string_artist || "",
    tag_string_copyright: post.tag_string_copyright || "",
    tag_string_character: post.tag_string_character || "",
    tag_string_general: post.tag_string_general || "",
    tag_string_meta: post.tag_string_meta || "",
    file_url: post.file_url || "",
    large_file_url: post.large_file_url || "",
    preview_file_url: post.preview_file_url || ""
  };
}

function fetchDanbooruPost(apiUrl) {
  return fetch(apiUrl, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" }
  });
}

async function verifyEndpointPermission(endpoint) {
  const url = new URL(endpoint);
  if (["https://api.openai.com", "https://jarlessapi.com"].includes(url.origin)) return;
  const originPattern = `${url.origin}/*`;
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) throw new Error("请先在完整版中授权这个自定义 API 地址");
}

async function fetchImageAsDataUrl(primaryUrl, fallbackUrl) {
  try {
    return await downloadAsDataUrl(primaryUrl);
  } catch (error) {
    if (!fallbackUrl || fallbackUrl === primaryUrl) throw error;
    return downloadAsDataUrl(fallbackUrl);
  }
}

async function downloadAsDataUrl(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`主图下载失败（HTTP ${response.status}）`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("主图不是受支持的静态图像");
  if (blob.size > 20 * 1024 * 1024) throw new Error("主图超过 20 MB，请在完整版选择 Sample 图像");
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取主图数据"));
    reader.readAsDataURL(blob);
  });
}

async function callVisionApi({ endpoint, apiKey, imageDataUrl }) {
  const instruction = buildVisionInstruction();
  const mode = settings.apiMode;
  const body = mode === "responses"
    ? buildResponsesRequest({
        model: settings.model.trim(),
        instruction,
        imageDataUrl,
        reasoningEffort: settings.reasoningEffort,
        disableStorage: Boolean(settings.disableStorage)
      })
    : {
        model: settings.model.trim(),
        max_tokens: 1200,
        messages: [
          { role: "system", content: instruction },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this artwork and produce the requested final prompt." },
              { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
            ]
          }
        ]
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `视觉 API 请求失败（HTTP ${response.status}）`);
  }

  const rawText = mode === "responses" ? extractResponsesText(data) : extractChatText(data);
  const text = normalizeVisualPrompt(rawText);
  if (!text) throw new Error("视觉 API 已响应，但没有返回可用文本");
  return text;
}

async function copyCombinedPrompt() {
  if (!combinedPrompt) return;
  await navigator.clipboard.writeText(combinedPrompt);
  const original = elements.copyButton.textContent;
  elements.copyButton.textContent = "已复制 TAG + NL";
  setStatus("success", "已复制到剪贴板");
  setTimeout(() => { elements.copyButton.textContent = original; }, 1200);
}

function setBusy(busy) {
  elements.generateButton.disabled = busy;
  elements.generateButton.innerHTML = busy
    ? '<span aria-hidden="true">◌</span> 正在生成…'
    : '<span aria-hidden="true">✦</span> 生成 TAG + NL';
}

function setStatus(state, message) {
  elements.status.dataset.state = state;
  elements.statusText.textContent = message;
}

function cleanError(error) {
  return error?.message || String(error || "未知错误");
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
