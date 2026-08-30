import { isXaiVisionTarget } from "./core.js";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_CONVERSION_PIXELS = 24_000_000;
const XAI_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
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

export function validateReferenceImageFiles(files) {
  const images = Array.from(files || []);
  if (images.length > MAX_REFERENCE_IMAGES) throw new Error(`参考图最多上传 ${MAX_REFERENCE_IMAGES} 张。`);
  if (images.some((file) => !String(file?.type || "").startsWith("image/"))) {
    throw new Error("请选择有效的图片文件。 ");
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
  return Promise.all(images.map((file) =>
    requireXaiFormat && !isXaiCompatibleImageType(file.type)
      ? convertToJpegDataUrl(file, "参考图")
      : blobToDataUrl(file)
  ));
}

async function downloadImage(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`主图下载失败（HTTP ${response.status}）。`);
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("主图不是视觉模型支持的静态图像。 ");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("主图超过 20 MB，请改用 Sample 图像质量。 ");
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
    throw new Error(`Grok 仅支持 JPEG/PNG，${label}自动转换失败：${error?.message || String(error)}`);
  } finally {
    bitmap?.close?.();
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
