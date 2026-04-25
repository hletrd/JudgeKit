import sharp from "sharp";

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

/** Maximum input buffer size (10 MB). Prevents "image bomb" attacks where a
 *  small compressed file decompresses to enormous pixel dimensions, consuming
 *  all available memory before sharp can apply the resize. */
const MAX_INPUT_BUFFER_BYTES = 10 * 1024 * 1024;

/** Maximum decoded pixel count (100 megapixels). Bounds memory usage even if
 *  the input buffer is within the size limit but contains a highly compressible
 *  format (e.g., a 1-bit PNG that expands to 10,000 x 10,000 pixels = 100 MP). */
const MAX_INPUT_PIXELS = 100_000_000;

export function isImageMimeType(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.has(mimeType);
}

export type ProcessedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: "image/webp";
};

export async function processImage(
  inputBuffer: Buffer,
  maxDimension: number,
): Promise<ProcessedImage> {
  if (inputBuffer.length > MAX_INPUT_BUFFER_BYTES) {
    throw new Error(`Image exceeds maximum upload size (${MAX_INPUT_BUFFER_BYTES / (1024 * 1024)} MB)`);
  }

  const result = await sharp(inputBuffer, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(maxDimension, maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: result.data,
    width: result.info.width,
    height: result.info.height,
    mimeType: "image/webp",
  };
}
