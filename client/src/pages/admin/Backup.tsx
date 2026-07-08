import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Database, Download, FileSpreadsheet, Loader2, Shield, Cloud } from "lucide-react";

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

export default function Backup() {
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [storageUrl, setStorageUrl] = useState<string | null>(null);
  const [storageSaving, setStorageSaving] = useState(false);

  const backupToStorageMutation = trpc.exports.databaseBackupToStorage.useMutation({
    onSuccess: (data) => {
      setStorageUrl(data.url);
      toast.success(data.message || "Backup salvo com sucesso!");
      setStorageSaving(false);
    },
    onError: (e) => { toast.error(e.message); setStorageSaving(false); },
  });

  const ordersExcelMutation = trpc.exports.ordersExcel.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("Planilha de pedidos baixada!");
      setLoadingOrders(false);
    },
    onError: (e) => { toast.error(e.message); setLoadingOrders(false); },
  });

  const customersExcelMutation = trpc.exports.customersExcel.useMutation({
    onSuccess: (data) => {
      downloadBase64File(data.base64, data.filename, data.mimeType);
      toast.success("Planilha de clientes baixada!");
      setLoadingCustomers(false);
    },
    onError: (e) => { toast.error(e.message); setLoadingCustomers(false); },
  });

  return (
    <div>
      <PageHeader
        title="Backup e Exportações"
        description="Faça backup completo do sistema ou exporte dados específicos"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Backup Completo */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Backup Completo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Exporta todas as tabelas do sistema em formato JSON. Inclui pedidos, clientes, produtos, categorias, rotas, entregas e configurações.
            </p>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
              <Shield className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <span className="text-xs text-primary">Senhas não são incluídas no backup</span>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={() => { setStorageSaving(true); backupToStorageMutation.mutate(); }}
                disabled={storageSaving}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white gap-2"
              >
                {storageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {storageSaving ? "Salvando..." : "Salvar Backup no Armazenamento"}
              </Button>
              {storageUrl && (
                <a href={storageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">
                  Abrir backup no navegador
                </a>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Exportar Pedidos */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-blue-400" />
              Exportar Pedidos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Exporta todos os pedidos em planilha Excel (.xlsx) com informações de cliente, vendedor, status e valores.
            </p>
            <Button
              onClick={() => { setLoadingOrders(true); ordersExcelMutation.mutate({}); }}
              disabled={loadingOrders}
              variant="outline"
              className="w-full gap-2"
            >
              {loadingOrders ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar Planilha de Pedidos
            </Button>
          </CardContent>
        </Card>

        {/* Exportar Clientes */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              Exportar Clientes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Exporta a lista completa de clientes em planilha Excel (.xlsx) com nome, telefone, endereço e data de cadastro.
            </p>
            <Button
              onClick={() => { setLoadingCustomers(true); customersExcelMutation.mutate(); }}
              disabled={loadingCustomers}
              variant="outline"
              className="w-full gap-2"
            >
              {loadingCustomers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Baixar Planilha de Clientes
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-muted/20 border border-border">
        <h3 className="text-sm font-medium mb-2">Dicas de Backup</h3>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>Faça backup regularmente (recomendado: semanalmente)</li>
          <li>Guarde os arquivos em local seguro (Google Drive, pendrive, etc.)</li>
          <li>O backup JSON pode ser usado para restaurar o sistema em caso de problemas</li>
          <li>As planilhas Excel servem como réplica dos dados para consulta offline</li>
        </ul>
      </div>
    </div>
  );
}
