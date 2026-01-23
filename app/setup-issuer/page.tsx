// app/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function completeLogin() {
      try {
        const sessionInfo = await handleIncomingRedirect({
          restorePreviousSession: true,
        });

        if (sessionInfo) {
          // Alihkan ke setup-issuer untuk validasi WebID
          router.push('/setup-issuer');
        } else {
          // Jika tidak ada session, kembali ke login
          router.push('/sign-in');
        }
      } catch (error) {
        console.error('Login gagal:', error);
        alert('Login gagal. Cek konsol untuk detail.');
        router.push('/sign-in');
      }
    }

    completeLogin();
  }, [router]);

  return (
    <div style={{ textAlign: 'center', marginTop: '50px' }}>
      Memproses login...
    </div>
  );
}