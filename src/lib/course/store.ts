import { useSyncExternalStore } from "react";

import { seedCourse } from "./seed";
import type { Course, Lesson, LessonScreenshot, Module } from "./types";

const COURSE_KEY = "future-manual-course-v1";
const PROGRESS_KEY = "future-manual-progress-v1";
const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const SUPABASE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const ADMIN_AUTH_URL = `${SUPABASE_URL}/functions/v1/admin-auth`;
const ADMIN_SESSION_KEY = "future-manual-admin-session-v1";

type StoredAdminSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
};

let refreshInFlight: Promise<string> | null = null;

async function refreshAdminAccessToken(): Promise<string> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (typeof window === "undefined") throw new Error("Sessão administrativa indisponível.");
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) throw new Error("Sua sessão expirou. Entre novamente no painel para salvar as alterações.");
    let saved: StoredAdminSession;
    try { saved = JSON.parse(raw) as StoredAdminSession; } catch {
      throw new Error("Não foi possível recuperar sua sessão. Entre novamente no painel.");
    }
    if (!saved.refresh_token) throw new Error("Sua sessão expirou. Entre novamente no painel para salvar as alterações.");

    const response = await fetch(ADMIN_AUTH_URL, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh", refreshToken: saved.refresh_token }),
    });
    const refreshed = await response.json().catch(() => ({})) as Partial<StoredAdminSession> & { error?: string };
    if (!response.ok || !refreshed.access_token || !refreshed.refresh_token) {
      throw new Error(refreshed.error || "Sua sessão expirou. Entre novamente no painel; suas alterações continuam nesta tela.");
    }
    const next: StoredAdminSession = {
      ...saved,
      ...refreshed,
      expires_at: Date.now() + Math.max(60, Number(refreshed.expires_in) || 3600) * 1000,
    };
    window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(next));
    return next.access_token;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function currentAdminAccessToken(fallback: string): Promise<string> {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as StoredAdminSession;
    if (!saved.refresh_token) return fallback;
    if (!saved.access_token || (saved.expires_at && saved.expires_at <= Date.now() + 90_000)) {
      return refreshAdminAccessToken();
    }
    return saved.access_token;
  } catch (error) {
    if (error instanceof SyntaxError) return fallback;
    throw error;
  }
}

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
      throw new Error("Não foi possível salvar neste navegador. Verifique o espaço disponível.");
    }
    listeners.forEach((listener) => listener());
  };
  const reset = () => {
    cache = fallback;
    window.localStorage.removeItem(key);
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
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

type DbModule = { id: string; title: string; description: string; icon: string; position: number; is_published: boolean };
type DbLesson = {
  id: string; module_id: string; title: string; summary: string; path: string | null;
  image_url: string | null; video_url: string | null; video_path: string | null;
  content: string; hotspots: Lesson["hotspots"]; screenshots?: LessonScreenshot[] | null; position: number; is_published: boolean;
};

function authHeaders(accessToken?: string) {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken || SUPABASE_KEY}`, "Content-Type": "application/json" };
}

async function rest(path: string, accessToken?: string, init: RequestInit = {}) {
  let token = await currentAdminAccessToken(accessToken || "");
  const send = () => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { ...authHeaders(token), ...(init.headers ?? {}) },
  });
  let response = await send();
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (/PGRST303|JWT expired|invalid JWT/i.test(detail)) {
      token = await refreshAdminAccessToken();
      response = await send();
    } else {
      throw new Error(detail || `Falha ao acessar o banco (HTTP ${response.status}).`);
    }
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Falha ao acessar o banco (HTTP ${response.status}).`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function fromDatabase(modules: DbModule[], rows: DbLesson[]): Course {
  const lessons: Record<string, Lesson> = {};
  for (const row of rows) {
    lessons[row.id] = {
      id: row.id, moduleId: row.module_id, title: row.title, summary: row.summary ?? "",
      path: row.path ?? undefined, image: row.image_url ?? undefined,
      video: row.video_url ?? row.video_path ?? undefined, content: row.content ?? "",
      hotspots: Array.isArray(row.hotspots) ? row.hotspots : [],
      screenshots: Array.isArray(row.screenshots) && row.screenshots.length
        ? row.screenshots
            .filter((shot) => shot && typeof shot.image === "string" && shot.image.length > 0)
            .map((shot, index) => ({
              ...shot,
              id: typeof shot.id === "string" && shot.id ? shot.id : `screen-${row.id}-${index + 1}`,
              caption: typeof shot.caption === "string" ? shot.caption : undefined,
              hotspots: Array.isArray(shot.hotspots) ? shot.hotspots.filter((h) => h && typeof h.id === "string").map((h) => ({
                ...h,
                x: Number.isFinite(Number(h.x)) ? Number(h.x) : 0,
                y: Number.isFinite(Number(h.y)) ? Number(h.y) : 0,
                w: Number.isFinite(Number(h.w)) ? Number(h.w) : 0,
                h: Number.isFinite(Number(h.h)) ? Number(h.h) : 0,
                title: typeof h.title === "string" ? h.title : "Item sem título",
                description: typeof h.description === "string" ? h.description : "",
                tip: typeof h.tip === "string" ? h.tip : undefined,
              })) : [],
            }))
        : row.image_url ? [{ id: `screen-${row.id}`, image: row.image_url, hotspots: Array.isArray(row.hotspots) ? row.hotspots : [] }] : [],
    };
  }
  return {
    version: 1,
    modules: modules.map((row) => ({
      id: row.id, title: row.title, description: row.description ?? "", icon: row.icon ?? "BookOpen",
      lessonIds: rows.filter((lesson) => lesson.module_id === row.id).sort((a, b) => a.position - b.position).map((lesson) => lesson.id),
    })),
    lessons,
  };
}

export async function loadCourseFromSupabase(accessToken?: string): Promise<Course> {
  const [modules, lessons] = await Promise.all([
    rest("course_modules?select=id,title,description,icon,position,is_published&order=position.asc", accessToken) as Promise<DbModule[]>,
    rest("course_lessons?select=id,module_id,title,summary,path,image_url,video_url,video_path,content,hotspots,screenshots,position,is_published&order=position.asc", accessToken) as Promise<DbLesson[]>,
  ]);
  if (!modules?.length) return courseStore.read();
  const course = fromDatabase(modules, lessons ?? []);
  courseStore.write(course);
  return course;
}

function storagePathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const path = url.slice(index + marker.length);
  return path && !path.includes("..") ? decodeURIComponent(path) : null;
}

async function removeStorage(bucket: string, paths: string[], accessToken: string) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}`, {
    method: "DELETE", headers: authHeaders(accessToken), body: JSON.stringify({ prefixes: unique }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Não foi possível limpar arquivos do bucket ${bucket}.`);
  }
}

export async function saveCourseToSupabase(next: Course, accessToken: string): Promise<void> {
  if (!accessToken) throw new Error("Sessão administrativa ausente. Entre novamente.");
  const [oldModules, oldLessons] = await Promise.all([
    rest("course_modules?select=id", accessToken) as Promise<Array<{ id: string }>>,
    rest("course_lessons?select=id,module_id,image_url,video_path,screenshots", accessToken) as Promise<Array<{ id: string; module_id: string; image_url: string | null; video_path: string | null; screenshots?: LessonScreenshot[] | null }>>,
  ]);

  const moduleRows: DbModule[] = next.modules.map((module, position) => ({
    id: module.id, title: module.title, description: module.description, icon: module.icon, position, is_published: true,
  }));
  if (moduleRows.length) {
    await rest("course_modules?on_conflict=id", accessToken, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(moduleRows),
    });
  }

  const ordered = next.modules.flatMap((module) => module.lessonIds.map((id) => next.lessons[id]).filter((lesson): lesson is Lesson => Boolean(lesson)));
  const lessonRows: DbLesson[] = ordered.map((lesson, position) => ({
    id: lesson.id, module_id: lesson.moduleId, title: lesson.title, summary: lesson.summary,
    path: lesson.path ?? null,
    image_url: lesson.screenshots?.[0]?.image ?? lesson.image ?? null,
    screenshots: lesson.screenshots ?? (lesson.image ? [{ id: `screen-${lesson.id}`, image: lesson.image, hotspots: lesson.hotspots }] : []),
    video_url: lesson.video?.startsWith("http") ? lesson.video : null,
    video_path: lesson.video && !lesson.video.startsWith("http") ? lesson.video : null,
    content: lesson.content, hotspots: lesson.screenshots?.[0]?.hotspots ?? lesson.hotspots, position, is_published: true,
  }));
  if (lessonRows.length) {
    await rest("course_lessons?on_conflict=id", accessToken, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(lessonRows),
    });
  }

  const nextIds = new Set(lessonRows.map((row) => row.id));
  const removed = (oldLessons ?? []).filter((row) => !nextIds.has(row.id));
  const nextImageUrls = new Map(lessonRows.map((row) => [
    row.id,
    new Set([
      row.image_url ?? "",
      ...((row.screenshots ?? []).map((shot) => shot.image)),
    ].filter(Boolean)),
  ]));
  const imagePaths = (oldLessons ?? []).flatMap((row) => {
    const oldUrls = new Set([
      row.image_url ?? "",
      ...((row.screenshots ?? []).map((shot) => shot.image)),
    ].filter(Boolean));
    const keep = nextImageUrls.get(row.id) ?? new Set<string>();
    return [...oldUrls].filter((url) => !keep.has(url) || !nextIds.has(row.id));
  }).map((url) => storagePathFromPublicUrl(url, "course-images")).filter((path): path is string => Boolean(path));
  const nextVideoById = new Map(lessonRows.map((row) => [row.id, row.video_path]));
  const replacedVideos = (oldLessons ?? []).filter((row) => nextIds.has(row.id) && row.video_path && row.video_path !== nextVideoById.get(row.id));
  const videoPaths = [...removed, ...replacedVideos].map((row) => row.video_path).filter((path): path is string => Boolean(path));

  for (const row of removed) {
    await rest(`course_lessons?id=eq.${encodeURIComponent(row.id)}`, accessToken, { method: "DELETE" });
  }
  const moduleIds = new Set(moduleRows.map((row) => row.id));
  for (const row of oldModules ?? []) {
    if (!moduleIds.has(row.id)) await rest(`course_modules?id=eq.${encodeURIComponent(row.id)}`, accessToken, { method: "DELETE" });
  }

  await Promise.all([removeStorage("course-images", imagePaths, accessToken), removeStorage("course-videos", videoPaths, accessToken)]);
  courseStore.write(next);
}

export function toggleLessonDone(lessonId: string, done: boolean) {
  const current = new Set(progressStore.read());
  if (done) current.add(lessonId);
  else current.delete(lessonId);
  progressStore.write([...current]);
}

export function orderedLessons(course: Course): Lesson[] {
  return course.modules.flatMap((module) => module.lessonIds.map((id) => course.lessons[id]).filter((lesson): lesson is Lesson => Boolean(lesson)));
}

export function moduleOf(course: Course, lessonId: string): Module | undefined {
  return course.modules.find((module) => module.lessonIds.includes(lessonId));
}

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
