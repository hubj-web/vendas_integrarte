// Paleta extraída da logo da Integrarte — usada em todas as telas da Loja Pública
// (landing, categoria, checkout, recibo) pra manter a identidade visual consistente.
export const BRAND = {
  green: "#4CAF63",
  blue: "#1E4B9C",
  yellow: "#F2C744",
  yellowLight: "#FDF4D8",
  white: "#FFFFFF",
} as const;

// Cartão de crédito está temporariamente desabilitado na loja (o Payment Brick
// do Mercado Pago ainda trava no carregamento) — só PIX até isso ser corrigido.
// Pra reativar: trocar pra true.
export const CREDIT_CARD_ENABLED = true;
