import { Link } from "@tanstack/react-router";
import { CheckCircle2, Circle } from "lucide-react";

import { useCourse, useProgress } from "@/lib/course/store";
import { cn } from "@/lib/utils";

import { ModuleIcon } from "./ModuleIcon";

export function CourseNav({ activeLessonId }: { activeLessonId?: string }) {
  const course = useCourse();
  const done = new Set(useProgress());
  return (
    <nav className="space-y-6">
      {course.modules.map((m, mi) => (
        <div key={m.id}>
          <div className="mb-2 flex items-center gap-2 px-2">
            <ModuleIcon name={m.icon} className="size-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Módulo {mi + 1} · {m.title}
            </p>
          </div>
          {m.lessonIds.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">Em breve</p>
          ) : (
            <ul className="space-y-0.5">
              {m.lessonIds.map((id) => {
                const l = course.lessons[id];
                if (!l) return null;
                const isActive = id === activeLessonId;
                return (
                  <li key={id}>
                    <Link
                      to="/aula/$lessonId"
                      params={{ lessonId: id }}
                      search={{}}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/80 hover:bg-secondary",
                      )}
                    >
                      {done.has(id) ? (
                        <CheckCircle2 className={cn("size-4 shrink-0", isActive ? "text-lime" : "text-success")} />
                      ) : (
                        <Circle className="size-4 shrink-0 opacity-40" />
                      )}
                      <span className="line-clamp-2">{l.title}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </nav>
  );
}
