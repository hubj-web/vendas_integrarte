import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import NewOrder from "./pages/NewOrder";
import DeliveryRoutes from "./pages/DeliveryRoutes";
import DeliveryPayments from "./pages/DeliveryPayments";
import Reports from "./pages/Reports";
import Products from "./pages/admin/Products";
import ProductTypes from "./pages/admin/ProductTypes";
import Minipizzas from "./pages/admin/Minipizzas";
import Jellies from "./pages/admin/Jellies";
import DeliveryMethods from "./pages/admin/DeliveryMethods";
import Users from "./pages/admin/Users";
import AppLayout from "./components/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute>
          <AppLayout>
            <Dashboard />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pedidos">
        <ProtectedRoute>
          <AppLayout>
            <Orders />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pedidos/novo">
        <ProtectedRoute roles={["admin", "launcher"]}>
          <AppLayout>
            <NewOrder />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/pedidos/:id">
        <ProtectedRoute>
          <AppLayout>
            <OrderDetail />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/rotas">
        <ProtectedRoute>
          <AppLayout>
            <DeliveryRoutes />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/entregas">
        <ProtectedRoute>
          <AppLayout>
            <DeliveryPayments />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/relatorios">
        <ProtectedRoute roles={["admin", "launcher"]}>
          <AppLayout>
            <Reports />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      {/* Admin routes */}
      <Route path="/admin/produtos">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <Products />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/tipos-produto">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <ProductTypes />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/minipizzas">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <Minipizzas />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/geleias">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <Jellies />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/formas-entrega">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <DeliveryMethods />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/usuarios">
        <ProtectedRoute roles={["admin"]}>
          <AppLayout>
            <Users />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/404" component={NotFound} />
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
