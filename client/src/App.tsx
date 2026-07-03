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
import ProductTypes from "./pages/admin/ProductTypes";
import Minipizzas from "./pages/admin/Minipizzas";
import Jellies from "./pages/admin/Jellies";
import DeliveryMethods from "./pages/admin/DeliveryMethods";
import Users from "./pages/admin/Users";
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

// ── ADMIN AREA ──
function AdminArea() {
  return (
    <Switch>
      {/* Login page — no guard */}
      <Route path="/admin">
        <AdminLogin />
      </Route>

      {/* Protected admin pages */}
      <Route path="/admin/dashboard">
        <AdminGuard>
          <AppLayout><Dashboard /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/pedidos/:id">
        <AdminGuard>
          <AppLayout><OrderDetail /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/pedidos">
        <AdminGuard>
          <AppLayout><Orders /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/rotas">
        <AdminGuard>
          <AppLayout><DeliveryRoutes /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/entregas-pagamentos">
        <AdminGuard>
          <AppLayout><DeliveryPayments /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/relatorios">
        <AdminGuard>
          <AppLayout><Reports /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/categorias">
        <AdminGuard>
          <AppLayout><Categories /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/produtos">
        <AdminGuard>
          <AppLayout><Products /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/tipos">
        <AdminGuard>
          <AppLayout><ProductTypes /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/minipizzas">
        <AdminGuard>
          <AppLayout><Minipizzas /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/geleias">
        <AdminGuard>
          <AppLayout><Jellies /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/formas-entrega">
        <AdminGuard>
          <AppLayout><DeliveryMethods /></AppLayout>
        </AdminGuard>
      </Route>
      <Route path="/admin/config/usuarios">
        <AdminGuard>
          <AppLayout><Users /></AppLayout>
        </AdminGuard>
      </Route>
    </Switch>
  );
}

function Router() {
  return (
    <Switch>
      {/* Deliverer area — /entregador/* */}
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

      {/* Admin area — /admin/* */}
      <Route path="/admin/:rest*">
        <AdminArea />
      </Route>
      <Route path="/admin">
        <AdminArea />
      </Route>

      {/* Seller area — / and /vendedor/* */}
      <Route path="/vendedor/:rest*">
        <SellerProvider>
          <SellerArea />
        </SellerProvider>
      </Route>
      <Route path="/">
        <SellerProvider>
          <SellerArea />
        </SellerProvider>
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
