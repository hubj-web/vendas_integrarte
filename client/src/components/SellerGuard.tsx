import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import SellerLogin from "@/pages/seller/SellerLogin";

function hasLauncherRole(user: { role?: string; roles?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "launcher" || user.role === "admin") return true;
  try {
    const parsed = JSON.parse(user.roles ?? "[]");
    return Array.isArray(parsed) && parsed.includes("launcher");
  } catch {
    return false;
  }
}

interface SellerGuardProps {
  children: ReactNode;
}

/**
 * Protege as rotas da Área do Vendedor: exige login com função de vendedor
 * (ou admin). Se não estiver autenticado/autorizado, mostra a tela de login
 * em vez do conteúdo, sem precisar redirecionar de página.
 */
export default function SellerGuard({ children }: SellerGuardProps) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !hasLauncherRole(user)) {
    return <SellerLogin />;
  }

  return <>{children}</>;
}
