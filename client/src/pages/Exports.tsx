import { useState } from "react";
import { FileSpreadsheet, FileText, Download, Filter, Users, ClipboardList, Cloud, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const today = new Date().toISOString().slice(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

export default function Exports() {
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [status, setStatus] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [search, setSearch] = useState("");

  const exportInput = {
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: status !== "all" ? status : undefined,
    paymentStatus: paymentStatus !== "all" ? paymentStatus : undefined,
    search: search || undefined,
  };

  const ordersExcel = trpc.exports.ordersExcel.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("Planilha de pedidos exportada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao exportar: " + err.message),
  });

  const ordersPdf = trpc.exports.ordersPdf.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("PDF de pedidos exportado com sucesso!");
    },
    onError: (err) => toast.error("Erro ao exportar: " + err.message),
  });

  const ordersExcelToStorage = trpc.exports.ordersExcelToStorage.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "Planilha salva no armazenamento!");
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  const customersExcel = trpc.exports.customersExcel.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("Planilha de clientes exportada com sucesso!");
    },
    onError: (err) => toast.error("Erro ao exportar: " + err.message),
  });

  const isLoadingOrders = ordersExcel.isPending || ordersPdf.isPending || ordersExcelToStorage.isPending;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Exportar Dados</h1>
        <p className="text-muted-foreground mt-1">
          Exporte pedidos e clientes em Excel (.xlsx) ou PDF. Os arquivos também podem ser salvos automaticamente no armazenamento do sistema.
        </p>
      </div>

      {/* Orders export card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <ClipboardList className="w-5 h-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <CardTitle>Exportar Pedidos</CardTitle>
              <CardDescription>
                Filtre por período, status e forma de pagamento antes de exportar. Os relatórios incluem os produtos de cada pedido.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom">Data inicial</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo">Data final</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status do pedido</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="production">Em produção</SelectItem>
                  <SelectItem value="in_route">Em rota</SelectItem>
                  <SelectItem value="delivered">Entregue</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status de pagamento</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="paid">Pago</SelectItem>
                  <SelectItem value="partial">Parcial</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="search">Buscar cliente (nome ou telefone)</Label>
              <Input
                id="search"
                placeholder="Digite o nome ou telefone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Active filters summary */}
          {(status !== "all" || paymentStatus !== "all" || search || dateFrom || dateTo) && (
            <div className="flex flex-wrap gap-2 items-center">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filtros ativos:</span>
              {dateFrom && <Badge variant="secondary">De: {new Date(dateFrom + "T12:00:00").toLocaleDateString("pt-BR")}</Badge>}
              {dateTo && <Badge variant="secondary">Até: {new Date(dateTo + "T12:00:00").toLocaleDateString("pt-BR")}</Badge>}
              {status !== "all" && <Badge variant="secondary">Status: {status}</Badge>}
              {paymentStatus !== "all" && <Badge variant="secondary">Pagamento: {paymentStatus}</Badge>}
              {search && <Badge variant="secondary">Busca: {search}</Badge>}
            </div>
          )}

          <Separator />

          {/* Export buttons */}
          <div className="flex flex-col gap-3">
            {/* Save to storage */}
            <Button
              className="gap-2 bg-blue-700 hover:bg-blue-800 text-white"
              onClick={() => ordersExcelToStorage.mutate(exportInput)}
              disabled={isLoadingOrders}
            >
              {ordersExcelToStorage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {ordersExcelToStorage.isPending ? "Salvando no armazenamento..." : "Salvar Planilha no Armazenamento"}
            </Button>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 gap-2 bg-green-700 hover:bg-green-800 text-white"
                onClick={() => ordersExcel.mutate(exportInput)}
                disabled={isLoadingOrders}
              >
                {ordersExcel.isPending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4" />
                )}
                {ordersExcel.isPending ? "Gerando Excel..." : "Exportar Excel (.xlsx)"}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                onClick={() => ordersPdf.mutate(exportInput)}
                disabled={isLoadingOrders}
              >
                {ordersPdf.isPending ? (
                  <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {ordersPdf.isPending ? "Gerando PDF..." : "Exportar PDF"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              <strong>Salvar no Armazenamento:</strong> gera o arquivo e o salva automaticamente no sistema, gerando um link público.
              <br />
              <strong>Excel/PDF:</strong> faz download direto para o seu dispositivo. Os relatórios incluem todos os produtos de cada pedido.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Customers export card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Users className="w-5 h-5 text-blue-700 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle>Exportar Clientes</CardTitle>
              <CardDescription>
                Exporte a lista completa de clientes cadastrados com endereços e telefones.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            className="gap-2 bg-blue-700 hover:bg-blue-800 text-white"
            onClick={() => customersExcel.mutate()}
            disabled={customersExcel.isPending}
          >
            {customersExcel.isPending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {customersExcel.isPending ? "Gerando..." : "Exportar Clientes (.xlsx)"}
          </Button>
          <p className="text-xs text-muted-foreground mt-3">
            Inclui: nome, telefone, endereço completo, bairro, cidade e data de cadastro.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
