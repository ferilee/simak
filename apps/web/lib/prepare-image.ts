// Konversi gambar ke WebP di sisi browser sebelum diunggah ke penyimpanan.
// JPG/PNG digambar ulang lewat canvas lalu di-encode sebagai WebP kualitas
// 0.8; hasil konversi hanya dipakai bila benar-benar WebP dan lebih kecil
// dari berkas asal. Dalam semua keadaan lain berkas asli dikembalikan apa
// adanya — fungsi ini TIDAK PERNAH melempar error, supaya jalur unggah yang
// sudah berjalan tidak pernah rusak gara-gara konversi.

const WEBP_QUALITY = 0.8;

/** Hanya JPG dan PNG yang dikonversi; WebP/PDF/dll. dibiarkan apa adanya. */
export function shouldConvertImage(file: { type: string }): boolean {
  return file.type === "image/jpeg" || file.type === "image/png";
}

/** Nama berkas hasil konversi: ekstensi diganti menjadi .webp. */
export function webpFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.webp`;
}

/**
 * Hasil encode diterima hanya bila blob-nya ada, bertipe image/webp,
 * tidak kosong, dan lebih kecil dari berkas asal.
 */
export function acceptConvertedImage(
  blob: { type: string; size: number } | null,
  originalSize: number,
): boolean {
  return blob !== null && blob.type === "image/webp" && blob.size > 0 && blob.size < originalSize;
}

type DecodedImage = {
  width: number;
  height: number;
  draw: (context: CanvasRenderingContext2D) => void;
  close: () => void;
};

// Dekode dengan menghormati orientasi EXIF: createImageBitmap dengan opsi
// from-image adalah jalur utama; <img> dari object URL adalah cadangan
// (browser modern juga menerapkan orientasi EXIF saat merender <img>).
async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context) => context.drawImage(bitmap, 0, 0),
        close: () => bitmap.close(),
      };
    } catch {
      try {
        const bitmap = await createImageBitmap(file);
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (context) => context.drawImage(bitmap, 0, 0),
          close: () => bitmap.close(),
        };
      } catch {
        // Lanjut ke jalur <img> di bawah.
      }
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context) => context.drawImage(image, 0, 0),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToWebpBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), "image/webp", WEBP_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Siapkan berkas untuk diunggah: JPG/PNG dikonversi ke WebP 0.8 bila bisa
 * dan hasilnya lebih kecil; selain itu berkas asli dikembalikan. Tidak
 * pernah melempar — kegagalan apa pun berarti "unggah berkas asli".
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!shouldConvertImage(file)) return file;
  try {
    const decoded = await decodeImage(file);
    try {
      if (decoded.width <= 0 || decoded.height <= 0) return file;
      const canvas = document.createElement("canvas");
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      decoded.draw(context);
      const blob = await canvasToWebpBlob(canvas);
      if (!acceptConvertedImage(blob, file.size)) return file;
      return new File([blob as Blob], webpFileName(file.name), {
        type: "image/webp",
        lastModified: file.lastModified,
      });
    } finally {
      decoded.close();
    }
  } catch {
    return file;
  }
}
