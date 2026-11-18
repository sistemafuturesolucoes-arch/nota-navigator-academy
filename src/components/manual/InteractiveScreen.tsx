import { ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { Hotspot } from "@/lib/course/types";
import { cn } from "@/lib/utils";

import { ListenButton } from "./ListenButton";
import { Md } from "./Md";

export type ScreenMode = "explore" | "tour" | "xray";

type Props = {
  image: string;
  alt: string;
  hotspots: Hotspot[];
  mode: ScreenMode;
  activeId: string | null;
  onSelect: (id: string | null) => void;
  onNext?: (() => void) | undefined;
  onPrev?: (() => void) | undefined;
};

export function narrationOf(h: Hotspot) {
  return `${h.title}. ${h.description}${h.tip ? ` Dica: ${h.tip}` : ""}`;
}

export function InteractiveScreen({
  image,
  alt,
  hotspots,
  mode,
  activeId,
  onSelect,
  onNext,
  onPrev,
}: Props) {
  const activeIndex = hotspots.findIndex((h) => h.id === activeId);
  const active = activeIndex >= 0 ? hotspots[activeIndex] : undefined;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);

  useEffect(() => {
    setImageUnavailable(false);
  }, [image]);

  useEffect(() => {
    if (!active || !wrapRef.current) return;
    const el = wrapRef.current.querySelector<HTMLElement>(`[data-hotspot="${active.id}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  const showMarkers = mode !== "tour";

  return (
    <div ref={wrapRef} className="relative inline-block w-fit max-w-full align-top">
      <div
        className="relative inline-block w-fit max-w-full overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border"
        onClick={() => mode !== "tour" && onSelect(null)}
      >
        {imageUnavailable ? (
          <div role="img" aria-label={alt} className="flex min-h-[280px] flex-col items-center justify-center gap-3 bg-muted/40 p-8 text-center">
            <div className="text-lg font-semibold">Print original indisponível</div>
            <p className="max-w-md text-sm text-muted-foreground">A imagem desta tela ainda não está incluída nos arquivos publicados. O conteúdo e as explicações da aula continuam disponíveis.</p>
          </div>
        ) : (
          <img src={image} alt={alt} onError={() => setImageUnavailable(true)} className="block h-auto w-auto max-w-full select-none" draggable={false} />
        )}

        {!imageUnavailable && mode === "tour" && !active && <div className="absolute inset-0 bg-[var(--spotlight-veil)]" />}

        {!imageUnavailable && hotspots.map((h, i) => {
          const isActive = h.id === activeId;
          if (mode === "tour" && !isActive) return null;
          return (
            <button
              key={h.id}
              type="button"
              data-hotspot={h.id}
              aria-label={`${i + 1}. ${h.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(isActive && mode !== "tour" ? null : h.id);
              }}
              className={cn(
                "group absolute rounded-md transition-all duration-300 focus-visible:outline-none",
                isActive
                  ? "z-20 border-2 border-lime shadow-[var(--shadow-lime)]"
                  : "z-10 border-2 border-transparent hover:border-lime hover:bg-lime/10",
                mode === "xray" && !isActive && "border-dashed border-primary/70 bg-primary/5",
                mode === "tour" && isActive && "spotlight-veil",
              )}
              style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
            >
              {showMarkers && (
                <span
                  className={cn(
                    "absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full border-2 border-card bg-lime text-[10px] font-bold text-lime-foreground",
                    !activeId && mode === "explore" && "animate-hotspot",
                    isActive && "bg-primary text-primary-foreground",
                  )}
                >
                  {i + 1}
                </span>
              )}
              {mode === "xray" && (
                <span className="pointer-events-none absolute left-3 top-full z-30 mt-1 max-w-48 truncate rounded bg-ink px-1.5 py-0.5 text-[10px] font-semibold text-ink-foreground">
                  {h.title}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active && !imageUnavailable && (
        <HotspotCard
          hotspot={active}
          index={activeIndex}
          total={hotspots.length}
          onClose={() => onSelect(null)}
          onNext={onNext}
          onPrev={onPrev}
        />
      )}
    </div>
  );
}

function HotspotCard({
  hotspot,
  index,
  total,
  onClose,
  onNext,
  onPrev,
}: {
  hotspot: Hotspot;
  index: number;
  total: number;
  onClose: () => void;
  onNext?: (() => void) | undefined;
  onPrev?: (() => void) | undefined;
}) {
  const below = hotspot.y + hotspot.h < 58;
  const alignRight = hotspot.x + hotspot.w / 2 > 55;
  const style: React.CSSProperties = below
    ? { top: `calc(${hotspot.y + hotspot.h}% + 12px)` }
    : { bottom: `calc(${100 - hotspot.y}% + 12px)` };
  if (alignRight) style.right = `${Math.max(0, 100 - hotspot.x - hotspot.w)}%`;
  else style.left = `${Math.max(0, hotspot.x)}%`;

  return (
    <div
      key={hotspot.id}
      role="dialog"
      aria-label={hotspot.title}
      className="animate-float-in relative z-40 mt-3 w-full rounded-xl border bg-popover p-4 text-popover-foreground shadow-elegant md:absolute md:mt-0 md:w-[22rem]"
      style={typeof window !== "undefined" && window.innerWidth >= 768 ? style : undefined}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
          {index + 1}
        </span>
        <h3 className="flex-1 pt-0.5 text-base font-semibold leading-tight">{hotspot.title}</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Fechar">
          <X />
        </Button>
      </div>
      <Md>{hotspot.description}</Md>
      {hotspot.tip && (
        <p className="mt-3 flex gap-2 rounded-lg bg-lime/25 px-3 py-2 text-xs text-foreground">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0" />
          {hotspot.tip}
        </p>
      )}
      <div className="mt-4 flex items-center justify-between gap-2">
        <ListenButton text={narrationOf(hotspot)} id={`hs-${hotspot.id}`} />
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">
            {index + 1} de {total}
          </span>
          <Button variant="outline" size="icon-xs" onClick={onPrev} disabled={index === 0} aria-label="Anterior">
            <ChevronLeft />
          </Button>
          <Button size="icon-xs" onClick={onNext} disabled={index === total - 1} aria-label="Próximo">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
