import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, convertToModelMessages, streamText, type UIMessage } from "ai";

import { buildSystemPrompt } from "@/lib/ai/assistant-prompt";

const DEFAULT_MODEL = "gpt-4o";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function friendlyError(error: unknown) {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401) return "A chave da OpenAI é inválida. Peça ao administrador para conferir a chave.";
    if (error.statusCode === 429)
      return "A IA está sem créditos ou com muitas solicitações agora. Aguarde um pouco e tente novamente.";
    if (error.statusCode === 404) return "O modelo de IA configurado não está disponível nesta conta da OpenAI.";
  }
  return "Não consegui responder agora. Tente novamente em instantes.";
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) {
          return json(
            503,
            "O assistente ainda não foi ativado: falta configurar a chave da OpenAI do sistema.",
          );
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

        const openai = createOpenAI({ apiKey });
        const result = streamText({
          model: openai.responses(process.env["OPENAI_MODEL"] || DEFAULT_MODEL),
          system: buildSystemPrompt(knowledge, tela),
          messages: await convertToModelMessages(messages),
          providerOptions: { openai: { store: false } },
          abortSignal: request.signal,
          maxRetries: 1,
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onError: (error) => {
            console.error("assistant error", error);
            return friendlyError(error);
          },
        });
      },
    },
  },
});
