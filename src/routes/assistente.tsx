import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AssistantChat, loadSavedMessages } from "@/components/manual/AssistantChat";
import type { UIMessage } from "ai";

type AssistantSearch = { tela?: string | undefined };

export const Route = createFileRoute("/assistente")({
  validateSearch: (search: Record<string, unknown>): AssistantSearch => ({
    tela: typeof search["tela"] === "string" ? search["tela"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Assistente IA — Manual Interativo Emissor Future" },
      {
        name: "description",
        content: "Tire dúvidas do Emissor Future com a IA: pergunte como fazer qualquer coisa ou envie o print do erro.",
      },
      { property: "og:title", content: "Assistente IA do Emissor Future" },
      {
        property: "og:description",
        content: "Pergunte como fazer qualquer coisa no Emissor Future ou envie o print do erro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantPage,
});

function AssistantPage() {
  const { tela } = Route.useSearch();
  const [initial, setInitial] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    setInitial(loadSavedMessages());
  }, []);

  return (
    <main className="mx-auto flex h-[calc(100vh-4rem)] w-full max-w-4xl flex-col px-4">
      {initial && <AssistantChat initialMessages={initial} tela={tela} />}
    </main>
  );
}
