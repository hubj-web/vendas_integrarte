import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Users, Package, CalendarDays, Construction, LogOut } from "lucide-react";
import { HighlightedTitle } from "@/components/HighlightedTitle";
import { Button } from "@/components/ui/button";
import GestaoLogin from "./GestaoLogin";

const LOGO_URL = "/integrarte-logo.png";

const sections = [
  { label: "Voluntários", icon: Users, description: "Cadastro e escala de voluntários" },
  { label: "Suprimentos", icon: Package, description: "Controle de materiais e insumos da instituição" },
  { label: "Atividades", icon: CalendarDays, description: "Agenda e registro de atividades" },
];

function hasAdminRole(user: { role?: string } | null | undefined): boolean {
  return !!user && user.role === "admin";
}

export default function GestaoIntegrarte() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [, navigate] = useLocation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const utils = trpc.useUtils();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAdminRole(user)) return <GestaoLogin />;

  async function handleLogout() {
    try {
      sessionStorage.removeItem("manus-cookie");
    } catch {
      // ignora se sessionStorage não estiver disponível
    }
    await logoutMutation.mutateAsync();
    await utils.auth.me.invalidate();
    navigate("/gestao");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <Link href="/">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao menu
            </button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive gap-1.5 text-xs">
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </Button>
        </div>

        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Integrarte" className="h-20 w-auto mx-auto mb-3 drop-shadow-sm" />
          <h1 className="text-xl font-bold text-foreground">
            <HighlightedTitle color="purple">ERP Integrarte</HighlightedTitle>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão da instituição — voluntários, suprimentos e atividades
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Construction className="w-4 h-4" />
            <p className="text-sm font-semibold">Em construção</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Essa área ainda vai ser desenhada com calma — o menu abaixo mostra o que está
            planejado até agora.
          </p>
        </div>

        <div className="space-y-3">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 opacity-60"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
