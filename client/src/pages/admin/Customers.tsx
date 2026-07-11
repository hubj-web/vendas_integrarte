import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Contact, Phone, MapPin, Search, ChevronLeft, ChevronRight, Building2 } from "lucide-react";

type Customer = {
  id: number;
  name: string;
  phone: string;
  locationReference: string | null;
  customerReference: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  zipCode: string | null;
  isInternal: boolean;
};

type FormData = {
  name: string;
  phone: string;
  locationReference: string;
  customerReference: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  zipCode: string;
  isInternal: boolean;
};

const emptyForm: FormData = {
  name: "", phone: "", locationReference: "", customerReference: "", street: "",
  number: "", complement: "", neighborhood: "", city: "", zipCode: "", isInternal: false,
};

const PAGE_SIZE = 25;

export default function Customers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.orders.customers.list.useQuery({
    page, pageSize: PAGE_SIZE, query: search || undefined,
  });
  const customersList = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

  const createMutation = trpc.orders.customers.create.useMutation({
    onSuccess: () => { utils.orders.customers.list.invalidate(); toast.success("Cliente criado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.orders.customers.update.useMutation({
    onSuccess: () => { utils.orders.customers.list.invalidate(); toast.success("Cliente atualizado!"); setDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.orders.customers.delete.useMutation({
    onSuccess: () => { utils.orders.customers.list.invalidate(); toast.success("Cliente excluído!"); setDeleteDialogOpen(false); },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditingCustomer(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setForm({
      name: c.name,
      phone: c.phone,
      locationReference: c.locationReference ?? "",
      customerReference: c.customerReference ?? "",
      street: c.street ?? "",
      number: c.number ?? "",
      complement: c.complement ?? "",
      neighborhood: c.neighborhood ?? "",
      city: c.city ?? "",
      zipCode: c.zipCode ?? "",
      isInternal: c.isInternal ?? false,
    });
    setDialogOpen(true);
  }

  function openDelete(c: Customer) {
    setDeletingCustomer(c);
    setDeleteDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.phone.trim()) { toast.error("Telefone é obrigatório"); return; }

    const data = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      locationReference: form.locationReference || undefined,
      customerReference: form.customerReference || undefined,
      street: form.street || undefined,
      number: form.number || undefined,
      complement: form.complement || undefined,
      neighborhood: form.neighborhood || undefined,
      city: form.city || undefined,
      zipCode: form.zipCode || undefined,
      isInternal: form.isInternal,
    };

    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  }

  function addressLine(c: Customer) {
    const parts = [
      c.street && c.number ? `${c.street}, ${c.number}` : c.street,
      c.neighborhood,
      c.city,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" — ") : null;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Contact className="w-6 h-6 text-blue-600" />
            Clientes
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie os clientes cadastrados no sistema</p>
        </div>
        <Button onClick={openCreate} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
          <Plus className="w-4 h-4" /> Novo Cliente
        </Button>
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nome ou telefone..."
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
        </div>
      ) : customersList.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Contact className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">
            {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
          </p>
          <p className="text-sm mt-1">
            {search ? "Tente outro termo de busca" : "Cadastre clientes para agilizar o lançamento de pedidos"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {customersList.map((c) => (
              <div key={c.id} className={`flex flex-col p-4 rounded-xl border shadow-sm ${c.isInternal ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
                <div className="flex items-start justify-between mb-2">
                  <span className="font-bold text-gray-900 truncate flex items-center gap-1.5">
                    {c.name}
                    {c.isInternal && (
                      <Badge variant="outline" className="text-[10px] gap-1 border-amber-400 text-amber-700 bg-amber-100">
                        <Building2 className="w-3 h-3" /> Interno
                      </Badge>
                    )}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEdit(c)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => openDelete(c)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Phone className="w-3 h-3 text-gray-400" /> {c.phone}
                  </div>
                  {addressLine(c) && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                      <span className="truncate">{addressLine(c)}</span>
                    </div>
                  )}
                  {c.locationReference && (
                    <Badge variant="secondary" className="text-[10px] mt-1 w-fit">
                      Ref. ponto: {c.locationReference}
                    </Badge>
                  )}
                  {c.customerReference && (
                    <Badge variant="outline" className="text-[10px] mt-1 w-fit">
                      Origem: {c.customerReference}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-xs text-gray-500">
                Página {page} de {totalPages} — {total} cliente{total !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8"
                  disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8"
                  disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCustomer ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label htmlFor="cus-name">Nome *</Label>
                <Input
                  id="cus-name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Maria Silva"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cus-phone">Telefone *</Label>
                <Input
                  id="cus-phone"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="cus-customer-ref">Referência do Cliente</Label>
                <Input
                  id="cus-customer-ref"
                  value={form.customerReference}
                  onChange={e => setForm(f => ({ ...f, customerReference: e.target.value }))}
                  placeholder="Ex: Indicação da Maria, Instagram, Panfleto..."
                  className="mt-1"
                />
                <p className="text-xs text-gray-400 mt-1">De onde esse cliente veio</p>
              </div>
              <div className="col-span-2">
                <Label htmlFor="cus-street">Logradouro</Label>
                <Input
                  id="cus-street"
                  value={form.street}
                  onChange={e => setForm(f => ({ ...f, street: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-number">Número</Label>
                <Input
                  id="cus-number"
                  value={form.number}
                  onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-complement">Complemento</Label>
                <Input
                  id="cus-complement"
                  value={form.complement}
                  onChange={e => setForm(f => ({ ...f, complement: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-neighborhood">Bairro</Label>
                <Input
                  id="cus-neighborhood"
                  value={form.neighborhood}
                  onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-city">Cidade</Label>
                <Input
                  id="cus-city"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-zip">CEP</Label>
                <Input
                  id="cus-zip"
                  value={form.zipCode}
                  onChange={e => setForm(f => ({ ...f, zipCode: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cus-ref">Ponto de referência</Label>
                <Input
                  id="cus-ref"
                  value={form.locationReference}
                  onChange={e => setForm(f => ({ ...f, locationReference: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-muted/30">
              <div>
                <Label htmlFor="cus-internal" className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Cliente Interno
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Use para pedidos de estoque/reforço (ex: "Integrarte - Estoque"). Esses pedidos
                  continuam contando no Relatório de Produção, mas não entram como venda no
                  Dashboard nem nos Relatórios de Vendas.
                </p>
              </div>
              <Switch
                id="cus-internal"
                checked={form.isInternal}
                onCheckedChange={(checked) => setForm(f => ({ ...f, isInternal: checked }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white">
              {isPending ? "Salvando..." : editingCustomer ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{deletingCustomer?.name}</strong>? Esta ação não pode ser desfeita.
              Clientes com pedidos vinculados não podem ser excluídos, para preservar o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deletingCustomer && deleteMutation.mutate({ id: deletingCustomer.id })}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
