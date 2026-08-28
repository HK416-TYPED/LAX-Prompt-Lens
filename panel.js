import {
  buildCombinedPrompt,
  buildManualChatContent,
  buildManualPromptInstruction,
  buildPostApiUrls,
  buildResponsesRequest,
  buildTextResponsesRequest,
  buildTagPrompt,
  buildVisionInstruction,
  chooseImageUrl,
  extractChatText,
  extractResponsesText,
  formatManualPromptBundle,
  isBuiltInApiEndpoint,
  isGrokModel,
  normalizeVisualPrompt,
  parseManualPromptResult,
  parsePostUrl,
  readResponsesStream,
  resolveApiEndpoint
} from "./core.js";
import { fetchImageAsDataUrl, readReferenceImagesAsDataUrls } from "./image-utils.js";
import { createReferenceImagePicker } from "./reference-picker.js";

const EXAMPLE_URL = "https://shima.donmai.us/posts/11647422?q=girls_frontline_2%3A_exilium";
const EXAMPLE_MANUAL_TEXT = "银发少女独自站在雨夜的霓虹街道，黑色长风衣被风掀起，手持透明雨伞。低机位中近景，冷蓝环境光与暖粉色招牌形成对比，湿润路面映出破碎倒影，日系动画电影质感。";
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
  },
  xai: {
    apiMode: "responses",
    endpoint: "https://api.x.ai",
    model: "grok-4.6",
    reasoningEffort: "high",
    disableStorage: true
  }
};
const SETTING_KEYS = [
  "providerPreset", "apiMode", "endpoint", "model", "reasoningEffort",
  "disableStorage", "outputLanguage", "imageQuality", "promptOrder",
  "includeMeta", "saveKey", "apiKey", "sourceMode"
];

const elements = {
  versionBadge: document.querySelector("#version-badge"),
  footerVersion: document.querySelector("#footer-version"),
  compactModeButton: document.querySelector("#compact-mode-button"),
  inputModuleCode: document.querySelector("#input-module-code"),
  sourceTitle: document.querySelector("#source-title"),
  sourceModeButtons: [...document.querySelectorAll("[data-source-mode]")],
  manualDetailButtons: [...document.querySelectorAll("[data-manual-detail-mode]")],
  urlInputPanel: document.querySelector("#url-input-panel"),
  manualInputPanel: document.querySelector("#manual-input-panel"),
  postUrl: document.querySelector("#post-url"),
  manualText: document.querySelector("#manual-text"),
  manualImages: document.querySelector("#manual-images"),
  manualImageDropzone: document.querySelector("#manual-image-dropzone"),
  manualImageList: document.querySelector("#manual-image-list"),
  clearManualImages: document.querySelector("#clear-manual-images"),
  primaryActions: document.querySelector(".primary-actions"),
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
  resolvedEndpoint: document.querySelector("#resolved-endpoint"),
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
  legacyResults: document.querySelector("#legacy-results"),
  manualResults: document.querySelector("#manual-results"),
  tagsOutput: document.querySelector("#tags-output"),
  visualOutput: document.querySelector("#visual-output"),
  combinedOutput: document.querySelector("#combined-output"),
  baseOutput: document.querySelector("#base-output"),
  characterResults: document.querySelector("#character-results"),
  undesiredOutput: document.querySelector("#undesired-output"),
  characterTemplate: document.querySelector("#character-result-template"),
  copyAll: document.querySelector("#copy-all")
};

let lastDefaultEndpoint = DEFAULT_ENDPOINTS.responses;
let diagnosticRun = null;
let sourceMode = "url";
let manualDetailMode = "simple";
let isBusy = false;
let manualBundle = "";
const referencePicker = createReferenceImagePicker({
  input: elements.manualImages,
  dropzone: elements.manualImageDropzone,
  list: elements.manualImageList,
  clearButton: elements.clearManualImages,
  pasteTarget: elements.manualInputPanel,
  onChange: (count) => setStatus("idle", count ? `已选择 ${count} 张参考图` : "等待输入画面描述或添加参考图"),
  onError: (message) => setStatus("error", message)
});

showVersion();
await restoreSettings();
bindEvents();
window.addEventListener("pagehide", () => referencePicker.destroy());

function showVersion() {
  const version = chrome.runtime.getManifest().version;
  elements.versionBadge.textContent = `v${version}`;
  elements.footerVersion.textContent = `v${version}`;
}

async function restoreSettings() {
  const [saved, session] = await Promise.all([
    chrome.storage.local.get(SETTING_KEYS),
    chrome.storage.session.get(["sourcePostUrl", "sourceManualText", "manualDetailMode", "lastPromptResult"])
  ]);
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
  elements.postUrl.value = session.sourcePostUrl || "";
  elements.manualText.value = session.sourceManualText || "";
  manualDetailMode = session.manualDetailMode === "detailed" ? "detailed" : "simple";
  sourceMode = saved.sourceMode === "manual" ? "manual" : "url";
  applySourceMode(sourceMode);
  applyManualDetailMode();
  lastDefaultEndpoint = DEFAULT_ENDPOINTS[elements.apiMode.value];
  updateEndpointPreview();
  restoreLastResult(session.lastPromptResult);
}

function bindEvents() {
  elements.compactModeButton.addEventListener("click", switchToCompactMode);

  for (const button of elements.sourceModeButtons) {
    button.addEventListener("click", () => switchSourceMode(button.dataset.sourceMode));
  }
  for (const button of elements.manualDetailButtons) {
    button.addEventListener("click", () => switchManualDetailMode(button.dataset.manualDetailMode));
  }

  elements.exampleButton.addEventListener("click", () => {
    if (sourceMode === "manual") {
      elements.manualText.value = EXAMPLE_MANUAL_TEXT;
      elements.manualText.focus();
      setStatus("idle", "示例画面描述已填入");
    } else {
      elements.postUrl.value = EXAMPLE_URL;
      elements.postUrl.focus();
      setStatus("idle", "示例链接已填入");
    }
    void persistSourceInputs();
  });

  elements.analyzeButton.addEventListener("click", () => runPipeline({ tagsOnly: false }));
  elements.tagsOnlyButton.addEventListener("click", () => runPipeline({ tagsOnly: true }));
  elements.postUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runPipeline({ tagsOnly: false });
  });
  elements.manualText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runPipeline({ tagsOnly: false });
    }
  });
  elements.postUrl.addEventListener("change", persistSourceInputs);
  elements.manualText.addEventListener("change", persistSourceInputs);

  elements.providerPreset.addEventListener("change", () => {
    applyProviderPreset(elements.providerPreset.value);
    updateEndpointPreview();
    persistSettings();
  });

  elements.apiMode.addEventListener("change", () => {
    const current = elements.endpoint.value.trim();
    if (!current || Object.values(DEFAULT_ENDPOINTS).includes(current) || current === lastDefaultEndpoint) {
      elements.endpoint.value = DEFAULT_ENDPOINTS[elements.apiMode.value];
    }
    lastDefaultEndpoint = DEFAULT_ENDPOINTS[elements.apiMode.value];
    updateEndpointPreview();
    persistSettings();
  });

  elements.endpoint.addEventListener("input", updateEndpointPreview);

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
  elements.copyAll.addEventListener("click", () => {
    const value = elements.manualResults.classList.contains("is-hidden")
      ? elements.combinedOutput.value
      : manualBundle;
    copyText(value, elements.copyAll);
  });
  elements.copyDiagnostics.addEventListener("click", () => copyText(elements.diagnosticsOutput.value, elements.copyDiagnostics));
}

async function switchToCompactMode() {
  const apiKey = elements.apiKey.value.trim();
  await Promise.all([persistSettings(), persistSourceInputs()]);
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
    saveKey: elements.saveKey.checked,
    sourceMode
  };

  if (elements.saveKey.checked) settings.apiKey = elements.apiKey.value.trim();
  await chrome.storage.local.set(settings);
  if (!elements.saveKey.checked) await chrome.storage.local.remove("apiKey");
}

async function persistSourceInputs() {
  await chrome.storage.session.set({
    sourcePostUrl: elements.postUrl.value.trim(),
    sourceManualText: elements.manualText.value,
    manualDetailMode
  });
}

async function switchManualDetailMode(mode) {
  if (isBusy) return;
  manualDetailMode = mode === "detailed" ? "detailed" : "simple";
  applyManualDetailMode();
  await chrome.storage.session.set({ manualDetailMode });
}

function applyManualDetailMode() {
  for (const button of elements.manualDetailButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.manualDetailMode === manualDetailMode));
  }
}

async function switchSourceMode(mode) {
  if (isBusy) return;
  sourceMode = mode === "manual" ? "manual" : "url";
  applySourceMode(sourceMode);
  elements.results.classList.add("is-hidden");
  elements.previewCard.classList.add("is-hidden");
  hideDiagnostics();
  await Promise.all([
    chrome.storage.local.set({ sourceMode }),
    persistSourceInputs()
  ]);
}

function applySourceMode(mode) {
  const manual = mode === "manual";
  for (const button of elements.sourceModeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.sourceMode === mode));
  }
  elements.urlInputPanel.classList.toggle("is-hidden", manual);
  elements.manualInputPanel.classList.toggle("is-hidden", !manual);
  elements.tagsOnlyButton.classList.toggle("is-hidden", manual);
  elements.primaryActions.classList.toggle("single-action", manual);
  elements.inputModuleCode.textContent = manual ? "INPUT / TEXT + IMAGE" : "INPUT / URL";
  elements.sourceTitle.textContent = manual ? "输入描述或参考图" : "粘贴帖子链接";
  elements.analyzeButton.innerHTML = manual
    ? '<span class="button-icon" aria-hidden="true">✦</span>生成提示词'
    : '<span class="button-icon" aria-hidden="true">✦</span>提取并分析';
  setStatus("idle", manual ? "等待输入画面描述或添加参考图" : "等待输入链接");
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

function updateEndpointPreview() {
  const providerNames = {
    openai: "OpenAI",
    xai: "xAI Grok",
    jarless: "JarlessAPI",
    custom: "自定义服务"
  };
  try {
    const endpoint = resolveApiEndpoint(
      elements.endpoint.value,
      elements.apiMode.value,
      elements.providerPreset.value
    );
    const provider = providerNames[elements.providerPreset.value] || "自定义服务";
    elements.resolvedEndpoint.textContent = `实际请求：${provider} · ${endpoint}`;
  } catch {
    elements.resolvedEndpoint.textContent = "实际请求：接口地址或协议模式不匹配";
  }
}

async function runPipeline({ tagsOnly }) {
  if (isBusy) return;
  diagnosticRun = {
    version: chrome.runtime.getManifest().version,
    startedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    sourceMode,
    postUrl: sourceMode === "url" ? elements.postUrl.value.trim() : undefined,
    manualTextLength: sourceMode === "manual" ? elements.manualText.value.trim().length : undefined,
    referenceImageCount: sourceMode === "manual" ? referencePicker.files.length : undefined,
    api: sourceMode === "manual" ? {
      provider: elements.providerPreset.value,
      mode: elements.apiMode.value,
      endpoint: sanitizeEndpointForDiagnostics(elements.endpoint.value),
      model: elements.model.value.trim(),
      reasoningEffort: elements.reasoningEffort.value
    } : undefined,
    events: []
  };
  hideDiagnostics();
  setBusy(true);
  elements.results.classList.add("is-hidden");
  elements.previewCard.classList.add("is-hidden");
  elements.visualOutput.value = "";
  elements.combinedOutput.value = "";

  try {
    if (sourceMode === "manual") {
      await runManualTextPipeline();
      return;
    }

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
    showLegacyResults();
    elements.results.classList.remove("is-hidden");
    renderPreview(post);
    await saveLegacyResult();

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
    const imageDataUrl = await fetchImageAsDataUrl(imageUrl, post.preview_file_url, {
      endpoint,
      model: elements.model.value.trim()
    });
    const visualPrompt = await callVisionApi({ endpoint, apiKey, imageDataUrl });

    elements.visualOutput.value = visualPrompt;
    elements.combinedOutput.value = buildCombinedPrompt(
      tagPrompt,
      visualPrompt,
      elements.promptOrder.value
    );
    autoSizeOutputs();
    setStatus("success", "三种 Prompt 已全部生成");
    await Promise.all([persistSettings(), saveLegacyResult()]);
  } catch (error) {
    recordDiagnostic("pipeline-error", { name: error?.name, message: cleanError(error), stack: error?.stack });
    setStatus("error", `处理失败：${cleanError(error)}`);
    showDiagnostics();
  } finally {
    setBusy(false);
  }
}

async function runManualTextPipeline() {
  const userText = elements.manualText.value.trim();
  const referenceFiles = referencePicker.files;
  if (!userText && !referenceFiles.length) throw new Error("请输入画面描述或添加参考图。 ");

  const apiKey = elements.apiKey.value.trim();
  if (!apiKey) throw new Error("手动文本生成需要 API Key，请先在设置中填写。 ");
  if (!elements.model.value.trim()) throw new Error("请填写模型名称。 ");

  const endpoint = resolveApiEndpoint(
    elements.endpoint.value,
    elements.apiMode.value,
    elements.providerPreset.value
  );
  await ensureEndpointPermission(endpoint);
  setStatus("busy", referenceFiles.length ? "正在读取参考图并生成专业提示词…" : "正在将画面描述重构为专业提示词…");
  recordDiagnostic("manual-input-ready", {
    textLength: userText.length,
    referenceImages: referenceFiles.map((file) => ({
      type: file.type || "unknown",
      sizeBytes: file.size
    }))
  });
  const imageDataUrls = await readReferenceImagesAsDataUrls(referenceFiles, {
    endpoint,
    model: elements.model.value.trim()
  });
  const result = await callManualPromptApi({
    endpoint,
    apiKey,
    userText,
    imageDataUrls,
    detailMode: manualDetailMode
  });
  renderManualResult(result);
  await Promise.all([
    persistSettings(),
    persistSourceInputs(),
    chrome.storage.session.set({ lastPromptResult: { mode: "manual", result } })
  ]);
  setStatus("success", "NovelAI V5 分区提示词已生成");
}

async function ensureEndpointPermission(endpoint) {
  const url = new URL(endpoint);
  if (isBuiltInApiEndpoint(endpoint)) return;
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

function showLegacyResults() {
  elements.legacyResults.classList.remove("is-hidden");
  elements.manualResults.classList.add("is-hidden");
}

function renderManualResult(result) {
  manualBundle = formatManualPromptBundle(result);
  elements.baseOutput.value = result.basePrompt.prompt;
  elements.undesiredOutput.value = result.undesiredContent;
  elements.characterResults.replaceChildren();

  for (const [index, item] of result.characterPrompts.entries()) {
    const card = elements.characterTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".result-index").textContent = `C${index + 1}`;
    card.querySelector("h3").textContent = item.name;
    card.querySelector(".position-label").textContent = `POSITION / ${item.position}`;
    card.querySelector("textarea").value = item.prompt;
    card.querySelector("button").addEventListener("click", (event) => copyText(item.prompt, event.currentTarget));
    elements.characterResults.append(card);
  }

  elements.legacyResults.classList.add("is-hidden");
  elements.manualResults.classList.remove("is-hidden");
  elements.results.classList.remove("is-hidden");
  autoSizeOutputs();
}

async function saveLegacyResult() {
  const preview = elements.previewCard.classList.contains("is-hidden") ? null : {
    src: elements.previewImage.src,
    meta: elements.postMeta.textContent
  };
  await chrome.storage.session.set({
    lastPromptResult: {
      mode: "url",
      tagsPrompt: elements.tagsOutput.value,
      visualPrompt: elements.visualOutput.value,
      combinedPrompt: elements.combinedOutput.value,
      preview
    }
  });
}

function restoreLastResult(state) {
  if (!state || !["url", "manual"].includes(state.mode)) return;
  sourceMode = state.mode;
  applySourceMode(sourceMode);

  if (state.mode === "manual" && state.result?.basePrompt?.prompt) {
    renderManualResult(state.result);
  } else if (state.mode === "url" && state.combinedPrompt) {
    elements.tagsOutput.value = state.tagsPrompt || "";
    elements.visualOutput.value = state.visualPrompt || "";
    elements.combinedOutput.value = state.combinedPrompt;
    showLegacyResults();
    elements.results.classList.remove("is-hidden");
    if (state.preview?.src) {
      elements.previewImage.src = state.preview.src;
      elements.postMeta.textContent = state.preview.meta || "—";
      elements.previewCard.classList.remove("is-hidden");
    }
    autoSizeOutputs();
  } else {
    return;
  }
  setStatus("success", "已恢复上次生成结果");
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
  const shouldStream = mode === "responses" && isGrokModel(body.model);
  if (shouldStream) body.stream = true;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });
  const isEventStream = shouldStream && response.headers.get("content-type")?.includes("text/event-stream");
  const data = isEventStream ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `视觉 API 请求失败（HTTP ${response.status}）。`;
    throw new Error(message);
  }

  const rawText = isEventStream
    ? await readResponsesStream(response)
    : mode === "responses" ? extractResponsesText(data) : extractChatText(data);
  const text = normalizeVisualPrompt(rawText);
  if (!text) throw new Error("视觉 API 已响应，但没有返回可用文本。 ");
  return text;
}

async function callManualPromptApi({ endpoint, apiKey, userText, imageDataUrls, detailMode }) {
  const instruction = buildManualPromptInstruction(detailMode);
  const mode = elements.apiMode.value;
  const body = mode === "responses"
    ? buildTextResponsesRequest({
        model: elements.model.value.trim(),
        instruction,
        userText,
        imageDataUrls,
        reasoningEffort: elements.reasoningEffort.value,
        disableStorage: elements.disableStorage.checked
      })
    : {
        model: elements.model.value.trim(),
        max_tokens: 1800,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: buildManualChatContent({ userText, imageDataUrls }) }
        ]
      };
  const shouldStream = mode === "responses" && imageDataUrls.length > 0 && isGrokModel(body.model);
  if (shouldStream) body.stream = true;

  const requestBody = JSON.stringify(body);
  const requestStartedAt = performance.now();
  recordDiagnostic("api-request", {
    endpoint: sanitizeEndpointForDiagnostics(endpoint),
    mode,
    model: body.model,
    bodyBytes: new TextEncoder().encode(requestBody).byteLength,
    imageCount: imageDataUrls.length,
    stream: shouldStream
  });

  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: requestBody
    });
  } catch (error) {
    recordDiagnostic("api-network-error", {
      durationMs: Math.round(performance.now() - requestStartedAt),
      name: error?.name,
      message: cleanError(error)
    });
    throw error;
  }

  const requestId = response.headers.get("x-request-id")
    || response.headers.get("request-id")
    || response.headers.get("cf-ray")
    || undefined;
  const isEventStream = shouldStream
    && response.ok
    && response.headers.get("content-type")?.includes("text/event-stream");
  if (isEventStream) {
    recordDiagnostic("api-response", {
      status: response.status,
      statusText: response.statusText,
      ok: true,
      durationMs: Math.round(performance.now() - requestStartedAt),
      requestId,
      stream: true
    });
    try {
      const rawText = await readResponsesStream(response);
      recordDiagnostic("api-stream-complete", {
        durationMs: Math.round(performance.now() - requestStartedAt),
        outputCharacters: rawText.length
      });
      return parseManualPromptResult(rawText);
    } catch (error) {
      recordDiagnostic("api-stream-error", {
        durationMs: Math.round(performance.now() - requestStartedAt),
        message: cleanError(error)
      });
      throw error;
    }
  }

  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    // Keep non-JSON gateway errors available as a short diagnostic message.
  }
  const serverMessage = data?.error?.message || data?.message || (!response.ok ? responseText.trim() : "");
  recordDiagnostic("api-response", {
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    durationMs: Math.round(performance.now() - requestStartedAt),
    requestId,
    errorType: data?.error?.type,
    errorCode: data?.error?.code,
    serverMessage: !response.ok ? truncateDiagnosticText(serverMessage) : undefined,
    stream: false
  });
  if (!response.ok) {
    const statusLabel = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    throw new Error(serverMessage
      ? `${truncateDiagnosticText(serverMessage)}（${statusLabel}）`
      : `AI API 请求失败（${statusLabel}）。`);
  }

  const rawText = mode === "responses" ? extractResponsesText(data) : extractChatText(data);
  return parseManualPromptResult(rawText);
}

function setBusy(busy) {
  isBusy = busy;
  elements.analyzeButton.disabled = busy;
  elements.tagsOnlyButton.disabled = busy;
  for (const button of elements.sourceModeButtons) button.disabled = busy;
  for (const button of elements.manualDetailButtons) button.disabled = busy;
  referencePicker.setDisabled(busy);
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

function sanitizeEndpointForDiagnostics(rawValue) {
  try {
    const url = new URL(String(rawValue || "").trim());
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-endpoint";
  }
}

function truncateDiagnosticText(value, maxLength = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
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
  for (const textarea of elements.results.querySelectorAll("textarea")) {
    if (textarea.closest(".is-hidden")) continue;
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
