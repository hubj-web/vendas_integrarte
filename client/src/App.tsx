import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { trpc } from "@/lib/trpc";
import AppLayout from "./components/AppLayout";
import AdminGuard from "./components/AdminGuard";
import SellerGuard from "./components/SellerGuard";
import SellerLayout from "./components/SellerLayout";
import DelivererLayout from "./components/DelivererLayout";

// ── SELLER PAGES ──
import SellerLogin from "./pages/seller/SellerLogin";
import SellerNewOrder from "./pages/seller/SellerNewOrder";
import MyOrders from "./pages/seller/MyOrders";
import SellerOrderDetail from "./pages/seller/SellerOrderDetail";
import Stock from "./pages/seller/Stock";

// ── DELIVERER PAGES ──
import DelivererLogin from "./pages/deliverer/DelivererLogin";
import DelivererRoutes from "./pages/deliverer/DelivererRoutes";

// ── ADMIN PAGES ──
import AdminLogin from "./pages/admin/AdminLogin";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import DeliveryRoutes from "./pages/DeliveryRoutes";
import DeliveryPayments from "./pages/DeliveryPayments";
import Reports from "./pages/Reports";
import Categories from "./pages/admin/Categories";
import Customers from "./pages/admin/Customers";
import Products from "./pages/admin/Products";
import Suppliers from "./pages/admin/Suppliers";
import ProductionReport from "./pages/admin/ProductionReport";
import ProductTypes from "./pages/admin/ProductTypes";
import Minipizzas from "./pages/admin/Minipizzas";
import Jellies from "./pages/admin/Jellies";
import DeliveryMethods from "./pages/admin/DeliveryMethods";
import Users from "./pages/admin/Users";
import Exports from "./pages/Exports";
import Backup from "./pages/admin/Backup";
import Packaging from "./pages/admin/Packaging";
import OptimizedRouteGenerator from "./pages/OptimizedRouteGenerator";
import NotFound from "./pages/NotFound";
import Home from "./pages/Home";
import GestaoIntegrarte from "./pages/GestaoIntegrarte";

// ── SELLER AREA ──
function SellerArea() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !hasLauncherRole(user)) return <SellerLogin />;

  return (
    <SellerLayout>
      <Switch>
        <Route path="/vendedor/novo-pedido" component={SellerNewOrder} />
        <Route path="/vendedor/meus-pedidos" component={MyOrders} />
        <Route path="/vendedor/estoque" component={Stock} />
        <Route path="/vendedor/pedido/:id" component={SellerOrderDetail} />
        <Route path="/vendedor/pedido/:id/editar" component={SellerNewOrder} />
        <Route path="/vendedor">
          <Redirect to="/vendedor/novo-pedido" />
        </Route>
        <Route path="/">
          <Redirect to="/vendedor/novo-pedido" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </SellerLayout>
  );
}

function hasDeliveryRole(user: { role?: string; roles?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "delivery" || user.role === "admin") return true;
  try {
    const parsed = JSON.parse(user.roles ?? "[]");
    return Array.isArray(parsed) && parsed.includes("delivery");
  } catch {
    return false;
  }
}

function hasLauncherRole(user: { role?: string; roles?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "launcher" || user.role === "admin") return true;
  try {
    const parsed = JSON.parse(user.roles ?? "[]");
    return Array.isArray(parsed) && parsed.includes("launcher");
  } catch {
    return false;
  }
}

// ── DELIVERER AREA ──
function DelivererArea() {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !hasDeliveryRole(user)) return <DelivererLogin />;

  return (
    <DelivererLayout>
      <Switch>
        <Route path="/entregador" component={DelivererRoutes} />
        <Route path="/entregador/rotas" component={DelivererRoutes} />
        <Route component={NotFound} />
      </Switch>
    </DelivererLayout>
  );
}

// ── ROUTER ──
// NOTE: All admin routes are declared directly here (flat, no nesting) because
// wouter's regexparam treats :rest* as a single-segment wildcard in strict mode,
// so /admin/:rest* does NOT match /admin/config/categorias (two extra segments).
// Keeping routes flat avoids this limitation entirely.
function Router() {
  return (
    <Switch>
      {/* ── DELIVERER ── */}
      <Route path="/entregador/:rest*">
        <DelivererArea />
      </Route>
      <Route path="/entregador">
        <DelivererArea />
      </Route>

      {/* ── ADMIN CONFIG (most specific first) ── */}
      <Route path="/admin/config/categorias">
        <AdminGuard><AppLayout><Categories /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/clientes">
        <AdminGuard><AppLayout><Customers /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/produtos">
        <AdminGuard><AppLayout><Products /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/fornecedores">
        <AdminGuard><AppLayout><Suppliers /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/tipos">
        <AdminGuard><AppLayout><ProductTypes /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/minipizzas">
        <AdminGuard><AppLayout><Minipizzas /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/geleias">
        <AdminGuard><AppLayout><Jellies /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/formas-entrega">
        <AdminGuard><AppLayout><DeliveryMethods /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/usuarios">
        <AdminGuard><AppLayout><Users /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/config/backup">
        <AdminGuard><AppLayout><Backup /></AppLayout></AdminGuard>
      </Route>

      {/* ── ADMIN PAGES ── */}
      <Route path="/admin/pedidos/novo">
        <AdminGuard><AppLayout><SellerNewOrder /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/pedidos/:id/editar">
        <AdminGuard><AppLayout><SellerNewOrder /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/pedidos/:id">
        <AdminGuard><AppLayout><OrderDetail /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/pedidos">
        <AdminGuard><AppLayout><Orders /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/rotas/otimizar">
        <AdminGuard><AppLayout><OptimizedRouteGenerator /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/rotas">
        <AdminGuard><AppLayout><DeliveryRoutes /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/empacotamento">
        <AdminGuard><AppLayout><Packaging /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/entregas-pagamentos">
        <AdminGuard><AppLayout><DeliveryPayments /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/relatorios">
        <AdminGuard><AppLayout><Reports /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/relatorio-producao">
        <AdminGuard><AppLayout><ProductionReport /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/exportar">
        <AdminGuard><AppLayout><Exports /></AppLayout></AdminGuard>
      </Route>
      <Route path="/admin/dashboard">
        <AdminGuard><AppLayout><Dashboard /></AppLayout></AdminGuard>
      </Route>

      {/* ── ADMIN LOGIN (last — /admin is a prefix and would swallow everything above) ── */}
      <Route path="/admin">
        <AdminLogin />
      </Route>

      {/* ── SELLER ── */}
      <Route path="/vendedor">
        <SellerArea />
      </Route>
      <Route path="/vendedor/novo-pedido">
        <SellerGuard><SellerLayout><SellerNewOrder /></SellerLayout></SellerGuard>
      </Route>
      <Route path="/vendedor/meus-pedidos">
        <SellerGuard><SellerLayout><MyOrders /></SellerLayout></SellerGuard>
      </Route>
      <Route path="/vendedor/estoque">
        <SellerGuard><SellerLayout><Stock /></SellerLayout></SellerGuard>
      </Route>
      <Route path="/vendedor/pedido/:id">
        <SellerGuard><SellerLayout><SellerOrderDetail /></SellerLayout></SellerGuard>
      </Route>
      <Route path="/vendedor/pedido/:id/editar">
        <SellerGuard><SellerLayout><SellerNewOrder /></SellerLayout></SellerGuard>
      </Route>
      <Route path="/">
        <Home />
      </Route>
      <Route path="/gestao">
        <GestaoIntegrarte />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
