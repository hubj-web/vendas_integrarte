import { type ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminGuardProps {
  children: ReactNode;
}

export default function AdminGuard({ children }: AdminGuardProps) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-3 w-64">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return <Redirect to="/admin" />;
  }

  return <>{children}</>;
}
