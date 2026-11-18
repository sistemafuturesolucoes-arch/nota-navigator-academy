import { orderedLessons } from "./store";
import type { Course } from "./types";

const MAX_CHARS = 60000;

/** Plain-text knowledge base sent to the AI assistant so it answers from the manual. */
export function buildKnowledge(course: Course): string {
  const parts: string[] = [];
  for (const mod of course.modules) {
    parts.push(`# Módulo: ${mod.title} — ${mod.description}`);
    for (const id of mod.lessonIds) {
      const lesson = course.lessons[id];
      if (!lesson) continue;
      parts.push(
        `## Aula "${lesson.title}" (link: /aula/${lesson.id})`,
        lesson.path ? `Caminho no sistema: ${lesson.path}` : "",
        lesson.summary,
        lesson.content,
      );
      const screenshots = lesson.screenshots?.length
        ? lesson.screenshots
        : lesson.image
          ? [{ id: `screen-${lesson.id}`, image: lesson.image, caption: "", hotspots: lesson.hotspots }]
          : [];
      for (const [screenIndex, screenshot] of screenshots.entries()) {
        parts.push(
          `PRINT VISUAL [VISUAL:${lesson.id}:${screenshot.id}]`,
          `Etapa/legenda: ${screenshot.caption || `Tela ${screenIndex + 1} da aula`}`,
          `Imagem real: ${screenshot.image}`,
          "Elementos e posições neste print (coordenadas em porcentagem x, y, largura, altura):",
          ...(screenshot.hotspots ?? []).map(
            (h, i) => `${i + 1}. ${h.title} (x=${h.x}, y=${h.y}, largura=${h.w}, altura=${h.h}): ${h.description}${h.tip ? ` Dica: ${h.tip}` : ""}`,
          ),
        );
      }
    }
  }
  const text = parts.filter(Boolean).join("\n");
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

export function lessonCount(course: Course) {
  return orderedLessons(course).length;
}
