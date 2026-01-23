'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import {
  getDefaultSession,
  handleIncomingRedirect,
  Session,
} from '@inrupt/solid-client-authn-browser';

// Tipe context
interface SolidSessionContextType {
  session: Session;
  isLoggedIn: boolean;
  login: (options: {
    oidcIssuer: string;
    redirectUrl: string;
    clientName: string;
    clientId?: string; // opsional, hanya kalau butuh static client registration
  }) => Promise<void>;
  logout: () => Promise<void>;
}

// Buat context
const SolidSessionContext = createContext<SolidSessionContextType | undefined>(
  undefined
);

// Provider
export function SolidSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(getDefaultSession());
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(
    session.info.isLoggedIn
  );
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    async function init() {
      try {
        // Handle redirect dari OIDC login
        await handleIncomingRedirect({ restorePreviousSession: true });

        const sess = getDefaultSession();
        setSession(sess);
        setIsLoggedIn(sess.info.isLoggedIn);
      } catch (err) {
        console.error("❌ Error in handleIncomingRedirect:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const login = async ({
    oidcIssuer,
    redirectUrl,
    clientName,
    clientId,
  }: {
    oidcIssuer: string;
    redirectUrl: string;
    clientName: string;
    clientId?: string;
  }) => {
    try {
      await session.login({
        oidcIssuer,
        redirectUrl,
        clientName,
        clientId, // opsional
      });
    } catch (err) {
      console.error("❌ Solid login failed:", err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await session.logout();
    } catch (err) {
      console.error("❌ Solid logout failed:", err);
    } finally {
      setIsLoggedIn(false);
      setSession(getDefaultSession()); // reset ke default
      localStorage.clear();
    }
  };

  if (loading) {
    return <div>Loading authentication...</div>;
  }

  return (
    <SolidSessionContext.Provider
      value={{ session, isLoggedIn, login, logout }}
    >
      {children}
    </SolidSessionContext.Provider>
  );
}

// Hook aman
export function useSolidSession(): SolidSessionContextType {
  const context = useContext(SolidSessionContext);

  if (!context) {
    // Saat prerendering di server-side
    if (typeof window === 'undefined') {
      return {
        session: getDefaultSession(),
        isLoggedIn: false,
        login: async () => {
          throw new Error("⚠️ Solid login called during SSR");
        },
        logout: async () => {},
      };
    }

    // Saat client-side tapi tidak dibungkus <SolidSessionProvider>
    console.warn(
      '⚠️ useSolidSession dipanggil di luar <SolidSessionProvider>. Menggunakan fallback session kosong.'
    );
    return {
      session: getDefaultSession(),
      isLoggedIn: false,
      login: async () => {
        throw new Error("⚠️ useSolidSession fallback: login tidak tersedia");
      },
      logout: async () => {},
    };
  }

  return context;
}
