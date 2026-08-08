import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import type { CartItem } from "./Store";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const VARIATION_LABEL: Record<string, string> = { sabor: "Sabor", tamanho: "Tamanho", cor: "Cor" };

interface StoreProduct {
  id: number; name: string; categoryId: number | null; unit: string; price: string;
  description: string | null; maxFlavors: number; variationType: string;
  availableQuantity: number; flavors: { id: number; name: string }[];
}

interface Props {
  categoryName: string;
  products: StoreProduct[];
  cart: CartItem[];
  onMergeCart: (draftItems: CartItem[]) => void;
  onContinueShopping: () => void;
  onPay: () => void;
}

/** Chave única de carrinho: produto + variação (ou "none" se produto sem variação) */
function cartKey(productId: number, flavorId?: number) {
  return `${productId}::${flavorId ?? "none"}`;
}

export default function CategoryView({ categoryName, products, cart, onMergeCart, onContinueShopping, onPay }: Props) {
  // Estado local (rascunho) de quantidades — inicializado a partir do carrinho já existente
  // pra essa categoria, assim o cliente vê o que já tinha escolhido se voltar aqui.
  const initialQtys = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of cart) {
      if (products.some(p => p.id === item.productId)) {
        map[item.key] = item.quantity;
      }
    }
    return map;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [qtys, setQtys] = useState<Record<string, number>>(initialQtys);

  function setQty(productId: number, flavorId: number | undefined, value: number, max: number) {
    const key = cartKey(productId, flavorId);
    const clamped = Math.max(0, Math.min(max, isNaN(value) ? 0 : value));
    setQtys(prev => ({ ...prev, [key]: clamped }));
  }

  function buildDraftItems(): CartItem[] {
    const draft: CartItem[] = [];
    for (const p of products) {
      if (p.flavors.length > 0) {
        for (const f of p.flavors) {
          const key = cartKey(p.id, f.id);
          const qty = qtys[key] ?? 0;
          if (qty > 0) {
            draft.push({
              key, productId: p.id, name: p.name, unitPrice: Number(p.price),
              quantity: qty, flavorIds: [f.id], flavorNames: [f.name], maxAvailable: p.availableQuantity,
            });
          } else {
            draft.push({ key, productId: p.id, name: p.name, unitPrice: Number(p.price), quantity: 0, flavorIds: [f.id], flavorNames: [f.name], maxAvailable: p.availableQuantity });
          }
        }
      } else {
        const key = cartKey(p.id);
        const qty = qtys[key] ?? 0;
        draft.push({
          key, productId: p.id, name: p.name, unitPrice: Number(p.price),
          quantity: qty, flavorIds: [], flavorNames: [], maxAvailable: p.availableQuantity,
        });
      }
    }
    return draft;
  }

  function handleContinue() {
    onMergeCart(buildDraftItems());
    onContinueShopping();
  }

  function handlePay() {
    onMergeCart(buildDraftItems());
    onPay();
  }

  const totalSelecionado = Object.values(qtys).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-muted/20 pb-28">
      <header className="bg-primary text-primary-foreground py-4 px-4 flex items-center gap-3 sticky top-0 z-10">
        <Button size="icon" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={onContinueShopping}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold">{categoryName}</h1>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-3">
        {products.length === 0 ? (
          <p className="text-center text-muted-foreground py-16">Nenhum produto disponível nessa categoria.</p>
        ) : (
          products.map(product => (
            <Card key={product.id}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium leading-tight">{product.name}</p>
                    {product.description && <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>}
                  </div>
                  <Badge variant="secondary" className="shrink-0">{product.availableQuantity} {product.unit}</Badge>
                </div>

                {product.flavors.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {VARIATION_LABEL[product.variationType] ?? "Opção"}
                    </p>
                    {product.flavors.map(f => {
                      const key = cartKey(product.id, f.id);
                      return (
                        <div key={f.id} className="flex items-center justify-between gap-3 py-1">
                          <span className="text-sm">{f.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-primary">{fmt(product.price)}</span>
                            <Input
                              type="number" min={0} max={product.availableQuantity}
                              value={qtys[key] ?? 0}
                              onChange={e => setQty(product.id, f.id, parseInt(e.target.value), product.availableQuantity)}
                              className="w-16 h-8 text-center"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-primary">{fmt(product.price)}</span>
                    <Input
                      type="number" min={0} max={product.availableQuantity}
                      value={qtys[cartKey(product.id)] ?? 0}
                      onChange={e => setQty(product.id, undefined, parseInt(e.target.value), product.availableQuantity)}
                      className="w-20 h-9 text-center"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </main>

      <div className="fixed bottom-0 inset-x-0 bg-background border-t p-4 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {totalSelecionado > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
              <ShoppingCart className="h-4 w-4" /> {totalSelecionado}
            </div>
          )}
          <Button variant="outline" className="flex-1" onClick={handleContinue}>
            Continuar Comprando
          </Button>
          <Button className="flex-1" onClick={handlePay}>
            Pagar
          </Button>
        </div>
      </div>
    </div>
  );
}
