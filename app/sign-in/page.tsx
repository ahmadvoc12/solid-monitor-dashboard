'use client';

import React, { useState, useEffect } from 'react';
import {
  Button,
  Input,
  Box,
  FormControl,
  FormLabel,
  Heading,
  useToast,
} from '@chakra-ui/react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';

export default function SolidLoginPage() {
  const [idp, setIdp] = useState('');
  const [loading, setLoading] = useState(false);
  const { session, isLoggedIn } = useSolidSession();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (isLoggedIn) {
      router.replace('/');
    }
  }, [isLoggedIn, router]);

  useEffect(() => {
    setIdp('https://login.inrupt.com'); // Default OIDC Issuer
  }, []);

  async function handleLogin() {
    if (!idp) {
      toast({
        title: 'Error',
        description: 'OIDC Issuer harus diisi',
        status: 'error',
        duration: 4000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    try {
      await session.login({
        oidcIssuer: idp,
        redirectUrl: window.location.origin + '/callback',
        clientName: 'Solid Monitor Dashboard',
      });
    } catch (error: any) {
      toast({
        title: 'Login gagal',
        description: error.message || 'Terjadi kesalahan saat login',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      setLoading(false);
    }
  }

  return (
    <Box maxW="md" mx="auto" mt="20" p="6" borderWidth="1px" borderRadius="md" boxShadow="md">
      <Heading mb="6" textAlign="center">Login Solid</Heading>
      <FormControl mb="6" isRequired>
        <FormLabel>Identity Provider (OIDC Issuer)</FormLabel>
        <Input
          placeholder="https://login.inrupt.com/"
          value={idp}
          onChange={(e) => setIdp(e.target.value)}
          autoComplete="off"
        />
      </FormControl>
      <Button
        colorScheme="blue"
        width="full"
        onClick={handleLogin}
        isLoading={loading}
        loadingText="Menghubungkan..."
      >
        Login
      </Button>
    </Box>
  );
}