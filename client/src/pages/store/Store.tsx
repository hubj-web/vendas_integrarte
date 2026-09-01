import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";
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
  optionIds: number[];
  variationSelections: { groupName: string; optionName: string }[];
  maxAvailable: number;
}

/** Texto entre parênteses mostrando sabor + variações escolhidas (ex: "Morango, Talharim, Molho Branco") */
export function cartItemVariationLabel(item: Pick<CartItem, "flavorNames" | "variationSelections">): string {
  const parts = [...item.flavorNames, ...item.variationSelections.map(s => s.optionName)];
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

type Context = { type: "regular" } | { type: "event"; eventId: number; eventName: string; eventKind: "ingresso" | "produtos" };
type View = "loading" | "choose_context" | "categories" | "category" | "checkout" | "closed";

export default function Store() {
  const { data: landing, isLoading: landingLoading } = trpc.publicStore.landing.useQuery(undefined, { refetchInterval: 30000 });
  const [context, setContext] = useState<Context | null>(null);
  const [view, setView] = useState<View>("loading");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const activeOptions = useMemo(() => {
    if (!landing) return [];
    const opts: { type: "regular" | "event"; id: number | "regular"; name: string; imageUrl?: string | null; description?: string | null }[] = [];
    if (landing.regularOpen) opts.push({ type: "regular", id: "regular", name: "Venda Regular" });
    for (const ev of landing.events) opts.push({ type: "event", id: ev.id, name: ev.name, imageUrl: ev.imageUrl, description: ev.description });
    return opts;
  }, [landing]);

  // Só decide a navegação inicial UMA VEZ — sem isso, o refetch periódico do
  // `landing` (a cada 30s) ficava chutando o cliente de volta pro início no
  // meio da compra.
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (landingLoading || !landing || hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    if (activeOptions.length === 0) { setView("closed"); return; }
    if (activeOptions.length === 1) {
      const opt = activeOptions[0];
      if (opt.type === "regular") setContext({ type: "regular" });
      else {
        const ev = landing.events.find(e => e.id === opt.id);
        setContext({ type: "event", eventId: opt.id as number, eventName: opt.name, eventKind: (ev?.type as any) ?? "produtos" });
      }
      setView("categories");
    } else {
      setView("choose_context");
    }
  }, [landing, landingLoading, activeOptions]);

  const catalogQuery = trpc.publicStore.catalog.useQuery(undefined, {
    enabled: context?.type === "regular",
    refetchInterval: 30000,
  });
  const eventCatalogQuery = trpc.publicStore.eventCatalog.useQuery(
    { eventId: context?.type === "event" ? context.eventId : -1 },
    { enabled: context?.type === "event", refetchInterval: 30000 }
  );

  const catalog = context?.type === "event" ? eventCatalogQuery.data : catalogQuery.data;
  const catalogLoading = context?.type === "event" ? eventCatalogQuery.isLoading : catalogQuery.isLoading;

  const categoriesWithProducts = useMemo(() => {
    if (!catalog?.products || !catalog.categories) return [];
    const idsComProduto = new Set(catalog.products.map((p: any) => p.categoryId));
    return catalog.categories.filter((c: any) => idsComProduto.has(c.id));
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

  function chooseContext(opt: (typeof activeOptions)[number]) {
    if (opt.type === "regular") setContext({ type: "regular" });
    else {
      const ev = landing?.events.find(e => e.id === opt.id);
      setContext({ type: "event", eventId: opt.id as number, eventName: opt.name, eventKind: (ev?.type as any) ?? "produtos" });
    }
    setView("categories");
  }

  function backToStart() {
    setContext(null);
    setCart([]);
    setView(activeOptions.length > 1 ? "choose_context" : "categories");
  }

  if (view === "loading" || landingLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando loja…</div>;
  }

  if (view === "closed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BRAND.white }}>
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-20 w-auto object-contain" />
            <h1 className="text-xl font-semibold" style={{ color: BRAND.blue }}>Loja fechada no momento</h1>
            <p className="text-muted-foreground text-sm">
              {landing?.regularClosedMessage || "Volte em breve — estamos preparando novidades!"}
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
        eventId={context?.type === "event" ? context.eventId : undefined}
        onBack={() => setView("categories")}
        onSuccess={() => setCart([])}
      />
    );
  }

  if (view === "category" && selectedCategoryId && catalog) {
    const category = catalog.categories.find((c: any) => c.id === selectedCategoryId);
    const catProducts = catalog.products.filter((p: any) => p.categoryId === selectedCategoryId);
    return (
      <CategoryView
        categoryName={category?.name ?? ""}
        products={catProducts}
        cart={cart}
        cartTotal={cartTotal}
        onAddToCart={addToCart}
        onRemoveFromCart={removeFromCart}
        onContinueShopping={() => setView("categories")}
        onPay={() => setView("checkout")}
      />
    );
  }

  if (view === "choose_context") {
    return (
      <div className="min-h-screen pb-10" style={{ background: BRAND.white }}>
        <header className="py-8 px-4" style={{ background: BRAND.blue }}>
          <div className="max-w-3xl mx-auto text-center space-y-3">
            <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-24 w-auto object-contain bg-white rounded-2xl p-2" />
            <h1 className="text-2xl font-bold tracking-tight text-white">LOJA INTEGRARTE</h1>
            <p className="text-sm text-white/95 max-w-lg mx-auto leading-relaxed">
              Olá... que bom ter você aqui. Nossa loja existe exclusivamente para o bem.
              Todos os nossos produtos têm verba revertida para atividades artísticas ou culturais.
              Escolha o que você quer ver:
            </p>
          </div>
        </header>
        <main className="max-w-3xl mx-auto p-4 grid gap-4 sm:grid-cols-2 mt-2">
          {activeOptions.map(opt => (
            <button key={String(opt.id)} onClick={() => chooseContext(opt)} className="text-left group">
              <Card className="overflow-hidden transition-all group-hover:shadow-md" style={{ borderColor: BRAND.yellow, borderWidth: 2 }}>
                <div className={`aspect-square flex items-center justify-center overflow-hidden ${opt.imageUrl ? "" : "p-2"}`} style={{ background: BRAND.yellowLight }}>
                  {opt.imageUrl ? (
                    <img src={opt.imageUrl} alt={opt.name} className="w-full h-full object-cover" />
                  ) : (
                    <p className="font-semibold text-center" style={{ color: BRAND.blue }}>{opt.name}</p>
                  )}
                </div>
                {opt.imageUrl && opt.description && (
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground line-clamp-2">{opt.description}</p>
                  </CardContent>
                )}
              </Card>
            </button>
          ))}
        </main>
      </div>
    );
  }

  // ── view === "categories" ──
  const eventInfo = context?.type === "event" ? landing?.events.find(e => e.id === context.eventId) : null;

  return (
    <div className="min-h-screen pb-10" style={{ background: BRAND.white }}>
      <header className="py-8 px-4 relative" style={{ background: BRAND.blue }}>
        {activeOptions.length > 1 && (
          <button
            onClick={backToStart}
            className="absolute left-4 top-4 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: BRAND.white, color: BRAND.blue }}
          >
            ← Voltar
          </button>
        )}
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <img src="/integrarte-logo.png" alt="Integrarte" className="mx-auto h-24 w-auto object-contain bg-white rounded-2xl p-2" />
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {context?.type === "event" ? context.eventName.toUpperCase() : "LOJA INTEGRARTE"}
          </h1>
          <p className="text-sm text-white/95 max-w-lg mx-auto leading-relaxed">
            {context?.type === "event"
              ? (eventInfo?.description || "Escolha a categoria de produtos que você quer ver.")
              : <>Olá... que bom ter você aqui. Nossa loja existe exclusivamente para o bem.
                 Todos os nossos produtos têm verba revertida para atividades artísticas ou culturais.
                 Agora escolha a categoria de produtos que você quer ver.</>}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {catalogLoading ? (
          <p className="text-center text-muted-foreground py-16">Carregando produtos…</p>
        ) : categoriesWithProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhum produto disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
            {categoriesWithProducts.map((cat: any) => (
              <button
                key={cat.id} onClick={() => { setSelectedCategoryId(cat.id); setView("category"); }}
                className={`text-left group ${cat.displaySize === "grande" ? "col-span-2" : ""}`}
              >
                <Card className="overflow-hidden transition-all group-hover:shadow-md" style={{ borderColor: BRAND.yellow, borderWidth: 2 }}>
                  <div
                    className={`aspect-square flex items-center justify-center overflow-hidden ${cat.imageUrl ? "" : "p-2"}`}
                    style={{ background: BRAND.yellowLight }}
                  >
                    {cat.imageUrl ? (
                      <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" />
                    ) : (
                      <p className={`font-medium text-center ${cat.displaySize === "grande" ? "text-base" : "text-sm"}`} style={{ color: BRAND.blue }}>{cat.name}</p>
                    )}
                  </div>
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
                    {item.quantity}x {item.name}{cartItemVariationLabel(item)}
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
