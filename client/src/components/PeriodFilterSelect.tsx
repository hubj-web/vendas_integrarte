import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { periodMonthOptions, periodValueToLabel } from "@/lib/periodFilter";

/**
 * Seletor de período com meses pré-definidos + opção "Personalizar" que abre
 * um popup pra escolher data inicial e final livremente. Usado em Pedidos,
 * Empacotamento, Entregas e outras telas que filtram por data.
 */
export function PeriodFilterSelect({
  value, onChange, className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  function handleSelectChange(v: string) {
    if (v === "custom") {
      if (value.startsWith("custom:")) {
        const [, from, to] = value.split(":");
        setCustomFrom(from ?? "");
        setCustomTo(to ?? "");
      } else {
        setCustomFrom("");
        setCustomTo("");
      }
      setShowCustom(true);
    } else {
      onChange(v);
    }
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    onChange(`custom:${customFrom}:${customTo}`);
    setShowCustom(false);
  }

  const selectValue = value.startsWith("custom:") ? "custom" : (value || "all");

  return (
    <>
      <Select value={selectValue} onValueChange={handleSelectChange}>
        <SelectTrigger className={className}>
          <SelectValue>{periodValueToLabel(value)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os meses</SelectItem>
          {periodMonthOptions().map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
          <SelectItem value="custom">Personalizar...</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={showCustom} onOpenChange={setShowCustom}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Período personalizado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Data inicial</Label>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Data final</Label>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustom(false)}>Cancelar</Button>
            <Button onClick={applyCustom} disabled={!customFrom || !customTo}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
