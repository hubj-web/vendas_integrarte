import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { GraduationCap, Users, Tags, Wallet, ClipboardCheck, ArrowRight } from "lucide-react";

const cards = [
  { href: "/gestao/alunos", label: "Alunos", description: "Cadastro e modalidades", icon: GraduationCap },
  { href: "/gestao/professores", label: "Professores", description: "Cadastro e bolsa cultura", icon: Users },
  { href: "/gestao/modalidades", label: "Modalidades", description: "Canto, Violão, Dança, Teatro...", icon: Tags },
  { href: "/gestao/frequencia", label: "Frequência", description: "Chamada e controle de faltas", icon: ClipboardCheck },
  { href: "/gestao/pagamentos", label: "Pagamentos", description: "Contribuições e bolsas mensais", icon: Wallet },
];

export default function GestaoIntegrarte() {
  const { data: alunos } = trpc.gestao.alunos.list.useQuery({ onlyActive: true });
  const { data: professores } = trpc.gestao.professores.list.useQuery({ onlyActive: true });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Escola de Artes Espírita</h2>
        <p className="text-sm text-muted-foreground">Visão geral da gestão da instituição</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{alunos?.length ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Alunos ativos</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{professores?.length ?? "—"}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Professores ativos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href}>
              <div className="group bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4 cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                  <Icon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground group-hover:text-purple-700 transition-colors">{c.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
