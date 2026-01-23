'use client';

import {
  Box,
  Text,
  Spinner,
  SimpleGrid,
  useToast,
  Flex,
  Divider,
  Badge
} from '@chakra-ui/react';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';

import {
  getSolidDataset,
  getThingAll,
  getUrl,
  getDatetime,
  getPodUrlAll
} from '@inrupt/solid-client';

/* ======================================================
   CONSTANTS
====================================================== */
const DPV = 'https://www.w3.org/ns/dpv#';
const DCT = 'http://purl.org/dc/terms/';

/* ======================================================
   TYPES
====================================================== */
type AuditLog = {
  app: string;
  created: string;
  sensitive: boolean;
};

/* ======================================================
   PAGE
====================================================== */
export default function AuditDashboardPage() {
  const { session, isLoggedIn } = useSolidSession();
  const router = useRouter();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     AUTH
  ========================= */
  useEffect(() => {
    if (!isLoggedIn) router.replace('/sign-in');
  }, [isLoggedIn, router]);

  /* =========================
     LOAD AUDIT LOG
  ========================= */
  useEffect(() => {
    if (!session?.info?.webId) return;

    (async () => {
      try {
        const podUrls = await getPodUrlAll(session.info.webId!, {
          fetch: session.fetch
        });

        const auditLogUrl =
          `${podUrls[0]}private/audit/access/log.ttl`;

        const dataset = await getSolidDataset(auditLogUrl, {
          fetch: session.fetch
        });

        const parsed: AuditLog[] = [];

        getThingAll(dataset).forEach(thing => {
          const controller =
            getUrl(thing, `${DPV}hasDataController`) ??
            'Unknown application';

          const created =
            getDatetime(thing, `${DCT}created`)?.toISOString() ?? '-';

          const category =
            getUrl(thing, `${DPV}hasDataCategory`) ?? '';

          parsed.push({
            app: controller,
            created,
            sensitive:
              category.includes('Sensitive') ||
              category.includes('Special')
          });
        });

        setLogs(parsed.reverse());
      } catch (err) {
        console.error(err);
        toast({
          title: 'Failed to load audit log',
          description:
            'Ensure ACL allows read access to private/audit/access/log.ttl',
          status: 'error'
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [session, toast]);

  /* =========================
     UI
  ========================= */
  return (
    <Box maxW="6xl" mx="auto" py={10} px={4}>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="2xl" fontWeight="bold">
          Solid Audit Dashboard
        </Text>
        <Badge colorScheme="purple">DPV · READ ONLY</Badge>
      </Flex>

      <Divider mb={6} />

      {loading && <Spinner />}

      {!loading && logs.length === 0 && (
        <Text>No audit logs found.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {logs.map((log, i) => (
          <Box
            key={i}
            p={4}
            borderRadius="md"
            boxShadow="md"
            bg={log.sensitive ? 'red.50' : 'green.50'}
            borderLeft="6px solid"
            borderColor={log.sensitive ? 'red.400' : 'green.400'}
          >
            <Text fontWeight="bold" mb={1}>
              Application
            </Text>
            <Text fontSize="sm" wordBreak="break-all">
              {log.app}
            </Text>

            <Text mt={3}>
              <b>Access time:</b>
              <br />
              {log.created}
            </Text>

            <Badge
              mt={3}
              colorScheme={log.sensitive ? 'red' : 'green'}
            >
              {log.sensitive
                ? 'Sensitive Personal Data'
                : 'Non-Sensitive Data'}
            </Badge>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
