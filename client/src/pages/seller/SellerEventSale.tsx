import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Ticket, Plus, Minus, Copy, Check, Send } from "lucide-react";

const fmt = (v: string | number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

/** Traduz o código do cadastro (payment_methods) pro valor salvo no pedido. */
const PAYMENT_CODE_MAP: Record<string, "cash" | "pix" | "credit_card" | "debit_card"> = {
  dinheiro_vendedor: "cash", pix_vendedor: "pix", cartao_vendedor: "credit_card", debito_vendedor: "debit_card",
};

interface Item {
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  flavorIds: number[];
  flavorNames: string[];
  maxAvailable: number;
}

export default function SellerEventSale() {
  const [eventId, setEventId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "pix" | "credit_card" | "debit_card">("cash");
  const { data: availablePaymentMethods = [] } = trpc.seller.paymentMethods.useQuery();
  const [items, setItems] = useState<Item[]>([]);
  const [receipt, setReceipt] = useState<{ ticketCode: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: events = [] } = trpc.sellerEvents.listOpenEvents.useQuery();
  const { data: catalog } = trpc.sellerEvents.eventCatalog.useQuery(
    { eventId: Number(eventId) },
    { enabled: !!eventId }
  );

  const createOrder = trpc.sellerEvents.createTicketOrder.useMutation({
    onSuccess: (result) => {
      const url = `${window.location.origin}/loja/r/${result.ticketCode}`;
      setReceipt({ ticketCode: result.ticketCode, url });
      toast.success("Venda registrada!");
    },
    onError: (err) => toast.error(err.message || "Não foi possível registrar a venda."),
  });

  function addItem(product: any, flavor?: { id: number; name: string }) {
    setItems(prev => {
      const existing = prev.find(i => i.productId === product.id && i.flavorIds[0] === flavor?.id);
      if (existing) {
        if (existing.quantity >= existing.maxAvailable) {
          toast.error("Quantidade máxima em estoque atingida.");
          return prev;
        }
        return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, {
        productId: product.id, name: product.name, unitPrice: Number(product.price),
        quantity: 1, flavorIds: flavor ? [flavor.id] : [], flavorNames: flavor ? [flavor.name] : [],
        maxAvailable: product.availableQuantity,
      }];
    });
  }

  function updateQty(idx: number, delta: number) {
    setItems(prev => prev
      .map((i, n) => n === idx ? { ...i, quantity: Math.min(i.maxAvailable, Math.max(0, i.quantity + delta)) } : i)
      .filter(i => i.quantity > 0));
  }

  const total = items.reduce((acc, i) => acc + i.unitPrice * i.quantity, 0);

  function reset() {
    setItems([]); setName(""); setPhone(""); setReceipt(null);
  }

  function submit() {
    if (!eventId) return toast.error("Escolha o evento.");
    if (!name.trim()) return toast.error("Informe o nome do cliente.");
    if (phone.replace(/\D/g, "").length < 8) return toast.error("Informe o telefone do cliente.");
    if (items.length === 0) return toast.error("Adicione pelo menos um item.");
    createOrder.mutate({
      eventId: Number(eventId), customerName: name, customerPhone: phone,
      items: items.map(i => ({ productId: i.productId, quantity: i.quantity, flavorIds: i.flavorIds })),
      paymentMethod, paymentStatus: "paid",
    });
  }

  function copyLink() {
    if (!receipt) return;
    navigator.clipboard.writeText(receipt.url);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2500);
  }

  if (receipt) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <Ticket className="mx-auto h-10 w-10 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Venda registrada!</h2>
              <p className="text-sm text-muted-foreground">Envie o link abaixo pro cliente — é o comprovante dele, com QR code.</p>
            </div>
            <div className="bg-muted rounded-lg p-3 text-sm break-all">{receipt.url}</div>
            <div className="flex gap-2">
              <Button className="flex-1 gap-2" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copiar link
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Segue o comprovante da sua compra Integrarte: ${receipt.url}`)}`}
                target="_blank" rel="noreferrer" className="flex-1"
              >
                <Button variant="outline" className="w-full gap-2"><Send className="h-4 w-4" /> WhatsApp</Button>
              </a>
            </div>
            <Button variant="ghost" className="w-full" onClick={reset}>Lançar nova venda</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Venda de Evento</h1>
        <p className="text-sm text-muted-foreground">Lance a venda de ingresso ou produto de um evento — o pagamento é combinado direto com o cliente.</p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label>Evento</Label>
            <Select value={eventId} onValueChange={(v) => { setEventId(v); setItems([]); }}>
              <SelectTrigger><SelectValue placeholder="Escolha o evento" /></SelectTrigger>
              <SelectContent>
                {events.map((ev: any) => (
                  <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {events.length === 0 && <p className="text-xs text-muted-foreground mt-1">Nenhum evento aberto no momento — ative um em Loja Pública → Eventos.</p>}
          </div>
        </CardContent>
      </Card>

      {eventId && catalog && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label>Produtos</Label>
            {(catalog.products ?? []).map((p: any) => (
              <div key={p.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{p.name}</span>
                  <Badge variant="secondary">{p.availableQuantity} disp.</Badge>
                </div>
                {p.flavors?.length > 0 ? (
                  <div className="space-y-1">
                    {p.flavors.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{f.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{fmt(p.price)}</span>
                          <Button size="sm" variant="outline" onClick={() => addItem(p, f)}><Plus className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{fmt(p.price)}</span>
                    <Button size="sm" variant="outline" onClick={() => addItem(p)}><Plus className="h-3.5 w-3.5" /> Adicionar</Button>
                  </div>
                )}
              </div>
            ))}
            {(catalog.products ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto disponível nesse evento.</p>}
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label>Itens da venda</Label>
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-sm py-1">
                <span>{item.name}{item.flavorNames.length > 0 ? ` (${item.flavorNames.join(", ")})` : ""}</span>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(idx, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-5 text-center">{item.quantity}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(idx, 1)}><Plus className="h-3 w-3" /></Button>
                  <span className="w-16 text-right font-medium">{fmt(item.unitPrice * item.quantity)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2 border-t">
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div>
            <Label>Nome do cliente</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
          </div>
          <div>
            <Label>Forma de pagamento (combinado com o cliente)</Label>
            <RadioGroup value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)} className="flex flex-wrap gap-4 mt-1">
              {availablePaymentMethods.map(m => {
                const value = PAYMENT_CODE_MAP[m.code];
                if (!value) return null;
                return (
                  <div key={m.code} className="flex items-center space-x-2">
                    <RadioGroupItem value={value} id={`pm-${m.code}`} /><Label htmlFor={`pm-${m.code}`} className="font-normal">{m.name}</Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
          <Button className="w-full" disabled={createOrder.isPending} onClick={submit}>
            {createOrder.isPending ? "Registrando…" : `Registrar venda — ${fmt(total)}`}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
