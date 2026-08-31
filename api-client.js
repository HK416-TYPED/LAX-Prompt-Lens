import {
  buildManualChatContent,
  buildManualPromptInstruction,
  buildResponsesRequest,
  buildTextResponsesRequest,
  buildVisionInstruction,
  extractChatText,
  extractResponsesText,
  normalizeVisualPrompt,
  parseManualPromptResult,
  readResponsesStream,
  resolveApiEndpoint,
  shouldUseResponsesStream
} from "./core.js";

export const PROVIDER_PRESETS = {
  jarless: { apiMode: "responses", endpoint: "https://jarlessapi.com", model: "gpt-5.6-luna", reasoningEffort: "xhigh", disableStorage: true },
  openai: { apiMode: "responses", endpoint: "https://api.openai.com/v1", model: "gpt-5.6-luna", reasoningEffort: "xhigh", disableStorage: true },
  xai: { apiMode: "responses", endpoint: "https://api.x.ai/v1", model: "grok-4.6", reasoningEffort: "high", disableStorage: true },
  gemini: { apiMode: "gemini", endpoint: "https://generativelanguage.googleapis.com", model: "gemini-2.5-flash", reasoningEffort: "none", disableStorage: true },
  glm: { apiMode: "chat", endpoint: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.6v", reasoningEffort: "none", disableStorage: true },
  kimi: { apiMode: "chat", endpoint: "https://api.moonshot.cn/v1", model: "kimi-k2.5", reasoningEffort: "none", disableStorage: true }
};

export function resolveSettingsEndpoint(settings) {
  return resolveApiEndpoint(
    settings.endpoint,
    settings.apiMode,
    settings.providerPreset,
    settings.model
  );
}

export function extractGeminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .filter((part) => !part.thought && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function callVisionApi(settings, imageDataUrl, onDiagnostic = () => {}, fetchImpl = fetch) {
  const instruction = buildVisionInstruction();
  const request = buildProviderRequest(settings, {
    instruction,
    userText: "Analyze this artwork and produce the requested final prompt.",
    imageDataUrls: [imageDataUrl],
    maxOutputTokens: 1600
  });
  const rawText = await performProviderRequest(settings, request, onDiagnostic, fetchImpl);
  const text = normalizeVisualPrompt(rawText);
  if (!text) throw new Error("视觉 API 已响应，但没有返回可用文本。 ");
  return text;
}

export async function callManualPromptApi(settings, userText, imageDataUrls, detailMode, onDiagnostic = () => {}, fetchImpl = fetch) {
  const instruction = buildManualPromptInstruction(detailMode);
  const request = buildProviderRequest(settings, {
    instruction,
    userText,
    imageDataUrls,
    maxOutputTokens: 8192,
    manual: true
  });
  const rawText = await performProviderRequest(settings, request, onDiagnostic, fetchImpl);
  return parseManualPromptResult(rawText);
}

export function buildProviderRequest(settings, {
  instruction,
  userText = "",
  imageDataUrls = [],
  maxOutputTokens = 4096,
  manual = false
}) {
  const endpoint = resolveSettingsEndpoint(settings);
  const model = String(settings.model || "").trim();
  if (!model) throw new Error("请填写支持图像输入的模型名称。 ");
  if (!String(settings.apiKey || "").trim()) throw new Error("请在完整版设置中填写此服务的 API Key。 ");

  if (settings.apiMode === "gemini") {
    const parts = [{ text: manual ? buildManualInputText(instruction, userText, imageDataUrls.length) : `${instruction}\n\n${userText}` }];
    for (const [index, imageDataUrl] of imageDataUrls.entries()) {
      const image = parseInlineImage(imageDataUrl);
      if (manual) parts.push({ text: `Reference image ${index + 1} (${index === 0 ? "primary" : "supplementary"})` });
      parts.push({ inlineData: image });
    }
    return {
      endpoint,
      headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey.trim() },
      body: { contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens } },
      stream: false
    };
  }

  let body;
  if (settings.apiMode === "responses") {
    body = manual
      ? buildTextResponsesRequest({
          model,
          instruction,
          userText,
          imageDataUrls,
          reasoningEffort: settings.reasoningEffort,
          disableStorage: Boolean(settings.disableStorage)
        })
      : buildResponsesRequest({
          model,
          instruction,
          imageDataUrl: imageDataUrls[0],
          reasoningEffort: settings.reasoningEffort,
          disableStorage: Boolean(settings.disableStorage)
        });
  } else {
    body = {
      model,
      max_tokens: maxOutputTokens,
      messages: [
        { role: "system", content: instruction },
        {
          role: "user",
          content: manual
            ? buildManualChatContent({ userText, imageDataUrls })
            : [
                { type: "text", text: userText },
                { type: "image_url", image_url: { url: imageDataUrls[0], detail: "high" } }
              ]
        }
      ]
    };
    if (["glm", "kimi"].includes(settings.providerPreset)) body.thinking = { type: "disabled" };
  }

  const stream = shouldUseResponsesStream(settings.apiMode, model);
  if (stream) body.stream = true;
  return {
    endpoint,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${settings.apiKey.trim()}` },
    body,
    stream
  };
}

export async function performProviderRequest(settings, request, onDiagnostic = () => {}, fetchImpl = fetch) {
  const bodyText = JSON.stringify(request.body);
  if (settings.apiMode === "gemini" && new TextEncoder().encode(bodyText).length > 20 * 1024 * 1024) {
    throw new Error("Gemini 内联请求超过 20 MB，请减少或缩小参考图后重试。 ");
  }

  const startedAt = performance.now();
  onDiagnostic("api-request", {
    endpoint: request.endpoint,
    mode: settings.apiMode,
    provider: settings.providerPreset,
    model: settings.model,
    bodyBytes: new TextEncoder().encode(bodyText).length,
    stream: request.stream
  });

  let response;
  try {
    response = await fetchImpl(request.endpoint, {
      method: "POST",
      headers: request.headers,
      body: bodyText,
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(180000)
    });
  } catch (error) {
    if (error?.name === "TimeoutError") throw new Error("AI API 请求超过 180 秒，请稍后重试。 ");
    throw error;
  }

  const requestId = response.headers.get("x-request-id")
    || response.headers.get("request-id")
    || response.headers.get("cf-ray")
    || undefined;
  const isEventStream = request.stream
    && response.ok
    && response.headers.get("content-type")?.includes("text/event-stream");
  onDiagnostic("api-response", {
    status: response.status,
    statusText: response.statusText,
    durationMs: Math.round(performance.now() - startedAt),
    requestId,
    stream: isEventStream
  });

  if (isEventStream) return readResponsesStream(response);

  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    if (response.ok) throw new Error(`AI API 返回非 JSON 内容（HTTP ${response.status}）。`);
  }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || responseText.trim();
    throw new Error(message
      ? `${String(message).slice(0, 500)}（HTTP ${response.status}）`
      : `AI API 请求失败（HTTP ${response.status}）。`);
  }

  const raw = settings.apiMode === "gemini"
    ? extractGeminiText(data)
    : settings.apiMode === "responses"
      ? extractResponsesText(data)
      : extractChatText(data);
  if (!raw) {
    const reason = data?.promptFeedback?.blockReason
      || data?.candidates?.[0]?.finishReason
      || data?.choices?.[0]?.finish_reason
      || data?.status
      || "空响应";
    throw new Error(`模型未返回可用文本（${reason}）。`);
  }
  const finish = data?.candidates?.[0]?.finishReason || data?.choices?.[0]?.finish_reason;
  if (data?.status === "incomplete" || finish === "length" || finish === "MAX_TOKENS") {
    throw new Error("模型输出被截断，请重试或提高输出上限。 ");
  }
  return raw;
}

function parseInlineImage(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw new Error("Gemini 参考图必须是 JPEG、PNG 或 WebP。 ");
  return { mimeType: match[1], data: match[2] };
}

function buildManualInputText(instruction, userText, imageCount) {
  const concept = `<user_concept>\n${String(userText || "").trim()}\n</user_concept>`;
  const images = imageCount
    ? `\n\n<reference_images>\n${imageCount} image(s) attached in the labeled order below.\n</reference_images>`
    : "";
  return `${instruction}\n\n${concept}${images}`;
}
