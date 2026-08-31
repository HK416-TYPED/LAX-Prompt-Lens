import { isXaiVisionTarget } from "./core.js";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CONVERSION_PIXELS = 24_000_000;
const XAI_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_REFERENCE_IMAGES = 4;

export function isXaiCompatibleImageType(mimeType) {
  return XAI_IMAGE_TYPES.has(String(mimeType || "").toLowerCase());
}

export async function fetchImageAsDataUrl(primaryUrl, fallbackUrl, { endpoint = "", model = "" } = {}) {
  const candidates = [...new Set([primaryUrl, fallbackUrl].filter(Boolean))];
  const requireXaiFormat = isXaiVisionTarget(endpoint, model);
  let convertibleBlob = null;
  let lastError = null;

  for (const url of candidates) {
    try {
      const blob = await downloadImage(url);
      const requireGeminiFormat = isGeminiEndpoint(endpoint) && blob.type === "image/gif";
      if ((!requireXaiFormat || isXaiCompatibleImageType(blob.type)) && !requireGeminiFormat) {
        return blobToDataUrl(blob);
      }
      convertibleBlob ||= blob;
    } catch (error) {
      lastError = error;
    }
  }

  if (convertibleBlob) return convertToJpegDataUrl(convertibleBlob);
  throw lastError || new Error("没有可读取的主图。 ");
}

export function validateReferenceImageFiles(files) {
  const images = Array.from(files || []);
  if (images.length > MAX_REFERENCE_IMAGES) throw new Error(`参考图最多上传 ${MAX_REFERENCE_IMAGES} 张。`);
  if (images.some((file) => !SUPPORTED_IMAGE_TYPES.has(String(file?.type || "").toLowerCase()))) {
    throw new Error("仅支持 JPEG、PNG、WebP 或 GIF 图片。 ");
  }
  if (images.some((file) => !Number.isFinite(file?.size) || file.size <= 0)) {
    throw new Error("参考图为空或无法读取。 ");
  }
  if (images.some((file) => file.size > MAX_IMAGE_BYTES)) {
    throw new Error("单张参考图不能超过 20 MB。 ");
  }
  if (images.reduce((total, file) => total + file.size, 0) > MAX_IMAGE_BYTES) {
    throw new Error("参考图总大小不能超过 20 MB。 ");
  }
  return images;
}

export async function readReferenceImagesAsDataUrls(files, { endpoint = "", model = "" } = {}) {
  const images = validateReferenceImageFiles(files);
  const requireXaiFormat = isXaiVisionTarget(endpoint, model);
  await Promise.all(images.map(validateImageSignature));
  return Promise.all(images.map((file) => {
    const requireGeminiFormat = isGeminiEndpoint(endpoint) && file.type === "image/gif";
    return (requireXaiFormat && !isXaiCompatibleImageType(file.type)) || requireGeminiFormat
      ? convertToJpegDataUrl(file, "参考图")
      : blobToDataUrl(file);
  }));
}

async function downloadImage(url) {
  const response = await fetch(url, {
    credentials: "omit",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`主图下载失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (!SUPPORTED_IMAGE_TYPES.has(blob.type.toLowerCase())) throw new Error("主图不是支持的 JPEG、PNG、WebP 或 GIF。 ");
  if (!blob.size) throw new Error("主图为空。 ");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("主图超过 20 MB，请改用 Sample 图像质量。 ");
  await validateImageSignature(blob);
  return blob;
}

export async function validateImageSignature(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const type = String(blob.type || "").toLowerCase();
  const valid = type === "image/jpeg"
    ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : type === "image/png"
      ? bytes[0] === 0x89 && ascii.slice(1, 4) === "PNG"
      : type === "image/webp"
        ? ascii.slice(0, 4) === "RIFF" && ascii.slice(8, 12) === "WEBP"
        : type === "image/gif"
          ? ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")
          : false;
  if (!valid) throw new Error("图片内容与声明格式不一致，已拒绝读取。 ");
  return blob;
}

async function convertToJpegDataUrl(blob, label = "主图") {
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, Math.sqrt(MAX_CONVERSION_PIXELS / (bitmap.width * bitmap.height)));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Chrome 无法创建图像转换画布。 ");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const converted = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.94 });
    if (converted.size > MAX_IMAGE_BYTES) {
      throw new Error(label === "主图"
        ? "主图转换为 Grok 支持的 JPEG 后仍超过 20 MB，请选择 Sample 图像质量。 "
        : "参考图转换为 Grok 支持的 JPEG 后仍超过 20 MB。 ");
    }
    return blobToDataUrl(converted);
  } catch (error) {
    throw new Error(`${label}自动转换为 JPEG 失败：${error?.message || String(error)}`);
  } finally {
    bitmap?.close?.();
  }
}

function isGeminiEndpoint(endpoint) {
  try {
    return new URL(endpoint).origin === "https://generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取图片数据。 "));
    reader.readAsDataURL(blob);
  });
}
