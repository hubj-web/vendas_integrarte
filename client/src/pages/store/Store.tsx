import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Store as StoreIcon, ShoppingCart, ImageIcon } from "lucide-react";
import CategoryView from "./CategoryView";
import StoreCheckout from "./StoreCheckout";

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

  function mergeCart(draftItems: CartItem[]) {
    setCart(prev => {
      const keysInDraft = new Set(draftItems.map(d => d.key));
      const withoutDraftKeys = prev.filter(i => !keysInDraft.has(i.key));
      return [...withoutDraftKeys, ...draftItems.filter(d => d.quantity > 0)];
    });
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
        onMergeCart={mergeCart}
        onContinueShopping={goToLanding}
        onPay={() => setView("checkout")}
      />
    );
  }

  // ── LANDING ──
  return (
    <div className="min-h-screen bg-muted/20 pb-10">
      <header className="bg-primary text-primary-foreground py-8 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <StoreIcon className="mx-auto h-9 w-9" />
          <h1 className="text-2xl font-bold tracking-tight">LOJA INTEGRARTE</h1>
          <p className="text-sm opacity-95 max-w-lg mx-auto leading-relaxed">
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
                <Card className="overflow-hidden transition-all group-hover:border-primary group-hover:shadow-md">
                  <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    )}
                  </div>
                  <CardContent className="p-3">
                    <p className="font-medium text-sm text-center">{cat.name}</p>
                  </CardContent>
                </Card>
              </button>
            ))}
          </div>
        )}
      </main>

      {cartCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 bg-background border-t p-4 shadow-lg">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <span className="text-sm text-muted-foreground">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
              <span className="font-semibold">{fmt(cartTotal)}</span>
            </div>
            <button
              onClick={() => setView("checkout")}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            >
              Pagar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
