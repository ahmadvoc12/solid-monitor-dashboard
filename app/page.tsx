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
  Tag,
  Input,
  Select,
  HStack
} from '@chakra-ui/react';

import { useEffect, useMemo, useState } from 'react';
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
type DataPair = {
  field: string;
  value: string;
};

type AuditLog = {
  app: string;
  created: string;
  createdAt: Date | null;
  sensitive: boolean;
  personalData: string[];
  dataPairs: DataPair[];
};

/* ======================================================
   HELPERS
====================================================== */
function extractAppFromResource(resource: string): string {
  try {
    const url = new URL(resource);
    const segments = url.pathname.split('/').filter(Boolean);
    const publicIdx = segments.indexOf('public');
    return publicIdx !== -1 && segments[publicIdx + 1]
      ? segments[publicIdx + 1]
      : 'Unknown';
  } catch {
    return 'Unknown';
  }
}

function shortIri(iri: string) {
  if (iri.includes('schema.org/')) {
    return iri.replace('https://schema.org/', 'schema:');
  }
  if (iri.includes('purl.org/dc/terms/')) {
    return iri.replace('http://purl.org/dc/terms/', 'dct:');
  }
  return iri.split('#').pop() ?? iri;
}

/* ⛔ METADATA FIELD → JANGAN DITAMPILKAN */
function isMetadataField(field: string) {
  return (
    field.includes('purl.org/dc/terms') ||
    field.includes('created') ||
    field.includes('modified') ||
    field.includes('timestamp')
  );
}

function isWithinDays(date: Date, days: number) {
  const now = new Date();
  return now.getTime() - date.getTime() <= days * 86400000;
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

  /* ================= FILTER STATE ================= */
  const [search, setSearch] = useState('');
  const [sensitivity, setSensitivity] =
    useState<'all' | 'sensitive' | 'normal'>('all');
  const [dateFilter, setDateFilter] =
    useState<'all' | 'today' | '7' | '30'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');

  /* ================= AUTH ================= */
  useEffect(() => {
    if (!isLoggedIn) router.replace('/sign-in');
  }, [isLoggedIn, router]);

  /* ================= LOAD AUDIT LOG ================= */
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

          const personalData = getUrlAll(thing, `${DPV}hasPersonalData`)
            .map(shortIri);

          /* 🔥 FIELD + VALUE DIPASANGKAN */
          const fields = getStringNoLocaleAll(thing, `${EX}hasDataField`);
          const values = getStringNoLocaleAll(thing, `${EX}hasDataValue`);

          const dataPairs = fields
            .map((field, i) => ({
              field,
              value: values[i]
            }))
            .filter(p => !isMetadataField(p.field));

          const createdDt = getDatetime(thing, `${DCT}created`) ?? null;

          const sensitive =
            categories.some(c =>
              c.includes('Sensitive') || c.includes('Special')
            );

          const app =
            resources.length > 0
              ? extractAppFromResource(resources[0])
              : 'Unknown';

          parsed.push({
            app,
            created: createdDt?.toISOString() ?? '-',
            createdAt: createdDt,
            sensitive,
            personalData,
            dataPairs
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

  /* ================= FILTERED LOGS ================= */
  const apps = useMemo(
    () => Array.from(new Set(logs.map(l => l.app))),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (sensitivity === 'sensitive' && !log.sensitive) return false;
      if (sensitivity === 'normal' && log.sensitive) return false;
      if (appFilter !== 'all' && log.app !== appFilter) return false;

      if (dateFilter !== 'all' && log.createdAt) {
        if (dateFilter === 'today' && !isWithinDays(log.createdAt, 1)) return false;
        if (dateFilter === '7' && !isWithinDays(log.createdAt, 7)) return false;
        if (dateFilter === '30' && !isWithinDays(log.createdAt, 30)) return false;
      }

      const q = search.toLowerCase();
      if (!q) return true;

      return (
        log.app.toLowerCase().includes(q) ||
        log.personalData.some(p => p.toLowerCase().includes(q)) ||
        log.dataPairs.some(
          p =>
            p.field.toLowerCase().includes(q) ||
            p.value.toLowerCase().includes(q)
        )
      );
    });
  }, [logs, search, sensitivity, dateFilter, appFilter]);

  /* ================= UI ================= */
  return (
    <Box maxW="7xl" mx="auto" py={10} px={4}>
      <Flex justify="space-between" align="center" mb={4}>
        <Text fontSize="2xl" fontWeight="bold">
          Solid Audit Dashboard
        </Text>
        <Badge colorScheme="purple">DPV · READ ONLY</Badge>
      </Flex>

      <Divider mb={6} />

      <VStack spacing={4} mb={6} align="stretch">
        <Input
          placeholder="Search application, schema, or value..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <HStack spacing={4} wrap="wrap">
          <Select value={sensitivity} onChange={e => setSensitivity(e.target.value as any)}>
            <option value="all">All Data</option>
            <option value="sensitive">Sensitive Only</option>
            <option value="normal">Non-Sensitive Only</option>
          </Select>

          <Select value={dateFilter} onChange={e => setDateFilter(e.target.value as any)}>
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </Select>

          <Select value={appFilter} onChange={e => setAppFilter(e.target.value)}>
            <option value="all">All Applications</option>
            {apps.map(app => (
              <option key={app} value={app}>{app}</option>
            ))}
          </Select>
        </HStack>
      </VStack>

      {loading && <Spinner />}

      {!loading && filteredLogs.length === 0 && (
        <Text>No audit logs match the selected filters.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
        {filteredLogs.map((log, i) => (
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
              <Text fontWeight="bold">App</Text>
              <Tag colorScheme="purple">{log.app}</Tag>

              <Text fontSize="sm">
                <b>Access time:</b><br />
                {log.created}
              </Text>

              <Badge colorScheme={log.sensitive ? 'red' : 'green'}>
                {log.sensitive ? 'Sensitive Personal Data' : 'Non-Sensitive Data'}
              </Badge>

              {log.personalData.length > 0 && (
                <>
                  <Text fontWeight="bold" pt={2}>
                    Data Category
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

              {log.dataPairs.length > 0 && (
                <>
                  <Text fontWeight="bold" pt={2}>
                    Data Values
                  </Text>

                  <VStack align="start" spacing={1}>
                    {log.dataPairs.map((p, idx) => (
                      <HStack key={idx} spacing={2}>
                        <Tag size="sm" colorScheme="blue">
                          {shortIri(p.field)}
                        </Tag>
                        <Text fontSize="sm">→</Text>
                        <Tag size="sm" colorScheme="green">
                          {p.value}
                        </Tag>
                      </HStack>
                    ))}
                  </VStack>
                </>
              )}
            </VStack>
          </Box>
        ))}
      </SimpleGrid>
    </Box>
  );
}
