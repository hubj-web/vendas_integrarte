import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Package, Search, User, UserPlus, ArrowLeft, Boxes } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

type StockLine = {
  productId: number;
  productName: string | null;
  unit: string | null;
  flavorKey: string;
  flavorNames: string[];
  unitPrice: string;
  totalQuantity: number;
};

export default function Stock() {
  const utils = trpc.useUtils();
  const { data: stock, isLoading } = trpc.seller.stockAvailable.useQuery();

  const [selling, setSelling] = useState<StockLine | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const [deliveryMethodId, setDeliveryMethodId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix">("pix");
  const [notes, setNotes] = useState("");

  const { data: deliveryMethods = [] } = trpc.catalog.deliveryMethods.list.useQuery();
  const { data: searchResults } = trpc.seller.searchCustomers.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );

  const createCustomerMutation = trpc.seller.createCustomer.useMutation({
    onSuccess: (data) => {
      setSelectedCustomer({ id: data.id, name: newCustomer.name, phone: newCustomer.phone });
      setShowNewCustomer(false);
      toast.success("Cliente cadastrado!");
    },
    onError: (e) => toast.error(e.message),
  });

  const sellMutation = trpc.seller.sellFromStock.useMutation({
    onSuccess: () => {
      toast.success("Venda registrada e estoque atualizado!");
      utils.seller.stockAvailable.invalidate();
      resetDialog();
    },
    onError: (e) => toast.error(e.message),
  });

  function resetDialog() {
    setSelling(null);
    setQuantity("1");
    setCustomerSearch("");
    setSelectedCustomer(null);
    setShowNewCustomer(false);
    setNewCustomer({ name: "", phone: "" });
    setDeliveryMethodId("");
    setPaymentMethod("pix");
    setNotes("");
  }

  function openSellDialog(line: StockLine) {
    setSelling(line);
    setQuantity("1");
  }

  function handleConfirmSale() {
    if (!selling) return;
    if (!selectedCustomer) { toast.error("Selecione o cliente."); return; }
    if (!deliveryMethodId) { toast.error("Selecione a forma de entrega."); return; }
    const qty = parseInt(quantity);
    if (!qty || qty < 1) { toast.error("Quantidade inválida."); return; }
    if (qty > selling.totalQuantity) { toast.error(`Só há ${selling.totalQuantity} disponível.`); return; }

    sellMutation.mutate({
      productId: selling.productId,
      flavorKey: selling.flavorKey,
      quantity: qty,
      customerId: selectedCustomer.id,
      deliveryMethodId: Number(deliveryMethodId),
      paymentMethod,
      notes: notes || undefined,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Boxes className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Estoque Disponível</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-2">
        Itens já produzidos e reservados como estoque. Vender aqui desconta automaticamente
        do estoque — não precisa editar nada manualmente depois.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : !stock || stock.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum item em estoque no momento.</p>
          <p className="text-sm mt-1 opacity-70">
            Itens aparecem aqui quando há pedidos lançados para um cliente marcado como "interno".
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {stock.map((line: StockLine) => (
            <Card key={line.flavorKey} className="bg-card border-border">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">{line.productName}</p>
                  {line.flavorNames.length > 0 && (
                    <p className="text-xs text-muted-foreground">{line.flavorNames.join(", ")}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {fmt(line.unitPrice)} / {line.unit ?? "un."}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{line.totalQuantity}</p>
                    <p className="text-[10px] text-muted-foreground -mt-1">disponível</p>
                  </div>
                  <Button size="sm" onClick={() => openSellDialog(line)}>Vender</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Diálogo de venda */}
      <Dialog open={!!selling} onOpenChange={(v) => !v && resetDialog()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vender do Estoque</DialogTitle>
          </DialogHeader>

          {selling && (
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="font-medium text-sm">{selling.productName}</p>
                {selling.flavorNames.length > 0 && (
                  <p className="text-xs text-muted-foreground">{selling.flavorNames.join(", ")}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {selling.totalQuantity} disponível — {fmt(selling.unitPrice)} cada
                </p>
              </div>

              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  max={selling.totalQuantity}
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Cliente */}
              <div>
                <Label>Cliente</Label>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between mt-1 p-2.5 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {selectedCustomer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{selectedCustomer.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Trocar</Button>
                  </div>
                ) : showNewCustomer ? (
                  <div className="space-y-2 mt-1 p-3 rounded-lg border">
                    <Input placeholder="Nome" value={newCustomer.name} onChange={e => setNewCustomer(c => ({ ...c, name: e.target.value }))} />
                    <Input placeholder="Telefone" value={newCustomer.phone} onChange={e => setNewCustomer(c => ({ ...c, phone: e.target.value }))} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowNewCustomer(false)}>
                        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Voltar
                      </Button>
                      <Button
                        size="sm" className="flex-1"
                        disabled={!newCustomer.name || !newCustomer.phone || createCustomerMutation.isPending}
                        onClick={() => createCustomerMutation.mutate(newCustomer)}
                      >
                        Cadastrar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome ou telefone..."
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    {searchResults && searchResults.length > 0 && (
                      <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                        {searchResults.map((c: any) => (
                          <button
                            key={c.id}
                            className="w-full text-left px-3 py-2 hover:bg-muted/30 flex items-center gap-2 text-sm"
                            onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); }}
                          >
                            <User className="w-3.5 h-3.5 text-muted-foreground" />
                            {c.name} — {c.phone}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setShowNewCustomer(true)}>
                      <UserPlus className="w-3.5 h-3.5" /> Cadastrar novo cliente
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <Label>Forma de Entrega</Label>
                <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {deliveryMethods.map(dm => (
                      <SelectItem key={dm.id} value={String(dm.id)}>{dm.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "pix")}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Observações (opcional)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="mt-1 min-h-[60px]" />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>Cancelar</Button>
            <Button onClick={handleConfirmSale} disabled={sellMutation.isPending}>
              {sellMutation.isPending ? "Registrando..." : "Confirmar Venda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
