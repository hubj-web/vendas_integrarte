import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { compressImageFile } from "@/lib/imageCompress";
import { Store, ExternalLink, Save, Plus, Pencil, Trash2, CalendarDays, Ticket, ShoppingBag } from "lucide-react";

const fmt = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", paid: "Pago", partial: "Parcial", cancelled: "Cancelado",
};

export default function LojaPublica() {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.storeAdmin.getSettings.useQuery();
  const { data: products = [] } = trpc.storeAdmin.listStockProducts.useQuery();
  const [orderFilterEventId, setOrderFilterEventId] = useState<string>("all");
  const { data: orders = [] } = trpc.storeAdmin.orders.useQuery({
    eventId: orderFilterEventId === "all" ? undefined : orderFilterEventId === "regular" ? "regular" : Number(orderFilterEventId),
  });
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const { data: orderDetail } = trpc.storeAdmin.orderDetail.useQuery({ orderId: detailOrderId ?? -1 }, { enabled: detailOrderId !== null });
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderEditForm, setOrderEditForm] = useState({
    customerName: "", customerPhone: "", deliveryAddress: "", deliveryMethodId: "",
    status: "", paymentStatus: "", notes: "",
  });
  const updateOrder = trpc.storeAdmin.updateOrder.useMutation({
    onSuccess: () => { utils.storeAdmin.orderDetail.invalidate(); utils.storeAdmin.orders.invalidate(); toast.success("Pedido atualizado!"); setEditingOrder(false); },
    onError: (err) => toast.error(err.message || "Não foi possível salvar."),
  });
  const deleteOrder = trpc.orders.bulkDelete.useMutation({
    onSuccess: () => { utils.storeAdmin.orders.invalidate(); toast.success("Pedido excluído."); setDetailOrderId(null); },
    onError: (err) => toast.error(err.message || "Não foi possível excluir."),
  });

  function startEditOrder() {
    if (!orderDetail) return;
    setOrderEditForm({
      customerName: orderDetail.customerName ?? "", customerPhone: orderDetail.customerPhone ?? "",
      deliveryAddress: orderDetail.deliveryAddress ?? "", deliveryMethodId: String(orderDetail.deliveryMethodId ?? ""),
      status: orderDetail.status, paymentStatus: orderDetail.paymentStatus, notes: orderDetail.notes ?? "",
    });
    setEditingOrder(true);
  }
  const { data: deliveryMethodsList = [] } = trpc.storeAdmin.listDeliveryMethods.useQuery();
  const { data: events = [] } = trpc.storeAdmin.events.list.useQuery();
  const { data: allCategories = [] } = trpc.catalog.categories.list.useQuery();
  const { data: regularCategories = [] } = trpc.storeAdmin.listRegularCategories.useQuery();
  const { data: paymentMethodsList = [] } = trpc.storeAdmin.paymentMethods.list.useQuery();

  const updateSettings = trpc.storeAdmin.updateSettings.useMutation({
    onSuccess: () => { utils.storeAdmin.getSettings.invalidate(); toast.success("Configuração salva!"); },
  });

  const [appearanceForm, setAppearanceForm] = useState({ storeTitle: "", welcomeMessage: "", primaryColor: "#1E4B9C" });
  const [appearanceLoaded, setAppearanceLoaded] = useState(false);
  useEffect(() => {
    if (settings && !appearanceLoaded) {
      setAppearanceForm({
        storeTitle: settings.storeTitle ?? "",
        welcomeMessage: settings.welcomeMessage ?? "",
        primaryColor: settings.primaryColor ?? "#1E4B9C",
      });
      setAppearanceLoaded(true);
    }
  }, [settings, appearanceLoaded]);
  const setVisibility = trpc.storeAdmin.setProductVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listStockProducts.invalidate(); },
  });
  const setDeliveryVisibility = trpc.storeAdmin.setDeliveryMethodVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listDeliveryMethods.invalidate(); },
  });
  const setRegularCategoryVisibility = trpc.storeAdmin.setRegularCategoryVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listRegularCategories.invalidate(); },
  });
  const setPaymentActive = trpc.storeAdmin.paymentMethods.setActive.useMutation({
    onSuccess: () => { utils.storeAdmin.paymentMethods.list.invalidate(); toast.success("Atualizado!"); },
  });
  const setPaymentRegularVisibility = trpc.storeAdmin.paymentMethods.setRegularVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.paymentMethods.list.invalidate(); },
  });
  const confirmPayment = trpc.storeAdmin.confirmPayment.useMutation({
    onSuccess: () => { utils.storeAdmin.orders.invalidate(); toast.success("Pagamento confirmado! Estoque atualizado."); },
    onError: (err) => toast.error(err.message || "Não foi possível confirmar."),
  });
  const createEvent = trpc.storeAdmin.events.create.useMutation({
    onSuccess: () => { utils.storeAdmin.events.list.invalidate(); toast.success("Evento criado!"); setEventDialogOpen(false); },
    onError: (err) => toast.error(err.message),
  });
  const updateEvent = trpc.storeAdmin.events.update.useMutation({
    onSuccess: () => { utils.storeAdmin.events.list.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const deleteEvent = trpc.storeAdmin.events.delete.useMutation({
    onSuccess: () => { utils.storeAdmin.events.list.invalidate(); toast.success("Evento excluído."); },
    onError: (err) => toast.error(err.message),
  });
  const setEventCategories = trpc.storeAdmin.events.setCategories.useMutation({
    onSuccess: () => { utils.storeAdmin.events.list.invalidate(); toast.success("Categorias atualizadas!"); },
    onError: (err) => toast.error(err.message),
  });
  const uploadEventImage = trpc.storeAdmin.events.uploadImage.useMutation({
    onSuccess: () => { utils.storeAdmin.events.list.invalidate(); toast.success("Imagem do evento atualizada!"); },
    onError: (err) => toast.error(err.message),
  });
  const eventFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingEventId, setUploadingEventId] = useState<number | null>(null);

  function handleEventImageFile(id: number, file: File) {
    compressImageFile(file)
      .then((base64) => uploadEventImage.mutate({ id, imageBase64: base64 }))
      .catch(() => toast.error("Não foi possível processar essa imagem."));
  }

  const [closedMessage, setClosedMessage] = useState(settings?.closedMessage ?? "");
  const [regularSaleStart, setRegularSaleStart] = useState("");
  const [regularSaleEnd, setRegularSaleEnd] = useState("");

  const [saleWindowEventId, setSaleWindowEventId] = useState<number | null>(null);
  const [saleWindowStart, setSaleWindowStart] = useState("");
  const [saleWindowEnd, setSaleWindowEnd] = useState("");

  function openSaleWindowDialog(ev: any) {
    setSaleWindowEventId(ev.id);
    setSaleWindowStart(ev.saleStartsAt ? new Date(ev.saleStartsAt).toISOString().slice(0, 16) : "");
    setSaleWindowEnd(ev.saleEndsAt ? new Date(ev.saleEndsAt).toISOString().slice(0, 16) : "");
  }

  const [paymentDialogEventId, setPaymentDialogEventId] = useState<number | null>(null);
  const { data: eventPaymentMethods = [] } = trpc.storeAdmin.paymentMethods.listForEvent.useQuery(
    { eventId: paymentDialogEventId ?? -1 }, { enabled: paymentDialogEventId !== null }
  );
  const setPaymentEventVisibility = trpc.storeAdmin.paymentMethods.setEventVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.paymentMethods.listForEvent.invalidate(); },
  });

  function openPaymentDialog(ev: any) {
    setPaymentDialogEventId(ev.id);
  }

  const [checkInDialogEvent, setCheckInDialogEvent] = useState<{ id: number; checkInCode: string | null } | null>(null);
  const regenerateCheckInCode = trpc.storeAdmin.events.regenerateCheckInCode.useMutation({
    onSuccess: (data) => {
      utils.storeAdmin.events.list.invalidate();
      setCheckInDialogEvent(prev => prev ? { ...prev, checkInCode: data.checkInCode } : prev);
      toast.success("Código gerado!");
    },
  });

  function openCheckInDialog(ev: any) {
    setCheckInDialogEvent({ id: ev.id, checkInCode: ev.checkInCode ?? null });
  }

  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});

  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventForm, setEventForm] = useState({ name: "", type: "produtos" as "ingresso" | "produtos", description: "", eventDate: "" });

  const [categoriesDialogEventId, setCategoriesDialogEventId] = useState<number | null>(null);
  const [categoriesDraft, setCategoriesDraft] = useState<number[]>([]);

  function openCategoriesDialog(event: (typeof events)[number]) {
    setCategoriesDialogEventId(event.id);
    setCategoriesDraft(event.categories.map((c: any) => c.id));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Loja Pública"
        description="Vitrine on-line sem login — venda exclusivamente do Estoque, com pagamento via Mercado Pago"
        actions={
          <a href="/loja" target="_blank" rel="noreferrer">
            <Button variant="outline" className="gap-2"><ExternalLink className="w-4 h-4" />Ver loja</Button>
          </a>
        }
      />

      <Card>
        <CardContent className="pt-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Store className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold">{settings?.isOpen ? "Loja aberta" : "Loja fechada"}</p>
              <p className="text-xs text-muted-foreground">Controla se o link público (/loja) aceita pedidos agora</p>
            </div>
          </div>
          <Switch
            checked={!!settings?.isOpen}
            onCheckedChange={(checked) => updateSettings.mutate({ isOpen: checked, closedMessage })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 space-y-2">
          <Label>Janela de venda automática (opcional)</Label>
          <p className="text-xs text-muted-foreground">
            Preenchendo, a loja abre e fecha sozinha nesse período. O interruptor acima continua funcionando —
            desligado, fecha mesmo dentro da janela (pra uma exceção pontual).
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input type="datetime-local" value={regularSaleStart || (settings?.saleStartsAt ? new Date(settings.saleStartsAt).toISOString().slice(0, 16) : "")} onChange={e => setRegularSaleStart(e.target.value)} />
            <Input type="datetime-local" value={regularSaleEnd || (settings?.saleEndsAt ? new Date(settings.saleEndsAt).toISOString().slice(0, 16) : "")} onChange={e => setRegularSaleEnd(e.target.value)} />
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => updateSettings.mutate({
              isOpen: !!settings?.isOpen, closedMessage,
              saleStartsAt: regularSaleStart || null, saleEndsAt: regularSaleEnd || null,
            })}
          >
            <Save className="w-3.5 h-3.5 mr-1.5" /> Salvar janela
          </Button>
        </CardContent>
      </Card>

      {!settings?.isOpen && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <Label>Mensagem exibida enquanto a loja está fechada (opcional)</Label>
            <div className="flex gap-2">
              <Input value={closedMessage} onChange={e => setClosedMessage(e.target.value)} placeholder="Ex: Voltamos dia 20/08!" />
              <Button variant="outline" size="icon" onClick={() => updateSettings.mutate({ isOpen: !!settings?.isOpen, closedMessage })}>
                <Save className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="eventos">
        <TabsList>
          <TabsTrigger value="eventos">Eventos</TabsTrigger>
          <TabsTrigger value="regular">Venda Regular</TabsTrigger>
          <TabsTrigger value="pagamento">Formas de Pagamento</TabsTrigger>
          <TabsTrigger value="aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="produtos">Produtos na Loja</TabsTrigger>
          <TabsTrigger value="entregas">Formas de Entrega</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="eventos" className="space-y-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              A <strong>Venda Regular</strong> (aberta/fechada acima) é sempre a loja de sempre. Aqui você cria eventos
              adicionais — um baile, uma festa — cada um com suas próprias categorias habilitadas.
              Quando mais de uma opção estiver aberta ao mesmo tempo, o cliente escolhe qual quer ver ao entrar na loja.
            </p>
            <Button className="gap-1.5 shrink-0" onClick={() => { setEventForm({ name: "", type: "produtos", description: "", eventDate: "" }); setEventDialogOpen(true); }}>
              <Plus className="w-4 h-4" /> Novo Evento
            </Button>
          </div>

          <div className="grid gap-3">
            {events.map((ev: any) => (
              <Card key={ev.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {ev.imageUrl ? (
                        <img src={ev.imageUrl} alt={ev.name} className="w-9 h-9 rounded-xl object-cover shrink-0 border" />
                      ) : (
                        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                          {ev.type === "ingresso" ? <Ticket className="w-4 h-4 text-primary" /> : <ShoppingBag className="w-4 h-4 text-primary" />}
                        </div>
                      )}
                      <div>
                        <p className="font-semibold">{ev.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ev.type === "ingresso" ? "Venda de ingresso" : "Venda de produtos no evento"}
                          {ev.eventDate && <> · <CalendarDays className="inline w-3 h-3 -mt-0.5" /> {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(ev.eventDate))}</>}
                        </p>
                      </div>
                    </div>
                    <Switch checked={ev.isOpen} onCheckedChange={(checked) => updateEvent.mutate({ id: ev.id, isOpen: checked })} />
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1">
                      {ev.categories.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Nenhuma categoria vinculada ainda</span>
                      ) : ev.categories.map((c: any) => (
                        <Badge key={c.id} variant="secondary">{c.name}</Badge>
                      ))}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm" variant="outline" disabled={uploadEventImage.isPending && uploadingEventId === ev.id}
                        onClick={() => { setUploadingEventId(ev.id); eventFileInputRef.current?.click(); }}
                      >
                        {ev.imageUrl ? "Trocar imagem" : "Adicionar imagem"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => openCategoriesDialog(ev)}>Categorias</Button>
                      <Button size="sm" variant="outline" onClick={() => openSaleWindowDialog(ev)}>Janela de venda</Button>
                      <Button size="sm" variant="outline" onClick={() => openPaymentDialog(ev)}>Pagamento</Button>
                      <Button size="sm" variant="outline" onClick={() => openCheckInDialog(ev)}>Check-in</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm(`Excluir o evento "${ev.name}"?`)) deleteEvent.mutate({ id: ev.id }); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Qualquer tamanho de imagem serve — é redimensionada automaticamente pra até 800×800px.
                  </p>
                </CardContent>
              </Card>
            ))}
            {events.length === 0 && (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Nenhum evento criado ainda.</CardContent></Card>
            )}
          </div>
          <input
            ref={eventFileInputRef} type="file" accept="image/*" className="hidden"
            onChange={e => { const file = e.target.files?.[0]; if (file && uploadingEventId != null) handleEventImageFile(uploadingEventId, file); e.target.value = ""; }}
          />
        </TabsContent>

        <TabsContent value="regular" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            Categorias comuns aparecem na Venda Regular automaticamente. Uma categoria que também
            está vinculada a algum evento (ex: "Ingressos" do Baile) fica <strong>escondida da Venda
            Regular por padrão</strong> — só liga aqui se quiser que apareça nas duas ao mesmo tempo.
          </p>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {regularCategories.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {c.linkedToEvent && <Badge variant="outline" className="text-xs">também usada em evento</Badge>}
                  </div>
                  <Switch
                    checked={c.visibleInRegular}
                    onCheckedChange={(checked) => setRegularCategoryVisibility.mutate({ categoryId: c.id, visible: checked })}
                  />
                </div>
              ))}
              {regularCategories.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma categoria cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagamento" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            Controla onde cada forma de pagamento aparece. O interruptor "Ativa" desliga em todo o sistema de uma vez;
            "Na Venda Regular" controla só essa loja específica. Pra controlar por Evento, use o botão "Pagamento" no card do evento, na aba Eventos.
          </p>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {paymentMethodsList.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">{m.name}</p>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {(m.code === "pix_loja" || m.code === "cartao_loja") && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Na Venda Regular</Label>
                        <Switch
                          checked={m.visibleInRegular}
                          disabled={!m.active}
                          onCheckedChange={(checked) => setPaymentRegularVisibility.mutate({ paymentMethodId: m.id, visible: checked })}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Ativa</Label>
                      <Switch
                        checked={m.active}
                        onCheckedChange={(checked) => setPaymentActive.mutate({ id: m.id, active: checked })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {paymentMethodsList.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma forma de pagamento cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aparencia" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            Título, mensagem de boas-vindas e cor principal mostrados na tela inicial da loja (não afeta eventos, que têm sua própria imagem/descrição).
          </p>
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label>Título da loja</Label>
                <Input
                  value={appearanceForm.storeTitle}
                  onChange={e => setAppearanceForm(f => ({ ...f, storeTitle: e.target.value }))}
                  placeholder="LOJA INTEGRARTE"
                />
              </div>
              <div>
                <Label>Mensagem de boas-vindas</Label>
                <Textarea
                  rows={4}
                  value={appearanceForm.welcomeMessage}
                  onChange={e => setAppearanceForm(f => ({ ...f, welcomeMessage: e.target.value }))}
                  placeholder="Olá... que bom ter você aqui..."
                />
              </div>
              <div>
                <Label>Cor principal (cabeçalho)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={appearanceForm.primaryColor}
                    onChange={e => setAppearanceForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="h-10 w-14 rounded border cursor-pointer"
                  />
                  <Input
                    value={appearanceForm.primaryColor}
                    onChange={e => setAppearanceForm(f => ({ ...f, primaryColor: e.target.value }))}
                    className="max-w-[140px]"
                  />
                </div>
              </div>
              <Button
                onClick={() => updateSettings.mutate({
                  storeTitle: appearanceForm.storeTitle || null,
                  welcomeMessage: appearanceForm.welcomeMessage || null,
                  primaryColor: appearanceForm.primaryColor || null,
                })}
                disabled={updateSettings.isPending}
              >
                Salvar aparência
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="produtos" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            Só produtos com estoque disponível aparecem aqui. Ative os que quer vender na loja — opcionalmente com um preço diferente do praticado no período de vendas.
          </p>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Estoque</TableHead>
                    <TableHead>Preço padrão</TableHead>
                    <TableHead>Preço na loja</TableHead>
                    <TableHead className="text-right">Visível</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.categoryName ?? "—"}</TableCell>
                      <TableCell>{p.stockQuantity} {p.unit}</TableCell>
                      <TableCell>{fmt(p.price)}</TableCell>
                      <TableCell>
                        <Input
                          className="h-8 w-28"
                          placeholder={fmt(p.price)}
                          value={priceDrafts[p.id] ?? (p.storePrice ?? "")}
                          onChange={e => setPriceDrafts(prev => ({ ...prev, [p.id]: e.target.value }))}
                          onBlur={() => {
                            const val = priceDrafts[p.id];
                            if (val === undefined) return;
                            setVisibility.mutate({ productId: p.id, visible: p.visible, storePrice: val === "" ? null : val });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={p.visible}
                          onCheckedChange={(checked) => setVisibility.mutate({ productId: p.id, visible: checked, storePrice: p.storePrice })}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {products.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum produto com estoque disponível no momento.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entregas" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">
            As formas de entrega são cadastradas em <strong>Configurações → Formas de Entrega</strong>.
            Aqui você só liga/desliga quais delas aparecem pro cliente na Loja Pública — útil pra
            esconder uma opção que não estiver configurada no momento, sem precisar desativá-la no cadastro geral.
          </p>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {deliveryMethodsList.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{m.name}</p>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </div>
                  <Switch
                    checked={m.visibleInStore}
                    onCheckedChange={(checked) => setDeliveryVisibility.mutate({ deliveryMethodId: m.id, visible: checked })}
                  />
                </div>
              ))}
              {deliveryMethodsList.length === 0 && (
                <p className="text-center text-muted-foreground py-8">Nenhuma forma de entrega ativa cadastrada.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pedidos" className="space-y-3 pt-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm shrink-0">Filtrar por:</Label>
            <Select value={orderFilterEventId} onValueChange={setOrderFilterEventId}>
              <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pedidos</SelectItem>
                <SelectItem value="regular">Só Venda Regular</SelectItem>
                {events.map((ev: any) => (
                  <SelectItem key={ev.id} value={String(ev.id)}>{ev.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status Pgto</TableHead>
                    <TableHead>Status Pedido</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o: any) => (
                    <TableRow key={o.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailOrderId(o.id)}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>
                        <p className="font-medium">{o.customerName}</p>
                        <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                      </TableCell>
                      <TableCell className="text-xs">{o.eventName ?? "Venda Regular"}</TableCell>
                      <TableCell>{o.deliveryMethodName}</TableCell>
                      <TableCell>{o.paymentMethod === "pix" ? "PIX" : o.paymentMethod === "credit_card" ? "Cartão" : o.paymentMethod === "cash" ? "Dinheiro" : o.paymentMethod}</TableCell>
                      <TableCell>
                        <Badge variant={o.paymentStatus === "paid" ? "default" : "secondary"}>
                          {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{o.status}</TableCell>
                      <TableCell className="text-right">{fmt(o.totalAmount)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        {o.paymentStatus !== "paid" && o.paymentMethod === "pix" && (
                          <Button size="sm" variant="outline" disabled={confirmPayment.isPending} onClick={() => confirmPayment.mutate({ orderId: o.id })}>
                            Confirmar Pagamento
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Nenhum pedido nesse filtro.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detalhe do pedido */}
      <Dialog open={detailOrderId !== null} onOpenChange={(open) => { if (!open) { setDetailOrderId(null); setEditingOrder(false); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Pedido #{detailOrderId}</DialogTitle></DialogHeader>
          {orderDetail ? editingOrder ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Input value={orderEditForm.customerName} onChange={e => setOrderEditForm(f => ({ ...f, customerName: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Telefone</Label>
                  <Input value={orderEditForm.customerPhone} onChange={e => setOrderEditForm(f => ({ ...f, customerPhone: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Forma de entrega</Label>
                <Select value={orderEditForm.deliveryMethodId} onValueChange={v => setOrderEditForm(f => ({ ...f, deliveryMethodId: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {deliveryMethodsList.map((m: any) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Endereço</Label>
                <Textarea rows={2} value={orderEditForm.deliveryAddress} onChange={e => setOrderEditForm(f => ({ ...f, deliveryAddress: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={orderEditForm.status} onValueChange={v => setOrderEditForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="production">Em preparação</SelectItem>
                      <SelectItem value="packaged">Pronto</SelectItem>
                      <SelectItem value="in_route">Saiu para entrega</SelectItem>
                      <SelectItem value="delivered">Entregue</SelectItem>
                      <SelectItem value="paid">Concluído</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Pagamento</Label>
                  <Select value={orderEditForm.paymentStatus} onValueChange={v => setOrderEditForm(f => ({ ...f, paymentStatus: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Observações</Label>
                <Textarea rows={2} value={orderEditForm.notes} onChange={e => setOrderEditForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingOrder(false)}>Cancelar</Button>
                <Button
                  className="flex-1"
                  disabled={updateOrder.isPending}
                  onClick={() => updateOrder.mutate({
                    orderId: detailOrderId!,
                    customerName: orderEditForm.customerName, customerPhone: orderEditForm.customerPhone,
                    deliveryAddress: orderEditForm.deliveryAddress || null,
                    deliveryMethodId: orderEditForm.deliveryMethodId ? Number(orderEditForm.deliveryMethodId) : undefined,
                    status: orderEditForm.status as any, paymentStatus: orderEditForm.paymentStatus as any,
                    notes: orderEditForm.notes || null,
                  })}
                >
                  Salvar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Cliente</span><p className="font-medium">{orderDetail.customerName}</p></div>
                <div><span className="text-muted-foreground">Telefone</span><p className="font-medium">{orderDetail.customerPhone}</p></div>
                <div><span className="text-muted-foreground">Origem</span><p className="font-medium">{orderDetail.eventName ?? "Venda Regular"}</p></div>
                <div><span className="text-muted-foreground">Entrega</span><p className="font-medium">{orderDetail.deliveryMethodName}</p></div>
                <div><span className="text-muted-foreground">Pagamento</span><p className="font-medium">{orderDetail.paymentMethod}</p></div>
                <div><span className="text-muted-foreground">Status</span><p className="font-medium">{orderDetail.status} / {PAYMENT_STATUS_LABEL[orderDetail.paymentStatus] ?? orderDetail.paymentStatus}</p></div>
              </div>
              {orderDetail.deliveryAddress && (
                <div><span className="text-muted-foreground">Endereço</span><p className="font-medium">{orderDetail.deliveryAddress}</p></div>
              )}
              <div className="border-t pt-3 space-y-2">
                <p className="font-medium">Itens</p>
                {orderDetail.items.map((item: any) => (
                  <div key={item.id} className="flex justify-between">
                    <div>
                      <p>{item.quantity}x {item.productName}</p>
                      {(item.flavors?.length > 0 || item.selections?.length > 0) && (
                        <p className="text-xs text-muted-foreground">{[...item.flavors, ...item.selections].join(", ")}</p>
                      )}
                    </div>
                    <span>{fmt(item.subtotal)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>Total</span><span>{fmt(orderDetail.totalAmount)}</span>
                </div>
              </div>
              {orderDetail.notes && (
                <div><span className="text-muted-foreground">Observações</span><p>{orderDetail.notes}</p></div>
              )}
              {orderDetail.ticketCode && (
                <a href={`/loja/r/${orderDetail.ticketCode}`} target="_blank" rel="noreferrer" className="text-primary underline text-xs">
                  Ver recibo/ingresso do cliente →
                </a>
              )}
              <div className="flex gap-2 pt-2 border-t">
                <Button variant="outline" className="flex-1 gap-1.5" onClick={startEditOrder}>
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
                <Button
                  variant="outline" className="flex-1 gap-1.5 text-destructive hover:text-destructive"
                  disabled={deleteOrder.isPending}
                  onClick={() => { if (confirm(`Excluir o pedido #${detailOrderId} definitivamente? Essa ação não pode ser desfeita.`)) deleteOrder.mutate({ ids: [detailOrderId!] }); }}
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm py-4">Carregando…</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Evento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={eventForm.name} onChange={e => setEventForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Baile de Massas 2026" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={eventForm.type} onValueChange={(v) => setEventForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingresso">Venda de ingresso (acesso ao evento)</SelectItem>
                  <SelectItem value="produtos">Venda de produtos no/para o evento</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data do evento (opcional)</Label>
              <Input type="datetime-local" value={eventForm.eventDate} onChange={e => setEventForm(f => ({ ...f, eventDate: e.target.value }))} />
            </div>
            <div>
              <Label>Mensagem de boas-vindas (opcional)</Label>
              <Textarea value={eventForm.description} onChange={e => setEventForm(f => ({ ...f, description: e.target.value }))} placeholder="Mostrada pro cliente ao entrar nesse evento" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEventDialogOpen(false)}>Cancelar</Button>
            <Button
              disabled={createEvent.isPending}
              onClick={() => {
                if (!eventForm.name.trim()) return toast.error("Dê um nome ao evento.");
                createEvent.mutate({
                  name: eventForm.name, type: eventForm.type,
                  description: eventForm.description || undefined,
                  eventDate: eventForm.eventDate || undefined,
                });
              }}
            >
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoriesDialogEventId !== null} onOpenChange={(open) => !open && setCategoriesDialogEventId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Categorias do Evento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Marque quais categorias aparecem dentro desse evento. A mesma categoria pode estar em vários eventos.</p>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {allCategories.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 py-1">
                <Checkbox
                  checked={categoriesDraft.includes(c.id)}
                  onCheckedChange={(checked) => {
                    setCategoriesDraft(prev => checked ? [...prev, c.id] : prev.filter(id => id !== c.id));
                  }}
                />
                <span className="text-sm">{c.name}</span>
              </div>
            ))}
            {allCategories.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoriesDialogEventId(null)}>Cancelar</Button>
            <Button
              disabled={setEventCategories.isPending}
              onClick={() => {
                if (categoriesDialogEventId == null) return;
                setEventCategories.mutate({ eventId: categoriesDialogEventId, categoryIds: categoriesDraft });
                setCategoriesDialogEventId(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saleWindowEventId !== null} onOpenChange={(open) => !open && setSaleWindowEventId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Janela de Venda Automática</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Preenchendo, esse evento abre e fecha sozinho nesse período. O interruptor do card continua funcionando —
            desligado, fecha mesmo dentro da janela (pra uma exceção pontual).
          </p>
          <div className="space-y-3">
            <div>
              <Label>Início da venda</Label>
              <Input type="datetime-local" value={saleWindowStart} onChange={e => setSaleWindowStart(e.target.value)} />
            </div>
            <div>
              <Label>Fim da venda</Label>
              <Input type="datetime-local" value={saleWindowEnd} onChange={e => setSaleWindowEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleWindowEventId(null)}>Cancelar</Button>
            <Button
              disabled={updateEvent.isPending}
              onClick={() => {
                if (saleWindowEventId == null) return;
                updateEvent.mutate({ id: saleWindowEventId, saleStartsAt: saleWindowStart || null, saleEndsAt: saleWindowEnd || null });
                setSaleWindowEventId(null);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogEventId !== null} onOpenChange={(open) => !open && setPaymentDialogEventId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Formas de Pagamento do Evento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Liga/desliga formas de pagamento só pra esse evento. Uma forma desativada em "Formas de Pagamento" (globalmente) não aparece aqui de jeito nenhum.
          </p>
          <div className="space-y-1">
            {eventPaymentMethods.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="font-medium text-sm">{m.name}</p>
                  {!m.active && <p className="text-xs text-destructive">Desativada globalmente</p>}
                </div>
                <Switch
                  checked={m.visibleInEvent}
                  disabled={!m.active}
                  onCheckedChange={(checked) => paymentDialogEventId != null && setPaymentEventVisibility.mutate({ eventId: paymentDialogEventId, paymentMethodId: m.id, visible: checked })}
                />
              </div>
            ))}
            {eventPaymentMethods.length === 0 && (
              <p className="text-center text-muted-foreground py-4 text-sm">Nenhuma forma de pagamento de loja cadastrada.</p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPaymentDialogEventId(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={checkInDialogEvent !== null} onOpenChange={(open) => !open && setCheckInDialogEvent(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Check-in do Evento</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Compartilhe esse link e o código com quem vai ler os ingressos/comprovantes na entrada
            (não precisam de login no sistema).
          </p>
          {checkInDialogEvent?.checkInCode ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Código de acesso</Label>
                <p className="text-3xl font-bold tracking-widest text-center py-2" style={{ letterSpacing: "0.3em" }}>
                  {checkInDialogEvent.checkInCode}
                </p>
              </div>
              <div>
                <Label className="text-xs">Link</Label>
                <div className="flex gap-2">
                  <Input readOnly value={`${window.location.origin}/checkin/${checkInDialogEvent.id}`} />
                  <Button
                    variant="outline"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/checkin/${checkInDialogEvent.id}`); toast.success("Link copiado!"); }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
              <Button
                variant="ghost" size="sm" className="text-muted-foreground"
                onClick={() => { if (confirm("Gerar um código novo invalida o antigo — quem já tinha o código antigo perde o acesso. Continuar?")) regenerateCheckInCode.mutate({ id: checkInDialogEvent.id }); }}
              >
                Gerar novo código (invalida o atual)
              </Button>
            </div>
          ) : (
            <Button onClick={() => checkInDialogEvent && regenerateCheckInCode.mutate({ id: checkInDialogEvent.id })} disabled={regenerateCheckInCode.isPending}>
              Gerar código de check-in
            </Button>
          )}
          <DialogFooter>
            <Button onClick={() => setCheckInDialogEvent(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
