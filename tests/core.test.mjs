import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCombinedPrompt,
  buildPostApiUrls,
  buildResponsesRequest,
  buildTagPrompt,
  buildVisionInstruction,
  chooseImageUrl,
  extractChatText,
  extractResponsesText,
  formatTag,
  isBuiltInApiEndpoint,
  isXaiEndpoint,
  normalizeVisualPrompt,
  parsePostUrl,
  resolveApiEndpoint
} from "../core.js";
import { isXaiCompatibleImageType } from "../image-utils.js";

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
});

test("recognizes built-in API origins and xAI image requirements", () => {
  assert.equal(isBuiltInApiEndpoint("https://api.x.ai/v1/responses"), true);
  assert.equal(isBuiltInApiEndpoint("https://example.com/v1/responses"), false);
  assert.equal(isXaiEndpoint("https://api.x.ai/v1/responses"), true);
  assert.equal(isXaiEndpoint("https://api.openai.com/v1/responses"), false);
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
