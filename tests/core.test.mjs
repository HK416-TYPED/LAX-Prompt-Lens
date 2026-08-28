import test from "node:test";
import assert from "node:assert/strict";
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
  formatTag,
  isBuiltInApiEndpoint,
  isGrokModel,
  isXaiEndpoint,
  isXaiVisionTarget,
  normalizeVisualPrompt,
  parseManualPromptResult,
  parsePostUrl,
  readResponsesStream,
  resolveApiEndpoint
} from "../core.js";
import { isXaiCompatibleImageType, validateReferenceImageFiles } from "../image-utils.js";

const examplePost = {
  tag_string_artist: "scotch_quazar",
  tag_string_copyright: "girls'_frontline girls'_frontline_2:_exilium",
  tag_string_character: "commander_(girls'_frontline) ump45_(girls'_frontline) leva_(girls'_frontline_2)",
  tag_string_general: "1girl black_pantyhose feet_on_table fumo_(doll)",
  tag_string_meta: "absurdres highres",
  file_url: "https://cdn.example/original.jpg",
  large_file_url: "https://cdn.example/sample.jpg",
  preview_file_url: "https://cdn.example/preview.jpg"
};

test("parses a donmai post URL and keeps the query", () => {
  assert.deepEqual(
    parsePostUrl("https://shima.donmai.us/posts/11647422?q=test"),
    {
      id: 11647422,
      normalizedUrl: "https://shima.donmai.us/posts/11647422?q=test",
      origin: "https://shima.donmai.us"
    }
  );
});

test("rejects non-post and non-donmai URLs", () => {
  assert.throws(() => parsePostUrl("https://example.com/posts/1"));
  assert.throws(() => parsePostUrl("https://shima.donmai.us/wiki_pages/help"));
});

test("builds canonical and source-domain API fallbacks", () => {
  assert.deepEqual(
    buildPostApiUrls("https://shima.donmai.us/posts/6279378?q=arknights"),
    [
      "https://danbooru.donmai.us/posts/6279378.json",
      "https://shima.donmai.us/posts/6279378.json"
    ]
  );
  assert.deepEqual(
    buildPostApiUrls("https://danbooru.donmai.us/posts/6279378"),
    ["https://danbooru.donmai.us/posts/6279378.json"]
  );
});

test("formats Danbooru tags for prompt use", () => {
  assert.equal(formatTag("fumo_(doll)"), "fumo \\(doll\\)");
  assert.equal(formatTag("girls'_frontline_2:_exilium"), "girls' frontline 2: exilium");
});

test("builds category-ordered tags and excludes meta by default", () => {
  const output = buildTagPrompt(examplePost);
  assert.equal(
    output,
    "scotch quazar, girls' frontline, girls' frontline 2: exilium, commander \\(girls' frontline\\), ump45 \\(girls' frontline\\), leva \\(girls' frontline 2\\), 1girl, black pantyhose, feet on table, fumo \\(doll\\)"
  );
  assert.doesNotMatch(output, /absurdres/);
});

test("optionally includes meta tags", () => {
  assert.match(buildTagPrompt(examplePost, { includeMeta: true }), /absurdres, highres$/);
});

test("combines prompts in either order", () => {
  assert.equal(buildCombinedPrompt("tag one, tag two", "A cinematic frame."), "tag one, tag two,\n\nA cinematic frame.");
  assert.equal(buildCombinedPrompt("tag one", "A frame.", "visual-first"), "A frame.\n\ntag one");
});

test("chooses sample by default and original when requested", () => {
  assert.equal(chooseImageUrl(examplePost), examplePost.large_file_url);
  assert.equal(chooseImageUrl(examplePost, "original"), examplePost.file_url);
});

test("extracts text from Responses and Chat payloads", () => {
  assert.equal(extractResponsesText({ output: [{ content: [{ type: "output_text", text: "vision" }] }] }), "vision");
  assert.equal(extractChatText({ choices: [{ message: { content: "chat" } }] }), "chat");
});

test("resolves built-in and OpenAI-compatible base URLs", () => {
  assert.equal(
    resolveApiEndpoint("https://jarlessapi.com", "responses", "jarless"),
    "https://jarlessapi.com/v1/responses"
  );
  assert.equal(
    resolveApiEndpoint("https://api.openai.com/v1", "responses", "openai"),
    "https://api.openai.com/v1/responses"
  );
  assert.equal(
    resolveApiEndpoint("https://api.x.ai", "responses", "xai"),
    "https://api.x.ai/v1/responses"
  );
  assert.equal(
    resolveApiEndpoint("https://example.com/v1/responses", "responses", "custom"),
    "https://example.com/v1/responses"
  );
  assert.throws(
    () => resolveApiEndpoint("https://example.com/v1/chat/completions", "responses", "custom"),
    /接口模式选择了 Responses API/
  );
  assert.throws(
    () => resolveApiEndpoint("https://example.com/v1/responses", "chat", "custom"),
    /接口模式选择了 Chat Completions/
  );
});

test("reads output text from a Responses SSE stream", async () => {
  const response = new Response([
    'data: {"type":"response.created"}',
    '',
    'data: {"type":"response.output_text.delta","delta":"{\\"base\\"}"}',
    '',
    'data: {"type":"response.output_text.delta","delta":" done"}',
    '',
    'data: [DONE]',
    ''
  ].join("\n"), { headers: { "content-type": "text/event-stream" } });
  assert.equal(await readResponsesStream(response), '{"base"} done');
});

test("recognizes built-in API origins and xAI image requirements", () => {
  assert.equal(isBuiltInApiEndpoint("https://api.x.ai/v1/responses"), true);
  assert.equal(isBuiltInApiEndpoint("https://example.com/v1/responses"), false);
  assert.equal(isXaiEndpoint("https://api.x.ai/v1/responses"), true);
  assert.equal(isXaiEndpoint("https://api.openai.com/v1/responses"), false);
  assert.equal(isGrokModel("grok-4.6"), true);
  assert.equal(isGrokModel("x-ai/grok-4.6"), true);
  assert.equal(isGrokModel("gpt-5.6-luna"), false);
  assert.equal(isXaiVisionTarget("https://third-party.example/v1/responses", "grok-4.6"), true);
  assert.equal(isXaiCompatibleImageType("image/jpeg"), true);
  assert.equal(isXaiCompatibleImageType("image/png"), true);
  assert.equal(isXaiCompatibleImageType("image/webp"), false);
});

test("builds a Jarless-compatible stateless Responses vision request", () => {
  const request = buildResponsesRequest({
    model: "gpt-5.6-luna",
    instruction: "Analyze",
    imageDataUrl: "data:image/jpeg;base64,abc",
    reasoningEffort: "xhigh",
    disableStorage: true
  });
  assert.equal(request.model, "gpt-5.6-luna");
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "xhigh" });
  assert.equal(request.input[0].content[1].type, "input_image");
  assert.equal("max_output_tokens" in request, false);
});

test("builds an xAI-compatible image reasoning request", () => {
  const request = buildResponsesRequest({
    model: "grok-4.6",
    instruction: "Analyze",
    imageDataUrl: "data:image/png;base64,abc",
    reasoningEffort: "high",
    disableStorage: true
  });
  assert.equal(request.model, "grok-4.6");
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "high" });
  assert.equal(request.input[0].content[1].image_url, "data:image/png;base64,abc");
});

test("builds a stateless Responses request for a manual text concept", () => {
  const request = buildTextResponsesRequest({
    model: "gpt-5.6-luna",
    instruction: "Return JSON",
    userText: "银发少女站在雨夜街道",
    reasoningEffort: "high",
    disableStorage: true
  });
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, { effort: "high" });
  assert.equal(request.input[0].content.length, 1);
  assert.equal(request.input[0].content[0].type, "input_text");
  assert.match(request.input[0].content[0].text, /<user_concept>[\s\S]*银发少女/);
});

test("builds manual multimodal requests with ordered reference images", () => {
  const images = ["data:image/jpeg;base64,one", "data:image/png;base64,two"];
  const request = buildTextResponsesRequest({
    model: "gpt-5.6-luna",
    instruction: "Return JSON",
    userText: "保留人物，改成雨夜",
    imageDataUrls: images
  });
  assert.deepEqual(
    request.input[0].content.map(({ type }) => type),
    ["input_text", "input_text", "input_image", "input_text", "input_image"]
  );
  assert.match(request.input[0].content[1].text, /primary/);
  assert.match(request.input[0].content[3].text, /supplementary/);
  assert.equal(request.input[0].content[4].image_url, images[1]);

  const chat = buildManualChatContent({ userText: "", imageDataUrls: images });
  assert.deepEqual(chat.map(({ type }) => type), ["text", "text", "image_url", "text", "image_url"]);
  assert.equal(chat[2].image_url.url, images[0]);
});

test("validates local reference image limits", () => {
  const image = (name, size = 1024) => ({ name, size, type: "image/png", lastModified: 1 });
  assert.equal(validateReferenceImageFiles([image("one.png")]).length, 1);
  assert.throws(() => validateReferenceImageFiles(Array.from({ length: 5 }, (_, index) => image(`${index}.png`))), /最多上传 4 张/);
  assert.throws(() => validateReferenceImageFiles([{ name: "notes.txt", size: 10, type: "text/plain" }]), /有效的图片/);
  assert.throws(() => validateReferenceImageFiles([image("large.png", 21 * 1024 * 1024)]), /单张参考图/);
});

test("uses the LAX art-direction instruction with an English 300-550 word target", () => {
  const instruction = buildVisionInstruction();
  assert.match(instruction, /^Analyze the reference image as a professional Japanese illustration art director/);
  assert.match(instruction, /Composition and camera/);
  assert.match(instruction, /Drawing and rendering technique/);
  assert.match(instruction, /approximately 300–550 words/);
  assert.match(instruction, /Never begin with command verbs such as "Create"/);
  assert.match(instruction, /This applies to the entire output, not only its first sentence/);
  assert.match(instruction, /never write directives such as "Place the character/);
  assert.match(instruction, /first three characters must be "An "/);
});

test("defines NovelAI V5 section instructions for manual concepts", () => {
  const instruction = buildManualPromptInstruction();
  assert.match(instruction, /"base_prompt"/);
  assert.match(instruction, /"character_prompts"/);
  assert.match(instruction, /"undesired_content"/);
  assert.match(instruction, /Chinese or English/);
  assert.match(instruction, /first image as the primary reference/);
  assert.match(instruction, /explicit additions, changes, and exclusions override conflicting image details/);
  assert.match(instruction, /including synonyms or paraphrases/);
  assert.match(instruction, /Merge equivalent or near-equivalent tags/);
  assert.doesNotMatch(instruction, /at most four short sentences/);
  assert.doesNotMatch(instruction, /Do not invent objects/);
  assert.doesNotMatch(instruction, /only as source material/);
});

test("supports simple and detailed manual instruction modes", () => {
  const simple = buildManualPromptInstruction();
  assert.equal(simple, buildManualPromptInstruction("simple"));
  assert.equal(simple, buildManualPromptInstruction("unsupported"));
  assert.doesNotMatch(simple, /Detailed mode/);

  const detailed = buildManualPromptInstruction("detailed");
  for (const instruction of [simple, detailed]) {
    assert.match(instruction, /"base_prompt"/);
    assert.match(instruction, /"character_prompts"/);
    assert.match(instruction, /including synonyms or paraphrases/);
  }
  assert.match(detailed, /every distinct visual attribute that can be modified independently/);
  assert.match(detailed, /natural-language fields correspondingly more descriptive/);
  assert.match(detailed, /reasonable, non-conflicting visual details/);
  assert.match(detailed, /Do not change the identity, number of characters, actions, composition/);
  assert.match(detailed, /Merge only truly duplicate or interchangeable synonyms/);
  assert.match(detailed, /"short hair", "curled hair", and "green hair" must remain separate tags/);
});

test("parses and formats NovelAI V5 prompt sections", () => {
  const result = parseManualPromptResult(`\`\`\`json
{
  "base_prompt":{"tags":"black and white manga, vertical 2koma, vertical 2koma","natural_language":"The upper panel shows a woman flying from behind. The lower panel frames her face inside a smartphone screen."},
  "character_prompts":[
    {"name":"Upper panel","position":"upper center","tags":"Tatsumaki, short curly hair, black dress","natural_language":""},
    {"name":"Phone screen","position":"lower center, inside the phone screen","tags":"Tatsumaki, short curly hair, sharp eyes","natural_language":""}
  ],
  "undesired_content":"color, merged panels, color"
}
\`\`\``);
  assert.equal(result.basePrompt.tags, "black and white manga, vertical 2koma");
  assert.equal(result.characterPrompts.length, 2);
  assert.equal(result.characterPrompts[0].prompt, "Tatsumaki, short curly hair, black dress");
  assert.equal(result.undesiredContent, "color, merged panels");
  assert.match(formatManualPromptBundle(result), /^\[BASE PROMPT\]/);
  assert.match(formatManualPromptBundle(result), /\[CHARACTER 2: Phone screen\]/);
  assert.match(formatManualPromptBundle(result), /\[UNDESIRED CONTENT\]/);
  assert.throws(() => parseManualPromptResult("not json"), /格式无效/);
  assert.throws(() => parseManualPromptResult('{"base_prompt":{"tags":"1girl"}}'), /内容不完整/);
});

test("removes exact tag concepts already present in natural language", () => {
  const result = parseManualPromptResult(JSON.stringify({
    base_prompt: {
      tags: "short hair, black dress, vertical 2koma",
      natural_language: "She has short hair. The upper and lower panels show different viewpoints."
    },
    character_prompts: [],
    undesired_content: ""
  }));
  assert.equal(result.basePrompt.tags, "black dress, vertical 2koma");
  assert.doesNotMatch(result.basePrompt.prompt.split("\n")[0], /short hair/);
});

test("normalizes imperative model output into a descriptive A/An prompt", () => {
  assert.equal(
    normalizeVisualPrompt("Create a finished vertical Japanese illustration of a horned fantasy woman."),
    "A finished vertical Japanese illustration of a horned fantasy woman."
  );
  assert.equal(
    normalizeVisualPrompt("Generate an experimental high-energy Japanese anime illustration of a mysterious young woman."),
    "An experimental high-energy Japanese anime illustration of a mysterious young woman."
  );
  assert.equal(
    normalizeVisualPrompt("An editorial Japanese illustration of a lone traveler."),
    "An editorial Japanese illustration of a lone traveler."
  );
});
