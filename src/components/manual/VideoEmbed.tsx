function youtubeId(url: string) {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m?.[1];
}
function vimeoId(url: string) {
  return url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
}

export function VideoEmbed({ url, title }: { url: string; title: string }) {
  const yt = youtubeId(url);
  const vm = vimeoId(url);
  const src = yt
    ? `https://www.youtube.com/embed/${yt}`
    : vm
      ? `https://player.vimeo.com/video/${vm}`
      : null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border bg-ink">
      {src ? (
        <iframe
          src={src}
          title={title}
          className="size-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <video src={url} controls className="size-full" title={title} />
      )}
    </div>
  );
}
