import { type ReactNode } from "react";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { LogOut, GraduationCap, Users, Tags, Wallet, ArrowLeft, ClipboardCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { HighlightedTitle } from "@/components/HighlightedTitle";

const LOGO_URL = "/integrarte-logo.png";

const NAV_ITEMS = [
  { href: "/gestao/alunos", label: "Alunos", icon: GraduationCap },
  { href: "/gestao/professores", label: "Professores", icon: Users },
  { href: "/gestao/modalidades", label: "Modalidades", icon: Tags },
  { href: "/gestao/frequencia", label: "Frequência", icon: ClipboardCheck },
  { href: "/gestao/pagamentos", label: "Pagamentos", icon: Wallet },
];

interface GestaoLayoutProps {
  children: ReactNode;
}

export default function GestaoLayout({ children }: GestaoLayoutProps) {
  const { user, logout } = useLocalAuth();
  const [location, navigate] = useLocation();

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {
      // ignora se sessionStorage não estiver disponível
    }
    await logout();
    navigate("/gestao");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/90 backdrop-blur-sm shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <img src={LOGO_URL} alt="Integrarte" className="h-9 w-auto object-contain" />
            <span className="font-bold text-purple-700 text-sm hidden sm:inline">
              <HighlightedTitle color="purple">ERP Integrarte</HighlightedTitle>
            </span>
            {user && (
              <div className="hidden md:block ml-2">
                <span className="text-xs text-muted-foreground">Olá,</span>
                <span className="text-sm font-bold text-purple-700 ml-1">{user.name}</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-muted-foreground hover:text-destructive gap-1.5 text-xs"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>
      </header>

      {/* Nav tabs */}
      <nav className="border-b border-gray-100 bg-white/70 overflow-x-auto">
        <div className="max-w-5xl mx-auto px-4 flex gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = location === item.href || location.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                    active
                      ? "border-purple-600 text-purple-700"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
