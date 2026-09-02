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

// Fontes disponíveis pra personalizar o título/mensagem da loja — todas do
// Google Fonts, carregadas sob demanda (só quando alguém escolhe uma).
export const FONT_OPTIONS = [
  { value: "", label: "Padrão do sistema" },
  { value: "Poppins", label: "Poppins" },
  { value: "Montserrat", label: "Montserrat" },
  { value: "Roboto", label: "Roboto" },
  { value: "Lato", label: "Lato" },
  { value: "Open Sans", label: "Open Sans" },
  { value: "Playfair Display", label: "Playfair Display (elegante)" },
  { value: "Merriweather", label: "Merriweather (serifada)" },
  { value: "Pacifico", label: "Pacifico (manuscrita)" },
] as const;

/** Injeta o <link> do Google Fonts pra todas as fontes da lista, uma vez só. */
export function loadStoreFonts() {
  if (document.getElementById("store-google-fonts")) return;
  const families = FONT_OPTIONS.filter(f => f.value).map(f => `family=${f.value.replace(/ /g, "+")}:wght@400;600;700`).join("&");
  const link = document.createElement("link");
  link.id = "store-google-fonts";
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
}
