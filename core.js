const POST_PATH = /^\/posts\/(\d+)(?:\/)?$/;
const CATEGORY_FIELDS = [
  "tag_string_artist",
  "tag_string_copyright",
  "tag_string_character",
  "tag_string_general"
];
export const VISUAL_PARAGRAPH_OPTIONS = Object.freeze([
  { key: "subject", code: "P1", label: "主体与视觉身份" },
  { key: "composition", code: "P2", label: "构图、镜头与空间层次" },
  { key: "environment", code: "P3", label: "环境、背景与氛围" },
  { key: "rendering", code: "P4", label: "绘制、色彩、光照与艺术气质" }
]);
export const DEFAULT_VISUAL_PARAGRAPH_KEYS = Object.freeze(
  VISUAL_PARAGRAPH_OPTIONS.map(({ key }) => key)
);
const BUILT_IN_API_ORIGINS = new Set([
  "https://api.openai.com",
  "https://api.x.ai",
  "https://jarlessapi.com",
  "https://generativelanguage.googleapis.com",
  "https://open.bigmodel.cn",
  "https://api.moonshot.cn",
  "https://api.moonshot.ai"
]);

export function parsePostUrl(rawValue) {
  const value = String(rawValue || "").trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("URL 格式无效，请粘贴完整的 https:// 链接。 ");
  }

  if (url.protocol !== "https:" || !/(^|\.)donmai\.us$/i.test(url.hostname)) {
    throw new Error("目前仅支持 donmai.us 站点的 HTTPS 链接。 ");
  }

  const match = url.pathname.match(POST_PATH);
  if (!match) throw new Error("链接不是 Danbooru 帖子详情页，路径应类似 /posts/11647422。 ");

  return {
    id: Number(match[1]),
    normalizedUrl: `${url.origin}/posts/${match[1]}${url.search}`,
    origin: url.origin
  };
}

export function buildPostApiUrls(rawPostUrl) {
  const parsed = parsePostUrl(rawPostUrl);
  const path = `/posts/${parsed.id}.json`;
  const candidates = [
    `https://danbooru.donmai.us${path}`,
    `${parsed.origin}${path}`
  ];
  return [...new Set(candidates)];
}

export function formatTag(rawTag) {
  return String(rawTag || "")
    .replaceAll("_", " ")
    .replace(/(?<!\\)\(/g, "\\(")
    .replace(/(?<!\\)\)/g, "\\)")
    .trim();
}

export function splitTagString(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function buildTagPrompt(post, { includeMeta = false } = {}) {
  const fields = includeMeta ? [...CATEGORY_FIELDS, "tag_string_meta"] : CATEGORY_FIELDS;
  let rawTags = fields.flatMap((field) => splitTagString(post?.[field]));

  if (rawTags.length === 0) rawTags = splitTagString(post?.tag_string);

  const seen = new Set();
  return rawTags
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    })
    .map(formatTag)
    .join(", ");
}

export function normalizeVisualParagraphKeys(value) {
  if (!Array.isArray(value)) return [...DEFAULT_VISUAL_PARAGRAPH_KEYS];
  const allowed = new Set(DEFAULT_VISUAL_PARAGRAPH_KEYS);
  return [...new Set(value.filter((key) => allowed.has(key)))];
}

export function splitVisualPromptParagraphs(visualPrompt) {
  const value = normalizeVisualPrompt(visualPrompt)
    .replace(/&#x20;|&nbsp;/gi, " ")
    .trim();
  if (!value) {
    return VISUAL_PARAGRAPH_OPTIONS.map((option) => ({ ...option, text: "" }));
  }

  const rawParagraphs = value
    .split(/\r?\n\s*\r?\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const paragraphs = rawParagraphs.length > VISUAL_PARAGRAPH_OPTIONS.length
    ? [...rawParagraphs.slice(0, 3), rawParagraphs.slice(3).join(" ")]
    : rawParagraphs;

  return VISUAL_PARAGRAPH_OPTIONS.map((option, index) => ({
    ...option,
    text: paragraphs[index] || ""
  }));
}

export function selectVisualPromptParagraphs(visualPrompt, selectedKeys) {
  const selected = new Set(normalizeVisualParagraphKeys(selectedKeys));
  return splitVisualPromptParagraphs(visualPrompt)
    .filter(({ key, text }) => selected.has(key) && text)
    .map(({ text }) => text)
    .join("\n\n");
}

export function buildCombinedPrompt(tagPrompt, visualPrompt, order = "tags-first", selectedParagraphKeys = null) {
  const tags = String(tagPrompt || "").trim().replace(/[,.\s]+$/, "");
  const visual = selectedParagraphKeys === null
    ? String(visualPrompt || "").trim()
    : selectVisualPromptParagraphs(visualPrompt, selectedParagraphKeys);
  if (!tags) return visual;
  if (!visual) return tags;
  return order === "visual-first" ? `${visual}\n\n${tags}` : `${tags},\n\n${visual}`;
}

export function chooseImageUrl(post, quality = "large") {
  if (!post) return "";
  if (quality === "original") {
    return post.file_url || post.large_file_url || post.preview_file_url || "";
  }
  return post.large_file_url || post.file_url || post.preview_file_url || "";
}

export function isBuiltInApiEndpoint(rawValue) {
  try {
    return BUILT_IN_API_ORIGINS.has(new URL(String(rawValue || "").trim()).origin);
  } catch {
    return false;
  }
}

export function isXaiEndpoint(rawValue) {
  try {
    return new URL(String(rawValue || "").trim()).origin === "https://api.x.ai";
  } catch {
    return false;
  }
}

export function isGrokModel(model) {
  return /(?:^|[\/:._-])grok(?:$|[._-])/i.test(String(model || "").trim());
}

export function shouldUseResponsesStream(mode, model) {
  return mode === "responses" && isGrokModel(model);
}

export function isXaiVisionTarget(rawValue, model = "") {
  return isXaiEndpoint(rawValue) || isGrokModel(model);
}

export function resolveApiEndpoint(rawValue, mode = "responses", provider = "custom", model = "") {
  let url;
  try {
    url = new URL(String(rawValue || "").trim());
  } catch {
    throw new Error("视觉 API 地址格式无效。 ");
  }

  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("视觉 API 地址必须使用 HTTP(S)。 ");
  }
  if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("远程视觉 API 必须使用 HTTPS。 ");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("视觉 API 地址不能包含凭据、查询参数或片段。 ");
  }

  if (mode === "gemini" || provider === "gemini") {
    if (url.protocol !== "https:") throw new Error("Gemini API 必须使用 HTTPS。 ");
    const modelName = String(model || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(modelName)) throw new Error("Gemini 模型名称无效。 ");
    url.pathname = `/v1beta/models/${modelName}:generateContent`;
    return url.href;
  }

  const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
  const isCompleteResponses = /\/responses$/i.test(cleanPath);
  const isCompleteChat = /\/chat\/completions$/i.test(cleanPath);
  if (isCompleteResponses && mode === "chat") {
    throw new Error("完整接口地址是 Responses API（/responses），但接口模式选择了 Chat Completions。 ");
  }
  if (isCompleteChat && mode === "responses") {
    throw new Error("完整接口地址是 Chat Completions（/chat/completions），但接口模式选择了 Responses API。 ");
  }
  if (isCompleteResponses || isCompleteChat) {
    url.pathname = cleanPath;
    return url.href;
  }

  const suffix = mode === "chat" ? "chat/completions" : "responses";
  if (cleanPath === "/") {
    // Raw HTTP calls use the OpenAI-compatible v1 endpoints advertised by
    // JarlessAPI's model marketplace. Codex provider configs may use a root
    // base URL because Codex adds its own wire path, but the extension does not.
    url.pathname = `/v1/${suffix}`;
  } else if (cleanPath === "/v1") {
    url.pathname = `/v1/${suffix}`;
  } else {
    url.pathname = `${cleanPath}/${suffix}`;
  }
  return url.href;
}

export function buildResponsesRequest({
  model,
  instruction,
  imageDataUrl,
  reasoningEffort = "xhigh",
  disableStorage = true
}) {
  return {
    model,
    store: !disableStorage,
    reasoning: { effort: reasoningEffort },
    input: [{
      role: "user",
      content: [
        { type: "input_text", text: instruction },
        { type: "input_image", image_url: imageDataUrl, detail: "high" }
      ]
    }]
  };
}

export function buildTextResponsesRequest({
  model,
  instruction,
  userText,
  imageDataUrls = [],
  reasoningEffort = "xhigh",
  disableStorage = true
}) {
  const images = imageDataUrls.filter(Boolean);
  const content = [{
    type: "input_text",
    text: `${instruction}\n\n${buildManualInputContext(userText, images.length)}`
  }];
  images.forEach((imageDataUrl, index) => {
    content.push(
      { type: "input_text", text: `Reference image ${index + 1} (${index === 0 ? "primary" : "supplementary"})` },
      { type: "input_image", image_url: imageDataUrl, detail: "high" }
    );
  });
  return {
    model,
    store: !disableStorage,
    reasoning: { effort: reasoningEffort },
    input: [{
      role: "user",
      content
    }]
  };
}

export function buildManualChatContent({ userText, imageDataUrls = [] }) {
  const images = imageDataUrls.filter(Boolean);
  if (!images.length) return String(userText || "").trim();
  const content = [{ type: "text", text: buildManualInputContext(userText, images.length) }];
  images.forEach((imageDataUrl, index) => {
    content.push(
      { type: "text", text: `Reference image ${index + 1} (${index === 0 ? "primary" : "supplementary"})` },
      { type: "image_url", image_url: { url: imageDataUrl, detail: "high" } }
    );
  });
  return content;
}

function buildManualInputContext(userText, imageCount) {
  const concept = `<user_concept>\n${String(userText || "").trim()}\n</user_concept>`;
  return imageCount
    ? `${concept}\n\n<reference_images>\n${imageCount} image(s) attached in the labeled order below.\n</reference_images>`
    : concept;
}

export function buildVisionInstruction() {
  return `Analyze the reference image as a professional Japanese illustration art director rather than merely describing visible objects.

Write one polished natural-language image-generation prompt in English.

The finished prompt must be descriptive rather than imperative. Begin directly with "A ..." or "An ..." followed by the illustration's visual identity, for example "An experimental high-energy Japanese anime illustration of ...". Adapt the wording to the actual reference image. Never begin with command verbs such as "Create", "Generate", "Draw", "Make", "Render", "Illustrate", "Depict", "Produce", "Compose", or "Show". Do not address the reader and do not phrase any sentence as an instruction. This applies to the entire output, not only its first sentence: never write directives such as "Place the character...", "Use a low angle...", "Keep the face readable...", "Add rim light...", or "Let the background dissolve...". Instead, state those qualities as already-present visual facts, such as "The character occupies...", "A low camera angle creates...", or "The background dissolves...".

The goal is to reconstruct not only the subject matter, but especially the illustration's composition, visual hierarchy, drawing method, edge control, color design, lighting logic, material treatment, and editorial aesthetics.

Organize the description internally in this priority order:

1. **Primary subject and visual identity**

   * Identify the main character, expression, hairstyle, clothing, important accessories, and overall emotional impression.
   * Describe only visually important character details. Do not enumerate every minor feature.

2. **Composition and camera**

   * Establish the dominant framing first.
   * Describe camera height, angle, crop, perspective, foreshortening, character placement, major diagonals, visual anchors, and foreground/midground/background hierarchy.
   * Prefer a small number of strong compositional relationships over many simultaneous pose constraints.
   * Describe the visual flow of the image rather than mechanically listing every limb position.

3. **Environmental staging and depth**

   * Explain how foreground objects, atmospheric elements, background shapes, props, splashes, ribbons, architecture, or graphic elements create depth.
   * Clearly separate foreground effects from the character instead of allowing effects to obscure important anatomy or the face.
   * Identify which background elements are detailed and which are intentionally simplified.

4. **Drawing and rendering technique**

   * Describe line quality, line color, line-weight variation, hard and soft edges, selective detail, cel-shading versus painterly blending, brush texture, dry-brush effects, translucent layers, grain, print texture, unfinished edges, or other distinctive rendering behavior.
   * Explicitly state which areas are sharply rendered and which areas are allowed to dissolve or remain loose.
   * Avoid generic phrases such as "beautiful anime style" unless followed by specific technical description.

5. **Color and lighting**

   * Identify the dominant palette, shadow hue, highlight hue, accent colors, saturation hierarchy, and warm/cool relationships.
   * State the main light direction and how environmental light influences skin, hair, clothing, and surrounding objects.
   * Describe overexposure, rim light, reflected light, atmospheric haze, transparent materials, or glossy highlights only where they materially affect the image.

6. **Overall artistic character**

   * End with concise art-direction terms such as sophisticated Japanese editorial illustration, polished anime game key visual, experimental commercial illustration, cinematic concept art, modernist poster aesthetics, etc.
   * Describe the emotional atmosphere and visual rhythm.

Important rules:

* Do not overload the prompt with excessive anatomical instructions.
* Do not describe every visible object equally.
* Prioritize the face, silhouette, composition, and major visual rhythm.
* Avoid conflicting camera directions.
* Avoid excessive use of generic adjectives such as dynamic, beautiful, detailed, stunning, cinematic.
* Replace generic adjectives with concrete visual instructions.
* Preserve readable anatomy and a clear silhouette.
* If water, smoke, ribbons, particles, hair, or other effects overlap the character, describe their depth layers explicitly.
* Keep the face and hands readable unless the reference intentionally obscures them.
* Use selective detail: high detail around the face and focal objects, looser treatment in secondary regions.
* Describe the artwork as a coherent finished illustration, not as a checklist of detected image features.

The final prompt should normally be approximately 300–550 words and should read like professional art direction given to an illustrator.

Return only the finished descriptive prompt. The first two characters must be "A " or the first three characters must be "An ". No title, preface, command, explanation, bullets, or Markdown.`;
}

export function buildManualPromptInstruction(mode = "simple") {
  const detailInstruction = mode === "detailed"
    ? `Detailed mode:
Preserve and split every distinct visual attribute that can be modified independently. Use fine-grained tags for identity, body and facial features, hairstyle, hair properties, each clothing component, cut, color, material, pattern, footwear, and accessories. Make the natural-language fields correspondingly more descriptive about panel composition, pose, action, camera, spatial relationships, rendering, lighting, and material interactions while keeping them editable and avoiding repetition of tags. You may add reasonable, non-conflicting visual details that are not stated by the user when they improve a complete prompt. Do not change the identity, number of characters, actions, composition, panel structure, spatial positions, viewpoint, or core style. Merge only truly duplicate or interchangeable synonyms. Keep related but different attributes separate; for example, "short hair", "curled hair", and "green hair" must remain separate tags. Preserve the same tag/natural-language mutual exclusion rule.`
    : "";
  const mergeInstruction = mode === "detailed"
    ? "Merge only truly duplicate or interchangeable synonyms"
    : "Merge equivalent or near-equivalent tags into one canonical phrase";

  return `Convert the user's image concept and any attached reference images into a NovelAI Diffusion V5 prompt set. The text input may be Chinese or English; output English only.

When reference images are attached, treat the first image as the primary reference and later images as supplementary references. If the user concept is empty, reconstruct the primary reference as faithfully as possible, including its visible subjects, composition, camera, spatial arrangement, clothing, accessories, style, color, lighting, and rendering. If text is also provided, its explicit additions, changes, and exclusions override conflicting image details; preserve compatible reference details that the text leaves unspecified. Use supplementary references only for compatible details and do not merge distinct subjects or scenes unless the text requests it.

Return exactly this JSON shape:
{
  "base_prompt": {"tags": "...", "natural_language": "..."},
  "character_prompts": [
    {"name": "...", "position": "...", "tags": "...", "natural_language": "..."}
  ],
  "undesired_content": "..."
}

The base prompt owns the panel layout, scene, global style, camera, spatial relationships, and actions. Character prompts own only identity, physical traits, clothing, accessories, and expression. Create one character prompt for each distinct spatial appearance, even when the same character appears more than once. Position must be a short canvas location such as "upper center" or "lower center, inside the phone screen".

Each concept must appear in exactly one place. If a concept appears in any tags field, it must not appear in natural language, including synonyms or paraphrases; the reverse also applies. Prefer tags for atomic attributes and natural language for layout, relationships, and complex actions. ${mergeInstruction}. Do not repeat a concept between base and character prompts, except that a character's identity may repeat across distinct character prompts required for separate positions.

${detailInstruction ? `${detailInstruction}\n\n` : ""}Undesired content must be concise and limited to contradictions that directly protect the requested composition. Return JSON only.`;
}

export function parseManualPromptResult(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI 已响应，但没有返回可用文本。 ");

  const unfenced = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = unfenced.indexOf("{");
  const lastBrace = unfenced.lastIndexOf("}");
  const candidates = [unfenced];
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(unfenced.slice(firstBrace, lastBrace + 1));
  }

  let parsed = null;
  for (const candidate of candidates) {
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch {}
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("AI 返回格式无效，请重试生成。 ");
  }

  const base = parsed.base_prompt ?? parsed.basePrompt;
  const characters = parsed.character_prompts ?? parsed.characterPrompts;
  if (!base || !Array.isArray(characters)) throw new Error("AI 返回内容不完整，请重试生成。 ");

  let basePrompt = normalizePromptSection(base);
  let characterPrompts = characters.map((item, index) => ({
    name: String(item?.name || `Character ${index + 1}`).trim(),
    position: String(item?.position || "AI's choice").trim(),
    ...normalizePromptSection(item)
  })).filter((item) => item.prompt);
  const naturalLanguage = [basePrompt, ...characterPrompts]
    .map((item) => item.naturalLanguage)
    .filter(Boolean)
    .join(" ");
  basePrompt = removeTagOverlaps(basePrompt, naturalLanguage);
  characterPrompts = characterPrompts.map((item) => ({
    ...item,
    ...removeTagOverlaps(item, naturalLanguage)
  }));
  const undesiredContent = normalizeGeneratedTags(
    parsed.undesired_content ?? parsed.undesiredContent
  );
  if (!basePrompt.prompt) throw new Error("AI 返回内容不完整，请重试生成。 ");
  return { basePrompt, characterPrompts, undesiredContent };
}

function normalizeGeneratedTags(value) {
  const text = Array.isArray(value) ? value.join(", ") : String(value || "");
  const seen = new Set();
  return text
    .replace(/^tags?(?:\s+prompt)?\s*[:：]\s*/i, "")
    .split(/[,，\n]+/)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase().replace(/\s+/g, " ");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(", ")
    .replace(/[,，.\s]+$/, "");
}

function normalizePromptSection(value) {
  const tags = normalizeGeneratedTags(value?.tags);
  const naturalLanguage = String(value?.natural_language ?? value?.naturalLanguage ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    tags,
    naturalLanguage,
    prompt: [tags, naturalLanguage].filter(Boolean).join(tags && naturalLanguage ? ",\n" : "")
  };
}

function removeTagOverlaps(section, naturalLanguage) {
  const prose = normalizeConcept(naturalLanguage);
  const tags = section.tags
    .split(", ")
    .filter((tag) => !prose.includes(` ${normalizeConcept(tag).trim()} `))
    .join(", ");
  return {
    tags,
    naturalLanguage: section.naturalLanguage,
    prompt: [tags, section.naturalLanguage].filter(Boolean).join(tags && section.naturalLanguage ? ",\n" : "")
  };
}

function normalizeConcept(value) {
  return ` ${String(value || "").toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ")} `;
}

export function formatManualPromptBundle({ basePrompt, characterPrompts, undesiredContent }) {
  const sections = [`[BASE PROMPT]\n${basePrompt.prompt}`];
  for (const [index, item] of characterPrompts.entries()) {
    sections.push(`[CHARACTER ${index + 1}: ${item.name}]\nPosition: ${item.position}\n${item.prompt}`);
  }
  if (undesiredContent) sections.push(`[UNDESIRED CONTENT]\n${undesiredContent}`);
  return sections.join("\n\n");
}

export function normalizeVisualPrompt(text) {
  let value = String(text || "").trim();
  if (!value) return "";

  value = value
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^(?:final\s+)?(?:image-generation\s+|visual\s+|art-direction\s+)?prompt\s*:\s*/i, "")
    .trim();

  const imperative = value.match(
    /^(?:please\s+)?(?:create|generate|draw|make|render|illustrate|depict|produce|compose|show)\s+(?:(a|an|the)\s+)?([\s\S]+)$/i
  );
  if (!imperative) return value;

  const suppliedArticle = imperative[1]?.toLowerCase();
  const description = imperative[2].trim();
  if (!description) return value;

  const article = suppliedArticle === "an" ? "An" : "A";
  return `${article} ${description}`;
}

export function extractResponsesText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

export async function readResponsesStream(response) {
  const reader = response?.body?.getReader?.();
  if (!reader) throw new Error("API 返回了流式响应，但浏览器无法读取响应流。 ");

  const decoder = new TextDecoder();
  const outputParts = [];
  let completedText = "";
  let buffer = "";

  function consumeEvent(block) {
    const payload = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim();
    if (!payload || payload === "[DONE]") return;

    let event;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    if (event?.type === "response.output_text.delta" && typeof event.delta === "string") {
      outputParts.push(event.delta);
    }
    if (event?.type === "response.completed") {
      completedText = extractResponsesText(event.response);
    }
    if (event?.type === "response.error" || event?.type === "response.failed") {
      const message = event?.error?.message
        || event?.response?.error?.message
        || "AI API 流式响应失败。 ";
      throw new Error(message);
    }
  }

  function consumeBufferedEvents(flush = false) {
    while (true) {
      const separator = /\r?\n\r?\n/.exec(buffer);
      if (!separator) break;
      const block = buffer.slice(0, separator.index);
      buffer = buffer.slice(separator.index + separator[0].length);
      consumeEvent(block);
    }
    if (flush && buffer.trim()) {
      consumeEvent(buffer);
      buffer = "";
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      consumeBufferedEvents();
    }
    buffer += decoder.decode();
    consumeBufferedEvents(true);
  } finally {
    reader.releaseLock();
  }

  return outputParts.join("").trim() || completedText.trim();
}

export function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
      .trim();
  }
  return "";
}
