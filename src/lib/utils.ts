/**
 * Compresses an image from a Base64 string.
 * @param base64Str The source Base64 string (including data:image/...)
 * @param maxWidth The maximum width for the compressed image.
 * @param quality The quality of the JPEG compression (0.1 to 1.0).
 * @returns A promise that resolves to the compressed Base64 string.
 */
export const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const width = img.width;
      const height = img.height;
      
      // Calculate new dimensions
      let newWidth = width;
      let newHeight = height;
      
      if (width > maxWidth) {
        newWidth = maxWidth;
        newHeight = (height * maxWidth) / width;
      }
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64Str);
        return;
      }
      
      // Draw image on canvas
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      
      // Export as JPEG with specified quality
      const compressed = canvas.toDataURL('image/jpeg', quality);
      resolve(compressed);
    };
    
    img.onerror = (err) => {
      console.error("Image compression failed:", err);
      reject(err);
    };
  });
};
