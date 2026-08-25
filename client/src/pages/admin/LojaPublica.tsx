import { useState, useRef } from "react";
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
  const { data: orders = [] } = trpc.storeAdmin.orders.useQuery({});
  const { data: deliveryMethodsList = [] } = trpc.storeAdmin.listDeliveryMethods.useQuery();
  const { data: events = [] } = trpc.storeAdmin.events.list.useQuery();
  const { data: allCategories = [] } = trpc.catalog.categories.list.useQuery();
  const { data: regularCategories = [] } = trpc.storeAdmin.listRegularCategories.useQuery();

  const updateSettings = trpc.storeAdmin.updateSettings.useMutation({
    onSuccess: () => { utils.storeAdmin.getSettings.invalidate(); toast.success("Configuração salva!"); },
  });
  const setVisibility = trpc.storeAdmin.setProductVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listStockProducts.invalidate(); },
  });
  const setDeliveryVisibility = trpc.storeAdmin.setDeliveryMethodVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listDeliveryMethods.invalidate(); },
  });
  const setRegularCategoryVisibility = trpc.storeAdmin.setRegularCategoryVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listRegularCategories.invalidate(); },
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
            Por padrão, <strong>toda categoria com produto visível aparece na Venda Regular</strong>.
            Desligue aqui as categorias que são só de evento (ex: "Ingressos"), pra elas não se
            misturarem com a loja de sempre.
          </p>
          <Card>
            <CardContent className="pt-4 space-y-1">
              {regularCategories.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="font-medium">{c.name}</span>
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
          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead>Pagamento</TableHead>
                    <TableHead>Status Pgto</TableHead>
                    <TableHead>Status Pedido</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(o => (
                    <TableRow key={o.id}>
                      <TableCell>{o.id}</TableCell>
                      <TableCell>
                        <p className="font-medium">{o.customerName}</p>
                        <p className="text-xs text-muted-foreground">{o.customerPhone}</p>
                      </TableCell>
                      <TableCell>{o.deliveryMethodName}</TableCell>
                      <TableCell>{o.paymentMethod === "pix" ? "PIX" : o.paymentMethod === "credit_card" ? "Cartão" : o.paymentMethod}</TableCell>
                      <TableCell>
                        <Badge variant={o.paymentStatus === "paid" ? "default" : "secondary"}>
                          {PAYMENT_STATUS_LABEL[o.paymentStatus] ?? o.paymentStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>{o.status}</TableCell>
                      <TableCell className="text-right">{fmt(o.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        {o.paymentStatus !== "paid" && o.paymentMethod === "pix" && (
                          <Button size="sm" variant="outline" disabled={confirmPayment.isPending} onClick={() => confirmPayment.mutate({ orderId: o.id })}>
                            Confirmar Pagamento
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum pedido da loja pública ainda.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent>
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
        <DialogContent>
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
    </div>
  );
}
