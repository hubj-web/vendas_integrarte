import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { User, Mail, KeyRound, Eye, EyeOff } from "lucide-react";

/**
 * Tela "Meu Perfil" — o próprio usuário logado edita nome, e-mail (com
 * confirmação de senha) e pode trocar a senha. Usada igual nas três áreas
 * (admin, vendedor, entregador), já que todos usam a mesma sessão/backend.
 */
export default function Profile() {
  const { user } = useLocalAuth();
  const utils = trpc.useUtils();

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [emailPassword, setEmailPassword] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  const updateProfileMutation = trpc.users.updateOwnProfile.useMutation({
    onSuccess: async () => {
      toast.success("Dados atualizados!");
      setEmailPassword("");
      await utils.auth.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      toast.success("Senha alterada com sucesso!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSaveProfile() {
    const emailChanged = email !== user?.email;
    if (emailChanged && !emailPassword) {
      toast.error("Informe sua senha atual para trocar o e-mail.");
      return;
    }
    updateProfileMutation.mutate({
      name: name !== user?.name ? name : undefined,
      email: emailChanged ? email : undefined,
      currentPassword: emailChanged ? emailPassword : undefined,
    });
  }

  function handleChangePassword() {
    if (newPassword.length < 6) {
      toast.error("A nova senha precisa ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas novas não coincidem.");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
        <User className="w-5 h-5 text-primary" />
        Meu Perfil
      </h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Meus dados</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {email !== user?.email && (
            <div className="space-y-1.5">
              <Label>Senha atual (necessária para confirmar a troca de e-mail)</Label>
              <Input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Digite sua senha atual"
              />
            </div>
          )}
          <Button
            onClick={handleSaveProfile}
            disabled={updateProfileMutation.isPending || (name === user?.name && email === user?.email)}
          >
            {updateProfileMutation.isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" /> Trocar senha
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Senha atual</Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <Input
              type={showPw ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Confirme a nova senha</Label>
            <Input
              type={showPw ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          <Button
            onClick={handleChangePassword}
            disabled={changePasswordMutation.isPending || !currentPassword || !newPassword}
          >
            {changePasswordMutation.isPending ? "Salvando..." : "Trocar senha"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
