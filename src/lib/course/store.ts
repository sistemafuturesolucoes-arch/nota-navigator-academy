import { useSyncExternalStore } from "react";

import { seedCourse } from "./seed";
import type { Course, Lesson, Module } from "./types";

/**
 * Course content and progress live in this browser until the external database is
 * connected. Every read/write goes through this module so swapping the storage later
 * only touches this file.
 */
const COURSE_KEY = "future-manual-course-v1";
const PROGRESS_KEY = "future-manual-progress-v1";

type Listener = () => void;

function createStore<T>(key: string, fallback: T) {
  let cache: T | undefined;
  const listeners = new Set<Listener>();

  const read = (): T => {
    if (cache !== undefined) return cache;
    if (typeof window === "undefined") return fallback;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      cache = fallback;
    }
    return cache;
  };

  const write = (next: T) => {
    cache = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (error) {
      console.error(error);
      throw new Error(
        "Não foi possível salvar: o armazenamento deste navegador está cheio. Use imagens menores ou conecte o banco de dados.",
      );
    }
    listeners.forEach((l) => l());
  };

  const reset = () => {
    cache = fallback;
    window.localStorage.removeItem(key);
    listeners.forEach((l) => l());
  };

  const subscribe = (l: Listener) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  const useValue = () => useSyncExternalStore(subscribe, read, () => fallback);

  return { read, write, reset, useValue };
}

const courseStore = createStore<Course>(COURSE_KEY, seedCourse);
const progressStore = createStore<string[]>(PROGRESS_KEY, []);

export const useCourse = courseStore.useValue;
export const useProgress = progressStore.useValue;

export function saveCourse(next: Course) {
  courseStore.write(next);
}
export function resetCourse() {
  courseStore.reset();
}

export function toggleLessonDone(lessonId: string, done: boolean) {
  const current = new Set(progressStore.read());
  if (done) current.add(lessonId);
  else current.delete(lessonId);
  progressStore.write([...current]);
}

export function orderedLessons(course: Course): Lesson[] {
  return course.modules.flatMap((m) =>
    m.lessonIds.map((id) => course.lessons[id]).filter((l): l is Lesson => Boolean(l)),
  );
}

export function moduleOf(course: Course, lessonId: string): Module | undefined {
  return course.modules.find((m) => m.lessonIds.includes(lessonId));
}

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
