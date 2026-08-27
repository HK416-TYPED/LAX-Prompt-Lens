import { isXaiEndpoint } from "./core.js";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CONVERSION_PIXELS = 24_000_000;
const XAI_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export function isXaiCompatibleImageType(mimeType) {
  return XAI_IMAGE_TYPES.has(String(mimeType || "").toLowerCase());
}

export async function fetchImageAsDataUrl(primaryUrl, fallbackUrl, { endpoint = "" } = {}) {
  const candidates = [...new Set([primaryUrl, fallbackUrl].filter(Boolean))];
  const requireXaiFormat = isXaiEndpoint(endpoint);
  let convertibleBlob = null;
  let lastError = null;

  for (const url of candidates) {
    try {
      const blob = await downloadImage(url);
      if (!requireXaiFormat || isXaiCompatibleImageType(blob.type)) {
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

async function downloadImage(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`主图下载失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("主图不是视觉模型支持的静态图像。 ");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("主图超过 20 MB，请改用 Sample 图像质量。 ");
  return blob;
}

async function convertToJpegDataUrl(blob) {
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
      throw new Error("主图转换为 Grok 支持的 JPEG 后仍超过 20 MB，请选择 Sample 图像质量。 ");
    }
    return blobToDataUrl(converted);
  } catch (error) {
    throw new Error(`Grok 仅支持 JPEG/PNG，主图自动转换失败：${error?.message || String(error)}`);
  } finally {
    bitmap?.close?.();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("无法读取主图数据。 "));
    reader.readAsDataURL(blob);
  });
}
