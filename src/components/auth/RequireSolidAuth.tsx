'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';
import { Spinner, Text, Box } from '@chakra-ui/react';

export default function RequireSolidAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useSolidSession();
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn !== undefined) {
      setLoading(false);
      if (!isLoggedIn) {
        console.warn('User not logged in, redirecting...');
        router.replace('/sign-in');
      } else {
        console.log('User is logged in.');
      }
    }
  }, [isLoggedIn, router]);

  if (loading) {
    return (
      <Box textAlign="center" mt="40">
        <Spinner size="xl" />
        <Text mt="4">Checking login status...</Text>
      </Box>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}
