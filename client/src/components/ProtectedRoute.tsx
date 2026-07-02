import { useLocalAuth } from "@/hooks/useLocalAuth";
import { Loader2 } from "lucide-react";
import { Redirect } from "wouter";

type Props = {
  children: React.ReactNode;
  roles?: ("admin" | "launcher" | "delivery")[];
};

export default function ProtectedRoute({ children, roles }: Props) {
  const { user, isLoading } = useLocalAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roles && !roles.includes(user.role as any)) {
    return <Redirect to="/" />;
  }

  return <>{children}</>;
}
