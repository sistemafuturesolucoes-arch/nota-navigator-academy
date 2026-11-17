import { createGoogleGenerativeAI } from "npm:@ai-sdk/google@4.0.121";
import { convertToModelMessages, streamText, type UIMessage } from "npm:ai@7.0.170";

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
  return `Você é o "Assistente Future", o suporte inteligente do Emissor Future (emissor de notas fiscais da Future Soluções).
Seu objetivo é que o cliente resolva tudo sozinho, sem precisar chamar o suporte humano.

Como responder:
- Sempre em português do Brasil, com linguagem simples, educada e direta. Nada de jargão sem explicar.
- Para "como faço X", responda com o CAMINHO no sistema em negrito (ex.: **Cadastros > Produtos > Novo Produto**) e depois passos numerados curtos.
- Explique o que cada campo/botão significa quando for útil.
- Quando existir uma aula relacionada no manual, termine indicando-a com um link markdown, ex.: [Ver aula: Cadastrar produto](/aula/produto-dados).
- Se o cliente enviar um PRINT/IMAGEM de erro: 1) transcreva a mensagem de erro que aparece; 2) explique em uma frase o que ela significa; 3) dê os passos para corrigir dentro do sistema; 4) se for algo que depende da SEFAZ, prefeitura, certificado digital ou contabilidade, diga isso claramente.
- Use apenas as informações do manual abaixo e conhecimento geral sobre documentos fiscais brasileiros (NF-e, NFC-e, NFS-e, CT-e, MDF-e, NCM, CFOP, CST/CSOSN). Nunca invente botões, menus ou telas que não estejam no manual. Se não souber onde algo fica no sistema, diga que não encontrou no manual e sugira o caminho mais provável deixando claro que é uma sugestão.
- Questões tributárias específicas (qual NCM, qual alíquota, qual CST usar): explique o conceito e recomende confirmar com a contabilidade.
- Respostas curtas: no máximo ~180 palavras, a não ser que o cliente peça mais detalhes.
${currentScreen ? `\nO cliente está estudando a aula/tela com id "${currentScreen}" neste momento.` : ""}

=== MANUAL DO EMISSOR FUTURE ===
${knowledge || "(manual indisponível)"}
=== FIM DO MANUAL ===`;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, "Método não permitido.");

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      console.error("GEMINI_API_KEY não está definido nos secrets desta Edge Function.");
      return json(503, "A chave GEMINI_API_KEY não está disponível nos secrets do Supabase deste projeto.");
    }

    const body = await request.json() as { messages?: unknown; knowledge?: unknown; tela?: unknown };
    if (!Array.isArray(body.messages) || body.messages.length === 0) return json(400, "Nenhuma mensagem enviada.");

    const messages = (body.messages as UIMessage[]).slice(-30);
    const knowledge = typeof body.knowledge === "string" ? body.knowledge.slice(0, 60000) : "";
    const tela = typeof body.tela === "string" ? body.tela.slice(0, 80) : undefined;

    const google = createGoogleGenerativeAI({ apiKey });
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
    const result = streamText({
      model: google(model),
      system: buildSystemPrompt(knowledge, tela),
      messages: await convertToModelMessages(messages),
      abortSignal: request.signal,
      maxRetries: 1,
      onError: ({ error }) => console.error("Gemini assistant error", error),
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      headers: corsHeaders,
      onError: (error) => {
        console.error("assistant stream error", error);
        return "Não consegui responder agora. Verifique a chave e as permissões do Gemini e tente novamente.";
      },
    });
  } catch (error) {
    console.error("ai-assistant error", error);
    return json(500, "O assistente encontrou um erro interno. Tente novamente.");
  }
});
