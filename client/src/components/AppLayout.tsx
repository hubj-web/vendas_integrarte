import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  LayoutDashboard, ShoppingBag, ClipboardList, Truck, Package,
  BarChart3, Settings, Users, LogOut, Menu, X, ChevronRight,
  Pizza, Grape, MapPin, CreditCard, AlertCircle, Tag, Download, Database,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: ("admin" | "launcher" | "delivery")[];
  badge?: number;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Pedidos", href: "/admin/pedidos", icon: ClipboardList },
  { label: "Rotas de Entrega", href: "/admin/rotas", icon: MapPin },
  { label: "Entregas", href: "/admin/entregas-pagamentos", icon: Truck },
  { label: "Relatórios", href: "/admin/relatorios", icon: BarChart3 },
  { label: "Produção/Fornecedores", href: "/admin/relatorio-producao", icon: Package },
  { label: "Exportações", href: "/admin/exportar", icon: Download },
];

const adminNavItems: NavItem[] = [
  { label: "Categorias", href: "/admin/config/categorias", icon: Tag },
  { label: "Produtos", href: "/admin/config/produtos", icon: Package },
  { label: "Fornecedores", href: "/admin/config/fornecedores", icon: Truck },
  { label: "Formas de Entrega", href: "/admin/config/formas-entrega", icon: Truck },
  { label: "Usuários", href: "/admin/config/usuarios", icon: Users },
  { label: "Backup", href: "/admin/config/backup", icon: Database },
];

function NavLink({ item, currentPath, collapsed }: { item: NavItem; currentPath: string; collapsed: boolean }) {
  const isActive = currentPath === item.href || (item.href !== "/" && currentPath.startsWith(item.href));
  const Icon = item.icon;

  return (
    <Link href={item.href}>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer group",
          isActive
            ? "bg-primary/15 text-primary border border-primary/20"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        )}
      >
        <Icon className={cn("w-4.5 h-4.5 flex-shrink-0", isActive ? "text-primary" : "text-current")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && isActive && <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary/60" />}
      </div>
    </Link>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: user } = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role as "admin" | "launcher" | "delivery" | undefined;

  const visibleNav = navItems.filter(item => !item.roles || (role && item.roles.includes(role)));

  async function handleLogout() {
    await logoutMutation.mutateAsync();
    // Clear admin session token from sessionStorage (Bearer fallback)
    try { sessionStorage.removeItem("manus-cookie"); } catch {}
    await utils.auth.me.invalidate();
    toast.success("Sess\u00e3o encerrada.");
    window.location.href = "/admin";
  }

  const roleLabel = role === "admin" ? "Administrador" : role === "launcher" ? "Vendedor" : "Entregador";
  const initials = user?.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={cn("flex items-center justify-center px-4 py-4", collapsed && "py-3")}>
        {collapsed ? (
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <ShoppingBag className="w-5 h-5 text-white" />
          </div>
        ) : (
          <img
            src="/integrarte-logo.png"
            alt="Integrarte"
            className="h-16 w-auto object-contain"
          />
        )}
      </div>

      <Separator className="bg-sidebar-border mx-3 mb-3" />

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {visibleNav.map(item => (
          <NavLink key={item.href} item={item} currentPath={location} collapsed={collapsed} />
        ))}

        {/* Admin section */}
        {role === "admin" && (
          <>
            <div className={cn("pt-4 pb-1", collapsed && "hidden")}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
                Configurações
              </p>
            </div>
            {collapsed && <Separator className="bg-sidebar-border my-2" />}
            {adminNavItems.map(item => (
              <NavLink key={item.href} item={item} currentPath={location} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      <Separator className="bg-sidebar-border mx-3 mt-3" />

      {/* User info */}
      <div className={cn("px-3 py-4 flex items-center gap-3", collapsed && "justify-center")}>
        <Avatar className="w-8 h-8 flex-shrink-0 border border-primary/20">
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{roleLabel}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
          title="Sair"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 flex-shrink-0",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute top-4 -right-3 z-10 hidden lg:flex w-6 h-6 bg-sidebar border border-sidebar-border rounded-full items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          style={{ marginLeft: collapsed ? "3.5rem" : "14.5rem" }}
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <X className="w-3 h-3" />}
        </button>
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "lg:hidden fixed left-0 top-0 bottom-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <button onClick={() => setMobileOpen(true)} className="text-muted-foreground">
            <Menu className="w-5 h-5" />
          </button>
          <img src="/integrarte-logo.png" alt="Integrarte" className="h-8 w-auto object-contain" />
          <span className="font-semibold text-foreground text-sm">Gestão de Pedidos</span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
