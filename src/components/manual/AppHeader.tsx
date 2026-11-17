import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, GraduationCap, LayoutDashboard, ShieldCheck } from "lucide-react";

import { SearchCommand } from "./SearchCommand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const logo = "/logo-future.png";
const SUPABASE_URL = "https://itbppoailqkuxajesgys.supabase.co";
const ADMIN_AUTH_URL = `${SUPABASE_URL}/functions/v1/admin-auth`;
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_J3-cgRigKn2QardNRaOFRQ_Jja51yof";
const ADMIN_SESSION_KEY = "future-manual-admin-session-v1";

const navLink =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sidebar-accent hover:text-ink-foreground";

type AdminSession = { access_token: string; refresh_token: string; expires_in?: number; mustChangePassword?: boolean };

async function adminRequest(action: string, body: Record<string, unknown> = {}, bootstrapSecret?: string) {
  const response = await fetch(ADMIN_AUTH_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      ...(bootstrapSecret ? { "x-bootstrap-secret": bootstrapSecret } : {}),
    },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; [key: string]: unknown };
  if (!response.ok) throw new Error(data.error || "Não foi possível autenticar.");
  return data;
}

export function AppHeader() {
  const navigate = useNavigate();
  const [panelOpen, setPanelOpen] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [bootstrapSecret, setBootstrapSecret] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const enterPanel = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const session = await adminRequest("login", { username, password }) as AdminSession;
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      setPanelOpen(false);
      setPassword("");
      await navigate({ to: "/admin" });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Falha ao entrar no painel.";
      if (/primeiro acesso.*não configurado|administrador inicial ainda não foi criado|nenhum administrador/i.test(message)) {
        setShowBootstrap(true);
        setNotice("Este painel ainda não tem um administrador cadastrado. Configure o primeiro acesso para criar a conta administrativa.");
        setError("");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const configureFirstAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await adminRequest("bootstrap", { password: initialPassword }, bootstrapSecret);
      const session = await adminRequest("login", { username: "admin", password: initialPassword }) as AdminSession;
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      setPanelOpen(false);
      setBootstrapSecret("");
      setInitialPassword("");
      await navigate({ to: "/admin" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível configurar o primeiro acesso.");
    } finally {
      setBusy(false);
    }
  };

  const openPanel = () => {
    setError("");
    setNotice("");
    setShowBootstrap(false);
    setPanelOpen(true);
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-sidebar-border bg-ink text-ink-foreground">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 lg:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3">
            <span className="rounded-lg bg-card px-2.5 py-1.5">
              <img src={logo} alt="Future Soluções" className="h-6 w-auto" />
            </span>
            <span className="hidden font-display text-sm font-semibold leading-tight md:block">
              Manual
              <br />
              <span className="text-lime">Interativo</span>
            </span>
          </Link>
          <div className="hidden flex-1 justify-center md:flex">
            <SearchCommand trigger="bar" />
          </div>
          <nav className="ml-auto flex items-center gap-1">
            <Link to="/" className={navLink} activeOptions={{ exact: true }} activeProps={{ className: "bg-sidebar-accent text-ink-foreground" }}>
              <GraduationCap className="size-4" />
              <span className="hidden sm:inline">Curso</span>
            </Link>
            <Link to="/assistente" search={{}} className={navLink} activeProps={{ className: "bg-sidebar-accent text-ink-foreground" }}>
              <Bot className="size-4" />
              <span className="hidden sm:inline">Assistente IA</span>
            </Link>
            <button type="button" onClick={openPanel} className={navLink}>
              <LayoutDashboard className="size-4" />
              <span className="hidden sm:inline">Painel</span>
            </button>
          </nav>
        </div>
      </header>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </div>
            <DialogTitle className="text-center">Painel administrativo</DialogTitle>
            <DialogDescription className="text-center">
              Acesso restrito ao administrador do manual.
            </DialogDescription>
          </DialogHeader>

          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</p>}

          {showBootstrap ? (
            <form onSubmit={configureFirstAccess} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="panel-bootstrap-secret">Chave de configuração inicial</Label>
                <Input id="panel-bootstrap-secret" type="password" autoComplete="off" value={bootstrapSecret} onChange={(e) => setBootstrapSecret(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel-initial-password">Crie a senha do administrador</Label>
                <Input id="panel-initial-password" type="password" autoComplete="new-password" minLength={8} value={initialPassword} onChange={(e) => setInitialPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Configurando..." : "Configurar e entrar"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setShowBootstrap(false); setError(""); }}>Voltar ao login</Button>
            </form>
          ) : (
            <form onSubmit={enterPanel} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="panel-username">Usuário</Label>
                <Input id="panel-username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panel-password">Senha</Label>
                <Input id="panel-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando..." : "Entrar no painel"}</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => { setShowBootstrap(true); setError(""); }}>
                Configurar primeiro acesso
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
