/** Rodapé de crédito — usado tanto no CRM quanto na Loja Pública. */
export default function HubJFooter() {
  return (
    <footer className="text-center py-3 text-xs text-muted-foreground space-x-1">
      <span>Desenvolvimento e gestão técnica:</span>
      <a
        href="https://www.hubj.com.br"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground transition-colors"
      >
        Hub-J Gestão e Inovação
      </a>
      <span>·</span>
      <a
        href="https://wa.me/5534998713101"
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground transition-colors"
      >
        WhatsApp
      </a>
    </footer>
  );
}
