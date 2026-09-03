import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ShoppingCart, ImageIcon, Plus, Minus, Trash2, ZoomIn, X } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "./Store";
import { cartItemVariationLabel } from "./Store";
import { BRAND } from "./brand";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const VARIATION_LABEL: Record<string, string> = { sabor: "Sabor", tamanho: "Tamanho", cor: "Cor" };

interface VariationGroup {
  id: number; name: string; required: boolean; allowMultiple: boolean;
  options: { id: number; name: string; additionalPrice: string }[];
}

interface StoreProduct {
  id: number; name: string; categoryId: number | null; unit: string; price: string;
  description: string | null; maxFlavors: number; variationType: string; imageUrl: string | null;
  displaySize?: "pequeno" | "medio" | "grande" | null;
  isPreOrder?: boolean;
  availableQuantity: number; flavors: { id: number; name: string }[];
  variationGroups?: VariationGroup[];
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
  const [zoomedImage, setZoomedImage] = useState<{ url: string; name: string } | null>(null);

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
      optionIds: [], variationSelections: [],
      maxAvailable: product.availableQuantity,
    });
    setDrafts(prev => ({ ...prev, [key]: 0 }));
    toast.success(`${product.name}${flavor ? ` (${flavor.name})` : ""} adicionado!`);
  }

  // Seleções de grupo de variação (produto com múltiplas escolhas, ex: marmitex)
  const [groupSelections, setGroupSelections] = useState<Record<string, number[]>>({}); // "productId:groupId" -> optionIds
  const [groupQtyDrafts, setGroupQtyDrafts] = useState<Record<number, number>>({}); // productId -> quantidade

  function toggleGroupOption(productId: number, group: VariationGroup, optionId: number) {
    const gKey = `${productId}:${group.id}`;
    setGroupSelections(prev => {
      const current = prev[gKey] ?? [];
      if (group.allowMultiple) {
        const next = current.includes(optionId) ? current.filter(id => id !== optionId) : [...current, optionId];
        return { ...prev, [gKey]: next };
      }
      return { ...prev, [gKey]: current.includes(optionId) ? [] : [optionId] };
    });
  }

  function handleInsertWithGroups(product: StoreProduct) {
    const groups = product.variationGroups ?? [];
    const qty = groupQtyDrafts[product.id] ?? 0;
    if (qty <= 0) {
      toast.error("Escolha uma quantidade antes de inserir.");
      return;
    }
    for (const group of groups) {
      const selected = groupSelections[`${product.id}:${group.id}`] ?? [];
      if (group.required && selected.length === 0) {
        toast.error(`Escolha "${group.name}" antes de inserir.`);
        return;
      }
    }
    const allSelectedIds = groups.flatMap(g => groupSelections[`${product.id}:${g.id}`] ?? []);
    const selections = groups.flatMap(g => {
      const selected = groupSelections[`${product.id}:${g.id}`] ?? [];
      return g.options.filter(o => selected.includes(o.id)).map(o => ({ groupName: g.name, optionName: o.name }));
    });
    const additionalPrice = groups.reduce((acc, g) => {
      const selected = groupSelections[`${product.id}:${g.id}`] ?? [];
      return acc + g.options.filter(o => selected.includes(o.id)).reduce((a, o) => a + Number(o.additionalPrice), 0);
    }, 0);

    const key = cartKey(product.id) + "::" + [...allSelectedIds].sort((a, b) => a - b).join(",");
    const jaNoCarrinho = alreadyInCart(key);
    if (jaNoCarrinho + qty > product.availableQuantity) {
      toast.error(`Só há ${product.availableQuantity} em estoque.`);
      return;
    }
    onAddToCart({
      key, productId: product.id, name: product.name, unitPrice: Number(product.price) + additionalPrice,
      quantity: qty, flavorIds: [], flavorNames: [], optionIds: allSelectedIds, variationSelections: selections,
      maxAvailable: product.availableQuantity,
    });
    setGroupQtyDrafts(prev => ({ ...prev, [product.id]: 0 }));
    setGroupSelections(prev => {
      const next = { ...prev };
      for (const g of groups) delete next[`${product.id}:${g.id}`];
      return next;
    });
    toast.success(`${product.name} adicionado!`);
  }

  const cartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="min-h-screen pb-32" style={{ background: BRAND.white }}>
      <header className="py-4 px-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: BRAND.blue }}>
        <button
          onClick={onContinueShopping}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
          style={{ background: BRAND.white, color: BRAND.blue }}
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <h1 className="font-semibold text-white truncate">{categoryName}</h1>
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
                    {item.quantity}x {item.name}{cartItemVariationLabel(item)}
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
          products.map(product => {
            const thumbSize = product.displaySize === "grande" ? "w-24 h-24" : product.displaySize === "pequeno" ? "w-12 h-12" : "w-16 h-16";
            const iconSize = product.displaySize === "grande" ? "h-8 w-8" : product.displaySize === "pequeno" ? "h-4 w-4" : "h-6 w-6";
            return (
            <Card key={product.id} style={{ borderColor: BRAND.yellow }}>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start gap-3">
                  {product.imageUrl ? (
                    <button
                      onClick={() => setZoomedImage({ url: product.imageUrl!, name: product.name })}
                      className={`relative ${thumbSize} shrink-0 group cursor-pointer`}
                      aria-label={`Ampliar foto de ${product.name}`}
                    >
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full rounded-lg object-cover border" />
                      <div className="absolute inset-0 rounded-lg bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 rounded-full p-1 shadow" style={{ background: BRAND.blue }}>
                        <ZoomIn className="h-2.5 w-2.5 text-white" />
                      </div>
                    </button>
                  ) : (
                    <div className={`${thumbSize} rounded-lg flex items-center justify-center border shrink-0`} style={{ background: BRAND.yellowLight }}>
                      <ImageIcon className={iconSize} style={{ color: BRAND.blue, opacity: 0.3 }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-tight">{product.name}</p>
                      <Badge variant="secondary" className="shrink-0">
                        {product.isPreOrder ? "Sob encomenda" : `${product.availableQuantity} ${product.unit}`}
                      </Badge>
                    </div>
                    {product.description && <p className="text-xs text-muted-foreground mt-0.5">{product.description}</p>}
                    {product.imageUrl && (
                      <p className="text-[11px] mt-1" style={{ color: BRAND.blue }}>📷 Toque na foto para ampliar</p>
                    )}
                  </div>
                </div>

                {(product.variationGroups?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {product.variationGroups!.map(group => (
                      <div key={group.id} className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          {group.name}{group.required ? "" : " (opcional)"}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.options.map(opt => {
                            const selected = (groupSelections[`${product.id}:${group.id}`] ?? []).includes(opt.id);
                            return (
                              <button
                                key={opt.id} type="button"
                                onClick={() => toggleGroupOption(product.id, group, opt.id)}
                                className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                                style={selected
                                  ? { background: BRAND.blue, borderColor: BRAND.blue, color: "white" }
                                  : { background: "white", borderColor: BRAND.yellow, color: BRAND.blue }}
                              >
                                {opt.name}{Number(opt.additionalPrice) > 0 && ` (+${fmt(opt.additionalPrice)})`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="font-semibold" style={{ color: BRAND.blue }}>{fmt(product.price)}</span>
                      <QuantityStepper
                        value={groupQtyDrafts[product.id] ?? 0}
                        onChange={v => setGroupQtyDrafts(prev => ({ ...prev, [product.id]: Math.max(0, Math.min(product.availableQuantity, v)) }))}
                        max={product.availableQuantity}
                      />
                      <Button className="gap-1.5 text-white" style={{ background: BRAND.green }} onClick={() => handleInsertWithGroups(product)}>
                        <Plus className="h-4 w-4" /> Inserir
                      </Button>
                    </div>
                  </div>
                ) : product.flavors.length > 0 ? (
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
            );
          })
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

      {zoomedImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setZoomedImage(null)}
        >
          <button
            onClick={() => setZoomedImage(null)}
            className="absolute top-4 right-4 rounded-full p-2 bg-white/10 hover:bg-white/20 text-white"
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
          <div className="flex flex-col items-center gap-3 max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <img src={zoomedImage.url} alt={zoomedImage.name} className="max-w-full max-h-[80vh] rounded-lg object-contain" />
            <p className="text-white text-sm text-center">{zoomedImage.name}</p>
          </div>
        </div>
      )}
    </div>
  );
}
