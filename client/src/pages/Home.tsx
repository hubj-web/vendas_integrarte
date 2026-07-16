import { Link } from "wouter";
import { ClipboardList, ShoppingCart, Truck, HeartHandshake } from "lucide-react";

const LOGO_URL = "/integrarte-logo.png";

const menuItems = [
  {
    label: "Administrativo Vendas",
    description: "Pedidos, produtos, rotas e relatórios",
    href: "/admin",
    icon: ClipboardList,
    color: "from-emerald-500 to-emerald-600",
  },
  {
    label: "Vendas",
    description: "Lançar pedidos e consultar estoque",
    href: "/vendedor",
    icon: ShoppingCart,
    color: "from-blue-500 to-blue-600",
  },
  {
    label: "Entregas",
    description: "Rotas e entregas do dia",
    href: "/entregador",
    icon: Truck,
    color: "from-orange-500 to-orange-600",
  },
  {
    label: "Gestão Integrarte",
    description: "Voluntários, suprimentos e atividades",
    href: "/gestao",
    icon: HeartHandshake,
    color: "from-purple-500 to-purple-600",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <img src={LOGO_URL} alt="Integrarte" className="h-28 w-auto mx-auto mb-4 drop-shadow-sm" />
          <h1 className="text-2xl font-bold text-foreground">Sistema Integrarte</h1>
          <p className="text-sm text-muted-foreground mt-1">Escolha uma área para continuar</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <div className="group bg-white rounded-2xl shadow-md border border-gray-100 p-6 flex items-center gap-4 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 transition-all">
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0 shadow-sm`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-foreground group-hover:text-primary transition-colors">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
