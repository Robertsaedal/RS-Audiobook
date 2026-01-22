export const getDominantColor = async (imageUrl: string): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imageUrl;

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('#A855F7'); // Fallback purple
        return;
      }

      // Resize for speed (we don't need high res for dominant color)
      canvas.width = 50;
      canvas.height = 50;
      ctx.drawImage(img, 0, 0, 50, 50);

      const imageData = ctx.getImageData(0, 0, 50, 50).data;
      let r = 0, g = 0, b = 0, count = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        const tr = imageData[i];
        const tg = imageData[i + 1];
        const tb = imageData[i + 2];
        const ta = imageData[i + 3];

        // Skip transparent, white, and very dark pixels to find "vibrant" colors
        if (ta < 128 || (tr > 240 && tg > 240 && tb > 240) || (tr < 20 && tg < 20 && tb < 20)) {
          continue;
        }

        r += tr;
        g += tg;
        b += tb;
        count++;
      }

      if (count === 0) {
        resolve('#A855F7');
        return;
      }

      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);

      resolve(`rgb(${r}, ${g}, ${b})`);
    };

    img.onerror = () => {
      resolve('#A855F7');
    };
  });
};