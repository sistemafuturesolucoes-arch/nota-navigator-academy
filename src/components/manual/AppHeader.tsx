import { Link } from "@tanstack/react-router";
import { Bot, GraduationCap, LayoutDashboard } from "lucide-react";

import { SearchCommand } from "./SearchCommand";

const logo = "/manual/logo-future.png";

const navLink =
  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-sidebar-accent hover:text-ink-foreground";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-sidebar-border bg-ink text-ink-foreground">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-4 px-4 lg:px-6">
        <Link to="/" reloadDocument className="flex shrink-0 items-center gap-3">
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
          <Link to="/" reloadDocument className={navLink} activeOptions={{ exact: true }} activeProps={{ className: "bg-sidebar-accent text-ink-foreground" }}>
            <GraduationCap className="size-4" />
            <span className="hidden sm:inline">Curso</span>
          </Link>
          <Link to="/assistente" search={{}} reloadDocument className={navLink} activeProps={{ className: "bg-sidebar-accent text-ink-foreground" }}>
            <Bot className="size-4" />
            <span className="hidden sm:inline">Assistente IA</span>
          </Link>
          <Link to="/admin" reloadDocument className={navLink} activeProps={{ className: "bg-sidebar-accent text-ink-foreground" }}>
            <LayoutDashboard className="size-4" />
            <span className="hidden sm:inline">Painel</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
