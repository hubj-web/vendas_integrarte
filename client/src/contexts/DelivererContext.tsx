import { createContext, useContext, useState, type ReactNode } from "react";

interface DelivererSession {
  id: number;
  name: string;
}

interface DelivererContextType {
  deliverer: DelivererSession | null;
  setDeliverer: (d: DelivererSession | null) => void;
  clearDeliverer: () => void;
}

const DelivererContext = createContext<DelivererContextType | null>(null);

const STORAGE_KEY = "deliverer_session";

export function DelivererProvider({ children }: { children: ReactNode }) {
  const [deliverer, setDelivererState] = useState<DelivererSession | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const setDeliverer = (d: DelivererSession | null) => {
    setDelivererState(d);
    if (d) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const clearDeliverer = () => setDeliverer(null);

  return (
    <DelivererContext.Provider value={{ deliverer, setDeliverer, clearDeliverer }}>
      {children}
    </DelivererContext.Provider>
  );
}

export function useDeliverer() {
  const ctx = useContext(DelivererContext);
  if (!ctx) throw new Error("useDeliverer must be used within DelivererProvider");
  return ctx;
}
