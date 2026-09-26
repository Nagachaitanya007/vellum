const MAX_DATA_URL = 380_000;
const MAX_EDGE = 1600;

/** Shrink a pasted image to a JPEG data URL that can live inside a note. */
export async function compressImageFile(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    let edge = MAX_EDGE;
    let quality = 0.72;
    let url = "";
    for (let attempt = 0; attempt < 6; attempt++) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      url = canvas.toDataURL("image/jpeg", quality);
      if (url.length <= MAX_DATA_URL) return url;
      quality = Math.max(0.4, quality - 0.1);
      edge = Math.round(edge * 0.75);
    }
    if (url.length > MAX_DATA_URL) throw new Error("too-large");
    return url;
  } finally {
    bitmap.close?.();
  }
}
