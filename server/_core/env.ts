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
};
