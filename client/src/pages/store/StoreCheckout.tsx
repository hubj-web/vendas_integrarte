import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ArrowLeft, Loader2, QrCode, CreditCard, Copy, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BRAND, CREDIT_CARD_ENABLED } from "./brand";
import { cartItemVariationLabel } from "./Store";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

interface CartItem {
  key: string;
  productId: number;
  name: string;
  unitPrice: number;
  quantity: number;
  flavorIds: number[];
  flavorNames: string[];
  optionIds: number[];
  variationSelections: { groupName: string; optionName: string }[];
}

interface Props {
  cart: CartItem[];
  total: number;
  eventId?: number;
  onBack: () => void;
  onSuccess: () => void;
}

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

type Step = "dados" | "pagamento" | "pix_aguardando" | "concluido";

export default function StoreCheckout({ cart, total, eventId, onBack, onSuccess }: Props) {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("dados");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [deliveryMethodId, setDeliveryMethodId] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "credit_card">("pix");
  const [orderId, setOrderId] = useState<number | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [pixData, setPixData] = useState<{ qrCode?: string; qrCodeBase64?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: deliveryMethods = [] } = trpc.publicStore.deliveryMethods.useQuery();
  const { data: mpConfig } = trpc.publicStore.mpPublicKey.useQuery();
  const { data: allowedPayments } = trpc.publicStore.paymentMethods.useQuery({ eventId });
  const pixEnabled = allowedPayments?.pix ?? true;
  const cardEnabled = (allowedPayments?.creditCard ?? false) && CREDIT_CARD_ENABLED;

  useEffect(() => {
    if (!allowedPayments) return;
    if (paymentMethod === "pix" && !pixEnabled && cardEnabled) setPaymentMethod("credit_card");
    if (paymentMethod === "credit_card" && !cardEnabled && pixEnabled) setPaymentMethod("pix");
  }, [allowedPayments, pixEnabled, cardEnabled]);

  const selectedMethod = deliveryMethods.find(m => m.id === deliveryMethodId);
  const requiresAddress = !!selectedMethod?.requiresAddress;
  const deliveryCost = selectedMethod ? Number(selectedMethod.cost) : 0;
  const grandTotal = total + deliveryCost;

  const createOrder = trpc.publicStore.createOrder.useMutation();
  const { data: orderStatus } = trpc.publicStore.orderStatus.useQuery(
    { orderId: orderId! },
    { enabled: !!orderId && step === "pix_aguardando", refetchInterval: 4000 }
  );

  useEffect(() => {
    if (orderStatus?.paymentStatus === "paid") {
      onSuccess();
      navigate(`/loja/r/${orderStatus.ticketCode ?? orderId}`);
    }
  }, [orderStatus?.paymentStatus]);

  function validateDados() {
    if (!name.trim()) { toast.error("Informe seu nome."); return false; }
    if (phone.replace(/\D/g, "").length < 10) { toast.error("Informe um telefone válido."); return false; }
    if (!deliveryMethodId) { toast.error("Escolha como quer receber."); return false; }
    if (requiresAddress && !address.trim()) { toast.error("Informe o endereço de entrega."); return false; }
    return true;
  }

  async function submitPix() {
    try {
      const result = await createOrder.mutateAsync({
        customerName: name, customerPhone: phone, customerEmail: email || undefined,
        deliveryMethodId: deliveryMethodId!, deliveryAddress: requiresAddress ? address : undefined,
        eventId,
        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, flavorIds: i.flavorIds, optionIds: i.optionIds })),
        paymentMethod: "pix",
      });
      setOrderId(result.orderId);
      setTicketCode(result.ticketCode);
      if (result.paymentStatus === "approved") {
        onSuccess();
        navigate(`/loja/r/${result.ticketCode}`);
      } else {
        setPixData({ qrCode: result.qrCode, qrCodeBase64: result.qrCodeBase64 });
        setStep("pix_aguardando");
      }
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível criar o pedido.");
    }
  }

  function copyPix() {
    if (!pixData?.qrCode) return;
    navigator.clipboard.writeText(pixData.qrCode);
    setCopied(true);
    toast.success("Código PIX copiado!");
    setTimeout(() => setCopied(false), 2500);
  }


  return (
    <div className="min-h-screen bg-muted/20 pb-8">
      <header className="py-4 px-4 flex items-center gap-3 sticky top-0 z-10" style={{ background: BRAND.blue }}>
        <Button size="icon" variant="ghost" className="text-white hover:bg-white/10" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="font-semibold text-white">Finalizar pedido</h1>
      </header>

      <div className="max-w-md mx-auto p-4 space-y-4">
        <Card>
          <CardContent className="pt-4 space-y-2 text-sm">
            {cart.map(item => (
              <div key={item.key} className="flex justify-between">
                <span>{item.quantity}x {item.name}{cartItemVariationLabel(item)}</span>
                <span>{fmt(item.unitPrice * item.quantity)}</span>
              </div>
            ))}
            {deliveryCost > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Entrega ({selectedMethod?.name})</span>
                <span>{fmt(deliveryCost)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total</span>
              <span>{fmt(grandTotal)}</span>
            </div>
          </CardContent>
        </Card>

        {step === "dados" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Seus dados</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Nome completo</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" />
              </div>
              <div>
                <Label>Telefone (WhatsApp)</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
                <p className="text-xs text-muted-foreground mt-1">Usado como identificação — sem necessidade de senha.</p>
              </div>
              <div>
                <Label>E-mail (opcional)</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
                <p className="text-xs text-muted-foreground mt-1">Preenchendo, mandamos o comprovante por e-mail também.</p>
              </div>
              <div>
                <Label>Como você quer receber?</Label>
                <RadioGroup value={deliveryMethodId ? String(deliveryMethodId) : ""} onValueChange={v => setDeliveryMethodId(Number(v))} className="mt-1">
                  {deliveryMethods.map(m => (
                    <div key={m.id} className="flex items-center space-x-2 border rounded-lg p-3">
                      <RadioGroupItem value={String(m.id)} id={`dm-${m.id}`} />
                      <Label htmlFor={`dm-${m.id}`} className="flex-1 cursor-pointer flex items-center justify-between gap-2">
                        <span>
                          <span className="font-medium">{m.name}</span>
                          {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                        </span>
                        {Number(m.cost) > 0 && <span className="text-sm font-medium shrink-0">+{fmt(Number(m.cost))}</span>}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
              {requiresAddress && (
                <div>
                  <Label>Endereço completo</Label>
                  <Textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, número, bairro, referência" />
                </div>
              )}
              <Button className="w-full text-white" style={{ background: BRAND.green }} onClick={() => validateDados() && setStep("pagamento")}>
                Continuar para pagamento
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "pagamento" && (
          <Card>
            <CardHeader><CardTitle className="text-base">Forma de pagamento</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {pixEnabled && cardEnabled && (
                <RadioGroup value={paymentMethod} onValueChange={v => setPaymentMethod(v as any)}>
                  <div className="flex items-center space-x-2 border rounded-lg p-3">
                    <RadioGroupItem value="pix" id="pm-pix" />
                    <Label htmlFor="pm-pix" className="flex-1 cursor-pointer flex items-center gap-2">
                      <QrCode className="h-4 w-4" /> PIX (aprovação na hora)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-3">
                    <RadioGroupItem value="credit_card" id="pm-card" />
                    <Label htmlFor="pm-card" className="flex-1 cursor-pointer flex items-center gap-2">
                      <CreditCard className="h-4 w-4" /> Cartão de crédito
                    </Label>
                  </div>
                </RadioGroup>
              )}

              {pixEnabled && !cardEnabled && (
                <div className="flex items-center gap-2 border rounded-lg p-3 text-sm" style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
                  <QrCode className="h-4 w-4" /> Pagamento via PIX
                </div>
              )}

              {!pixEnabled && cardEnabled && (
                <div className="flex items-center gap-2 border rounded-lg p-3 text-sm" style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
                  <CreditCard className="h-4 w-4" /> Pagamento via Cartão de Crédito
                </div>
              )}

              {!pixEnabled && !cardEnabled && (
                <div className="flex items-center gap-2 border rounded-lg p-3 text-sm text-destructive border-destructive">
                  Nenhuma forma de pagamento disponível no momento. Tente novamente mais tarde.
                </div>
              )}

              {paymentMethod === "pix" && pixEnabled && (
                <Button className="w-full text-white" style={{ background: BRAND.green }} disabled={createOrder.isPending} onClick={submitPix}>
                  {createOrder.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Gerar QR Code PIX
                </Button>
              )}

              {cardEnabled && paymentMethod === "credit_card" && (
                <CardPaymentBrick
                  amount={grandTotal}
                  publicKey={mpConfig?.publicKey}
                  configured={!!mpConfig?.configured}
                  onSubmit={async (cardData) => {
                    try {
                      const result = await createOrder.mutateAsync({
                        customerName: name, customerPhone: phone, customerEmail: email || undefined,
                        deliveryMethodId: deliveryMethodId!, deliveryAddress: requiresAddress ? address : undefined,
                        eventId,
                        items: cart.map(i => ({ productId: i.productId, quantity: i.quantity, flavorIds: i.flavorIds, optionIds: i.optionIds })),
                        paymentMethod: "credit_card",
                        cardToken: cardData.token, installments: cardData.installments,
                        paymentMethodId: cardData.paymentMethodId, issuerId: cardData.issuerId,
                      });
                      setOrderId(result.orderId);
                      setTicketCode(result.ticketCode);
                      if (result.paymentStatus === "approved") {
                        onSuccess();
                        navigate(`/loja/r/${result.ticketCode}`);
                      } else {
                        toast.error("Pagamento não aprovado. Verifique os dados do cartão.");
                      }
                    } catch (err: any) {
                      toast.error(err?.message || "Não foi possível processar o pagamento.");
                    }
                  }}
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={step === "pix_aguardando" && !!pixData} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm [&>button]:hidden">
          <DialogHeader className="text-center items-center">
            <QrCode className="h-8 w-8 text-primary mb-1" />
            <DialogTitle>Escaneie para pagar</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center">
            {pixData?.qrCodeBase64 && (
              <img
                src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                alt="QR Code PIX"
                className="mx-auto w-56 h-56 border rounded-lg"
              />
            )}
            <p className="text-sm text-muted-foreground">
              Abra o app do seu banco, escaneie o QR code ou copie o código abaixo.
            </p>
            <Button variant="outline" className="w-full gap-2" onClick={copyPix}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar código PIX"}
            </Button>
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando pagamento…
            </div>
            <p className="text-xs text-muted-foreground">
              Assim que o pagamento cair, esta tela atualiza sozinha e mostra seu recibo. Costuma ser na hora.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Card Payment Brick do Mercado Pago — carrega o SDK JS oficial e monta o
 * formulário de cartão embutido na própria loja (nome, número, validade, CVV,
 * parcelas). O token gerado nunca passa pelos nossos dados — vai direto do
 * navegador do cliente pro Mercado Pago.
 */
function CardPaymentBrick({
  amount, publicKey, configured, onSubmit,
}: {
  amount: number;
  publicKey?: string;
  configured: boolean;
  onSubmit: (data: { token: string; installments: number; paymentMethodId: string; issuerId?: string }) => Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const brickRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!configured || !publicKey) return;
    let cancelled = false;
    console.log("[CardBrick] iniciando — publicKey configurada:", !!publicKey, "amount:", amount);

    // Se o brick não terminar de carregar em 10s, avisa (em vez de ficar girando pra sempre)
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        console.warn("[CardBrick] timeout — onReady não disparou em 10s");
        toast.error("O formulário de cartão está demorando demais. Tente recarregar a página.");
      }
    }, 10000);

    async function init() {
      if (!window.MercadoPago) {
        console.log("[CardBrick] carregando SDK do Mercado Pago...");
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://sdk.mercadopago.com/js/v2";
          script.onload = () => { console.log("[CardBrick] SDK carregado."); resolve(); };
          script.onerror = () => reject(new Error("Falha ao carregar o Mercado Pago."));
          document.head.appendChild(script);
        });
      }
      if (cancelled) return;
      console.log("[CardBrick] instanciando MercadoPago e criando o brick...");
      const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      const bricksBuilder = mp.bricks();
      brickRef.current = await bricksBuilder.create("cardPayment", "card-payment-brick-container", {
        initialization: { amount },
        callbacks: {
          onReady: () => { console.log("[CardBrick] onReady disparou."); clearTimeout(timeoutId); setReady(true); },
          onSubmit: async (data: any) => {
            // A API do Mercado Pago retorna { selectedPaymentMethod, formData } — mas em
            // algumas versões do SDK vem achatado direto. Aceita os dois formatos.
            const formData = data?.formData ?? data;
            console.log("[CardBrick] onSubmit disparou:", formData);
            await onSubmit({
              token: formData.token,
              installments: formData.installments,
              paymentMethodId: formData.payment_method_id,
              issuerId: formData.issuer_id,
            });
          },
          onError: (error: any) => {
            console.error("[CardBrick] onError:", error);
            clearTimeout(timeoutId);
            toast.error("Erro ao carregar o formulário de cartão.");
          },
        },
      });
      console.log("[CardBrick] create() resolveu.", brickRef.current);
    }

    init().catch(err => {
      console.error("[CardBrick] init() falhou:", err);
      toast.error("Não foi possível carregar o pagamento por cartão.");
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      brickRef.current?.unmount?.();
    };
  }, [configured, publicKey, amount]);

  if (!configured) {
    return <p className="text-sm text-muted-foreground">Pagamento por cartão ainda não configurado. Use PIX por enquanto.</p>;
  }

  return (
    <div>
      {!ready && (
        <div className="flex items-center justify-center py-8 text-muted-foreground text-sm gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando formulário de cartão…
        </div>
      )}
      <div id="card-payment-brick-container" ref={containerRef} />
    </div>
  );
}
