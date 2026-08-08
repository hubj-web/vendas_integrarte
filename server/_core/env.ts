export const ENV = {
  appId: process.env.VITE_APP_ID || process.env.APP_ID || "integrarte-app",
  cookieSecret: process.env.JWT_SECRET || "integrarte-default-secret-2026",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Google Sheets integration
  googleSheetsClientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? "",
  googleSheetsPrivateKey: (process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
  googleSheetsSpreadsheetId: process.env.GOOGLE_SHEETS_SPREADSHEET_ID ?? "",
  // Google Maps API
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? "",
  googleCloudProjectId: process.env.GOOGLE_CLOUD_PROJECT_ID ?? "",
  // Envio de e-mail via Gmail (senha de app, não a senha normal da conta)
  gmailUser: process.env.GMAIL_USER ?? "",
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD ?? "",
  // URL pública do sistema, usada para montar links em e-mails (ex: redefinir senha)
  // e o webhook do Mercado Pago da Loja Pública.
  appUrl: process.env.APP_URL ?? "https://www.integrarte.app.br",
  // Mercado Pago — Loja Pública (PIX + cartão via Checkout Bricks)
  mercadoPagoAccessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
  mercadoPagoPublicKey: process.env.MERCADOPAGO_PUBLIC_KEY ?? "",
  mercadoPagoWebhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
};
