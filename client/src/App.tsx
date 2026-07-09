import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SellerProvider, useSeller } from "./contexts/SellerContext";
import { DelivererProvider, useDeliverer } from "./contexts/DelivererContext";
import AppLayout from "./components/AppLayout";
import AdminGuard from "./components/AdminGuard";
import SellerLayout from "./components/SellerLayout";
import DelivererLayout from "./components/DelivererLayout";

// ── SELLER PAGES ──
import SelectSeller from "./pages/seller/SelectSeller";
import SellerNewOrder from "./pages/seller/SellerNewOrder";
import MyOrders from "./pages/seller/MyOrders";
import SellerOrderDetail from "./pages/seller/SellerOrderDetail";

// ── DELIVERER PAGES ──
import SelectDeliverer from "./pages/deliverer/SelectDeliverer";
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
import OptimizedRouteGenerator from "./pages/OptimizedRouteGenerator";
import NotFound from "./pages/NotFound";

// ── SELLER AREA ──
function SellerArea() {
  const { seller } = useSeller();
  if (!seller) return <SelectSeller />;
  return (
    <SellerLayout>
      <Switch>
        <Route path="/vendedor/novo-pedido" component={SellerNewOrder} />
        <Route path="/vendedor/meus-pedidos" component={MyOrders} />
        <Route path="/vendedor/pedido/:id" component={SellerOrderDetail} />
        <Route path="/vendedor/pedido/:id/editar" component={SellerNewOrder} />
        <Route path="/">
          <Redirect to="/vendedor/novo-pedido" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </SellerLayout>
  );
}

// ── DELIVERER AREA ──
function DelivererArea() {
  const { deliverer } = useDeliverer();
  if (!deliverer) return <SelectDeliverer />;
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
        <DelivererProvider>
          <DelivererArea />
        </DelivererProvider>
      </Route>
      <Route path="/entregador">
        <DelivererProvider>
          <DelivererArea />
        </DelivererProvider>
      </Route>

      {/* ── ADMIN CONFIG (most specific first) ── */}
      <Route path="/admin/config/categorias">
        <AdminGuard><AppLayout><Categories /></AppLayout></AdminGuard>
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
        <AdminGuard><Exports /></AdminGuard>
      </Route>
      <Route path="/admin/dashboard">
        <AdminGuard><AppLayout><Dashboard /></AppLayout></AdminGuard>
      </Route>

      {/* ── ADMIN LOGIN (last — /admin is a prefix and would swallow everything above) ── */}
      <Route path="/admin">
        <AdminLogin />
      </Route>

      {/* ── SELLER ── */}
      <Route path="/vendedor/novo-pedido">
        <SellerProvider><SellerLayout><SellerNewOrder /></SellerLayout></SellerProvider>
      </Route>
      <Route path="/vendedor/meus-pedidos">
        <SellerProvider><SellerLayout><MyOrders /></SellerLayout></SellerProvider>
      </Route>
      <Route path="/vendedor/pedido/:id">
        <SellerProvider><SellerLayout><SellerOrderDetail /></SellerLayout></SellerProvider>
      </Route>
      <Route path="/vendedor/pedido/:id/editar">
        <SellerProvider><SellerLayout><SellerNewOrder /></SellerLayout></SellerProvider>
      </Route>
      <Route path="/">
        <SellerProvider><SellerArea /></SellerProvider>
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
