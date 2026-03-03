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
  Checkbox,
} from '@chakra-ui/react';
import {
  EditIcon,
  DeleteIcon,
  AddIcon,
  InfoIcon,
  ViewIcon,
  ExternalLinkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RepeatIcon,
} from '@chakra-ui/icons';
import { useEffect, useMemo, useState, useCallback } from 'react';
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
  addUrl,
  ThingPersisted,
  SolidDataset,
} from '@inrupt/solid-client';

/* ======================================================
CONSTANTS & ONTOLOGY PREFIXES
====================================================== */
const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX = 'https://example.org/privacy#';
const EX_BASE = 'https://example.org/';
const ODRL = 'http://www.w3.org/ns/odrl/2/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const FORCE = 'https://w3id.org/force/compliance-report#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SOTW = 'https://w3id.org/force/sotw#';

/* ======================================================
PATHS
====================================================== */
const ACCESS_LOG_PATH = 'private/audit/access/access-log.ttl';
const POLICY_PATH = 'private/audit/access/monitor-policy.ttl';
const PRIVACY_MAPPING_PATH = 'private/dpv-mapping.ttl';
const STATE_OF_WORLD_PATH = 'private/audit/monitoring/state-of-the-world.ttl';

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
SENSITIVE CATEGORIES (DPV)
====================================================== */
const SENSITIVE_CATEGORIES = [
  `${DPV}SensitivePersonalData`,
  `${DPV}SpecialCategoryPersonalData`,
  `${DPV}IdentifyingPersonalData`,
];

/* ======================================================
UTILS
====================================================== */
function cleanIRI(iri: string): string {
  if (!iri || typeof iri !== 'string') return iri || '';
  let cleaned = iri.replace(/^<|>$/g, '');
  cleaned = cleaned
    .replace(/\s+$/g, '')
    .replace(/^\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

function getFieldLabel(iri: string): string {
  const cleanIri = cleanIRI(iri);
  if (FIELD_LABELS[cleanIri]) {
    return FIELD_LABELS[cleanIri];
  }
  return cleanIri.split('#').pop() || cleanIri.split('/').pop() || 'Unknown Field';
}

function shortIri(iri: string) {
  const clean = cleanIRI(iri);
  if (clean.startsWith('ex:')) {
    return clean.replace('ex:', '');
  }
  return clean.split('#').pop() ?? clean.split('/').pop() ?? clean;
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

function bundlesMatch(bundle1: string | undefined, bundle2: string | undefined): boolean {
  if (!bundle1 || !bundle2) return false;
  return cleanIRI(bundle1) === cleanIRI(bundle2);
}

function extractAppFromThing(thing: any): string {
  const associatedWith = getStringNoLocaleAll(thing, `${PROV}wasAssociatedWith`)[0];
  if (associatedWith) {
    const clean = cleanIRI(associatedWith);
    if (clean.startsWith('ex:')) {
      return clean.replace('ex:', '');
    }
    const parts = clean.split('/');
    const last = parts[parts.length - 1];
    const app = last.includes('#') ? last.split('#')[1] : last;
    if (app) return app;
  }
  const resource = getUrlAll(thing, `${FORCE}accessedResource`)[0] ?? '';
  const cleanResource = cleanIRI(resource);
  const publicIdx = cleanResource.indexOf('/public/');
  if (publicIdx !== -1) {
    const afterPublic = cleanResource.substring(publicIdx + 8);
    const app = afterPublic.split('/').filter(Boolean)[0];
    if (app) return app;
  }
  return 'Unknown App';
}

function isSensitiveCategory(categoryIri: string): boolean {
  const clean = cleanIRI(categoryIri);
  return SENSITIVE_CATEGORIES.some(s => cleanIRI(s) === clean);
}

function schemaToExShort(schemaIri: string): string {
  const clean = cleanIRI(schemaIri);
  const fieldKey = Object.keys(FIELD_LABELS).find(key => cleanIRI(key) === clean);
  if (fieldKey) {
    const fieldName = fieldKey.split('/').pop()?.split('#').pop();
    if (fieldName) return fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
  }
  return clean.split('#').pop()?.split('/').pop() || 'unknown';
}

function exShortToSchema(shortName: string): string | null {
  for (const [schemaIri, label] of Object.entries(FIELD_LABELS)) {
    const expectedShort = schemaToExShort(schemaIri);
    if (expectedShort === shortName) {
      return cleanIRI(schemaIri);
    }
  }
  return null;
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
  domain?: string;
};

type SotwCount = {
  targetField: string;
  targetIRI: string;
  countValue: number;
};

type StateOfTheWorld = {
  id: string;
  currentTime: Date | null;
  currentLocation: string;
  counts: SotwCount[];
};

/* ======================================================
PARSE ACCESS LOG ENTRY
====================================================== */
function parseAccessLogEntry(thing: any, dataset: SolidDataset): AccessLogEntry | null {
  try {
    const types = getUrlAll(thing, `${RDF}type`);
    if (!types.some((t: string) => t.includes('Activity'))) return null;
    
    const decision = getStringNoLocaleAll(thing, `${FORCE}decision`)[0];
    // Jika tidak ada decision, kita asumsikan ALLOWED atau abaikan. 
    // Tapi untuk debugging, kita anggap null bukan VIOLATION.
    if (!decision) return null; 
    
    const accessId = thing.url.split('#').pop() ?? thing.url;
    const startedAt = getDatetime(thing, `${PROV}startedAtTime`) ?? null;
    const app = extractAppFromThing(thing);
    const accessMethod = getStringNoLocaleAll(thing, `${FORCE}accessMethod`)[0] ?? 'GET';
    const accessedResource = cleanIRI(getUrlAll(thing, `${FORCE}accessedResource`)[0] ?? '');
    
    const fields: AccessedField[] = [];
    const fieldsBundle = getUrlAll(thing, `${FORCE}hasFieldsBundle`)[0];
    if (fieldsBundle) {
      getThingAll(dataset).forEach((fieldThing: any) => {
        const fieldTypes = getUrlAll(fieldThing, `${RDF}type`);
        if (!fieldTypes.some((t: string) => t.includes('AccessedDataField'))) return;
        const belongsToBundle = getUrlAll(fieldThing, `${FORCE}belongsToBundle`)[0];
        if (!bundlesMatch(belongsToBundle, fieldsBundle)) return;
        
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
    
    const policyEvaluations: PolicyEvaluation[] = [];
    const policyBundle = getUrlAll(thing, `${FORCE}hasPolicyBundle`)[0];
    if (policyBundle) {
      getThingAll(dataset).forEach((evalThing: any) => {
        const evalTypes = getUrlAll(evalThing, `${RDF}type`);
        if (!evalTypes.some((t: string) => t.includes('PolicyEvaluation'))) return;
        const belongsToBundle = getUrlAll(evalThing, `${FORCE}belongsToBundle`)[0];
        if (!bundlesMatch(belongsToBundle, policyBundle)) return;
        
        policyEvaluations.push({
          evaluatedPolicy: cleanIRI(getUrlAll(evalThing, `${FORCE}evaluatedPolicy`)[0] ?? ''),
          evaluationResult: (getStringNoLocaleAll(evalThing, `${FORCE}evaluationResult`)[0] as 'ALLOWED' | 'VIOLATION') ?? 'ALLOWED',
          evaluationReason: getStringNoLocaleAll(evalThing, `${FORCE}evaluationReason`)[0] ?? '',
          targetAsset: cleanIRI(getUrlAll(evalThing, `${FORCE}targetAsset`)[0] ?? ''),
        });
      });
    }
    
    const violations: FieldViolation[] = [];
    const violatedPolicies: string[] = [];
    const violationBundle = getUrlAll(thing, `${FORCE}hasViolationBundle`)[0];
    
    if (violationBundle) {
      getThingAll(dataset).forEach((violThing: any) => {
        const violTypes = getUrlAll(violThing, `${RDF}type`);
        if (!violTypes.some((t: string) => t.includes('PolicyViolation'))) return;
        const belongsToBundle = getUrlAll(violThing, `${FORCE}belongsToBundle`)[0];
        if (!bundlesMatch(belongsToBundle, violationBundle)) return;
        
        getUrlAll(violThing, `${FORCE}violatedPolicy`).forEach((p: string) =>
          violatedPolicies.push(cleanIRI(p))
        );
        
        getUrlAll(violThing, `${FORCE}hasFieldViolation`).forEach((fvUrl: string) => {
          const fvThing = getThingAll(dataset).find((t: any) => t.url === fvUrl);
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
PARSE STATE OF THE WORLD
====================================================== */
function parseStateOfTheWorld(thing: any, dataset: SolidDataset): StateOfTheWorld | null {
  try {
    const types = getUrlAll(thing, `${RDF}type`);
    if (!types.some((t: string) => t.includes('SotW') || t.includes('sotw:SotW'))) return null;
    
    const currentTime = getDatetime(thing, `${SOTW}currentTime`) ?? null;
    const currentLocation = cleanIRI(getUrlAll(thing, `${SOTW}currentLocation`)[0] ?? '');
    
    const countsByTarget = new Map<string, SotwCount>();
    const countUrls = getUrlAll(thing, `${SOTW}count`);
    
    countUrls.forEach((countUrl: string) => {
      let countThing;
      if (countUrl.startsWith('_:')) {
        countThing = getThingAll(dataset).find((t: any) => t.url === countUrl);
      } else {
        countThing = getThingAll(dataset).find((t: any) => cleanIRI(t.url) === cleanIRI(countUrl));
      }
      
      if (countThing) {
        const target = cleanIRI(getUrlAll(countThing, `${ODRL}target`)[0] ?? '');
        const countValue = getInteger(countThing, `${SOTW}countValue`) ?? 0;
        
        if (target) {
          const newCount: SotwCount = {
            targetField: shortIri(target),
            targetIRI: target,
            countValue,
          };
          const existing = countsByTarget.get(target);
          if (!existing || countValue > existing.countValue) {
            countsByTarget.set(target, newCount);
          }
        }
      }
    });
    
    return {
      id: thing.url,
      currentTime,
      currentLocation: shortIri(currentLocation),
      counts: Array.from(countsByTarget.values()),
    };
  } catch (err) {
    console.error('Error parsing State of the World:', err);
    return null;
  }
}

/* ======================================================
PARSE PRIVACY MAPPING
====================================================== */
function parsePrivacyMapping(thing: any): PrivacyMapping | null {
  try {
    const types = getUrlAll(thing, `${RDF}type`);
    const hasDomain = getUrlAll(thing, `${EX}domain`).length > 0;
    
    if (!types.some((t: string) => t.includes('PersonalData')) && !hasDomain) return null;
    
    const subjectIri = cleanIRI(thing.url);
    let fieldIri = subjectIri;
    
    if (subjectIri.includes('example.org/privacy#')) {
      const shortName = subjectIri.split('#').pop();
      if (shortName) {
        const schemaMatch = exShortToSchema(shortName);
        if (schemaMatch) fieldIri = schemaMatch;
      }
    }
    
    const fieldLabel = getStringNoLocaleAll(thing, `${SKOS}prefLabel`)[0] || getFieldLabel(fieldIri);
    const dataCategory = getUrlAll(thing, `${DPV}hasDataCategory`)[0] || `${DPV}PersonalData`;
    const personalDataType = getUrlAll(thing, `${DPV}hasPersonalData`)[0] || `${DPV}Data`;
    const domain = getStringNoLocaleAll(thing, `${EX}domain`)[0];
    const isSensitive = isSensitiveCategory(dataCategory);
    
    return {
      fieldIri,
      fieldLabel,
      isSensitive,
      dataCategory: cleanIRI(dataCategory),
      personalDataType: cleanIRI(personalDataType),
      domain,
    };
  } catch (err) {
    console.error('Error parsing privacy mapping:', err);
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
  
  const [sotwData, setSotwData] = useState<StateOfTheWorld | null>(null);
  const [loadingSotw, setLoadingSotw] = useState(false);
  
  const { isOpen: isPolicyModalOpen, onOpen: onPolicyModalOpen, onClose: onPolicyModalClose } = useDisclosure();
  const { isOpen: isPrivacyModalOpen, onOpen: onPrivacyModalOpen, onClose: onPrivacyModalClose } = useDisclosure();
  const { isOpen: isDetailModalOpen, onOpen: onDetailModalOpen, onClose: onDetailModalClose } = useDisclosure();

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
  
  const [privacyMappings, setPrivacyMappings] = useState<PrivacyMapping[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);
  const [availableFields, setAvailableFields] = useState<string[]>([]);
  
  const [search, setSearch] = useState('');
  const [sensitivity, setSensitivity] = useState<'all' | 'sensitive' | 'normal'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7' | '30'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'allowed' | 'violation'>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const [selectedLog, setSelectedLog] = useState<AccessLogEntry | null>(null);

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

  /* ========================= LOAD ACCESS LOG ========================= */
  const loadAccessLogs = useCallback(async () => {
    if (!session?.info?.webId) return;
    try {
      setLoading(true);
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const accessLogUrl = `${podUrls[0]}${ACCESS_LOG_PATH}`;
      
      const dataset = await getSolidDataset(accessLogUrl, { fetch: session.fetch });
      if (!dataset || typeof dataset !== 'object') { setLogs([]); return; }
      
      const parsed: AccessLogEntry[] = [];
      getThingAll(dataset).forEach((thing) => {
        try {
          const entry = parseAccessLogEntry(thing, dataset);
          if (entry) parsed.push(entry);
        } catch (parseErr) { console.warn('Failed to parse entry:', parseErr); }
      });
      
      console.log(`📊 Parsed ${parsed.length} entries, ${parsed.filter(l => l.decision === 'VIOLATION').length} marked as VIOLATION`);
      
      parsed.sort((a, b) => {
        if (!a.startedAt) return 1;
        if (!b.startedAt) return -1;
        return b.startedAt.getTime() - a.startedAt.getTime();
      });
      setLogs(parsed);
    } catch (err: any) {
      console.error('Failed to load access log:', err);
      toast({
        title: 'Error',
        description: err?.status === 404 ? 'Audit log not found' : 'Failed to load logs',
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  }, [session, toast]);

  useEffect(() => { loadAccessLogs(); }, [loadAccessLogs]);

  /* ========================= LOAD STATE OF THE WORLD ========================= */
  const loadStateOfTheWorld = async () => {
    if (!session?.info?.webId) return;
    setLoadingSotw(true);
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const sotwUrl = `${podUrls[0]}${STATE_OF_WORLD_PATH}`;
      
      let dataset: SolidDataset;
      try {
        dataset = await getSolidDataset(sotwUrl, { fetch: session.fetch });
      } catch (error: any) {
        if (error?.status === 404) {
          console.log('📝 SOTW file not found, creating with fallback data...');
          dataset = createSolidDataset();
          
          const sotwThing = createThing({ url: `${sotwUrl}#sotw-current` });
          let finalThing = setUrl(sotwThing, `${RDF}type`, `${SOTW}SotW`);
          finalThing = setDatetime(finalThing, `${SOTW}currentTime`, new Date());
          finalThing = setUrl(finalThing, `${SOTW}currentLocation`, 'https://www.iso.org/obp/ui/#iso:code:3166:ID');
          
          Object.entries(FIELD_LABELS).forEach(([iri]) => {
            const countThing = createThing({ url: `${sotwUrl}#count-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
            let cThing = setUrl(countThing, `${RDF}type`, `${SOTW}Count`);
            cThing = setInteger(cThing, `${SOTW}countValue`, 0);
            cThing = setUrl(cThing, `${ODRL}target`, cleanIRI(iri));
            
            dataset = setThing(dataset, cThing);
            finalThing = addUrl(finalThing, `${SOTW}count`, cThing.url);
          });
          
          dataset = setThing(dataset, finalThing);
          await saveSolidDatasetAt(sotwUrl, dataset, { fetch: session.fetch });
          console.log('✅ Created new SOTW file');
        } else {
          throw error;
        }
      }
      
      let sotwEntry: StateOfTheWorld | null = null;
      getThingAll(dataset).forEach((thing: any) => {
        const parsed = parseStateOfTheWorld(thing, dataset);
        if (parsed) sotwEntry = parsed;
      });
      
      if (sotwEntry) setSotwData(sotwEntry);
      
    } catch (err: any) {
      console.error('Failed to load SOTW:', err);
      setSotwData({
        id: 'fallback',
        currentTime: new Date(),
        currentLocation: 'Unknown',
        counts: Object.entries(FIELD_LABELS).map(([iri]) => ({
          targetField: shortIri(iri),
          targetIRI: cleanIRI(iri),
          countValue: 0,
        })),
      });
    } finally {
      setLoadingSotw(false);
    }
  };

  useEffect(() => { loadStateOfTheWorld(); }, [session]);

  /* ========================= LOAD POLICIES ========================= */
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
        
        let constraintType: 'count' | 'timeWindow' | 'location' = 'count';
        let constraintValue: string | number = 1;
        let constraintOperator: 'lteq' | 'gteq' | 'eq' = 'lteq';
        
        const permissions = getUrlAll(thing, `${ODRL}permission`);
        permissions.forEach((permUrl: string) => {
          const permThing = getThingAll(dataset).find((t: any) => t.url === permUrl);
          if (permThing) {
            const constraints = getUrlAll(permThing, `${ODRL}constraint`);
            constraints.forEach((cUrl: string) => {
              const cThing = getThingAll(dataset).find((t: any) => t.url === cUrl);
              if (cThing) {
                const leftOperand = cleanIRI(getUrlAll(cThing, `${ODRL}leftOperand`)[0] || '');
                const op = cleanIRI(getUrlAll(cThing, `${ODRL}operator`)[0] || '');
                if (leftOperand.includes('count')) { constraintType = 'count'; constraintValue = getInteger(cThing, `${ODRL}rightOperand`) ?? 0; }
                else if (leftOperand.includes('timeWindow') || leftOperand.includes('duration')) { constraintType = 'timeWindow'; constraintValue = getInteger(cThing, `${ODRL}rightOperand`) ?? 0; }
                else if (leftOperand.includes('spatial')) { constraintType = 'location'; constraintValue = getStringNoLocaleAll(cThing, `${ODRL}rightOperand`)[0] || ''; }
                if (op.includes('lteq')) constraintOperator = 'lteq';
                else if (op.includes('gteq')) constraintOperator = 'gteq';
                else constraintOperator = 'eq';
              }
            });
          }
        });
        
        parsed.push({
          id: thing.url, title, description, targetField: shortIri(target), targetIRI: target,
          active, constraints: [{ type: constraintType, operator: constraintOperator, value: constraintValue }], createdAt,
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

  useEffect(() => { loadPolicies(); }, [session]);

  /* ========================= LOAD PRIVACY MAPPINGS ========================= */
  const loadPrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    setLoadingPrivacy(true);
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;
      
      let savedMappings: PrivacyMapping[] = [];
      
      try {
        const dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch });
        const things = getThingAll(dataset);
        
        things.forEach((thing: any) => {
          const parsed = parsePrivacyMapping(thing);
          if (parsed) savedMappings.push(parsed);
        });
      } catch (e) {
        console.log('Privacy mapping file not found. Will create on save.');
      }
      
      const savedMap = new Map(savedMappings.map(m => [cleanIRI(m.fieldIri), m]));
      
      const finalMappings: PrivacyMapping[] = Object.entries(FIELD_LABELS).map(([iri, label]) => {
        const cleanIri = cleanIRI(iri);
        const saved = savedMap.get(cleanIri);
        if (saved) return saved;
        return {
          fieldIri: cleanIri,
          fieldLabel: label,
          isSensitive: false,
          dataCategory: `${DPV}PersonalData`,
          personalDataType: `${DPV}Data`,
          domain: cleanIri.split('/').pop()?.split('#').pop(),
        };
      });
      
      savedMappings.forEach(saved => {
        if (!finalMappings.find(m => cleanIRI(m.fieldIri) === cleanIRI(saved.fieldIri))) {
          finalMappings.push(saved);
        }
      });

      setPrivacyMappings(finalMappings);
      setAvailableFields(Object.keys(FIELD_LABELS).map(cleanIRI));
    } catch (err) {
      console.error('Error loading privacy mappings:', err);
      toast({ title: 'Load Error', description: 'Using default privacy settings', status: 'warning' });
    } finally {
      setLoadingPrivacy(false);
    }
  };

  useEffect(() => { loadPrivacyMappings(); }, [session]);

  /* ========================= SAVE POLICY ========================= */
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
      
      const fullTargetIri = Object.keys(FIELD_LABELS).find(iri => shortIri(cleanIRI(iri)) === policy.targetField) || policy.targetField;
      policyThing = setUrl(policyThing, `${RDF}type`, `${ODRL}Policy`);
      policyThing = setStringNoLocale(policyThing, `${DCT}title`, policy.title);
      policyThing = setStringNoLocale(policyThing, `${DCT}description`, policy.description || '');
      policyThing = setDatetime(policyThing, `${DCT}created`, policy.createdAt || new Date());
      policyThing = setUrl(policyThing, `${ODRL}target`, fullTargetIri);
      policyThing = setBoolean(policyThing, `${FORCE}policyActive`, policy.active);
      
      const constraint = policy.constraints[0];
      if (constraint) {
        let constraintThing = createThing({ url: `${policyThing.url}#constraint-${Date.now()}` });
        let permissionThing = createThing({ url: `${policyThing.url}#permission-${Date.now()}` });
        
        if (constraint.type === 'count') {
          constraintThing = setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}count`);
          constraintThing = setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
          constraintThing = setInteger(constraintThing, `${ODRL}rightOperand`, Number(constraint.value));
        } else if (constraint.type === 'timeWindow') {
          constraintThing = setUrl(constraintThing, `${ODRL}leftOperand`, `${EX_BASE}timeWindow`);
          constraintThing = setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
          constraintThing = setInteger(constraintThing, `${ODRL}rightOperand`, Number(constraint.value));
        } else if (constraint.type === 'location') {
          constraintThing = setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}spatial`);
          constraintThing = setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
          constraintThing = setStringNoLocale(constraintThing, `${ODRL}rightOperand`, String(constraint.value));
        }
        
        permissionThing = setUrl(permissionThing, `${ODRL}assigner`, `${EX_BASE}pod-owner`);
        permissionThing = setUrl(permissionThing, `${ODRL}assignee`, `${EX_BASE}any-app`);
        permissionThing = setUrl(permissionThing, `${ODRL}action`, `${ODRL}read`);
        permissionThing = setUrl(permissionThing, `${ODRL}constraint`, constraintThing.url);
        policyThing = setUrl(policyThing, `${ODRL}permission`, permissionThing.url);
        dataset = setThing(dataset, constraintThing);
        dataset = setThing(dataset, permissionThing);
      }
      dataset = setThing(dataset, policyThing);
      await saveSolidDatasetAt(policyUrl, dataset, { fetch: session.fetch });
      
      toast({ title: 'Policy saved', description: `${policy.title} updated`, status: 'success' });
      await loadPolicies();
    } catch (err) {
      console.error('Failed to save policy:', err);
      toast({ title: 'Failed to save policy', status: 'error' });
      throw err;
    }
  };

  /* ========================= SAVE PRIVACY MAPPINGS ========================= */
  const savePrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;
      
      let dataset: SolidDataset;
      try {
        dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch });
      } catch {
        dataset = createSolidDataset();
      }
      
      privacyMappings.forEach((mapping) => {
        const shortName = schemaToExShort(mapping.fieldIri);
        const subjectUrl = `${EX}${shortName}`;
        
        let thing = getThingAll(dataset).find((t: any) => cleanIRI(t.url) === cleanIRI(subjectUrl));
        if (!thing) {
          thing = createThing({ url: subjectUrl });
        }
        
        thing = setUrl(thing, `${RDF}type`, `${DPV}PersonalData`);
        thing = setStringNoLocale(thing, `${SKOS}prefLabel`, mapping.fieldLabel);
        thing = setUrl(thing, `${DPV}hasPersonalData`, mapping.personalDataType);
        thing = setUrl(thing, `${DPV}hasDataCategory`, mapping.dataCategory);
        if (mapping.domain) {
          thing = setStringNoLocale(thing, `${EX}domain`, mapping.domain);
        }
        
        dataset = setThing(dataset, thing);
      });
      
      await saveSolidDatasetAt(mappingUrl, dataset, { fetch: session.fetch });
      
      toast({ title: 'Success', description: 'Privacy settings saved', status: 'success' });
      await loadPrivacyMappings(); 
      onPrivacyModalClose();
      
    } catch (err: any) {
      console.error('Failed to save privacy mappings:', err);
      let errorMessage = 'Unknown error';
      if (err.statusCode === 403 || err.statusCode === 401) errorMessage = 'Permission Denied. Check ACLs.';
      else if (err.statusCode === 404) errorMessage = 'Container not found.';
      else if (err.message) errorMessage = err.message;
      
      toast({
        title: 'Failed to save',
        description: errorMessage,
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
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

  // ✅ FIXED: Ambil log jika punya detail violation ATAU jika statusnya VIOLATION (meski detail kosong)
  const violationLogs = useMemo(() => 
    filteredLogs.filter((l) => l.violations.length > 0 || l.decision === 'VIOLATION'), 
    [filteredLogs]
  );

  const totalPages = Math.ceil(violationLogs.length / rowsPerPage);
  const currentViolationLogs = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return violationLogs.slice(start, start + rowsPerPage);
  }, [violationLogs, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const findPolicyByViolation = (violatedPolicyIri: string): Policy | undefined => {
    const cleanViolated = cleanIRI(violatedPolicyIri);
    const exact = policies.find(p => p.id === cleanViolated || p.id === violatedPolicyIri);
    if (exact) return exact;
    
    const byTarget = policies.find(p => cleanIRI(p.targetIRI || '') === cleanViolated);
    if (byTarget) return byTarget;
    
    const shortName = shortIri(cleanViolated);
    const byShort = policies.find(p => p.targetField === shortName);
    if (byShort) return byShort;
    
    return undefined;
  };

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
    await savePolicy({ ...policy, active: !policy.active });
  };
  
  const handleSavePolicy = async () => {
    if (!newPolicy.title || !newPolicy.targetField) {
      toast({ title: 'Missing fields', description: 'Fill title and target field', status: 'warning' });
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
    setPrivacyMappings((prev) => prev.map((m) => {
      if (cleanIRI(m.fieldIri) === cleanIRI(fieldIri)) {
        const newCategory = newValue ? `${DPV}SensitivePersonalData` : `${DPV}PersonalData`;
        return { ...m, isSensitive: newValue, dataCategory: newCategory };
      }
      return m;
    }));
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
        <Card><CardBody><Stat><StatLabel>Total Access Events</StatLabel><StatNumber>{stats.total}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Policy Violations</StatLabel><StatNumber color={stats.violations > 0 ? 'red.500' : 'green.500'}>{stats.violations}</StatNumber><StatHelpText>{stats.total > 0 ? `${Math.round((stats.violations / stats.total) * 100)}%` : '0%'}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Sensitive Data Accessed</StatLabel><StatNumber color={stats.sensitive > 0 ? 'orange.500' : 'gray.500'}>{stats.sensitive}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Unique Applications</StatLabel><StatNumber>{stats.apps}</StatNumber></Stat></CardBody></Card>
      </SimpleGrid>
      
      {/* FILTER BAR + REFRESH */}
      <Card mb={6}>
        <CardBody>
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontWeight="medium">Filters</Text>
            <HStack>
              <Button size="sm" leftIcon={<RepeatIcon />} onClick={loadAccessLogs} isLoading={loading}>
                Refresh Logs
              </Button>
            </HStack>
          </Flex>
          <VStack spacing={4} align="stretch">
            <Input placeholder="Search app, field name, or value..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <HStack spacing={4} wrap="wrap">
              <Select value={sensitivity} onChange={(e) => setSensitivity(e.target.value as any)} size="sm">
                <option value="all">All Data</option><option value="sensitive">Sensitive Only</option><option value="normal">Non-Sensitive Only</option>
              </Select>
              <Select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as any)} size="sm">
                <option value="all">All Decisions</option><option value="allowed">Allowed Only</option><option value="violation">Violations Only</option>
              </Select>
              <Select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as any)} size="sm">
                <option value="all">All Dates</option><option value="today">Today</option><option value="7">Last 7 Days</option><option value="30">Last 30 Days</option>
              </Select>
              <Select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} size="sm">
                <option value="all">All Applications</option>
                {apps.map((app) => <option key={app} value={app}>{app}</option>)}
              </Select>
            </HStack>
          </VStack>
        </CardBody>
      </Card>
      
      {loading && <Flex justify="center" py={10}><Spinner size="xl" /></Flex>}
      {!loading && filteredLogs.length === 0 && <Alert status="info"><AlertIcon />No audit logs match the selected filters.</Alert>}
      
      {/* TABS */}
      {!loading && (
        <Tabs variant="enclosed">
          <TabList>
            <Tab>Violation Report</Tab>
            <Tab>State of the World</Tab>
          </TabList>
          <TabPanels>
            {/* TAB 1: VIOLATION REPORT - CRITICAL FIX APPLIED HERE */}
            <TabPanel>
              <Card>
                <CardHeader>
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="bold">Policy Violation Report</Text>
                    <Button size="sm" leftIcon={<RepeatIcon />} onClick={loadAccessLogs} isLoading={loading}>
                      Refresh
                    </Button>
                  </Flex>
                </CardHeader>
                <CardBody>
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th>Time</Th><Th>App</Th><Th>Violated Field</Th><Th>Policy Title</Th><Th>Policy ID</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {currentViolationLogs.length > 0 ? (
                        currentViolationLogs.map((log) => (
                          <>
                            {/* CASE 1: Explicit Violation Details exist */}
                            {log.violations.length > 0 ? (
                              log.violations.map((v, idx) => {
                                const matchedPolicy = findPolicyByViolation(v.violatedPolicy);
                                const policyTitle = matchedPolicy ? matchedPolicy.title : 'Unknown Policy';
                                const policyIdDisplay = matchedPolicy ? shortIri(matchedPolicy.id) : shortIri(v.violatedPolicy);
                                
                                return (
                                  <Tr key={`${log.accessId}-exp-${idx}`} bg="red.50" cursor="pointer" _hover={{ bg: 'red.100' }} onClick={() => { setSelectedLog(log); onDetailModalOpen(); }}>
                                    <Td>{log.startedAt?.toLocaleString()}</Td>
                                    <Td textTransform="capitalize">{log.app}</Td>
                                    <Td>{getFieldLabel(v.violatedField)}</Td>
                                    <Td fontWeight="medium">{policyTitle}</Td>
                                    <Td><Code fontSize="xs">{policyIdDisplay}</Code></Td>
                                  </Tr>
                                );
                              })
                            ) : (
                              /* CASE 2: Fallback - Decision is VIOLATION but no explicit bundle details */
                              /* We list the fields accessed in this log as the potential violations */
                              log.fields.length > 0 ? (
                                log.fields.map((field, idx) => {
                                  const matchedPolicy = policies.find(p => 
                                    cleanIRI(p.targetIRI || '') === cleanIRI(field.fieldIri) || 
                                    p.targetField === shortIri(field.fieldIri)
                                  );
                                  const policyTitle = matchedPolicy ? matchedPolicy.title : (field.isSensitive ? 'Sensitive Data Policy' : 'General Policy');
                                  const policyIdDisplay = matchedPolicy ? shortIri(matchedPolicy.id) : shortIri(field.fieldIri);
                                  
                                  return (
                                    <Tr key={`${log.accessId}-fb-${idx}`} bg="orange.50" cursor="pointer" _hover={{ bg: 'orange.100' }} onClick={() => { setSelectedLog(log); onDetailModalOpen(); }}>
                                      <Td>{log.startedAt?.toLocaleString()}</Td>
                                      <Td textTransform="capitalize">{log.app}</Td>
                                      <Td>{getFieldLabel(field.fieldIri)}</Td>
                                      <Td fontWeight="medium" color="orange.700">{policyTitle} (Inferred)</Td>
                                      <Td><Code fontSize="xs">{policyIdDisplay}</Code></Td>
                                    </Tr>
                                  );
                                })
                              ) : (
                                /* CASE 3: No fields available either */
                                <Tr key={`${log.accessId}-gen`} bg="gray.50">
                                  <Td>{log.startedAt?.toLocaleString()}</Td>
                                  <Td textTransform="capitalize">{log.app}</Td>
                                  <Td colSpan={3}>General Violation (No field details available)</Td>
                                </Tr>
                              )
                            )}
                          </>
                        ))
                      ) : (
                        <Tr>
                          <Td colSpan={5} textAlign="center">
                            {logs.filter(l => l.decision === 'VIOLATION').length > 0 ? (
                              <>
                                <Text>Violations exist but may be filtered out.</Text>
                                <Button size="xs" mt={2} onClick={() => { setDecisionFilter('all'); setDateFilter('all'); setSensitivity('all'); setAppFilter('all'); setSearch(''); }}>
                                  Clear filters
                                </Button>
                              </>
                            ) : (
                              'No violations recorded'
                            )}
                          </Td>
                        </Tr>
                      )}
                    </Tbody>
                  </Table>
                  {totalPages > 1 && (
                    <Flex justify="space-between" align="center" mt={4}>
                      <Button size="sm" onClick={() => handlePageChange(currentPage - 1)} isDisabled={currentPage === 1} leftIcon={<ChevronLeftIcon />}>Previous</Button>
                      <Text fontSize="sm">Page {currentPage} of {totalPages}</Text>
                      <Button size="sm" onClick={() => handlePageChange(currentPage + 1)} isDisabled={currentPage === totalPages} rightIcon={<ChevronRightIcon />}>Next</Button>
                    </Flex>
                  )}
                </CardBody>
              </Card>
            </TabPanel>

            {/* TAB 2: STATE OF THE WORLD */}
            <TabPanel>
              <Card>
                <CardHeader>
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="bold">State of the World</Text>
                    <Button size="sm" colorScheme="blue" onClick={loadStateOfTheWorld} isLoading={loadingSotw}>Refresh</Button>
                  </Flex>
                </CardHeader>
                <CardBody>
                  {loadingSotw ? <Flex justify="center" py={10}><Spinner /></Flex> : sotwData ? (
                    <VStack align="stretch" spacing={4}>
                      <HStack spacing={6} wrap="wrap">
                        <Box><Text fontSize="xs" color="gray.600">Current Time</Text><Text fontWeight="medium">{sotwData.currentTime?.toLocaleString() || 'N/A'}</Text></Box>
                        <Box><Text fontSize="xs" color="gray.600">Current Location</Text><Tag size="sm" colorScheme="purple">{sotwData.currentLocation}</Tag></Box>
                      </HStack>
                      <Divider />
                      <Text fontWeight="medium" mb={2}>Access Counts by Field (Latest Values)</Text>
                      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                        {sotwData.counts.map((count) => (
                          <Box key={count.targetIRI} p={3} borderRadius="md" borderWidth="1px" borderColor="gray.200">
                            <Flex justify="space-between" align="center">
                              <VStack align="start" spacing={1}>
                                <Text fontWeight="medium">{getFieldLabel(count.targetIRI)}</Text>
                                <Text fontSize="xs" color="gray.600">{shortIri(count.targetIRI)}</Text>
                              </VStack>
                              <Stat><StatNumber fontSize="2xl">{count.countValue}</StatNumber><StatHelpText>accesses (latest)</StatHelpText></Stat>
                            </Flex>
                          </Box>
                        ))}
                      </SimpleGrid>
                      {sotwData.counts.length === 0 && <Alert status="info"><AlertIcon />No count data available.</Alert>}
                    </VStack>
                  ) : <Alert status="warning"><AlertIcon />No State of the World data available.</Alert>}
                </CardBody>
              </Card>
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}

      {/* DETAIL MODAL */}
      <Modal isOpen={isDetailModalOpen} onClose={onDetailModalClose} size="2xl">
        <ModalOverlay /><ModalContent>
          <ModalHeader>Access Log Detail</ModalHeader><ModalCloseButton />
          <ModalBody>
            {selectedLog && (
              <VStack align="start" spacing={4}>
                <Box width="100%">
                  <Flex justify="space-between" align="start" mb={2}>
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="bold" textTransform="capitalize" fontSize="lg">{selectedLog.app}</Text>
                      <Text fontSize="xs" color="gray.600">{selectedLog.accessMethod} • {selectedLog.startedAt?.toLocaleString()}</Text>
                    </VStack>
                    <HStack>
                      <Badge colorScheme={selectedLog.decision === 'VIOLATION' ? 'red' : 'green'}>{selectedLog.decision}</Badge>
                      {selectedLog.hasSensitiveData && <Badge colorScheme="orange">Sensitive</Badge>}
                    </HStack>
                  </Flex><Divider />
                </Box>
                <Box width="100%">
                  <Text fontSize="xs" fontWeight="medium" color="gray.600">Resource</Text>
                  <Link href={selectedLog.accessedResource} isExternal fontSize="sm" wordBreak="break-all">{shortIri(selectedLog.accessedResource)} <ExternalLinkIcon mx="2px" /></Link>
                </Box>
                {selectedLog.fields.length > 0 && (
                  <Box width="100%">
                    <Text fontSize="xs" fontWeight="medium" color="gray.600" mb={1}>Fields Accessed</Text>
                    <VStack align="stretch" spacing={2}>
                      {selectedLog.fields.map((f) => (
                        <Box key={f.fieldIri} p={2} borderRadius="md" bg={f.isSensitive ? 'red.50' : 'gray.50'} borderLeft="4px solid" borderColor={f.isSensitive ? 'red.400' : 'gray.400'}>
                          <Flex justify="space-between">
                            <Text fontSize="sm" fontWeight="medium">{f.fieldName}</Text>
                            <Tag size="sm" colorScheme={f.isSensitive ? 'red' : 'blue'}>{f.isSensitive ? 'Sensitive' : 'Normal'}</Tag>
                          </Flex>
                          {f.fieldValue && <Text fontSize="xs" mt={1} color="gray.700">Value: <Code>{f.fieldValue}</Code></Text>}
                        </Box>
                      ))}
                    </VStack>
                  </Box>
                )}
                {selectedLog.violations.length > 0 && (
                  <Alert status="warning" fontSize="sm">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="medium">Violation Details:</Text>
                      {selectedLog.violations.map((v, idx) => {
                        const matchedPolicy = findPolicyByViolation(v.violatedPolicy);
                        const policyTitle = matchedPolicy ? matchedPolicy.title : shortIri(v.violatedPolicy);
                        return <Text key={`${selectedLog.accessId}-violation-${idx}`} fontSize="xs">{getFieldLabel(v.violatedField)}: Violated Count {v.observedCount} &gt; Constraint {v.allowedLimit} ({policyTitle})</Text>;
                      })}
                    </VStack>
                  </Alert>
                )}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter><Button variant="ghost" onClick={onDetailModalClose}>Close</Button></ModalFooter>
        </ModalContent>
      </Modal>

      {/* POLICY SETTINGS MODAL */}
      <Modal isOpen={isPolicyModalOpen} onClose={onPolicyModalClose} size="4xl">
        <ModalOverlay /><ModalContent bg="white" color="black">
          <ModalHeader>Policy Management</ModalHeader><ModalCloseButton />
          <ModalBody>
            <Accordion allowToggle defaultIndex={editingPolicy ? 0 : -1}>
              <AccordionItem>
                <AccordionButton style={{ backgroundColor: 'white' }}>
                  <Box flex="1" textAlign="left" fontWeight="bold">{editingPolicy ? '✏️ Edit Policy' : '➕ Add New Policy'}</Box>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <VStack spacing={4} align="stretch">
                    <FormControl isRequired><FormLabel>Policy Title</FormLabel><Input value={newPolicy.title || ''} onChange={(e) => setNewPolicy((p) => ({ ...p, title: e.target.value }))} placeholder="e.g., Blood Type Access Limit" /></FormControl>
                    <FormControl><FormLabel>Description</FormLabel><Input value={newPolicy.description || ''} onChange={(e) => setNewPolicy((p) => ({ ...p, description: e.target.value }))} placeholder="Describe what this policy controls" /></FormControl>
                    <FormControl isRequired>
                      <FormLabel>Target Field</FormLabel>
                      <Select value={newPolicy.targetField || ''} onChange={(e) => setNewPolicy((p) => ({ ...p, targetField: e.target.value }))} placeholder="Select a field to protect" isDisabled={!!editingPolicy}>
                        {Object.entries(FIELD_LABELS).map(([iri, label]) => <option key={iri} value={shortIri(cleanIRI(iri))}>{label}</option>)}
                      </Select>
                      {editingPolicy && <FormHelperText>Target field cannot be changed for existing policies</FormHelperText>}
                    </FormControl>
                    <Box>
                      <Text fontWeight="bold" mb={2}>Constraints</Text>
                      <VStack spacing={3} align="stretch">
                        {newPolicy.constraints?.map((constraint, idx) => (
                          <HStack key={`${newPolicy.title || 'new'}-constraint-${idx}`} spacing={3} align="start">
                            <Select value={constraint.type} onChange={(e) => { const nc = [...(newPolicy.constraints || [])]; nc[idx] = { ...constraint, type: e.target.value as PolicyConstraint['type'], value: e.target.value === 'location' ? '' : 1 }; setNewPolicy((p) => ({ ...p, constraints: nc })); }} size="sm" width="150px">
                              <option value="count">Access Count</option><option value="timeWindow">Time Window</option><option value="location">Location</option>
                            </Select>
                            <Select value={constraint.operator} onChange={(e) => { const nc = [...(newPolicy.constraints || [])]; nc[idx] = { ...constraint, operator: e.target.value as PolicyConstraint['operator'] }; setNewPolicy((p) => ({ ...p, constraints: nc })); }} size="sm" width="100px">
                              <option value="lteq">≤</option><option value="gteq">≥</option><option value="eq">=</option>
                            </Select>
                            {constraint.type === 'location' ? <Input placeholder="City, Region, or Country" value={constraint.value as string} onChange={(e) => { const nc = [...(newPolicy.constraints || [])]; nc[idx] = { ...constraint, value: e.target.value }; setNewPolicy((p) => ({ ...p, constraints: nc })); }} size="sm" /> : (
                              <NumberInput value={constraint.value as number} onChange={(_, val) => { const nc = [...(newPolicy.constraints || [])]; nc[idx] = { ...constraint, value: val }; setNewPolicy((p) => ({ ...p, constraints: nc })); }} size="sm" width="100px">
                                <NumberInputField /><NumberInputStepper><NumberIncrementStepper /><NumberDecrementStepper /></NumberInputStepper>
                              </NumberInput>
                            )}
                            <Text fontSize="sm" color="gray.600">{constraint.type === 'count' ? 'accesses' : constraint.type === 'timeWindow' ? 'hours' : ''}</Text>
                          </HStack>
                        ))}
                      </VStack>
                    </Box>
                    <HStack justify="flex-end">
                      <Button variant="ghost" onClick={onPolicyModalClose}>Cancel</Button>
                      <Button colorScheme="blue" onClick={handleSavePolicy}>{editingPolicy ? 'Update Policy' : 'Create Policy'}</Button>
                    </HStack>
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
            <Box mt={6}>
              <Text fontWeight="bold" mb={3}>Existing Policies</Text>
              {loadingPolicies ? <Spinner /> : (
                <Table variant="simple" size="sm">
                  <Thead><Tr><Th>Policy</Th><Th>Target</Th><Th>Constraints</Th><Th>Status</Th><Th>Actions</Th></Tr></Thead>
                  <Tbody>
                    {policies.map((policy) => (
                      <Tr key={policy.id}>
                        <Td><Text fontWeight="medium">{policy.title}</Text><Text fontSize="xs" color="gray.600">{policy.description}</Text></Td>
                        <Td><Tag size="sm" colorScheme="purple">{policy.targetField}</Tag></Td>
                        <Td>{policy.constraints.map((c, idx) => <Text key={`${policy.id}-c-${idx}`} fontSize="xs">{c.type === 'count' ? `Count ${c.operator} ${c.value}` : c.type === 'timeWindow' ? `Time ${c.operator} ${c.value}` : `Location ${c.operator} ${c.value}`}</Text>)}</Td>
                        <Td><Switch size="sm" isChecked={policy.active} onChange={() => handleTogglePolicyActive(policy)} /></Td>
                        <Td><HStack spacing={2}><IconButton size="sm" icon={<EditIcon />} aria-label="Edit" onClick={() => handleEditPolicy(policy)} /><IconButton size="sm" icon={<DeleteIcon />} aria-label="Delete" colorScheme="red" variant="ghost" onClick={() => toast({ title: 'Delete not implemented', status: 'info' })} /></HStack></Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Box>
          </ModalBody>
          <ModalFooter><Button variant="ghost" onClick={onPolicyModalClose}>Close</Button></ModalFooter>
        </ModalContent>
      </Modal>

      {/* PRIVACY SETTINGS MODAL */}
      <Modal isOpen={isPrivacyModalOpen} onClose={onPrivacyModalClose} size="2xl">
        <ModalOverlay /><ModalContent bg="white" color="black">
          <ModalHeader>Privacy Data Settings (DPV)</ModalHeader><ModalCloseButton />
          <ModalBody>
            <Alert status="info" mb={4}>
              <AlertIcon />
              Fields marked as sensitive use DPV categories. Data stored at <Code>{PRIVACY_MAPPING_PATH}</Code> using subject-based mapping (ex:fieldName as subject). You can toggle individual fields.
            </Alert>
            {loadingPrivacy ? <Spinner /> : (
              <VStack spacing={3} align="stretch" maxH="60vh" overflowY="auto" p={2}>
                {privacyMappings.map((mapping) => (
                  <Flex key={mapping.fieldIri} p={3} borderRadius="md" borderWidth="1px" borderColor="gray.200" alignItems="center" justifyContent="space-between" _hover={{ bg: 'gray.50' }}>
                    <VStack align="start" spacing={1} flex={1}>
                      <HStack>
                        <Text fontWeight="medium">{mapping.fieldLabel}</Text>
                        {mapping.isSensitive && <Badge colorScheme="red" variant="subtle" fontSize="xs">Sensitive</Badge>}
                      </HStack>
                      <Text fontSize="xs" color="gray.500" wordBreak="break-all">{shortIri(mapping.fieldIri)}</Text>
                      <Text fontSize="xs" color="gray.400">Category: {shortIri(mapping.dataCategory)}</Text>
                    </VStack>
                    <Checkbox
                      isChecked={mapping.isSensitive}
                      onChange={(e) => handleToggleSensitivity(mapping.fieldIri, e.target.checked)}
                      colorScheme="red"
                      size="lg"
                    >
                      <Text fontSize="sm" ml={2} color="gray.600">Mark as Sensitive</Text>
                    </Checkbox>
                  </Flex>
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