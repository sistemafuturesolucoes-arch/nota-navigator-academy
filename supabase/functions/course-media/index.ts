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


async function generateLessonFromImages(images: Array<{ data: string; mimeType: string }>) {
  const apiKey = env("GEMINI_API_KEY");
  if (!Array.isArray(images) || images.length < 1 || images.length > 8) throw new Error("Envie de 1 a 8 prints por aula.");

  // Os prints chegam do navegador já compactados. A Edge Function não precisa
  // buscar os próprios arquivos no Storage, evitando falhas de resolução DNS.
  const imageParts: Array<{ type: "image"; image: Uint8Array; mimeType: string }> = [];
  let totalBytes = 0;
  for (const item of images) {
    if (!item || typeof item.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.data)) {
      throw new Error("Um dos prints chegou em formato inválido. Envie novamente as imagens.");
    }
    const mimeType = String(item.mimeType || "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Um dos arquivos não é uma imagem JPG, PNG ou WEBP.");
    const binary = atob(item.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (!bytes.length || bytes.byteLength > 8 * 1024 * 1024) throw new Error("Um dos prints está vazio ou ultrapassa 8 MB após a compactação.");
    totalBytes += bytes.byteLength;
    if (totalBytes > 20 * 1024 * 1024) throw new Error("O conjunto de prints ficou muito grande. Envie imagens menores ou divida em duas aulas.");
    imageParts.push({ type: "image", image: bytes, mimeType });
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const configuredModel = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
  const modelCandidates = [...new Set([configuredModel, "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"])];
  const prompt = `Você é um instrutor especialista no Emissor Future. Analise TODOS os prints na ordem em que aparecem.
Crie uma aula completa em português brasileiro, natural, didática e prática. Trate as imagens como etapas sequenciais de uma única tarefa, quando fizer sentido.
Não invente menus, botões, campos, valores ou regras fiscais. Se algo não estiver legível, sinalize no texto e não crie marcação para esse elemento.
A aula deve explicar o objetivo, o caminho no sistema, o que fazer em cada tela, o que preencher, o que conferir e como concluir.
Use passos numerados e títulos claros. Organize o conteúdo por print (Print 1, Print 2 etc.) para o aluno saber quando avançar.
IMPORTANTE: faça uma inspeção visual cuidadosa de CADA print e identifique todos os controles acionáveis ou campos relevantes que estejam realmente visíveis (botões, menus, abas, ícones com função clara, caixas de seleção, campos de texto e seletores). Gere uma marcação e uma explicação individual para cada controle identificado, sem pular os principais. Não invente controles que não aparecem. Use até 24 marcações por print; se houver mais, priorize todos os controles necessários para executar a tarefa e não crie duplicatas.\nAs coordenadas x, y, w, h são percentuais de 0 a 100 relativos à imagem inteira, não à tela do navegador nem à janela. x e y indicam o canto SUPERIOR ESQUERDO do retângulo; w e h indicam sua largura e altura. O retângulo deve ficar exatamente em volta do botão/campo visível, com pequena margem (cerca de 1% a 2%), sem cobrir controles vizinhos, títulos ou áreas vazias. Confira mentalmente cada retângulo com a posição real do controle no print antes de responder. Nunca distribua os marcadores uniformemente, nunca use coordenadas genéricas e nunca coloque todos no centro. Se não conseguir localizar com segurança um controle, não crie marcação para ele. Cada hotspot precisa ter título específico e explicação prática do que o usuário deve fazer naquele controle.
Responda SOMENTE JSON válido, sem markdown externo, neste formato:
{
  "moduleTitle": "nome sugerido para o módulo",
  "moduleDescription": "descrição curta e humana do módulo",
  "title": "título da aula",
  "summary": "o que o aluno vai aprender",
  "path": "caminho no emissor, se puder identificar",
  "content": "aula completa em Markdown, com introdução, objetivo e passo a passo detalhado por tela",
  "screenshots": [
    {
      "index": 0,
      "caption": "o que esta tela mostra",
      "hotspots": [
        { "x": 10, "y": 20, "w": 15, "h": 8, "title": "nome do botão ou campo", "description": "explicação clara do que faz e quando usar", "tip": "dica curta ou vazio" }
      ]
    }
  ]
}
O array screenshots deve conter exatamente uma entrada para cada print recebido, preservando os índices de 0 a ${imageParts.length - 1}. Não retorne hotspots vazio quando houver botões, menus ou campos claramente visíveis. Se uma imagem realmente não contiver controles identificáveis, retorne hotspots vazio para ela.
A explicação de cada marcação deve ser curta o suficiente para leitura na tela, mas completa para o aluno entender o que fazer.`;
  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  const modelErrors: string[] = [];
  for (const candidate of modelCandidates) {
    try {
      result = await generateText({
        model: google(candidate),
        messages: [{
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...imageParts.map((part, index) => ({
              type: "text" as const,
              text: `PRINT ${index + 1} de ${imageParts.length}`,
            })).flatMap((label, index) => [label, imageParts[index]]),
          ],
        }],
        maxOutputTokens: 16000,
        maxRetries: 1,
      });
      console.log("lesson generation succeeded", { model: candidate });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      modelErrors.push(`${candidate}: ${message.slice(0, 500)}`);
      console.error("Gemini model failed; trying fallback", { model: candidate, error: message });
      if (candidate !== modelCandidates[modelCandidates.length - 1]) {
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
  }
  if (!result) {
    const overloaded = modelErrors.some((message) => /high demand|overloaded|503|429|resource.exhausted|rate.?limit|temporarily unavailable/i.test(message));
    throw new Error(overloaded
      ? "Os modelos de IA estão temporariamente com alta demanda. O sistema tentou automaticamente outros modelos e não conseguiu concluir. Aguarde alguns minutos e tente novamente; seus prints e a aula atual não foram alterados."
      : "Não foi possível analisar os prints com os modelos de IA disponíveis. Nenhuma alteração foi salva. Tente novamente em alguns minutos.");
  }
  const raw = result.text.trim();
  const jsonText = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonText) throw new Error("A IA não conseguiu montar a aula em formato válido. Tente novamente.");
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const clean = (value: unknown, max = 12000) => typeof value === "string" ? value.trim().slice(0, max) : "";
  const generatedScreens = Array.isArray(parsed.screenshots) ? parsed.screenshots : [];
  const screenshots = images.map((_, index) => {
    const match = generatedScreens.find((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).index) === index) as Record<string, unknown> | undefined;
    const hotspots = Array.isArray(match?.hotspots) ? match.hotspots.slice(0, 24).flatMap((item, pointIndex) => {
      if (!item || typeof item !== "object") return [];
      const h = item as Record<string, unknown>;
      const number = (key: string) => {
        const value = Number(h[key]);
        return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
      };
      const title = clean(h.title, 120);
      if (!title) return [];
      const x = number("x"), y = number("y");
      return [{
        id: `ai-${index + 1}-${pointIndex + 1}-${crypto.randomUUID().slice(0, 8)}`,
        x, y, w: Math.max(1, Math.min(number("w"), 100 - x)),
        h: Math.max(1, Math.min(number("h"), 100 - y)),
        title, description: clean(h.description, 1000),
        ...(clean(h.tip, 300) ? { tip: clean(h.tip, 300) } : {}),
      }];
    }) : [];
    return { index, caption: clean(match?.caption, 250), hotspots };
  });

  return {
    moduleTitle: clean(parsed.moduleTitle, 120),
    moduleDescription: clean(parsed.moduleDescription, 500),
    title: clean(parsed.title, 120),
    summary: clean(parsed.summary, 500),
    path: clean(parsed.path, 250),
    content: clean(parsed.content, 20000),
    screenshots,
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed" });

  try {
    const body = await request.json() as { action?: string; lessonId?: string; images?: Array<{ data: string; mimeType: string }> };
    const baseUrl = env("SUPABASE_URL");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

    if (body.action === "generate-lesson") {
      if (!(await requireAdmin(request))) return reply(401, { error: "Acesso administrativo necessário." });
      if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 8) {
        return reply(400, { error: "Envie de 1 a 8 prints para gerar a aula." });
      }
      try {
        const generated = await generateLessonFromImages(body.images);
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
