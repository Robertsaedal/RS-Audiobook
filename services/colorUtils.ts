
const colorCache = new Map<string, string>();
const CACHE_KEY = 'rs_color_cache';

// Initialize cache from LocalStorage on load
try {
  const stored = localStorage.getItem(CACHE_KEY);
  if (stored) {
    const parsed = JSON.parse(stored);
    Object.entries(parsed).forEach(([k, v]) => colorCache.set(k, v as string));
  }
} catch (e) {
  console.warn('Failed to load color cache');
}

const saveCache = () => {
  try {
    // Limit cache size to 500 items to prevent storage quota issues
    if (colorCache.size > 500) {
      const keysToDelete = Array.from(colorCache.keys()).slice(0, colorCache.size - 500);
      keysToDelete.forEach(k => colorCache.delete(k));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(colorCache)));
  } catch (e) {
    // Storage likely full, ignore
  }
};

export const getDominantColor = async (imageUrl: string): Promise<string> => {
  // 1. Check Memory Cache
  if (colorCache.has(imageUrl)) {
    return colorCache.get(imageUrl)!;
  }

  // Generate a cache key based on the URL (ignoring token if possible, but usually token is needed)
  // For simplicity and correctness with varying tokens, we cache by exact URL.
  // Ideally, we'd cache by Item ID, but this utility is generic.

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve('#A855F7');
        return;
      }

      // Very small resize is sufficient for dominant color
      canvas.width = 10;
      canvas.height = 10;
      ctx.drawImage(img, 0, 0, 10, 10);

      const imageData = ctx.getImageData(0, 0, 10, 10).data;
      let r = 0, g = 0, b = 0, count = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        const tr = imageData[i];
        const tg = imageData[i + 1];
        const tb = imageData[i + 2];
        const ta = imageData[i + 3];

        // Skip transparent, white, and very dark pixels
        if (ta < 128 || (tr > 240 && tg > 240 && tb > 240) || (tr < 20 && tg < 20 && tb < 20)) {
          continue;
        }

        r += tr;
        g += tg;
        b += tb;
        count++;
      }

      let result = '#A855F7';
      if (count > 0) {
        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);
        result = `rgb(${r}, ${g}, ${b})`;
      }

      // Update Cache
      colorCache.set(imageUrl, result);
      // Debounce saving to localStorage
      setTimeout(saveCache, 2000);
      
      resolve(result);
    };

    img.onerror = () => {
      resolve('#A855F7');
    };
  });
};
