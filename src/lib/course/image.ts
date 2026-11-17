/** Resize and compress uploaded screenshots before sending them to Supabase Storage. */
export async function fileToCompressedBlob(
  file: File,
  maxWidth = 1800,
  quality = 0.82,
): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Selecione um arquivo de imagem.");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível processar a imagem.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao compactar a imagem."))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    bitmap.close();
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
