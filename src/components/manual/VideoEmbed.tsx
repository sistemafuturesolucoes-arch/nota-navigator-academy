import { useEffect, useState } from "react";

const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const SUPABASE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";

function youtubeId(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return match?.[1];
}
function vimeoId(url: string) {
  return url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
}

export function VideoEmbed({ url, title, lessonId }: { url: string; title: string; lessonId: string }) {
  const [resolvedUrl, setResolvedUrl] = useState(url.startsWith("http") ? url : "");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (url.startsWith("http")) {
      setResolvedUrl(url);
      setError("");
      return;
    }
    setResolvedUrl("");
    setError("");
    void fetch(`${SUPABASE_URL}/functions/v1/course-media`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sign-video", lessonId }),
    })
      .then(async (response) => {
        const data = await response.json() as { url?: string; error?: string };
        if (!response.ok || !data.url) throw new Error(data.error || "Não foi possível carregar o vídeo.");
        if (active) setResolvedUrl(data.url);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar o vídeo.");
      });
    return () => { active = false; };
  }, [url, lessonId]);

  const yt = resolvedUrl ? youtubeId(resolvedUrl) : undefined;
  const vm = resolvedUrl ? vimeoId(resolvedUrl) : undefined;
  const src = yt
    ? `https://www.youtube.com/embed/${yt}`
    : vm
      ? `https://player.vimeo.com/video/${vm}`
      : null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border bg-ink">
      {src ? (
        <iframe src={src} title={title} className="size-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
      ) : resolvedUrl ? (
        <video src={resolvedUrl} controls className="size-full" title={title} />
      ) : (
        <div className="flex size-full min-h-40 items-center justify-center p-6 text-center text-sm text-ink-muted">
          {error || "Carregando vídeo..."}
        </div>
      )}
    </div>
  );
}
