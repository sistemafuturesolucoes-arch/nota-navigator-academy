import { useEffect, useRef, useState } from "react";

import type { Hotspot } from "@/lib/course/types";
import { cn } from "@/lib/utils";

type Rect = Pick<Hotspot, "x" | "y" | "w" | "h">;
type Drag =
  | { kind: "draw"; x0: number; y0: number }
  | { kind: "move"; id: string; dx: number; dy: number; origin: Rect }
  | { kind: "resize"; id: string; origin: Rect };

const clamp = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const round = (v: number) => Math.round(v * 10) / 10;

/** Draw, move and resize explanation areas over a screenshot. Changes are committed once on pointer release. */
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
  onChange: (id: string, rect: Rect) => void;
  onCreate: (rect: Rect) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [imageUnavailable, setImageUnavailable] = useState(false);

  useEffect(() => {
    setImageUnavailable(false);
    setDrag(null);
    setDraft(null);
  }, [image]);

  const pct = (e: React.PointerEvent) => {
    const bounds = ref.current!.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - bounds.left) / bounds.width) * 100),
      y: clamp(((e.clientY - bounds.top) / bounds.height) * 100),
    };
  };

  const capture = (e: React.PointerEvent) => {
    if (ref.current && e.pointerId !== undefined) {
      try { ref.current.setPointerCapture(e.pointerId); } catch { /* pointer may already be captured */ }
    }
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-hotspot]")) return;
    capture(e);
    const p = pct(e);
    setDrag({ kind: "draw", x0: p.x, y0: p.y });
    setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    onSelect(null);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag || !ref.current) return;
    const p = pct(e);
    if (drag.kind === "draw") {
      setDraft({
        x: round(Math.min(drag.x0, p.x)),
        y: round(Math.min(drag.y0, p.y)),
        w: round(Math.abs(p.x - drag.x0)),
        h: round(Math.abs(p.y - drag.y0)),
      });
      return;
    }

    if (drag.kind === "move") {
      setDraft({
        x: round(clamp(p.x - drag.dx, 0, 100 - drag.origin.w)),
        y: round(clamp(p.y - drag.dy, 0, 100 - drag.origin.h)),
        w: drag.origin.w,
        h: drag.origin.h,
      });
    } else {
      setDraft({
        x: drag.origin.x,
        y: drag.origin.y,
        w: round(clamp(p.x - drag.origin.x, 1, 100 - drag.origin.x)),
        h: round(clamp(p.y - drag.origin.y, 1, 100 - drag.origin.y)),
      });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag || !draft) {
      setDrag(null);
      setDraft(null);
      return;
    }
    if (drag.kind === "draw") {
      if (draft.w > 1 && draft.h > 1) onCreate(draft);
    } else {
      onChange(drag.id, draft);
    }
    try {
      if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    } catch { /* capture can be released by the browser */ }
    setDrag(null);
    setDraft(null);
  };

  const onCancel = () => {
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
      onPointerCancel={onCancel}
    >
      {imageUnavailable ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="font-semibold">Print original indisponível</p>
          <p className="max-w-md text-sm text-muted-foreground">Este print ainda não está disponível no armazenamento publicado. Envie novamente a imagem original para continuar.</p>
        </div>
      ) : (
        <img src={image} alt="" onError={() => setImageUnavailable(true)} className="pointer-events-none block w-full" draggable={false} />
      )}
      {!imageUnavailable && hotspots.map((h, i) => {
        const sel = h.id === selectedId;
        const preview = drag && drag.kind !== "draw" && drag.id === h.id ? draft : null;
        const rect = preview ?? h;
        return (
          <div
            key={h.id}
            data-hotspot="true"
            className={cn(
              "absolute cursor-move rounded-md border-2",
              sel ? "z-20 border-lime bg-lime/15" : "z-10 border-primary/70 bg-primary/10 hover:border-primary",
            )}
            style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              capture(e);
              const p = pct(e);
              onSelect(h.id);
              setDrag({ kind: "move", id: h.id, dx: p.x - h.x, dy: p.y - h.y, origin: { x: h.x, y: h.y, w: h.w, h: h.h } });
              setDraft({ x: h.x, y: h.y, w: h.w, h: h.h });
            }}
          >
            <span className="pointer-events-none absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
              {i + 1}
            </span>
            {sel && (
              <span
                data-hotspot="true"
                className="absolute -bottom-1.5 -right-1.5 size-3 cursor-se-resize rounded-sm border-2 border-card bg-lime"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  capture(e);
                  setDrag({ kind: "resize", id: h.id, origin: { x: h.x, y: h.y, w: h.w, h: h.h } });
                  setDraft({ x: h.x, y: h.y, w: h.w, h: h.h });
                }}
              />
            )}
          </div>
        );
      })}
      {!imageUnavailable && draft && drag?.kind === "draw" && (
        <div
          className="pointer-events-none absolute z-30 rounded-md border-2 border-dashed border-lime bg-lime/20"
          style={{ left: `${draft.x}%`, top: `${draft.y}%`, width: `${draft.w}%`, height: `${draft.h}%` }}
        />
      )}
    </div>
  );
}
