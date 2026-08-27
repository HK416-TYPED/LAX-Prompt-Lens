const COMPACT_POPUP = "compact.html";

async function applyUiMode(mode) {
  const compact = mode === "compact";
  await chrome.action.setPopup({ popup: compact ? COMPACT_POPUP : "" });
  await chrome.action.setTitle({
    title: compact ? "打开 LAX Prompt Lens 小窗" : "打开 LAX Prompt Lens 完整版"
  });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !compact });
  await chrome.storage.local.set({ uiMode: compact ? "compact" : "full" });
}

async function restoreUiMode() {
  try {
    const { uiMode = "full" } = await chrome.storage.local.get("uiMode");
    await applyUiMode(uiMode);
  } catch (error) {
    console.warn("无法恢复界面模式：", error);
  }
}

chrome.runtime.onInstalled.addListener(restoreUiMode);
chrome.runtime.onStartup.addListener(restoreUiMode);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "set-ui-mode") return false;
  applyUiMode(message.mode)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
  return true;
});

void restoreUiMode();
