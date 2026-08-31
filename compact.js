import {
  buildCombinedPrompt,
  buildTagPrompt,
  chooseImageUrl,
  formatManualPromptBundle,
  isBuiltInApiEndpoint,
  normalizeVisualParagraphKeys,
  parsePostUrl
} from "./core.js";
import {
  callManualPromptApi as requestManualPrompt,
  callVisionApi as requestVisionPrompt,
  resolveSettingsEndpoint
} from "./api-client.js";
import { fetchImageAsDataUrl, readReferenceImagesAsDataUrls } from "./image-utils.js";
import { requestPost as requestDanbooruPost } from "./post-source.js";
import { createReferenceImagePicker } from "./reference-picker.js";
import { loadSettings } from "./settings.js";

const elements = {
  version: document.querySelector("#version"),
  inputLabel: document.querySelector("#input-label"),
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
  visualParagraphFilter: document.querySelector("#visual-paragraph-filter"),
  visualParagraphInputs: [...document.querySelectorAll("[data-visual-paragraph]")],
  generateButton: document.querySelector("#generate-button"),
  copyButton: document.querySelector("#copy-button"),
  fullModeButton: document.querySelector("#full-mode-button"),
  status: document.querySelector("#status"),
  statusText: document.querySelector("#status-text"),
  resultMeta: document.querySelector("#result-meta")
};

let combinedPrompt = "";
let settings = null;
let manualDetailMode = "simple";
let isBusy = false;
let currentTagPrompt = "";
let currentVisualPrompt = "";
const referencePicker = createReferenceImagePicker({
  input: elements.manualImages,
  dropzone: elements.manualImageDropzone,
  list: elements.manualImageList,
  clearButton: elements.clearManualImages,
  pasteTarget: elements.manualInputPanel,
  onChange: (count) => setStatus("idle", count ? `已选择 ${count} 张参考图` : "等待输入描述或添加参考图"),
  onError: (message) => setStatus("error", message)
});

await initialize();
window.addEventListener("pagehide", () => referencePicker.destroy());

async function initialize() {
  elements.version.textContent = `v${chrome.runtime.getManifest().version}`;
  const [saved, session] = await Promise.all([
    loadSettings(),
    chrome.storage.session.get([
      "sourcePostUrl", "sourceManualText", "compactLastUrl",
      "compactLastPrompt", "compactLastMeta", "manualDetailMode", "lastPromptResult"
    ])
  ]);
  settings = saved;

  elements.postUrl.value = session.sourcePostUrl || session.compactLastUrl || "";
  elements.manualText.value = session.sourceManualText || "";
  manualDetailMode = session.manualDetailMode === "detailed" ? "detailed" : "simple";
  settings.sourceMode = settings.sourceMode === "manual" ? "manual" : "url";
  if (["url", "manual"].includes(session.lastPromptResult?.mode)) {
    settings.sourceMode = session.lastPromptResult.mode;
  }
  applySourceMode();
  applyManualDetailMode();
  applyVisualParagraphSelection();
  restorePromptResult(session.lastPromptResult, session);
  if (!combinedPrompt && session.compactLastPrompt) {
    combinedPrompt = session.compactLastPrompt;
    elements.copyButton.disabled = false;
    elements.resultMeta.textContent = session.compactLastMeta || "上一条结果已就绪";
    elements.resultMeta.classList.remove("is-hidden");
    setStatus("success", "上一条结果可直接复制");
  }

  elements.generateButton.addEventListener("click", runPipeline);
  elements.copyButton.addEventListener("click", copyCombinedPrompt);
  elements.fullModeButton.addEventListener("click", switchToFullMode);
  for (const button of elements.sourceModeButtons) {
    button.addEventListener("click", () => switchSourceMode(button.dataset.sourceMode));
  }
  for (const button of elements.manualDetailButtons) {
    button.addEventListener("click", () => switchManualDetailMode(button.dataset.manualDetailMode));
  }
  for (const input of elements.visualParagraphInputs) {
    input.addEventListener("change", handleVisualParagraphSelectionChange);
  }
  elements.postUrl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runPipeline();
  });
  elements.manualText.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runPipeline();
    }
  });
  elements.postUrl.addEventListener("change", persistSourceInputs);
  elements.manualText.addEventListener("change", persistSourceInputs);
}

async function switchSourceMode(mode) {
  if (isBusy) return;
  settings.sourceMode = mode === "manual" ? "manual" : "url";
  applySourceMode();
  combinedPrompt = "";
  elements.copyButton.disabled = true;
  elements.resultMeta.classList.add("is-hidden");
  await Promise.all([
    chrome.storage.local.set({ sourceMode: settings.sourceMode }),
    persistSourceInputs()
  ]);
}

function applySourceMode() {
  const manual = settings.sourceMode === "manual";
  for (const button of elements.sourceModeButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.sourceMode === settings.sourceMode));
  }
  elements.urlInputPanel.classList.toggle("is-hidden", manual);
  elements.manualInputPanel.classList.toggle("is-hidden", !manual);
  elements.visualParagraphFilter.classList.toggle("is-hidden", manual);
  elements.inputLabel.textContent = manual ? "01 / TEXT + IMAGE" : "01 / POST URL";
  elements.generateButton.innerHTML = manual
    ? '<span aria-hidden="true">✦</span> 生成提示词'
    : '<span aria-hidden="true">✦</span> 生成 TAG + NL';
  setStatus("idle", manual ? "等待输入描述或添加参考图" : "等待粘贴链接");
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

async function switchToFullMode() {
  await persistSourceInputs();
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
  if (isBusy) return;
  setBusy(true);
  combinedPrompt = "";
  elements.copyButton.disabled = true;
  elements.resultMeta.classList.add("is-hidden");

  try {
    const apiKey = String(settings.apiKey || "").trim();
    if (!apiKey) throw new Error("请先在完整版填写 API Key；可保存到本机或直接切换到小窗");
    if (!String(settings.model || "").trim()) throw new Error("完整版设置中缺少模型名称");

    const endpoint = resolveSettingsEndpoint(settings);
    await verifyEndpointPermission(endpoint);

    if (settings.sourceMode === "manual") {
      await runManualTextPipeline({ endpoint, apiKey });
      return;
    }

    const parsed = parsePostUrl(elements.postUrl.value);

    setStatus("busy", `读取 Post #${parsed.id}…`);
    const post = await requestDanbooruPost(parsed.normalizedUrl, {
      onStatus: (message) => setStatus("busy", message)
    });
    const tagPrompt = buildTagPrompt(post, { includeMeta: Boolean(settings.includeMeta) });
    if (!tagPrompt) throw new Error("帖子没有可用标签");

    setStatus("busy", "分析主图与美术语言…");
    const imageUrl = chooseImageUrl(post, settings.imageQuality) || post.preview_file_url;
    if (!imageUrl) throw new Error("帖子没有可读取的主图 URL");
    const imageDataUrl = await fetchImageAsDataUrl(imageUrl, post.preview_file_url, {
      endpoint,
      model: settings.model.trim()
    });
    const visualPrompt = await requestVisionPrompt(settings, imageDataUrl);

    currentTagPrompt = tagPrompt;
    currentVisualPrompt = visualPrompt;
    combinedPrompt = buildCombinedPrompt(
      tagPrompt,
      visualPrompt,
      settings.promptOrder,
      settings.visualParagraphKeys
    );
    const tagCount = tagPrompt.split(", ").length;
    const wordCount = visualPrompt.trim().split(/\s+/).filter(Boolean).length;
    const meta = `${tagCount} TAGS / ${wordCount} NL WORDS`;
    await chrome.storage.session.set({
      compactLastUrl: parsed.normalizedUrl,
      compactLastPrompt: combinedPrompt,
      compactLastMeta: meta,
      sourcePostUrl: parsed.normalizedUrl,
      lastPromptResult: {
        mode: "url",
        tagsPrompt: tagPrompt,
        visualPrompt,
        combinedPrompt,
        preview: null
      }
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

async function runManualTextPipeline({ endpoint, apiKey }) {
  const userText = elements.manualText.value.trim();
  const referenceFiles = referencePicker.files;
  if (!userText && !referenceFiles.length) throw new Error("请输入画面描述或添加参考图");

  setStatus("busy", referenceFiles.length ? "正在读取参考图并生成提示词…" : "正在重构手动画面描述…");
  const imageDataUrls = await readReferenceImagesAsDataUrls(referenceFiles, {
    endpoint,
    model: settings.model.trim()
  });
  const result = await requestManualPrompt(settings, userText, imageDataUrls, manualDetailMode);
  combinedPrompt = formatManualPromptBundle(result);
  const referenceMeta = referenceFiles.length ? ` / ${referenceFiles.length} REF` : "";
  const meta = `MANUAL${referenceMeta} / ${result.characterPrompts.length} CHARACTER REGIONS`;
  await chrome.storage.session.set({
    sourceManualText: userText,
    compactLastPrompt: combinedPrompt,
    compactLastMeta: meta,
    lastPromptResult: { mode: "manual", result }
  });

  elements.copyButton.disabled = false;
  elements.resultMeta.textContent = meta;
  elements.resultMeta.classList.remove("is-hidden");
  setStatus("success", "手动提示词已生成，可复制");
}

function restorePromptResult(state, session) {
  if (state?.mode === "manual" && state.result?.basePrompt?.prompt) {
    combinedPrompt = formatManualPromptBundle(state.result);
    elements.resultMeta.textContent = `MANUAL / ${state.result.characterPrompts.length} CHARACTER REGIONS`;
  } else if (state?.mode === "url" && state.combinedPrompt) {
    currentTagPrompt = state.tagsPrompt || "";
    currentVisualPrompt = state.visualPrompt || "";
    combinedPrompt = buildCombinedPrompt(
      currentTagPrompt,
      currentVisualPrompt,
      settings.promptOrder,
      settings.visualParagraphKeys
    );
    elements.resultMeta.textContent = session.compactLastMeta || "上一条结果已就绪";
  }
  if (!combinedPrompt) return;
  elements.copyButton.disabled = false;
  elements.resultMeta.classList.remove("is-hidden");
  setStatus("success", "已恢复上次生成结果");
}

function getSelectedVisualParagraphKeys() {
  return elements.visualParagraphInputs
    .filter((input) => input.checked)
    .map((input) => input.dataset.visualParagraph);
}

function applyVisualParagraphSelection() {
  const selected = new Set(normalizeVisualParagraphKeys(settings.visualParagraphKeys));
  settings.visualParagraphKeys = [...selected];
  for (const input of elements.visualParagraphInputs) {
    input.checked = selected.has(input.dataset.visualParagraph);
  }
}

async function handleVisualParagraphSelectionChange() {
  settings.visualParagraphKeys = getSelectedVisualParagraphKeys();
  if (currentTagPrompt || currentVisualPrompt) {
    combinedPrompt = buildCombinedPrompt(
      currentTagPrompt,
      currentVisualPrompt,
      settings.promptOrder,
      settings.visualParagraphKeys
    );
    elements.copyButton.disabled = !combinedPrompt;
    await chrome.storage.session.set({
      compactLastPrompt: combinedPrompt,
      lastPromptResult: {
        mode: "url",
        tagsPrompt: currentTagPrompt,
        visualPrompt: currentVisualPrompt,
        combinedPrompt,
        preview: null
      }
    });
  }
  await chrome.storage.local.set({ visualParagraphKeys: settings.visualParagraphKeys });
}

async function verifyEndpointPermission(endpoint) {
  const url = new URL(endpoint);
  if (isBuiltInApiEndpoint(endpoint)) return;
  const originPattern = `${url.origin}/*`;
  const granted = await chrome.permissions.contains({ origins: [originPattern] });
  if (!granted) throw new Error("请先在完整版中授权这个自定义 API 地址");
}

async function copyCombinedPrompt() {
  if (!combinedPrompt) return;
  await navigator.clipboard.writeText(combinedPrompt);
  const original = elements.copyButton.textContent;
  elements.copyButton.textContent = "已复制提示词";
  setStatus("success", "已复制到剪贴板");
  setTimeout(() => { elements.copyButton.textContent = original; }, 1200);
}

function setBusy(busy) {
  isBusy = busy;
  elements.generateButton.disabled = busy;
  for (const button of elements.sourceModeButtons) button.disabled = busy;
  for (const button of elements.manualDetailButtons) button.disabled = busy;
  for (const input of elements.visualParagraphInputs) input.disabled = busy;
  referencePicker.setDisabled(busy);
  elements.generateButton.innerHTML = busy
    ? '<span aria-hidden="true">◌</span> 正在生成…'
    : settings.sourceMode === "manual"
      ? '<span aria-hidden="true">✦</span> 生成提示词'
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
