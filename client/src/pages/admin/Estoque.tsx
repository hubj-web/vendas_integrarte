import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Boxes, Link as LinkIcon, ChevronDown, ChevronRight, Tag, Plus, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

export default function Estoque() {
  const utils = trpc.useUtils();
  const { data: estoque, isLoading } = trpc.estoque.list.useQuery();
  const { data: catalog } = trpc.catalog.products.list.useQuery();
  const [categoriasAbertas, setCategoriasAbertas] = useState<Set<string>>(new Set());

  const [manualOpen, setManualOpen] = useState(false);
  const [manualProductId, setManualProductId] = useState<string>("");
  const [manualFlavorId, setManualFlavorId] = useState<string>("");
  const [manualQtd, setManualQtd] = useState("");
  const [manualCusto, setManualCusto] = useState("");
  const [manualDisponibilizar, setManualDisponibilizar] = useState(true);
  const [manualPrecoLoja, setManualPrecoLoja] = useState("");
  const [manualLote, setManualLote] = useState("");
  const [manualValidade, setManualValidade] = useState("");

  const { data: flavorsData } = trpc.catalog.productFlavors.listAll.useQuery(undefined, { enabled: manualOpen });
  const selectedProduct = catalog?.find(p => p.id === Number(manualProductId));
  const availableFlavors = (flavorsData ?? []).filter(f => f.productId === Number(manualProductId));

  const adicionarManual = trpc.estoque.adicionarManual.useMutation({
    onSuccess: () => {
      utils.estoque.list.invalidate();
      utils.storeAdmin.listStockProducts.invalidate();
      toast.success("Estoque adicionado!");
      setManualOpen(false);
      setManualProductId(""); setManualFlavorId(""); setManualQtd(""); setManualCusto("");
      setManualDisponibilizar(true); setManualPrecoLoja("");
      setManualLote(""); setManualValidade("");
    },
    onError: (err) => toast.error(err.message || "Não foi possível adicionar."),
  });

  // Gerenciar lotes (editar quantidade / excluir um lançamento específico)
  const [loteDialogFor, setLoteDialogFor] = useState<{ id: number; quantidade: number; lote: string | null; validade: Date | null } | null>(null);
  const [loteQtdDraft, setLoteQtdDraft] = useState("");
  const [expandedLotes, setExpandedLotes] = useState<Set<string>>(new Set());
  const updateLote = trpc.estoque.updateLote.useMutation({
    onSuccess: () => { utils.estoque.list.invalidate(); toast.success("Lote atualizado!"); setLoteDialogFor(null); },
    onError: (err) => toast.error(err.message || "Não foi possível atualizar."),
  });
  const deleteLote = trpc.estoque.deleteLote.useMutation({
    onSuccess: () => { utils.estoque.list.invalidate(); toast.success("Lote removido."); },
    onError: (err) => toast.error(err.message || "Não foi possível remover."),
  });

  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const bulkDeleteLotes = trpc.estoque.bulkDeleteLotes.useMutation({
    onSuccess: (data) => {
      utils.estoque.list.invalidate();
      toast.success(`${data.count} lançamento(s) excluído(s)!`);
      setSelectedItems(new Set());
    },
    onError: (err) => toast.error(err.message || "Não foi possível excluir."),
  });

  function toggleItemSelected(key: string) {
    setSelectedItems(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  function openLoteDialog(lote: { id: number; quantidade: number; lote: string | null; validade: Date | null }) {
    setLoteDialogFor(lote);
    setLoteQtdDraft(String(lote.quantidade));
  }

  function submitManual() {
    if (!manualProductId || !manualQtd || Number(manualQtd) < 1) {
      toast.error("Escolha o produto e uma quantidade válida.");
      return;
    }
    adicionarManual.mutate({
      productId: Number(manualProductId),
      quantidade: Number(manualQtd),
      custoUnitario: manualCusto || "0.00",
      flavorIds: manualFlavorId ? [Number(manualFlavorId)] : undefined,
      disponibilizarNaLoja: manualDisponibilizar,
      precoNaLoja: manualPrecoLoja || undefined,
      lote: manualLote || undefined,
      validade: manualValidade || undefined,
    });
  }

  const grupos = useMemo(() => {
    if (!estoque) return [];
    const map = new Map<string, { categoryName: string; itens: typeof estoque; quantidadeTotal: number; valorTotal: number }>();
    for (const item of estoque) {
      const key = item.categoryName ?? "Sem Categoria";
      if (!map.has(key)) map.set(key, { categoryName: key, itens: [], quantidadeTotal: 0, valorTotal: 0 });
      const grupo = map.get(key)!;
      grupo.itens.push(item);
      grupo.quantidadeTotal += item.quantidade;
      grupo.valorTotal += item.quantidade * parseFloat(item.custoMedioUnitario);
    }
    return Array.from(map.values()).sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }, [estoque]);

  function toggleCategoria(nome: string) {
    setCategoriasAbertas(prev => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  }

  const valorTotalEstoque = estoque?.reduce((acc, e) => acc + e.quantidade * parseFloat(e.custoMedioUnitario), 0) ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estoque Integrarte"
        description="Nível atual de cada produto — o que está disponível pra vender fora do período de vendas"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => setManualOpen(true)} className="gap-1.5">
              <Plus className="w-4 h-4" /> Adicionar Manualmente
            </Button>
            <Link href="/admin/config/pedidos-estoque">
              <Button variant="outline" className="gap-1.5">
                <LinkIcon className="w-4 h-4" /> Pedidos de Estoque
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Valor total em estoque (custo)</p>
          <p className="text-2xl font-bold text-foreground">{fmt(valorTotalEstoque)}</p>
        </CardContent>
      </Card>

      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-3">
          <p className="text-sm font-medium">{selectedItems.size} produto(s) selecionado(s)</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Set())}>Cancelar</Button>
            <Button
              size="sm" variant="destructive" disabled={bulkDeleteLotes.isPending}
              onClick={() => {
                const ids: number[] = [];
                for (const item of estoque ?? []) {
                  const key = `${item.productId}::${(item.flavorNames ?? []).join("|")}`;
                  if (selectedItems.has(key)) ids.push(...(item.lotes ?? []).map((l: any) => l.id));
                }
                if (ids.length === 0) return toast.error("Nada pra excluir nesses itens.");
                if (confirm(`Excluir todo o estoque de ${selectedItems.size} produto(s) selecionado(s)? Essa ação não pode ser desfeita.`)) {
                  bulkDeleteLotes.mutate({ ids });
                }
              }}
            >
              Excluir selecionados
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
      ) : estoque?.length === 0 ? (
        <div className="text-center py-20 bg-card border border-dashed border-border rounded-xl">
          <Boxes className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium">Nenhum item em estoque no momento.</h3>
          <p className="text-muted-foreground">Use "Adicionar Manualmente" pra um lançamento pontual, ou crie um Pedido de Estoque e marque como "Recebido".</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const aberta = categoriasAbertas.has(grupo.categoryName);
            return (
              <Card key={grupo.categoryName} className="overflow-hidden">
                <button
                  onClick={() => toggleCategoria(grupo.categoryName)}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <Tag className="w-4 h-4 text-primary shrink-0" />
                    <p className="font-semibold text-foreground">{grupo.categoryName}</p>
                    <Badge variant="outline" className="text-xs shrink-0">{grupo.itens.length} {grupo.itens.length === 1 ? "item" : "itens"}</Badge>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-primary">{fmt(grupo.valorTotal)}</p>
                    <p className="text-[10px] text-muted-foreground">{grupo.quantidadeTotal} unidades</p>
                  </div>
                </button>

                {aberta && (
                  <div className="border-t divide-y">
                    {grupo.itens.map((e: any, i) => {
                      const diasParaVencer = e.proximaValidade
                        ? Math.ceil((new Date(e.proximaValidade).getTime() - Date.now()) / 86400000)
                        : null;
                      const loteKey = `${e.productId}::${(e.flavorNames ?? []).join("|")}`;
                      const lotesAbertos = expandedLotes.has(loteKey);
                      return (
                      <div key={i} className="bg-muted/10">
                        <div className="p-4 flex items-center justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                              checked={selectedItems.has(loteKey)}
                              onChange={() => toggleItemSelected(loteKey)}
                            />
                            <div>
                              <p className="font-medium text-foreground text-sm">{e.productName}</p>
                              {e.flavorNames.length > 0 && (
                                <p className="text-xs text-muted-foreground">{e.flavorNames.join(", ")}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-0.5">Custo médio: {fmt(e.custoMedioUnitario)}/{e.unit}</p>
                              {diasParaVencer !== null && (
                              <Badge variant={diasParaVencer <= 5 ? "destructive" : "outline"} className="text-xs mt-1">
                                {diasParaVencer < 0 ? "Vencido" : diasParaVencer === 0 ? "Vence hoje" : `Vence em ${diasParaVencer} dia${diasParaVencer === 1 ? "" : "s"}`}
                              </Badge>
                            )}
                            </div>
                          </div>
                          <div className="text-right shrink-0 flex items-center gap-3">
                            <div>
                              <p className="text-lg font-bold text-primary">{e.quantidade}</p>
                              <Badge variant="outline" className="text-xs">{e.unit}</Badge>
                            </div>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => setExpandedLotes(prev => { const next = new Set(prev); next.has(loteKey) ? next.delete(loteKey) : next.add(loteKey); return next; })}
                            >
                              {lotesAbertos ? "Ocultar lotes" : `Gerenciar (${e.lotes?.length ?? 0})`}
                            </Button>
                          </div>
                        </div>
                        {lotesAbertos && (
                          <div className="px-4 pb-3 space-y-1.5">
                            {(e.lotes ?? []).map((lote: any) => (
                              <div key={lote.id} className="flex items-center justify-between gap-2 bg-background rounded-lg border px-3 py-2 text-sm">
                                <div className="text-xs text-muted-foreground">
                                  {lote.lote && <span className="mr-2">Lote: {lote.lote}</span>}
                                  {lote.validade && <span>Val: {new Date(lote.validade).toLocaleDateString("pt-BR")}</span>}
                                  {!lote.lote && !lote.validade && <span>Sem lote/validade cadastrado</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-medium">{lote.quantidade} {e.unit}</span>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openLoteDialog(lote)}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive"
                                    onClick={() => { if (confirm(`Excluir esse lançamento de "${e.productName}" (${lote.quantidade} ${e.unit})?`)) deleteLote.mutate({ id: lote.id }); }}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar ao Estoque Manualmente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pra lançar um produto pontual (ex: produção extra pra um evento) sem precisar simular um pedido de fornecedor.
            </p>
            <div>
              <Label>Produto</Label>
              <Select value={manualProductId} onValueChange={(v) => { setManualProductId(v); setManualFlavorId(""); }}>
                <SelectTrigger><SelectValue placeholder="Escolha o produto" /></SelectTrigger>
                <SelectContent>
                  {(catalog ?? []).map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedProduct && (selectedProduct.maxFlavors ?? 0) > 0 && availableFlavors.length > 0 && (
              <div>
                <Label>Sabor</Label>
                <Select value={manualFlavorId} onValueChange={setManualFlavorId}>
                  <SelectTrigger><SelectValue placeholder="Escolha o sabor" /></SelectTrigger>
                  <SelectContent>
                    {availableFlavors.map(f => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade</Label>
                <Input type="number" min={1} value={manualQtd} onChange={e => setManualQtd(e.target.value)} placeholder="Ex: 20" />
              </div>
              <div>
                <Label>Custo unitário (opcional)</Label>
                <Input type="number" step="0.01" min={0} value={manualCusto} onChange={e => setManualCusto(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lote (opcional)</Label>
                <Input value={manualLote} onChange={e => setManualLote(e.target.value)} placeholder="Ex: L2508" />
              </div>
              <div>
                <Label>Validade (opcional)</Label>
                <Input type="date" value={manualValidade} onChange={e => setManualValidade(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Preenchendo a validade, esse lote é consumido primeiro (antes dos sem validade), pra evitar desperdício.
            </p>
            <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer" htmlFor="disponibilizar-loja">Disponibilizar na Loja Pública agora</Label>
                <Switch id="disponibilizar-loja" checked={manualDisponibilizar} onCheckedChange={setManualDisponibilizar} />
              </div>
              {manualDisponibilizar && (
                <div>
                  <Label className="text-xs text-muted-foreground">Preço na loja (deixe vazio pra usar o preço padrão do produto)</Label>
                  <Input type="number" step="0.01" min={0} value={manualPrecoLoja} onChange={e => setManualPrecoLoja(e.target.value)} placeholder={selectedProduct ? fmt(selectedProduct.price) : "0.00"} />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Evita ter que ir em "Loja Pública → Produtos na Loja" separadamente depois.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button onClick={submitManual} disabled={adicionarManual.isPending}>
              {adicionarManual.isPending ? "Adicionando…" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={loteDialogFor !== null} onOpenChange={(open) => !open && setLoteDialogFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Lote</DialogTitle></DialogHeader>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" min={0} value={loteQtdDraft} onChange={e => setLoteQtdDraft(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Colocar 0 zera esse lote (fica registrado, mas some do estoque disponível).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLoteDialogFor(null)}>Cancelar</Button>
            <Button
              disabled={updateLote.isPending}
              onClick={() => {
                if (!loteDialogFor) return;
                const qtd = Number(loteQtdDraft);
                if (isNaN(qtd) || qtd < 0) return toast.error("Quantidade inválida.");
                updateLote.mutate({ id: loteDialogFor.id, quantidade: qtd });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
