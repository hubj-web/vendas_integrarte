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
  ChevronRight, Check, Tag, MapPin
} from "lucide-react";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface CartItem {
  type: "product";
  id: string;
  label: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  productId: number;
  flavorIds?: number[];
  flavorNames?: string[];
}

export default function SellerNewOrder() {
  const { seller } = useSeller();
  const [, navigate] = useLocation();

  const { data: catalog } = trpc.seller.catalog.useQuery();

  // Customer
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<{ 
    id: number; 
    name: string; 
    phone: string;
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    locationReference?: string | null;
  } | null>(null);
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", street: "", neighborhood: "", city: "" });

  const { data: searchResults } = trpc.seller.searchCustomers.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );

  const createCustomerMutation = trpc.seller.createCustomer.useMutation({
    onSuccess: (data) => {
      setSelectedCustomer({ 
        id: data.id, 
        name: newCustomer.name, 
        phone: newCustomer.phone,
        street: newCustomer.street,
        neighborhood: newCustomer.neighborhood,
        city: newCustomer.city
      });
      setShowNewCustomer(false);
      setNewCustomer({ name: "", phone: "", street: "", neighborhood: "", city: "" });
      toast.success("Cliente cadastrado!");
    },
    onError: (e) => toast.error(e.message),
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("");
  const [deliveryAddressOption, setDeliveryAddressOption] = useState<"customer" | "other">("customer");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix">("pix");
  const [notes, setNotes] = useState("");

  // Category product dialog
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [productQtys, setProductQtys] = useState<Record<number, number>>({});

  // Flavor selection dialog (for products with maxFlavors > 0)
  const [flavorProduct, setFlavorProduct] = useState<{
    id: number; name: string; price: number; maxFlavors: number;
  } | null>(null);
  const [selectedFlavorIds, setSelectedFlavorIds] = useState<number[]>([]);
  const [flavorQty, setFlavorQty] = useState(1);

  const totalAmount = useMemo(() => cart.reduce((s, i) => s + i.subtotal, 0), [cart]);

  // Build category list dynamically from the catalog
  const categoryList = useMemo(() => {
    if (!catalog) return [];
    return catalog.categories || [];
  }, [catalog]);

  // Get products for a specific category (directly via categoryId)
  const getProductsForCategory = (categoryId: number) => {
    if (!catalog) return [];
    return catalog.products.filter(p => p.categoryId === categoryId);
  };

  // Products in the active category dialog
  const activeCategoryProducts = useMemo(() => {
    if (activeCategoryId === null) return [];
    return getProductsForCategory(activeCategoryId);
  }, [activeCategoryId, catalog]);

  // Open category dialog
  const openCategoryDialog = (categoryId: number) => {
    setActiveCategoryId(categoryId);
    // Pre-populate qtys from cart (only for products without flavors)
    const qtys: Record<number, number> = {};
    for (const item of cart) {
      if (item.productId !== undefined) {
        // Only count items without flavors in the qty counter
        const prod = catalog?.products.find(p => p.id === item.productId);
        if (prod && (prod.maxFlavors ?? 0) === 0) {
          qtys[item.productId] = (qtys[item.productId] || 0) + item.quantity;
        }
      }
    }
    setProductQtys(qtys);
  };

  const closeCategoryDialog = () => {
    setActiveCategoryId(null);
    setProductQtys({});
  };

  const setProductQty = (productId: number, qty: number) => {
    setProductQtys(prev => ({ ...prev, [productId]: Math.max(0, qty) }));
  };

  // For products with flavors, open the flavor selection dialog
  const openFlavorDialog = (product: { id: number; name: string; price: string; maxFlavors: number }) => {
    setFlavorProduct({ id: product.id, name: product.name, price: Number(product.price), maxFlavors: product.maxFlavors });
    setSelectedFlavorIds([]);
    setFlavorQty(1);
  };

  const toggleFlavor = (flavorId: number) => {
    if (!flavorProduct) return;
    const has = selectedFlavorIds.includes(flavorId);
    if (!has && selectedFlavorIds.length >= flavorProduct.maxFlavors) {
      toast.error(`Máximo de ${flavorProduct.maxFlavors} sabor(es) por unidade.`);
      return;
    }
    setSelectedFlavorIds(prev => has ? prev.filter(id => id !== flavorId) : [...prev, flavorId]);
  };

  const confirmFlavorProduct = () => {
    if (!flavorProduct) return;
    if (selectedFlavorIds.length === 0) {
      toast.error("Selecione pelo menos 1 sabor.");
      return;
    }
    const flavorNames = selectedFlavorIds
      .map(fId => catalog?.productFlavors?.find(f => f.id === fId)?.name ?? "")
      .filter(Boolean);
    const label = `${flavorProduct.name} (${flavorNames.join(", ")})`;
    const unitPrice = flavorProduct.price;
    setCart(prev => [...prev, {
      type: "product",
      id: `p-${flavorProduct.id}-${Date.now()}`,
      label,
      quantity: flavorQty,
      unitPrice,
      subtotal: flavorQty * unitPrice,
      productId: flavorProduct.id,
      flavorIds: selectedFlavorIds,
      flavorNames,
    }]);
    setFlavorProduct(null);
    setSelectedFlavorIds([]);
    setFlavorQty(1);
    toast.success("Produto adicionado ao pedido!");
  };

  const confirmCategoryProducts = () => {
    if (activeCategoryId === null) return;
    // Separate products with and without flavors
    const noFlavorProducts = activeCategoryProducts.filter(p => (p.maxFlavors ?? 0) === 0);
    const categoryProductIds = new Set(noFlavorProducts.map(p => p.id));
    
    // Remove all non-flavor products from this category from cart, then re-add with new qtys
    const newCart = cart.filter(c => {
      if (c.productId !== undefined && categoryProductIds.has(c.productId) && (!c.flavorIds || c.flavorIds.length === 0)) {
        return false;
      }
      return true;
    });
    
    const additions: CartItem[] = [];
    for (const p of noFlavorProducts) {
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

    let finalAddress = deliveryAddress;
    if (deliveryAddressOption === "customer" && selectedCustomer) {
      const c = selectedCustomer as any;
      finalAddress = [c.street, c.number, c.neighborhood, c.city].filter(Boolean).join(", ");
      if (c.locationReference) finalAddress += ` (${c.locationReference})`;
    }

    if (!seller) return;
    createOrderMutation.mutate({
      sellerId: seller.id,
      customerId: selectedCustomer.id,
      deliveryMethodId: Number(deliveryMethodId),
      deliveryAddress: finalAddress || undefined,
      paymentMethod,
      notes: notes || undefined,
      totalAmount: totalAmount.toFixed(2),
      items: cart.map(c => ({
        productId: c.productId,
        quantity: c.quantity,
        unitPrice: c.unitPrice.toFixed(2),
        subtotal: c.subtotal.toFixed(2),
        flavorIds: c.flavorIds || [],
      })),
      // Keep legacy arrays empty for backward compat
      minipizzas: [],
      jellies: [],
    });
  };

  // Count items in cart per category (for badge)
  const categoryCartCount = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const cat of categoryList) {
      const catProducts = getProductsForCategory(cat.id);
      const catIds = new Set(catProducts.map(p => p.id));
      const count = cart.filter(c => c.productId !== undefined && catIds.has(c.productId))
        .reduce((s, c) => s + c.quantity, 0);
      if (count > 0) counts[cat.id] = count;
    }
    return counts;
  }, [cart, categoryList, catalog]);

  // Get the active category name for dialog title
  const activeCategoryName = useMemo(() => {
    if (activeCategoryId === null) return "";
    const cat = categoryList.find(c => c.id === activeCategoryId);
    return cat?.name || "";
  }, [activeCategoryId, categoryList]);

  // Get flavors for the current flavor product
  const availableFlavors = useMemo(() => {
    if (!flavorProduct || !catalog?.productFlavors) return [];
    return catalog.productFlavors.filter(f => f.productId === flavorProduct.id && f.active);
  }, [flavorProduct, catalog]);

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
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {selectedCustomer.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)} className="text-muted-foreground hover:text-destructive">
                Alterar
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente por nome ou telefone..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="pl-9 bg-input border-border focus:ring-primary"
                />
              </div>
              
              {searchResults && searchResults.length > 0 && (
                <div className="border border-border rounded-lg bg-card overflow-hidden divide-y divide-border">
                  {searchResults.map(c => (
                    <button key={c.id} className="w-full text-left px-3 py-2 hover:bg-accent/50 flex items-center gap-3" onClick={() => { setSelectedCustomer(c); setCustomerSearch(""); }}>
                      <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-xs font-bold">{c.name.charAt(0)}</div>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <Button variant="outline" size="sm" className="w-full border-dashed border-primary/30 text-primary hover:bg-primary/5" onClick={() => setShowNewCustomer(true)}>
                <UserPlus className="w-4 h-4 mr-2" /> Cadastrar novo cliente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── PRODUCTS ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" /> Produtos
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {/* Category Buttons - Generated dynamically from database */}
          <div className="grid grid-cols-1 gap-2">
            {categoryList.map((cat) => {
              const totalCount = categoryCartCount[cat.id] || 0;
              return (
                <Button
                  key={cat.id}
                  variant="outline"
                  className="justify-between h-12 border-border hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => openCategoryDialog(cat.id)}
                >
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary/70" />
                    <span>Adicionar {cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {totalCount > 0 && (
                      <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {totalCount}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Button>
              );
            })}
          </div>

          {/* Cart Items */}
          {cart.length > 0 && (
            <div className="mt-4 space-y-2">
              <Separator className="bg-border/50" />
              <div className="divide-y divide-border/40">
                {cart.map((item) => (
                  <div key={item.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} cada</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="flex items-center gap-2 bg-accent/50 rounded-lg p-1">
                        <Button variant="ghost" size="icon" className="w-7 h-7 rounded-md" onClick={() => changeQty(item.id, -1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-bold min-w-[1.5rem] text-center">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="w-7 h-7 rounded-md" onClick={() => changeQty(item.id, 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-primary">{fmt(item.subtotal)}</span>
                        <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive" onClick={() => removeFromCart(item.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── DELIVERY & PAYMENT ── */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Entrega e Pagamento</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Forma de Entrega</Label>
            <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
              <SelectTrigger className="bg-input border-border">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {catalog?.deliveryMethods.map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {deliveryMethodId && catalog?.deliveryMethods.find(m => String(m.id) === deliveryMethodId)?.requiresAddress && (
            <div className="space-y-3 p-3 bg-accent/30 rounded-lg border border-border/50">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="w-3 h-3 text-primary" /> Endereço para entrega
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={deliveryAddressOption === "customer" ? "default" : "outline"}
                    className="text-xs h-8"
                    onClick={() => setDeliveryAddressOption("customer")}
                  >
                    Endereço do Cliente
                  </Button>
                  <Button
                    type="button"
                    variant={deliveryAddressOption === "other" ? "default" : "outline"}
                    className="text-xs h-8"
                    onClick={() => setDeliveryAddressOption("other")}
                  >
                    Outro Endereço
                  </Button>
                </div>
              </div>

              {deliveryAddressOption === "customer" ? (
                <div className="text-xs text-muted-foreground italic bg-background/50 p-2 rounded border border-border/30">
                  {selectedCustomer ? (
                    [selectedCustomer.street, selectedCustomer.number, selectedCustomer.neighborhood, selectedCustomer.city].filter(Boolean).join(", ") || "Cliente sem endereço cadastrado."
                  ) : "Selecione um cliente primeiro."}
                </div>
              ) : (
                <Input
                  placeholder="Rua, número, bairro..."
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="bg-background border-border text-sm"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Forma de Pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={paymentMethod === "pix" ? "default" : "outline"}
                className="h-10 font-bold"
                onClick={() => setPaymentMethod("pix")}
              >
                PIX
              </Button>
              <Button
                variant={paymentMethod === "cash" ? "default" : "outline"}
                className="h-10 font-bold"
                onClick={() => setPaymentMethod("cash")}
              >
                Dinheiro
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Observações (opcional)</Label>
            <Textarea
              placeholder="Alguma observação sobre o pedido..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="bg-input border-border min-h-[80px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── SUBMIT ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-md border-t border-border z-10 max-w-md mx-auto">
        <Button
          className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20"
          disabled={cart.length === 0 || createOrderMutation.isPending}
          onClick={submitOrder}
        >
          {createOrderMutation.isPending ? "Processando..." : `Confirmar Pedido — ${fmt(totalAmount)}`}
        </Button>
      </div>

      {/* ── DIALOGS ── */}
      {/* Generic Category Products Dialog */}
      <Dialog open={activeCategoryId !== null && flavorProduct === null} onOpenChange={(open) => !open && closeCategoryDialog()}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle>Adicionar {activeCategoryName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeCategoryProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum produto cadastrado nesta categoria.</p>
            ) : (
              activeCategoryProducts.map(p => {
                const hasFlavors = (p.maxFlavors ?? 0) > 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-4 bg-accent/20 p-3 rounded-xl border border-border/40">
                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-sm">{p.name}</p>
                      <p className="text-xs text-primary font-bold">{fmt(Number(p.price))}</p>
                      {hasFlavors && (
                        <p className="text-[10px] text-purple-400 mt-0.5">Até {p.maxFlavors} sabor(es)</p>
                      )}
                    </div>
                    {hasFlavors ? (
                      <Button
                        size="sm"
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
                        onClick={() => openFlavorDialog(p as any)}
                      >
                        Escolher Sabores
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 bg-background rounded-lg p-1 border border-border/50">
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setProductQty(p.id, (productQtys[p.id] || 0) - 1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="text-sm font-bold min-w-[1.5rem] text-center">{productQtys[p.id] || 0}</span>
                        <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => setProductQty(p.id, (productQtys[p.id] || 0) + 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="p-4 border-t border-border bg-accent/10">
            <Button className="w-full font-bold" onClick={confirmCategoryProducts}>
              Adicionar ao Pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flavor Selection Dialog */}
      <Dialog open={flavorProduct !== null} onOpenChange={(open) => { if (!open) { setFlavorProduct(null); setSelectedFlavorIds([]); } }}>
        <DialogContent className="max-w-sm max-h-[80vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle>{flavorProduct?.name} - Sabores</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Escolha até {flavorProduct?.maxFlavors} sabor(es):
              </p>
              <span className="text-[10px] bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded">
                {selectedFlavorIds.length}/{flavorProduct?.maxFlavors}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {availableFlavors.map(f => {
                const selected = selectedFlavorIds.includes(f.id);
                return (
                  <Button
                    key={f.id}
                    variant={selected ? "default" : "outline"}
                    className={`h-12 justify-between border-border ${selected ? "bg-primary shadow-md shadow-primary/20" : ""}`}
                    onClick={() => toggleFlavor(f.id)}
                  >
                    <span>{f.name}</span>
                    <div className="flex items-center gap-2">
                      {f.additionalPrice && parseFloat(f.additionalPrice) > 0 && (
                        <span className="text-xs opacity-70">+{fmt(parseFloat(f.additionalPrice))}</span>
                      )}
                      {selected && <Check className="w-4 h-4" />}
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedFlavorIds.length > 0 && (
              <div className="space-y-4 pt-2 flex flex-col items-center">
                <Separator className="bg-border/50" />
                <Label className="text-xs text-muted-foreground">Quantidade</Label>
                <div className="flex items-center gap-6 bg-accent/30 p-4 rounded-2xl border border-border/50">
                  <Button variant="outline" size="icon" className="w-12 h-12 rounded-xl" onClick={() => setFlavorQty(Math.max(1, flavorQty - 1))}>
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-3xl font-black min-w-[3rem] text-center">{flavorQty}</span>
                  <Button variant="outline" size="icon" className="w-12 h-12 rounded-xl" onClick={() => setFlavorQty(flavorQty + 1)}>
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <Button className="w-full font-bold h-12" onClick={confirmFlavorProduct}>
                  Confirmar e Adicionar
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer Dialog */}
      <Dialog open={showNewCustomer} onOpenChange={setShowNewCustomer}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Nome *</Label>
              <Input value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} className="bg-input border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Telefone *</Label>
              <Input value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} className="bg-input border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Rua</Label>
              <Input value={newCustomer.street} onChange={(e) => setNewCustomer({ ...newCustomer, street: e.target.value })} className="bg-input border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Bairro</Label>
              <Input value={newCustomer.neighborhood} onChange={(e) => setNewCustomer({ ...newCustomer, neighborhood: e.target.value })} className="bg-input border-border" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Cidade</Label>
              <Input value={newCustomer.city} onChange={(e) => setNewCustomer({ ...newCustomer, city: e.target.value })} className="bg-input border-border" />
            </div>
            <Button
              className="w-full font-bold"
              disabled={!newCustomer.name || !newCustomer.phone || createCustomerMutation.isPending}
              onClick={() => createCustomerMutation.mutate(newCustomer)}
            >
              {createCustomerMutation.isPending ? "Salvando..." : "Cadastrar Cliente"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
