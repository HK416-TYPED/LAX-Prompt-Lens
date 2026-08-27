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

const EXAMPLE_URL = "https://shima.donmai.us/posts/11647422?q=girls_frontline_2%3A_exilium";
const DEFAULT_ENDPOINTS = {
  responses: "https://api.openai.com/v1/responses",
  chat: "https://api.openai.com/v1/chat/completions"
};
const PROVIDER_PRESETS = {
  jarless: {
    apiMode: "responses",
    endpoint: "https://jarlessapi.com",
    model: "gpt-5.6-luna",
    reasoningEffort: "xhigh",
    disableStorage: true
  },
  openai: {
    apiMode: "responses",
    endpoint: "https://api.openai.com/v1/responses",
    model: "gpt-5.6-luna",
    reasoningEffort: "xhigh",
    disableStorage: true
  }
};
const SETTING_KEYS = [
  "providerPreset", "apiMode", "endpoint", "model", "reasoningEffort",
  "disableStorage", "outputLanguage", "imageQuality", "promptOrder",
  "includeMeta", "saveKey", "apiKey"
];

const elements = {
  versionBadge: document.querySelector("#version-badge"),
  footerVersion: document.querySelector("#footer-version"),
  compactModeButton: document.querySelector("#compact-mode-button"),
  postUrl: document.querySelector("#post-url"),
  analyzeButton: document.querySelector("#analyze-button"),
  tagsOnlyButton: document.querySelector("#tags-only-button"),
  exampleButton: document.querySelector("#example-button"),
  status: document.querySelector("#status"),
  statusText: document.querySelector("#status-text"),
  diagnostics: document.querySelector("#diagnostics"),
  diagnosticsOutput: document.querySelector("#diagnostics-output"),
  copyDiagnostics: document.querySelector("#copy-diagnostics"),
  providerPreset: document.querySelector("#provider-preset"),
  apiMode: document.querySelector("#api-mode"),
  endpoint: document.querySelector("#endpoint"),
  model: document.querySelector("#model"),
  reasoningEffort: document.querySelector("#reasoning-effort"),
  disableStorage: document.querySelector("#disable-storage"),
  apiKey: document.querySelector("#api-key"),
  toggleKey: document.querySelector("#toggle-key"),
  saveKey: document.querySelector("#save-key"),
  outputLanguage: document.querySelector("#output-language"),
  imageQuality: document.querySelector("#image-quality"),
  promptOrder: document.querySelector("#prompt-order"),
  includeMeta: document.querySelector("#include-meta"),
  previewCard: document.querySelector("#preview-card"),
  previewImage: document.querySelector("#preview-image"),
  postMeta: document.querySelector("#post-meta"),
  results: document.querySelector("#results"),
  tagsOutput: document.querySelector("#tags-output"),
  visualOutput: document.querySelector("#visual-output"),
  combinedOutput: document.querySelector("#combined-output"),
  copyAll: document.querySelector("#copy-all")
};

let lastDefaultEndpoint = DEFAULT_ENDPOINTS.responses;
let diagnosticRun = null;

showVersion();
await restoreSettings();
bindEvents();

function showVersion() {
  const version = chrome.runtime.getManifest().version;
  elements.versionBadge.textContent = `v${version}`;
  elements.footerVersion.textContent = `v${version}`;
}

async function restoreSettings() {
  const saved = await chrome.storage.local.get(SETTING_KEYS);
  const legacyCustomEndpoint = saved.endpoint && !Object.values(DEFAULT_ENDPOINTS).includes(saved.endpoint);
  const providerPreset = saved.providerPreset || (legacyCustomEndpoint ? "custom" : "jarless");
  const preset = PROVIDER_PRESETS[providerPreset] || PROVIDER_PRESETS.jarless;
  elements.providerPreset.value = providerPreset;
  elements.apiMode.value = saved.apiMode || preset.apiMode;
  elements.endpoint.value = saved.endpoint || preset.endpoint;
  elements.model.value = saved.model || preset.model;
  elements.reasoningEffort.value = saved.reasoningEffort || preset.reasoningEffort;
  elements.disableStorage.checked = saved.disableStorage ?? preset.disableStorage;
  elements.outputLanguage.value = "en";
  elements.imageQuality.value = saved.imageQuality || "large";
  elements.promptOrder.value = saved.promptOrder || "tags-first";
  elements.includeMeta.checked = Boolean(saved.includeMeta);
  elements.saveKey.checked = Boolean(saved.saveKey);
  elements.apiKey.value = saved.saveKey ? (saved.apiKey || "") : "";
  lastDefaultEndpoint = DEFAULT_ENDPOINTS[elements.apiMode.value];
}

function bindEvents() {
  elements.compactModeButton.addEventListener("click", switchToCompactMode);

  elements.exampleButton.addEventListener("click", () => {
    elements.postUrl.value = EXAMPLE_URL;
    elements.postUrl.focus();
    setStatus("idle", "示例链接已填入");
  });

  elements.analyzeButton.addEventListener("click", () => runPipeline({ tagsOnly: false }));
  elements.tagsOnlyButton.addEventListener("click", () => runPipeline({ tagsOnly: true }));
  elements.postUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runPipeline({ tagsOnly: false });
  });

  elements.providerPreset.addEventListener("change", () => {
    applyProviderPreset(elements.providerPreset.value);
    persistSettings();
  });

  elements.apiMode.addEventListener("change", () => {
    const current = elements.endpoint.value.trim();
    if (!current || Object.values(DEFAULT_ENDPOINTS).includes(current) || current === lastDefaultEndpoint) {
      elements.endpoint.value = DEFAULT_ENDPOINTS[elements.apiMode.value];
    }
    lastDefaultEndpoint = DEFAULT_ENDPOINTS[elements.apiMode.value];
    persistSettings();
  });

  elements.toggleKey.addEventListener("click", () => {
    const showing = elements.apiKey.type === "text";
    elements.apiKey.type = showing ? "password" : "text";
    elements.toggleKey.textContent = showing ? "显示" : "隐藏";
  });

  for (const input of [
    elements.endpoint, elements.model, elements.reasoningEffort, elements.disableStorage,
    elements.apiKey, elements.saveKey,
    elements.outputLanguage, elements.imageQuality, elements.promptOrder, elements.includeMeta
  ]) {
    input.addEventListener("change", persistSettings);
  }

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", () => copyTarget(button));
  });
  elements.copyAll.addEventListener("click", () => copyText(elements.combinedOutput.value, elements.copyAll));
  elements.copyDiagnostics.addEventListener("click", () => copyText(elements.diagnosticsOutput.value, elements.copyDiagnostics));
}

async function switchToCompactMode() {
  const apiKey = elements.apiKey.value.trim();
  await persistSettings();
  if (apiKey) await chrome.storage.session.set({ apiKey });

  const response = await chrome.runtime.sendMessage({ type: "set-ui-mode", mode: "compact" });
  if (!response?.ok) {
    setStatus("error", response?.message || "无法切换到小窗模式");
    return;
  }

  setStatus("success", "已切换为右上角小窗；以后点击工具栏图标即可打开");
  try {
    if (chrome.action.openPopup) await chrome.action.openPopup();
  } catch {
    // The mode is already saved; a toolbar click will open the popup.
  }

  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (chrome.sidePanel.close && currentWindow.id != null) {
      await chrome.sidePanel.close({ windowId: currentWindow.id });
    }
  } catch {
    // Chrome versions before sidePanel.close keep the current panel open once.
  }
}

async function persistSettings() {
  const settings = {
    providerPreset: elements.providerPreset.value,
    apiMode: elements.apiMode.value,
    endpoint: elements.endpoint.value.trim(),
    model: elements.model.value.trim(),
    reasoningEffort: elements.reasoningEffort.value,
    disableStorage: elements.disableStorage.checked,
    outputLanguage: elements.outputLanguage.value,
    imageQuality: elements.imageQuality.value,
    promptOrder: elements.promptOrder.value,
    includeMeta: elements.includeMeta.checked,
    saveKey: elements.saveKey.checked
  };

  if (elements.saveKey.checked) settings.apiKey = elements.apiKey.value.trim();
  await chrome.storage.local.set(settings);
  if (!elements.saveKey.checked) await chrome.storage.local.remove("apiKey");
}

function applyProviderPreset(provider) {
  const preset = PROVIDER_PRESETS[provider];
  if (!preset) return;
  elements.apiMode.value = preset.apiMode;
  elements.endpoint.value = preset.endpoint;
  elements.model.value = preset.model;
  elements.reasoningEffort.value = preset.reasoningEffort;
  elements.disableStorage.checked = preset.disableStorage;
  lastDefaultEndpoint = DEFAULT_ENDPOINTS[preset.apiMode];
}

async function runPipeline({ tagsOnly }) {
  diagnosticRun = {
    version: chrome.runtime.getManifest().version,
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    postUrl: elements.postUrl.value.trim(),
    events: []
  };
  hideDiagnostics();
  setBusy(true);
  elements.results.classList.add("is-hidden");
  elements.previewCard.classList.add("is-hidden");
  elements.visualOutput.value = "";
  elements.combinedOutput.value = "";

  try {
    const parsed = parsePostUrl(elements.postUrl.value);
    let endpoint = "";
    if (!tagsOnly) {
      endpoint = resolveApiEndpoint(
        elements.endpoint.value,
        elements.apiMode.value,
        elements.providerPreset.value
      );
      await ensureEndpointPermission(endpoint);
    }

    setStatus("busy", `正在读取帖子 #${parsed.id} 的标签…`);
    const post = await requestPost(parsed.normalizedUrl);
    const tagPrompt = buildTagPrompt(post, { includeMeta: elements.includeMeta.checked });
    if (!tagPrompt) throw new Error("帖子没有可用标签。 ");

    elements.tagsOutput.value = tagPrompt;
    elements.combinedOutput.value = tagPrompt;
    elements.results.classList.remove("is-hidden");
    renderPreview(post);

    if (tagsOnly) {
      setStatus("success", `已提取 ${tagPrompt.split(", ").length} 个标签`);
      return;
    }

    const apiKey = elements.apiKey.value.trim();
    if (!apiKey) throw new Error("Tags Prompt 已生成；如需视觉分析，请在设置中填写 API Key。 ");
    if (!elements.model.value.trim()) throw new Error("请填写视觉模型名称。 ");

    setStatus("busy", "正在读取主图并进行专业画面分析…");
    const imageUrl = chooseImageUrl(post, elements.imageQuality.value);
    if (!imageUrl) throw new Error("这个帖子没有可读取的主图 URL。 ");
    const imageDataUrl = await fetchImageAsDataUrl(imageUrl, post.preview_file_url);
    const visualPrompt = await callVisionApi({ endpoint, apiKey, imageDataUrl });

    elements.visualOutput.value = visualPrompt;
    elements.combinedOutput.value = buildCombinedPrompt(
      tagPrompt,
      visualPrompt,
      elements.promptOrder.value
    );
    autoSizeOutputs();
    setStatus("success", "三种 Prompt 已全部生成");
    await persistSettings();
  } catch (error) {
    recordDiagnostic("pipeline-error", { name: error?.name, message: cleanError(error), stack: error?.stack });
    setStatus("error", "处理失败，请展开“诊断详情”并复制报告");
    showDiagnostics();
  } finally {
    setBusy(false);
  }
}

async function ensureEndpointPermission(endpoint) {
  const url = new URL(endpoint);
  if (["https://api.openai.com", "https://jarlessapi.com"].includes(url.origin)) return;
  const originPattern = `${url.origin}/*`;
  const hasPermission = await chrome.permissions.contains({ origins: [originPattern] });
  if (hasPermission) return;
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) throw new Error("未授予自定义 API 地址的访问权限。 ");
}

async function requestPost(url) {
  const parsed = parsePostUrl(url);
  const apiUrls = buildPostApiUrls(url);
  const failures = [];
  let post = null;

  for (const apiUrl of apiUrls) {
    recordDiagnostic("direct-fetch-start", { apiUrl });
    setStatus("busy", `正在通过 ${new URL(apiUrl).hostname} 读取帖子 #${parsed.id}…`);
    try {
      let response = await fetchDanbooruPost(apiUrl);
      recordDiagnostic("direct-fetch-response", {
        apiUrl,
        status: response.status,
        contentType: response.headers.get("content-type") || ""
      });
      if ([502, 503, 504].includes(response.status)) {
        await wait(700);
        response = await fetchDanbooruPost(apiUrl);
        recordDiagnostic("direct-fetch-retry-response", { apiUrl, status: response.status });
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          failures.push(`${new URL(apiUrl).hostname}: 返回的不是 JSON`);
          continue;
        }
        post = await response.json();
        break;
      }

      if (response.status === 404) failures.push(`${new URL(apiUrl).hostname}: HTTP 404`);
      else if (response.status === 429) failures.push(`${new URL(apiUrl).hostname}: HTTP 429`);
      else failures.push(`${new URL(apiUrl).hostname}: HTTP ${response.status}`);
    } catch (error) {
      recordDiagnostic("direct-fetch-error", {
        apiUrl,
        name: error?.name,
        message: cleanError(error),
        stack: error?.stack
      });
      failures.push(`${new URL(apiUrl).hostname}: ${cleanError(error)}`);
    }
  }

  if (!post) {
    setStatus("busy", `直接读取失败，正在通过临时同源页面读取帖子 #${parsed.id}…`);
    try {
      post = await fetchPostThroughTemporaryTab(parsed.normalizedUrl, parsed.id);
    } catch (error) {
      recordDiagnostic("temporary-tab-error", {
        name: error?.name,
        message: cleanError(error),
        stack: error?.stack
      });
      failures.push(`临时同源页面: ${cleanError(error)}`);
    }
  }

  if (!post) {
    throw new Error(`无法读取 Danbooru 帖子：${failures.join("；")}`);
  }

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

async function fetchPostThroughTemporaryTab(postUrl, postId) {
  recordDiagnostic("temporary-tab-create", { postUrl, postId });
  const tab = await chrome.tabs.create({ url: postUrl, active: false });
  if (!tab?.id) throw new Error("Chrome 未返回临时标签页 ID。 ");

  try {
    await waitForTabLoad(tab.id, 25000);
    recordDiagnostic("temporary-tab-loaded", { tabId: tab.id });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (id) => {
        try {
          const response = await fetch(`/posts/${id}.json`, {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" }
          });
          if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` };
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            return { ok: false, status: response.status, error: `Unexpected content-type: ${contentType}` };
          }
          return { ok: true, status: response.status, post: await response.json() };
        } catch (error) {
          return { ok: false, status: 0, error: `${error?.name || "Error"}: ${error?.message || String(error)}` };
        }
      },
      args: [postId]
    });
    const result = results?.[0]?.result;
    recordDiagnostic("temporary-tab-result", result || { error: "No script result" });
    if (!result?.ok || !result.post) throw new Error(result?.error || "临时页面没有返回帖子 JSON。 ");
    return result.post;
  } finally {
    await chrome.tabs.remove(tab.id).catch((error) => {
      recordDiagnostic("temporary-tab-close-error", { message: cleanError(error) });
    });
  }
}

function waitForTabLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error);
      else resolve();
    };
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error(`临时页面加载超过 ${Math.round(timeoutMs / 1000)} 秒。`)), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch(finish);
  });
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function renderPreview(post) {
  const imageUrl = chooseImageUrl(post, elements.imageQuality.value) || post.preview_file_url;
  elements.previewImage.src = imageUrl;
  const size = post.image_width && post.image_height ? `${post.image_width} × ${post.image_height}` : "尺寸未知";
  elements.postMeta.textContent = `Post #${post.id} · ${size} · Rating ${String(post.rating || "—").toUpperCase()}`;
  elements.previewCard.classList.remove("is-hidden");
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
  if (!response.ok) throw new Error(`主图下载失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("主图不是视觉模型支持的静态图像。 ");
  if (blob.size > 20 * 1024 * 1024) throw new Error("主图超过 20 MB，请改用 Sample 图像质量。 ");
  return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取主图数据。 "));
    reader.readAsDataURL(blob);
  });
}

async function callVisionApi({ endpoint, apiKey, imageDataUrl }) {
  const instruction = buildVisionInstruction();
  const mode = elements.apiMode.value;
  const body = mode === "responses"
    ? buildResponsesRequest({
        model: elements.model.value.trim(),
        instruction,
        imageDataUrl,
        reasoningEffort: elements.reasoningEffort.value,
        disableStorage: elements.disableStorage.checked
      })
    : {
        model: elements.model.value.trim(),
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
    const message = data?.error?.message || data?.message || `视觉 API 请求失败（HTTP ${response.status}）。`;
    throw new Error(message);
  }

  const rawText = mode === "responses" ? extractResponsesText(data) : extractChatText(data);
  const text = normalizeVisualPrompt(rawText);
  if (!text) throw new Error("视觉 API 已响应，但没有返回可用文本。 ");
  return text;
}

function setBusy(busy) {
  elements.analyzeButton.disabled = busy;
  elements.tagsOnlyButton.disabled = busy;
  elements.analyzeButton.firstElementChild.textContent = busy ? "◌" : "✦";
}

function setStatus(state, message) {
  elements.status.dataset.state = state;
  elements.statusText.textContent = message;
}

function recordDiagnostic(event, details = {}) {
  if (!diagnosticRun) return;
  diagnosticRun.events.push({
    at: new Date().toISOString(),
    event,
    ...details
  });
}

function hideDiagnostics() {
  elements.diagnostics.classList.add("is-hidden");
  elements.diagnostics.open = false;
  elements.diagnosticsOutput.value = "";
}

function showDiagnostics() {
  elements.diagnosticsOutput.value = JSON.stringify(diagnosticRun, null, 2);
  elements.diagnostics.classList.remove("is-hidden");
  elements.diagnostics.open = true;
}

function cleanError(error) {
  const message = error?.message || String(error || "发生未知错误。 ");
  return message.replace(/^Error:\s*/, "").trim();
}

function autoSizeOutputs() {
  for (const textarea of [elements.tagsOutput, elements.visualOutput, elements.combinedOutput]) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 112), 420)}px`;
  }
}

async function copyTarget(button) {
  const target = document.querySelector(`#${button.dataset.copyTarget}`);
  await copyText(target?.value || "", button);
}

async function copyText(value, button) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  const previous = button.textContent;
  button.textContent = "已复制";
  setTimeout(() => { button.textContent = previous; }, 1200);
}
