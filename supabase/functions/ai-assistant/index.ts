import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@4.0.121";
import { convertToModelMessages, generateText, streamText, type UIMessage } from "npm:ai@7.0.170";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildSystemPrompt(knowledge: string, currentScreen?: string) {
  return `Você é o Assistente Future, o orientador virtual do Emissor Future, da Future Soluções.
Converse como uma pessoa experiente e atenciosa que está ajudando alguém ao lado do computador. Seu jeito deve ser humano, natural, paciente e profissional — nunca pareça um robô ou um manual frio.

ESTILO DE CONVERSA:
- Fale sempre em português brasileiro, com palavras simples e frases naturais.
- Comece acolhendo a dúvida de forma breve e contextual. Evite repetir sempre a mesma saudação.
- Demonstre que entendeu o problema antes de orientar. Não use frases artificiais como "Com base nas informações fornecidas".
- Explique o motivo do erro quando houver informação suficiente e depois mostre como resolver.
- Dê instruções práticas, numeradas e curtas. Informe o caminho exato no sistema em negrito quando estiver documentado.
- Não despeje informação demais de uma vez. Priorize o que a pessoa precisa fazer agora.
- Se houver mais de uma possibilidade, explique como identificar qual se aplica.
- Não culpe o usuário. Seja cordial, encorajador e claro.
- Não invente telas, botões, menus, códigos fiscais ou procedimentos.
- Se não encontrar a informação no manual, diga isso com transparência e faça uma pergunta objetiva para esclarecer.
- Respostas normalmente até 180 palavras, mas aprofunde quando a pessoa pedir.

QUANDO RECEBER PRINT OU IMAGEM DE ERRO:
1. Leia e transcreva a mensagem visível, sem inventar trechos ilegíveis.
2. Explique em linguagem simples o que ela quer dizer.
3. Oriente o usuário passo a passo dentro do Emissor Future.
4. Se depender da SEFAZ, prefeitura, certificado digital, internet ou contabilidade, deixe isso claro e explique o que deve ser verificado.
5. Se a imagem estiver cortada ou pouco legível, peça outro print ou a mensagem escrita.

REGRAS DE CONFIABILIDADE:
- Use o manual abaixo como fonte principal e o conhecimento geral apenas para explicar conceitos.
- Nunca trate uma hipótese como certeza. Sinalize quando estiver inferindo.
- Para NCM, CFOP, CST/CSOSN, alíquotas e decisões tributárias, explique o conceito e oriente confirmar com a contabilidade.
- Quando existir aula relacionada no manual, indique-a com link markdown, por exemplo [Ver aula: Cadastrar produto](/aula/produto-dados).
- SUPORTE VISUAL: o manual pode conter blocos "PRINT VISUAL [VISUAL:ID_DA_AULA:ID_DO_PRINT]" com URL de imagem real, legenda e marcações numeradas. Quando um print corresponder ao passo que você está explicando, insira o marcador exato [VISUAL:ID_DA_AULA:ID_DO_PRINT] em uma linha separada, logo após a explicação daquela etapa. Isso fará o sistema exibir o print real com os destaques clicáveis.
- Prefira 1 a 3 prints realmente relevantes, na ordem em que o cliente deve seguir. Explique o que procurar em cada imagem. Não invente IDs, imagens, botões ou coordenadas. Só use marcadores presentes no manual. Se não houver print correspondente, continue com instruções textuais e peça um print atualizado quando necessário.
- Para erros recorrentes, diferencie causa confirmada de hipótese. Nunca reutilize uma solução aprovada se a mensagem, o contexto ou a versão da tela não corresponderem claramente.
- O objetivo é resolver a dúvida sem que o cliente precise chamar o suporte, mas não prometa resolver algo que depende de terceiros.

${currentScreen ? `O cliente está estudando a aula/tela "${currentScreen}" neste momento.` : ""}

=== MANUAL DO EMISSOR FUTURE ===
${knowledge || "(manual indisponível)"}
=== FIM DO MANUAL ===`;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://itbppoailqkuxajesgys.supabase.co";

function latestUserMessage(messages: UIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user");
}

function textFromMessage(message?: UIMessage) {
  if (!message) return "";
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function imageDataFromMessage(message?: UIMessage) {
  if (!message) return "";
  const file = message.parts.find((part) => part.type === "file" && part.mediaType.startsWith("image/"));
  return file && file.type === "file" && file.url.startsWith("data:") ? file.url : "";
}

function sanitizeText(value: string) {
  return value
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF ocultado]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ ocultado]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function isLikelyError(text: string, hasImage: boolean) {
  return hasImage || /erro|rejei\w*|falha|inv[aá]lid|n[aã]o consigo|n[aã]o funciona|exception|error|c[oó]digo\s*\d/i.test(text);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function errorFingerprint(
  message: UIMessage,
  google: ReturnType<typeof createGoogleGenerativeAI>,
  model: string,
) {
  const image = imageDataFromMessage(message);
  let sourceText = textFromMessage(message);
  if (image) {
    try {
      const extracted = await generateText({
        model: google(model),
        system: "Analise o print enviado e extraia somente a mensagem principal do erro, código técnico e nome do serviço/tela se estiverem claramente visíveis. Ignore nomes, CPF, CNPJ, e-mails, valores e dados pessoais. Não diagnostique nem invente. Se não houver mensagem de erro legível, responda exatamente: SEM_MENSAGEM_LEGIVEL.",
        messages: await convertToModelMessages([message]),
        maxOutputTokens: 120,
        maxRetries: 1,
      });
      sourceText = extracted.text.trim();
    } catch (error) {
      console.warn("Não foi possível extrair a assinatura do print; usando impressão digital da imagem.", error);
    }
    if (!sourceText || /SEM_MENSAGEM_LEGIVEL/i.test(sourceText)) {
      const fingerprint = await sha256(image);
      return { fingerprint, signature: "imagem:" + fingerprint.slice(0, 24), hasImage: true };
    }
  }
  const normalized = sanitizeText(sourceText)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;
  return { fingerprint: await sha256(normalized), signature: normalized.slice(0, 240), hasImage: Boolean(image) };
}

async function knownSolution(fingerprint: string) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return null;
  const url = `${SUPABASE_URL}/rest/v1/error_knowledge?fingerprint=eq.${encodeURIComponent(fingerprint)}&status=eq.approved&select=solution,error_message,occurrence_count&limit=1`;
  const response = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!response.ok) {
    console.error("error knowledge lookup failed", response.status, await response.text());
    return null;
  }
  const rows = await response.json() as Array<{ solution: string; error_message: string; occurrence_count: number }>;
  return rows[0] ?? null;
}

async function recordPendingError(fingerprint: string, signature: string, message: string, solution: string) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY ausente; erro não foi armazenado na base de conhecimento.");
    return;
  }
  const category = /nfe|nf-e|nfc|sefaz|tribut|ncm|cfop|cst|csosn/i.test(message) ? "fiscal" : "geral";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_error_occurrence`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_fingerprint: fingerprint,
      p_error_signature: signature,
      p_error_message: sanitizeText(message),
      p_category: category,
      p_solution: sanitizeText(solution),
    }),
  });
  if (!response.ok) console.error("error knowledge save failed", response.status, await response.text());
}

function cachedAnswer(solution: string) {
  const messageId = crypto.randomUUID();
  const textId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const events = [
    { type: "start", messageId },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: solution },
    { type: "text-end", id: textId },
    { type: "finish" },
  ];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Vercel-AI-UI-Message-Stream": "v1",
      "X-Future-Knowledge-Hit": "true",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, "Método não permitido.");

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("GEMINI_API_KEY não está definido nos secrets desta Edge Function.");
      return json(503, "O serviço de atendimento está temporariamente indisponível.");
    }

    const body = await request.json() as { messages?: unknown; knowledge?: unknown; tela?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0) return json(400, "Nenhuma mensagem enviada.");

    const messages = (body.messages as UIMessage[]).slice(-30);
    const knowledge = typeof body.knowledge === "string" ? body.knowledge.slice(0, 60000) : "";
    const tela = typeof body.tela === "string" ? body.tela.slice(0, 80) : undefined;
    const lastUser = latestUserMessage(messages);
    const userText = textFromMessage(lastUser);
    const google = createGoogleGenerativeAI({ apiKey });
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash-lite";
    const fingerprintData = lastUser && isLikelyError(userText, Boolean(imageDataFromMessage(lastUser)))
      ? await errorFingerprint(lastUser, google, model)
      : null;

    if (fingerprintData) {
      const known = await knownSolution(fingerprintData.fingerprint);
      if (known?.solution) {
        await recordPendingError(fingerprintData.fingerprint, fingerprintData.signature, userText, "");
        return cachedAnswer(known.solution);
      }
    }

    const result = streamText({
      model: google(model),
      system: buildSystemPrompt(knowledge, tela),
      messages: await convertToModelMessages(messages),
      abortSignal: request.signal,
      maxRetries: 1,
      onError: ({ error }) => console.error("Gemini assistant error", error),
      onFinish: async ({ text }) => {
        if (fingerprintData) {
          await recordPendingError(fingerprintData.fingerprint, fingerprintData.signature, userText, text);
        }
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: corsHeaders,
      onError: (error) => {
        console.error("assistant stream error", error);
        return "Tive uma instabilidade ao preparar a resposta. Pode tentar novamente em alguns instantes?";
      },
    });
  } catch (error) {
    console.error("ai-assistant error", error);
    return json(500, "O assistente encontrou uma dificuldade. Tente novamente em instantes.");
  }
});
