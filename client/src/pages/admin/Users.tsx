import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, KeyRound, Search } from "lucide-react";

const roleLabels: Record<string, string> = { admin: "Administrador", launcher: "Vendedor", delivery: "Entregador" };
const roleColors: Record<string, string> = {
  admin: "bg-primary/15 text-primary border-primary/20",
  launcher: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  delivery: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

function parseRoles(rolesStr: string | null | undefined): string[] {
  if (!rolesStr) return [];
  try {
    const parsed = JSON.parse(rolesStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getUserRoles(user: { role: string; roles?: string | null }): string[] {
  const fromJson = parseRoles(user.roles);
  if (fromJson.length > 0) return fromJson;
  // Fallback to legacy single role
  return [user.role];
}

export default function Users() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const { data: users = [], isLoading } = trpc.users.list.useQuery({ search: search || undefined });
  const createMutation = trpc.users.create.useMutation({ onSuccess: () => { utils.users.list.invalidate(); toast.success("Usuário criado!"); setOpen(false); } });
  const updateMutation = trpc.users.update.useMutation({ onSuccess: () => { utils.users.list.invalidate(); toast.success("Usuário atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.users.delete.useMutation({ onSuccess: () => { utils.users.list.invalidate(); toast.success("Usuário desativado!"); setDeleteId(null); } });
  const resetMutation = trpc.users.resetPassword.useMutation({
    onSuccess: (data) => {
      toast.success("Senha redefinida!");
      if (data.tempPassword) toast.info(`Senha temporária: ${data.tempPassword}`, { duration: 20000 });
      setResetId(null);
    },
  });

  const [open, setOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [resetId, setResetId] = useState<number | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", email: "", roles: ["launcher"] as string[], password: "" });

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", roles: ["launcher"], password: "" });
    setOpen(true);
  }

  function openEdit(u: any) {
    setEditing(u);
    setForm({ name: u.name, email: u.email, roles: getUserRoles(u), password: "" });
    setOpen(true);
  }

  function toggleRole(role: string) {
    setForm(f => {
      const current = f.roles;
      if (current.includes(role)) {
        // Don't allow removing all roles
        if (current.length <= 1) return f;
        return { ...f, roles: current.filter(r => r !== role) };
      } else {
        return { ...f, roles: [...current, role] };
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.roles.length === 0) return toast.error("Selecione pelo menos um perfil.");
    if (editing) {
      updateMutation.mutate({ id: editing.id, name: form.name, email: form.email, roles: form.roles as any });
    } else {
      if (!form.password) return toast.error("Senha obrigatória para novo usuário.");
      createMutation.mutate({ name: form.name, email: form.email, roles: form.roles as any, password: form.password });
    }
  }

  return (
    <div>
      <PageHeader
        title="Usuários"
        description="Gerencie os usuários do sistema"
        actions={<Button onClick={openCreate} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Novo Usuário</Button>}
      />

      <div className="relative max-w-xs mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar usuário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-input" />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Usuário</TableHead>
              <TableHead className="text-muted-foreground">E-mail</TableHead>
              <TableHead className="text-muted-foreground">Perfis</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground">Último acesso</TableHead>
              <TableHead className="text-right text-muted-foreground">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map(u => {
              const initials = u.name?.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2) ?? "?";
              const userRoles = getUserRoles(u);
              return (
                <TableRow key={u.id} className="border-border hover:bg-muted/20">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{initials}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm">{u.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {userRoles.map(r => (
                        <Badge key={r} className={`text-xs ${roleColors[r] ?? ""}`}>{roleLabels[r] ?? r}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell><Badge className={u.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs" : "bg-muted text-muted-foreground text-xs"}>{u.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" title="Editar" onClick={() => openEdit(u)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-orange-400" title="Redefinir senha" onClick={() => setResetId(u.id)}><KeyRound className="w-3.5 h-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" title="Desativar" onClick={() => setDeleteId(u.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Editar Usuário" : "Novo Usuário"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2"><Label>E-mail *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2">
              <Label>Perfis * <span className="text-xs text-muted-foreground font-normal">(selecione um ou mais)</span></Label>
              <div className="space-y-2 p-3 rounded-lg bg-muted/20 border border-border">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.roles.includes("admin")} onCheckedChange={() => toggleRole("admin")} />
                  <span className="text-sm">Administrador</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.roles.includes("launcher")} onCheckedChange={() => toggleRole("launcher")} />
                  <span className="text-sm">Vendedor</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={form.roles.includes("delivery")} onCheckedChange={() => toggleRole("delivery")} />
                  <span className="text-sm">Entregador</span>
                </label>
              </div>
            </div>
            {!editing && (
              <div className="space-y-2"><Label>Senha *</Label><Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required className="bg-input" placeholder="Mínimo 6 caracteres" /></div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle>Desativar usuário?</AlertDialogTitle><AlertDialogDescription>O usuário não poderá mais acessar o sistema.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-white">Desativar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetId !== null} onOpenChange={() => setResetId(null)}>
        <AlertDialogContent className="bg-card border-border"><AlertDialogHeader><AlertDialogTitle>Redefinir senha?</AlertDialogTitle><AlertDialogDescription>Uma senha temporária será gerada. O usuário deverá alterá-la no próximo acesso.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => resetId && resetMutation.mutate({ id: resetId })} className="bg-orange-500 text-white">Redefinir</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
