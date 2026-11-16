import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertCircle, Copy, ImagePlus, RotateCcw, Square, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "@/components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { useSpeech } from "@/hooks/use-speech";
import { buildKnowledge } from "@/lib/course/knowledge";
import { useCourse } from "@/lib/course/store";

const CHAT_KEY = "future-manual-chat-v1";
const CHAT_ID = "assistente-future";

const SUGGESTIONS = [
  "Como cadastrar um produto?",
  "O que é NCM e onde encontro?",
  "Qual a diferença entre NF-e e NFC-e?",
  "Como cadastro um cliente com CNPJ?",
];

/** Saved in this browser until the external database is connected. Images are not stored. */
export function loadSavedMessages(): UIMessage[] {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    return raw ? (JSON.parse(raw) as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: UIMessage[]) {
  const slim = messages.map((m) => ({
    ...m,
    parts: m.parts.map((p) => (p.type === "file" ? { type: "text" as const, text: "📎 Print enviado" } : p)),
  }));
  try {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify(slim.slice(-60)));
  } catch (e) {
    console.error(e);
  }
}

function readError(error: Error) {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* not json */
  }
  return error.message || "Não consegui responder agora. Tente novamente.";
}

function textOf(m: UIMessage) {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function AttachButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} aria-label="Enviar print do erro">
      <ImagePlus className="size-4" />
      <span className="text-xs">Print do erro</span>
    </PromptInputButton>
  );
}

function AttachmentList() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant="inline">
        {attachments.files.map((f) => (
          <Attachment key={f.id} data={f} onRemove={() => attachments.remove(f.id)}>
            <AttachmentPreview />
            <span className="max-w-32 truncate text-xs">{f.filename ?? "print"}</span>
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

export function AssistantChat({ initialMessages, tela }: { initialMessages: UIMessage[]; tela?: string | undefined }) {
  const course = useCourse();
  const knowledge = useMemo(() => buildKnowledge(course), [course]);
  const lessonTitle = tela ? course.lessons[tela]?.title : undefined;
  const { speak, stop, speakingId } = useSpeech();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error, stop: stopChat, setMessages, clearError } = useChat({
    id: CHAT_ID,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    onError: (e) => toast.error(readError(e)),
  });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!busy) saveMessages(messages);
  }, [messages, busy]);

  useEffect(() => {
    if (!busy) textareaRef.current?.focus();
  }, [busy]);

  const send = (msg: PromptInputMessage) => {
    const text = msg.text.trim();
    if (!text && msg.files.length === 0) return;
    if (error) clearError();
    void sendMessage(
      {
        text: text || "Recebi este erro no sistema. O que significa e como resolvo?",
        files: msg.files,
      },
      { body: { knowledge, tela } },
    );
  };

  const last = messages.at(-1);
  const waiting = status === "submitted" || (status === "streaming" && last?.role === "user");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b py-4">
        <img src="/favicon.png" alt="" className="size-10 rounded-xl bg-ink p-1.5" />
        <div className="flex-1">
          <h1 className="text-lg font-bold leading-tight">Assistente Future</h1>
          <p className="text-xs text-muted-foreground">
            {lessonTitle ? `Ajudando com: ${lessonTitle}` : "Tira dúvidas do sistema e lê prints de erro"}
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              stopChat();
              stop();
              setMessages([]);
              saveMessages([]);
            }}
          >
            <RotateCcw /> Limpar conversa
          </Button>
        )}
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-6 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <div className="mb-5 flex size-20 items-center justify-center rounded-3xl bg-hero shadow-elegant">
                <img src="/favicon.png" alt="" className="size-11" />
              </div>
              <h2 className="text-2xl font-bold">Como posso ajudar?</h2>
              <p className="mt-2 max-w-md text-muted-foreground">
                Pergunte qualquer coisa sobre o Emissor Future. Recebeu um erro? Clique em <b>Print do erro</b> ou cole a
                imagem (Ctrl+V) aqui embaixo.
              </p>
              <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send({ text: s, files: [] })}
                    className="rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-card transition-colors hover:border-primary"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className="group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                  {m.parts.map((p, i) => {
                    if (p.type === "text")
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{p.text}</MessageResponse>
                      ) : (
                        <p key={i} className="whitespace-pre-wrap">
                          {p.text}
                        </p>
                      );
                    if (p.type === "file" && p.mediaType.startsWith("image/"))
                      return <img key={i} src={p.url} alt="Print enviado" className="max-h-60 rounded-lg" />;
                    return null;
                  })}
                </MessageContent>
                {m.role === "assistant" && !(busy && m.id === last?.id) && (
                  <MessageActions>
                    <MessageAction
                      tooltip={speakingId === m.id ? "Parar áudio" : "Ouvir resposta"}
                      onClick={() => (speakingId === m.id ? stop() : speak(textOf(m), m.id))}
                    >
                      {speakingId === m.id ? <Square className="size-4" /> : <Volume2 className="size-4" />}
                    </MessageAction>
                    <MessageAction
                      tooltip="Copiar"
                      onClick={() => {
                        void navigator.clipboard.writeText(textOf(m));
                        toast.success("Resposta copiada");
                      }}
                    >
                      <Copy className="size-4" />
                    </MessageAction>
                  </MessageActions>
                )}
              </Message>
            ))
          )}
          {waiting && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Procurando no manual...</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && !busy && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{readError(error)}</span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="pb-4">
        <PromptInput onSubmit={send} accept="image/*" multiple maxFiles={4} maxFileSize={8 * 1024 * 1024}
          onError={(e) => toast.error(e.code === "max_file_size" ? "Imagem muito grande (máx. 8 MB)." : e.code === "accept" ? "Envie apenas imagens." : "Envie no máximo 4 imagens.")}
          className="rounded-2xl bg-card shadow-card"
        >
          <AttachmentList />
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            placeholder="Ex.: Como emito uma NFC-e? ou cole aqui o print do erro"
          />
          <PromptInputFooter>
            <PromptInputTools>
              <AttachButton />
            </PromptInputTools>
            <PromptInputSubmit status={status} onStop={stopChat} />
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          A IA pode errar. Para dúvidas fiscais específicas, confirme com sua contabilidade.
        </p>
      </div>
    </div>
  );
}
