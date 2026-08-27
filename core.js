const POST_PATH = /^\/posts\/(\d+)(?:\/)?$/;
const CATEGORY_FIELDS = [
  "tag_string_artist",
  "tag_string_copyright",
  "tag_string_character",
  "tag_string_general"
];
const BUILT_IN_API_ORIGINS = new Set([
  "https://api.openai.com",
  "https://api.x.ai",
  "https://jarlessapi.com"
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

export function buildCombinedPrompt(tagPrompt, visualPrompt, order = "tags-first") {
  const tags = String(tagPrompt || "").trim().replace(/[,.\s]+$/, "");
  const visual = String(visualPrompt || "").trim();
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

export function resolveApiEndpoint(rawValue, mode = "responses", provider = "custom") {
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

  const cleanPath = url.pathname.replace(/\/+$/, "") || "/";
  const isCompleteResponses = /\/responses$/i.test(cleanPath);
  const isCompleteChat = /\/chat\/completions$/i.test(cleanPath);
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
