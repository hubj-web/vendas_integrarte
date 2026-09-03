import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#1a1a1a",
          "--normal-border": "#e5e7eb",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
