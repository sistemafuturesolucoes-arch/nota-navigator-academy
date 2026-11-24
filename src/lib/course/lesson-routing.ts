import type { Course } from "./types";

/** Normaliza IDs e títulos para aceitar URLs legadas geradas a partir do nome da aula. */
export function normalizeLessonRouteSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Resolve primeiro pelo ID canônico e depois pelo título, sem alterar os IDs salvos. */
export function resolveLessonId(course: Course, requested: string): string | undefined {
  if (course.lessons[requested]) return requested;

  const normalized = normalizeLessonRouteSegment(requested);
  if (!normalized) return undefined;

  return Object.values(course.lessons).find((lesson) =>
    normalizeLessonRouteSegment(lesson.id) === normalized ||
    normalizeLessonRouteSegment(lesson.title) === normalized
  )?.id;
}
