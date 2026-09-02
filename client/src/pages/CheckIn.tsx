import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Camera, KeyRound } from "lucide-react";
import { BRAND } from "./store/brand";

declare global {
  interface Window { jsQR?: any; }
}

function loadJsQR(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.jsQR) return resolve();
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar o leitor de QR code."));
    document.head.appendChild(script);
  });
}

type Result = {
  alreadyUsed: boolean;
  customerName: string | null;
  items: string[];
} | null;

export default function CheckIn() {
  const [, params] = useRoute("/checkin/:eventId");
  const eventId = Number(params?.eventId);

  const storageKey = `checkin_code_${eventId}`;
  const [code, setCode] = useState(() => localStorage.getItem(storageKey) ?? "");
  const [codeInput, setCodeInput] = useState("");
  const { data: verify, isLoading: verifying } = trpc.publicStore.checkInVerifyCode.useQuery(
    { eventId, code }, { enabled: !!eventId && code.length === 6 }
  );

  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [lastTicketCode, setLastTicketCode] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const checkInMutation = trpc.publicStore.checkInTicket.useMutation({
    onSuccess: (data) => {
      setResult(data);
      stopScanning();
    },
    onError: (err) => {
      toast.error(err.message || "Não foi possível ler esse código.");
      stopScanning();
    },
  });

  function submitCode() {
    if (codeInput.length !== 6) return toast.error("Digite os 6 dígitos do código.");
    localStorage.setItem(storageKey, codeInput);
    setCode(codeInput);
  }

  function extractTicketCode(scanned: string): string {
    const match = scanned.match(/\/loja\/r\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : scanned.trim();
  }

  function handleScannedText(text: string) {
    const ticketCode = extractTicketCode(text);
    setLastTicketCode(ticketCode);
    checkInMutation.mutate({ eventId, code, ticketCode });
  }

  async function startScanning() {
    setResult(null);
    try {
      await loadJsQR();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      tick();
    } catch (err) {
      toast.error("Não foi possível acessar a câmera. Use a digitação manual abaixo.");
    }
  }

  function tick() {
    if (!videoRef.current || !canvasRef.current || !window.jsQR) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }
    const video = videoRef.current;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code?.data) {
          handleScannedText(code.data);
          return;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  function stopScanning() {
    setScanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  useEffect(() => () => stopScanning(), []);

  function submitManual() {
    if (!manualCode.trim()) return;
    setLastTicketCode(manualCode.trim());
    checkInMutation.mutate({ eventId, code, ticketCode: manualCode.trim() });
    setManualCode("");
  }

  function allowAnyway() {
    if (!lastTicketCode) return;
    checkInMutation.mutate({ eventId, code, ticketCode: lastTicketCode, forceAllow: true });
  }

  function newScan() {
    setResult(null);
    setLastTicketCode(null);
  }

  if (!code || (code.length === 6 && !verifying && verify && !verify.valid)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: BRAND.blue }}>
        <Card className="max-w-sm w-full">
          <CardContent className="pt-8 pb-8 space-y-4 text-center">
            <KeyRound className="mx-auto h-8 w-8" style={{ color: BRAND.blue }} />
            <h1 className="text-lg font-semibold" style={{ color: BRAND.blue }}>Check-in do Evento</h1>
            <p className="text-sm text-muted-foreground">Digite o código de 6 dígitos que você recebeu.</p>
            <Input
              value={codeInput} onChange={e => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000" className="text-center text-2xl tracking-widest" maxLength={6}
            />
            {code.length === 6 && verify && !verify.valid && (
              <p className="text-sm text-destructive">Código inválido.</p>
            )}
            <Button className="w-full text-white" style={{ background: BRAND.green }} onClick={submitCode}>
              Entrar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verifying) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verificando…</div>;
  }

  return (
    <div className="min-h-screen pb-10" style={{ background: BRAND.white }}>
      <header className="py-6 px-4 text-center" style={{ background: BRAND.blue }}>
        <h1 className="text-lg font-bold text-white">Check-in — {verify?.eventName}</h1>
      </header>

      <main className="max-w-sm mx-auto p-4 space-y-4">
        {result ? (
          <Card className={result.alreadyUsed ? "border-amber-400" : "border-emerald-400"} style={{ borderWidth: 2 }}>
            <CardContent className="pt-6 space-y-3 text-center">
              {result.alreadyUsed ? (
                <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
              ) : (
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
              )}
              <p className="font-semibold text-lg">
                {result.alreadyUsed ? "Já utilizado antes!" : "Entrada liberada"}
              </p>
              {result.customerName && <p className="text-sm">{result.customerName}</p>}
              {result.items.length > 0 && (
                <p className="text-xs text-muted-foreground">{result.items.join(", ")}</p>
              )}
              {result.alreadyUsed && (
                <Button variant="outline" className="w-full" onClick={allowAnyway}>
                  Permitir mesmo assim
                </Button>
              )}
              <Button className="w-full text-white" style={{ background: BRAND.blue }} onClick={newScan}>
                Ler próximo
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="pt-6 space-y-3">
                {scanning ? (
                  <div className="relative rounded-lg overflow-hidden">
                    <video ref={videoRef} className="w-full rounded-lg" muted playsInline />
                    <canvas ref={canvasRef} className="hidden" />
                    <Button variant="outline" className="w-full mt-2" onClick={stopScanning}>Parar câmera</Button>
                  </div>
                ) : (
                  <Button className="w-full gap-2 text-white" style={{ background: BRAND.green }} onClick={startScanning}>
                    <Camera className="h-4 w-4" /> Escanear QR code
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs text-muted-foreground">Ou digite o código do comprovante na mão:</p>
                <div className="flex gap-2">
                  <Input value={manualCode} onChange={e => setManualCode(e.target.value)} placeholder="Código do comprovante" />
                  <Button onClick={submitManual} disabled={checkInMutation.isPending}>Verificar</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
