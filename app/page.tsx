'use client';

import {
  Box,
  Text,
  Spinner,
  SimpleGrid,
  useToast,
  Flex,
  Divider,
  Badge,
  VStack,
  Tag
} from '@chakra-ui/react';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';

import {
  getSolidDataset,
  getThingAll,
  getUrlAll,
  getDatetime,
  getPodUrlAll,
  getStringNoLocaleAll
} from '@inrupt/solid-client';

/* ======================================================
   CONSTANTS
====================================================== */
const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX  = 'https://example.org/solid/audit#';

/* ======================================================
   TYPES
====================================================== */
type AuditLog = {
  app: string;
  created: string;
  sensitive: boolean;
  personalData: string[];
  values: string[];
};

/* ======================================================
   HELPERS
====================================================== */
function extractAppFromResource(resource: string) {
  const idx = resource.indexOf('/public/health-records/');
  if (idx === -1) return resource;
  return resource.substring(0, idx + '/public/health-records/'.length);
}

function shortIri(iri: string) {
  return iri.split('#').pop() ?? iri;
}

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
          const resources = getUrlAll(thing, `${DPV}hasResource`);
          const categories = getUrlAll(thing, `${DPV}hasDataCategory`);
          const personalData = getUrlAll(thing, `${DPV}hasPersonalData`);
          const values = getStringNoLocaleAll(thing, `${EX}hasDataValue`);

          const created =
            getDatetime(thing, `${DCT}created`)?.toISOString() ?? '-';

          const sensitive =
            categories.some(c =>
              c.includes('Sensitive') || c.includes('Special')
            );

          const app =
            resources.length > 0
              ? extractAppFromResource(resources[0])
              : 'Unknown application';

          parsed.push({
            app,
            created,
            sensitive,
            personalData: personalData.map(shortIri),
            values
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
    <Box maxW="7xl" mx="auto" py={10} px={4}>
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

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        {logs.map((log, i) => (
          <Box
            key={i}
            p={5}
            borderRadius="md"
            boxShadow="md"
            bg={log.sensitive ? 'red.50' : 'green.50'}
            borderLeft="6px solid"
            borderColor={log.sensitive ? 'red.400' : 'green.400'}
          >
            <VStack align="start" spacing={2}>
              <Text fontWeight="bold">Application</Text>
              <Text fontSize="sm" wordBreak="break-all">
                {log.app}
              </Text>

              <Text>
                <b>Access time:</b><br />
                {log.created}
              </Text>

              <Badge colorScheme={log.sensitive ? 'red' : 'green'}>
                {log.sensitive
                  ? 'Sensitive Personal Data'
                  : 'Non-Sensitive Data'}
              </Badge>

              {log.personalData.length > 0 && (
                <>
                  <Text fontWeight="bold" pt={2}>
                    Data Accessed
                  </Text>
                  <Flex wrap="wrap" gap={2}>
                    {log.personalData.map((pd, idx) => (
                      <Tag key={idx} colorScheme="blue">
                        {pd}
                      </Tag>
                    ))}
                  </Flex>
                </>
              )}

              {log.values.length > 0 && (
                <>
                  <Text fontWeight="bold" pt={2}>
                    Values
                  </Text>
                  {log.values.map((v, idx) => (
                    <Text key={idx} fontSize="sm">
                      • {v}
                    </Text>
                  ))}
                </>
              )}
            </VStack>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
