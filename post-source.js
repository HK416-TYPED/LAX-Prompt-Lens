import { buildPostApiUrls, parsePostUrl } from "./core.js";

export async function requestPost(url, { onStatus = () => {}, onDiagnostic = () => {} } = {}) {
  const parsed = parsePostUrl(url);
  const failures = [];

  for (const apiUrl of buildPostApiUrls(url)) {
    onStatus(`正在通过 ${new URL(apiUrl).hostname} 读取帖子 #${parsed.id}…`);
    try {
      let response = await fetchDanbooruPost(apiUrl);
      if ([502, 503, 504].includes(response.status)) {
        await wait(700);
        response = await fetchDanbooruPost(apiUrl);
      }
      onDiagnostic("post-response", { apiUrl, status: response.status });
      if (!response.ok) {
        failures.push(`${new URL(apiUrl).hostname}: HTTP ${response.status}`);
        continue;
      }
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        failures.push(`${new URL(apiUrl).hostname}: 返回的不是 JSON`);
        continue;
      }
      const post = await response.json();
      if (!post || Array.isArray(post) || typeof post !== "object" || Number(post.id) !== parsed.id) {
        failures.push(`${new URL(apiUrl).hostname}: 帖子 JSON 格式或编号不匹配`);
        continue;
      }
      return normalizePost(post);
    } catch (error) {
      failures.push(`${new URL(apiUrl).hostname}: ${cleanError(error)}`);
    }
  }

  onStatus(`直接读取失败，正在通过临时同源页面读取帖子 #${parsed.id}…`);
  try {
    return normalizePost(await fetchPostThroughTemporaryTab(parsed.normalizedUrl, parsed.id));
  } catch (error) {
    failures.push(`临时同源页面: ${cleanError(error)}`);
    throw new Error(`无法读取 Danbooru 帖子：${failures.join("；")}`);
  }
}

export function normalizePost(post) {
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
  const tab = await chrome.tabs.create({ url: postUrl, active: false });
  if (!tab?.id) throw new Error("Chrome 未返回临时标签页 ID。 ");
  try {
    await waitForTabLoad(tab.id, 25000);
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: async (id) => {
        try {
          const response = await fetch(`/posts/${id}.json`, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(15000)
          });
          if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) return { ok: false, error: `Unexpected content-type: ${contentType}` };
          return { ok: true, post: await response.json() };
        } catch (error) {
          return { ok: false, error: `${error?.name || "Error"}: ${error?.message || String(error)}` };
        }
      },
      args: [postId]
    });
    const result = results?.[0]?.result;
    if (!result?.ok || !result.post || Number(result.post.id) !== postId) {
      throw new Error(result?.error || "临时页面没有返回正确的帖子 JSON。 ");
    }
    return result.post;
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

function fetchDanbooruPost(apiUrl) {
  return fetch(apiUrl, {
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cleanError(error) {
  return error?.message || String(error || "未知错误");
}
