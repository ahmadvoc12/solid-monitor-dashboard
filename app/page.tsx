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
  HStack,
  Button,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Switch,
  FormControl,
  FormLabel,
  FormHelperText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Checkbox,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useDisclosure,
  IconButton,
  Tooltip,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

import { EditIcon, DeleteIcon, AddIcon, InfoIcon } from '@chakra-ui/icons';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';

import {
  getSolidDataset,
  getThingAll,
  getUrlAll,
  getDatetime,
  getPodUrlAll,
  getStringNoLocaleAll,
  createThing,
  setUrl,
  setDatetime,
  setStringNoLocale,
  buildThing,
  saveSolidDatasetAt,
  getBoolean,
  getInteger,
  createSolidDataset,
} from '@inrupt/solid-client';

/* ======================================================
   CONSTANTS
====================================================== */
const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX = 'https://example.org/solid/audit#';
const ODRL = 'http://www.w3.org/ns/odrl/2/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const FORCE = 'https://w3id.org/force/compliance-report#';

// Paths
const AUDIT_LOG_PATH = 'private/audit/access/log.ttl';
const POLICY_PATH = 'private/audit/access/monitor-policy.ttl';
const PRIVACY_MAPPING_PATH = 'private/audit/dpv-mapping.ttl';

/* ======================================================
   TYPES
====================================================== */
type AuditLog = {
  id: string;
  app: string;
  created: string;
  createdAt: Date | null;
  sensitive: boolean;
  personalData: string[];
  values: string[];
};

type PolicyConstraint = {
  type: 'count' | 'timeWindow' | 'location';
  operator: 'lteq' | 'gteq' | 'eq';
  value: string | number;
  unit?: 'hours' | 'days' | 'km';
};

type Policy = {
  id: string;
  title: string;
  description: string;
  targetField: string;
  active: boolean;
  constraints: PolicyConstraint[];
  createdAt?: Date;
};

type PrivacyMapping = {
  fieldIri: string;
  fieldLabel: string;
  isSensitive: boolean;
  dataCategory: string;
  personalDataType: string;
};

/* ======================================================
   HELPERS
====================================================== */
function extractAppFromResource(resource: string) {
  const idx = resource.indexOf('/public/');
  if (idx === -1) return resource;
  return resource.substring(0, idx + 8);
}

function shortIri(iri: string) {
  return iri.split('#').pop() ?? iri.split('/').pop() ?? iri;
}

function isWithinDays(date: Date, days: number) {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff <= days * 24 * 60 * 60 * 1000;
}

function generatePolicyId() {
  return `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ======================================================
   PAGE
====================================================== */
export default function AuditDashboardPage() {
  const { session, isLoggedIn } = useSolidSession();
  const router = useRouter();
  const toast = useToast();

  // Audit logs state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Policy management state
  const { isOpen: isPolicyModalOpen, onOpen: onPolicyModalOpen, onClose: onPolicyModalClose } = useDisclosure();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [newPolicy, setNewPolicy] = useState<Partial<Policy>>({
    title: '',
    description: '',
    targetField: '',
    active: true,
    constraints: [{ type: 'count', operator: 'lteq', value: 1 }],
  });

  // Privacy settings state
  const { isOpen: isPrivacyModalOpen, onOpen: onPrivacyModalOpen, onClose: onPrivacyModalClose } = useDisclosure();
  const [privacyMappings, setPrivacyMappings] = useState<PrivacyMapping[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  // Filter state
  const [search, setSearch] = useState('');
  const [sensitivity, setSensitivity] = useState<'all' | 'sensitive' | 'normal'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7' | '30'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');

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
          fetch: session.fetch,
        });

        const auditLogUrl = `${podUrls[0]}${AUDIT_LOG_PATH}`;

        const dataset = await getSolidDataset(auditLogUrl, {
          fetch: session.fetch,
        });

        const parsed: AuditLog[] = [];

        getThingAll(dataset).forEach((thing) => {
          const resources = getUrlAll(thing, `${DPV}hasResource`);
          const categories = getUrlAll(thing, `${DPV}hasDataCategory`);
          const personalData = getUrlAll(thing, `${DPV}hasPersonalData`);
          const values = getStringNoLocaleAll(thing, `${EX}hasDataValue`);

          const createdDt = getDatetime(thing, `${DCT}created`) ?? null;

          const sensitive = categories.some(
            (c) => c.includes('Sensitive') || c.includes('Special')
          );

          const app =
            resources.length > 0
              ? extractAppFromResource(resources[0])
              : 'Unknown';

          parsed.push({
            id: thing.url,
            app,
            created: createdDt?.toISOString() ?? '-',
            createdAt: createdDt,
            sensitive,
            personalData: personalData.map(shortIri),
            values,
          });
        });

        setLogs(parsed.reverse());
      } catch (err) {
        console.error(err);
        toast({
          title: 'Failed to load audit log',
          description:
            'Ensure ACL allows read access to private/audit/access/log.ttl',
          status: 'error',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [session, toast]);

  /* =========================
     LOAD POLICIES
  ========================= */
  const loadPolicies = async () => {
    if (!session?.info?.webId) return;
    setLoadingPolicies(true);

    try {
      const podUrls = await getPodUrlAll(session.info.webId!, {
        fetch: session.fetch,
      });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;

      const dataset = await getSolidDataset(policyUrl, {
        fetch: session.fetch,
      });

      const parsed: Policy[] = [];

      getThingAll(dataset).forEach((thing) => {
        // Check if it's a Policy
        const types = getUrlAll(thing, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
        if (!types.some((t) => t.includes('Policy'))) return;

        const title = getStringNoLocaleAll(thing, `${DCT}title`)[0] || 'Untitled Policy';
        const description = getStringNoLocaleAll(thing, `${DCT}description`)[0] || '';
        const target = getUrlAll(thing, `${ODRL}target`)[0] || '';
        const active = getBoolean(thing, `${FORCE}policyActive`) ?? true;
        const createdAt = getDatetime(thing, `${DCT}created`) ?? undefined;

        // Parse constraints (simplified - count only for now)
        const constraints: PolicyConstraint[] = [];
        const permissions = getUrlAll(thing, `${ODRL}permission`);
        
        permissions.forEach((permUrl) => {
          // In real implementation, you'd traverse the permission structure
          // For demo, we add a default count constraint
          constraints.push({ type: 'count', operator: 'lteq', value: 1 });
        });

        if (constraints.length === 0) {
          constraints.push({ type: 'count', operator: 'lteq', value: 1 });
        }

        parsed.push({
          id: thing.url,
          title,
          description,
          targetField: shortIri(target),
          active,
          constraints,
          createdAt,
        });
      });

      setPolicies(parsed);
    } catch (err) {
      console.error('Failed to load policies:', err);
      toast({
        title: 'Could not load policies',
        description: 'Using default policies',
        status: 'warning',
      });
      // Fallback to defaults
      setPolicies([
        {
          id: 'default-bloodtype',
          title: 'Blood Type Access Limit',
          description: 'Limit bloodType access to 1 per session',
          targetField: 'bloodType',
          active: true,
          constraints: [{ type: 'count', operator: 'lteq', value: 1 }],
        },
        {
          id: 'default-identity',
          title: 'Identity Access Limit',
          description: 'Limit identifier access to 3 per session',
          targetField: 'identifier',
          active: true,
          constraints: [{ type: 'count', operator: 'lteq', value: 3 }],
        },
      ]);
    } finally {
      setLoadingPolicies(false);
    }
  };

  /* =========================
     LOAD PRIVACY MAPPINGS
  ========================= */
  const loadPrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    setLoadingPrivacy(true);

    try {
      const podUrls = await getPodUrlAll(session.info.webId!, {
        fetch: session.fetch,
      });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;

      let dataset;
      try {
        dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch });
      } catch {
        // File doesn't exist yet - create empty
        dataset = createSolidDataset();
      }

      const mappings: PrivacyMapping[] = [];
      const fields = new Set<string>();

      getThingAll(dataset).forEach((thing) => {
        const fieldIri = getUrlAll(thing, `${EX}fieldIri`)[0];
        if (!fieldIri) return;

        fields.add(fieldIri);

        mappings.push({
          fieldIri,
          fieldLabel: getStringNoLocaleAll(thing, `${EX}fieldName`)[0] || shortIri(fieldIri),
          isSensitive: getBoolean(thing, `${EX}isSensitive`) ?? false,
          dataCategory: getUrlAll(thing, `${EX}dataCategory`)[0] || 'dpv:PersonalData',
          personalDataType: getUrlAll(thing, `${EX}personalDataType`)[0] || 'dpv:Data',
        });
      });

      // Add common fields if not present
      const commonFields = [
        { iri: 'https://schema.org/bloodType', label: 'Blood Type', sensitive: true, category: 'dpv:SpecialCategoryPersonalData', type: 'dpv:HealthData' },
        { iri: 'https://schema.org/identifier', label: 'Identifier', sensitive: true, category: 'dpv:PersonalData', type: 'dpv:PersonalIdentifier' },
        { iri: 'http://purl.org/dc/terms/created', label: 'Created Timestamp', sensitive: false, category: 'dpv:PersonalData', type: 'dpv:Data' },
        { iri: 'https://schema.org/email', label: 'Email', sensitive: true, category: 'dpv:PersonalData', type: 'dpv:ContactData' },
        { iri: 'https://schema.org/name', label: 'Name', sensitive: false, category: 'dpv:PersonalData', type: 'dpv:NameData' },
      ];

      commonFields.forEach((cf) => {
        if (!fields.has(cf.iri)) {
          mappings.push({
            fieldIri: cf.iri,
            fieldLabel: cf.label,
            isSensitive: cf.sensitive,
            dataCategory: cf.category,
            personalDataType: cf.type,
          });
        }
      });

      setPrivacyMappings(mappings);
      setAvailableFields(Array.from(fields).concat(commonFields.map((f) => f.iri)));
    } catch (err) {
      console.error('Failed to load privacy mappings:', err);
      toast({
        title: 'Could not load privacy settings',
        status: 'warning',
      });
    } finally {
      setLoadingPrivacy(false);
    }
  };

  /* =========================
     SAVE POLICY
  ========================= */
  const savePolicy = async (policy: Policy) => {
    if (!session?.info?.webId) return;

    try {
      const podUrls = await getPodUrlAll(session.info.webId!, {
        fetch: session.fetch,
      });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;

      let dataset;
      try {
        dataset = await getSolidDataset(policyUrl, { fetch: session.fetch });
      } catch {
        dataset = createSolidDataset();
      }

      // Create or update policy thing
      let policyThing = policy.id.startsWith('http')
        ? buildThing({ thing: getThingAll(dataset).find((t) => t.url === policy.id), url: policy.id })
        : createThing({ url: `${podUrls[0]}${POLICY_PATH}#${policy.id}` });

      // Set basic properties
      policyThing = setUrl(policyThing, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', `${ODRL}Policy`);
      policyThing = setStringNoLocale(policyThing, `${DCT}title`, policy.title);
      policyThing = setStringNoLocale(policyThing, `${DCT}description`, policy.description || '');
      policyThing = setDatetime(policyThing, `${DCT}created`, policy.createdAt || new Date());
      policyThing = setUrl(policyThing, `${ODRL}target`, policy.targetField);
      
      // Set active flag
      policyThing = setBoolean(policyThing, `${FORCE}policyActive`, policy.active);

      // TODO: Add constraint serialization (simplified for demo)
      // In production, you'd build the full ODRL constraint structure

      dataset = setThing(dataset, policyThing);

      await saveSolidDatasetAt(policyUrl, dataset, { fetch: session.fetch });

      toast({
        title: 'Policy saved',
        description: `${policy.title} has been updated`,
        status: 'success',
      });

      await loadPolicies(); // Refresh list
    } catch (err) {
      console.error('Failed to save policy:', err);
      toast({
        title: 'Failed to save policy',
        status: 'error',
      });
      throw err;
    }
  };

  /* =========================
     SAVE PRIVACY MAPPINGS
  ========================= */
  const savePrivacyMappings = async () => {
    if (!session?.info?.webId) return;

    try {
      const podUrls = await getPodUrlAll(session.info.webId!, {
        fetch: session.fetch,
      });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;

      let dataset = createSolidDataset();

      privacyMappings.forEach((mapping, idx) => {
        const thing = createThing({ url: `${mappingUrl}#mapping-${idx}` });
        
        setUrl(thing, `${EX}fieldIri`, mapping.fieldIri);
        setStringNoLocale(thing, `${EX}fieldName`, mapping.fieldLabel);
        setBoolean(thing, `${EX}isSensitive`, mapping.isSensitive);
        setUrl(thing, `${EX}dataCategory`, mapping.dataCategory);
        setUrl(thing, `${EX}personalDataType`, mapping.personalDataType);
        
        dataset = setThing(dataset, thing);
      });

      await saveSolidDatasetAt(mappingUrl, dataset, { fetch: session.fetch });

      toast({
        title: 'Privacy settings saved',
        description: 'Field sensitivity mappings have been updated',
        status: 'success',
      });

      // Trigger audit log reload to reflect changes
      // (In production, you'd emit an event or use a callback)
    } catch (err) {
      console.error('Failed to save privacy mappings:', err);
      toast({
        title: 'Failed to save privacy settings',
        status: 'error',
      });
      throw err;
    }
  };

  /* =========================
     FILTERED LOGS
  ========================= */
  const apps = useMemo(() => Array.from(new Set(logs.map((l) => l.app))), [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // sensitivity
      if (sensitivity === 'sensitive' && !log.sensitive) return false;
      if (sensitivity === 'normal' && log.sensitive) return false;

      // app
      if (appFilter !== 'all' && log.app !== appFilter) return false;

      // date
      if (dateFilter !== 'all' && log.createdAt) {
        if (dateFilter === 'today' && !isWithinDays(log.createdAt, 1)) return false;
        if (dateFilter === '7' && !isWithinDays(log.createdAt, 7)) return false;
        if (dateFilter === '30' && !isWithinDays(log.createdAt, 30)) return false;
      }

      // search
      const q = search.toLowerCase();
      if (!q) return true;

      return (
        log.app.toLowerCase().includes(q) ||
        log.personalData.some((p) => p.toLowerCase().includes(q)) ||
        log.values.some((v) => v.toLowerCase().includes(q))
      );
    });
  }, [logs, search, sensitivity, dateFilter, appFilter]);

  /* =========================
     EVENT HANDLERS
  ========================= */
  const handleAddPolicy = () => {
    setEditingPolicy(null);
    setNewPolicy({
      title: '',
      description: '',
      targetField: '',
      active: true,
      constraints: [{ type: 'count', operator: 'lteq', value: 1 }],
    });
    onPolicyModalOpen();
  };

  const handleEditPolicy = (policy: Policy) => {
    setEditingPolicy(policy);
    setNewPolicy({ ...policy });
    onPolicyModalOpen();
  };

  const handleTogglePolicyActive = async (policy: Policy) => {
    const updated = { ...policy, active: !policy.active };
    await savePolicy(updated);
  };

  const handleSavePolicy = async () => {
    if (!newPolicy.title || !newPolicy.targetField) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in policy title and target field',
        status: 'warning',
      });
      return;
    }

    const policyToSave: Policy = {
      id: editingPolicy?.id || generatePolicyId(),
      title: newPolicy.title!,
      description: newPolicy.description || '',
      targetField: newPolicy.targetField!,
      active: newPolicy.active ?? true,
      constraints: newPolicy.constraints || [{ type: 'count', operator: 'lteq', value: 1 }],
      createdAt: editingPolicy?.createdAt || new Date(),
    };

    await savePolicy(policyToSave);
    onPolicyModalClose();
  };

  const handleToggleSensitivity = (fieldIri: string, newValue: boolean) => {
    setPrivacyMappings((prev) =>
      prev.map((m) =>
        m.fieldIri === fieldIri ? { ...m, isSensitive: newValue } : m
      )
    );
  };

  const handleAddField = () => {
    // In production, you'd have a form to add custom fields
    // For demo, we add a placeholder
    const newField: PrivacyMapping = {
      fieldIri: `https://schema.org/custom-${Date.now()}`,
      fieldLabel: 'New Custom Field',
      isSensitive: false,
      dataCategory: 'dpv:PersonalData',
      personalDataType: 'dpv:Data',
    };
    setPrivacyMappings((prev) => [...prev, newField]);
  };

  /* =========================
     UI
  ========================= */
  return (
    <Box maxW="7xl" mx="auto" py={10} px={4}>
      <Flex justify="space-between" align="center" mb={4} wrap="wrap" gap={3}>
        <Text fontSize="2xl" fontWeight="bold">
          Solid Audit Dashboard
        </Text>
        <HStack wrap="wrap">
          <Badge colorScheme="purple">DPV · READ ONLY</Badge>
          
          {/* ACTION BUTTONS */}
          <Button
            size="sm"
            colorScheme="blue"
            leftIcon={<EditIcon />}
            onClick={() => {
              loadPolicies();
              onPolicyModalOpen();
            }}
          >
            Policy Settings
          </Button>
          
          <Button
            size="sm"
            colorScheme="green"
            leftIcon={<InfoIcon />}
            onClick={() => {
              loadPrivacyMappings();
              onPrivacyModalOpen();
            }}
          >
            Privacy Settings
          </Button>
        </HStack>
      </Flex>

      <Divider mb={6} />

      {/* FILTER BAR */}
      <VStack spacing={4} mb={6} align="stretch">
        <Input
          placeholder="Search application, data, or value..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <HStack spacing={4} wrap="wrap">
          <Select
            value={sensitivity}
            onChange={(e) => setSensitivity(e.target.value as any)}
            size="sm"
          >
            <option value="all">All Data</option>
            <option value="sensitive">Sensitive Only</option>
            <option value="normal">Non-Sensitive Only</option>
          </Select>

          <Select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            size="sm"
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
          </Select>

          <Select
            value={appFilter}
            onChange={(e) => setAppFilter(e.target.value)}
            size="sm"
          >
            <option value="all">All Applications</option>
            {apps.map((app) => (
              <option key={app} value={app}>
                {app}
              </option>
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
            key={log.id || i}
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

              <Text fontSize="sm">
                <b>Access time:</b>
                <br />
                {log.created}
              </Text>

              <Badge colorScheme={log.sensitive ? 'red' : 'green'}>
                {log.sensitive ? 'Sensitive Personal Data' : 'Non-Sensitive Data'}
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

      {/* ======================================================
          POLICY SETTINGS MODAL
      ====================================================== */}
      <Modal isOpen={isPolicyModalOpen} onClose={onPolicyModalClose} size="4xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Policy Management</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {/* Add New Policy Form */}
            <Accordion allowToggle defaultIndex={editingPolicy ? 0 : -1}>
              <AccordionItem>
                <AccordionButton>
                  <Box flex="1" textAlign="left" fontWeight="bold">
                    {editingPolicy ? '✏️ Edit Policy' : '➕ Add New Policy'}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <VStack spacing={4} align="stretch">
                    <FormControl isRequired>
                      <FormLabel>Policy Title</FormLabel>
                      <Input
                        value={newPolicy.title || ''}
                        onChange={(e) =>
                          setNewPolicy((p) => ({ ...p, title: e.target.value }))
                        }
                        placeholder="e.g., Blood Type Access Limit"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Description</FormLabel>
                      <Input
                        value={newPolicy.description || ''}
                        onChange={(e) =>
                          setNewPolicy((p) => ({ ...p, description: e.target.value }))
                        }
                        placeholder="Describe what this policy controls"
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Target Field</FormLabel>
                      <Select
                        value={newPolicy.targetField || ''}
                        onChange={(e) =>
                          setNewPolicy((p) => ({ ...p, targetField: e.target.value }))
                        }
                        placeholder="Select a field to protect"
                      >
                        {availableFields.map((field) => (
                          <option key={field} value={field}>
                            {shortIri(field)}
                          </option>
                        ))}
                      </Select>
                      <FormHelperText>
                        The data field this policy will monitor
                      </FormHelperText>
                    </FormControl>

                    {/* Constraints Section */}
                    <Box>
                      <Text fontWeight="bold" mb={2}>
                        Constraints
                      </Text>
                      <VStack spacing={3} align="stretch">
                        {newPolicy.constraints?.map((constraint, idx) => (
                          <HStack key={idx} spacing={3} align="start">
                            <Select
                              value={constraint.type}
                              onChange={(e) => {
                                const newConstraints = [...(newPolicy.constraints || [])];
                                newConstraints[idx] = {
                                  ...constraint,
                                  type: e.target.value as PolicyConstraint['type'],
                                };
                                setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                              }}
                              size="sm"
                              width="150px"
                            >
                              <option value="count">Access Count</option>
                              <option value="timeWindow">Time Window</option>
                              <option value="location">Location</option>
                            </Select>

                            {constraint.type === 'count' && (
                              <>
                                <Select
                                  value={constraint.operator}
                                  onChange={(e) => {
                                    const newConstraints = [...(newPolicy.constraints || [])];
                                    newConstraints[idx] = {
                                      ...constraint,
                                      operator: e.target.value as PolicyConstraint['operator'],
                                    };
                                    setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                                  }}
                                  size="sm"
                                  width="100px"
                                >
                                  <option value="lteq">≤</option>
                                  <option value="gteq">≥</option>
                                  <option value="eq">=</option>
                                </Select>
                                <NumberInput
                                  value={constraint.value as number}
                                  onChange={(_, val) => {
                                    const newConstraints = [...(newPolicy.constraints || [])];
                                    newConstraints[idx] = { ...constraint, value: val };
                                    setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                                  }}
                                  size="sm"
                                  width="80px"
                                >
                                  <NumberInputField />
                                  <NumberInputStepper>
                                    <NumberIncrementStepper />
                                    <NumberDecrementStepper />
                                  </NumberInputStepper>
                                </NumberInput>
                                <Text fontSize="sm" color="gray.600">
                                  accesses
                                </Text>
                              </>
                            )}

                            {constraint.type === 'timeWindow' && (
                              <>
                                <NumberInput
                                  value={constraint.value as number}
                                  onChange={(_, val) => {
                                    const newConstraints = [...(newPolicy.constraints || [])];
                                    newConstraints[idx] = { ...constraint, value: val };
                                    setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                                  }}
                                  size="sm"
                                  width="80px"
                                >
                                  <NumberInputField />
                                  <NumberInputStepper>
                                    <NumberIncrementStepper />
                                    <NumberDecrementStepper />
                                  </NumberInputStepper>
                                </NumberInput>
                                <Select
                                  value={constraint.unit}
                                  onChange={(e) => {
                                    const newConstraints = [...(newPolicy.constraints || [])];
                                    newConstraints[idx] = {
                                      ...constraint,
                                      unit: e.target.value as 'hours' | 'days',
                                    };
                                    setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                                  }}
                                  size="sm"
                                  width="100px"
                                >
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </Select>
                                <Text fontSize="sm" color="gray.600">
                                  access window
                                </Text>
                              </>
                            )}

                            {constraint.type === 'location' && (
                              <>
                                <Input
                                  value={constraint.value as string}
                                  onChange={(e) => {
                                    const newConstraints = [...(newPolicy.constraints || [])];
                                    newConstraints[idx] = { ...constraint, value: e.target.value };
                                    setNewPolicy((p) => ({ ...p, constraints: newConstraints }));
                                  }}
                                  size="sm"
                                  placeholder="Country code (e.g., ID, US)"
                                  width="120px"
                                />
                                <Text fontSize="sm" color="gray.600">
                                  allowed location
                                </Text>
                              </>
                            )}
                          </HStack>
                        ))}
                      </VStack>
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<AddIcon />}
                        mt={2}
                        onClick={() => {
                          setNewPolicy((p) => ({
                            ...p,
                            constraints: [
                              ...(p.constraints || []),
                              { type: 'count', operator: 'lteq', value: 1 },
                            ],
                          }));
                        }}
                      >
                        Add Another Constraint
                      </Button>
                    </Box>

                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb="0">Enable Policy</FormLabel>
                      <Switch
                        isChecked={newPolicy.active}
                        onChange={(e) =>
                          setNewPolicy((p) => ({ ...p, active: e.target.checked }))
                        }
                      />
                    </FormControl>

                    <HStack justify="flex-end">
                      <Button variant="ghost" onClick={onPolicyModalClose}>
                        Cancel
                      </Button>
                      <Button colorScheme="blue" onClick={handleSavePolicy}>
                        {editingPolicy ? 'Update Policy' : 'Create Policy'}
                      </Button>
                    </HStack>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>

            {/* Existing Policies List */}
            <Box mt={6}>
              <Text fontWeight="bold" mb={3}>
                Existing Policies
              </Text>
              {loadingPolicies ? (
                <Spinner />
              ) : (
                <Table variant="simple" size="sm">
                  <Thead>
                    <Tr>
                      <Th>Policy</Th>
                      <Th>Target</Th>
                      <Th>Constraints</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {policies.map((policy) => (
                      <Tr key={policy.id}>
                        <Td>
                          <Text fontWeight="medium">{policy.title}</Text>
                          <Text fontSize="xs" color="gray.600">
                            {policy.description}
                          </Text>
                        </Td>
                        <Td>
                          <Tag size="sm" colorScheme="purple">
                            {policy.targetField}
                          </Tag>
                        </Td>
                        <Td>
                          <VStack align="start" spacing={1}>
                            {policy.constraints.map((c, idx) => (
                              <Text key={idx} fontSize="xs">
                                {c.type === 'count' && `Count ${c.operator} ${c.value}`}
                                {c.type === 'timeWindow' &&
                                  `Window: ${c.value} ${c.unit}`}
                                {c.type === 'location' && `Location: ${c.value}`}
                              </Text>
                            ))}
                          </VStack>
                        </Td>
                        <Td>
                          <Switch
                            size="sm"
                            isChecked={policy.active}
                            onChange={() => handleTogglePolicyActive(policy)}
                          />
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            <Tooltip label="Edit policy">
                              <IconButton
                                size="sm"
                                icon={<EditIcon />}
                                aria-label="Edit"
                                onClick={() => handleEditPolicy(policy)}
                              />
                            </Tooltip>
                            <Tooltip label="Delete policy">
                              <IconButton
                                size="sm"
                                icon={<DeleteIcon />}
                                aria-label="Delete"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => {
                                  // TODO: Implement delete
                                  toast({
                                    title: 'Delete not implemented',
                                    status: 'info',
                                  });
                                }}
                              />
                            </Tooltip>
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={onPolicyModalClose}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ======================================================
          PRIVACY SETTINGS MODAL
      ====================================================== */}
      <Modal isOpen={isPrivacyModalOpen} onClose={onPrivacyModalClose} size="2xl">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Privacy Data Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="info" mb={4}>
              <AlertIcon />
              Mark which fields contain sensitive personal data. These settings
              are stored in your Pod at <code>{PRIVACY_MAPPING_PATH}</code>.
            </Alert>

            {loadingPrivacy ? (
              <Spinner />
            ) : (
              <VStack spacing={4} align="stretch" maxH="60vh" overflowY="auto">
                {privacyMappings.map((mapping, idx) => (
                  <Box
                    key={mapping.fieldIri + idx}
                    p={4}
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="gray.200"
                  >
                    <HStack justify="space-between" wrap="wrap" gap={2}>
                      <VStack align="start" spacing={1} flex={1}>
                        <Text fontWeight="medium">{mapping.fieldLabel}</Text>
                        <Text fontSize="xs" color="gray.600" wordBreak="break-all">
                          {mapping.fieldIri}
                        </Text>
                        <HStack spacing={2}>
                          <Tag size="sm" colorScheme="blue">
                            {shortIri(mapping.dataCategory)}
                          </Tag>
                          <Tag size="sm" colorScheme="gray">
                            {shortIri(mapping.personalDataType)}
                          </Tag>
                        </HStack>
                      </VStack>

                      <FormControl display="flex" alignItems="center" width="auto">
                        <Switch
                          isChecked={mapping.isSensitive}
                          onChange={(e) =>
                            handleToggleSensitivity(mapping.fieldIri, e.target.checked)
                          }
                          colorScheme={mapping.isSensitive ? 'red' : 'green'}
                        />
                        <FormLabel mb="0" ml={3} fontSize="sm">
                          {mapping.isSensitive ? 'Sensitive' : 'Normal'}
                        </FormLabel>
                      </FormControl>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}

            <Button
              size="sm"
              variant="outline"
              leftIcon={<AddIcon />}
              mt={4}
              onClick={handleAddField}
            >
              Add Custom Field
            </Button>
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={onPrivacyModalClose}>
                Cancel
              </Button>
              <Button colorScheme="green" onClick={savePrivacyMappings}>
                Save Privacy Settings
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}