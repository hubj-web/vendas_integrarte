import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";

const LOGO_URL = "/integrarte-logo.png";

/**
 * Tela exibida obrigatoriamente quando o usuário faz login pela primeira vez
 * (ou depois que o admin reseta a senha dele). A pessoa define a própria senha
 * nova antes de continuar — funciona igual para admin, vendedor e entregador,
 * já que todos usam o mesmo sistema de login.
 */
export default function ForcePasswordChange({
  currentPassword,
  onSuccess,
  themeColor = "primary",
}: {
  /** Senha atual (a temporária que o admin definiu), usada para autenticar a troca */
  currentPassword: string;
  onSuccess: () => void;
  themeColor?: "primary" | "secondary";
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const utils = trpc.useUtils();

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: async () => {
      toast.success("Senha alterada com sucesso!");
      await utils.auth.me.invalidate();
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in-up">
        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Integrarte" className="h-24 w-auto mx-auto mb-3 drop-shadow-sm" />
          <h2 className="text-lg font-bold text-primary flex items-center justify-center gap-2">
            <KeyRound className="w-5 h-5" />
            Defina sua senha
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            É o seu primeiro acesso — escolha uma senha só sua antes de continuar.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword" className="text-sm font-semibold text-foreground">Nova senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
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
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-sm font-semibold text-foreground">Confirme a senha</Label>
              <Input
                id="confirmPassword"
                type={showPw ? "text" : "password"}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Digite a senha novamente"
                autoComplete="new-password"
                required
                className="h-11 border-2 border-gray-200 focus:border-primary rounded-lg"
              />
            </div>

            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="w-full h-11 rounded-lg font-bold text-base bg-primary hover:bg-primary/90 shadow-md mt-2"
            >
              {changePasswordMutation.isPending ? "Salvando..." : "Salvar e continuar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
