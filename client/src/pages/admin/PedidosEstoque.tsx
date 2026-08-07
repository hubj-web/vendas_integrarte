import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Truck, Trash2, Send, PackageCheck, X, Printer, Boxes } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const statusConfig: Record<string, { label: string; color: string }> = {
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-600 border-gray-200" },
  enviado: { label: "Enviado ao Fornecedor", color: "bg-blue-100 text-blue-700 border-blue-200" },
  recebido: { label: "Recebido", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  cancelado: { label: "Cancelado", color: "bg-red-100 text-red-700 border-red-200" },
};

type ItemForm = { productId: number; productName: string; quantidade: string; custoUnitario: string; flavorIds: number[]; flavorNames: string[] };

export default function PedidosEstoque() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data: pedidos, isLoading } = trpc.pedidosEstoque.list.useQuery();
  const { data: suppliers = [] } = trpc.suppliers.list.useQuery();
  const { data: products = [] } = trpc.catalog.products.list.useQuery({ activeOnly: true });
  const { data: allFlavors = [] } = trpc.catalog.productFlavors.listAll.useQuery();

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [fornecedorId, setFornecedorId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([]);
  const [novoItem, setNovoItem] = useState({ productId: "", quantidade: "1", custoUnitario: "", flavorIds: [] as number[] });
  const [cancelarId, setCancelarId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [confirmarRecebido, setConfirmarRecebido] = useState<number | null>(null);

  const createMutation = trpc.pedidosEstoque.create.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); toast.success("Pedido de estoque criado!"); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.pedidosEstoque.update.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); toast.success("Pedido atualizado!"); closeDialog(); },
    onError: (e) => toast.error(e.message),
  });
  const enviarMutation = trpc.pedidosEstoque.marcarEnviado.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); toast.success("Marcado como enviado!"); },
    onError: (e) => toast.error(e.message),
  });
  const receberMutation = trpc.pedidosEstoque.marcarRecebido.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); utils.estoque.list.invalidate(); toast.success("Estoque atualizado!"); setConfirmarRecebido(null); },
    onError: (e) => toast.error(e.message),
  });
  const cancelarMutation = trpc.pedidosEstoque.cancelar.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); toast.success("Pedido cancelado."); setCancelarId(null); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.pedidosEstoque.delete.useMutation({
    onSuccess: () => { utils.pedidosEstoque.list.invalidate(); toast.success("Pedido excluído."); setDeleteId(null); },
    onError: (e) => toast.error(e.message),
  });

  function closeDialog() {
    setOpen(false);
    setEditId(null);
    setFornecedorId("");
    setDescricao("");
    setObservacoes("");
    setItens([]);
    setNovoItem({ productId: "", quantidade: "1", custoUnitario: "", flavorIds: [] });
  }

  function openCreate() {
    closeDialog();
    setOpen(true);
  }

  async function openEdit(id: number) {
    const pedido = await utils.pedidosEstoque.getById.fetch({ id });
    if (!pedido) return;
    setEditId(id);
    setFornecedorId(String(pedido.fornecedorId));
    setDescricao(pedido.descricao ?? "");
    setObservacoes(pedido.observacoes ?? "");
    setItens(pedido.itens.map(i => ({
      productId: i.productId, productName: i.productName ?? "",
      quantidade: String(i.quantidade), custoUnitario: i.custoUnitario,
      flavorIds: [], flavorNames: i.flavorNames,
    })));
    setOpen(true);
  }

  const flavorsDoProdutoSelecionado = allFlavors.filter(f => f.productId === Number(novoItem.productId));
  const produtoSelecionado = products.find(p => p.id === Number(novoItem.productId));

  function addItem() {
    if (!novoItem.productId || !novoItem.quantidade || !novoItem.custoUnitario) {
      toast.error("Preencha produto, quantidade e custo.");
      return;
    }
    const produto = products.find(p => p.id === Number(novoItem.productId));
    const flavorNames = allFlavors.filter(f => novoItem.flavorIds.includes(f.id)).map(f => f.name);
    setItens(prev => [...prev, {
      productId: Number(novoItem.productId), productName: produto?.name ?? "",
      quantidade: novoItem.quantidade, custoUnitario: novoItem.custoUnitario,
      flavorIds: novoItem.flavorIds, flavorNames,
    }]);
    setNovoItem({ productId: "", quantidade: "1", custoUnitario: "", flavorIds: [] });
  }

  function removeItem(idx: number) {
    setItens(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    if (!fornecedorId) { toast.error("Selecione o fornecedor."); return; }
    if (itens.length === 0) { toast.error("Adicione pelo menos um item."); return; }
    const payload = {
      fornecedorId: Number(fornecedorId), descricao: descricao || undefined, observacoes: observacoes || undefined,
      itens: itens.map(i => ({ productId: i.productId, quantidade: Number(i.quantidade), custoUnitario: i.custoUnitario, flavorIds: i.flavorIds })),
    };
    if (editId) {
      updateMutation.mutate({ id: editId, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  const valorTotalItens = itens.reduce((acc, i) => acc + Number(i.quantidade || 0) * parseFloat(i.custoUnitario || "0"), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pedidos de Estoque"
        description="Monte, envie e receba pedidos de compra pros fornecedores — ao marcar como recebido, entra automático no estoque"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/config/estoque")} className="gap-1.5">
              <Boxes className="w-4 h-4" /> Ver Estoque
            </Button>
            <Button onClick={openCreate} className="gap-1.5">
              <Plus className="w-4 h-4" /> Novo Pedido de Estoque
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}</div>
      ) : pedidos?.length === 0 ? (
        <div className="text-center py-20 bg-card border border-dashed border-border rounded-xl">
          <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium">Nenhum pedido de estoque ainda.</h3>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pedidos?.map((p) => {
            const cfg = statusConfig[p.status];
            return (
              <Card key={p.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-foreground">{p.descricao || `Pedido #${p.id}`}</p>
                      <Badge className={`text-xs ${cfg.color}`}>{cfg.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {p.fornecedorNome} — {p.totalItens} {p.totalItens === 1 ? "item" : "itens"} — {fmt(p.valorTotal)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.status === "rascunho" && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(p.id)}>Editar</Button>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/admin/config/pedidos-estoque/${p.id}/imprimir`, "_blank")}>
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" className="gap-1.5" onClick={() => enviarMutation.mutate({ id: p.id })}>
                          <Send className="w-3.5 h-3.5" /> Marcar Enviado
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setDeleteId(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {p.status === "enviado" && (
                      <>
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/admin/config/pedidos-estoque/${p.id}/imprimir`, "_blank")}>
                          <Printer className="w-3.5 h-3.5" /> Imprimir
                        </Button>
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={() => setConfirmarRecebido(p.id)}>
                          <PackageCheck className="w-3.5 h-3.5" /> Marcar Recebido
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => setCancelarId(p.id)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    {p.status === "recebido" && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(`/admin/config/pedidos-estoque/${p.id}/imprimir`, "_blank")}>
                        <Printer className="w-3.5 h-3.5" /> Imprimir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Formulário de criação/edição */}
      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Editar Pedido de Estoque" : "Novo Pedido de Estoque"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fornecedor *</Label>
                <Select value={fornecedorId} onValueChange={setFornecedorId}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Descrição (opcional)</Label>
                <Input placeholder="Ex: Reposição Agosto" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              </div>
            </div>

            <div className="border rounded-lg p-3 space-y-3 bg-muted/20">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Adicionar item</p>
              <div className="grid grid-cols-2 gap-2">
                <Select value={novoItem.productId} onValueChange={(v) => setNovoItem(n => ({ ...n, productId: v, flavorIds: [] }))}>
                  <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" placeholder="Qtd" value={novoItem.quantidade} onChange={(e) => setNovoItem(n => ({ ...n, quantidade: e.target.value }))} />
                  <Input type="number" step="0.01" placeholder="Custo/un" value={novoItem.custoUnitario} onChange={(e) => setNovoItem(n => ({ ...n, custoUnitario: e.target.value }))} />
                </div>
              </div>
              {produtoSelecionado && (produtoSelecionado.maxFlavors ?? 0) > 0 && flavorsDoProdutoSelecionado.length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Sabores (opcional)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {flavorsDoProdutoSelecionado.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setNovoItem(n => ({
                          ...n,
                          flavorIds: n.flavorIds.includes(f.id) ? n.flavorIds.filter(id => id !== f.id) : [...n.flavorIds, f.id],
                        }))}
                        className={`px-2.5 py-1 rounded-full text-xs border ${
                          novoItem.flavorIds.includes(f.id) ? "bg-primary text-primary-foreground border-primary" : "bg-white text-muted-foreground border-gray-200"
                        }`}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={addItem} className="gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>

            {itens.length > 0 && (
              <div className="space-y-1.5">
                {itens.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm border-b pb-1.5">
                    <div>
                      <span className="font-medium">{item.productName}</span>
                      {item.flavorNames.length > 0 && <span className="text-xs text-muted-foreground ml-1.5">({item.flavorNames.join(", ")})</span>}
                      <span className="text-xs text-muted-foreground ml-1.5">— {item.quantidade}x {fmt(item.custoUnitario)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{fmt(Number(item.quantidade) * parseFloat(item.custoUnitario || "0"))}</span>
                      <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-end pt-1">
                  <span className="text-sm font-bold">Total: {fmt(valorTotalItens)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className="min-h-[60px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? "Salvar Alterações" : "Criar Pedido (Rascunho)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmarRecebido} onOpenChange={(v) => !v && setConfirmarRecebido(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso dá entrada automática de todos os itens no estoque, e o valor pago entra
              nos relatórios financeiros como custo. Confira se as quantidades e custos estão
              corretos antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmarRecebido && receberMutation.mutate({ id: confirmarRecebido })} className="bg-emerald-600 text-white">
              Confirmar Recebimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelarId} onOpenChange={(v) => !v && setCancelarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este pedido de estoque?</AlertDialogTitle>
            <AlertDialogDescription>Não afeta o estoque (ele ainda não tinha dado entrada). Fica registrado como cancelado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancelarId && cancelarMutation.mutate({ id: cancelarId })} className="bg-destructive text-white">
              Cancelar Pedido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este rascunho?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })} className="bg-destructive text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
