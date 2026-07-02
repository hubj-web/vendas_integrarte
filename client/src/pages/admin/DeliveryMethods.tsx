import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Truck } from "lucide-react";

export default function DeliveryMethods() {
  const utils = trpc.useUtils();
  const { data: methods = [], isLoading } = trpc.catalog.deliveryMethods.list.useQuery();
  const createMutation = trpc.catalog.deliveryMethods.create.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Forma de entrega criada!"); setOpen(false); } });
  const updateMutation = trpc.catalog.deliveryMethods.update.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.catalog.deliveryMethods.delete.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Desativado!"); } });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", requiresAddress: false, active: true });

  return (
    <div>
      <PageHeader
        title="Formas de Entrega"
        description="Gerencie os métodos de entrega disponíveis"
        actions={<Button onClick={() => { setEditing(null); setForm({ name: "", description: "", requiresAddress: false, active: true }); setOpen(true); }} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Nova Forma</Button>}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {methods.map(m => (
          <Card key={m.id} className={`bg-card border-border hover:border-primary/30 transition-all ${!m.active ? "opacity-50" : ""}`}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between mb-2">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  {m.requiresAddress && <Badge variant="outline" className="text-xs">Requer endereço</Badge>}
                  <Badge className={m.active ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs" : "bg-muted text-muted-foreground text-xs"}>{m.active ? "Ativo" : "Inativo"}</Badge>
                </div>
              </div>
              <p className="font-semibold text-foreground">{m.name}</p>
              {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
              <Button variant="ghost" size="sm" className="mt-3 h-7 text-xs hover:text-primary gap-1" onClick={() => { setEditing(m); setForm({ name: m.name, description: m.description ?? "", requiresAddress: m.requiresAddress, active: m.active }); setOpen(true); }}>
                <Pencil className="w-3 h-3" />Editar
              </Button>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-card border-border border-dashed hover:border-primary/40 cursor-pointer transition-all group" onClick={() => { setEditing(null); setForm({ name: "", description: "", requiresAddress: false, active: true }); setOpen(true); }}>
          <CardContent className="pt-4 pb-3 flex flex-col items-center justify-center h-full min-h-[110px] gap-2">
            <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <p className="text-xs text-muted-foreground group-hover:text-primary transition-colors">Nova forma de entrega</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{editing ? "Editar Forma de Entrega" : "Nova Forma de Entrega"}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); editing ? updateMutation.mutate({ id: editing.id, name: form.name, description: form.description || undefined, requiresAddress: form.requiresAddress, active: form.active }) : createMutation.mutate({ name: form.name, description: form.description || undefined, requiresAddress: form.requiresAddress }); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input" /></div>
            <div className="flex items-center gap-2"><Switch checked={form.requiresAddress} onCheckedChange={v => setForm(f => ({ ...f, requiresAddress: v }))} /><Label>Requer endereço de entrega</Label></div>
            {editing && <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={v => setForm(f => ({ ...f, active: v }))} /><Label>Ativo</Label></div>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
