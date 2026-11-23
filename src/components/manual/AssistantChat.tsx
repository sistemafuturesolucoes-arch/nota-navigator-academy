import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { AlertCircle, Copy, ExternalLink, FileText, ImagePlus, RotateCcw, Square, Volume2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { InteractiveScreen } from "@/components/manual/InteractiveScreen";
import type { LessonScreenshot } from "@/lib/course/types";
import { useCourse } from "@/lib/course/store";

const CHAT_KEY = "future-manual-chat-v1";
const CHAT_ID = "assistente-future";
const MANUAL_SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const MANUAL_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const AI_ASSISTANT_URL = `${MANUAL_SUPABASE_URL}/functions/v1/ai-assistant`;

const SUGGESTIONS = [
  "Quero consultar os dados cadastrais de uma empresa. Me peça o CNPJ.",
  "Quero conferir um documento fiscal antes de emitir. Como faço?",
  "Como resolvo uma rejeição da SEFAZ?",
  "Como configuro a tributação de um produto no grupo tributário?",
  "Como emito um CT-e ou MDF-e?",
  "Como cadastrar um cliente e preencher os dados corretamente?",
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
  // Persistir somente texto necessário para restaurar a conversa. Não guardar
  // metadados grandes de anexos nem um histórico ilimitado no armazenamento local.
  const slim = messages.slice(-20).map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap((part) => {
      if (part.type === "file") return [{ type: "text" as const, text: "📎 Arquivo enviado" }];
      if (part.type === "text") return [{ type: "text" as const, text: part.text.slice(0, 8000) }];
      return [];
    }),
  }));
  try {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify(slim));
  } catch (error) {
    console.warn("Não foi possível salvar o histórico do assistente neste navegador.", error);
    try { window.localStorage.removeItem(CHAT_KEY); } catch { /* storage unavailable */ }
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
    .map((p) => p.text.replace(/\[VISUAL:[^\]]+\]|\[ERROR_MEDIA_(?:IMAGE|VIDEO):[^\]]+\]/g, ""))
    .join("\n");
}

function AssistantVisual({ lessonTitle, screenshot }: { lessonTitle: string; screenshot: LessonScreenshot }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <ImagePlus className="size-4 text-primary" />
        <span>Veja esta etapa: {screenshot.caption || lessonTitle}</span>
      </div>
      <InteractiveScreen
        image={screenshot.image}
        alt={`Print de referência: ${lessonTitle}`}
        hotspots={screenshot.hotspots ?? []}
        mode="xray"
        activeId={activeId}
        onSelect={setActiveId}
      />
      <p className="text-xs text-muted-foreground">Clique nos destaques numerados para abrir a explicação de cada parte da tela.</p>
    </section>
  );
}

function AssistantResponse({ text, course }: { text: string; course: ReturnType<typeof useCourse> }) {
  type Part =
    | { type: "text"; value: string; key: string }
    | { type: "visual"; lessonId: string; screenshotId: string; key: string }
    | { type: "media"; mediaType: "image" | "video"; url: string; key: string };
  const token = /\[VISUAL:([^:\]]+):([^\]]+)\]|\[ERROR_MEDIA_(IMAGE|VIDEO):([^\]]+)\]/g;
  const parts: Part[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = token.exec(text)) !== null) {
    if (match.index > cursor) parts.push({ type: "text", value: text.slice(cursor, match.index), key: "text-" + cursor });
    if (match[1] && match[2]) {
      parts.push({ type: "visual", lessonId: match[1], screenshotId: match[2], key: "visual-" + match.index });
    } else if (match[3] && match[4]) {
      const url = match[4];
      if (url.startsWith("https://itbppoailqkuxajesgys.supabase.co/storage/v1/object/sign/error-media/")) {
        parts.push({ type: "media", mediaType: match[3] === "IMAGE" ? "image" : "video", url, key: "media-" + match.index });
      }
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: "text", value: text.slice(cursor), key: "text-" + cursor });
  if (parts.length === 0) return <MessageResponse>{text}</MessageResponse>;

  return (
    <div className="space-y-3">
      {parts.map((part) => {
        if (part.type === "text") return part.value.trim() ? <MessageResponse key={part.key}>{part.value}</MessageResponse> : null;
        if (part.type === "media") {
          return part.mediaType === "image"
            ? <figure key={part.key} className="overflow-hidden rounded-xl border bg-card p-2"><img src={part.url} alt="Imagem de apoio para resolver o erro" loading="lazy" className="max-h-[520px] w-full rounded-lg object-contain" /></figure>
            : <div key={part.key} className="overflow-hidden rounded-xl border bg-card p-2"><video src={part.url} controls preload="metadata" className="max-h-[520px] w-full rounded-lg" aria-label="Vídeo de apoio para resolver o erro" /></div>;
        }
        const lesson = course.lessons[part.lessonId];
        const screenshots = lesson?.screenshots?.length
          ? lesson.screenshots
          : lesson?.image
            ? [{ id: "screen-" + lesson.id, image: lesson.image, caption: "", hotspots: lesson.hotspots }]
            : [];
        const screenshot = screenshots.find((item) => item.id === part.screenshotId);
        if (!lesson || !screenshot?.image) return null;
        return <AssistantVisual key={part.key} lessonTitle={lesson.title} screenshot={screenshot} />;
      })}
    </div>
  );
}

function AttachButton() {
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton onClick={() => attachments.openFileDialog()} aria-label="Enviar print ou documento">
      <ImagePlus className="size-4" />
      <span className="text-xs">Print ou documento</span>
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
    transport: new DefaultChatTransport({
      // A rota /manual/api/chat caía no fallback SPA da Vercel e devolvia HTML.
      // Chamar a Edge Function diretamente evita esse rewrite e mantém Gemini/segredos no servidor.
      api: AI_ASSISTANT_URL,
      headers: { apikey: MANUAL_SUPABASE_PUBLISHABLE_KEY },
    }),
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
                Pergunte qualquer coisa sobre o Emissor Future. Envie prints, XML de NF-e/CT-e/MDF-e ou PDF para uma pré-análise antes de emitir.</p>
              <div className="mt-6 w-full max-w-2xl">
                <p className="mb-3 text-sm font-semibold">Sugestões para começar</p>
                <div className="grid gap-2 sm:grid-cols-2">
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
            </div>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent className="group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                  {m.parts.map((p, i) => {
                    if (p.type === "text")
                      return m.role === "assistant" ? (
                        <AssistantResponse key={i} text={p.text} course={course} />
                      ) : (
                        <p key={i} className="whitespace-pre-wrap">
                          {p.text}
                        </p>
                      );
                    if (p.type === "file" && p.mediaType.startsWith("image/"))
                      return <img key={i} src={p.url} alt="Print enviado" className="max-h-60 rounded-lg" />;
                    if (p.type === "file")
                      return (
                        <div key={i} className="flex items-center gap-2 rounded-lg border bg-background/60 px-3 py-2 text-sm">
                          <FileText className="size-4 shrink-0" />
                          <span className="truncate">{p.filename || "Documento anexado"}</span>
                        </div>
                      );
                    if (p.type === "source-url")
                      return (
                        <a key={i} href={p.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-xs text-primary underline-offset-4 hover:underline">
                          <ExternalLink className="size-3 shrink-0" />
                          <span className="truncate">{p.title || p.url}</span>
                        </a>
                      );
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
        <PromptInput onSubmit={send} accept="image/*,.xml,.txt,.pdf,application/xml,text/xml,application/pdf,text/plain" multiple maxFiles={4} maxFileSize={8 * 1024 * 1024}
          onError={(e) => toast.error(e.code === "max_file_size" ? "Imagem muito grande (máx. 8 MB)." : e.code === "accept" ? "Envie imagens, XML, TXT ou PDF." : "Envie no máximo 4 arquivos.")}
          className="rounded-2xl bg-card shadow-card"
        >
          <AttachmentList />
          <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            placeholder="Pergunte sobre o sistema ou anexe um print, XML ou PDF para conferir"
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
