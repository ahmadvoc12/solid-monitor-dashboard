'use client';

import React, { useEffect, useState } from 'react';
import { ChakraProvider, Box, Portal, useDisclosure } from '@chakra-ui/react';
import theme from '@/theme/theme';
import routes from '@/routes';
import Sidebar from '@/components/sidebar/Sidebar';
import Footer from '@/components/footer/FooterAdmin';
import Navbar from '@/components/navbar/NavbarAdmin';
import { getActiveRoute, getActiveNavbar } from '@/utils/navigation';
import { usePathname } from 'next/navigation';
import '@/styles/App.css';
import '@/styles/Contact.css';
import '@/styles/Plugins.css';
import '@/styles/MiniCalendar.css';
import AppWrappers from './AppWrappers';

import { SolidSessionProvider } from '@/contexts/SolidSessionContext';
import { ChatSessionProvider } from '@/contexts/ChatSessionContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [apiKey, setApiKey] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

  useEffect(() => {
    const initialKey = localStorage.getItem('apiKey');
    if (initialKey?.includes('sk-') && apiKey !== initialKey) {
      setApiKey(initialKey);
    }
  }, [apiKey]);

  const isAuthPage = pathname?.includes('register') || pathname?.includes('sign-in');

  return (
    <html lang="en">
      <body id="root">
        <AppWrappers>
          <ChakraProvider theme={theme}>
            <SolidSessionProvider>
              <ChatSessionProvider>
                {isAuthPage ? (
                  children
                ) : (
                  <MainLayout setApiKey={setApiKey}>{children}</MainLayout>
                )}
              </ChatSessionProvider>
            </SolidSessionProvider>
          </ChakraProvider>
        </AppWrappers>
      </body>
    </html>
  );
}

// ✅ Komponen layout utama yang memanggil context sudah di dalam provider
function MainLayout({
  children,
  setApiKey,
}: {
  children: React.ReactNode;
  setApiKey: (key: string) => void;
}) {
  const pathname = usePathname();
  const { isOpen, onOpen } = useDisclosure();

  const { session } = require('@/contexts/SolidSessionContext').useSolidSession();
  const { setAllMessages, setSessionMessages } = require('@/contexts/ChatSessionContext').useChatSession();

  const loadMessagesFromSolidPod = async (filename: string) => {
    try {
      const {
        getPodUrlAll,
        getSolidDataset,
        getThingAll,
        getStringNoLocale,
      } = await import('@inrupt/solid-client');
      const { SCHEMA_INRUPT, DCTERMS } = await import('@inrupt/vocab-common-rdf');

      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const chatFileUrl = `${podUrls[0]}public/llm-solid-chat/${filename}`;
      const dataset = await getSolidDataset(chatFileUrl, { fetch: session.fetch });
      const things = getThingAll(dataset);

      const parsedMessages = things
        .map((thing) => {
          const content = getStringNoLocale(thing, SCHEMA_INRUPT.NS('text'));
          const role = getStringNoLocale(thing, SCHEMA_INRUPT.NS('about')) as 'user' | 'assistant';
          const id = getStringNoLocale(thing, DCTERMS.identifier);
          const created = getStringNoLocale(thing, DCTERMS.created);
          const chatWith = getStringNoLocale(thing, 'https://schema.org/chatWith');
          const modelVersion = getStringNoLocale(thing, 'https://schema.org/modelVersion');
          const sessionPairId = getStringNoLocale(thing, 'https://schema.org/sessionPairId');

          if (content && role && id && created) {
            return {
              id,
              role,
              content,
              created: new Date(created).getTime(),
              chatWith,
              modelVersion,
              sessionPairId,
            };
          }
        })
        .filter(Boolean) as {
          id: string;
          role: 'user' | 'assistant';
          content: string;
          created: number;
          chatWith?: string;
          modelVersion?: string;
          sessionPairId?: string;
        }[];

      parsedMessages.sort((a, b) => a.created - b.created);
      const messages = parsedMessages.map(({ id, role, content }) => ({ id, role, content }));

      setAllMessages(messages);
      setSessionMessages(messages);
    } catch (err) {
      console.warn('⚠️ Could not load messages from Solid Pod:', err);
    }
  };

  return (
    <Box>
      <Sidebar routes={routes} setApiKey={setApiKey} loadMessagesFromSolidPod={loadMessagesFromSolidPod} />
      <Box
        pt={{ base: '60px', md: '100px' }}
        float="right"
        minHeight="100vh"
        height="100%"
        overflow="auto"
        position="relative"
        maxHeight="100%"
        w={{ base: '100%', xl: 'calc(100% - 290px)' }}
        maxWidth={{ base: '100%', xl: 'calc(100% - 290px)' }}
        transition="all 0.33s cubic-bezier(0.685, 0.0473, 0.346, 1)"
      >

        <Box mx="auto" p={{ base: '20px', md: '30px' }} pe="20px" minH="100vh" pt="50px">
          {children}
        </Box>
        <Footer />
      </Box>
    </Box>
  );
}
