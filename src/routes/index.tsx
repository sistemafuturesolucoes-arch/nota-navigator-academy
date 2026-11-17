import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bot, Camera, CheckCircle2, Clock3, Play, ScanSearch, Volume2 } from "lucide-react";
import { useState } from "react";

import dashboard from "@/assets/prints/dashboard.png.asset.json";
import { ModuleIcon } from "@/components/manual/ModuleIcon";
import { SearchCommand } from "@/components/manual/SearchCommand";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { orderedLessons, useCourse, useProgress } from "@/lib/course/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Manual Interativo do Emissor Future — Aprenda clicando" },
      {
        name: "description",
        content: "Curso interativo do Emissor Future: cada botão explicado, tour guiado com narração e assistente de IA que lê o print do seu erro.",
      },
      { property: "og:title", content: "Manual Interativo do Emissor Future" },
      {
        property: "og:description",
        content: "Cada botão explicado, tour guiado com narração e assistente de IA que lê o print do seu erro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const FEATURES = [
  { icon: ScanSearch, title: "Raio-X da tela", text: "Veja o nome de todos os botões de uma vez." },
  { icon: Play, title: "Tour narrado", text: "O sistema destaca item por item e explica em voz alta." },
  { icon: Camera, title: "Print do erro", text: "Mande o print e a IA diz o que fazer." },
  { icon: Volume2, title: "Tudo em áudio", text: "Ouça qualquer explicação com um clique." },
];

function Home() {
  const [heroImageUnavailable, setHeroImageUnavailable] = useState(false);
  const course = useCourse();
  const done = new Set(useProgress());
  const lessons = orderedLessons(course);
  const navigate = useNavigate();
  const completed = lessons.filter((l) => done.has(l.id)).length;
  const pct = lessons.length ? Math.round((completed / lessons.length) * 100) : 0;
  const nextLesson = lessons.find((l) => !done.has(l.id)) ?? lessons[0];

  return (
    <main className="flex-1">
      <section className="bg-hero text-ink-foreground">
        <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 py-14 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:py-20">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-ink-foreground/20 px-3 py-1 text-xs font-semibold text-lime">
              <span className="size-1.5 rounded-full bg-lime" /> Central de aprendizado Future
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.05] md:text-6xl">
              Aprenda o Emissor
              <br />
              clicando em <span className="text-lime">cada botão.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">
              Telas reais do sistema com explicação de cada campo, tour guiado com narração e um assistente de IA que
              tira qualquer dúvida na hora.
            </p>
            <div className="mt-8 max-w-xl">
              <SearchCommand trigger="hero" />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              {nextLesson && (
                <Button variant="lime" size="xl" asChild>
                  <Link to="/aula/$lessonId" params={{ lessonId: nextLesson.id }} search={{}}>
                    {completed > 0 ? "Continuar de onde parei" : "Começar o curso"} <ArrowRight />
                  </Link>
                </Button>
              )}
              <Button variant="glass" size="xl" onClick={() => navigate({ to: "/assistente", search: {} })}>
                <Bot /> Perguntar à IA
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="relative rotate-1 overflow-hidden rounded-2xl border border-ink-foreground/15 bg-card shadow-elegant">
              {heroImageUnavailable ? (
                <div className="flex min-h-[280px] flex-col items-center justify-center gap-2 bg-ink/90 p-8 text-center text-ink-foreground">
                  <p className="font-semibold">Print original do painel indisponível</p>
                  <p className="max-w-sm text-sm text-ink-muted">O arquivo da tela ainda não está incluído na publicação independente.</p>
                </div>
              ) : (
                <img src={course.lessons.dashboard?.image || dashboard.url} alt="Painel do Emissor Future" onError={() => setHeroImageUnavailable(true)} className="block w-full" />
              )}
              {[
                { x: 6.4, y: 16.4, w: 22.5, h: 10.8, n: 1 },
                { x: 0, y: 27, w: 5, h: 13.6, n: 2 },
                { x: 52.8, y: 41, w: 45.3, h: 46.6, n: 3 },
              ].map((s) => (
                <span
                  key={s.n}
                  className="absolute rounded-md border-2 border-lime"
                  style={{ left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` }}
                >
                  <span className="animate-hotspot absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
                    {s.n}
                  </span>
                </span>
              ))}
            </div>
            <div className="absolute -bottom-6 left-4 max-w-64 rounded-xl border bg-popover p-3 text-popover-foreground shadow-elegant md:-left-6">
              <p className="text-xs font-bold text-primary">1 · Notas Eletrônicas (NF-e)</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Total de NF-e emitidas. O botão Emitir NFe abre uma nova nota.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 lg:px-8">
        <div className="-mt-8 grid gap-3 rounded-2xl border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 p-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <f.icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1400px] px-4 py-14 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">Conteúdo do curso</h2>
            <p className="mt-1 text-muted-foreground">
              {course.modules.length} módulos · {lessons.length} aulas
            </p>
          </div>
          <div className="w-full max-w-xs">
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-semibold">Seu progresso</span>
              <span className="text-muted-foreground">
                {completed}/{lessons.length} · {pct}%
              </span>
            </div>
            <Progress value={pct} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {course.modules.map((m, mi) => {
            const mods = m.lessonIds.map((id) => course.lessons[id]).filter((l) => l !== undefined);
            const cover = mods.find((l) => l.image)?.image;
            return (
              <article key={m.id} className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-card">
                <div className="relative aspect-[16/7] overflow-hidden bg-hero">
                  {cover ? (
                    <img src={cover} alt="" className="size-full object-cover object-left-top opacity-90" />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ModuleIcon name={m.icon} className="size-12 text-lime" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-ink-foreground">
                    Módulo {mi + 1}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="flex items-center gap-2 text-lg font-bold">
                    <ModuleIcon name={m.icon} className="size-5 text-primary" /> {m.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{m.description}</p>
                  {mods.length === 0 ? (
                    <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock3 className="size-4" /> Aulas em breve
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-1">
                      {mods.map((l) => (
                        <li key={l.id}>
                          <Link
                            to="/aula/$lessonId"
                            params={{ lessonId: l.id }}
                            search={{}}
                            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary"
                          >
                            <CheckCircle2
                              className={done.has(l.id) ? "size-4 text-success" : "size-4 text-border"}
                            />
                            <span className="flex-1">{l.title}</span>
                            <span className="text-xs text-muted-foreground">{l.hotspots.length} itens</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
