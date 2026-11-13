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
        "Elementos da tela:",
        ...lesson.hotspots.map(
          (h, i) => `${i + 1}. ${h.title}: ${h.description}${h.tip ? ` Dica: ${h.tip}` : ""}`,
        ),
      );
    }
  }
  const text = parts.filter(Boolean).join("\n");
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

export function lessonCount(course: Course) {
  return orderedLessons(course).length;
}
