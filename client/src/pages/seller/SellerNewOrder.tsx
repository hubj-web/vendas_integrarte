import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useSeller } from "@/contexts/SellerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Search, Plus, Minus, Trash2, ShoppingCart, User, UserPlus,
  ChevronRight, Check, Pizza, Grape, Package, Tag
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface CartItem {
  type: "product" | "minipizza" | "jelly";
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  minipizzaTypeId?: number;
  flavorIds?: number[];
  jellyFlavorId?: number;
  productId?: number;
}

export default function SellerNewOrder() {
  const { seller } = useSeller();
  const [, navigate] = useLocation();

  const { data: catalog } = trpc.seller.catalog.useQuery();

  // Customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", street: "", neighborhood: "", city: "" });

  const { data: searchResults } = trpc.seller.searchCustomers.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );

  const createCustomerMutation = trpc.seller.createCustomer.useMutation({
    onSuccess: (data) => {
      setSelectedCustomer({ id: data.id, name: newCustomer.name, phone: newCustomer.phone });
      setShowNewCustomer(false);
      setNewCustomer({ name: "", phone: "", street: "", neighborhood: "", city: "" });
      toast.success("Cliente cadastrado!");
    },
    onError: (e) => toast.error(e.message),
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryAddressType, setDeliveryAddressType] = useState<"customer" | "other">("customer");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix">("pix");
  const [notes, setNotes] = useState("");

  // Category product dialog
  const [activeCategoryKey, setActiveCategoryKey] = useState<string | null>(null);
  const [productQtys, setProductQtys] = useState<Record<number, number>>({});

  // Minipizza wizard
  const [mpWizard, setMpWizard] = useState<{
    step: "type" | "flavors" | "quantity";
    typeId: number | null;
    typeName: string;
    typePrice: number;
    flavorIds: number[];
    quantity: number;
  } | null>(null);
  const [showMpDialog, setShowMpDialog] = useState(false);

  // Jelly dialog
  const [jellyFlavorId, setJellyFlavorId] = useState<number | null>(null);
  const [jellyQty, setJellyQty] = useState(1);
  const [showJellyDialog, setShowJellyDialog] = useState(false);

  const totalAmount = useMemo(() => cart.reduce((s, i) => s + i.subtotal, 0), [cart]);

  // Group products by category
  const groupedProducts = useMemo(() => {
    if (!catalog) return [];
    const typeMap = Object.fromEntries((catalog.productTypes as any[]).map(t => [t.id, t]));
    const grouped: Record<string, typeof catalog.products> = {};
    
    for (const p of catalog.products) {
      const t = typeMap[p.productTypeId];
      const typeName = (t?.name || "").toLowerCase();
      const catName = (t?.categoryName || t?.category || "").toLowerCase();
      
      let cat = "Outros";
      if (catName.includes("congelado") || ["pão de queijo", "biscoito", "broa"].some(sub => typeName.includes(sub))) {
        cat = "congelados";
      } else if (catName.includes("minipizza") || typeName.includes("minipizza")) {
        cat = "MiniPizzas";
      } else if (catName.includes("geleia") || typeName.includes("geleia")) {
        cat = "geleias";
      } else {
        cat = t?.categoryName || t?.category || t?.name || "Outros";
      }
      
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    }
    
    return Object.entries(grouped).sort((a, b) => {
      const order = { "congelados": 1, "MiniPizzas": 2, "geleias": 3 };
      const valA = order[a[0] as keyof typeof order] || 99;
      const valB = order[b[0] as keyof typeof order] || 99;
      return valA - valB;
    });
  }, [catalog]);

  // Products in the active category dialog
  const activeCategoryProducts = useMemo(() => {
    if (!activeCategoryKey) return [];
    const entry = groupedProducts.find(([cat]) => cat === activeCategoryKey);
    return entry ? entry[1] : [];
  }, [activeCategoryKey, groupedProducts]);

  // Open category dialog
  const openCategoryDialog = (cat: string) => {
    setActiveCategoryKey(cat);
    // Pre-populate qtys from cart
    const qtys: Record<number, number> = {};
    for (const item of cart) {
      if (item.type === "product" && item.productId !== undefined) {
        qtys[item.productId] = item.quantity;
      }
    }
    setProductQtys(qtys);
  };

  const closeCategoryDialog = () => {
    setActiveCategoryKey(null);
    setProductQtys({});
  };

  const setProductQty = (productId: number, qty: number) => {
    setProductQtys(prev => ({ ...prev, [productId]: Math.max(0, qty) }));
  };

  const confirmCategoryProducts = () => {
    if (!activeCategoryKey) return;
    // Remove all products from this category from cart, then re-add with new qtys
    const categoryProductIds = new Set(activeCategoryProducts.map(p => p.id));
    const newCart = cart.filter(c => !(c.type === "product" && c.productId !== undefined && categoryProductIds.has(c.productId)));
    const additions: CartItem[] = [];
    for (const p of activeCategoryProducts) {
      const qty = productQtys[p.id] ?? 0;
      if (qty > 0) {
        additions.push({
          type: "product",
          id: `p-${p.id}`,
          label: p.name,
          quantity: qty,
          unitPrice: Number(p.price),
          subtotal: qty * Number(p.price),
          productId: p.id,
        });
      }
    }
    setCart([...newCart, ...additions]);
    closeCategoryDialog();
    if (additions.length > 0) {
      toast.success(`${additions.length} produto(s) adicionado(s) ao pedido.`);
    }
  };

  // Minipizza wizard
  const startMpWizard = () => {
    setMpWizard({ step: "type", typeId: null, typeName: "", typePrice: 0, flavorIds: [], quantity: 1 });
    setShowMpDialog(true);
  };

  const selectMpType = (t: { id: number; name: string; price: string }) => {
    setMpWizard(w => w ? { ...w, step: "flavors", typeId: t.id, typeName: t.name, typePrice: Number(t.price) } : w);
  };

  const toggleMpFlavor = (fId: number) => {
    if (!mpWizard) return;
    const maxFlavors = 2;
    const has = mpWizard.flavorIds.includes(fId);
    if (!has && mpWizard.flavorIds.length >= maxFlavors) {
      toast.error(`Máximo de ${maxFlavors} sabores por minipizza.`);
      return;
    }
    setMpWizard(w => w ? {
      ...w,
      flavorIds: has ? w.flavorIds.filter(id => id !== fId) : [...w.flavorIds, fId],
    } : w);
  };

  const confirmMpFlavors = () => {
    if (!mpWizard || mpWizard.flavorIds.length === 0) {
      toast.error("Selecione pelo menos 1 sabor.");
      return;
    }
    setMpWizard(w => w ? { ...w, step: "quantity" } : w);
  };

  const confirmMpWizard = () => {
    if (!mpWizard || !mpWizard.typeId) return;
    const flavorNames = mpWizard.flavorIds
      .map(fId => catalog?.minipizzaFlavors.find(f => f.id === fId)?.name ?? "")
      .join(", ");
    const label = `Minipizza ${mpWizard.typeName} (${flavorNames})`;
    const unitPrice = mpWizard.typePrice;
    setCart(prev => [...prev, {
      type: "minipizza",
      id: `mp-${Date.now()}`,
      label,
      quantity: mpWizard.quantity,
      unitPrice,
      subtotal: mpWizard.quantity * unitPrice,
      minipizzaTypeId: mpWizard.typeId!,
      flavorIds: mpWizard.flavorIds,
    }]);
    setShowMpDialog(false);
    setMpWizard(null);
  };

  // Jelly
  const addJelly = () => {
    if (!jellyFlavorId) return;
    const flavor = catalog?.jellyFlavors.find(f => f.id === jellyFlavorId);
    if (!flavor) return;
    const unitPrice = Number(flavor.price);
    setCart(prev => [...prev, {
      type: "jelly",
      id: `j-${Date.now()}`,
      label: `Geleia ${flavor.name}`,
      quantity: jellyQty,
      unitPrice,
      subtotal: jellyQty * unitPrice,
      jellyFlavorId,
    }]);
    setShowJellyDialog(false);
    setJellyFlavorId(null);
    setJellyQty(1);
  };

  const removeFromCart = (id: string) => setCart(cart.filter(c => c.id !== id));
  const changeQty = (id: string, delta: number) => {
    setCart(cart.map(c => {
      if (c.id !== id) return c;
      const q = Math.max(1, c.quantity + delta);
      return { ...c, quantity: q, subtotal: q * c.unitPrice };
    }));
  };

  const createOrderMutation = trpc.seller.createOrder.useMutation({
    onSuccess: (data) => {
      toast.success("Pedido lançado com sucesso!");
      navigate(`/vendedor/pedido/${data.orderId}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const submitOrder = () => {
    if (!selectedCustomer) { toast.error("Selecione um cliente."); return; }
    if (cart.length === 0) { toast.error("Adicione pelo menos um item."); return; }
    if (!deliveryMethodId) { toast.error("Selecione a forma de entrega."); return; }

    createOrderMutation.mutate({
      sellerId: seller!.id,
      customerId: selectedCustomer.id,
      deliveryMethodId: Number(deliveryMethodId),
      deliveryAddress: deliveryAddress || undefined,
      paymentMethod,
      notes: notes || undefined,
      totalAmount: totalAmount.toFixed(2),
      items: cart.filter(c => c.type === "product").map(c => ({
        productId: c.productId!,
        quantity: c.quantity,
        unitPrice: c.unitPrice.toFixed(2),
        subtotal: c.subtotal.toFixed(2),
      })),
      minipizzas: cart.filter(c => c.type === "minipizza").map(c => ({
        minipizzaTypeId: c.minipizzaTypeId!,
        quantity: c.quantity,
        unitPrice: c.unitPrice.toFixed(2),
        subtotal: c.subtotal.toFixed(2),
        flavorIds: c.flavorIds!,
      })),
      jellies: cart.filter(c => c.type === "jelly").map(c => ({
        jellyFlavorId: c.jellyFlavorId!,
        quantity: c.quantity,
        unitPrice: c.unitPrice.toFixed(2),
        subtotal: c.subtotal.toFixed(2),
      })),
    });
  };

  // Compatible flavors for selected minipizza type
  const compatibleFlavorIds = useMemo(() => {
    if (!mpWizard?.typeId || !catalog) return new Set<number>();
    const compat = catalog.compatibility
      .filter(c => c.minipizzaTypeId === mpWizard.typeId)
      .map(c => c.minipizzaFlavorId);
    return new Set(compat);
  }, [mpWizard?.typeId, catalog]);

  // Count items in cart per category (for badge)
  const categoryCartCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [cat, prods] of groupedProducts) {
      const catIds = new Set(prods.map(p => p.id));
      const count = cart.filter(c => c.type === "product" && c.productId !== undefined && catIds.has(c.productId))
        .reduce((s, c) => s + c.quantity, 0);
      if (count > 0) counts[cat] = count;
    }
    return counts;
  }, [cart, groupedProducts]);

  return (
    <div className="space-y-5 pb-10">
      <h2 className="text-lg font-semibold text-foreground">Novo Pedido</h2>

      {/* ── CUSTOMER ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <User className="w-4 h-4" /> Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
              <div>
                <p className="font-medium text-foreground">{selectedCustomer.name}</p>
                <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="text-xs">Trocar</Button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente por nome ou telefone..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {searchResults && searchResults.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  {searchResults.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { setSelectedCustomer({ id: c.id, name: c.name, phone: c.phone }); setCustomerSearch(""); }}
                      className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                    >
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => setShowNewCustomer(true)} className="gap-2 w-full">
                <UserPlus className="w-4 h-4" /> Cadastrar novo cliente
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── PRODUCTS (category buttons) ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Package className="w-4 h-4" /> Produtos
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {/* One button per category */}
          {groupedProducts.map(([cat]) => {
            const count = categoryCartCount[cat];
            const isMiniPizza = cat === "MiniPizzas";
            const isJelly = cat === "geleias";
            const isCongelados = cat === "congelados";

            let icon = <Tag className="w-4 h-4" />;
            let label = `Adicionar ${cat}`;

            if (isMiniPizza) {
              icon = <Pizza className="w-4 h-4" />;
              label = "Adicionar MiniPizzas";
            } else if (isJelly) {
              icon = <Grape className="w-4 h-4" />;
              label = "Adicionar geleias";
            } else if (isCongelados) {
              icon = <Package className="w-4 h-4" />;
              label = "Adicionar congelados";
            }
            const onClick = isMiniPizza ? startMpWizard : (isJelly ? () => setShowJellyDialog(true) : () => openCategoryDialog(cat));

            return (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                onClick={onClick}
                className="gap-2 w-full justify-between h-11"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {icon}
                  {label}
                </span>
                <span className="flex items-center gap-2">
                  {count !== undefined && count > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                      {count}
                    </span>
                  )}
                  <Plus className="w-4 h-4 text-muted-foreground" />
                </span>
              </Button>
            );
          })}
        </CardContent>
      </Card>

      {/* ── CART ── */}
      {cart.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" /> Carrinho
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} × {item.quantity} = {fmt(item.subtotal)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(item.id, -1)}>
                    <Minus className="w-3 h-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeQty(item.id, 1)}>
                    <Plus className="w-3 h-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeFromCart(item.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between font-semibold text-foreground">
              <span>Total</span>
              <span>{fmt(totalAmount)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── DELIVERY & PAYMENT ── */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Forma de Entrega</Label>
            <Select value={deliveryMethodId} onValueChange={val => {
              setDeliveryMethodId(val);
              const method = catalog?.deliveryMethods.find(m => String(m.id) === val);
              if (method?.name.toLowerCase().includes("gratuita")) {
                setDeliveryAddressType("customer");
              }
            }}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {catalog?.deliveryMethods.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(() => {
            const method = catalog?.deliveryMethods.find(m => String(m.id) === deliveryMethodId);
            if (!method) return null;

            const isFreeDelivery = method.name.toLowerCase().includes("gratuita");
            const requiresAddress = method.requiresAddress || isFreeDelivery;

            if (!requiresAddress) return null;

            return (
              <div className="space-y-3 p-3 border border-border rounded-lg bg-muted/20">
                {isFreeDelivery && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Onde será a entrega?</Label>
                    <div className="flex gap-2">
                      <Button 
                        type="button"
                        variant={deliveryAddressType === "customer" ? "default" : "outline"} 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => setDeliveryAddressType("customer")}
                      >
                        Endereço do Cliente
                      </Button>
                      <Button 
                        type="button"
                        variant={deliveryAddressType === "other" ? "default" : "outline"} 
                        size="sm" 
                        className="flex-1 text-xs"
                        onClick={() => setDeliveryAddressType("other")}
                      >
                        Outro Endereço
                      </Button>
                    </div>
                  </div>
                )}

                {(deliveryAddressType === "other" || !isFreeDelivery) ? (
                  <div className="space-y-1.5">
                    <Label className="text-sm">Endereço de Entrega</Label>
                    <Input 
                      value={deliveryAddress} 
                      onChange={e => setDeliveryAddress(e.target.value)} 
                      placeholder="Rua, número, bairro..." 
                    />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground bg-background p-2 rounded border border-border">
                    <p className="font-medium text-foreground mb-1">Usando endereço cadastrado:</p>
                    {selectedCustomer ? (
                      <p>O pedido será entregue no endereço cadastrado no perfil do cliente.</p>
                    ) : (
                      <p className="text-destructive">Selecione um cliente para ver o endereço.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="space-y-1.5">
            <Label className="text-sm">Forma de Pagamento</Label>
            <div className="flex gap-2">
              {(["pix", "cash"] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setPaymentMethod(m)}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    paymentMethod === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {m === "pix" ? "PIX" : "Dinheiro"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Observações (opcional)</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Alguma observação sobre o pedido..." className="min-h-[60px]" />
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <Button
        className="w-full h-12 text-base font-semibold"
        onClick={submitOrder}
        disabled={createOrderMutation.isPending}
      >
        {createOrderMutation.isPending ? "Lançando..." : `Confirmar Pedido — ${fmt(totalAmount)}`}
      </Button>

      {/* ── NEW CUSTOMER DIALOG ── */}
      <Dialog open={showNewCustomer} onOpenChange={setShowNewCustomer}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Cliente</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={newCustomer.name} onChange={e => setNewCustomer(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input value={newCustomer.phone} onChange={e => setNewCustomer(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rua</Label>
              <Input value={newCustomer.street} onChange={e => setNewCustomer(p => ({ ...p, street: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={newCustomer.neighborhood} onChange={e => setNewCustomer(p => ({ ...p, neighborhood: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={newCustomer.city} onChange={e => setNewCustomer(p => ({ ...p, city: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewCustomer(false)}>Cancelar</Button>
            <Button
              onClick={() => createCustomerMutation.mutate(newCustomer)}
              disabled={!newCustomer.name || !newCustomer.phone || createCustomerMutation.isPending}
            >
              Cadastrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CATEGORY PRODUCTS DIALOG ── */}
      <Dialog open={!!activeCategoryKey} onOpenChange={v => { if (!v) closeCategoryDialog(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              {activeCategoryKey}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {activeCategoryProducts.map(p => {
              const qty = productQtys[p.id] ?? 0;
              return (
                <div
                  key={p.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    qty > 0 ? "border-primary/40 bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{fmt(Number(p.price))}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {qty > 0 ? (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setProductQty(p.id, qty - 1)}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-7 text-center text-sm font-bold text-primary">{qty}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setProductQty(p.id, qty + 1)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 h-8"
                        onClick={() => setProductQty(p.id, 1)}
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeCategoryDialog}>Cancelar</Button>
            <Button onClick={confirmCategoryProducts} className="gap-2">
              <Check className="w-4 h-4" />
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MINIPIZZA WIZARD DIALOG ── */}
      <Dialog open={showMpDialog} onOpenChange={v => { if (!v) { setShowMpDialog(false); setMpWizard(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {mpWizard?.step === "type" && "Minipizza — Escolha o Tipo"}
              {mpWizard?.step === "flavors" && "Minipizza — Escolha os Sabores"}
              {mpWizard?.step === "quantity" && "Minipizza — Quantidade"}
            </DialogTitle>
          </DialogHeader>

          {mpWizard?.step === "type" && (
            <div className="space-y-2">
              {catalog?.minipizzaTypes.map(t => (
                <button
                  key={t.id}
                  onClick={() => selectMpType(t)}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                >
                  <div>
                    <p className="font-medium text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{fmt(Number(t.price))}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}

          {mpWizard?.step === "flavors" && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Selecione até 2 sabores compatíveis com <strong>{mpWizard.typeName}</strong>.</p>
              <div className="grid grid-cols-2 gap-2">
                {catalog?.minipizzaFlavors
                  .filter(f => compatibleFlavorIds.has(f.id))
                  .map(f => {
                    const selected = mpWizard.flavorIds.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        onClick={() => toggleMpFlavor(f.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm transition-all ${
                          selected ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/30"
                        }`}
                      >
                        {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                        <span className="truncate">{f.name}</span>
                      </button>
                    );
                  })}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMpWizard(w => w ? { ...w, step: "type" } : w)}>Voltar</Button>
                <Button onClick={confirmMpFlavors}>Próximo</Button>
              </DialogFooter>
            </div>
          )}

          {mpWizard?.step === "quantity" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Quantas unidades de <strong>{mpWizard.typeName}</strong>?</p>
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setMpWizard(w => w ? { ...w, quantity: Math.max(1, w.quantity - 1) } : w)}>
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-2xl font-bold w-10 text-center">{mpWizard.quantity}</span>
                <Button variant="outline" size="icon" onClick={() => setMpWizard(w => w ? { ...w, quantity: w.quantity + 1 } : w)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Subtotal: {fmt(mpWizard.quantity * mpWizard.typePrice)}
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMpWizard(w => w ? { ...w, step: "flavors" } : w)}>Voltar</Button>
                <Button onClick={confirmMpWizard}>Adicionar ao Pedido</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── JELLY DIALOG ── */}
      <Dialog open={showJellyDialog} onOpenChange={setShowJellyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar Geleia</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {catalog?.jellyFlavors.map(f => (
                <button
                  key={f.id}
                  onClick={() => setJellyFlavorId(f.id)}
                  className={`flex flex-col p-3 rounded-lg border text-sm transition-all ${
                    jellyFlavorId === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary/30"
                  }`}
                >
                  <span className="font-medium">{f.name}</span>
                  <span className="text-xs opacity-70">{fmt(Number(f.price))}</span>
                </button>
              ))}
            </div>
            {jellyFlavorId && (
              <div className="flex items-center justify-center gap-4">
                <Button variant="outline" size="icon" onClick={() => setJellyQty(q => Math.max(1, q - 1))}>
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-xl font-bold w-8 text-center">{jellyQty}</span>
                <Button variant="outline" size="icon" onClick={() => setJellyQty(q => q + 1)}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowJellyDialog(false)}>Cancelar</Button>
            <Button onClick={addJelly} disabled={!jellyFlavorId}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
