import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import CategoryView from "./CategoryView";
import StoreCheckout from "./StoreCheckout";
import { BRAND, loadStoreFonts } from "./brand";
import WhatsAppFloatButton from "./WhatsAppFloatButton";
import HubJFooter from "@/components/HubJFooter";
import StoreSocialFooter from "./StoreSocialFooter";

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
type View = "loading" | "categories" | "category" | "checkout" | "closed";
// "root" = tela inicial única (categorias da Venda Regular + eventos misturados).
// número = dentro de um evento específico, vendo só as categorias dele.
type LandingScope = "root" | number;

export default function Store() {
  const { data: landing, isLoading: landingLoading } = trpc.publicStore.landing.useQuery(undefined, { refetchInterval: 30000 });
  const [context, setContext] = useState<Context>({ type: "regular" });
  const [view, setView] = useState<View>("loading");
  const [landingScope, setLandingScope] = useState<LandingScope>("root");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const hasAnythingOpen = !!landing && (landing.regularOpen || landing.events.length > 0);

  // Só decide a navegação inicial UMA VEZ — sem isso, o refetch periódico do
  // `landing` (a cada 30s) ficava chutando o cliente de volta pro início no
  // meio da compra.
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (landingLoading || !landing || hasInitializedRef.current) return;
    hasInitializedRef.current = true;
    setView(hasAnythingOpen ? "categories" : "closed");
  }, [landing, landingLoading, hasAnythingOpen]);

  useEffect(() => { loadStoreFonts(); }, []);

  // Evento cujas categorias estão sendo mostradas agora (tanto na tela
  // "dentro do evento" quanto quando o cliente já entrou num produto dele).
  const activeEventId = typeof landingScope === "number" ? landingScope : (context.type === "event" ? context.eventId : null);

  const regularCatalogQuery = trpc.publicStore.catalog.useQuery(undefined, {
    enabled: !!landing?.regularOpen,
    refetchInterval: 30000,
  });
  const eventCatalogQuery = trpc.publicStore.eventCatalog.useQuery(
    { eventId: activeEventId ?? -1 },
    { enabled: activeEventId != null, refetchInterval: 30000 }
  );

  // Catálogo relevante pra tela atual: se estamos dentro de um evento
  // (navegando nas categorias dele, ou já dentro de uma categoria dele),
  // usa o catálogo desse evento; senão, o catálogo da Venda Regular.
  const catalog = activeEventId != null ? eventCatalogQuery.data : regularCatalogQuery.data;
  const catalogLoading = activeEventId != null ? eventCatalogQuery.isLoading : regularCatalogQuery.isLoading;

  const regularCategoriesWithProducts = useMemo(() => {
    const c = regularCatalogQuery.data;
    if (!c?.products || !c.categories) return [];
    const idsComProduto = new Set(c.products.map((p: any) => p.categoryId));
    return c.categories.filter((cat: any) => idsComProduto.has(cat.id));
  }, [regularCatalogQuery.data]);

  const eventCategoriesWithProducts = useMemo(() => {
    const c = eventCatalogQuery.data;
    if (!c?.products || !c.categories) return [];
    const idsComProduto = new Set(c.products.map((p: any) => p.categoryId));
    return c.categories.filter((cat: any) => idsComProduto.has(cat.id));
  }, [eventCatalogQuery.data]);

  const cartTotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const [categoryPopup, setCategoryPopup] = useState<{ name: string; message: string } | null>(null);
  // Lembra se a categoria atual foi aberta pelo "pulo automático" (evento com
  // só 1 categoria) — assim o botão "voltar" sabe ir direto pro início, sem
  // precisar recalcular a contagem de categorias na hora (que pode variar
  // por causa do carregamento e levar pra tela errada).
  const [openedByAutoSkip, setOpenedByAutoSkip] = useState(false);

  /** Abre uma categoria — e, se ela tiver um recado configurado, mostra o pop-up também. */
  function openCategory(cat: { id: number; name: string; popupEnabled?: boolean | null; popupMessage?: string | null }, autoSkip = false) {
    setSelectedCategoryId(cat.id);
    setView("category");
    setOpenedByAutoSkip(autoSkip);
    if (cat.popupEnabled && cat.popupMessage) {
      setCategoryPopup({ name: cat.name, message: cat.popupMessage });
    }
  }

  // Se o evento tem só UMA categoria vinculada, não faz sentido mostrar uma
  // tela de "escolha a categoria" com uma opção só — pula direto pros
  // produtos dela assim que o catálogo do evento carregar.
  useEffect(() => {
    if (view !== "categories" || typeof landingScope !== "number" || eventCatalogQuery.isLoading) return;
    if (eventCategoriesWithProducts.length === 1) {
      openCategory(eventCategoriesWithProducts[0], true);
    }
  }, [view, landingScope, eventCatalogQuery.isLoading, eventCategoriesWithProducts]);
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

  /** Cliente clicou num evento na tela inicial — mostra as categorias desse evento, sem sair da tela. */
  function openEvent(ev: NonNullable<typeof landing>["events"][number]) {
    setLandingScope(ev.id);
    setContext({ type: "event", eventId: ev.id, eventName: ev.name, eventKind: (ev.type as any) ?? "produtos" });
  }

  /** Volta da tela de categorias de um evento pra tela inicial única. */
  function backToRoot() {
    setLandingScope("root");
    setContext({ type: "regular" });
  }

  if (view === "loading" || landingLoading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando loja…</div>;
  }

  if (view === "closed") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: BRAND.white }}>
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8 space-y-3">
            <img src={landing?.logoUrl || "/integrarte-logo.png"} alt="Integrarte" className="mx-auto h-20 w-auto object-contain" />
            <h1 className="text-xl font-semibold" style={{ color: BRAND.blue }}>Loja fechada no momento</h1>
            <p className="text-muted-foreground text-sm">
              {landing?.regularClosedMessage || "Volte em breve — estamos preparando novidades!"}
            </p>
          </CardContent>
        </Card>
        <StoreSocialFooter />
      <HubJFooter />
      <WhatsAppFloatButton />
      </div>
    );
  }

  if (view === "checkout") {
    return (
      <StoreCheckout
        cart={cart}
        total={cartTotal}
        eventId={context.type === "event" ? context.eventId : undefined}
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
        onContinueShopping={() => {
          // Se veio de um evento com só uma categoria (pulo automático),
          // "voltar" pra tela de categorias desse evento seria inútil (o
          // pulo levaria de volta pro mesmo produto na hora) — volta direto
          // pro início.
          if (openedByAutoSkip) {
            backToRoot();
          } else {
            setView("categories");
          }
        }}
        onPay={() => setView("checkout")}
      />
    );
  }

  // ── view === "categories" ── (tela inicial única, ou categorias de um evento específico)
  const insideEvent = typeof landingScope === "number";
  const eventInfo = insideEvent ? landing?.events.find(e => e.id === landingScope) : null;

  function CategoryTile({ imageUrl, name, displaySize, onClick }: { imageUrl?: string | null; name: string; displaySize?: string; onClick: () => void }) {
    const isPequeno = displaySize === "pequeno";
    const isGrande = displaySize === "grande";
    return (
      <button onClick={onClick} className={`text-left group cursor-pointer ${isGrande ? "col-span-2" : ""} ${isPequeno ? "flex justify-center" : ""}`}>
        <Card className={`overflow-hidden transition-all border-0 shadow-none py-0 gap-0 ring-2 ring-transparent group-hover:ring-[#1E4B9C] ${isPequeno ? "w-2/3" : "w-full"}`}>
          <div className={`aspect-square flex items-center justify-center overflow-hidden ${imageUrl ? "" : "p-2"}`} style={{ background: BRAND.yellowLight }}>
            {imageUrl ? (
              <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <p className={`font-medium text-center ${isGrande ? "text-base" : isPequeno ? "text-xs" : "text-sm"}`} style={{ color: BRAND.blue }}>{name}</p>
            )}
          </div>
        </Card>
      </button>
    );
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: BRAND.white }}>
      <header className="py-8 px-4 relative" style={{ background: landing?.primaryColor || BRAND.blue }}>
        {insideEvent && (
          <button
            onClick={backToRoot}
            className="absolute left-4 top-4 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
            style={{ background: BRAND.white, color: landing?.primaryColor || BRAND.blue }}
          >
            ← Voltar
          </button>
        )}
        <div className="max-w-3xl mx-auto text-center space-y-3">
          <img src={landing?.logoUrl || "/integrarte-logo.png"} alt="Integrarte" className="mx-auto h-24 w-auto object-contain bg-white rounded-2xl p-2" />
          <h1
            className="text-2xl font-bold tracking-tight text-white"
            style={{
              fontFamily: landing?.titleFontFamily || undefined,
              fontSize: landing?.titleFontSize ? `${landing.titleFontSize}px` : undefined,
              color: landing?.titleColor || undefined,
            }}
          >
            {insideEvent ? (eventInfo?.name ?? "").toUpperCase() : (landing?.storeTitle ?? "LOJA INTEGRARTE")}
          </h1>
          <p
            className="text-sm text-white/95 max-w-lg mx-auto leading-relaxed"
            style={{
              fontFamily: landing?.messageFontFamily || undefined,
              fontSize: landing?.messageFontSize ? `${landing.messageFontSize}px` : undefined,
              color: landing?.messageColor || undefined,
            }}
          >
            {insideEvent
              ? (eventInfo?.description || "Escolha a categoria de produtos que você quer ver.")
              : (landing?.welcomeMessage ?? "")}
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {catalogLoading ? (
          <p className="text-center text-muted-foreground py-16">Carregando produtos…</p>
        ) : insideEvent ? (
          eventCategoriesWithProducts.length === 0 ? (
            <p className="text-center text-muted-foreground py-16">Nenhum produto disponível nesse evento no momento.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
              {eventCategoriesWithProducts.map((cat: any) => (
                <CategoryTile
                  key={cat.id} imageUrl={cat.imageUrl} name={cat.name} displaySize={cat.displaySize}
                  onClick={() => openCategory(cat)}
                />
              ))}
            </div>
          )
        ) : regularCategoriesWithProducts.length === 0 && landing?.events.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhum produto disponível no momento.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-2">
            {regularCategoriesWithProducts.map((cat: any) => (
              <CategoryTile
                key={`cat-${cat.id}`} imageUrl={cat.imageUrl} name={cat.name} displaySize={cat.displaySize}
                onClick={() => { setContext({ type: "regular" }); openCategory(cat); }}
              />
            ))}
            {landing?.events.map(ev => (
              <CategoryTile
                key={`event-${ev.id}`} imageUrl={ev.imageUrl} name={ev.name}
                onClick={() => openEvent(ev)}
              />
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
      <StoreSocialFooter />
      <HubJFooter />
      <WhatsAppFloatButton />

      <Dialog open={categoryPopup !== null} onOpenChange={(open) => !open && setCategoryPopup(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{categoryPopup?.name}</DialogTitle></DialogHeader>
          <p className="text-sm whitespace-pre-line">{categoryPopup?.message}</p>
          <DialogFooter>
            <Button className="w-full" onClick={() => setCategoryPopup(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
