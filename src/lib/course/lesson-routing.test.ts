import { describe, expect, it } from "vitest";

import type { Course } from "./types";
import { normalizeLessonRouteSegment, resolveLessonId } from "./lesson-routing";

const course = {
  version: 1,
  modules: [{ id: "cadastros", title: "Cadastros", description: "", icon: "BookOpen", lessonIds: ["cliente-cadastro", "servico-cadastro"] }],
  lessons: {
    "cliente-cadastro": { id: "cliente-cadastro", moduleId: "cadastros", title: "Cadastrar cliente", summary: "", content: "", hotspots: [] },
    "servico-cadastro": { id: "servico-cadastro", moduleId: "cadastros", title: "Cadastrar serviço", summary: "", content: "", hotspots: [] },
  },
} satisfies Course;

describe("lesson route compatibility", () => {
  it("keeps canonical database IDs unchanged", () => {
    expect(resolveLessonId(course, "cliente-cadastro")).toBe("cliente-cadastro");
  });

  it("resolves legacy title-based URLs", () => {
    expect(resolveLessonId(course, "cadastrar-cliente")).toBe("cliente-cadastro");
    expect(resolveLessonId(course, "cadastrar-servico")).toBe("servico-cadastro");
  });

  it("normalizes accents and repeated separators", () => {
    expect(normalizeLessonRouteSegment("  Cadastrar   serviço! ")).toBe("cadastrar-servico");
  });

  it("does not guess when no lesson matches", () => {
    expect(resolveLessonId(course, "aula-inexistente")).toBeUndefined();
  });
});
