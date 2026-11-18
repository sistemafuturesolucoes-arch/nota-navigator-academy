/** Resize and normalize uploaded screenshots (including SVG) before storing them. */
export async function fileToCompressedBlob(
  file: File,
  maxWidth = 1800,
  quality = 0.82,
): Promise<Blob> {
  if (!file.type.startsWith("image/") && !/\\.svg$/i.test(file.name)) {
    throw new Error("Selecione um arquivo de imagem.");
  }

  const canvas = document.createElement("canvas");
  let width = 0;
  let height = 0;
  let bitmap: ImageBitmap | null = null;
  let objectUrl: string | null = null;

  try {
    try {
      bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;
    } catch {
      // Fallback for browsers that do not decode SVG files through createImageBitmap.
      objectUrl = URL.createObjectURL(file);
      const image = new Image();
      image.src = objectUrl;
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Não foi possível abrir esta imagem. Para SVG, confira se o arquivo é válido."));
      });
      width = image.naturalWidth;
      height = image.naturalHeight;
      if (!width || !height) throw new Error("A imagem não possui dimensões válidas.");
      const scale = Math.min(1, maxWidth / width);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível processar a imagem.");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    }

    if (bitmap) {
      const scale = Math.min(1, maxWidth / width);
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Não foi possível processar a imagem.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao compactar a imagem."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap?.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Compatibility helper for older local drafts. New uploads should use fileToCompressedBlob. */
export async function fileToCompressedDataUrl(file: File, maxWidth = 1800, quality = 0.82): Promise<string> {
  const blob = await fileToCompressedBlob(file, maxWidth, quality);
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem compactada."));
    reader.readAsDataURL(blob);
  });
}
