import { createFileRoute } from "@tanstack/react-router";

// A chave Gemini fica somente nos secrets da Edge Function do Supabase.
// A chave publishable abaixo é pública e serve apenas para identificar o projeto.
const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";

function json(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: string;
        try {
          body = await request.text();
          const parsed = JSON.parse(body) as { messages?: unknown };
          if (!Array.isArray(parsed.messages) || parsed.messages.length === 0) {
            return json(400, "Nenhuma mensagem enviada.");
          }
        } catch {
          return json(400, "Requisição inválida.");
        }

        try {
          const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
              "x-client-ip": request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
                || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
                || request.headers.get("x-real-ip")
                || "unknown",
            },
            body,
            signal: request.signal,
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => null) as { error?: string } | null;
            return json(response.status, payload?.error || "Não foi possível acessar o assistente agora.");
          }

          return new Response(response.body, {
            status: response.status,
            headers: {
              "Content-Type": response.headers.get("Content-Type") || "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Vercel-AI-UI-Message-Stream": "v1",
            },
          });
        } catch (error) {
          console.error("assistant proxy error", error);
          return json(503, "Não foi possível conectar ao serviço de IA. Tente novamente.");
        }
      },
    },
  },
});
