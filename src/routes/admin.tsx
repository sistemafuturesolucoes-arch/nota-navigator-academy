import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FilePlus2,
  FolderPlus,
  ImageUp,
  Info,
  RotateCcw,
  Save,
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
import { fileToCompressedBlob } from "@/lib/course/image";
import { loadCourseFromSupabase, newId, resetCourse, saveCourseToSupabase, useCourse } from "@/lib/course/store";
import type { Course, Hotspot, Lesson, Module } from "@/lib/course/types";
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

const ADMIN_AUTH_URL = "https://itbppoailqkuxajesgys.supabase.co/functions/v1/admin-auth";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const ADMIN_SESSION_KEY = "future-manual-admin-session-v1";

const COURSE_IMAGES_BUCKET = "course-images";

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
  return `https://itbppoailkqkuxajesgys.supabase.co/storage/v1/object/public/${COURSE_IMAGES_BUCKET}/${path}`;
}



type AdminSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

async function adminRequest(action: string, body: Record<string, unknown> = {}, token?: string, bootstrapSecret?: string) {
  const response = await fetch(ADMIN_AUTH_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(bootstrapSecret ? { "x-bootstrap-secret": bootstrapSecret } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function AdminPage() {
  const [status, setStatus] = useState<"checking" | "signed-out" | "signed-in">("checking");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Acesso administrativo exige autenticação explícita a cada abertura do painel.
  // Não restauramos sessão do sessionStorage: isso impedia o formulário de senha de aparecer.
  const storeSession = (next: AdminSession) => {
    setSession(next);
  };

  useEffect(() => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setStatus("signed-out");
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

  const bootstrap = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("bootstrap", { password: initialPassword }, undefined, bootstrapSecret);
      setNotice("Administrador inicial criado. Entre com o usuário admin e a senha informada.");
      setShowBootstrap(false);
      setPassword(initialPassword);
      setInitialPassword("");
      setBootstrapSecret("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o administrador.");
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

  if (status === "checking") {
    return <main className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Verificando acesso administrativo...</main>;
  }

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
          {showBootstrap ? (
            <form onSubmit={bootstrap} className="space-y-4">
              <div><Label htmlFor="bootstrap-secret">Chave de configuração inicial</Label><Input id="bootstrap-secret" type="password" autoComplete="off" value={bootstrapSecret} onChange={(e) => setBootstrapSecret(e.target.value)} required /></div>
              <div><Label htmlFor="initial-password">Senha temporária do administrador</Label><Input id="initial-password" type="password" autoComplete="new-password" value={initialPassword} onChange={(e) => setInitialPassword(e.target.value)} minLength={6} required /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Configurando..." : "Criar administrador inicial"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setShowBootstrap(false)}>Voltar ao login</Button>
            </form>
          ) : (
            <form onSubmit={login} className="space-y-4">
              <div><Label htmlFor="admin-username">Usuário</Label><Input id="admin-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>
              <div><Label htmlFor="admin-password">Senha</Label><Input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar no painel"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setShowBootstrap(true); setError(""); }}>Configurar primeiro acesso</Button>
            </form>
          )}
        </section>
      </main>
    );
  }

  if (mustChangePassword) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <section className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-card">
          <h1 className="text-xl font-bold">Troque sua senha</h1>
          <p className="mt-2 text-sm text-muted-foreground">Por segurança, defina uma nova senha antes de acessar o painel.</p>
          {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <div><Label htmlFor="new-admin-password">Nova senha</Label><Input id="new-admin-password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} required /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando..." : "Atualizar senha e continuar"}</Button>
            <Button type="button" variant="ghost" className="w-full" onClick={logout}>Sair</Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-end gap-3 px-4 pt-4 lg:px-8">
        <span className="text-xs text-muted-foreground">Administrador autenticado</span>
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

  useEffect(() => {
    let active = true;
    void loadCourseFromSupabase(accessToken)
      .then((course) => { if (active) setDraft(course); })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Não foi possível carregar as aulas do banco."));
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
            setDirty(false);
            setSel(null);
          }}
        >
          <RotateCcw /> Restaurar original
        </Button>
        <Button onClick={save} disabled={!dirty}>
          <Save /> {dirty ? "Salvar alterações" : "Tudo salvo"}
        </Button>
      </div>

      <p className="mb-6 flex items-start gap-2 rounded-xl border border-primary/30 bg-secondary px-4 py-3 text-sm text-secondary-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        Por enquanto o conteúdo fica salvo neste navegador. Quando o banco de dados for conectado, ele passa a valer para
        todos os clientes. Use Exportar para guardar uma cópia.
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
              onDeleted={() => setSel(null)}
            />
          ) : sel?.kind === "lesson" && draft.lessons[sel.id] ? (
            <LessonEditor key={sel.id} course={draft} lesson={draft.lessons[sel.id]!} update={update} accessToken={accessToken} onDeleted={() => setSel(null)} />
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
    </main>
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
}: {
  course: Course;
  module: Module;
  update: Updater;
  onDeleted: () => void;
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
            update((c) => {
              const lessons = { ...c.lessons };
              m.lessonIds.forEach((id) => delete lessons[id]);
              return { ...c, lessons, modules: c.modules.filter((x) => x.id !== m.id) };
            });
            onDeleted();
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
  accessToken,
}: {
  course: Course;
  lesson: Lesson;
  update: Updater;
  onDeleted: () => void;
  accessToken: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mod = course.modules.find((m) => m.lessonIds.includes(l.id));
  const posInModule = mod ? mod.lessonIds.indexOf(l.id) : -1;

  const patch = (p: Partial<Lesson>) => update((c) => ({ ...c, lessons: { ...c.lessons, [l.id]: { ...l, ...p } } }));
  const patchHotspot = (id: string, p: Partial<Hotspot>) =>
    patch({ hotspots: l.hotspots.map((h) => (h.id === id ? { ...h, ...p } : h)) });

  const uploadPrint = async (file: File) => {
    try {
      if (!accessToken) throw new Error("Entre novamente no painel para enviar imagens.");
      const previousImage = l.image;
      const image = await uploadCourseImage(file, l.id, accessToken);
      patch({ image });
      toast.success("Print compactado e enviado ao armazenamento do manual.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui enviar esta imagem.");
    }
  };

  const moveInModule = (dir: -1 | 1) =>
    update((c) => ({
      ...c,
      modules: c.modules.map((m) => (m.id === mod?.id ? { ...m, lessonIds: move(m.lessonIds, posInModule, dir) } : m)),
    }));

  const sel = l.hotspots.find((h) => h.id === selected);

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
              update((c) => {
                const lessons = { ...c.lessons };
                delete lessons[l.id];
                return {
                  ...c,
                  lessons,
                  modules: c.modules.map((m) => ({ ...m, lessonIds: m.lessonIds.filter((id) => id !== l.id) })),
                };
              });
              onDeleted();
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
          <Field label="Vídeo (YouTube, Vimeo ou link .mp4)" hint="Suba o vídeo no YouTube como Não listado e cole o link aqui.">
            <Input value={l.video ?? ""} placeholder="https://youtu.be/..." onChange={(e) => patch({ video: e.target.value || undefined })} />
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
              Clique e arraste sobre o print para marcar um botão. Arraste a área para mover e use o canto verde para redimensionar.
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPrint(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <ImageUp /> {l.image ? "Trocar print" : "Subir print"}
          </Button>
        </div>

        {l.image ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <HotspotEditor
              image={l.image}
              hotspots={l.hotspots}
              selectedId={selected}
              onSelect={setSelected}
              onChange={(id, rect) => patchHotspot(id, rect)}
              onCreate={(rect) => {
                const id = newId("ponto");
                patch({ hotspots: [...l.hotspots, { id, ...rect, title: "Novo item", description: "Explique o que este botão faz." }] });
                setSelected(id);
              }}
            />
            <div className="space-y-3">
              {sel ? (
                <div className="space-y-3 rounded-xl border border-lime bg-background p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    Item {l.hotspots.indexOf(sel) + 1}
                  </p>
                  <Field label="Nome do botão/campo">
                    <Input value={sel.title} onChange={(e) => patchHotspot(sel.id, { title: e.target.value })} />
                  </Field>
                  <Field label="O que ele faz">
                    <Textarea rows={5} value={sel.description} onChange={(e) => patchHotspot(sel.id, { description: e.target.value })} />
                  </Field>
                  <Field label="Dica (opcional)">
                    <Input value={sel.tip ?? ""} onChange={(e) => patchHotspot(sel.id, { tip: e.target.value || undefined })} />
                  </Field>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const i = l.hotspots.indexOf(sel);
                        patch({ hotspots: move(l.hotspots, i, -1) });
                      }}
                    >
                      <ArrowUp /> Antes
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const i = l.hotspots.indexOf(sel);
                        patch({ hotspots: move(l.hotspots, i, 1) });
                      }}
                    >
                      <ArrowDown /> Depois
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto text-destructive"
                      onClick={() => {
                        patch({ hotspots: l.hotspots.filter((h) => h.id !== sel.id) });
                        setSelected(null);
                      }}
                    >
                      <Trash2 /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  Selecione uma área no print para editar a explicação.
                </p>
              )}
              <ol className="max-h-96 space-y-1 overflow-y-auto">
                {l.hotspots.map((h, i) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(h.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
                        selected === h.id ? "bg-secondary font-semibold" : "hover:bg-muted",
                      )}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate">{h.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-muted-foreground hover:border-primary hover:text-primary"
          >
            <ImageUp className="size-10" />
            Clique para subir o print desta tela
          </button>
        )}
      </div>
    </div>
  );
}
