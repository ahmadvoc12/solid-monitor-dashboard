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
  Card,
  CardBody,
  CardHeader,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Link,
  Code,
  Tooltip as ChakraTooltip,
} from '@chakra-ui/react';

import {
  EditIcon,
  DeleteIcon,
  AddIcon,
  InfoIcon,
  ViewIcon,
  ExternalLinkIcon,
} from '@chakra-ui/icons';

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
  saveSolidDatasetAt,
  getBoolean,
  getInteger,
  createSolidDataset,
  setThing,
  setBoolean,
  setInteger,
  ThingPersisted,
} from '@inrupt/solid-client';

/* ======================================================
   CONSTANTS & ONTOLOGY PREFIXES
====================================================== */
const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX = 'https://example.org/solid/audit#';
const ODRL = 'http://www.w3.org/ns/odrl/2/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const FORCE = 'https://w3id.org/force/compliance-report#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

/* ======================================================
   ✅ CORRECTED PATHS
====================================================== */
const ACCESS_LOG_PATH = 'private/audit/access/access-log.ttl';
const POLICY_PATH = 'private/audit/access/monitor-policy.ttl';
const PRIVACY_MAPPING_PATH = 'private/dpv-mapping.ttl';

/* ======================================================
   FIELD LABEL MAPPING
====================================================== */
const FIELD_LABELS: Record<string, string> = {
  'https://schema.org/bloodType': 'Blood Type',
  'https://schema.org/identifier': 'Identifier',
  'http://purl.org/dc/terms/created': 'Created Timestamp',
  'https://schema.org/email': 'Email',
  'https://schema.org/name': 'Name',
  'https://schema.org/age': 'Age',
  'https://schema.org/gender': 'Gender',
  'https://schema.org/hairColor': 'Hair Colour',
};

/* ======================================================
   ✅ ROBUST CLEAN IRI
====================================================== */
function cleanIRI(iri: string): string {
  if (!iri || typeof iri !== 'string') return iri || '';
  return iri
    .replace(/<\s+/g, '<')
    .replace(/\s+>/g, '>')
    .replace(/\s+$/g, '')
    .replace(/^\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getFieldLabel(iri: string): string {
  const cleanIri = cleanIRI(iri).replace(/^<|>$/g, '');
  return FIELD_LABELS[cleanIri] || cleanIri.split('#').pop() || cleanIri.split('/').pop() || 'Unknown Field';
}

function shortIri(iri: string) {
  return iri.split('#').pop() ?? iri.split('/').pop() ?? iri;
}

function isWithinDays(date: Date | null, days: number) {
  if (!date) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff <= days * 24 * 60 * 60 * 1000;
}

function generatePolicyId() {
  return `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ======================================================
   TYPES
====================================================== */
type AccessedField = {
  fieldIri: string;
  fieldName: string;
  fieldValue: string;
  isSensitive: boolean;
  dataCategory: string;
  personalDataType: string;
};

type PolicyEvaluation = {
  evaluatedPolicy: string;
  evaluationResult: 'ALLOWED' | 'VIOLATION';
  evaluationReason: string;
  targetAsset: string;
};

type FieldViolation = {
  violatedField: string;
  violatedPolicy: string;
  observedCount: number;
  allowedLimit: number;
};

type AccessLogEntry = {
  id: string;
  accessId: string;
  startedAt: Date | null;
  app: string;
  decision: 'ALLOWED' | 'VIOLATION';
  accessMethod: string;
  accessedResource: string;
  fields: AccessedField[];
  policyEvaluations: PolicyEvaluation[];
  violations: FieldViolation[];
  hasSensitiveData: boolean;
  violatedPolicies: string[];
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
  targetIRI?: string;
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
  const segment = resource.substring(0, idx).split('/').filter(Boolean).pop();
  return segment || 'Unknown';
}

/* ======================================================
   ✅ PARSE ACCESS LOG ENTRY
====================================================== */
function parseAccessLogEntry(thing: any): AccessLogEntry | null {
  try {
    const types = getUrlAll(thing, `${RDF}type`);
    if (!types.some((t: string) => t.includes('Activity'))) return null;
    
    const decision = getStringNoLocaleAll(thing, `${FORCE}decision`)[0];
    if (!decision) return null;
    
    const accessId = thing.url.split('#').pop() ?? thing.url;
    const startedAt = getDatetime(thing, `${PROV}startedAtTime`) ?? null;
    const app = getStringNoLocaleAll(thing, `${PROV}wasAssociatedWith`)[0]?.split('#').pop() ?? 'Unknown';
    const accessMethod = getStringNoLocaleAll(thing, `${FORCE}accessMethod`)[0] ?? 'GET';
    const accessedResource = cleanIRI(getUrlAll(thing, `${FORCE}accessedResource`)[0] ?? '');
    
    // Parse fields from hasFieldsBundle
    const fields: AccessedField[] = [];
    const fieldsBundle = getUrlAll(thing, `${FORCE}hasFieldsBundle`)[0];
    if (fieldsBundle && thing.dataset) {
      getThingAll(thing.dataset).forEach((fieldThing: any) => {
        const fieldTypes = getUrlAll(fieldThing, `${RDF}type`);
        if (!fieldTypes.some((t: string) => t.includes('AccessedDataField'))) return;
        const belongsToBundle = getUrlAll(fieldThing, `${FORCE}belongsToBundle`)[0];
        if (belongsToBundle !== fieldsBundle) return;
        
        const rawIri = getUrlAll(fieldThing, `${FORCE}fieldIRI`)[0] ?? '';
        const cleanIri = cleanIRI(rawIri);
        
        fields.push({
          fieldIri: cleanIri,
          fieldName: getFieldLabel(cleanIri),
          fieldValue: getStringNoLocaleAll(fieldThing, `${FORCE}fieldValue`)[0] ?? '',
          isSensitive: getBoolean(fieldThing, `${FORCE}isSensitive`) ?? false,
          dataCategory: getUrlAll(fieldThing, `${FORCE}dataCategory`)[0] ?? 'dpv:PersonalData',
          personalDataType: getUrlAll(fieldThing, `${FORCE}personalDataType`)[0] ?? 'dpv:Data',
        });
      });
    }
    
    // Parse policy evaluations from hasPolicyBundle
    const policyEvaluations: PolicyEvaluation[] = [];
    const policyBundle = getUrlAll(thing, `${FORCE}hasPolicyBundle`)[0];
    if (policyBundle && thing.dataset) {
      getThingAll(thing.dataset).forEach((evalThing: any) => {
        const evalTypes = getUrlAll(evalThing, `${RDF}type`);
        if (!evalTypes.some((t: string) => t.includes('PolicyEvaluation'))) return;
        const belongsToBundle = getUrlAll(evalThing, `${FORCE}belongsToBundle`)[0];
        if (belongsToBundle !== policyBundle) return;
        policyEvaluations.push({
          evaluatedPolicy: cleanIRI(getUrlAll(evalThing, `${FORCE}evaluatedPolicy`)[0] ?? ''),
          evaluationResult: (getStringNoLocaleAll(evalThing, `${FORCE}evaluationResult`)[0] as 'ALLOWED' | 'VIOLATION') ?? 'ALLOWED',
          evaluationReason: getStringNoLocaleAll(evalThing, `${FORCE}evaluationReason`)[0] ?? '',
          targetAsset: cleanIRI(getUrlAll(evalThing, `${FORCE}targetAsset`)[0] ?? ''),
        });
      });
    }
    
    // Parse violations from hasViolationBundle
    const violations: FieldViolation[] = [];
    const violatedPolicies: string[] = [];
    const violationBundle = getUrlAll(thing, `${FORCE}hasViolationBundle`)[0];
    if (violationBundle && thing.dataset) {
      getThingAll(thing.dataset).forEach((violThing: any) => {
        const violTypes = getUrlAll(violThing, `${RDF}type`);
        if (!violTypes.some((t: string) => t.includes('PolicyViolation'))) return;
        const belongsToBundle = getUrlAll(violThing, `${FORCE}belongsToBundle`)[0];
        if (belongsToBundle !== violationBundle) return;
        
        getUrlAll(violThing, `${FORCE}violatedPolicy`).forEach((p: string) => violatedPolicies.push(cleanIRI(p)));
        
        getUrlAll(violThing, `${FORCE}hasFieldViolation`).forEach((fvUrl: string) => {
          const fvThing = getThingAll(thing.dataset).find((t: any) => t.url === fvUrl);
          if (fvThing) {
            violations.push({
              violatedField: cleanIRI(getUrlAll(fvThing, `${FORCE}violatedField`)[0] ?? ''),
              violatedPolicy: cleanIRI(getUrlAll(fvThing, `${FORCE}violatedPolicy`)[0] ?? ''),
              observedCount: getInteger(fvThing, `${FORCE}observedCount`) ?? 0,
              allowedLimit: getInteger(fvThing, `${FORCE}allowedLimit`) ?? 0,
            });
          }
        });
      });
    }
    
    return {
      id: thing.url,
      accessId,
      startedAt,
      app,
      decision: decision as 'ALLOWED' | 'VIOLATION',
      accessMethod,
      accessedResource,
      fields,
      policyEvaluations,
      violations,
      hasSensitiveData: fields.some((f) => f.isSensitive),
      violatedPolicies,
    };
  } catch (err) {
    console.error('Error parsing access log entry:', err);
    return null;
  }
}

/* ======================================================
   PAGE COMPONENT
====================================================== */
export default function AuditDashboardPage() {
  const { session, isLoggedIn } = useSolidSession();
  const router = useRouter();
  const toast = useToast();

  const [logs, setLogs] = useState<AccessLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { isOpen: isPolicyModalOpen, onOpen: onPolicyModalOpen, onClose: onPolicyModalClose } = useDisclosure();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [newPolicy, setNewPolicy] = useState<Partial<Policy>>({
    title: '',
    description: '',
    targetField: '',
    targetIRI: '',
    active: true,
    constraints: [{ type: 'count', operator: 'lteq', value: 1 }],
  });

  const { isOpen: isPrivacyModalOpen, onOpen: onPrivacyModalOpen, onClose: onPrivacyModalClose } = useDisclosure();
  const [privacyMappings, setPrivacyMappings] = useState<PrivacyMapping[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [sensitivity, setSensitivity] = useState<'all' | 'sensitive' | 'normal'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7' | '30'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'allowed' | 'violation'>('all');

  const stats = useMemo(() => {
    const total = logs.length;
    const violations = logs.filter((l) => l.decision === 'VIOLATION').length;
    const sensitive = logs.filter((l) => l.hasSensitiveData).length;
    const apps = new Set(logs.map((l) => l.app));
    return { total, violations, sensitive, apps: apps.size };
  }, [logs]);

  useEffect(() => {
    if (!isLoggedIn) router.replace('/sign-in');
  }, [isLoggedIn, router]);

  /* =========================
     ✅ LOAD ACCESS LOG
  ========================= */
  useEffect(() => {
    if (!session?.info?.webId) return;
    (async () => {
      try {
        const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
        const accessLogUrl = `${podUrls[0]}${ACCESS_LOG_PATH}`;
        
        const dataset = await getSolidDataset(accessLogUrl, { fetch: session.fetch });
        
        if (!dataset || typeof dataset !== 'object' || !('graphs' in dataset)) {
          console.warn('Invalid dataset structure, using empty logs');
          setLogs([]);
          setLoading(false);
          return;
        }
        
        const parsed: AccessLogEntry[] = [];
        
        getThingAll(dataset).forEach((thing) => {
          try {
            const entry = parseAccessLogEntry(thing);
            if (entry) parsed.push(entry);
          } catch (parseErr) {
            console.warn('Failed to parse individual entry:', parseErr);
          }
        });
        
        parsed.sort((a, b) => {
          if (!a.startedAt) return 1;
          if (!b.startedAt) return -1;
          return b.startedAt.getTime() - a.startedAt.getTime();
        });
        
        setLogs(parsed);
      } catch (err: any) {
        console.error('Failed to load access log:', err);
        
        let errorMsg = 'Failed to load audit log';
        if (err?.status === 401 || err?.status === 403) {
          errorMsg = 'Access denied. Ensure ACL allows read access to private/audit/access/access-log.ttl';
        } else if (err?.status === 404) {
          errorMsg = 'Audit log file not found. It will be created after first access.';
        } else if (err?.message?.includes('graphs')) {
          errorMsg = 'Invalid data format. The file may be corrupted.';
        }
        
        toast({
          title: 'Failed to load audit log',
          description: errorMsg,
          status: 'error',
          duration: 6000,
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [session, toast]);

  /* =========================
     ✅ LOAD POLICIES
  ========================= */
  const loadPolicies = async () => {
    if (!session?.info?.webId) return;
    setLoadingPolicies(true);
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;
      const dataset = await getSolidDataset(policyUrl, { fetch: session.fetch });
      const parsed: Policy[] = [];
      
      getThingAll(dataset).forEach((thing: any) => {
        const types = getUrlAll(thing, `${RDF}type`);
        if (!types.some((t: string) => t.includes('Policy'))) return;
        
        const title = getStringNoLocaleAll(thing, `${DCT}title`)[0] || 'Untitled Policy';
        const description = getStringNoLocaleAll(thing, `${DCT}description`)[0] || '';
        const target = cleanIRI(getUrlAll(thing, `${ODRL}target`)[0] || '');
        const active = getBoolean(thing, `${FORCE}policyActive`) ?? true;
        const createdAt = getDatetime(thing, `${DCT}created`) ?? undefined;
        
        let constraintValue = 1;
        const permissions = getUrlAll(thing, `${ODRL}permission`);
        permissions.forEach((permUrl: string) => {
          const permThing = getThingAll(dataset).find((t: any) => t.url === permUrl);
          if (permThing) {
            const constraints = getUrlAll(permThing, `${ODRL}constraint`);
            constraints.forEach((cUrl: string) => {
              const cThing = getThingAll(dataset).find((t: any) => t.url === cUrl);
              if (cThing) {
                const val = getInteger(cThing, `${ODRL}rightOperand`);
                if (val !== null) constraintValue = val;
              }
            });
          }
        });
        
        const constraints: PolicyConstraint[] = [{ type: 'count', operator: 'lteq', value: constraintValue }];
        
        parsed.push({
          id: thing.url,
          title,
          description,
          targetField: shortIri(target),
          targetIRI: target,
          active,
          constraints,
          createdAt,
        });
      });
      setPolicies(parsed);
    } catch (err) {
      console.error('Failed to load policies:', err);
      setPolicies([
        { id: 'default-bloodtype', title: 'Blood Type Access Limit', description: 'Limit bloodType access to 1 per session', targetField: 'bloodType', targetIRI: 'https://schema.org/bloodType', active: true, constraints: [{ type: 'count', operator: 'lteq', value: 1 }] },
        { id: 'default-identity', title: 'Identity Access Limit', description: 'Limit identifier access to 3 per session', targetField: 'identifier', targetIRI: 'https://schema.org/identifier', active: true, constraints: [{ type: 'count', operator: 'lteq', value: 3 }] },
      ]);
    } finally {
      setLoadingPolicies(false);
    }
  };

  /* =========================
     ✅ LOAD PRIVACY MAPPINGS
  ========================= */
  const loadPrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    setLoadingPrivacy(true);
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;
      let dataset;
      try { dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch }); } catch { dataset = createSolidDataset(); }
      
      const mappings: PrivacyMapping[] = [];
      const fields = new Set<string>();
      
      getThingAll(dataset).forEach((thing: any) => {
        const fieldIri = cleanIRI(getUrlAll(thing, `${EX}fieldIri`)[0]);
        if (!fieldIri) return;
        fields.add(fieldIri);
        mappings.push({
          fieldIri,
          fieldLabel: getFieldLabel(fieldIri),
          isSensitive: getBoolean(thing, `${EX}isSensitive`) ?? false,
          dataCategory: getUrlAll(thing, `${EX}dataCategory`)[0] || 'dpv:PersonalData',
          personalDataType: getUrlAll(thing, `${EX}personalDataType`)[0] || 'dpv:Data',
        });
      });
      
      Object.entries(FIELD_LABELS).forEach(([iri, label]) => {
        const cleanIri = cleanIRI(iri);
        if (!fields.has(cleanIri)) {
          mappings.push({
            fieldIri: cleanIri,
            fieldLabel: label,
            isSensitive: true,
            dataCategory: 'dpv:PersonalData',
            personalDataType: 'dpv:Data',
          });
        }
      });
      
      setPrivacyMappings(mappings);
      setAvailableFields(Object.keys(FIELD_LABELS).map(cleanIRI));
    } catch (err) {
      console.error('Failed to load privacy mappings:', err);
    } finally {
      setLoadingPrivacy(false);
    }
  };

  /* =========================
     ✅ SAVE POLICY
  ========================= */
  const savePolicy = async (policy: Policy) => {
    if (!session?.info?.webId) return;
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;
      let dataset;
      try { dataset = await getSolidDataset(policyUrl, { fetch: session.fetch }); } catch { dataset = createSolidDataset(); }
      
      let policyThing: ThingPersisted;
      if (policy.id.startsWith('http')) {
        const existingThing = getThingAll(dataset).find((t) => t.url === policy.id);
        policyThing = existingThing ?? createThing({ url: policy.id });
      } else {
        policyThing = createThing({ url: `${podUrls[0]}${POLICY_PATH}#${policy.id}` });
      }
      
      policyThing = setUrl(policyThing, `${RDF}type`, `${ODRL}Policy`);
      policyThing = setStringNoLocale(policyThing, `${DCT}title`, policy.title);
      policyThing = setStringNoLocale(policyThing, `${DCT}description`, policy.description || '');
      policyThing = setDatetime(policyThing, `${DCT}created`, policy.createdAt || new Date());
      policyThing = setUrl(policyThing, `${ODRL}target`, policy.targetIRI || policy.targetField);
      policyThing = setBoolean(policyThing, `${FORCE}policyActive`, policy.active);
      
      const constraint = policy.constraints[0];
      if (constraint?.type === 'count') {
        let constraintThing = createThing({ url: `${policyThing.url}#constraint-${Date.now()}` });
        constraintThing = setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}count`);
        constraintThing = setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
        constraintThing = setInteger(constraintThing, `${ODRL}rightOperand`, Number(constraint.value));
        
        let permissionThing = createThing({ url: `${policyThing.url}#permission-${Date.now()}` });
        permissionThing = setUrl(permissionThing, `${ODRL}assigner`, `${EX}pod-owner`);
        permissionThing = setUrl(permissionThing, `${ODRL}assignee`, `${EX}any-app`);
        permissionThing = setUrl(permissionThing, `${ODRL}action`, `${ODRL}read`);
        permissionThing = setUrl(permissionThing, `${ODRL}constraint`, constraintThing.url);
        
        policyThing = setUrl(policyThing, `${ODRL}permission`, permissionThing.url);
        
        dataset = setThing(dataset, constraintThing);
        dataset = setThing(dataset, permissionThing);
      }
      
      dataset = setThing(dataset, policyThing);
      await saveSolidDatasetAt(policyUrl, dataset, { fetch: session.fetch });
      
      toast({ title: 'Policy saved', description: `${policy.title} has been updated`, status: 'success' });
      await loadPolicies();
    } catch (err) {
      console.error('Failed to save policy:', err);
      toast({ title: 'Failed to save policy', status: 'error' });
      throw err;
    }
  };

  /* =========================
     ✅ SAVE PRIVACY MAPPINGS
  ========================= */
  const savePrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;
      let dataset = createSolidDataset();
      
      privacyMappings.forEach((mapping, idx) => {
        let thing = createThing({ url: `${mappingUrl}#mapping-${idx}` });
        thing = setUrl(thing, `${EX}fieldIri`, mapping.fieldIri);
        thing = setStringNoLocale(thing, `${EX}fieldName`, mapping.fieldLabel);
        thing = setBoolean(thing, `${EX}isSensitive`, mapping.isSensitive);
        thing = setUrl(thing, `${EX}dataCategory`, mapping.dataCategory);
        thing = setUrl(thing, `${EX}personalDataType`, mapping.personalDataType);
        dataset = setThing(dataset, thing);
      });
      
      await saveSolidDatasetAt(mappingUrl, dataset, { fetch: session.fetch });
      toast({ title: 'Privacy settings saved', description: 'Field sensitivity mappings have been updated', status: 'success' });
    } catch (err: any) {
      console.error('Failed to save privacy mappings:', err);
      if (err?.errorCode === 'H412' || err?.statusCode === 412) {
        toast({
          title: 'Failed to save privacy settings',
          description: 'Precondition failed. The file may have been modified by another process. Please reload and try again.',
          status: 'error',
          duration: 6000,
        });
      } else {
        toast({ title: 'Failed to save privacy settings', status: 'error' });
      }
      throw err;
    }
  };

  const apps = useMemo(() => Array.from(new Set(logs.map((l) => l.app))), [logs]);
  
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (sensitivity === 'sensitive' && !log.hasSensitiveData) return false;
      if (sensitivity === 'normal' && log.hasSensitiveData) return false;
      if (appFilter !== 'all' && log.app !== appFilter) return false;
      if (decisionFilter !== 'all') {
        if (decisionFilter === 'allowed' && log.decision !== 'ALLOWED') return false;
        if (decisionFilter === 'violation' && log.decision !== 'VIOLATION') return false;
      }
      if (dateFilter !== 'all' && log.startedAt) {
        if (dateFilter === 'today' && !isWithinDays(log.startedAt, 1)) return false;
        if (dateFilter === '7' && !isWithinDays(log.startedAt, 7)) return false;
        if (dateFilter === '30' && !isWithinDays(log.startedAt, 30)) return false;
      }
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        log.app.toLowerCase().includes(q) ||
        log.fields.some((f) => f.fieldName.toLowerCase().includes(q) || f.fieldValue.toLowerCase().includes(q)) ||
        log.policyEvaluations.some((p) => p.evaluationReason.toLowerCase().includes(q))
      );
    });
  }, [logs, search, sensitivity, dateFilter, appFilter, decisionFilter]);

  const handleAddPolicy = () => {
    setEditingPolicy(null);
    setNewPolicy({ title: '', description: '', targetField: '', targetIRI: '', active: true, constraints: [{ type: 'count', operator: 'lteq', value: 1 }] });
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
      toast({ title: 'Missing required fields', description: 'Please fill in policy title and target field', status: 'warning' });
      return;
    }
    const policyToSave: Policy = {
      id: editingPolicy?.id || generatePolicyId(),
      title: newPolicy.title!,
      description: newPolicy.description || '',
      targetField: newPolicy.targetField!,
      targetIRI: editingPolicy?.targetIRI || newPolicy.targetField,
      active: newPolicy.active ?? true,
      constraints: newPolicy.constraints || [{ type: 'count', operator: 'lteq', value: 1 }],
      createdAt: editingPolicy?.createdAt || new Date(),
    };
    await savePolicy(policyToSave);
    onPolicyModalClose();
  };

  const handleToggleSensitivity = (fieldIri: string, newValue: boolean) => {
    setPrivacyMappings((prev) => prev.map((m) => (m.fieldIri === fieldIri ? { ...m, isSensitive: newValue } : m)));
  };

  const handleAddFieldFromDropdown = (fieldIri: string) => {
    const cleanIri = cleanIRI(fieldIri);
    const label = FIELD_LABELS[cleanIri] || getFieldLabel(cleanIri);
    const newField: PrivacyMapping = {
      fieldIri: cleanIri,
      fieldLabel: label,
      isSensitive: true,
      dataCategory: 'dpv:PersonalData',
      personalDataType: 'dpv:Data',
    };
    setPrivacyMappings((prev) => {
      if (prev.find((p) => p.fieldIri === cleanIri)) return prev;
      return [...prev, newField];
    });
  };

  const SchemaVisualization = ({ fields }: { fields: AccessedField[] }) => {
    if (fields.length === 0) return <Text fontSize="sm" color="gray.500">No schema data available</Text>;
    return (
      <VStack align="stretch" spacing={2} maxH="200px" overflowY="auto">
        {fields.map((field) => (
          <Box key={field.fieldIri} p={2} borderRadius="md" bg={field.isSensitive ? 'red.50' : 'gray.50'} borderLeft="4px solid" borderColor={field.isSensitive ? 'red.400' : 'gray.400'}>
            <Flex justify="space-between" align="center">
              <VStack align="start" spacing={0}>
                <Text fontWeight="medium" fontSize="sm">{field.fieldName}</Text>
                <Text fontSize="xs" color="gray.600">{shortIri(field.fieldIri)}</Text>
              </VStack>
              <HStack spacing={2}>
                <Tag size="sm" colorScheme={field.isSensitive ? 'red' : 'blue'}>
                  {field.isSensitive ? 'Sensitive' : 'Normal'}
                </Tag>
                <ChakraTooltip label={field.dataCategory}>
                  <Tag size="sm" variant="outline">{shortIri(field.personalDataType)}</Tag>
                </ChakraTooltip>
              </HStack>
            </Flex>
            {field.fieldValue && <Text fontSize="xs" mt={1} color="gray.700">Value: <Code>{field.fieldValue}</Code></Text>}
          </Box>
        ))}
      </VStack>
    );
  };

  return (
    <Box maxW="7xl" mx="auto" py={10} px={4}>
      {/* HEADER */}
      <Flex justify="space-between" align="center" mb={6} wrap="wrap" gap={3}>
        <VStack align="start" spacing={1}>
          <Text fontSize="2xl" fontWeight="bold">Solid Audit Dashboard</Text>
          <Text fontSize="sm" color="gray.600">Monitor data access, policy compliance & privacy settings</Text>
        </VStack>
        <HStack wrap="wrap">
          <Badge colorScheme="purple">DPV · PROV · ODRL</Badge>
          <Button size="sm" colorScheme="blue" leftIcon={<EditIcon />} onClick={() => { loadPolicies(); onPolicyModalOpen(); }}>Policy Settings</Button>
          <Button size="sm" colorScheme="green" leftIcon={<InfoIcon />} onClick={() => { loadPrivacyMappings(); onPrivacyModalOpen(); }}>Privacy Settings</Button>
        </HStack>
      </Flex>
      <Divider mb={6} />
      
      {/* STATS CARDS */}
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Total Access Events</StatLabel>
              <StatNumber>{stats.total}</StatNumber>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Policy Violations</StatLabel>
              <StatNumber color={stats.violations > 0 ? 'red.500' : 'green.500'}>{stats.violations}</StatNumber>
              <StatHelpText>{stats.total > 0 ? `${Math.round((stats.violations / stats.total) * 100)}%` : '0%'}</StatHelpText>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Sensitive Data Accessed</StatLabel>
              <StatNumber color={stats.sensitive > 0 ? 'orange.500' : 'gray.500'}>{stats.sensitive}</StatNumber>
            </Stat>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <Stat>
              <StatLabel>Unique Applications</StatLabel>
              <StatNumber>{stats.apps}</StatNumber>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>
      
      {/* FILTER BAR */}
      <Card mb={6}>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Input placeholder="Search app, field name, or value..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <HStack spacing={4} wrap="wrap">
              <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as any)} size="sm">
                <option value="all">All Data</option>
                <option value="sensitive">Sensitive Only</option>
                <option value="normal">Non-Sensitive Only</option>
              </Select>
              <Select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as any)} size="sm">
                <option value="all">All Decisions</option>
                <option value="allowed">Allowed Only</option>
                <option value="violation">Violations Only</option>
              </Select>
              <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} size="sm">
                <option value="all">All Dates</option>
                <option value="today">Today</option>
                <option value="7">Last 7 Days</option>
                <option value="30">Last 30 Days</option>
              </Select>
              <Select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} size="sm">
                <option value="all">All Applications</option>
                {apps.map((app) => <option key={app} value={app}>{app}</option>)}
              </Select>
            </HStack>
          </VStack>
        </CardBody>
      </Card>
      
      {loading && <Spinner />}
      {!loading && filteredLogs.length === 0 && (
        <Alert status="info"><AlertIcon />No audit logs match the selected filters.</Alert>
      )}
      
      {/* TABS */}
      <Tabs variant="enclosed">
        <TabList>
          <Tab>Access Log</Tab>
          <Tab>Schema Overview</Tab>
          <Tab>Violation Report</Tab>
        </TabList>
        <TabPanels>
          {/* TAB 1: ACCESS LOG LIST */}
          <TabPanel>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
              {filteredLogs.map((log) => (
                <Card key={log.accessId} borderRadius="md" boxShadow="md" borderLeft="6px solid" borderColor={log.decision === 'VIOLATION' ? 'red.400' : log.hasSensitiveData ? 'orange.400' : 'green.400'}>
                  <CardHeader pb={2}>
                    <Flex justify="space-between" align="start">
                      <VStack align="start" spacing={1}>
                        <Text fontWeight="bold">{log.app}</Text>
                        <Text fontSize="xs" color="gray.600">{log.accessMethod} • {log.startedAt?.toLocaleString()}</Text>
                      </VStack>
                      <HStack>
                        <Badge colorScheme={log.decision === 'VIOLATION' ? 'red' : 'green'}>{log.decision}</Badge>
                        {log.hasSensitiveData && <Badge colorScheme="orange">Sensitive</Badge>}
                      </HStack>
                    </Flex>
                  </CardHeader>
                  <CardBody pt={0}>
                    <VStack align="start" spacing={3}>
                      <Box>
                        <Text fontSize="xs" fontWeight="medium" color="gray.600">Resource</Text>
                        <Link href={log.accessedResource} isExternal fontSize="sm" wordBreak="break-all">
                          {shortIri(log.accessedResource)} <ExternalLinkIcon mx="2px" />
                        </Link>
                      </Box>
                      {log.fields.length > 0 && (
                        <Box width="100%">
                          <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1}>Fields Accessed</Text>
                          <Flex wrap="wrap" gap={1}>
                            {/* ✅ FIX: Use fieldIri as key instead of idx */}
                            {log.fields.map((f) => (
                              <Tag key={f.fieldIri} size="sm" colorScheme={f.isSensitive ? 'red' : 'blue'}>
                                {f.fieldName}
                              </Tag>
                            ))}
                          </Flex>
                        </Box>
                      )}
                      {log.policyEvaluations.length > 0 && (
                        <Box width="100%">
                          <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1}>Policy Checks</Text>
                          <VStack align="start" spacing={1}>
                            {log.policyEvaluations.map((p, idx) => (
                              <Text key={`${log.accessId}-policy-${idx}`} fontSize="xs">
                                {p.evaluationResult === 'VIOLATION' ? '❌' : '✅'} {shortIri(p.evaluatedPolicy)}: {p.evaluationReason}
                              </Text>
                            ))}
                          </VStack>
                        </Box>
                      )}
                      {log.violations.length > 0 && (
                        <Alert status="warning" fontSize="sm">
                          <VStack align="start" spacing={1}>
                            <Text fontWeight="medium">Violation Details:</Text>
                            {log.violations.map((v, idx) => (
                              <Text key={`${log.accessId}-violation-${idx}`} fontSize="xs">
                                {shortIri(v.violatedField)}: {v.observedCount} &gt; {v.allowedLimit} (policy: {shortIri(v.violatedPolicy)})
                              </Text>
                            ))}
                          </VStack>
                        </Alert>
                      )}
                      <Button size="xs" variant="ghost" leftIcon={<ViewIcon />} onClick={() => {}}>
                        View Schema Details
                      </Button>
                    </VStack>
                  </CardBody>
                </Card>
              ))}
            </SimpleGrid>
          </TabPanel>
          
          {/* TAB 2: SCHEMA OVERVIEW */}
          <TabPanel>
            <Card>
              <CardHeader><Text fontWeight="bold">Data Schema Overview</Text></CardHeader>
              <CardBody>
                {loading ? <Spinner /> : (
                  <VStack align="stretch" spacing={4}>
                    {['Sensitive', 'Normal'].map((category) => {
                      const categoryFields = logs.flatMap((l) => l.fields).filter((f) => (category === 'Sensitive') === f.isSensitive);
                      const uniqueFields = Array.from(new Map(categoryFields.map((f) => [f.fieldIri, f])).values());
                      if (uniqueFields.length === 0) return null;
                      return (
                        <Box key={category}>
                          <Text fontWeight="medium" mb={2} color={category === 'Sensitive' ? 'red.600' : 'blue.600'}>
                            {category} Data Fields ({uniqueFields.length})
                          </Text>
                          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                            {uniqueFields.map((field) => (
                              <Box key={field.fieldIri} p={3} borderRadius="md" borderWidth="1px" borderColor="gray.200">
                                <Flex justify="space-between" align="start">
                                  <VStack align="start" spacing={1}>
                                    <Text fontWeight="medium">{field.fieldName}</Text>
                                    <Text fontSize="xs" color="gray.600">{shortIri(field.fieldIri)}</Text>
                                  </VStack>
                                  <Tag size="sm" colorScheme={field.isSensitive ? 'red' : 'blue'}>{shortIri(field.personalDataType)}</Tag>
                                </Flex>
                                <Text fontSize="xs" mt={2} color="gray.700">
                                  Category: <Code>{shortIri(field.dataCategory)}</Code>
                                </Text>
                              </Box>
                            ))}
                          </SimpleGrid>
                        </Box>
                      );
                    })}
                  </VStack>
                )}
              </CardBody>
            </Card>
          </TabPanel>
          
          {/* TAB 3: VIOLATION REPORT */}
          <TabPanel>
            <Card>
              <CardHeader><Text fontWeight="bold">Policy Violation Report</Text></CardHeader>
              <CardBody>
                {loading ? <Spinner /> : (
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th>Time</Th>
                        <Th>App</Th>
                        <Th>Violated Field</Th>
                        <Th>Policy</Th>
                        <Th>Count</Th>
                        <Th>Limit</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {logs.filter((l) => l.violations.length > 0).flatMap((log) =>
                        log.violations.map((v, idx) => (
                          <Tr key={`${log.accessId}-${v.violatedField}-${idx}`} bg="red.50">
                            <Td>{log.startedAt?.toLocaleString()}</Td>
                            <Td>{log.app}</Td>
                            <Td>{getFieldLabel(v.violatedField)}</Td>
                            <Td>{shortIri(v.violatedPolicy)}</Td>
                            <Td><Badge colorScheme="red">{v.observedCount}</Badge></Td>
                            <Td>{v.allowedLimit}</Td>
                          </Tr>
                        ))
                      )}
                      {logs.filter((l) => l.violations.length > 0).length === 0 && (
                        <Tr><Td colSpan={6} textAlign="center">No violations recorded</Td></Tr>
                      )}
                    </Tbody>
                  </Table>
                )}
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* POLICY SETTINGS MODAL */}
      <Modal isOpen={isPolicyModalOpen} onClose={onPolicyModalClose} size="4xl">
        <ModalOverlay />
        <ModalContent bg="white" color="black">
          <ModalHeader>Policy Management</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Accordion allowToggle defaultIndex={editingPolicy ? 0 : -1}>
              <AccordionItem>
                <AccordionButton style={{ backgroundColor: 'white' }}>
                  <Box flex="1" textAlign="left" fontWeight="bold">
                    {editingPolicy ? '✏️ Edit Policy' : '➕ Add New Policy'}
                  </Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <VStack spacing={4} align="stretch">
                    <FormControl isRequired>
                      <FormLabel>Policy Title</FormLabel>
                      <Input value={newPolicy.title || ''} onChange={(e) => setNewPolicy((p) => ({ ...p, title: e.target.value }))} placeholder="e.g., Blood Type Access Limit" />
                    </FormControl>
                    <FormControl>
                      <FormLabel>Description</FormLabel>
                      <Input value={newPolicy.description || ''} onChange={(e) => setNewPolicy((p) => ({ ...p, description: e.target.value }))} placeholder="Describe what this policy controls" />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>Target Field</FormLabel>
                      <Select
                        value={newPolicy.targetField || ''}
                        onChange={(e) => setNewPolicy((p) => ({ ...p, targetField: e.target.value }))}
                        placeholder="Select a field to protect"
                        isDisabled={!!editingPolicy}
                      >
                        {Object.entries(FIELD_LABELS).map(([iri, label]) => (
                          <option key={iri} value={shortIri(cleanIRI(iri))}>{label}</option>
                        ))}
                      </Select>
                      {editingPolicy && <FormHelperText>Target field cannot be changed for existing policies</FormHelperText>}
                      <FormHelperText>The data field this policy will monitor</FormHelperText>
                    </FormControl>
                    <Box>
                      <Text fontWeight="bold" mb={2}>Constraints</Text>
                      <VStack spacing={3} align="stretch">
                        {newPolicy.constraints?.map((constraint, idx) => (
                          <HStack key={`${newPolicy.title || 'new'}-constraint-${idx}`} spacing={3} align="start">
                            <Select
                              value={constraint.type}
                              onChange={(e) => {
                                const nc = [...(newPolicy.constraints || [])];
                                nc[idx] = { ...constraint, type: e.target.value as PolicyConstraint['type'] };
                                setNewPolicy((p) => ({ ...p, constraints: nc }));
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
                                    const nc = [...(newPolicy.constraints || [])];
                                    nc[idx] = { ...constraint, operator: e.target.value as PolicyConstraint['operator'] };
                                    setNewPolicy((p) => ({ ...p, constraints: nc }));
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
                                    const nc = [...(newPolicy.constraints || [])];
                                    nc[idx] = { ...constraint, value: val };
                                    setNewPolicy((p) => ({ ...p, constraints: nc }));
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
                                <Text fontSize="sm" color="gray.600">accesses</Text>
                              </>
                            )}
                            {constraint.type === 'timeWindow' && (
                              <>
                                <NumberInput
                                  value={constraint.value as number}
                                  onChange={(_, val) => {
                                    const nc = [...(newPolicy.constraints || [])];
                                    nc[idx] = { ...constraint, value: val };
                                    setNewPolicy((p) => ({ ...p, constraints: nc }));
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
                                    const nc = [...(newPolicy.constraints || [])];
                                    nc[idx] = { ...constraint, unit: e.target.value as 'hours' | 'days' };
                                    setNewPolicy((p) => ({ ...p, constraints: nc }));
                                  }}
                                  size="sm"
                                  width="100px"
                                >
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </Select>
                                <Text fontSize="sm" color="gray.600">access window</Text>
                              </>
                            )}
                            {constraint.type === 'location' && (
                              <>
                                <Input
                                  value={constraint.value as string}
                                  onChange={(e) => {
                                    const nc = [...(newPolicy.constraints || [])];
                                    nc[idx] = { ...constraint, value: e.target.value };
                                    setNewPolicy((p) => ({ ...p, constraints: nc }));
                                  }}
                                  size="sm"
                                  placeholder="Country code (e.g., ID, US)"
                                  width="120px"
                                />
                                <Text fontSize="sm" color="gray.600">allowed location</Text>
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
                        onClick={() => setNewPolicy((p) => ({ ...p, constraints: [...(p.constraints || []), { type: 'count', operator: 'lteq', value: 1 }] }))}
                      >
                        Add Another Constraint
                      </Button>
                    </Box>
                    <FormControl display="flex" alignItems="center">
                      <FormLabel mb="0">Enable Policy</FormLabel>
                      <Switch isChecked={newPolicy.active} onChange={(e) => setNewPolicy((p) => ({ ...p, active: e.target.checked }))} />
                    </FormControl>
                    <HStack justify="flex-end">
                      <Button variant="ghost" onClick={onPolicyModalClose}>Cancel</Button>
                      <Button colorScheme="blue" onClick={handleSavePolicy}>
                        {editingPolicy ? 'Update Policy' : 'Create Policy'}
                      </Button>
                    </HStack>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
            <Box mt={6}>
              <Text fontWeight="bold" mb={3}>Existing Policies</Text>
              {loadingPolicies ? <Spinner /> : (
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
                          <Text fontSize="xs" color="gray.600">{policy.description}</Text>
                        </Td>
                        <Td>
                          <Tag size="sm" colorScheme="purple">{policy.targetField}</Tag>
                        </Td>
                        <Td>
                          <VStack align="start" spacing={1}>
                            {policy.constraints.map((c, idx) => (
                              <Text key={`${policy.id}-constraint-${idx}`} fontSize="xs">
                                {c.type === 'count' && `Count ${c.operator} ${c.value}`}
                                {c.type === 'timeWindow' && `Window: ${c.value} ${c.unit}`}
                                {c.type === 'location' && `Location: ${c.value}`}
                              </Text>
                            ))}
                          </VStack>
                        </Td>
                        <Td>
                          <Switch size="sm" isChecked={policy.active} onChange={() => handleTogglePolicyActive(policy)} />
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            <Tooltip label="Edit policy">
                              <IconButton size="sm" icon={<EditIcon />} aria-label="Edit" onClick={() => handleEditPolicy(policy)} />
                            </Tooltip>
                            <Tooltip label="Delete policy">
                              <IconButton
                                size="sm"
                                icon={<DeleteIcon />}
                                aria-label="Delete"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => toast({ title: 'Delete not implemented', status: 'info' })}
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
            <Button variant="ghost" onClick={onPolicyModalClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* PRIVACY SETTINGS MODAL */}
      <Modal isOpen={isPrivacyModalOpen} onClose={onPrivacyModalClose} size="2xl">
        <ModalOverlay />
        <ModalContent bg="white" color="black">
          <ModalHeader>Privacy Data Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="info" mb={4}>
              <AlertIcon />
              Mark which fields contain sensitive personal data. Stored at <Code>{PRIVACY_MAPPING_PATH}</Code>.
            </Alert>
            
            {/* ✅ ADD FIELD: Select dropdown using FIELD_LABELS */}
            <FormControl mb={4}>
              <FormLabel>Add Field to Monitor</FormLabel>
              <HStack spacing={2}>
                <Select
                  placeholder="Select a field"
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddFieldFromDropdown(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  {Object.entries(FIELD_LABELS).map(([iri, label]) => {
                    const cleanIri = cleanIRI(iri);
                    const exists = privacyMappings.some((m) => m.fieldIri === cleanIri);
                    return (
                      <option key={iri} value={iri} disabled={exists}>
                        {label} {exists ? '(already added)' : ''}
                      </option>
                    );
                  })}
                </Select>
                <Button colorScheme="blue">Add</Button>
              </HStack>
              <FormHelperText>Select from predefined field types</FormHelperText>
            </FormControl>
            
            {loadingPrivacy ? <Spinner /> : (
              <VStack spacing={4} align="stretch" maxH="60vh" overflowY="auto">
                {privacyMappings.map((mapping) => (
                  <Box key={mapping.fieldIri} p={4} borderRadius="md" borderWidth="1px" borderColor="gray.200">
                    <HStack justify="space-between" wrap="wrap" gap={2}>
                      <VStack align="start" spacing={1} flex={1}>
                        <Text fontWeight="medium">{mapping.fieldLabel}</Text>
                        <Text fontSize="xs" color="gray.600" wordBreak="break-all">{mapping.fieldIri}</Text>
                        <HStack spacing={2}>
                          <Tag size="sm" colorScheme="blue">{shortIri(mapping.dataCategory)}</Tag>
                          <Tag size="sm" colorScheme="gray">{shortIri(mapping.personalDataType)}</Tag>
                        </HStack>
                      </VStack>
                      <FormControl display="flex" alignItems="center" width="auto">
                        <Switch
                          isChecked={mapping.isSensitive}
                          onChange={(e) => handleToggleSensitivity(mapping.fieldIri, e.target.checked)}
                          colorScheme={mapping.isSensitive ? 'red' : 'green'}
                        />
                        <FormLabel mb="0" ml={3} fontSize="sm">{mapping.isSensitive ? 'Sensitive' : 'Normal'}</FormLabel>
                      </FormControl>
                    </HStack>
                  </Box>
                ))}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter>
            <HStack>
              <Button variant="ghost" onClick={onPrivacyModalClose}>Cancel</Button>
              <Button colorScheme="green" onClick={savePrivacyMappings}>Save Privacy Settings</Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}