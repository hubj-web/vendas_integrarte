import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Search, Plus, Minus, X, User, ShoppingCart, Pizza,
  Grape, Package, ChevronRight, ChevronLeft, Check, Loader2
} from "lucide-react";

type CartItem = { type: "product"; productId: number; name: string; unit: string; price: number; quantity: number };
type CartMinipizza = { type: "minipizza"; tempId: string; typeId: number; typeName: string; flavorIds: number[]; flavorNames: string[]; price: number; additionalPrice: number; quantity: number };
type CartJelly = { type: "jelly"; flavorId: number; name: string; price: number; quantity: number };
type CartEntry = CartItem | CartMinipizza | CartJelly;

export default function NewOrder() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Data
  const { data: products = [] } = trpc.catalog.products.list.useQuery({ activeOnly: true });
  const { data: mpTypes = [] } = trpc.catalog.minipizzaTypes.list.useQuery();
  const { data: mpFlavors = [] } = trpc.catalog.minipizzaFlavors.list.useQuery();
  const { data: matrix = [] } = trpc.catalog.minipizzaFlavors.getMatrix.useQuery();
  const { data: jellyFlavors = [] } = trpc.catalog.jellyFlavors.list.useQuery();
  const { data: deliveryMethods = [] } = trpc.catalog.deliveryMethods.list.useQuery();

  const createOrderMutation = trpc.orders.create.useMutation({
    onSuccess: (data) => { toast.success("Pedido criado com sucesso!"); navigate(`/admin/pedidos/${data.orderId}`); },
    onError: (e) => toast.error(e.message),
  });
  const createCustomerMutation = trpc.orders.customers.create.useMutation({
    onSuccess: (data) => { toast.success("Cliente cadastrado!"); setSelectedCustomer({ id: data.id, name: newCustomer.name, phone: newCustomer.phone, locationReference: newCustomer.locationReference }); setCustomerDialogOpen(false); },
  });

  // State
  const [step, setStep] = useState<"customer" | "products" | "delivery" | "summary">("customer");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string; phone: string; locationReference?: string | null } | null>(null);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", locationReference: "", street: "", number: "", complement: "", neighborhood: "", city: "" });

  const [cart, setCart] = useState<CartEntry[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"products" | "minipizzas" | "jellies">("products");

  // Minipizza wizard
  const [mpStep, setMpStep] = useState<"type" | "flavors" | "qty">("type");
  const [mpSelectedType, setMpSelectedType] = useState<number | null>(null);
  const [mpSelectedFlavors, setMpSelectedFlavors] = useState<number[]>([]);
  const [mpQty, setMpQty] = useState(1);
  const [mpDialogOpen, setMpDialogOpen] = useState(false);

  // Delivery
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix">("pix");
  const [notes, setNotes] = useState("");

  // Customer search
  const { data: customerResults = [] } = trpc.orders.customers.search.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );

  const selectedDeliveryMethod = deliveryMethods.find(m => String(m.id) === deliveryMethodId);

  // Cart helpers
  const cartTotal = cart.reduce((acc, item) => {
    if (item.type === "minipizza") {
      const mp = item as CartMinipizza;
      return acc + (mp.price + mp.additionalPrice) * mp.quantity;
    }
    return acc + item.price * item.quantity;
  }, 0);
  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  function addProduct(p: typeof products[0]) {
    setCart(prev => {
      const existing = prev.find(i => i.type === "product" && (i as CartItem).productId === p.id);
      if (existing) return prev.map(i => i.type === "product" && (i as CartItem).productId === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { type: "product", productId: p.id, name: p.name, unit: p.unit, price: parseFloat(p.price), quantity: 1 }];
    });
  }

  function addJelly(f: typeof jellyFlavors[0]) {
    setCart(prev => {
      const existing = prev.find(i => i.type === "jelly" && (i as CartJelly).flavorId === f.id);
      if (existing) return prev.map(i => i.type === "jelly" && (i as CartJelly).flavorId === f.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { type: "jelly", flavorId: f.id, name: f.name, price: parseFloat(f.price), quantity: 1 }];
    });
  }

  function updateQty(idx: number, delta: number) {
    setCart(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], quantity: Math.max(1, updated[idx].quantity + delta) };
      return updated;
    });
  }

  function removeItem(idx: number) {
    setCart(prev => prev.filter((_, i) => i !== idx));
  }

  // Minipizza wizard
  function startMpWizard() {
    setMpStep("type");
    setMpSelectedType(null);
    setMpSelectedFlavors([]);
    setMpQty(1);
    setMpDialogOpen(true);
  }

  function getCompatibleFlavors(typeId: number) {
    const compatIds = matrix.filter(m => m.minipizzaTypeId === typeId && m.active).map(m => m.minipizzaFlavorId);
    return mpFlavors.filter(f => f.active && compatIds.includes(f.id));
  }

  function confirmMinipizza() {
    if (!mpSelectedType) return;
    const t = mpTypes.find(t => t.id === mpSelectedType)!;
    const flavs = mpFlavors.filter(f => mpSelectedFlavors.includes(f.id));
    const additionalPrice = flavs.reduce((acc, f) => acc + parseFloat(f.additionalPrice ?? "0"), 0);
    const price = parseFloat(t.price);
    const tempId = `mp_${Date.now()}`;
    setCart(prev => [...prev, {
      type: "minipizza", tempId, typeId: t.id, typeName: t.name,
      flavorIds: mpSelectedFlavors, flavorNames: flavs.map(f => f.name),
      price, additionalPrice, quantity: mpQty,
    }]);
    setMpDialogOpen(false);
  }

  async function submitOrder() {
    if (!selectedCustomer) return toast.error("Selecione um cliente.");
    if (!deliveryMethodId) return toast.error("Selecione a forma de entrega.");
    if (cart.length === 0) return toast.error("Adicione pelo menos um item.");

    const items = cart.filter(i => i.type === "product").map(i => {
      const p = i as CartItem;
      return { productId: p.productId, quantity: p.quantity, unitPrice: String(p.price.toFixed(2)), subtotal: String((p.price * p.quantity).toFixed(2)) };
    });
    const minipizzas = cart.filter(i => i.type === "minipizza").map(i => {
      const mp = i as CartMinipizza;
      const unitPrice = mp.price + mp.additionalPrice;
      return { minipizzaTypeId: mp.typeId, flavorIds: mp.flavorIds, quantity: mp.quantity, unitPrice: String(unitPrice.toFixed(2)), subtotal: String((unitPrice * mp.quantity).toFixed(2)) };
    });
    const jellies = cart.filter(i => i.type === "jelly").map(i => {
      const j = i as CartJelly;
      return { jellyFlavorId: j.flavorId, quantity: j.quantity, unitPrice: String(j.price.toFixed(2)), subtotal: String((j.price * j.quantity).toFixed(2)) };
    });

    createOrderMutation.mutate({
      customerId: selectedCustomer.id,
      deliveryMethodId: Number(deliveryMethodId),
      deliveryDate: deliveryDate || undefined,
      deliveryAddress: deliveryAddress || undefined,
      paymentMethod,
      notes: notes || undefined,
      totalAmount: cartTotal.toFixed(2),
      items, minipizzas, jellies,
    });
  }

  const filteredProducts = products.filter(p => !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()));

  const steps = [
    { key: "customer", label: "Cliente" },
    { key: "products", label: "Produtos" },
    { key: "delivery", label: "Entrega" },
    { key: "summary", label: "Resumo" },
  ];

  return (
    <div>
      <PageHeader title="Novo Pedido" description="Preencha os dados do pedido passo a passo" />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((s, i) => {
          const idx = steps.findIndex(x => x.key === step);
          const done = i < idx;
          const active = s.key === step;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${active ? "bg-primary text-primary-foreground" : done ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="w-3 h-3" /> : <span>{i + 1}</span>}
                {s.label}
              </div>
              {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2">
          {/* STEP 1: Customer */}
          {step === "customer" && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-base">Selecionar Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar por nome ou telefone..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="pl-9 bg-input" />
                </div>
                {customerResults.length > 0 && (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {customerResults.map(c => (
                      <button key={c.id} onClick={() => { setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone, locationReference: c.locationReference }); setCustomerSearch(""); }} className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-muted/50 ${selectedCustomer?.id === c.id ? "bg-primary/10 border border-primary/20" : "bg-muted/20"}`}>
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.phone}
                            {c.locationReference && <span className="ml-2 text-primary font-medium">• {c.locationReference}</span>}
                          </p>
                        </div>
                        {selectedCustomer?.id === c.id && <Check className="w-4 h-4 text-primary ml-auto" />}
                      </button>
                    ))}
                  </div>
                )}
                {selectedCustomer && (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20">
                    <User className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">{selectedCustomer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCustomer.phone}
                        {selectedCustomer.locationReference && <span className="ml-2 text-primary font-medium">• {selectedCustomer.locationReference}</span>}
                      </p>
                    </div>
                    <button onClick={() => setSelectedCustomer(null)} className="ml-auto text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                  </div>
                )}
                <Button variant="outline" onClick={() => setCustomerDialogOpen(true)} className="w-full gap-2 border-dashed">
                  <Plus className="w-4 h-4" />Cadastrar novo cliente
                </Button>
                <div className="flex justify-end">
                  <Button onClick={() => { if (!selectedCustomer) return toast.error("Selecione um cliente."); setStep("products"); }} className="bg-primary text-primary-foreground gap-2">
                    Próximo <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 2: Products */}
          {step === "products" && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-base">Adicionar Produtos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {/* Tab selector */}
                <div className="flex gap-2">
                  {[{ key: "products", label: "Produtos", icon: Package }, { key: "minipizzas", label: "Minipizzas", icon: Pizza }, { key: "jellies", label: "Geleias", icon: Grape }].map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}>
                      <tab.icon className="w-3.5 h-3.5" />{tab.label}
                    </button>
                  ))}
                </div>

                {activeTab === "products" && (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input placeholder="Buscar produto..." value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9 bg-input" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                      {filteredProducts.map(p => (
                        <button key={p.id} onClick={() => addProduct(p)} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 text-left transition-all group">
                          <div>
                            <p className="text-sm font-medium">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.unit}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-primary">{fmt(parseFloat(p.price))}</span>
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20"><Plus className="w-3 h-3 text-primary" /></div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {activeTab === "minipizzas" && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Clique em "Adicionar Minipizza" para iniciar o fluxo de seleção.</p>
                    <Button onClick={startMpWizard} className="bg-primary/10 text-primary hover:bg-primary/20 gap-2 border border-primary/20">
                      <Pizza className="w-4 h-4" />Adicionar Minipizza
                    </Button>
                  </div>
                )}

                {activeTab === "jellies" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                    {jellyFlavors.filter(f => f.active).map(f => (
                      <button key={f.id} onClick={() => addJelly(f)} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 text-left transition-all group">
                        <div>
                          <p className="text-sm font-medium">{f.name}</p>
                          {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-primary">{fmt(parseFloat(f.price))}</span>
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20"><Plus className="w-3 h-3 text-primary" /></div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("customer")} className="gap-2"><ChevronLeft className="w-4 h-4" />Voltar</Button>
                  <Button onClick={() => { if (cart.length === 0) return toast.error("Adicione pelo menos um item."); setStep("delivery"); }} className="bg-primary text-primary-foreground gap-2">
                    Próximo <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 3: Delivery */}
          {step === "delivery" && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-base">Entrega e Pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Forma de Entrega *</Label>
                  <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
                    <SelectTrigger className="bg-input"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {deliveryMethods.filter(m => m.active).map(m => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {selectedDeliveryMethod?.requiresAddress && (
                  <div className="space-y-2">
                    <Label>Endereço de Entrega</Label>
                    <Input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} className="bg-input" placeholder="Rua, número, bairro..." />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Data de Entrega</Label>
                  <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="bg-input" />
                </div>
                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <div className="flex gap-2">
                    {[{ key: "pix", label: "PIX" }, { key: "cash", label: "Dinheiro" }].map(opt => (
                      <button key={opt.key} onClick={() => setPaymentMethod(opt.key as any)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all border ${paymentMethod === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 text-muted-foreground border-border hover:border-primary/30"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="bg-input resize-none" rows={3} placeholder="Informações adicionais..." />
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("products")} className="gap-2"><ChevronLeft className="w-4 h-4" />Voltar</Button>
                  <Button onClick={() => { if (!deliveryMethodId) return toast.error("Selecione a forma de entrega."); setStep("summary"); }} className="bg-primary text-primary-foreground gap-2">
                    Revisar Pedido <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* STEP 4: Summary */}
          {step === "summary" && (
            <Card className="bg-card border-border">
              <CardHeader><CardTitle className="text-base">Resumo do Pedido</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">Cliente:</span><p className="font-medium">{selectedCustomer?.name}</p></div>
                  <div><span className="text-muted-foreground">Telefone:</span><p className="font-medium">{selectedCustomer?.phone}</p></div>
                  <div><span className="text-muted-foreground">Entrega:</span><p className="font-medium">{selectedDeliveryMethod?.name}</p></div>
                  <div><span className="text-muted-foreground">Pagamento:</span><p className="font-medium">{paymentMethod === "pix" ? "PIX" : "Dinheiro"}</p></div>
                  {deliveryDate && <div><span className="text-muted-foreground">Data:</span><p className="font-medium">{new Date(deliveryDate + "T12:00:00").toLocaleDateString("pt-BR")}</p></div>}
                </div>
                <Separator />
                <div className="space-y-2">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.type === "minipizza" ? (item as CartMinipizza).typeName : item.type === "jelly" ? (item as CartJelly).name : (item as CartItem).name}</span>
                        {item.type === "minipizza" && (item as CartMinipizza).flavorNames.length > 0 && (
                          <p className="text-xs text-muted-foreground">{(item as CartMinipizza).flavorNames.join(", ")}</p>
                        )}
                        <span className="text-muted-foreground"> × {item.quantity}</span>
                      </div>
                      <span className="font-semibold text-primary">{fmt(item.type === "minipizza" ? ((item as CartMinipizza).price + (item as CartMinipizza).additionalPrice) * item.quantity : item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Total</span>
                  <span className="text-xl font-bold text-primary">{fmt(cartTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep("delivery")} className="gap-2"><ChevronLeft className="w-4 h-4" />Voltar</Button>
                  <Button onClick={submitOrder} disabled={createOrderMutation.isPending} className="bg-primary text-primary-foreground gap-2">
                    {createOrderMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Confirmar Pedido
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Cart sidebar */}
        <div>
          <Card className="bg-card border-border sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                Carrinho
                {cart.length > 0 && <Badge className="bg-primary/15 text-primary border-primary/20 ml-auto">{cart.length} {cart.length === 1 ? "item" : "itens"}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum item adicionado</p>
              ) : (
                <div className="space-y-2">
                  {cart.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {item.type === "minipizza" ? (item as CartMinipizza).typeName : item.type === "jelly" ? (item as CartJelly).name : (item as CartItem).name}
                        </p>
                        {item.type === "minipizza" && (item as CartMinipizza).flavorNames.length > 0 && (
                          <p className="text-xs text-muted-foreground truncate">{(item as CartMinipizza).flavorNames.join(", ")}</p>
                        )}
                        <p className="text-xs text-primary font-semibold">{fmt(item.type === "minipizza" ? ((item as CartMinipizza).price + (item as CartMinipizza).additionalPrice) * item.quantity : item.price * item.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(idx, -1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70"><Minus className="w-2.5 h-2.5" /></button>
                        <span className="text-xs w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="w-5 h-5 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70"><Plus className="w-2.5 h-2.5" /></button>
                        <button onClick={() => removeItem(idx)} className="w-5 h-5 rounded-full text-muted-foreground hover:text-destructive ml-1"><X className="w-2.5 h-2.5" /></button>
                      </div>
                    </div>
                  ))}
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Total</span>
                    <span className="text-base font-bold text-primary">{fmt(cartTotal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* New customer dialog */}
      <Dialog open={customerDialogOpen} onOpenChange={setCustomerDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>Cadastrar Novo Cliente</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createCustomerMutation.mutate({ name: newCustomer.name, phone: newCustomer.phone, locationReference: newCustomer.locationReference || undefined, street: newCustomer.street || undefined, number: newCustomer.number || undefined, complement: newCustomer.complement || undefined, neighborhood: newCustomer.neighborhood || undefined, city: newCustomer.city || undefined }); }} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>Nome *</Label><Input value={newCustomer.name} onChange={e => setNewCustomer(f => ({ ...f, name: e.target.value }))} required className="bg-input" /></div>
              <div className="col-span-2 space-y-1"><Label>Telefone *</Label><Input value={newCustomer.phone} onChange={e => setNewCustomer(f => ({ ...f, phone: e.target.value }))} required className="bg-input" /></div>
              <div className="col-span-2 space-y-1"><Label>Referência (ex: Casa azul, Próximo ao mercado)</Label><Input value={newCustomer.locationReference} onChange={e => setNewCustomer(f => ({ ...f, locationReference: e.target.value }))} className="bg-input" /></div>
              <div className="col-span-2 sm:col-span-1 space-y-1"><Label>Rua</Label><Input value={newCustomer.street} onChange={e => setNewCustomer(f => ({ ...f, street: e.target.value }))} className="bg-input" /></div>
              <div className="space-y-1"><Label>Número</Label><Input value={newCustomer.number} onChange={e => setNewCustomer(f => ({ ...f, number: e.target.value }))} className="bg-input" /></div>
              <div className="space-y-1"><Label>Complemento (Apto/Bloco)</Label><Input value={newCustomer.complement} onChange={e => setNewCustomer(f => ({ ...f, complement: e.target.value }))} className="bg-input" /></div>
              <div className="space-y-1"><Label>Bairro</Label><Input value={newCustomer.neighborhood} onChange={e => setNewCustomer(f => ({ ...f, neighborhood: e.target.value }))} className="bg-input" /></div>
              <div className="col-span-2 sm:col-span-1 space-y-1"><Label>Cidade</Label><Input value={newCustomer.city} onChange={e => setNewCustomer(f => ({ ...f, city: e.target.value }))} className="bg-input" /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCustomerDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" className="bg-primary text-primary-foreground" disabled={createCustomerMutation.isPending}>Cadastrar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Minipizza wizard dialog */}
      <Dialog open={mpDialogOpen} onOpenChange={setMpDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pizza className="w-4 h-4 text-primary" />
              {mpStep === "type" ? "Selecionar Tipo" : mpStep === "flavors" ? "Selecionar Sabores" : "Quantidade"}
            </DialogTitle>
          </DialogHeader>

          {mpStep === "type" && (
            <div className="space-y-2">
              {mpTypes.filter(t => t.active).map(t => (
                <button key={t.id} onClick={() => { setMpSelectedType(t.id); setMpStep("flavors"); }} className="w-full flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-primary/10 hover:border-primary/20 border border-transparent transition-all text-left">
                  <div>
                    <p className="font-medium text-sm">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.units} unidades</p>
                  </div>
                  <span className="font-semibold text-primary">{fmt(parseFloat(t.price))}</span>
                </button>
              ))}
            </div>
          )}

          {mpStep === "flavors" && mpSelectedType && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecione um ou mais sabores compatíveis:</p>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                {getCompatibleFlavors(mpSelectedType).map(f => {
                  const selected = mpSelectedFlavors.includes(f.id);
                  return (
                    <button key={f.id} onClick={() => setMpSelectedFlavors(prev => selected ? prev.filter(id => id !== f.id) : [...prev, f.id])} className={`p-3 rounded-xl text-left text-sm transition-all border ${selected ? "bg-primary/15 border-primary/30 text-primary" : "bg-muted/30 border-transparent hover:border-primary/20"}`}>
                      <p className="font-medium">{f.name}</p>
                      {f.additionalPrice && parseFloat(f.additionalPrice) > 0 && <p className="text-xs opacity-70">+{fmt(parseFloat(f.additionalPrice))}</p>}
                      {selected && <Check className="w-3 h-3 mt-1" />}
                    </button>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMpStep("type")}><ChevronLeft className="w-4 h-4" />Voltar</Button>
                <Button onClick={() => { if (mpSelectedFlavors.length === 0) return toast.error("Selecione ao menos um sabor."); setMpStep("qty"); }} className="bg-primary text-primary-foreground">Próximo</Button>
              </DialogFooter>
            </div>
          )}

          {mpStep === "qty" && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4">
                <button onClick={() => setMpQty(q => Math.max(1, q - 1))} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center hover:bg-muted/70"><Minus className="w-4 h-4" /></button>
                <span className="text-2xl font-bold w-10 text-center">{mpQty}</span>
                <button onClick={() => setMpQty(q => q + 1)} className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20"><Plus className="w-4 h-4 text-primary" /></button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMpStep("flavors")}><ChevronLeft className="w-4 h-4" />Voltar</Button>
                <Button onClick={confirmMinipizza} className="bg-primary text-primary-foreground"><Check className="w-4 h-4 mr-1" />Adicionar</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
