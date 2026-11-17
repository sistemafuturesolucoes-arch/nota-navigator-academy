import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@4.0.121";
import { generateText } from "npm:ai@7.0.170";

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

async function requireAdmin(request: Request) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const response = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return false;
  const user = await response.json() as { app_metadata?: { role?: string } };
  return user.app_metadata?.role === "admin";
}

const ORIGINAL_PRINTS = [
  ["login", "b48311a0-d60b-4ff5-8676-68eee3aebf78", "login.png"],
  ["dashboard", "f0f04b80-4155-4004-9f8e-fe686b179dbd", "dashboard.png"],
  ["menu-cadastros", "530908fc-dacc-47f1-8dc6-b0a27dfa754b", "menu-cadastros.png"],
  ["produtos-lista", "ec16ea56-b32b-4372-8497-8fea9496e769", "produtos-lista.png"],
  ["produto-dados", "9824f047-a368-4825-8c0a-b03c9722d134", "produto-dados.png"],
  ["produto-tributacao", "5f241367-324a-42d0-8dd6-8e6c93fea98f", "produto-tributacao.png"],
  ["servicos-lista", "52c98da6-280e-43fc-a63f-960a09e539fb", "servicos-lista.png"],
  ["servico-cadastro", "a3869b55-0580-4e32-a415-bd92e69e9025", "servico-cadastro.png"],
  ["clientes-lista", "662f7f5d-c67d-465c-8dc8-2f7e26de1367", "clientes-lista.png"],
  ["cliente-cadastro", "d4dbaba4-b51d-4cc4-bf64-da68bb62647e", "cliente-cadastro.png"],
] as const;

async function importOriginalPrints() {
  const baseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const results: Array<{ lessonId: string; file: string; ok: boolean; error?: string }> = [];

  for (const [lessonId, assetId, filename] of ORIGINAL_PRINTS) {
    const source = `https://nota-navigator-academy.lovable.app/__l5e/assets-v1/${assetId}/${filename}`;
    try {
      const downloaded = await fetch(source);
      if (!downloaded.ok) throw new Error(`Origem Lovable respondeu HTTP ${downloaded.status}`);
      const mime = downloaded.headers.get("content-type") ?? "";
      if (!mime.includes("image/")) throw new Error("A origem não retornou uma imagem.");
      const bytes = await downloaded.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > 15 * 1024 * 1024) throw new Error("Imagem vazia ou maior que 15 MB.");

      const path = `original/${filename}`;
      const uploaded = await fetch(`${baseUrl}/storage/v1/object/course-images/${path}`, {
        method: "POST",
        headers: { ...headers, "Content-Type": mime, "x-upsert": "true" },
        body: bytes,
      });
      if (!uploaded.ok) throw new Error(`Falha ao gravar no Storage (HTTP ${uploaded.status}).`);

      const publicUrl = `${baseUrl}/storage/v1/object/public/course-images/${path}`;
      const updated = await fetch(
        `${baseUrl}/rest/v1/course_lessons?id=eq.${encodeURIComponent(lessonId)}`,
        {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ image_url: publicUrl }),
        },
      );
      if (!updated.ok) throw new Error(`Imagem enviada, mas não foi possível atualizar a aula (HTTP ${updated.status}).`);
      const updatedRows = await updated.json() as Array<{ id: string }>;
      if (!updatedRows.length) throw new Error("A aula ainda não existe no banco; salve primeiro o conteúdo inicial do manual.");
      results.push({ lessonId, file: filename, ok: true });
    } catch (error) {
      results.push({ lessonId, file: filename, ok: false, error: error instanceof Error ? error.message : "Falha desconhecida." });
    }
  }
  return results;
}


async function generateLessonFromImage(imageBase64: string, mimeType: string) {
  const apiKey = env("GEMINI_API_KEY");
  if (!["image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
    throw new Error("Formato de imagem não suportado. Envie PNG, JPG ou WEBP.");
  }
  if (!imageBase64 || imageBase64.length > 12 * 1024 * 1024) {
    throw new Error("O print está vazio ou é muito grande. Envie uma imagem menor que 9 MB.");
  }

  const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0));
  const google = createGoogleGenerativeAI({ apiKey });
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const prompt = `Analise esta captura de tela do sistema Emissor Future e crie o conteúdo de uma aula de treinamento em português brasileiro.
Escreva como um instrutor humano, claro e paciente, que ensina alguém que está usando o sistema pela primeira vez.
Não invente informações que não estejam visíveis. Se o caminho exato do menu não puder ser inferido, deixe path como string vazia.
Responda SOMENTE com JSON válido, sem markdown ou comentários, neste formato:
{
  "moduleTitle": "nome curto e organizado para o módulo",
  "moduleDescription": "descrição amigável do módulo em 1 ou 2 frases",
  "title": "título da aula",
  "summary": "resumo claro do que o usuário vai aprender",
  "path": "caminho no sistema, se visível ou claramente inferível",
  "content": "aula completa em Markdown, com introdução, objetivo, explicação da tela e passos numerados. Explique o que preencher, o que conferir e como concluir. Não invente campos ou botões.",
  "hotspots": [
    {
      "x": 10,
      "y": 20,
      "w": 15,
      "h": 8,
      "title": "nome visível do botão ou campo",
      "description": "explicação simples e natural da função",
      "tip": "dica prática ou string vazia"
    }
  ]
}
Coordenadas x, y, w, h devem ser percentuais de 0 a 100, aproximando retângulos pequenos ao redor de elementos que estejam realmente visíveis. Inclua no máximo 12 itens importantes; não crie hotspots para elementos que não consiga identificar. A aula deve ser útil mesmo que não seja possível identificar todos os elementos.`;
  const result = await generateText({
    model: google(model),
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image", image: bytes, mimeType },
      ],
    }],
    maxOutputTokens: 6000,
    maxRetries: 1,
  });

  const raw = result.text.trim();
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("A IA não conseguiu montar a aula em formato válido. Tente outro print.");
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const clean = (value: unknown, max = 12000) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const hotspots = Array.isArray(parsed.hotspots) ? parsed.hotspots.slice(0, 12).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const h = item as Record<string, unknown>;
    const number = (key: string) => {
      const value = Number(h[key]);
      return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
    };
    const title = clean(h.title, 120);
    if (!title) return [];
    const x = number("x"), y = number("y");
    const w = Math.max(1, Math.min(number("w"), 100 - x));
    const height = Math.max(1, Math.min(number("h"), 100 - y));
    return [{
      id: `ai-${index + 1}-${crypto.randomUUID().slice(0, 8)}`,
      x, y, w, h: height,
      title,
      description: clean(h.description, 1000),
      ...(clean(h.tip, 300) ? { tip: clean(h.tip, 300) } : {}),
    }];
  }) : [];

  return {
    moduleTitle: clean(parsed.moduleTitle, 120),
    moduleDescription: clean(parsed.moduleDescription, 500),
    title: clean(parsed.title, 120),
    summary: clean(parsed.summary, 500),
    path: clean(parsed.path, 250),
    content: clean(parsed.content, 12000),
    hotspots,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const body = await request.json() as { action?: string; lessonId?: string; imageBase64?: string; mimeType?: string };
    const baseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    if (body.action === "generate-lesson") {
      if (!(await requireAdmin(request))) return reply(401, { error: "Acesso administrativo necessário." });
      if (typeof body.imageBase64 !== "string" || typeof body.mimeType !== "string") {
        return reply(400, { error: "Envie um print para gerar a aula." });
      }
      try {
        const generated = await generateLessonFromImage(body.imageBase64, body.mimeType);
        return reply(200, generated);
      } catch (error) {
        console.error("lesson generation failed", error);
        return reply(502, { error: error instanceof Error ? error.message : "Não foi possível gerar a aula agora." });
      }
    }

    if (body.action === "import-original-prints") {
      if (!(await requireAdmin(request))) return reply(401, { error: "Acesso administrativo necessário." });
      const results = await importOriginalPrints();
      const imported = results.filter((item) => item.ok).length;
      return reply(imported === results.length ? 200 : 207, { imported, total: results.length, results });
    }

    if (body.action !== "sign-video" || typeof body.lessonId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(body.lessonId)) {
      return reply(400, { error: "Solicitação inválida." });
    }

    const lessonResponse = await fetch(
      `${baseUrl}/rest/v1/course_lessons?id=eq.${encodeURIComponent(body.lessonId)}&select=video_path,is_published,module_id`,
      { headers },
    );
    if (!lessonResponse.ok) return reply(500, { error: "Não foi possível localizar o vídeo." });
    const lessons = await lessonResponse.json() as Array<{ video_path?: string | null; is_published: boolean; module_id: string }>;
    const lesson = lessons[0];
    if (!lesson?.video_path) return reply(404, { error: "Vídeo não encontrado." });

    const moduleResponse = await fetch(
      `${baseUrl}/rest/v1/course_modules?id=eq.${encodeURIComponent(lesson.module_id)}&select=is_published`,
      { headers },
    );
    if (!moduleResponse.ok) return reply(500, { error: "Não foi possível validar a publicação." });
    const modules = await moduleResponse.json() as Array<{ is_published: boolean }>;
    if (!lesson.is_published || modules[0]?.is_published !== true) return reply(404, { error: "Este conteúdo não está publicado." });

    const path = lesson.video_path.replace(/^\/+/, "");
    const signedResponse = await fetch(
      `${baseUrl}/storage/v1/object/sign/course-videos/${path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) },
    );
    const signed = await signedResponse.json() as { signedURL?: string };
    if (!signedResponse.ok || !signed.signedURL) return reply(500, { error: "Não foi possível liberar o vídeo agora." });
    const url = signed.signedURL.startsWith("http") ? signed.signedURL : `${baseUrl}/storage/v1${signed.signedURL}`;
    return reply(200, { url, expiresIn: 3600 });
  } catch (error) {
    console.error("course-media error", error);
    return reply(500, { error: "Serviço de mídia indisponível." });
  }
});
