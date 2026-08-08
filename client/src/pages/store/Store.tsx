import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, Trash2, Store as StoreIcon, MapPin, X } from "lucide-react";
import StoreCheckout from "./StoreCheckout";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

interface CartItem {
  key: string;
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  flavorIds: number[];
  flavorNames: string[];
  maxAvailable: number;
}

export default function Store() {
  const { data: catalog, isLoading } = trpc.publicStore.catalog.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedFlavors, setSelectedFlavors] = useState<Record<number, number[]>>({});

  const grouped = useMemo(() => {
    type Product = NonNullable<typeof catalog>["products"][number];
    const byCategory: Record<string, Product[]> = {};
    if (!catalog?.products) return byCategory;
    const catNameById = new Map((catalog.categories ?? []).map(c => [c.id, c.name]));
    for (const p of catalog.products) {
      const catName = (p.categoryId && catNameById.get(p.categoryId)) || "Outros";
      (byCategory[catName] ??= []).push(p);
    }
    return byCategory;
  }, [catalog]);

  const cartTotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  function addToCart(product: NonNullable<typeof catalog>["products"][number]) {
    const flavorIds = selectedFlavors[product.id] ?? [];
    if ((product.maxFlavors ?? 0) > 0 && flavorIds.length === 0 && product.flavors.length > 0) {
      toast.error("Escolha o sabor antes de adicionar.");
      return;
    }
    const key = `${product.id}::${[...flavorIds].sort().join(",")}`;
    setCart(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) {
        if (existing.quantity + 1 > existing.maxAvailable) {
          toast.error("Quantidade máxima em estoque atingida.");
          return prev;
        }
        return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + 1 } : i);
      }
      const flavorNames = flavorIds.map(id => product.flavors.find(f => f.id === id)?.name ?? "").filter(Boolean);
      return [...prev, {
        key, productId: product.id, name: product.name, unitPrice: Number(product.price),
        quantity: 1, flavorIds, flavorNames, maxAvailable: product.availableQuantity,
      }];
    });
    toast.success(`${product.name} adicionado ao carrinho.`);
  }

  function updateQty(key: string, delta: number) {
    setCart(prev => prev
      .map(i => i.key === key ? { ...i, quantity: Math.min(i.maxAvailable, Math.max(0, i.quantity + delta)) } : i)
      .filter(i => i.quantity > 0));
  }

  function removeItem(key: string) {
    setCart(prev => prev.filter(i => i.key !== key));
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando loja…</div>;
  }

  if (!catalog?.open) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <StoreIcon className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Loja fechada no momento</h1>
            <p className="text-muted-foreground text-sm">
              {catalog?.closedMessage || "Volte em breve — estamos preparando novidades!"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (checkoutOpen) {
    return (
      <StoreCheckout
        cart={cart}
        total={cartTotal}
        onBack={() => setCheckoutOpen(false)}
        onSuccess={() => { setCart([]); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      <header className="bg-primary text-primary-foreground py-6 px-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <StoreIcon className="h-7 w-7" />
          <div>
            <h1 className="text-lg font-semibold leading-tight">Loja Integrarte</h1>
            <p className="text-xs opacity-90">Compre agora, pague on-line, retire ou receba em casa</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {Object.keys(grouped).length === 0 && (
          <p className="text-center text-muted-foreground py-12">Nenhum produto disponível no momento.</p>
        )}

        {Object.entries(grouped).map(([categoryName, prods]) => (
          <section key={categoryName} className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{categoryName}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {prods!.map(product => (
                <Card key={product.id}>
                  <CardContent className="pt-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium leading-tight">{product.name}</p>
                        {product.description && <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>}
                      </div>
                      <Badge variant="secondary" className="shrink-0">{product.availableQuantity} {product.unit}</Badge>
                    </div>

                    {product.flavors.length > 0 && (
                      <Select
                        value={String(selectedFlavors[product.id]?.[0] ?? "")}
                        onValueChange={(v) => setSelectedFlavors(prev => ({ ...prev, [product.id]: v ? [Number(v)] : [] }))}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o sabor" /></SelectTrigger>
                        <SelectContent>
                          {product.flavors.map(f => (
                            <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className="font-semibold text-primary">{fmt(product.price)}</span>
                      <Button size="sm" onClick={() => addToCart(product)}>
                        <Plus className="h-4 w-4 mr-1" /> Adicionar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-background border-t p-4 shadow-lg">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="max-h-40 overflow-y-auto space-y-2">
              {cart.map(item => (
                <div key={item.key} className="flex items-center justify-between text-sm gap-2">
                  <div className="min-w-0">
                    <p className="truncate">{item.name}{item.flavorNames.length > 0 ? ` (${item.flavorNames.join(", ")})` : ""}</p>
                    <p className="text-xs text-muted-foreground">{fmt(item.unitPrice)} cada</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-5 text-center">{item.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.key, 1)}><Plus className="h-3 w-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.key)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                <span className="font-semibold">{fmt(cartTotal)}</span>
              </div>
              <Button onClick={() => setCheckoutOpen(true)}>Finalizar pedido</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
