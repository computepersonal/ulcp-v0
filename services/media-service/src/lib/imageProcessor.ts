import sharp from "sharp";

export interface ProcessedImages {
  thumb: Buffer;  // 150×150 cover, webp, quality 80
  medium: Buffer; // 600×600 inside, webp, quality 85
  full: Buffer;   // 1200×1200 inside, webp, quality 90
}

export async function processImage(inputBuffer: Buffer): Promise<ProcessedImages> {
  const [thumb, medium, full] = await Promise.all([
    sharp(inputBuffer)
      .resize(150, 150, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer(),
    sharp(inputBuffer)
      .resize(600, 600, { fit: "inside" })
      .webp({ quality: 85 })
      .toBuffer(),
    sharp(inputBuffer)
      .resize(1200, 1200, { fit: "inside" })
      .webp({ quality: 90 })
      .toBuffer(),
  ]);

  return { thumb, medium, full };
}

export function validateImageType(mimetype: string): boolean {
  const allowed = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ]);
  return allowed.has(mimetype);
}
