import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import GestaoLogin from "@/pages/GestaoLogin";

function hasAdminRole(user: { role?: string } | null | undefined): boolean {
  return !!user && user.role === "admin";
}

interface GestaoGuardProps {
  children: ReactNode;
}

/**
 * Protege as rotas da Gestão Integrarte (ERP Integrarte): por enquanto usa o
 * mesmo nível de acesso do admin. Se não estiver autenticado/autorizado,
 * mostra a tela de login em vez do conteúdo.
 */
export default function GestaoGuard({ children }: GestaoGuardProps) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-300 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasAdminRole(user)) return <GestaoLogin />;

  return <>{children}</>;
}
