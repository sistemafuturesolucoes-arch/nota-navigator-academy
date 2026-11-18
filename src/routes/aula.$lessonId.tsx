import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye,
  Maximize2,
  MousePointerClick,
  Pause,
  Play,
  ScanSearch,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CourseNav } from "@/components/manual/CourseNav";
import { InteractiveScreen, narrationOf, type ScreenMode } from "@/components/manual/InteractiveScreen";
import { ListenButton } from "@/components/manual/ListenButton";
import { Md } from "@/components/manual/Md";
import { VideoEmbed } from "@/components/manual/VideoEmbed";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSpeech } from "@/hooks/use-speech";
import { moduleOf, orderedLessons, toggleLessonDone, useCourse, useProgress } from "@/lib/course/store";
import { cn } from "@/lib/utils";

type LessonSearch = { ponto?: string | undefined };

export const Route = createFileRoute("/aula/$lessonId")({
  validateSearch: (search: Record<string, unknown>): LessonSearch => ({
    ponto: typeof search["ponto"] === "string" ? search["ponto"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Aula — Manual Interativo Emissor Future" },
      { name: "description", content: "Tela do Emissor Future com cada botão e campo explicado, tour guiado e narração." },
      { property: "og:title", content: "Aula — Manual Interativo Emissor Future" },
      { property: "og:description", content: "Tela do Emissor Future com cada botão e campo explicado, tour guiado e narração." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LessonPage,
});

const MODES: { id: ScreenMode; label: string; icon: typeof Eye; hint: string }[] = [
  { id: "explore", label: "Explorar", icon: MousePointerClick, hint: "Clique nos números para ver o que cada item faz" },
  { id: "tour", label: "Tour guiado", icon: Play, hint: "O sistema destaca item por item, com narração" },
  { id: "xray", label: "Raio-X", icon: ScanSearch, hint: "Mostra o nome de todos os itens de uma vez" },
];

function LessonPage() {
  const { lessonId } = Route.useParams();
  const { ponto } = Route.useSearch();
  const navigate = useNavigate();
  const course = useCourse();
  const done = new Set(useProgress());
  const lesson = course.lessons[lessonId];
  const all = orderedLessons(course);
  const idx = all.findIndex((l) => l.id === lessonId);
  const prev = idx > 0 ? all[idx - 1] : undefined;
  const next = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : undefined;
  const mod = moduleOf(course, lessonId);

  const [mode, setMode] = useState<ScreenMode>("explore");
  const [activeId, setActiveId] = useState<string | null>(ponto ?? null);
  const screenshots = (Array.isArray(lesson?.screenshots) && lesson.screenshots.length
    ? lesson.screenshots
    : lesson?.image ? [{ id: `screen-${lesson.id}`, image: lesson.image, hotspots: lesson.hotspots }] : [])
    .filter((shot) => shot && typeof shot.image === "string" && shot.image.length > 0)
    .map((shot, index) => ({
      ...shot,
      id: typeof shot.id === "string" && shot.id ? shot.id : `screen-${lesson?.id}-${index + 1}`,
      hotspots: Array.isArray(shot.hotspots) ? shot.hotspots.filter((h) => h && typeof h.id === "string").map((h) => ({
        ...h,
        title: typeof h.title === "string" ? h.title : "Item sem título",
        description: typeof h.description === "string" ? h.description : "",
      })) : [],
    }));
  const [activeScreenshotId, setActiveScreenshotId] = useState<string | null>(screenshots[0]?.id ?? null);
  const activeScreenshot = screenshots.find((shot) => shot.id === activeScreenshotId) ?? screenshots[0];
  const [autoNarrate, setAutoNarrate] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { speak, stop } = useSpeech();
  const screenRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const syncFullscreen = () => setIsFullscreen(document.fullscreenElement === screenRef.current);
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () => document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);

  useEffect(() => {
    setActiveId(ponto ?? null);
    setActiveScreenshotId(screenshots[0]?.id ?? null);
    setMode("explore");
    setAutoNarrate(false);
    stop();
  }, [lessonId, ponto, stop]);

  const hotspots = activeScreenshot?.hotspots ?? lesson?.hotspots ?? [];
  const activeIndex = hotspots.findIndex((h) => h.id === activeId);

  const goTo = useCallback(
    (i: number) => {
      const h = hotspots[i];
      if (h) setActiveId(h.id);
    },
    [hotspots],
  );

  // Auto narration: speak current item, advance when it ends.
  useEffect(() => {
    if (mode !== "tour" || !autoNarrate) return;
    const h = hotspots[activeIndex];
    if (!h) return;
    speak(narrationOf(h), `tour-${h.id}`, () => {
      if (activeIndex < hotspots.length - 1) goTo(activeIndex + 1);
      else setAutoNarrate(false);
    });
  }, [mode, autoNarrate, activeIndex, hotspots, speak, goTo]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
      if (e.key === "ArrowRight" && activeIndex < hotspots.length - 1) goTo(activeIndex + 1);
      if (e.key === "ArrowLeft" && activeIndex > 0) goTo(activeIndex - 1);
      if (e.key === "Escape") {
        setActiveId(null);
        if (mode === "tour") setMode("explore");
        setAutoNarrate(false);
        stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, hotspots.length, goTo, mode, stop]);

  const changeMode = (m: ScreenMode) => {
    setMode(m);
    stop();
    setAutoNarrate(false);
    if (m === "tour") setActiveId(hotspots[0]?.id ?? null);
  };

  if (!lesson) {
    return (
      <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-bold">Aula não encontrada</h1>
        <p className="text-muted-foreground">Esta aula pode ter sido removida no painel.</p>
        <Button asChild>
          <Link to="/">Ver todas as aulas</Link>
        </Button>
      </main>
    );
  }

  const isDone = done.has(lesson.id);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 overflow-y-auto border-r bg-card/60 p-4 lg:block">
        <CourseNav activeLessonId={lesson.id} />
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              {mod?.title} · Aula {idx + 1} de {all.length}
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{lesson.title}</h1>
            <p className="mt-1 max-w-2xl text-muted-foreground">{lesson.summary}</p>
            {lesson.path && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-secondary-foreground">
                Onde fica: {lesson.path}
              </p>
            )}
          </div>
          <Button
            variant={isDone ? "secondary" : "lime"}
            onClick={() => toggleLessonDone(lesson.id, !isDone)}
          >
            <CheckCircle2 />
            {isDone ? "Aula concluída" : "Marcar como concluída"}
          </Button>
        </div>

        {screenshots.length ? (
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border bg-card p-2">
              <Button type="button" variant="outline" size="sm"
                disabled={screenshots.findIndex((shot) => shot.id === activeScreenshot?.id) <= 0}
                onClick={() => {
                  const current = screenshots.findIndex((shot) => shot.id === activeScreenshot?.id);
                  const previous = screenshots[current - 1];
                  if (previous) { setActiveScreenshotId(previous.id); setActiveId(null); setMode("explore"); setAutoNarrate(false); stop(); }
                }}>
                <ArrowLeft /> Tela anterior
              </Button>
              <div className="min-w-0 flex-1 text-center">
                <p className="text-sm font-semibold">Tela {Math.max(0, screenshots.findIndex((shot) => shot.id === activeScreenshot?.id)) + 1} de {screenshots.length}</p>
                <p className="truncate text-xs text-muted-foreground">{activeScreenshot?.caption || "Etapa da aula"}</p>
              </div>
              <Button type="button" variant="outline" size="sm"
                disabled={screenshots.findIndex((shot) => shot.id === activeScreenshot?.id) >= screenshots.length - 1}
                onClick={() => {
                  const current = screenshots.findIndex((shot) => shot.id === activeScreenshot?.id);
                  const following = screenshots[current + 1];
                  if (following) { setActiveScreenshotId(following.id); setActiveId(null); setMode("explore"); setAutoNarrate(false); stop(); }
                }}>
                Próxima tela <ArrowRight />
              </Button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl border bg-card p-1 shadow-card" role="tablist" aria-label="Modo de visualização">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === m.id}
                    title={m.hint}
                    onClick={() => changeMode(m.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      mode === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <m.icon className="size-4" />
                    {m.label}
                  </button>
                ))}
              </div>
              {mode === "tour" && (
                <Button
                  variant={autoNarrate ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (autoNarrate) {
                      setAutoNarrate(false);
                      stop();
                    } else {
                      if (activeIndex < 0) goTo(0);
                      setAutoNarrate(true);
                    }
                  }}
                >
                  {autoNarrate ? <Pause /> : <Play />}
                  {autoNarrate ? "Pausar narração" : "Narrar tour"}
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                {MODES.find((m) => m.id === mode)?.hint} · {hotspots.length} itens
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => screenRef.current?.requestFullscreen?.()}
              >
                <Maximize2 /> Tela cheia
              </Button>
            </div>
            <div ref={screenRef} className={cn("bg-background", isFullscreen && "fixed inset-0 z-[9999] flex h-screen w-screen items-center justify-center overflow-auto p-6")}>
              <div className={cn("w-full", isFullscreen && "flex h-full items-center justify-center")}>
                <InteractiveScreen
                  image={activeScreenshot?.image ?? lesson.image ?? ""}
                  alt={`Tela: ${lesson.title}`}
                  hotspots={hotspots}
                  mode={mode}
                  activeId={activeId}
                  onSelect={setActiveId}
                  fullscreen={isFullscreen}
                  onPrev={() => goTo(activeIndex - 1)}
                  onNext={() => goTo(activeIndex + 1)}
                />
              </div>
            </div>
          </section>
        ) : null}

        <Tabs defaultValue={lesson.video ? "video" : "passos"} className="mb-8">
          <TabsList>
            <TabsTrigger value="passos">Passo a passo</TabsTrigger>
            <TabsTrigger value="itens">Itens desta tela ({hotspots.length})</TabsTrigger>
            {lesson.video && <TabsTrigger value="video">Vídeo</TabsTrigger>}
          </TabsList>
          <TabsContent value="passos" className="rounded-xl border bg-card p-5 shadow-card">
            <div className="mb-3 flex justify-end">
              <ListenButton text={lesson.content} id={`lesson-${lesson.id}`} label="Ouvir passo a passo" />
            </div>
            <Md className="text-[15px]">{lesson.content}</Md>
          </TabsContent>
          <TabsContent value="itens">
            <ol className="grid gap-2 md:grid-cols-2">
              {hotspots.map((h, i) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (mode === "tour") setMode("explore");
                      setActiveId(h.id);
                      screenRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "flex w-full gap-3 rounded-xl border bg-card p-3 text-left shadow-card transition-colors hover:border-primary",
                      activeId === h.id && "border-primary",
                    )}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold text-lime-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{h.title}</span>
                      <span className="line-clamp-2 text-sm text-muted-foreground">
                        {h.description.replace(/\*\*/g, "")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </TabsContent>
          {lesson.video && (
            <TabsContent value="video">
              <VideoEmbed url={lesson.video} title={lesson.title} lessonId={lesson.id} />
            </TabsContent>
          )}
        </Tabs>

        <div className="mb-8 flex flex-col items-start gap-4 rounded-2xl bg-hero p-5 text-ink-foreground sm:flex-row sm:items-center">
          <Bot className="size-8 shrink-0 text-lime" />
          <div className="flex-1">
            <p className="font-display font-semibold">Ainda com dúvida nesta tela?</p>
            <p className="text-sm text-ink-muted">Pergunte ao assistente ou envie o print do erro que apareceu.</p>
          </div>
          <Button variant="lime" onClick={() => navigate({ to: "/assistente", search: { tela: lesson.id } })}>
            Perguntar à IA
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-5">
          {prev ? (
            <Button variant="outline" asChild>
              <Link to="/aula/$lessonId" params={{ lessonId: prev.id }} search={{}}>
                <ArrowLeft /> <span className="max-w-40 truncate">{prev.title}</span>
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button
              onClick={() => {
                toggleLessonDone(lesson.id, true);
                navigate({ to: "/aula/$lessonId", params: { lessonId: next.id }, search: {} });
              }}
            >
              <span className="max-w-48 truncate">Próxima: {next.title}</span> <ArrowRight />
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
