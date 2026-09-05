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
  const { data: products = [] } = trpc.catalog.products.list.useQuery();
  const createMutation = trpc.catalog.deliveryMethods.create.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Forma de entrega criada!"); setOpen(false); } });
  const updateMutation = trpc.catalog.deliveryMethods.update.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Atualizado!"); setOpen(false); } });
  const deleteMutation = trpc.catalog.deliveryMethods.delete.useMutation({ onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Desativado!"); } });

  const createRule = trpc.catalog.deliveryMethods.rules.create.useMutation({
    onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Regra criada!"); setRuleForm({ deliveryMethodId: null, ruleType: "valor_minimo", minOrderValue: "", productId: "", minQuantity: "" }); },
    onError: (e) => toast.error(e.message),
  });
  const deleteRule = trpc.catalog.deliveryMethods.rules.delete.useMutation({
    onSuccess: () => { utils.catalog.deliveryMethods.list.invalidate(); toast.success("Regra removida."); },
  });
  const [ruleForm, setRuleForm] = useState<{ deliveryMethodId: number | null; ruleType: "valor_minimo" | "quantidade_produto"; minOrderValue: string; productId: string; minQuantity: string }>({
    deliveryMethodId: null, ruleType: "valor_minimo", minOrderValue: "", productId: "", minQuantity: "",
  });

  function submitRule(deliveryMethodId: number) {
    if (ruleForm.ruleType === "valor_minimo" && !ruleForm.minOrderValue) { toast.error("Informe o valor mínimo."); return; }
    if (ruleForm.ruleType === "quantidade_produto" && (!ruleForm.productId || !ruleForm.minQuantity)) { toast.error("Informe o produto e a quantidade."); return; }
    createRule.mutate({
      deliveryMethodId, ruleType: ruleForm.ruleType,
      minOrderValue: ruleForm.ruleType === "valor_minimo" ? ruleForm.minOrderValue : undefined,
      productId: ruleForm.ruleType === "quantidade_produto" ? Number(ruleForm.productId) : undefined,
      minQuantity: ruleForm.ruleType === "quantidade_produto" ? Number(ruleForm.minQuantity) : undefined,
    });
  }

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", requiresAddress: false, active: true, cost: "0.00" });
  const [expandedRulesFor, setExpandedRulesFor] = useState<number | null>(null);

  return (
    <div>
      <PageHeader
        title="Formas de Entrega"
        description="Gerencie os métodos de entrega disponíveis"
        actions={<Button onClick={() => { setEditing(null); setForm({ name: "", description: "", requiresAddress: false, active: true, cost: "0.00" }); setOpen(true); }} className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" />Nova Forma</Button>}
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
              {Number(m.cost) > 0 && <p className="text-xs text-primary font-medium mt-1">Custo: R$ {m.cost}</p>}
              <Button variant="ghost" size="sm" className="mt-3 h-7 text-xs hover:text-primary gap-1" onClick={() => { setEditing(m); setForm({ name: m.name, description: m.description ?? "", requiresAddress: m.requiresAddress, active: m.active, cost: m.cost ?? "0.00" }); setOpen(true); }}>
                <Pencil className="w-3 h-3" />Editar
              </Button>
              <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs hover:text-primary gap-1 w-full justify-start" onClick={() => setExpandedRulesFor(expandedRulesFor === m.id ? null : m.id)}>
                🚚 Regras de frete grátis {m.rules?.length > 0 ? `(${m.rules.length})` : ""}
              </Button>
              {expandedRulesFor === m.id && (
                <div className="mt-2 space-y-2 border-t pt-2">
                  {(m.rules ?? []).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-xs bg-muted/40 rounded px-2 py-1.5">
                      <span>
                        {r.ruleType === "valor_minimo"
                          ? `Grátis acima de R$ ${Number(r.minOrderValue).toFixed(2)}`
                          : `Grátis levando ${r.minQuantity}+ de "${products.find((p: any) => p.id === r.productId)?.name ?? `#${r.productId}`}"`}
                      </span>
                      <button onClick={() => deleteRule.mutate({ id: r.id })} className="text-destructive hover:underline shrink-0 ml-2">remover</button>
                    </div>
                  ))}
                  <div className="space-y-1.5 bg-muted/20 rounded p-2">
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={ruleForm.ruleType === "valor_minimo" ? "default" : "outline"} className="h-6 text-[10px] flex-1" onClick={() => setRuleForm(f => ({ ...f, ruleType: "valor_minimo" }))}>Valor mínimo</Button>
                      <Button size="sm" variant={ruleForm.ruleType === "quantidade_produto" ? "default" : "outline"} className="h-6 text-[10px] flex-1" onClick={() => setRuleForm(f => ({ ...f, ruleType: "quantidade_produto" }))}>Qtd. de produto</Button>
                    </div>
                    {ruleForm.ruleType === "valor_minimo" ? (
                      <Input
                        type="number" step="0.01" min="0" placeholder="Valor mínimo do pedido (R$)" className="h-7 text-xs"
                        value={ruleForm.minOrderValue} onChange={e => setRuleForm(f => ({ ...f, minOrderValue: e.target.value }))}
                      />
                    ) : (
                      <div className="flex gap-1.5">
                        <select
                          className="h-7 text-xs flex-1 rounded border bg-background px-1"
                          value={ruleForm.productId} onChange={e => setRuleForm(f => ({ ...f, productId: e.target.value }))}
                        >
                          <option value="">Produto...</option>
                          {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Input
                          type="number" min="1" placeholder="Qtd." className="h-7 text-xs w-16"
                          value={ruleForm.minQuantity} onChange={e => setRuleForm(f => ({ ...f, minQuantity: e.target.value }))}
                        />
                      </div>
                    )}
                    <Button size="sm" className="h-6 text-[10px] w-full" onClick={() => submitRule(m.id)} disabled={createRule.isPending}>
                      + Adicionar regra
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        <Card className="bg-card border-border border-dashed hover:border-primary/40 cursor-pointer transition-all group" onClick={() => { setEditing(null); setForm({ name: "", description: "", requiresAddress: false, active: true, cost: "0.00" }); setOpen(true); }}>
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
          <form onSubmit={e => { e.preventDefault(); editing ? updateMutation.mutate({ id: editing.id, name: form.name, description: form.description || undefined, requiresAddress: form.requiresAddress, active: form.active, cost: form.cost }) : createMutation.mutate({ name: form.name, description: form.description || undefined, requiresAddress: form.requiresAddress, cost: form.cost }); }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
            <div className="space-y-2"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="bg-input" /></div>
            <div className="space-y-2">
              <Label>Custo de entrega (opcional)</Label>
              <Input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} className="bg-input" placeholder="0.00" />
              <p className="text-xs text-muted-foreground">Quando maior que zero, soma automaticamente no total do pedido da Loja Pública.</p>
            </div>
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
