const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const body = await request.json() as { action?: string; lessonId?: string };
    if (body.action !== "sign-video" || typeof body.lessonId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.lessonId)) {
      return reply(400, { error: "Solicitação inválida." });
    }

    const baseUrl = env("SUPABASE_URL");
    const secretKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
    const lessonResponse = await fetch(
      `${baseUrl}/rest/v1/course_lessons?id=eq.${encodeURIComponent(body.lessonId)}&select=video_path,is_published,module_id`,
      { headers },
    );
    if (!lessonResponse.ok) {
      console.error("course media lesson lookup failed", lessonResponse.status);
      return reply(500, { error: "Não foi possível localizar o vídeo." });
    }
    const lessons = await lessonResponse.json() as Array<{ video_path?: string | null; is_published: boolean; module_id: string }>;
    const lesson = lessons[0];
    if (!lesson?.video_path) return reply(404, { error: "Vídeo não encontrado." });

    const moduleResponse = await fetch(
      `${baseUrl}/rest/v1/course_modules?id=eq.${encodeURIComponent(lesson.module_id)}&select=is_published`,
      { headers },
    );
    if (!moduleResponse.ok) return reply(500, { error: "Não foi possível validar a publicação." });
    const modules = await moduleResponse.json() as Array<{ is_published: boolean }>;
    if (!lesson.is_published || modules[0]?.is_published !== true) {
      return reply(404, { error: "Este conteúdo não está publicado." });
    }

    const path = lesson.video_path.replace(/^\/+/, "");
    const signedResponse = await fetch(
      `${baseUrl}/storage/v1/object/sign/course-videos/${path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 3600 }),
      },
    );
    const signed = await signedResponse.json() as { signedURL?: string; error?: string; message?: string };
    if (!signedResponse.ok || !signed.signedURL) {
      console.error("course video signing failed", signedResponse.status, signed);
      return reply(500, { error: "Não foi possível liberar o vídeo agora." });
    }
    const url = signed.signedURL.startsWith("http") ? signed.signedURL : `${baseUrl}/storage/v1${signed.signedURL}`;
    return reply(200, { url, expiresIn: 3600 });
  } catch (error) {
    console.error("course-media error", error);
    return reply(500, { error: "Serviço de mídia indisponível." });
  }
});
