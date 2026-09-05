import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Plus, Minus, Trash2, ShoppingCart, Loader2, ExternalLink } from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const PAYMENT_CODE_MAP: Record<string, "cash" | "pix" | "credit_card" | "debit_card"> = {
  dinheiro_vendedor: "cash", pix_vendedor: "pix", cartao_vendedor: "credit_card", debito_vendedor: "debit_card",
};

interface CartItem {
  key: string;
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  flavorIds: number[];
  flavorNames: string[];
  eventId?: number;
  eventName?: string;
  deliveryMethodId?: number;
  deliveryMethodName?: string;
  requiresDelivery?: boolean;
}

export default function SellerUnifiedSale() {
  // "regular" = navegando o catálogo comum; um número = navegando o
  // catálogo desse evento específico. O carrinho é único, independente
  // de onde cada item foi adicionado.
  const [mode, setMode] = useState<"regular" | number>("regular");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<number, number>>({});

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [deliveryMethodId, setDeliveryMethodId] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix" | "credit_card" | "debit_card" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successTicketCode, setSuccessTicketCode] = useState<string | null>(null);

  const { data: regularCatalog } = trpc.publicStore.catalog.useQuery();
  const { data: openEvents = [] } = trpc.sellerEvents.listOpenEvents.useQuery();
  const { data: eventCatalog } = trpc.sellerEvents.eventCatalog.useQuery(
    { eventId: typeof mode === "number" ? mode : -1 },
    { enabled: typeof mode === "number" }
  );
  const { data: deliveryMethods = [] } = trpc.publicStore.deliveryMethods.useQuery();
  const { data: availablePaymentMethods = [] } = trpc.seller.paymentMethods.useQuery();

  const createOrder = trpc.sellerEvents.createUnifiedOrder.useMutation({
    onSuccess: (data) => {
      toast.success("Venda registrada!");
      setSuccessTicketCode(data.ticketCode);
    },
    onError: (err) => toast.error(err.message || "Não foi possível registrar a venda."),
  });

  const currentEvent = typeof mode === "number" ? openEvents.find((e: any) => e.id === mode) : null;
  const products: any[] = typeof mode === "number" ? (eventCatalog?.products ?? []) : (regularCatalog?.products ?? []);
  const categories: any[] = typeof mode === "number" ? (eventCatalog?.categories ?? []) : (regularCatalog?.categories ?? []);

  const cartTotal = cart.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);
  const hasEventItems = cart.some(i => i.eventId != null);
  const isTicketPurchase = cart.some(i => i.eventId != null && openEvents.find((e: any) => e.id === i.eventId)?.type === "ingresso");
  const regularNeedsDelivery = cart.some(i => i.eventId == null && i.requiresDelivery !== false);
  const eventMethodsUsed = deliveryMethods.filter(m => new Set(cart.filter(i => i.eventId != null).map(i => i.deliveryMethodId)).has(m.id));
  const selectedRegularMethod = deliveryMethods.find(m => m.id === deliveryMethodId);
  const requiresAddress = (regularNeedsDelivery && !!selectedRegularMethod?.requiresAddress) || eventMethodsUsed.some(m => m.requiresAddress);

  function methodsForProduct(product: any) {
    if (product.allowedDeliveryMethodIds && product.allowedDeliveryMethodIds.length > 0) {
      return deliveryMethods.filter(m => product.allowedDeliveryMethodIds.includes(m.id));
    }
    return deliveryMethods;
  }
  function needsDeliveryChoice(product: any) {
    return typeof mode === "number" && product.requiresDelivery !== false && methodsForProduct(product).length > 0;
  }

  function addToCart(product: any) {
    const key = `${mode}-${product.id}`;
    const qty = drafts[key] ?? 1;
    if (qty <= 0) return;
    if (needsDeliveryChoice(product) && !deliveryDrafts[product.id]) {
      toast.error("Escolha a forma de entrega desse item antes de adicionar.");
      return;
    }
    const metodo = deliveryMethods.find(m => m.id === deliveryDrafts[product.id]);
    setCart(prev => [...prev, {
      key: `${key}-${Date.now()}`,
      productId: product.id, name: product.name, unitPrice: Number(product.price),
      quantity: qty, flavorIds: [], flavorNames: [],
      eventId: typeof mode === "number" ? mode : undefined,
      eventName: currentEvent?.name,
      deliveryMethodId: typeof mode === "number" ? metodo?.id : undefined,
      deliveryMethodName: typeof mode === "number" ? metodo?.name : undefined,
      requiresDelivery: product.requiresDelivery,
    }]);
    setDrafts(prev => ({ ...prev, [key]: 1 }));
    toast.success(`${product.name} adicionado!`);
  }

  function removeFromCart(key: string) {
    setCart(prev => prev.filter(i => i.key !== key));
  }

  function validate() {
    if (cart.length === 0) { toast.error("Adicione pelo menos um item."); return false; }
    if (!name.trim()) { toast.error("Informe o nome do cliente."); return false; }
    if (phone.replace(/\D/g, "").length < 10) { toast.error("Informe um telefone válido."); return false; }
    if (isTicketPurchase && !email.trim()) { toast.error("E-mail é obrigatório pra vender ingresso."); return false; }
    if (regularNeedsDelivery && !deliveryMethodId) { toast.error("Escolha a forma de entrega dos itens da Venda Regular."); return false; }
    if (requiresAddress && !address.trim()) { toast.error("Informe o endereço de entrega."); return false; }
    if (!paymentMethod) { toast.error("Escolha a forma de pagamento."); return false; }
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await createOrder.mutateAsync({
        customerName: name, customerPhone: phone, customerEmail: email || undefined,
        deliveryMethodId: deliveryMethodId ?? undefined,
        deliveryAddress: requiresAddress ? address : undefined,
        items: cart.map(i => ({
          productId: i.productId, quantity: i.quantity, flavorIds: i.flavorIds,
          eventId: i.eventId, deliveryMethodId: i.deliveryMethodId,
        })),
        paymentMethod: paymentMethod!,
        paymentStatus: "paid",
        notes: notes || undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForNewSale() {
    setCart([]); setName(""); setPhone(""); setEmail(""); setNotes("");
    setDeliveryMethodId(null); setAddress(""); setPaymentMethod(null); setSuccessTicketCode(null);
  }

  if (successTicketCode) {
    return (
      <div className="max-w-lg mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <div className="text-2xl">✅</div>
            <h2 className="text-lg font-semibold">Venda registrada com sucesso!</h2>
            <Button className="w-full gap-2" onClick={() => window.open(`/loja/r/${successTicketCode}`, "_blank")}>
              <ExternalLink className="w-4 h-4" /> Ver recibo pra enviar ao cliente
            </Button>
            <Button variant="outline" className="w-full" onClick={resetForNewSale}>Registrar nova venda</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4 space-y-4 pb-32">
      <h1 className="text-lg font-bold">Nova Venda</h1>

      {/* Seletor de contexto */}
      <div>
        <Label className="text-xs text-muted-foreground">O que vai vender agora?</Label>
        <Select value={String(mode)} onValueChange={v => setMode(v === "regular" ? "regular" : Number(v))}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="regular">🛒 Venda Regular</SelectItem>
            {openEvents.map((ev: any) => (
              <SelectItem key={ev.id} value={String(ev.id)}>🎪 {ev.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Catálogo */}
      <div className="space-y-3">
        {categories.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto disponível aqui.</p>}
        {categories.map((cat: any) => {
          const catProducts = products.filter((p: any) => p.categoryId === cat.id);
          if (catProducts.length === 0) return null;
          return (
            <div key={cat.id}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{cat.name}</p>
              <div className="space-y-2">
                {catProducts.map((product: any) => {
                  const key = `${mode}-${product.id}`;
                  return (
                    <Card key={product.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{fmt(Number(product.price))}</p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {product.isPreOrder ? "Sob encomenda" : `${product.availableQuantity} ${product.unit}`}
                          </Badge>
                        </div>
                        {needsDeliveryChoice(product) && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {methodsForProduct(product).map((m: any) => (
                              <button
                                key={m.id} type="button"
                                onClick={() => setDeliveryDrafts(prev => ({ ...prev, [product.id]: m.id }))}
                                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${deliveryDrafts[product.id] === m.id ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}
                              >
                                {m.name}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <div className="flex items-center gap-1.5">
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setDrafts(d => ({ ...d, [key]: Math.max(1, (d[key] ?? 1) - 1) }))}>
                              <Minus className="w-3 h-3" />
                            </Button>
                            <span className="w-6 text-center text-sm">{drafts[key] ?? 1}</span>
                            <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setDrafts(d => ({ ...d, [key]: (d[key] ?? 1) + 1 }))}>
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => addToCart(product)}>
                            <Plus className="w-3 h-3" /> Adicionar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Carrinho */}
      {cart.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <ShoppingCart className="w-3.5 h-3.5" /> Carrinho
            </p>
            {cart.map(item => (
              <div key={item.key} className="flex items-center justify-between text-sm gap-2">
                <div className="min-w-0">
                  <p className="truncate">{item.quantity}x {item.name}{item.eventName ? ` (${item.eventName})` : ""}</p>
                  {item.deliveryMethodName && <p className="text-[11px] text-primary">📦 {item.deliveryMethodName}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{fmt(item.unitPrice * item.quantity)}</span>
                  <button onClick={() => removeFromCart(item.key)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                </div>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2 border-t text-sm">
              <span>Total</span><span>{fmt(cartTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dados do cliente e finalização */}
      {cart.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label className="text-xs">{isTicketPurchase ? "E-mail *" : "E-mail (opcional)"}</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>

            {hasEventItems && (
              <div className="rounded-lg border p-2 bg-muted/30 text-xs">
                <p className="text-muted-foreground mb-1">🎪 Entrega dos itens de evento já escolhida por item.</p>
              </div>
            )}
            {regularNeedsDelivery && (
              <div>
                <Label className="text-xs">{hasEventItems ? "Entrega — itens da Venda Regular" : "Forma de entrega"}</Label>
                <RadioGroup value={deliveryMethodId ? String(deliveryMethodId) : ""} onValueChange={v => setDeliveryMethodId(Number(v))} className="mt-1">
                  {deliveryMethods.map(m => (
                    <div key={m.id} className="flex items-center space-x-2 border rounded-lg p-2">
                      <RadioGroupItem value={String(m.id)} id={`dm-${m.id}`} />
                      <Label htmlFor={`dm-${m.id}`} className="flex-1 cursor-pointer text-sm font-normal">{m.name}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
            {requiresAddress && (
              <div>
                <Label className="text-xs">Endereço de entrega</Label>
                <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro, referência" />
              </div>
            )}

            <div>
              <Label className="text-xs">Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {availablePaymentMethods.map((m: any) => {
                  const value = PAYMENT_CODE_MAP[m.code];
                  if (!value) return null;
                  return (
                    <Button
                      key={m.code} variant={paymentMethod === value ? "default" : "outline"}
                      className="h-9 text-xs font-semibold" onClick={() => setPaymentMethod(value)}
                    >
                      {m.name}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">Observação (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            <Button className="w-full gap-2" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Finalizar venda — {fmt(cartTotal)}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
