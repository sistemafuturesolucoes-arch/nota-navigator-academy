import { createFileRoute } from "@tanstack/react-router";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, convertToModelMessages, streamText, type UIMessage } from "ai";

import { buildSystemPrompt } from "@/lib/ai/assistant-prompt";

const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
/** Modelo reserva usado quando o principal está sobrecarregado ou demora demais. */
const BACKUP_GEMINI_MODEL = "gemini-3.1-flash-lite";
const ATTEMPT_TIMEOUT_MS = 20000;

type GeminiModel = ReturnType<ReturnType<typeof createGoogleGenerativeAI>>;

function isTemporary(error: unknown) {
  if (APICallError.isInstance(error)) {
    const code = error.statusCode ?? 0;
    return code === 429 || code >= 500;
  }
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Tenta cada modelo em ordem; passa para o próximo se o anterior estiver fora do ar. */
function withFallback(models: GeminiModel[]): GeminiModel {
  const first = models[0]!;
  async function attempt<T>(
    signal: AbortSignal | undefined,
    run: (model: GeminiModel, signal: AbortSignal) => PromiseLike<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (const [index, model] of models.entries()) {
      const isLast = index === models.length - 1;
      if (signal?.aborted) throw signal.reason;
      const controller = new AbortController();
      const onAbort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", onAbort);
      // O último modelo não tem prazo extra: só para se o cliente cancelar.
      const timer = isLast
        ? undefined
        : setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), ATTEMPT_TIMEOUT_MS);
      try {
        return await run(model, controller.signal);
      } catch (error) {
        signal?.removeEventListener("abort", onAbort);
        lastError = error;
        if (signal?.aborted || !isTemporary(error)) throw error;
        console.warn(`Gemini ${model.modelId} indisponível, tentando o próximo modelo.`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError;
  }
  return {
    specificationVersion: first.specificationVersion,
    provider: first.provider,
    modelId: first.modelId,
    get supportedUrls() {
      return first.supportedUrls;
    },
    doGenerate: (options) => attempt(options.abortSignal, (m, abortSignal) => m.doGenerate({ ...options, abortSignal })),
    doStream: (options) => attempt(options.abortSignal, (m, abortSignal) => m.doStream({ ...options, abortSignal })),
  } as GeminiModel;
}
const DEFAULT_OPENAI_MODEL = "gpt-4o";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function friendlyError(error: unknown, provider: string) {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 400 && /api key/i.test(error.message))
      return `A chave do ${provider} é inválida. Peça ao administrador para conferir a chave.`;
    if (error.statusCode === 401 || error.statusCode === 403)
      return `A chave do ${provider} é inválida ou não tem permissão. Peça ao administrador para conferir a chave.`;
    if (error.statusCode === 429)
      return "A IA está sem créditos ou com muitas solicitações agora. Aguarde um pouco e tente novamente.";
    if (error.statusCode === 404) return `O modelo de IA configurado não está disponível nesta conta do ${provider}.`;
  }
  return "Não consegui responder agora. Tente novamente em instantes.";
}

/** Gemini é o principal; OpenAI fica como alternativa se só ela estiver configurada. */
function pickModel() {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) {
    const google = createGoogleGenerativeAI({ apiKey: geminiKey });
    const primary = process.env["GEMINI_MODEL"] || DEFAULT_GEMINI_MODEL;
    const names = primary === BACKUP_GEMINI_MODEL ? [primary] : [primary, BACKUP_GEMINI_MODEL];
    return { provider: "Gemini", model: withFallback(names.map((name) => google(name))) };
  }
  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    const openai = createOpenAI({ apiKey: openaiKey });
    return {
      provider: "OpenAI",
      model: openai.responses(process.env["OPENAI_MODEL"] || DEFAULT_OPENAI_MODEL),
    };
  }
  return null;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const picked = pickModel();
        if (!picked) {
          return json(503, "O assistente ainda não foi ativado: falta configurar a chave do Gemini do sistema.");
        }

        let body: { messages?: unknown; knowledge?: unknown; tela?: unknown };
        try {
          body = await request.json();
        } catch {
          return json(400, "Requisição inválida.");
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          return json(400, "Nenhuma mensagem enviada.");
        }
        const messages = (body.messages as UIMessage[]).slice(-30);
        const knowledge = typeof body.knowledge === "string" ? body.knowledge.slice(0, 60000) : "";
        const tela = typeof body.tela === "string" ? body.tela.slice(0, 80) : undefined;

        const result = streamText({
          model: picked.model,
          system: buildSystemPrompt(knowledge, tela),
          messages: await convertToModelMessages(messages),
          providerOptions: { openai: { store: false } },
          abortSignal: request.signal,
          maxRetries: picked.provider === "Gemini" ? 0 : 1,
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onError: (error) => {
            console.error("assistant error", error);
            return friendlyError(error, picked.provider);
          },
        });
      },
    },
  },
});
