import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShoppingCart, ImageIcon, Plus, Minus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "./Store";
import { BRAND } from "./brand";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const VARIATION_LABEL: Record<string, string> = { sabor: "Sabor", tamanho: "Tamanho", cor: "Cor" };

interface StoreProduct {
  id: number; name: string; categoryId: number | null; unit: string; price: string;
  description: string | null; maxFlavors: number; variationType: string; imageUrl: string | null;
  availableQuantity: number; flavors: { id: number; name: string }[];
}

interface Props {
  categoryName: string;
  products: StoreProduct[];
  cart: CartItem[];
  cartTotal: number;
  onAddToCart: (item: CartItem) => void;
  onRemoveFromCart: (key: string) => void;
  onContinueShopping: () => void;
  onPay: () => void;
}

function cartKey(productId: number, flavorId?: number) {
  return `${productId}::${flavorId ?? "none"}`;
}

/** Botões -/+ sempre visíveis, com o número escolhido bem destacado no meio. */
function QuantityStepper({ value, onChange, max }: { value: number; onChange: (v: number) => void; max: number }) {
  return (
    <div className="flex items-center rounded-lg overflow-hidden border" style={{ borderColor: BRAND.blue }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value <= 0}
        className="w-8 h-8 flex items-center justify-center disabled:opacity-30 hover:opacity-80"
        style={{ background: BRAND.yellowLight, color: BRAND.blue }}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-9 text-center font-semibold text-sm" style={{ color: BRAND.blue }}>{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="w-8 h-8 flex items-center justify-center disabled:opacity-30 hover:opacity-80"
        style={{ background: BRAND.yellowLight, color: BRAND.blue }}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function CategoryView({ categoryName, products, cart, cartTotal, onAddToCart, onRemoveFromCart, onContinueShopping, onPay }: Props) {
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  function setDraft(key: string, value: number, max: number) {
    const clamped = Math.max(0, Math.min(max, isNaN(value) ? 0 : value));
    setDrafts(prev => ({ ...prev, [key]: clamped }));
  }

  function alreadyInCart(key: string): number {
    return cart.find(i => i.key === key)?.quantity ?? 0;
  }

  function handleInsert(product: StoreProduct, flavor?: { id: number; name: string }) {
    const key = cartKey(product.id, flavor?.id);
    const draftQty = drafts[key] ?? 0;
    if (draftQty <= 0) {
      toast.error("Escolha uma quantidade antes de inserir.");
      return;
    }
    const jaNoCarrinho = alreadyInCart(key);
    if (jaNoCarrinho + draftQty > product.availableQuantity) {
      toast.error(`Só há ${product.availableQuantity} em estoque.`);
      return;
    }
    onAddToCart({
      key, productId: product.id, name: product.name, unitPrice: Number(product.price),
      quantity: draftQty, flavorIds: flavor ? [flavor.id] : [], flavorNames: flavor ? [flavor.name] : [],
      maxAvailable: product.availableQuantity,
    });
    setDrafts(prev => ({ ...prev, [key]: 0 }));
    toast.success(`${product.name}${flavor ? ` (${flavor.name})` : ""} adicionado!`);
  }

  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="min-h-screen pb-32" style={{ background: BRAND.white }}>
      <header className="py-4 px-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: BRAND.blue }}>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={onContinueShopping}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold text-white">{categoryName}</h1>
      </header>

      {/* Carrinho: lista de itens + total, sempre visível e atualizando em tempo real */}
      <div className="sticky top-[60px] z-10 px-4 py-2 text-sm" style={{ background: BRAND.yellowLight, borderBottom: `1px solid ${BRAND.yellow}` }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-1.5 mb-1" style={{ color: BRAND.blue }}>
            <ShoppingCart className="h-4 w-4" />
            <span className="font-medium">{cartCount} {cartCount === 1 ? "item" : "itens"} no carrinho</span>
          </div>
          {cart.length > 0 && (
            <div className="max-h-28 overflow-y-auto space-y-1 mb-1">
              {cart.map(item => (
                <div key={item.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {item.quantity}x {item.name}{item.flavorNames.length > 0 ? ` (${item.flavorNames.join(", ")})` : ""}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span style={{ color: BRAND.blue }}>{fmt(item.unitPrice * item.quantity)}</span>
                    <button onClick={() => onRemoveFromCart(item.key)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between font-bold pt-1" style={{ color: BRAND.blue, borderTop: cart.length > 0 ? `1px solid ${BRAND.yellow}` : "none" }}>
            <span>Total</span>
            <span>{fmt(cartTotal)}</span>
          </div>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {products.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhum produto disponível nessa categoria.</p>
        ) : (
          products.map(product => (
            <Card key={product.id} style={{ borderColor: BRAND.yellow }}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="w-16 h-16 rounded-lg object-cover border shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg flex items-center justify-center border shrink-0" style={{ background: BRAND.yellowLight }}>
                      <ImageIcon className="h-6 w-6" style={{ color: BRAND.blue, opacity: 0.3 }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{product.name}</p>
                      <Badge variant="secondary" className="shrink-0">{product.availableQuantity} {product.unit}</Badge>
                    </div>
                    {product.description && <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>}
                  </div>
                </div>

                {product.flavors.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {VARIATION_LABEL[product.variationType] ?? "Opção"}
                    </p>
                    {product.flavors.map(f => {
                      const key = cartKey(product.id, f.id);
                      return (
                        <div key={f.id} className="flex items-center justify-between gap-2 py-1">
                          <span className="text-sm flex-1 min-w-0 truncate">{f.name}</span>
                          <span className="text-sm font-medium shrink-0" style={{ color: BRAND.blue }}>{fmt(product.price)}</span>
                          <QuantityStepper
                            value={drafts[key] ?? 0}
                            onChange={v => setDraft(key, v, product.availableQuantity)}
                            max={product.availableQuantity}
                          />
                          <Button size="sm" className="shrink-0 gap-1 text-white" style={{ background: BRAND.green }} onClick={() => handleInsert(product, f)}>
                            <Plus className="h-3.5 w-3.5" /> Inserir
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold" style={{ color: BRAND.blue }}>{fmt(product.price)}</span>
                    <QuantityStepper
                      value={drafts[cartKey(product.id)] ?? 0}
                      onChange={v => setDraft(cartKey(product.id), v, product.availableQuantity)}
                      max={product.availableQuantity}
                    />
                    <Button className="gap-1.5 text-white" style={{ background: BRAND.green }} onClick={() => handleInsert(product)}>
                      <Plus className="h-4 w-4" /> Inserir
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 p-4 shadow-lg" style={{ background: BRAND.white, borderTop: `2px solid ${BRAND.blue}` }}>
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Button
            variant="outline" className="flex-1 font-semibold"
            style={{ borderColor: BRAND.blue, color: BRAND.blue }}
            onClick={onContinueShopping}
          >
            Continuar Comprando
          </Button>
          <Button
            className="flex-1 font-semibold text-white"
            style={{ background: BRAND.green }}
            onClick={onPay}
            disabled={cartCount === 0}
          >
            Pagar
          </Button>
        </div>
      </div>
    </div>
  );
}
