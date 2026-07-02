import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

export function useLocalAuth() {
  const utils = trpc.useUtils();
  const { data: user, isLoading } = trpc.auth.me.useQuery();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });

  const login = useCallback(
    (email: string, password: string) => loginMutation.mutateAsync({ email, password }),
    [loginMutation]
  );

  const logout = useCallback(() => logoutMutation.mutateAsync(), [logoutMutation]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    loginError: loginMutation.error,
    isLoggingIn: loginMutation.isPending,
  };
}
