import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Database,
  Download,
  Eye,
  FilePlus2,
  FolderPlus,
  ImageUp,
  Info,
  RotateCcw,
  Save,
  Sparkles,
  ShieldCheck,
  LogOut,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { HotspotEditor } from "@/components/admin/HotspotEditor";
import { MODULE_ICONS, ModuleIcon } from "@/components/manual/ModuleIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fileToCompressedBlob, fileToCompressedDataUrl } from "@/lib/course/image";
import { loadCourseFromSupabase, newId, orderedLessons, resetCourse, saveCourseToSupabase, useCourse } from "@/lib/course/store";
import { seedCourse } from "@/lib/course/seed";
import type { Course, Hotspot, Lesson, LessonScreenshot, Module } from "@/lib/course/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel do curso — Manual Interativo Emissor Future" },
      { name: "description", content: "Cadastre módulos, aulas, vídeos e prints do manual interativo do Emissor Future." },
      { property: "og:title", content: "Painel do curso — Emissor Future" },
      { property: "og:description", content: "Cadastre módulos, aulas, vídeos e prints do manual interativo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Selection = { kind: "module"; id: string } | { kind: "lesson"; id: string } | null;

const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const ADMIN_AUTH_URL = `${SUPABASE_URL}/functions/v1/admin-auth`;
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const ADMIN_SESSION_KEY = "future-manual-admin-session-v1";

const COURSE_IMAGES_BUCKET = "course-images";


function encodeMetadata(value: string) {
  return btoa(unescape(encodeURIComponent(value)));
}

async function uploadCourseVideo(file: File, lessonId: string, accessToken: string): Promise<string> {
  if (!file.type.startsWith("video/")) throw new Error("Selecione um arquivo de vídeo.");
  const safeName = file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-90) || "video.mp4";
  const path = `lessons/${lessonId}/${newId("video")}-${safeName}`;
  const endpoint = "https://itbppoailqkuxajesgys.storage.supabase.co/storage/v1/upload/resumable";
  const metadata = [
    `bucketName ${encodeMetadata("course-videos")}`,
    `objectName ${encodeMetadata(path)}`,
    `contentType ${encodeMetadata(file.type || "video/mp4")}`,
    `cacheControl ${encodeMetadata("3600")}`,
  ].join(",");
  const created = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata,
      "x-upsert": "false",
    },
  });
  if (!created.ok) throw new Error((await created.text().catch(() => "")) || "Não foi possível iniciar o envio do vídeo.");
  const location = created.headers.get("Location");
  if (!location) throw new Error("O armazenamento não retornou o endereço de envio do vídeo.");
  const uploadUrl = new URL(location, endpoint).toString();
  const chunkSize = 6 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const response = await fetch(uploadUrl, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Tus-Resumable": "1.0.0",
        "Upload-Offset": String(offset),
        "Content-Type": "application/offset+octet-stream",
      },
      body: chunk,
    });
    if (!response.ok) throw new Error((await response.text().catch(() => "")) || "O envio do vídeo foi interrompido.");
    const nextOffset = Number(response.headers.get("Upload-Offset"));
    if (!Number.isFinite(nextOffset) || nextOffset <= offset) throw new Error("O armazenamento não confirmou o progresso do vídeo.");
    offset = nextOffset;
  }
  return path;
}

async function uploadCourseImage(file: File, lessonId: string, accessToken: string): Promise<string> {
  const blob = await fileToCompressedBlob(file);
  const path = `lessons/${lessonId}/${newId("print")}.jpg`;
  const response = await fetch(
    `https://itbppoailqkuxajesgys.supabase.co/storage/v1/object/${COURSE_IMAGES_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/jpeg",
        "x-upsert": "false",
      },
      body: blob,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "Não foi possível enviar o print ao armazenamento.");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/${COURSE_IMAGES_BUCKET}/${path}`;
}



type AdminSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

async function adminRequest(action: string, body: Record<string, unknown> = {}, token?: string) {
  const response = await fetch(ADMIN_AUTH_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function AdminPage() {
  const [status, setStatus] = useState<"signed-out" | "signed-in">("signed-out");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // A sessão só é aceita quando veio do formulário de login do modal do cabeçalho.
  // A chave é consumida imediatamente para não manter credenciais pendentes no navegador.
  const storeSession = (next: AdminSession) => {
    setSession(next);
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    if (!raw) return;
    try {
      const next = JSON.parse(raw) as AdminSession & { mustChangePassword?: boolean };
      if (!next.access_token) return;
      storeSession(next);
      setMustChangePassword(next.mustChangePassword === true);
      setStatus("signed-in");
    } catch {
      setStatus("signed-out");
    }
  }, []);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await adminRequest("login", { username, password }) as unknown as AdminSession & { mustChangePassword?: boolean };
      storeSession(data);
      setMustChangePassword(data.mustChangePassword === true);
      setStatus("signed-in");
      setPassword("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  };

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminRequest("change-password", { newPassword }, session?.access_token);
      setMustChangePassword(false);
      setShowPasswordReset(false);
      setNewPassword("");
      setNotice("Senha atualizada com sucesso.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível atualizar a senha.");
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    if (session?.access_token) void adminRequest("logout", {}, session.access_token).catch(() => undefined);
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setSession(null);
    setStatus("signed-out");
    setMustChangePassword(false);
  };

  if (status === "signed-out") {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></span>
            <div><h1 className="text-xl font-bold">Painel administrativo</h1><p className="text-sm text-muted-foreground">Acesso restrito ao administrador do manual.</p></div>
          </div>
          {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</p>}
          <form onSubmit={login} className="space-y-4">
            <div><Label htmlFor="admin-username">Usuário</Label><Input id="admin-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
            <div><Label htmlFor="admin-password">Senha</Label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar no painel"}</Button>
          </form>
        </section>
      </main>
    );
  }

  if (mustChangePassword || showPasswordReset) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold">{mustChangePassword ? "Troque sua senha" : "Redefinir senha"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{mustChangePassword ? "Por segurança, defina uma nova senha antes de acessar o painel." : "Defina uma nova senha para sua conta de administrador."}</p>
          {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <div><Label htmlFor="new-admin-password">Nova senha</Label><Input id="new-admin-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando..." : "Atualizar senha e continuar"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => { if (mustChangePassword) logout(); else { setShowPasswordReset(false); setError(""); } }}>{mustChangePassword ? "Sair" : "Cancelar"}</Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-end gap-3 px-4 pt-4 lg:px-8">
        <span className="text-xs text-muted-foreground">Administrador autenticado</span>
        <Button type="button" variant="outline" size="sm" onClick={() => { setShowPasswordReset(true); setError(""); setNotice(""); }}><ShieldCheck className="size-4" /> Redefinir senha</Button>
        <Button type="button" variant="outline" size="sm" onClick={logout}><LogOut className="size-4" /> Sair</Button>
      </div>
      <AdminWorkspace accessToken={session?.access_token ?? ""} />
    </>
  );
}


const move = <T,>(arr: T[], i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
};

function AdminWorkspace({ accessToken }: { accessToken: string }) {
  const stored = useCourse();
  const [draft, setDraft] = useState<Course>(stored);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [showErrorKnowledge, setShowErrorKnowledge] = useState(false);

  useEffect(() => {
    let active = true;
    const initializeManual = async () => {
      try {
        const course = await loadCourseFromSupabase(accessToken);
        if (!active) return;
        setDraft(course);

        // Na primeira entrada, grava o conteúdo inicial e transfere os 10 prints
        // da origem antiga para o bucket público do Supabase, que funciona na Vercel.
        const needsPrintMigration = orderedLessons(course).some((lesson) => lesson.image?.startsWith("/__l5e/assets-v1/"));
        if (needsPrintMigration) {
          await saveCourseToSupabase(course, accessToken);
          const response = await fetch(`${SUPABASE_URL}/functions/v1/course-media`, {
            method: "POST",
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action: "import-original-prints" }),
          });
          const result = await response.json() as { imported?: number; total?: number; results?: Array<{ file: string; ok: boolean; error?: string }> };
          if (!response.ok && response.status !== 207) throw new Error("Não foi possível importar os prints originais.");
          const refreshed = await loadCourseFromSupabase(accessToken);
          if (!active) return;
          setDraft(refreshed);
          setDirty(false);
          const imported = result.imported ?? 0;
          const total = result.total ?? 10;
          if (imported === total) toast.success(`${imported} prints originais migrados e publicados para todos os visitantes.`);
          else {
            const failures = (result.results ?? []).filter((item) => !item.ok).map((item) => `${item.file}: ${item.error}`).join("\n");
            toast.error(`${imported} de ${total} prints migrados. ${failures}`);
          }
        }
      } catch (error) {
        if (active) toast.error(error instanceof Error ? error.message : "Não foi possível inicializar o conteúdo do manual.");
      }
    };
    void initializeManual();
    return () => { active = false; };
  }, [accessToken]);

  useEffect(() => {
    if (!dirty) setDraft(stored);
  }, [stored, dirty]);

  const update = (fn: (c: Course) => Course) => {
    setDraft((c) => fn(c));
    setDirty(true);
  };

  const save = async () => {
    try {
      await saveCourseToSupabase(draft, accessToken);
      setDirty(false);
      toast.success("Aulas, módulos e mídias salvos no banco de dados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar no banco.");
    }
  };

  const saveGeneratedCourse = async (next: Course) => {
    await saveCourseToSupabase(next, accessToken);
    setDraft(next);
    setDirty(false);
  };

  const recoverOriginalPrints = async () => {
    try {
      await saveCourseToSupabase(draft, accessToken);
      const response = await fetch(`${SUPABASE_URL}/functions/v1/course-media`, {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import-original-prints" }),
      });
      const result = await response.json() as { imported?: number; total?: number; results?: Array<{ file: string; ok: boolean; error?: string }> };
      if (!response.ok && response.status !== 207) throw new Error("Não foi possível recuperar os prints originais.");
      const refreshed = await loadCourseFromSupabase(accessToken);
      setDraft(refreshed);
      setDirty(false);
      const imported = result.imported ?? 0;
      const total = result.total ?? 10;
      if (imported === total) toast.success(`${imported} prints originais recuperados e salvos no Supabase.`);
      else {
        const failures = (result.results ?? []).filter((item) => !item.ok).map((item) => `${item.file}: ${item.error}`).join("\n");
        toast.error(`${imported} de ${total} prints recuperados. ${failures}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao recuperar os prints originais.");
    }
  };

  const addModule = () => {
    const id = newId("modulo");
    update((c) => ({
      ...c,
      modules: [...c.modules, { id, title: "Novo módulo", description: "", icon: "BookOpen", lessonIds: [] }],
    }));
    setSel({ kind: "module", id });
  };

  const addLesson = (moduleId: string) => {
    const id = newId("aula");
    const lesson: Lesson = { id, moduleId, title: "Nova aula", summary: "", content: "", hotspots: [] };
    update((c) => ({
      ...c,
      lessons: { ...c.lessons, [id]: lesson },
      modules: c.modules.map((m) => (m.id === moduleId ? { ...m, lessonIds: [...m.lessonIds, id] } : m)),
    }));
    setSel({ kind: "lesson", id });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "manual-future.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Course;
      if (!Array.isArray(parsed.modules) || typeof parsed.lessons !== "object") throw new Error();
      setDraft(parsed);
      setDirty(true);
      setSel(null);
      toast.success("Conteúdo importado. Clique em Salvar para manter.");
    } catch {
      toast.error("Arquivo inválido.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 lg:px-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Painel do curso</h1>
          <p className="text-sm text-muted-foreground">Cadastre módulos, aulas, prints, vídeos e as explicações de cada botão.</p>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importJson(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
          <Upload /> Importar
        </Button>
        <Button variant="outline" size="sm" onClick={exportJson}>
          <Download /> Exportar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (!window.confirm("Voltar ao conteúdo original? Suas alterações serão perdidas.")) return;
            resetCourse();
            setDraft(seedCourse);
            setDirty(true);
            setSel(null);
          }}
        >
          <RotateCcw /> Restaurar original
        </Button>
        <Button variant="outline" size="sm" onClick={() => void recoverOriginalPrints()}><ImageUp /> Recuperar prints originais</Button>
        <Button variant="outline" size="sm" onClick={() => setShowErrorKnowledge((value) => !value)}><Database /> {showErrorKnowledge ? "Voltar às aulas" : "Banco de erros"}</Button>
        <Button onClick={save} disabled={!dirty}>
          <Save /> {dirty ? "Salvar alterações" : "Tudo salvo"}
        </Button>
      </div>

      {showErrorKnowledge ? <ErrorKnowledgeManager accessToken={accessToken} /> : <>
      <p className="mb-6 flex items-start gap-2 rounded-xl border border-primary/30 bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        O conteúdo é carregado e salvo no Supabase. Depois de salvar, as aulas e os módulos publicados ficam disponíveis para os visitantes. Use Exportar para guardar uma cópia.
      </p>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          {draft.modules.map((m, mi) => (
            <div key={m.id} className="rounded-xl border bg-card p-2 shadow-card">
              <button
                type="button"
                onClick={() => setSel({ kind: "module", id: m.id })}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold",
                  sel?.kind === "module" && sel.id === m.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                )}
              >
                <ModuleIcon name={m.icon} className="size-4" />
                <span className="flex-1 truncate">
                  {mi + 1}. {m.title}
                </span>
                <span className="text-xs opacity-70">{m.lessonIds.length}</span>
              </button>
              <ul className="mt-1 space-y-0.5 pl-4">
                {m.lessonIds.map((id) => {
                  const l = draft.lessons[id];
                  if (!l) return null;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => setSel({ kind: "lesson", id })}
                        className={cn(
                          "w-full truncate rounded-md px-2 py-1.5 text-left text-sm",
                          sel?.kind === "lesson" && sel.id === id
                            ? "bg-secondary font-semibold text-secondary-foreground"
                            : "text-foreground/80 hover:bg-muted",
                        )}
                      >
                        {l.title}
                      </button>
                    </li>
                  );
                })}
                <li>
                  <button
                    type="button"
                    onClick={() => addLesson(m.id)}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-semibold text-primary hover:bg-muted"
                  >
                    <FilePlus2 className="size-3.5" /> Nova aula
                  </button>
                </li>
              </ul>
            </div>
          ))}
          <Button variant="outline" className="w-full" onClick={addModule}>
            <FolderPlus /> Novo módulo
          </Button>
        </aside>

        <section className="min-w-0">
          {sel?.kind === "module" && draft.modules.find((m) => m.id === sel.id) ? (
            <ModuleEditor
              key={sel.id}
              course={draft}
              module={draft.modules.find((m) => m.id === sel.id)!}
              update={update}
              onSaveGenerated={saveGeneratedCourse}
              onDeleted={() => setSel(null)}
            />
          ) : sel?.kind === "lesson" && draft.lessons[sel.id] ? (
            <LessonEditor key={sel.id} course={draft} lesson={draft.lessons[sel.id]!} update={update} accessToken={accessToken} onSaveGenerated={saveGeneratedCourse} onDeleted={() => setSel(null)} />
          ) : (
            <div className="flex h-full min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed bg-card p-10 text-center">
              <ImageUp className="mb-3 size-10 text-primary" />
              <p className="font-semibold">Escolha um módulo ou aula ao lado para editar</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Em cada aula você sobe o print da tela e desenha um retângulo sobre cada botão para explicar o que ele faz.
              </p>
            </div>
          )}
        </section>
      </div>
      </>}
    </main>
  );
}


type ErrorKnowledgeRow = {
  id: string;
  error_signature: string;
  error_message: string;
  category: string;
  solution: string;
  status: "pending" | "approved" | "rejected";
  occurrence_count: number;
  last_seen_at: string;
};

function ErrorKnowledgeManager({ accessToken }: { accessToken: string }) {
  const [rows, setRows] = useState<ErrorKnowledgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/error_knowledge?select=id,error_signature,error_message,category,solution,status,occurrence_count,last_seen_at&order=last_seen_at.desc&limit=200`,
        { headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) throw new Error("Não foi possível carregar a base de erros.");
      setRows(await response.json() as ErrorKnowledgeRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os erros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accessToken]);

  const patchRow = (id: string, patch: Partial<ErrorKnowledgeRow>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const save = async (row: ErrorKnowledgeRow, status: ErrorKnowledgeRow["status"]) => {
    if (status === "approved" && !row.solution.trim()) {
      toast.error("Revise e complete a solução antes de aprovar.");
      return;
    }
    setSavingId(row.id);
    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/error_knowledge?id=eq.${encodeURIComponent(row.id)}`,
        {
          method: "PATCH",
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ solution: row.solution, status, updated_at: new Date().toISOString() }),
        },
      );
      if (!response.ok) throw new Error((await response.text()) || "Não foi possível salvar a solução.");
      patchRow(row.id, { status });
      toast.success(status === "approved" ? "Solução aprovada. O assistente poderá reutilizá-la sem chamar a IA." : "Registro atualizado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSavingId(null);
    }
  };

  const pending = rows.filter((row) => row.status === "pending").length;
  const approved = rows.filter((row) => row.status === "approved").length;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold">Banco de conhecimento de erros</h2>
          <p className="text-sm text-muted-foreground">Revise as respostas criadas pela IA. Só soluções aprovadas são usadas automaticamente.</p>
        </div>
        <div className="rounded-lg bg-secondary px-3 py-2 text-sm"><b>{pending}</b> pendentes</div>
        <div className="rounded-lg bg-secondary px-3 py-2 text-sm"><b>{approved}</b> aprovados</div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RotateCcw /> Atualizar</Button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {loading ? <p className="py-10 text-center text-sm text-muted-foreground">Carregando base de conhecimento...</p>
        : rows.length === 0 ? <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">Ainda não há erros registrados. Quando alguém enviar um print ou descrever um erro, ele aparecerá aqui para revisão.</div>
        : <div className="space-y-4">
          {rows.map((row) => (
            <article key={row.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{row.category === "fiscal" ? "Erro fiscal" : "Erro do sistema"}</span>
                <span className="rounded-full bg-secondary px-2 py-1 text-xs">{row.status === "pending" ? "Aguardando revisão" : row.status === "approved" ? "Aprovado" : "Rejeitado"}</span>
                <span className="ml-auto text-xs text-muted-foreground">{row.occurrence_count} ocorrência(s)</span>
              </div>
              <p className="text-sm text-muted-foreground">Identificação: {row.error_signature}</p>
              {row.error_message && <p className="rounded-lg bg-secondary/60 p-3 text-sm">{row.error_message}</p>}
              <div className="space-y-1.5">
                <Label htmlFor={`solution-${row.id}`}>Solução que o assistente poderá reutilizar</Label>
                <Textarea id={`solution-${row.id}`} rows={5} value={row.solution} onChange={(event) => patchRow(row.id, { solution: event.target.value })} />
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => void save(row, "rejected")} disabled={savingId === row.id}>Rejeitar</Button>
                <Button size="sm" onClick={() => void save(row, "approved")} disabled={savingId === row.id}>{savingId === row.id ? "Salvando..." : row.status === "approved" ? "Salvar solução" : "Aprovar e ativar"}</Button>
              </div>
            </article>
          ))}
        </div>}
    </section>
  );
}

type Updater = (fn: (c: Course) => Course) => void;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ModuleEditor({
  course,
  module: m,
  update,
  onDeleted,
  onSaveGenerated,
}: {
  course: Course;
  module: Module;
  update: Updater;
  onDeleted: () => void;
  onSaveGenerated: (course: Course) => Promise<void>;
}) {
  const idx = course.modules.findIndex((x) => x.id === m.id);
  const patch = (p: Partial<Module>) =>
    update((c) => ({ ...c, modules: c.modules.map((x) => (x.id === m.id ? { ...x, ...p } : x)) }));
  return (
    <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xl font-bold">Módulo {idx + 1}</h2>
        <Button variant="outline" size="icon-sm" aria-label="Subir" onClick={() => update((c) => ({ ...c, modules: move(c.modules, idx, -1) }))}>
          <ArrowUp />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Descer" onClick={() => update((c) => ({ ...c, modules: move(c.modules, idx, 1) }))}>
          <ArrowDown />
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (!window.confirm(`Excluir o módulo "${m.title}" e suas ${m.lessonIds.length} aulas?`)) return;
            const nextCourse: Course = {
              ...course,
              lessons: Object.fromEntries(Object.entries(course.lessons).filter(([id]) => !m.lessonIds.includes(id))),
              modules: course.modules.filter((x) => x.id !== m.id),
            };
            update(() => nextCourse);
            onDeleted();
            void onSaveGenerated(nextCourse)
              .then(() => toast.success("Módulo, aulas e arquivos relacionados excluídos do banco e do armazenamento."))
              .catch((error) => toast.error(error instanceof Error ? error.message : "O módulo foi removido da tela, mas não consegui concluir a limpeza no banco."));
          }}
        >
          <Trash2 /> Excluir
        </Button>
      </div>
      <Field label="Título">
        <Input value={m.title} onChange={(e) => patch({ title: e.target.value })} />
      </Field>
      <Field label="Descrição">
        <Textarea value={m.description} onChange={(e) => patch({ description: e.target.value })} rows={2} />
      </Field>
      <Field label="Ícone">
        <Select value={m.icon} onValueChange={(icon) => patch({ icon })}>
          <SelectTrigger className="w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.keys(MODULE_ICONS).map((name) => (
              <SelectItem key={name} value={name}>
                <span className="flex items-center gap-2">
                  <ModuleIcon name={name} className="size-4" /> {name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function LessonEditor({
  course,
  lesson: l,
  update,
  onDeleted,
  onSaveGenerated,
  accessToken,
}: {
  course: Course;
  lesson: Lesson;
  update: Updater;
  onDeleted: () => void;
  onSaveGenerated: (course: Course) => Promise<void>;
  accessToken: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [activeScreenshotId, setActiveScreenshotId] = useState<string | null>(null);
  const [uploadingPrints, setUploadingPrints] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [hotspotsDirty, setHotspotsDirty] = useState(false);
  const [savingHotspots, setSavingHotspots] = useState(false);
  // Mantém os arquivos originais em memória enquanto o editor estiver aberto.
  // Assim a IA recebe os bytes do próprio upload, sem depender de um fetch CORS
  // para baixar novamente a URL pública do Storage.
  const uploadedFilesRef = useRef<Map<string, File>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const mod = course.modules.find((m) => m.lessonIds.includes(l.id));
  const posInModule = mod ? mod.lessonIds.indexOf(l.id) : -1;

  const patch = (p: Partial<Lesson>) => update((c) => ({ ...c, lessons: { ...c.lessons, [l.id]: { ...l, ...p } } }));
  const screenshots: LessonScreenshot[] = (Array.isArray(l.screenshots) && l.screenshots.length
    ? l.screenshots
    : l.image ? [{ id: `screen-${l.id}`, image: l.image, hotspots: l.hotspots }] : [])
    .filter((shot) => shot && typeof shot.image === "string" && shot.image.length > 0)
    .map((shot, index) => ({
      ...shot,
      id: typeof shot.id === "string" && shot.id ? shot.id : `screen-${l.id}-${index + 1}`,
      hotspots: Array.isArray(shot.hotspots) ? shot.hotspots.filter((h) => h && typeof h.id === "string").map((h) => ({
        ...h,
        w: Math.min(100, Math.max(1, Number.isFinite(Number(h.w)) ? Number(h.w) : 1)),
        h: Math.min(100, Math.max(1, Number.isFinite(Number(h.h)) ? Number(h.h) : 1)),
        x: Math.min(100 - Math.min(100, Math.max(1, Number.isFinite(Number(h.w)) ? Number(h.w) : 1)), Math.max(0, Number.isFinite(Number(h.x)) ? Number(h.x) : 0)),
        y: Math.min(100 - Math.min(100, Math.max(1, Number.isFinite(Number(h.h)) ? Number(h.h) : 1)), Math.max(0, Number.isFinite(Number(h.y)) ? Number(h.y) : 0)),
        title: typeof h.title === "string" ? h.title : "Item sem título",
        description: typeof h.description === "string" ? h.description : "",
      })) : [],
    }));
  const activeScreenshot = screenshots.find((shot) => shot.id === activeScreenshotId) ?? screenshots[0];
  const activeHotspots = activeScreenshot?.hotspots ?? [];
  const patchScreenshots = (next: LessonScreenshot[]) => {
    patch({ screenshots: next, image: next[0]?.image, hotspots: next[0]?.hotspots ?? [] });
    setHotspotsDirty(true);
  };
  const patchHotspot = (id: string, p: Partial<Hotspot>) => {
    if (!activeScreenshot) return;
    patchScreenshots(screenshots.map((shot) => shot.id === activeScreenshot.id
      ? { ...shot, hotspots: (shot.hotspots ?? []).map((h) => h.id === id ? { ...h, ...p } : h) }
      : shot));
  };

  const saveHotspotChanges = async () => {
    setSavingHotspots(true);
    try {
      await onSaveGenerated(course);
      setHotspotsDirty(false);
      toast.success("Posições e explicações dos botões salvas no banco de dados.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar as posições.");
    } finally {
      setSavingHotspots(false);
    }
  };

  const uploadPrints = async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (!selectedFiles.length) return;
    if (screenshots.length + selectedFiles.length > 8) {
      toast.error("Cada aula pode ter no máximo 8 prints. Remova algum print ou selecione menos imagens.");
      return;
    }
    setUploadingPrints(true);
    try {
      if (!accessToken) throw new Error("Entre novamente no painel para enviar imagens.");
      const uploaded: LessonScreenshot[] = [];
      for (const file of selectedFiles) {
        const image = await uploadCourseImage(file, l.id, accessToken);
        const id = newId("print");
        uploadedFilesRef.current.set(id, file);
        uploaded.push({ id, image, caption: file.name.replace(/\.[^.]+$/, ""), hotspots: [] });
      }
      const next = [...screenshots, ...uploaded];
      const nextLesson: Lesson = {
        ...l,
        screenshots: next,
        image: next[0]?.image,
        hotspots: next[0]?.hotspots ?? [],
      };
      const nextCourse: Course = {
        ...course,
        lessons: { ...course.lessons, [l.id]: nextLesson },
      };
      update(() => nextCourse);
      await onSaveGenerated(nextCourse);
      setActiveScreenshotId(uploaded[0]?.id ?? next[0]?.id ?? null);
      toast.success(`${uploaded.length} print(s) enviados e registrados no banco. Agora você já pode gerar a aula detalhada.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui enviar todos os prints.");
    } finally {
      setUploadingPrints(false);
    }
  };

  const generateLesson = async () => {
    if (!accessToken) return toast.error("Entre novamente no painel para salvar a aula.");
    if (!screenshots.length) return toast.error("Envie primeiro os prints da aula.");
    setGenerating(true);
    try {
      const images = await Promise.all(screenshots.map(async (shot, index) => {
        let sourceFile = uploadedFilesRef.current.get(shot.id);
        if (!sourceFile) {
          // Compatibilidade para imagens já salvas antes desta correção.
          // Se o navegador bloquear o download cross-origin, orientamos o admin
          // a selecionar novamente o print em vez de exibir o erro genérico.
          try {
            const response = await fetch(shot.image, { mode: "cors", cache: "no-store" });
            if (!response.ok) throw new Error("HTTP " + response.status);
            const sourceBlob = await response.blob();
            sourceFile = new File([sourceBlob], "print-" + (index + 1) + ".jpg", { type: sourceBlob.type || "image/jpeg" });
          } catch {
            throw new Error("Não consegui ler o print " + (index + 1) + " para análise. Remova e envie novamente essa imagem; depois clique em Gerar aula automaticamente sem sair do editor.");
          }
        }
        const dataUrl = await fileToCompressedDataUrl(sourceFile, 1800, 0.82);
        const comma = dataUrl.indexOf(",");
        if (comma < 0) throw new Error("Não foi possível preparar o print " + (index + 1) + ".");
        return { data: dataUrl.slice(comma + 1), mimeType: "image/jpeg" };
      }));
      const response = await fetch(SUPABASE_URL + "/functions/v1/course-media", {
        method: "POST",
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: "Bearer " + accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-lesson", images }),
      });
      const generated = await response.json().catch(() => ({})) as { error?: string; title?: string; summary?: string; path?: string; content?: string; screenshots?: Array<{ index: number; caption?: string; hotspots?: Array<{ x:number; y:number; w:number; h:number; title:string; description:string; tip?:string }> }> };
      if (!response.ok) throw new Error(generated.error || "A IA não conseguiu analisar os prints. Tente novamente.");
      const generatedScreens = Array.isArray(generated.screenshots) ? generated.screenshots : [];
      if (generatedScreens.length !== screenshots.length) throw new Error("A IA não retornou uma análise para todos os prints. Nenhuma alteração foi salva; tente novamente.");
      const generatedHotspotCount = generatedScreens.reduce((total, screen) => total + (Array.isArray(screen.hotspots) ? screen.hotspots.length : 0), 0);
      if (generatedHotspotCount === 0) throw new Error("A IA não identificou nenhum botão ou campo nos prints. Nenhuma alteração foi salva; tente novamente com imagens mais nítidas.");
      const orderedScreens: LessonScreenshot[] = screenshots.map((shot, index) => {
        const analyzed = generatedScreens.find((item) => item.index === index);
        const hotspots: Hotspot[] = Array.isArray(analyzed?.hotspots) && analyzed.hotspots.length > 0 ? analyzed.hotspots.map((point, pointIndex) => ({
          id: newId("ponto-" + (index + 1) + "-" + (pointIndex + 1)),
          x: point.x, y: point.y, w: point.w, h: point.h, title: point.title, description: point.description, tip: point.tip || undefined,
        })) : (shot.hotspots ?? []);
        return { ...shot, caption: analyzed?.caption?.trim() || ("Tela " + (index + 1)), hotspots };
      });
      const generatedLesson: Lesson = {
        ...l, title: generated.title?.trim() || l.title, summary: generated.summary?.trim() || l.summary,
        path: generated.path?.trim() || l.path, content: generated.content?.trim() || l.content,
        screenshots: orderedScreens, image: orderedScreens[0]?.image, hotspots: orderedScreens[0]?.hotspots ?? [],
      };
      const nextCourse: Course = { ...course, lessons: { ...course.lessons, [l.id]: generatedLesson } };
      await onSaveGenerated(nextCourse);
      update(() => nextCourse);
      setHotspotsDirty(false);
      setActiveScreenshotId(orderedScreens[0]?.id ?? null);
      setSelected(null);
      toast.success("Aula analisada pela IA: imagens, etapas, marcações numeradas e explicações foram salvas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui analisar e montar a aula.");
    } finally {
      setGenerating(false);
    }
  };
  const removeScreenshot = async (id: string) => {
    const next = screenshots.filter((shot) => shot.id !== id);
    const nextLesson: Lesson = {
      ...l,
      screenshots: next,
      image: next[0]?.image,
      hotspots: next[0]?.hotspots ?? [],
    };
    const nextCourse: Course = { ...course, lessons: { ...course.lessons, [l.id]: nextLesson } };
    update(() => nextCourse);
    if (activeScreenshotId === id) setActiveScreenshotId(next[0]?.id ?? null);
    setSelected(null);
    try {
      await onSaveGenerated(nextCourse);
      toast.success("Print removido da aula, do banco e do armazenamento.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui concluir a exclusão do print no banco.");
    }
  };


  const uploadVideo = async (file: File) => {
    try {
      if (!accessToken) throw new Error("Entre novamente no painel para enviar vídeos.");
      const path = await uploadCourseVideo(file, l.id, accessToken);
      const nextLesson: Lesson = { ...l, video: path };
      const nextCourse: Course = {
        ...course,
        lessons: { ...course.lessons, [l.id]: nextLesson },
      };
      update(() => nextCourse);
      await onSaveGenerated(nextCourse);
      toast.success("Vídeo enviado e registrado no banco de dados. Ele já está vinculado a esta aula.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui enviar este vídeo.");
    }
  };

  const moveInModule = (dir: -1 | 1) =>
    update((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === mod?.id ? { ...m, lessonIds: move(m.lessonIds, posInModule, dir) } : m)),
    }));

  const sel = activeHotspots.find((h) => h.id === selected);

  return (
    <div className="space-y-6">
      <div className="space-y-5 rounded-2xl border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="flex-1 text-xl font-bold">Aula · {mod?.title}</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/aula/$lessonId" params={{ lessonId: l.id }} search={{}}>
              <Eye /> Ver aula
            </Link>
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Subir" onClick={() => moveInModule(-1)}>
            <ArrowUp />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Descer" onClick={() => moveInModule(1)}>
            <ArrowDown />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (!window.confirm(`Excluir a aula "${l.title}"?`)) return;
              const nextLessons = { ...course.lessons };
              delete nextLessons[l.id];
              const nextCourse: Course = {
                ...course,
                lessons: nextLessons,
                modules: course.modules.map((m) => ({ ...m, lessonIds: m.lessonIds.filter((id) => id !== l.id) })),
              };
              update(() => nextCourse);
              onDeleted();
              void onSaveGenerated(nextCourse)
                .then(() => toast.success("Aula e arquivos relacionados excluídos do banco e do armazenamento."))
                .catch((error) => toast.error(error instanceof Error ? error.message : "A aula foi removida da tela, mas não consegui concluir a limpeza no banco."));
            }}
          >
            <Trash2 /> Excluir
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Título da aula">
            <Input value={l.title} onChange={(e) => patch({ title: e.target.value })} />
          </Field>
          <Field label="Onde fica no sistema" hint="Ex.: Cadastros > Produtos > Novo Produto">
            <Input value={l.path ?? ""} onChange={(e) => patch({ path: e.target.value })} />
          </Field>
          <Field label="Resumo">
            <Input value={l.summary} onChange={(e) => patch({ summary: e.target.value })} />
          </Field>
          <Field label="Vídeo (YouTube, Vimeo ou link direto)" hint="Cole um link externo ou envie um arquivo para o armazenamento privado do manual.">
            <div className="space-y-2">
              <Input value={l.video?.startsWith("http") ? l.video : ""} placeholder="https://youtu.be/..." onChange={(e) => patch({ video: e.target.value || undefined })} />
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadVideo(f); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => videoRef.current?.click()}><Upload /> Enviar vídeo do computador</Button>
              {l.video && !l.video.startsWith("http") && <p className="text-xs text-muted-foreground">Vídeo enviado: {l.video.split("/").pop()}</p>}
            </div>
          </Field>
        </div>
        <Field label="Passo a passo" hint="Use **negrito**, listas com 1. 2. 3. e - para tópicos.">
          <Textarea value={l.content} rows={7} onChange={(e) => patch({ content: e.target.value })} />
        </Field>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <h3 className="text-lg font-bold">Print e explicações dos botões</h3>
            <p className="text-sm text-muted-foreground">
              Envie até 8 prints na ordem do processo. A IA analisa cada imagem, posiciona os números sobre os controles visíveis e cria as explicações. Você pode arrastar e redimensionar cada marcação ou selecioná-la e movê-la com as setas do teclado (Shift + seta move mais rápido). Os marcadores ficam sempre dentro do print.
            </p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" multiple className="hidden"
            onChange={(e) => { const files = e.target.files; if (files?.length) void uploadPrints(files); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploadingPrints || generating}>
            <ImageUp /> {uploadingPrints ? "Salvando prints..." : "Enviar vários prints"}
          </Button>
          <Button variant="lime" onClick={() => void generateLesson()} disabled={!screenshots.length || uploadingPrints || generating}>
            <Sparkles className={generating ? "animate-pulse" : ""} />
            {generating ? "Montando aula..." : "Montar aula automaticamente"}
          </Button>
        </div>

        {screenshots.length ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {screenshots.map((shot, index) => (
                <div key={shot.id} className={cn("flex items-center gap-1 rounded-lg border p-1", activeScreenshot?.id === shot.id ? "border-primary bg-secondary" : "bg-card")}>
                  <button type="button" onClick={() => { setActiveScreenshotId(shot.id); setSelected(null); }} className="flex items-center gap-2 px-2 py-1 text-left text-sm">
                    <img src={shot.image} alt="" className="size-10 rounded object-cover" />
                    <span className="max-w-36 truncate">{shot.caption || `Print ${index + 1}`}</span>
                    <span className="text-xs text-muted-foreground">{(shot.hotspots ?? []).length} itens</span>
                  </button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Mover print para cima" disabled={index === 0} onClick={() => patchScreenshots(move(screenshots, index, -1))}><ArrowUp /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Mover print para baixo" disabled={index === screenshots.length - 1} onClick={() => patchScreenshots(move(screenshots, index, 1))}><ArrowDown /></Button>
                  <Button type="button" variant="ghost" size="icon-xs" aria-label="Remover print" onClick={() => removeScreenshot(shot.id)}><Trash2 /></Button>
                </div>
              ))}
            </div>
            {activeScreenshot && <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
              <HotspotEditor image={activeScreenshot.image} hotspots={activeHotspots} selectedId={selected}
                onSelect={setSelected} onChange={(id, rect) => patchHotspot(id, rect)}
                onCreate={(rect) => {
                  const id = newId("ponto");
                  patchScreenshots(screenshots.map((shot) => shot.id === activeScreenshot.id
                    ? { ...shot, hotspots: [...(shot.hotspots ?? []), { id, ...rect, title: "Novo item", description: "Explique o que este botão faz." }] }
                    : shot));
                  setHotspotsDirty(true);
                  setSelected(id);
                }}
              />
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-secondary/50 p-2">
                  <span className="text-xs text-muted-foreground">{activeHotspots.length} marcação(ões) nesta tela</span>
                  <Button type="button" size="sm" onClick={() => void saveHotspotChanges()} disabled={savingHotspots || !hotspotsDirty}>
                    <Save /> {savingHotspots ? "Salvando..." : hotspotsDirty ? "Salvar posições e explicações" : "Posições salvas"}
                  </Button>
                </div>
                {sel ? (
                  <div className="space-y-3 rounded-xl border border-lime bg-background p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">
                      Item {activeHotspots.findIndex((h) => h.id === sel.id) + 1} · {activeScreenshot.caption || "Print selecionado"}
                    </p>
                    <Field label="Nome do botão/campo"><Input value={sel.title} onChange={(e) => patchHotspot(sel.id, { title: e.target.value })} /></Field>
                    <Field label="O que ele faz"><Textarea rows={5} value={sel.description} onChange={(e) => patchHotspot(sel.id, { description: e.target.value })} /></Field>
                    <Field label="Dica (opcional)"><Input value={sel.tip ?? ""} onChange={(e) => patchHotspot(sel.id, { tip: e.target.value || undefined })} /></Field>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => patchScreenshots(screenshots.map((shot) => shot.id === activeScreenshot.id ? { ...shot, hotspots: move(shot.hotspots ?? [], activeHotspots.indexOf(sel), -1) } : shot))}><ArrowUp /> Antes</Button>
                      <Button variant="outline" size="sm" onClick={() => patchScreenshots(screenshots.map((shot) => shot.id === activeScreenshot.id ? { ...shot, hotspots: move(shot.hotspots ?? [], activeHotspots.indexOf(sel), 1) } : shot))}><ArrowDown /> Depois</Button>
                      <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => { patchScreenshots(screenshots.map((shot) => shot.id === activeScreenshot.id ? { ...shot, hotspots: (shot.hotspots ?? []).filter((h) => h.id !== sel.id) } : shot)); setSelected(null); }}><Trash2 /> Remover</Button>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Selecione uma área no print para editar a explicação.</p>
                )}
                <ol className="max-h-96 space-y-1 overflow-y-auto">
                  {activeHotspots.map((h, i) => (
                    <li key={h.id}>
                      <button type="button" onClick={() => setSelected(h.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", selected === h.id ? "bg-secondary font-semibold" : "hover:bg-muted")}>
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">{i + 1}</span>
                        <span className="truncate">{h.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-muted-foreground hover:border-primary hover:text-primary">
            <ImageUp className="size-10" />
            Clique para enviar vários prints da aula
          </button>
        )}
      </div>
    </div>
  );
}
