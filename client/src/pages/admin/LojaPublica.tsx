import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Store, ExternalLink, Save } from "lucide-react";

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

  const updateSettings = trpc.storeAdmin.updateSettings.useMutation({
    onSuccess: () => { utils.storeAdmin.getSettings.invalidate(); toast.success("Configuração salva!"); },
  });
  const setVisibility = trpc.storeAdmin.setProductVisibility.useMutation({
    onSuccess: () => { utils.storeAdmin.listStockProducts.invalidate(); },
  });

  const [closedMessage, setClosedMessage] = useState(settings?.closedMessage ?? "");
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});

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

      <Tabs defaultValue="produtos">
        <TabsList>
          <TabsTrigger value="produtos">Produtos na Loja</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos ({orders.length})</TabsTrigger>
        </TabsList>

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
                    </TableRow>
                  ))}
                  {orders.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum pedido da loja pública ainda.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
