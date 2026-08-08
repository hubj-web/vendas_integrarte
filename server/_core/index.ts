import "dotenv/config";
import dns from "dns";
// O ambiente de produção (Railway) não tem saída IPv6 funcional. Sem isso, o
// Node às vezes resolve hosts externos (ex: smtp.gmail.com) para o endereço
// IPv6 primeiro, e a conexão trava/falha com ENETUNREACH — isso já quebrou o
// envio de e-mail em produção. Forçando IPv4 primeiro na resolução de DNS,
// pra qualquer conexão de saída do servidor (não só e-mail).
dns.setDefaultResultOrder("ipv4first");
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { overduePaymentsHandler } from "../routers/notifications";
import { registerDbSetupRoute } from "../dbSetup";
import { testTelegramConnection } from "../telegram";
import { registerMercadoPagoWebhook } from "../mercadopagoWebhook";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Health check for Railway
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // One-time database setup route (safe to run multiple times)
  registerDbSetupRoute(app);
  // Scheduled notification handlers
  app.post("/api/scheduled/overdue-payments", overduePaymentsHandler);
  // Webhook do Mercado Pago — confirma pagamentos da Loja Pública
  registerMercadoPagoWebhook(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || "3000");

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on port ${port}`);
    // Test Telegram connection on startup
    testTelegramConnection();
  });
}

startServer().catch(console.error);
