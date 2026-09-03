import { trpc } from "@/lib/trpc";

/**
 * Botão flutuante de WhatsApp — aparece em todas as telas da Loja Pública,
 * só quando um número foi configurado (Loja Pública → Aparência, no CRM).
 */
export default function WhatsAppFloatButton() {
  const { data: landing } = trpc.publicStore.landing.useQuery(undefined, { staleTime: 60_000 });
  const number = landing?.whatsappNumber;
  if (!number) return null;

  const digits = number.replace(/\D/g, "");

  return (
    <a
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar no WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-transform hover:scale-105"
      style={{ background: "#25D366" }}
    >
      <svg viewBox="0 0 32 32" width="30" height="30" fill="#ffffff">
        <path d="M16.001 3C9.373 3 4 8.373 4 15c0 2.386.7 4.607 1.902 6.47L4 29l7.73-1.87A11.94 11.94 0 0 0 16.001 27C22.629 27 28 21.627 28 15S22.629 3 16.001 3Zm0 21.75a9.7 9.7 0 0 1-4.95-1.354l-.355-.21-4.59 1.11 1.13-4.474-.232-.366A9.71 9.71 0 0 1 5.25 15c0-5.93 4.822-10.75 10.751-10.75S26.75 9.07 26.75 15 21.93 24.75 16.001 24.75Zm5.34-7.32c-.293-.147-1.734-.856-2.003-.954-.269-.098-.464-.147-.66.147-.196.293-.756.954-.927 1.15-.171.196-.342.22-.635.073-.293-.147-1.236-.456-2.354-1.454-.87-.776-1.458-1.735-1.629-2.028-.171-.293-.018-.451.129-.598.132-.132.293-.342.44-.513.147-.171.196-.293.293-.489.098-.196.049-.366-.024-.513-.073-.147-.66-1.59-.904-2.177-.238-.572-.48-.494-.66-.503l-.562-.01c-.196 0-.513.073-.782.366-.269.293-1.026 1.003-1.026 2.445 0 1.442 1.05 2.836 1.196 3.032.147.196 2.067 3.157 5.008 4.428.7.302 1.246.483 1.672.618.702.223 1.341.192 1.846.117.563-.084 1.734-.709 1.978-1.394.245-.685.245-1.271.171-1.394-.073-.122-.269-.196-.562-.342Z" />
      </svg>
    </a>
  );
}
