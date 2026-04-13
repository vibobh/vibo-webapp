"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";

interface AuthUser {
  id: string;
  email: string;
  username?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  setSession: (token: string, user: AuthUser) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  isLoading: true,
  setSession: () => {},
  clearSession: () => {},
});

export function useViboAuth() {
  return useContext(AuthContext);
}

function InnerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/auth/token").then((r) => (r.ok ? r.json() : { token: null })),
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : { user: null })),
    ])
      .then(([tokenData, meData]) => {
        if (cancelled) return;
        if (tokenData?.token) setToken(tokenData.token);
        if (meData?.user) setUser(meData.user);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback((t: string, u: AuthUser) => {
    setToken(t);
    setUser(u);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  }, []);

  const ctx = useMemo(
    () => ({ user, token, isLoading, setSession, clearSession }),
    [user, token, isLoading, setSession, clearSession],
  );

  return <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>;
}

function useConvexAuthFromToken() {
  const { token, isLoading } = useViboAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (forceRefreshToken) {
        try {
          const r = await fetch("/api/auth/token");
          const data = await r.json();
          return (data.token as string) || null;
        } catch {
          return null;
        }
      }
      return token;
    },
    [token],
  );

  return useMemo(
    () => ({
      isLoading,
      isAuthenticated: !!token,
      fetchAccessToken,
    }),
    [isLoading, token, fetchAccessToken],
  );
}

function makeClient(): ConvexReactClient | null {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || "";
  if (!url) return null;
  return new ConvexReactClient(url);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => makeClient(), []);

  if (!client) {
    return (
      <InnerAuthProvider>
        {children}
      </InnerAuthProvider>
    );
  }

  return (
    <InnerAuthProvider>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAuthFromToken}>
        {children}
      </ConvexProviderWithAuth>
    </InnerAuthProvider>
  );
}
