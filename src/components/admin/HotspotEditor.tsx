import { useEffect, useRef, useState } from "react";

import type { Hotspot } from "@/lib/course/types";
import { cn } from "@/lib/utils";

type Drag =
  | { kind: "draw"; x0: number; y0: number }
  | { kind: "move"; id: string; dx: number; dy: number }
  | { kind: "resize"; id: string };

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10) / 10;

/** Draw, move and resize explanation areas over a screenshot. */
export function HotspotEditor({
  image,
  hotspots,
  selectedId,
  onSelect,
  onChange,
  onCreate,
}: {
  image: string;
  hotspots: Hotspot[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, rect: Pick<Hotspot, "x" | "y" | "w" | "h">) => void;
  onCreate: (rect: Pick<Hotspot, "x" | "y" | "w" | "h">) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Pick<Hotspot, "x" | "y" | "w" | "h"> | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);

  useEffect(() => {
    setImageUnavailable(false);
  }, [image]);

  const pct = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = pct(e);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ kind: "draw", x0: p.x, y0: p.y });
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    onSelect(null);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = pct(e);
    if (drag.kind === "draw") {
      setDraft({
        x: Math.min(drag.x0, p.x),
        y: Math.min(drag.y0, p.y),
        w: Math.abs(p.x - drag.x0),
        h: Math.abs(p.y - drag.y0),
      });
    } else {
      const h = hotspots.find((s) => s.id === drag.id);
      if (!h) return;
      if (drag.kind === "move") {
        onChange(h.id, {
          x: round(clamp(p.x - drag.dx, 0, 100 - h.w)),
          y: round(clamp(p.y - drag.dy, 0, 100 - h.h)),
          w: h.w,
          h: h.h,
        });
      } else {
        onChange(h.id, { x: h.x, y: h.y, w: round(Math.max(1, p.x - h.x)), h: round(Math.max(1, p.y - h.y)) });
      }
    }
  };

  const onUp = () => {
    if (drag?.kind === "draw" && draft && draft.w > 1 && draft.h > 1) {
      onCreate({ x: round(draft.x), y: round(draft.y), w: round(draft.w), h: round(draft.h) });
    }
    setDrag(null);
    setDraft(null);
  };

  return (
    <div
      ref={ref}
      className="relative cursor-crosshair touch-none select-none overflow-hidden rounded-xl border bg-card"
      onPointerDown={imageUnavailable ? undefined : onDown}
      onPointerMove={imageUnavailable ? undefined : onMove}
      onPointerUp={imageUnavailable ? undefined : onUp}
    >
      {imageUnavailable ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="font-semibold">Print original indisponível</p>
          <p className="max-w-md text-sm text-muted-foreground">Este print ainda não foi incluído no repositório publicado. Use “Trocar print” para carregar a imagem original quando estiver disponível.</p>
        </div>
      ) : (
        <img src={image} alt="" onError={() => setImageUnavailable(true)} className="pointer-events-none block w-full" draggable={false} />
      )}
      {!imageUnavailable && hotspots.map((h, i) => {
        const sel = h.id === selectedId;
        return (
          <div
            key={h.id}
            className={cn(
              "absolute cursor-move rounded-md border-2",
              sel ? "z-20 border-lime bg-lime/15" : "z-10 border-primary/70 bg-primary/10 hover:border-primary",
            )}
            style={{ left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
              const p = pct(e);
              onSelect(h.id);
              setDrag({ kind: "move", id: h.id, dx: p.x - h.x, dy: p.y - h.y });
            }}
          >
            <span className="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
              {i + 1}
            </span>
            {sel && (
              <span
                className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-sm border-2 border-card bg-lime"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  setDrag({ kind: "resize", id: h.id });
                }}
              />
            )}
          </div>
        );
      })}
      {!imageUnavailable && draft && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border-2 border-dashed border-lime bg-lime/20"
          style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }}
        />
      )}
    </div>
  );
}
