import { Link } from "wouter";
import { ArrowLeft, Users, Package, CalendarDays, Construction } from "lucide-react";
import { HighlightedTitle } from "@/components/HighlightedTitle";

const LOGO_URL = "/integrarte-logo.png";

const sections = [
  { label: "Voluntários", icon: Users, description: "Cadastro e escala de voluntários" },
  { label: "Suprimentos", icon: Package, description: "Controle de materiais e insumos da instituição" },
  { label: "Atividades", icon: CalendarDays, description: "Agenda e registro de atividades" },
];

export default function GestaoIntegrarte() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <Link href="/">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            Voltar ao menu
          </button>
        </Link>

        <div className="text-center mb-8">
          <img src={LOGO_URL} alt="Integrarte" className="h-20 w-auto mx-auto mb-3 drop-shadow-sm" />
          <h1 className="text-xl font-bold text-foreground">
            <HighlightedTitle color="purple">Gestão Integrarte</HighlightedTitle>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão da instituição — voluntários, suprimentos e atividades
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1">
            <Construction className="w-4 h-4" />
            <p className="text-sm font-semibold">Em construção</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Essa área ainda vai ser desenhada com calma — o menu abaixo mostra o que está
            planejado até agora.
          </p>
        </div>

        <div className="space-y-3">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 opacity-60"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
