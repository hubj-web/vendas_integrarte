import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { COOKIE_NAME } from "@/const";
import ForcePasswordChange from "@/components/ForcePasswordChange";
import { HighlightedTitle } from "@/components/HighlightedTitle";

const LOGO_URL = "/integrarte-logo.png";

export default function AdminLogin() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [needsPasswordChange, setNeedsPasswordChange] = useState(false);
  const utils = trpc.useUtils();

  const logoutMutation = trpc.auth.logout.useMutation();
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.role !== "admin") {
        toast.error("Acesso restrito ao administrador.");
        await logoutMutation.mutateAsync();
        return;
      }

      // Store the admin session token in sessionStorage so it is sent as
      // Authorization: Bearer on every subsequent request. This is necessary
      // because the browser may block HttpOnly cookies when the app runs inside
      // an iframe (SameSite=None + Secure policy on Safari / iOS WebView).
      if (data.sessionToken) {
        try {
          sessionStorage.setItem(
            "manus-cookie",
            `${COOKIE_NAME}=${data.sessionToken}`
          );
        } catch {
          // sessionStorage unavailable — cookie-only fallback will be used
        }
      }

      if (data.mustChangePassword) {
        setNeedsPasswordChange(true);
        return;
      }

      await utils.auth.me.invalidate();
      navigate("/admin/dashboard");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  if (needsPasswordChange) {
    return (
      <ForcePasswordChange
        currentPassword={password}
        onSuccess={() => navigate("/admin/dashboard")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Integrarte" className="h-24 w-auto mx-auto mb-3 drop-shadow-sm" />
          <h2 className="text-lg font-bold text-primary">
            <HighlightedTitle color="emerald">Área Administrativa</HighlightedTitle>
          </h2>
          <p className="text-sm text-muted-foreground">Acesso restrito</p>
        </div>

        {/* Card de login */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-semibold text-foreground">Usuário</Label>
              <Input
                id="email"
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Nome de usuário"
                autoComplete="username"
                required
                className="h-11 border-2 border-gray-200 focus:border-primary rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-semibold text-foreground">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="h-11 border-2 border-gray-200 focus:border-primary rounded-lg pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full h-11 rounded-lg font-bold text-base bg-primary hover:bg-primary/90 shadow-md mt-2"
            >
              {loginMutation.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar ao menu
          </a>
        </div>
      </div>
    </div>
  );
}
