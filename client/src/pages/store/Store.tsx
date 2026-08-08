import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart, ImageIcon } from "lucide-react";
import CategoryView from "./CategoryView";
import StoreCheckout from "./StoreCheckout";
import { BRAND } from "./brand";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export interface CartItem {
  key: string;
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  flavorIds: number[];
  flavorNames: string[];
  maxAvailable: number;
}

type View = "landing" | "category" | "checkout";

export default function Store() {
  const { data: catalog, isLoading } = trpc.publicStore.catalog.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const [view, setView] = useState<View>("landing");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const categoriesWithProducts = useMemo(() => {
    if (!catalog?.products || !catalog.categories) return [];
    const idsComProduto = new Set(catalog.products.map(p => p.categoryId));
    return catalog.categories.filter(c => idsComProduto.has(c.id));
  }, [catalog]);

  const cartTotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  function addToCart(item: CartItem) {
    setCart(prev => {
      const existing = prev.find(i => i.key === item.key);
      if (existing) {
        const newQty = Math.min(item.maxAvailable, existing.quantity + item.quantity);
        return prev.map(i => i.key === item.key ? { ...i, quantity: newQty } : i);
      }
      return [...prev, item];
    });
  }

  function removeFromCart(key: string) {
    setCart(prev => prev.filter(i => i.key !== key));
  }

  function goToCategory(categoryId: number) {
    setSelectedCategoryId(categoryId);
    setView("category");
  }

  function goToLanding() {
    setView("landing");
    setSelectedCategoryId(null);
  }

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando loja…</div>;
  }

  if (!catalog?.open) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BRAND.white }}>
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-20 w-auto object-contain" />
            <h1 className="text-xl font-semibold" style={{ color: BRAND.blue }}>Loja fechada no momento</h1>
            <p className="text-muted-foreground text-sm">
              {catalog?.closedMessage || "Volte em breve — estamos preparando novidades!"}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <StoreCheckout
        cart={cart}
        total={cartTotal}
        onBack={() => setView("landing")}
        onSuccess={() => setCart([])}
      />
    );
  }

  if (view === "category" && selectedCategoryId) {
    const category = catalog.categories.find(c => c.id === selectedCategoryId);
    const products = catalog.products.filter(p => p.categoryId === selectedCategoryId);
    return (
      <CategoryView
        categoryName={category?.name ?? ""}
        products={products}
        cart={cart}
        cartTotal={cartTotal}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        onContinueShopping={goToLanding}
        onPay={() => setView("checkout")}
      />
    );
  }

  // ── LANDING ──
  return (
    <div className="min-h-screen pb-10" style={{ background: BRAND.white }}>
      <header className="py-8 px-4" style={{ background: BRAND.blue }}>
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-24 w-auto object-contain bg-white rounded-2xl p-2" />
          <h1 className="text-2xl font-bold tracking-tight text-white">LOJA INTEGRARTE</h1>
          <p className="text-sm text-white/95 max-w-lg mx-auto leading-relaxed">
            Olá... que bom ter você aqui. Nossa loja existe exclusivamente para o bem.
            Todos os nossos produtos têm verba revertida para atividades artísticas ou culturais.
            Agora escolha a categoria de produtos que você quer ver.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {categoriesWithProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhum produto disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
            {categoriesWithProducts.map(cat => (
              <button key={cat.id} onClick={() => goToCategory(cat.id)} className="text-left group">
                <Card className="overflow-hidden transition-all group-hover:shadow-md" style={{ borderColor: BRAND.yellow, borderWidth: 2 }}>
                  <div className="aspect-square flex items-center justify-center overflow-hidden" style={{ background: BRAND.yellowLight }}>
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8" style={{ color: BRAND.blue, opacity: 0.4 }} />
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm text-center" style={{ color: BRAND.blue }}>{cat.name}</p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 shadow-lg" style={{ background: BRAND.white, borderTop: `2px solid ${BRAND.blue}` }}>
          <div className="max-w-3xl mx-auto p-4 space-y-2">
            <div className="max-h-32 overflow-y-auto space-y-1">
              {cart.map(item => (
                <div key={item.key} className="flex items-center justify-between text-sm gap-2">
                  <span className="truncate">
                    {item.quantity}x {item.name}{item.flavorNames.length > 0 ? ` (${item.flavorNames.join(", ")})` : ""}
                  </span>
                  <span className="shrink-0" style={{ color: BRAND.blue }}>{fmt(item.unitPrice * item.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${BRAND.yellow}` }}>
              <div className="flex items-center gap-2 pt-2" style={{ color: BRAND.blue }}>
                <ShoppingCart className="h-5 w-5" />
                <span className="text-sm">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
                <span className="font-bold">{fmt(cartTotal)}</span>
              </div>
              <button
                onClick={() => setView("checkout")}
                className="px-5 py-2.5 mt-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background: BRAND.green }}
              >
                Pagar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
