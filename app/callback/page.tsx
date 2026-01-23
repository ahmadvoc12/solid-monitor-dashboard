'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    async function completeLogin() {
      await handleIncomingRedirect({ restorePreviousSession: true });
      router.replace('/');
    }
    completeLogin();
  }, [router]);

  return <div>Loading...</div>;
}