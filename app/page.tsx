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
  Input,
  Select,
  Stack,
  IconButton,
  Collapse
} from '@chakra-ui/react';

import { SearchIcon, ChevronDownIcon, ChevronUpIcon } from '@chakra-ui/icons';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';

import {
  getSolidDataset,
  getThingAll,
  getUrlAll,
  getUrl,
  getDatetime,
  getStringNoLocale,
  getPodUrlAll
} from '@inrupt/solid-client';

/* ======================================================
   CONSTANTS (DPV CORE)
====================================================== */
const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX = 'https://example.org/solid/audit#';

/* ======================================================
   TYPES
====================================================== */
type AuditLog = {
  id: string;
  app: string;
  created: Date;
  sensitive: boolean;
  resource: string;
  personalData: string[];
  values: string[];
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

  /* Filters */
  const [search, setSearch] = useState('');
  const [sensitivityFilter, setSensitivityFilter] = useState<'all' | 'sensitive' | 'normal'>('all');
  const [appFilter, setAppFilter] = useState('all');

  /* UI */
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
          const id = thing.url;

          const app =
            getUrl(thing, `${DPV}hasDataController`) ??
            'Unknown application';

          const created =
            getDatetime(thing, `${DCT}created`) ?? new Date(0);

          const resource =
            getUrl(thing, `${DPV}hasResource`) ?? '-';

          const personalData =
            getUrlAll(thing, `${DPV}hasPersonalData`);

          const categories =
            getUrlAll(thing, `${DPV}hasDataCategory`);

          const values =
            getStringNoLocale(thing, `${EX}hasDataValue`)
              ? [getStringNoLocale(thing, `${EX}hasDataValue`)!]
              : [];

          const sensitive =
            categories.some(c =>
              c.includes('Sensitive') ||
              c.includes('SpecialCategory')
            );

          parsed.push({
            id,
            app,
            created,
            sensitive,
            resource,
            personalData,
            values
          });
        });

        setLogs(parsed.sort((a, b) => b.created.getTime() - a.created.getTime()));
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
     DERIVED FILTERS
  ========================= */
  const apps = useMemo(
    () => Array.from(new Set(logs.map(l => l.app))),
    [logs]
  );

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (
        sensitivityFilter === 'sensitive' &&
        !log.sensitive
      ) return false;

      if (
        sensitivityFilter === 'normal' &&
        log.sensitive
      ) return false;

      if (
        appFilter !== 'all' &&
        log.app !== appFilter
      ) return false;

      if (search) {
        const q = search.toLowerCase();
        return (
          log.app.toLowerCase().includes(q) ||
          log.resource.toLowerCase().includes(q) ||
          log.personalData.join(' ').toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [logs, search, sensitivityFilter, appFilter]);

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

      {/* FILTER BAR */}
      <Stack
        direction={{ base: 'column', md: 'row' }}
        spacing={3}
        mb={6}
      >
        <Input
          placeholder="Search app, resource, or personal data…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <Select
          value={sensitivityFilter}
          onChange={e =>
            setSensitivityFilter(e.target.value as any)
          }
        >
          <option value="all">All data</option>
          <option value="sensitive">Sensitive only</option>
          <option value="normal">Non-sensitive only</option>
        </Select>

        <Select
          value={appFilter}
          onChange={e => setAppFilter(e.target.value)}
        >
          <option value="all">All applications</option>
          {apps.map(a => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
      </Stack>

      {loading && <Spinner />}

      {!loading && filteredLogs.length === 0 && (
        <Text>No audit logs found.</Text>
      )}

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
        {filteredLogs.map(log => {
          const isOpen = expanded[log.id];

          return (
            <Box
              key={log.id}
              p={4}
              borderRadius="md"
              boxShadow="md"
              bg={log.sensitive ? 'red.50' : 'green.50'}
              borderLeft="6px solid"
              borderColor={log.sensitive ? 'red.400' : 'green.400'}
            >
              <Flex justify="space-between" align="center">
                <Text fontWeight="bold">
                  {log.app}
                </Text>
                <IconButton
                  aria-label="toggle"
                  size="sm"
                  icon={isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
                  onClick={() =>
                    setExpanded(p => ({
                      ...p,
                      [log.id]: !p[log.id]
                    }))
                  }
                />
              </Flex>

              <Text fontSize="sm" mt={1}>
                <b>Access time:</b> {log.created.toISOString()}
              </Text>

              <Badge
                mt={2}
                colorScheme={log.sensitive ? 'red' : 'green'}
              >
                {log.sensitive
                  ? 'Sensitive Personal Data'
                  : 'Non-Sensitive Data'}
              </Badge>

              <Collapse in={isOpen} animateOpacity>
                <Box mt={4}>
                  <Text fontSize="sm">
                    <b>Resource:</b>
                    <br />
                    {log.resource}
                  </Text>

                  <Text fontSize="sm" mt={2}>
                    <b>Personal data accessed:</b>
                  </Text>

                  {log.personalData.map(pd => (
                    <Badge
                      key={pd}
                      mr={2}
                      mt={1}
                      colorScheme="blue"
                    >
                      {pd.split('#').pop()}
                    </Badge>
                  ))}

                  {log.values.length > 0 && (
                    <>
                      <Text fontSize="sm" mt={2}>
                        <b>Values:</b>
                      </Text>
                      {log.values.map((v, i) => (
                        <Text key={i} fontSize="sm">
                          • {v}
                        </Text>
                      ))}
                    </>
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
