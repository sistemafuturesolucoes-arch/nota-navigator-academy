import {
  BarChart3,
  BookOpen,
  FileText,
  FolderOpen,
  Package,
  Receipt,
  Rocket,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export const MODULE_ICONS: Record<string, LucideIcon> = {
  Rocket,
  FolderOpen,
  FileText,
  BarChart3,
  Settings,
  Package,
  Users,
  Truck,
  Receipt,
  BookOpen,
};

export function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = MODULE_ICONS[name] ?? BookOpen;
  return <Icon className={className} />;
}
