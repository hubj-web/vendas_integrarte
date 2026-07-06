import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";
import { authRouter } from "./routers/auth";
import { usersRouter } from "./routers/users";
import { catalogRouter } from "./routers/catalog";
import { ordersRouter } from "./routers/orders";
import { deliveryRouter } from "./routers/delivery";
import { reportsRouter } from "./routers/reports";
import { sellerRouter } from "./routers/seller";
import { deliveryPublicRouter } from "./routers/deliveryPublic";
import { exportsRouter } from "./routers/exports";
export const appRouter = router({
  system: systemRouter,
  auth: authRouter,
  users: usersRouter,
  catalog: catalogRouter,
  orders: ordersRouter,
  delivery: deliveryRouter,
  reports: reportsRouter,
  seller: sellerRouter,
  deliveryPublic: deliveryPublicRouter,
  exports: exportsRouter,
});

export type AppRouter = typeof appRouter;
