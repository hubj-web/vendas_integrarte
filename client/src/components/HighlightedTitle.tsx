import type { ReactNode } from "react";

const COLOR_MAP: Record<string, string> = {
  emerald: "bg-emerald-300/70",
  blue: "bg-blue-300/70",
  orange: "bg-orange-300/70",
  purple: "bg-purple-300/70",
};

/**
 * Título com efeito de "hachura"/marca-texto atrás da palavra, na cor
 * correspondente ao ícone daquela área no menu inicial.
 */
export function HighlightedTitle({
  children,
  color,
  className = "",
}: {
  children: ReactNode;
  color: "emerald" | "blue" | "orange" | "purple";
  className?: string;
}) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className={`absolute inset-x-0 bottom-0.5 h-2.5 ${COLOR_MAP[color]} -rotate-1 rounded-sm -z-0`} />
      <span className="relative z-10">{children}</span>
    </span>
  );
}
