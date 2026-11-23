import { BookOpen, MousePointerClick, Search } from "lucide-react";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { orderedLessons, useCourse } from "@/lib/course/store";
import { cn } from "@/lib/utils";

/** "Onde fica?" — search every button and field of every screen. */
export function SearchCommand({ trigger }: { trigger: "bar" | "hero" }) {
  const [open, setOpen] = useState(false);
  const course = useCourse();
  const lessons = orderedLessons(course);

  useEffect(() => {
    if (trigger !== "bar") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trigger]);

  const go = (lessonId: string, ponto?: string) => {
    setOpen(false);
    window.location.assign(`/manual/aula/${encodeURIComponent(lessonId)}${ponto ? `?ponto=${encodeURIComponent(ponto)}` : ""}`);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-3 text-left transition-colors",
          trigger === "bar"
            ? "h-9 w-full max-w-72 rounded-lg border border-sidebar-border bg-sidebar-accent px-3 text-sm text-ink-muted hover:text-ink-foreground"
            : "h-14 w-full rounded-2xl border border-ink-foreground/20 bg-ink-foreground/10 px-5 text-base text-ink-foreground/80 backdrop-blur hover:bg-ink-foreground/15",
        )}
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">
          {trigger === "bar" ? "Onde fica...?" : "Onde fica o botão...? Ex.: NCM, Novo Cliente, Salvar"}
        </span>
        {trigger === "bar" && (
          <kbd className="hidden rounded border border-sidebar-border px-1.5 text-[10px] sm:inline">Ctrl K</kbd>
        )}
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Digite o nome de um botão, campo ou tela..." />
        <CommandList>
          <CommandEmpty>Nada encontrado. Tente perguntar ao Assistente IA.</CommandEmpty>
          <CommandGroup heading="Telas">
            {lessons.map((l) => (
              <CommandItem key={l.id} value={`tela ${l.title} ${l.path ?? ""}`} onSelect={() => go(l.id)}>
                <BookOpen className="text-primary" />
                <span className="flex-1">{l.title}</span>
                <span className="text-xs text-muted-foreground">{l.path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Botões e campos">
            {lessons.flatMap((l) =>
              l.hotspots.map((h) => (
                <CommandItem
                  key={`${l.id}-${h.id}`}
                  value={`${h.title} ${l.title} ${h.description.slice(0, 80)}`}
                  onSelect={() => go(l.id, h.id)}
                >
                  <MousePointerClick className="text-primary" />
                  <span className="flex-1">{h.title}</span>
                  <span className="text-xs text-muted-foreground">{l.title}</span>
                </CommandItem>
              )),
            )}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
