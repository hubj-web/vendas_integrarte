import { useState } from "react";
import { useLocation } from "wouter";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShoppingBag, Eye, EyeOff } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function Login() {
  const [, navigate] = useLocation();
  const { login, isLoggingIn } = useLocalAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [resetEmail, setResetEmail] = useState("");

  const resetMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: (data) => {
      toast.success("Se o e-mail existir, você receberá as instruções.");
      if (data.devToken) {
        toast.info(`[DEV] Token: ${data.devToken}`, { duration: 15000 });
      }
      setMode("login");
    },
  });

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      toast.error(err?.message ?? "Credenciais inválidas.");
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    resetMutation.mutate({ email: resetEmail });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md px-6">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-5 gold-glow">
            <ShoppingBag className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
            Gestão de Pedidos
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {mode === "login" ? "Acesse sua conta para continuar" : "Recuperação de senha"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl">
          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-muted-foreground">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="bg-input border-border h-11 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium text-muted-foreground">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="bg-input border-border h-11 pr-10 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoggingIn}
                className="w-full h-11 bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all gold-glow"
              >
                {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Entrar
              </Button>

              <button
                type="button"
                onClick={() => setMode("reset")}
                className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors mt-2"
              >
                Esqueci minha senha
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Informe seu e-mail para receber as instruções de recuperação de senha.
              </p>
              <div className="space-y-2">
                <Label htmlFor="resetEmail" className="text-sm font-medium text-muted-foreground">
                  E-mail
                </Label>
                <Input
                  id="resetEmail"
                  type="email"
                  placeholder="seu@email.com"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  required
                  className="bg-input border-border h-11"
                />
              </div>
              <Button
                type="submit"
                disabled={resetMutation.isPending}
                className="w-full h-11 bg-primary text-primary-foreground font-semibold"
              >
                {resetMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar instruções
              </Button>
              <button
                type="button"
                onClick={() => setMode("login")}
                className="w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 opacity-50">
          Sistema de Gestão de Pedidos e Entregas
        </p>
      </div>
    </div>
  );
}
