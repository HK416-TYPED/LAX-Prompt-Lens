// Browser-only fixture: no network requests or real credentials leave this page.
(() => {
  const tagsPrompt = "1girl, red hair, seated, reaching toward viewer, low angle, watercolor, white background";
  const visualPrompt = [
    "An experimental Japanese illustration of a red-haired girl whose face remains the primary focal point.",
    "The composition uses a low camera angle, a tight crop, and a sweeping diagonal toward the figure.",
    "Wisps of hair overlap the foreground while an abstract blue circle and pale atmosphere recede behind her.",
    "Loose watercolor washes, broken brown line art, warm red accents, cool blue shadows, and visible paper grain create a quiet editorial finish."
  ].join("\n\n");
  const combinedPrompt = `${tagsPrompt},\n\n${visualPrompt}`;
  const local = {
    providerPreset: "jarless",
    endpoint: "https://jarlessapi.com",
    apiMode: "responses",
    model: "gpt-5.6-luna",
    reasoningEffort: "xhigh",
    disableStorage: true,
    sourceMode: "url",
    visualParagraphKeys: ["subject", "composition", "environment", "rendering"]
  };
  const session = {
    sourcePostUrl: "https://shima.donmai.us/posts/12",
    lastPromptResult: {
      mode: "url",
      tagsPrompt,
      visualPrompt,
      combinedPrompt,
      preview: null
    }
  };
  const area = (store) => ({ get: async () => ({ ...store }), set: async (values) => Object.assign(store, values), remove: async (key) => { delete store[key]; } });
  window.chrome = {
    runtime: { getManifest: () => ({ version: "0.8.0" }), sendMessage: async () => ({ ok: true }) },
    storage: { local: area(local), session: area(session), onChanged: { addListener() {} } },
    permissions: { request: async () => true, contains: async () => true },
    tabs: { query: async () => [] },
    action: { openPopup: async () => {} },
    windows: { WINDOW_ID_CURRENT: -2 },
    sidePanel: { open: async () => {} }
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input, location.href);
    if (url.origin === location.origin) return originalFetch(input, init);
    if (url.pathname.endsWith(".json")) return new Response(JSON.stringify({ id: 12, tag_string_general: "1girl red_hair", large_file_url: "https://cdn.donmai.us/mock.png" }), { headers: { "content-type": "application/json" } });
    if (url.pathname.endsWith("mock.png")) return originalFetch("icons/icon-128.png");
    if (init?.method === "POST") {
      const body = JSON.parse(init.body);
      const payload = body.contents ? { candidates: [{ content: { parts: [{ text: visualPrompt }] }, finishReason: "STOP" }] } : body.messages ? { choices: [{ message: { content: visualPrompt }, finish_reason: "stop" }] } : { output_text: visualPrompt, status: "completed" };
      return new Response(JSON.stringify(payload), { headers: { "content-type": "application/json" } });
    }
    throw new Error("UI harness blocked external network");
  };
  const banner = document.createElement("p");
  banner.textContent = "LOCAL UI TEST · Chrome APIs / AI responses are mocked";
  banner.style.cssText = "margin:0;padding:8px;background:#303715;color:#dfff00;font:11px monospace;text-align:center";
  document.body.prepend(banner);
})();
