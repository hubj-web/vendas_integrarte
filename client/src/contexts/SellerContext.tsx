import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface SellerSession {
  id: number;
  name: string;
}

interface SellerContextType {
  seller: SellerSession | null;
  setSeller: (seller: SellerSession | null) => void;
  clearSeller: () => void;
}

const SellerContext = createContext<SellerContextType | null>(null);

const STORAGE_KEY = "seller_session";

export function SellerProvider({ children }: { children: ReactNode }) {
  const [seller, setSellerState] = useState<SellerSession | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setSeller = (s: SellerSession | null) => {
    setSellerState(s);
    if (s) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const clearSeller = () => setSeller(null);

  return (
    <SellerContext.Provider value={{ seller, setSeller, clearSeller }}>
      {children}
    </SellerContext.Provider>
  );
}

export function useSeller() {
  const ctx = useContext(SellerContext);
  // Allow usage outside provider (e.g. Admin area)
  return ctx || { seller: null, setSeller: () => {}, clearSeller: () => {} };
}
