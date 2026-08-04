import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, CheckCircle2 } from "lucide-react";

/**
 * Modal de "Esqueci minha senha" — pede o e-mail cadastrado e dispara o envio
 * do link de redefinição. Funciona igual para admin, vendedor e entregador,
 * já que todos usam o mesmo sistema de login.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const requestMutation = trpc.auth.requestPasswordReset.useMutation({
    onSuccess: () => setSent(true),
    onError: (e) => toast.error(e.message),
  });

  function handleClose(v: boolean) {
    if (!v) {
      setEmail("");
      setSent(false);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Esqueci minha senha</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="text-center py-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm text-foreground font-medium">Verifique seu e-mail</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              Se <strong>{email}</strong> estiver cadastrado no sistema, enviamos um link
              para você redefinir a senha. O link expira em 1 hora.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Digite o e-mail cadastrado na sua conta — vamos enviar um link para você criar
              uma senha nova.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">E-mail</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="pl-9"
                  autoComplete="email"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
              <Button
                disabled={!email || requestMutation.isPending}
                onClick={() => requestMutation.mutate({ email })}
              >
                {requestMutation.isPending ? "Enviando..." : "Enviar link"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
