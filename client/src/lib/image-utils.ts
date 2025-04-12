/**
 * Utility functions for image processing
 */

/**
 * Compresses an image and converts it to WebP format
 * @param file - The image file to compress
 * @param maxWidthOrHeight - Maximum width or height of the image (preserves aspect ratio)
 * @param quality - WebP compression quality (0-1)
 * @returns Promise with compressed WebP image as Blob and Object URL
 */
export const compressImageToWebP = async (
  file: File,
  maxWidthOrHeight = 800,
  quality = 0.7
): Promise<{ blob: Blob; url: string; fileName: string }> => {
  return new Promise((resolve, reject) => {
    // Validate file is an image
    if (!file.type.startsWith('image/')) {
      reject(new Error('File is not an image'));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      
      img.onload = () => {
        // Calculate new dimensions (maintain aspect ratio)
        let width = img.width;
        let height = img.height;
        
        if (width > height && width > maxWidthOrHeight) {
          height = Math.round((height * maxWidthOrHeight) / width);
          width = maxWidthOrHeight;
        } else if (height > maxWidthOrHeight) {
          width = Math.round((width * maxWidthOrHeight) / height);
          height = maxWidthOrHeight;
        }
        
        // Create canvas for resizing
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        // Draw image on canvas
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Generate a filename with WebP extension
        const originalName = file.name.split('.')[0] || 'image';
        const webpFileName = `${originalName}.webp`;
        
        // First create a data URL for immediate preview
        const dataUrl = canvas.toDataURL('image/webp', quality);
        
        // Then convert to WebP blob for upload
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // Create a new blob with explicit WebP MIME type
              const webpBlob = new Blob([blob], { type: 'image/webp' });
              // Use the data URL for preview instead of object URL
              resolve({ blob: webpBlob, url: dataUrl, fileName: webpFileName });
            } else {
              reject(new Error('Failed to create blob'));
            }
          },
          'image/webp',
          quality
        );
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
  });
};

/**
 * Validates if a file is an image
 * @param file - The file to validate
 * @returns boolean indicating if the file is an image
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};
