import { trpc } from "@/lib/trpc";
import { Instagram, Globe, MessageCircle } from "lucide-react";

/** Ícones de Instagram/Site/WhatsApp do Integrarte — só aparecem quando configurados (CRM → Loja Pública → Aparência). */
export default function StoreSocialFooter() {
  const { data: landing } = trpc.publicStore.landing.useQuery(undefined, { staleTime: 60_000 });
  const { instagramUrl, websiteUrl, whatsappNumber } = landing ?? {};

  if (!instagramUrl && !websiteUrl && !whatsappNumber) return null;

  return (
    <div className="flex items-center justify-center gap-4 py-3">
      {instagramUrl && (
        <a href={instagramUrl} target="_blank" rel="noreferrer" aria-label="Instagram" className="text-muted-foreground hover:text-foreground transition-colors">
          <Instagram className="h-5 w-5" />
        </a>
      )}
      {websiteUrl && (
        <a href={websiteUrl} target="_blank" rel="noreferrer" aria-label="Site" className="text-muted-foreground hover:text-foreground transition-colors">
          <Globe className="h-5 w-5" />
        </a>
      )}
      {whatsappNumber && (
        <a href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="text-muted-foreground hover:text-foreground transition-colors">
          <MessageCircle className="h-5 w-5" />
        </a>
      )}
    </div>
  );
}
