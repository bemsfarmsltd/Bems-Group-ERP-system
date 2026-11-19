export interface OptimizedImageResult {
  buffer: Buffer;
  ext: string;
  mimeType: string;
  optimized: boolean;
}

/**
 * Resizes and compresses uploaded avatar/image buffers to max 512x512 WebP.
 * Gracefully falls back to the original buffer if sharp is unavailable or fails.
 */
export async function optimizeAvatarImage(
  inputBuffer: Buffer,
  fallbackExt: string,
  fallbackMimeType: string
): Promise<OptimizedImageResult> {
  try {
    const sharpModule = await import('sharp');
    const sharp = sharpModule.default;
    const optimizedBuffer = await sharp(inputBuffer)
      .rotate()
      .resize(512, 512, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();

    if (optimizedBuffer.length > 0 && optimizedBuffer.length < inputBuffer.length) {
      return {
        buffer: optimizedBuffer,
        ext: 'webp',
        mimeType: 'image/webp',
        optimized: true,
      };
    }

    // Even if input was already tiny, keep resized WebP if dimensions were reduced
    return {
      buffer: optimizedBuffer.length > 0 ? optimizedBuffer : inputBuffer,
      ext: optimizedBuffer.length > 0 ? 'webp' : fallbackExt,
      mimeType: optimizedBuffer.length > 0 ? 'image/webp' : fallbackMimeType,
      optimized: optimizedBuffer.length > 0,
    };
  } catch (err) {
    console.warn('[ImageOptimizer] sharp unavailable or failed, using original image:', err);
    return {
      buffer: inputBuffer,
      ext: fallbackExt,
      mimeType: fallbackMimeType,
      optimized: false,
    };
  }
}
