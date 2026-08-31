import { PROVIDER_PRESETS } from "./api-client.js";
import { DEFAULT_VISUAL_PARAGRAPH_KEYS, normalizeVisualParagraphKeys } from "./core.js";

export const DEFAULTS = {
  providerPreset: "jarless",
  ...PROVIDER_PRESETS.jarless,
  outputLanguage: "en",
  imageQuality: "large",
  promptOrder: "tags-first",
  visualParagraphKeys: [...DEFAULT_VISUAL_PARAGRAPH_KEYS],
  includeMeta: false,
  sourceMode: "url",
  saveKey: false,
  apiKey: ""
};

export const SETTING_KEYS = [...Object.keys(DEFAULTS), "keyOrigin"];

export function endpointOrigin(endpoint) {
  try {
    return new URL(String(endpoint || "").trim()).origin;
  } catch {
    return "";
  }
}

export function restoreKey(saved, session, endpoint) {
  const origin = endpointOrigin(endpoint);
  if (!origin) return "";
  if (saved.saveKey && (saved.keyOrigin || endpointOrigin(saved.endpoint)) === origin) {
    return saved.apiKey || "";
  }
  return session.keyOrigin === origin ? session.apiKey || "" : "";
}

export function settingsForProvider(current, providerPreset) {
  const preset = PROVIDER_PRESETS[providerPreset];
  if (!preset) return { ...current, providerPreset: "custom" };
  const sameOrigin = endpointOrigin(current.endpoint) === endpointOrigin(preset.endpoint);
  return {
    ...current,
    ...preset,
    providerPreset,
    apiKey: sameOrigin ? current.apiKey : ""
  };
}

export async function loadSettings() {
  const [saved, session] = await Promise.all([
    chrome.storage.local.get(SETTING_KEYS),
    chrome.storage.session.get(["apiKey", "keyOrigin"])
  ]);
  const providerPreset = saved.providerPreset || "jarless";
  const preset = PROVIDER_PRESETS[providerPreset] || PROVIDER_PRESETS.jarless;
  const settings = { ...DEFAULTS, ...preset, ...saved, providerPreset };
  settings.apiKey = restoreKey(saved, session, settings.endpoint);
  settings.sourceMode = settings.sourceMode === "manual" ? "manual" : "url";
  settings.outputLanguage = "en";
  settings.visualParagraphKeys = normalizeVisualParagraphKeys(settings.visualParagraphKeys);
  return settings;
}

export async function saveSettings(settings) {
  const keyOrigin = endpointOrigin(settings.endpoint);
  const apiKey = String(settings.apiKey || "").trim();
  const local = {};
  for (const key of SETTING_KEYS) {
    if (key !== "apiKey" && key !== "keyOrigin" && settings[key] !== undefined) local[key] = settings[key];
  }
  local.keyOrigin = keyOrigin;
  if (settings.saveKey) local.apiKey = apiKey;

  await chrome.storage.local.set(local);
  if (!settings.saveKey) await chrome.storage.local.remove("apiKey");
  await chrome.storage.session.set({ apiKey, keyOrigin });
}
