'use client';
import {
  Box, Text, Spinner, SimpleGrid, useToast, Flex, Divider, Badge, VStack, Tag,
  Input, Select, HStack, Button, Modal, ModalOverlay, ModalContent, ModalHeader,
  ModalBody, ModalCloseButton, ModalFooter, Switch, FormControl, FormLabel,
  FormHelperText, Table, Thead, Tbody, Tr, Th, Td, Accordion, AccordionItem,
  AccordionButton, AccordionPanel, AccordionIcon, NumberInput, NumberInputField,
  NumberInputStepper, NumberIncrementStepper, NumberDecrementStepper, useDisclosure,
  IconButton, Tooltip, Alert, AlertIcon, Card, CardBody, CardHeader, Stat, StatLabel,
  StatNumber, StatHelpText, Tabs, TabList, TabPanels, Tab, TabPanel, Code, Checkbox,
} from '@chakra-ui/react';
import {
  EditIcon, DeleteIcon, AddIcon, InfoIcon, ChevronLeftIcon, ChevronRightIcon,
  RepeatIcon, CloseIcon,
} from '@chakra-ui/icons';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSolidSession } from '@/contexts/SolidSessionContext';
import {
  getSolidDataset, getThingAll, getUrlAll, getDatetime, getPodUrlAll,
  getStringNoLocaleAll, createThing, setUrl, setDatetime, setStringNoLocale,
  saveSolidDatasetAt, getBoolean, getInteger, createSolidDataset, setThing,
  setBoolean, setInteger, addUrl, removeThing, ThingPersisted, SolidDataset,
} from '@inrupt/solid-client';

const DPV = 'https://w3id.org/dpv#';
const DCT = 'http://purl.org/dc/terms/';
const EX = 'https://example.org/privacy#';
const EX_BASE = 'https://example.org/';
const ODRL = 'http://www.w3.org/ns/odrl/2/';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const REPORT = 'https://w3id.org/force/compliance-report#';
const PROV = 'http://www.w3.org/ns/prov#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
const SOTW = 'https://w3id.org/force/sotw#';
const SCHEMA = 'https://schema.org/';

const ACCESS_LOG_PATH = 'private/audit/access/access-log.ttl';
const POLICY_PATH = 'private/audit/access/monitor-policy.ttl';
const PRIVACY_MAPPING_PATH = 'private/dpv-mapping.jsonld';
const STATE_OF_WORLD_PATH = 'private/audit/monitoring/state-of-the-world.ttl';

const FIELD_LABELS: Record<string, string> = {
  'https://schema.org/identifier': 'Identifier Number Person',
  'http://purl.org/dc/terms/created': 'Created Timestamp',
  'http://purl.org/dc/terms/modified': 'Modified Timestamp',
  'https://schema.org/email': 'Email',
  'https://schema.org/name': 'Name',
  'https://schema.org/birthDate': 'Birth Date',
  'https://schema.org/birthPlace': 'Birth Place',
  'https://schema.org/parent': 'Parent',
  'https://schema.org/bloodType': 'Blood Type',
};

const SENSITIVE_CATEGORIES = [
  `${DPV}SensitivePersonalData`,
  `${DPV}SpecialCategoryPersonalData`,
  `${DPV}IdentifyingPersonalData`,
];

const ACTION_HIERARCHY: Record<string, string | null> = {
  [`${EX}read`]: `${ODRL}use`,
  [`${EX}create`]: `${ODRL}use`,
  [`${EX}update`]: `${ODRL}use`,
  [`${ODRL}use`]: null,
  [`${ODRL}transfer`]: null,
};

function actionIncludedIn(actionA: string, actionB: string): boolean {
  let current = cleanIRI(actionA);
  const target = cleanIRI(actionB);
  if (current === target) return true;
  while (current && ACTION_HIERARCHY[current]) {
    const parent = cleanIRI(ACTION_HIERARCHY[current]!);
    if (parent === target) return true;
    current = parent;
  }
  return false;
}

function cleanIRI(iri: string): string {
  if (!iri || typeof iri !== 'string') return iri || '';
  let cleaned = iri.replace(/^<|>$/g, '');
  cleaned = cleaned.replace(/\s+$/g, '').replace(/^\s+/g, '').replace(/\s+/g, ' ').trim();
  return cleaned;
}

function getFieldLabel(iri: string): string {
  const cleanIri = cleanIRI(iri);
  if (FIELD_LABELS[cleanIri]) return FIELD_LABELS[cleanIri];
  return cleanIri.split('#').pop() || cleanIri.split('/').pop() || 'Unknown Field';
}

function shortIri(iri: string) {
  const clean = cleanIRI(iri);
  if (clean.startsWith('ex:')) return clean.replace('ex:', '');
  return clean.split('#').pop() ?? clean.split('/').pop() ?? clean;
}

function isWithinDays(date: Date | null, days: number) {
  if (!date) return false;
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  return diff <= days * 24 * 60 * 60 * 1000;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generatePolicyIdentifier(): string {
  return `urn:uuid:${generateUUID()}`;
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
    if (clean.startsWith('ex:')) return clean.replace('ex:', '');
    const parts = clean.split('/');
    const last = parts[parts.length - 1];
    const app = last.includes('#') ? last.split('#')[1] : last;
    if (app) return app;
  }
  const resource = getUrlAll(thing, `${PROV}used`)[0] ?? '';
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
  for (const [schemaIri] of Object.entries(FIELD_LABELS)) {
    const expectedShort = schemaToExShort(schemaIri);
    if (expectedShort === shortName) return cleanIRI(schemaIri);
  }
  return null;
}

function toXsdDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function parseXsdDateTime(value: string | undefined): Date | null {
  if (!value) return null;
  try {
    return new Date(value);
  } catch {
    return null;
  }
}

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
  activationState?: string;
  attemptState?: string;
  performanceState?: string;
  deonticState?: string;
};

type FieldViolation = {
  violatedField: string;
  violatedPolicy: string;
  violationType?: string;
  violationReason?: string;
  observedCount?: number;
  allowedLimit?: number;
  requesterWebId?: string;
  allowedAssignee?: string;
  currentTime?: string;
  policyDate?: string;
};

type AccessLogEntry = {
  id: string;
  accessId: string;
  startedAt: Date | null;
  app: string;
  decision: 'ALLOWED' | 'VIOLATION';
  accessMethod: string;
  accessedResource: string;
  requesterWebId?: string;
  fields: AccessedField[];
  policyEvaluations: PolicyEvaluation[];
  violations: FieldViolation[];
  hasSensitiveData: boolean;
  violatedPolicies: string[];
  activationState?: string;
  attemptState?: string;
  performanceState?: string;
  deonticState?: string;
};

type ConstraintType = 'count' | 'timeWindow' | 'location' | 'recipient' | 'temporal';
type ConstraintOperator = 'lteq' | 'gteq' | 'eq' | 'isAnyOf';

type PolicyConstraint = {
  type: ConstraintType;
  operator: ConstraintOperator;
  value: string | number | Date;
  unit?: 'hours' | 'days' | 'km' | 'version';
  applicableActions?: string[];
};

type Policy = {
  id: string;
  identifier?: string;
  title: string;
  description: string;
  targetField: string;
  targetIRI?: string;
  active: boolean;
  actions: string[];
  prohibitions?: string[];
  constraints: PolicyConstraint[];
  createdAt?: Date;
  assignee?: string;
  assigner?: string;
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
  actionType?: string;
};

type StateOfTheWorld = {
  id: string;
  currentTime: Date | null;
  currentLocation: string;
  counts: SotwCount[];
};

function createDefaultConstraint(type: ConstraintType = 'count'): PolicyConstraint {
  switch (type) {
    case 'count':
      return { type: 'count', operator: 'lteq', value: 1 };
    case 'recipient':
      return { type: 'recipient', operator: 'eq', value: '' };
    case 'temporal': {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      return { type: 'temporal', operator: 'lteq', value: d };
    }
    case 'location':
      return { type: 'location', operator: 'eq', value: '' };
    case 'timeWindow':
      return { type: 'timeWindow', operator: 'lteq', value: 24 };
    default:
      return { type: 'count', operator: 'lteq', value: 1 };
  }
}

function getFirstValue(values: string[]): string {
  return values[0] || '';
}

function parseAccessLogEntry(thing: any, dataset: SolidDataset): AccessLogEntry | null {
  try {
    const types = getUrlAll(thing, `${RDF}type`);
    const isActivity = types.some((t: string) => t.includes('Activity'));
    const isPermissionReport = types.some((t: string) => t.includes('PermissionReport'));
    if (!isActivity && !isPermissionReport) return null;

    const deonticState = getStringNoLocaleAll(thing, `${REPORT}deonticState`)[0];
    let decision: 'ALLOWED' | 'VIOLATION';
    if (deonticState) {
      decision = deonticState.includes('Violated') ? 'VIOLATION' : 'ALLOWED';
    } else {
      const legacyDecision = getStringNoLocaleAll(thing, `${REPORT}decision`)[0];
      if (legacyDecision) {
        decision = legacyDecision.toUpperCase().includes('VIOLATION') ? 'VIOLATION' : 'ALLOWED';
      } else {
        decision = 'ALLOWED';
      }
    }

    const accessId = thing.url.split('#').pop() ?? thing.url;
    const startedAt = getDatetime(thing, `${PROV}startedAtTime`) ?? null;
    const app = extractAppFromThing(thing);

    const accessMethod = getStringNoLocaleAll(thing, `${REPORT}requestedAction`)[0]
      || getStringNoLocaleAll(thing, `${REPORT}accessMethod`)[0]
      || getStringNoLocaleAll(thing, `${ODRL}action`)[0]
      || 'read';
    
    const accessedResource = cleanIRI(
      getUrlAll(thing, `${REPORT}accessedResource`)[0]
      || getUrlAll(thing, `${PROV}used`)[0]
      || ''
    );

    const requesterWebId = cleanIRI(getUrlAll(thing, `${REPORT}requesterWebID`)[0] || '');

    const activationState = getStringNoLocaleAll(thing, `${REPORT}activationState`)[0];
    const attemptState = getStringNoLocaleAll(thing, `${REPORT}attemptState`)[0];
    const performanceState = getStringNoLocaleAll(thing, `${REPORT}performanceState`)[0];

    const fields: AccessedField[] = [];
    const fieldsBundle = getUrlAll(thing, `${REPORT}hasFieldsBundle`)[0]
      ?? getUrlAll(thing, `${EX}hasFieldsBundle`)[0];
    
    if (fieldsBundle) {
      getThingAll(dataset).forEach((fieldThing: any) => {
        const fieldTypes = getUrlAll(fieldThing, `${RDF}type`);
        if (!fieldTypes.some((t: string) => t.includes('AccessedDataField'))) return;
        const belongsToBundle = getUrlAll(fieldThing, `${REPORT}belongsToBundle`)[0]
          ?? getUrlAll(fieldThing, `${EX}belongsToBundle`)[0];
        if (!bundlesMatch(belongsToBundle, fieldsBundle)) return;

        const rawIri = getFirstValue(getUrlAll(fieldThing, `${REPORT}fieldIRI`))
          || getFirstValue(getUrlAll(fieldThing, `${EX}fieldIRI`))
          || '';
        
        const fieldNameFromRdf = getFirstValue(getStringNoLocaleAll(fieldThing, `${REPORT}fieldName`))
          || getFirstValue(getStringNoLocaleAll(fieldThing, `${EX}fieldName`))
          || '';
        
        const fieldValue = getFirstValue(getStringNoLocaleAll(fieldThing, `${REPORT}fieldValue`))
          || getFirstValue(getStringNoLocaleAll(fieldThing, `${EX}fieldValue`))
          || '';
        
        const isSensitiveStr = getFirstValue(getStringNoLocaleAll(fieldThing, `${REPORT}isSensitive`))
          || getFirstValue(getStringNoLocaleAll(fieldThing, `${EX}isSensitive`))
          || 'false';
        const isSensitive = isSensitiveStr.toLowerCase() === 'true';
        
        const dataCategory = getFirstValue(getUrlAll(fieldThing, `${REPORT}dataCategory`))
          || getFirstValue(getUrlAll(fieldThing, `${EX}dataCategory`))
          || `${DPV}PersonalData`;
        
        const personalDataType = getFirstValue(getUrlAll(fieldThing, `${REPORT}personalDataType`))
          || getFirstValue(getUrlAll(fieldThing, `${EX}personalDataType`))
          || `${DPV}Data`;

        const cleanFieldIri = cleanIRI(rawIri);
        const finalFieldName = fieldNameFromRdf || getFieldLabel(cleanFieldIri);

        fields.push({
          fieldIri: cleanFieldIri,
          fieldName: finalFieldName,
          fieldValue,
          isSensitive,
          dataCategory: cleanIRI(dataCategory),
          personalDataType: cleanIRI(personalDataType),
        });
      });
    }

    const policyEvaluations: PolicyEvaluation[] = [];
    const evaluatedPolicies = getUrlAll(thing, `${REPORT}rule`);
    evaluatedPolicies.forEach((policyUrl: string) => {
      policyEvaluations.push({
        evaluatedPolicy: cleanIRI(policyUrl),
        evaluationResult: decision,
        evaluationReason: decision === 'VIOLATION' ? 'Policy constraint violated' : 'Compliant access',
        targetAsset: accessedResource,
        activationState,
        attemptState,
        performanceState,
        deonticState,
      });
    });

    const violations: FieldViolation[] = [];
    const violatedPolicies: string[] = [];

    if (decision === 'VIOLATION') {
      evaluatedPolicies.forEach(p => violatedPolicies.push(cleanIRI(p)));

      const violationBundle = getUrlAll(thing, `${REPORT}hasViolationBundle`)[0];
      if (violationBundle) {
        getThingAll(dataset).forEach((violThing: any) => {
          const violTypes = getUrlAll(violThing, `${RDF}type`);
          if (!violTypes.some((t: string) => t.includes('PolicyViolation'))) return;
          
          const belongsToVBundle = getUrlAll(violThing, `${REPORT}belongsToBundle`)[0];
          if (!bundlesMatch(belongsToVBundle, violationBundle)) return;

          const violatedPolicyUrls = getUrlAll(violThing, `${REPORT}violatedPolicy`);
          violatedPolicyUrls.forEach(p => {
            const cleanP = cleanIRI(p);
            if (!violatedPolicies.includes(cleanP)) violatedPolicies.push(cleanP);
          });

          const fieldViolationUrls = getUrlAll(violThing, `${REPORT}hasFieldViolation`);
          fieldViolationUrls.forEach(fvUrl => {
            const fvThing = getThingAll(dataset).find((t: any) => 
              cleanIRI(t.url) === cleanIRI(fvUrl)
            );
            if (!fvThing) return;

            const violatedField = cleanIRI(getFirstValue(getUrlAll(fvThing, `${REPORT}violatedField`)));
            const violatedPolicy = cleanIRI(getFirstValue(getUrlAll(fvThing, `${REPORT}violatedPolicy`)));
            const violationType = getFirstValue(getStringNoLocaleAll(fvThing, `${REPORT}violationType`));
            const violationReason = getFirstValue(getStringNoLocaleAll(fvThing, `${REPORT}violationReason`));
            const observedCount = getInteger(fvThing, `${REPORT}observedCount`) ?? undefined;
            const allowedLimit = getInteger(fvThing, `${REPORT}allowedLimit`) ?? undefined;
            const fvRequesterWebId = cleanIRI(getFirstValue(getUrlAll(fvThing, `${REPORT}requesterWebID`)));
            const allowedAssignee = cleanIRI(getFirstValue(getUrlAll(fvThing, `${REPORT}allowedAssignee`)));
            const currentTime = getFirstValue(getStringNoLocaleAll(fvThing, `${REPORT}currentTime`));
            const policyDate = getFirstValue(getStringNoLocaleAll(fvThing, `${REPORT}policyDate`));

            violations.push({
              violatedField,
              violatedPolicy,
              violationType,
              violationReason,
              observedCount,
              allowedLimit,
              requesterWebId: fvRequesterWebId,
              allowedAssignee,
              currentTime,
              policyDate,
            });
          });
        });
      }

      if (violations.length === 0) {
        fields.filter(f => f.isSensitive).forEach(f => {
          violations.push({
            violatedField: f.fieldIri,
            violatedPolicy: violatedPolicies[0] || 'unknown',
            violationType: 'sensitive-data',
            violationReason: 'Sensitive data access violation',
          });
        });
      }
    }

    return {
      id: thing.url,
      accessId,
      startedAt,
      app,
      decision,
      accessMethod: cleanIRI(accessMethod),
      accessedResource,
      requesterWebId,
      fields,
      policyEvaluations,
      violations,
      hasSensitiveData: fields.some((f) => f.isSensitive),
      violatedPolicies,
      activationState,
      attemptState,
      performanceState,
      deonticState,
    };
  } catch (err) {
    console.error('Error parsing access log entry:', err);
    return null;
  }
}

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
        const actionType = getStringNoLocaleAll(countThing, `${ODRL}action`)[0]
          || getStringNoLocaleAll(countThing, `${SOTW}actionType`)[0];

        if (target) {
          const newCount: SotwCount = {
            targetField: shortIri(target),
            targetIRI: target,
            countValue,
            actionType: actionType ? cleanIRI(actionType) : undefined,
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
    actions: ['ex:read'],
    constraints: [createDefaultConstraint('count')],
    assignee: '',
  });

  const [privacyMappings, setPrivacyMappings] = useState<PrivacyMapping[]>([]);
  const [loadingPrivacy, setLoadingPrivacy] = useState(false);

  const [selectedAppHistory, setSelectedAppHistory] = useState<{ appName: string; logs: AccessLogEntry[] } | null>(null);

  const [search, setSearch] = useState('');
  const [sensitivity, setSensitivity] = useState<'all' | 'sensitive' | 'normal'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7' | '30'>('all');
  const [appFilter, setAppFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'allowed' | 'violation'>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

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

      console.log(`📊 Parsed ${parsed.length} entries, ${parsed.filter(l => l.decision === 'VIOLATION').length} VIOLATION`);
      parsed.forEach((entry, i) => {
        console.log(`  [${i+1}] ${entry.accessId} | ${entry.app} | ${entry.decision} | fields: ${entry.fields.length} | violations: ${entry.violations.length}`);
      });

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
        const identifier = getStringNoLocaleAll(thing, `${DCT}identifier`)[0];
        const target = cleanIRI(getUrlAll(thing, `${ODRL}target`)[0] || '');
        const active = getBoolean(thing, `${REPORT}policyActive`) ?? true;
        const createdAt = getDatetime(thing, `${DCT}created`) ?? undefined;
        const assignee = cleanIRI(getUrlAll(thing, `${ODRL}assignee`)[0] || '');

        const actions: string[] = [];
        const prohibitions: string[] = [];
        const constraints: PolicyConstraint[] = [];

        const permissions = getUrlAll(thing, `${ODRL}permission`);
        permissions.forEach((permUrl: string) => {
          const permThing = getThingAll(dataset).find((t: any) => t.url === permUrl);
          if (permThing) {
            const actionUrls = getUrlAll(permThing, `${ODRL}action`);
            actionUrls.forEach((action: string) => {
              const cleanAction = cleanIRI(action);
              if (!actions.includes(cleanAction)) actions.push(cleanAction);
            });

            const constraintUrls = getUrlAll(permThing, `${ODRL}constraint`);
            constraintUrls.forEach((cUrl: string) => {
              const cThing = getThingAll(dataset).find((t: any) => t.url === cUrl);
              if (cThing) {
                const leftOperand = cleanIRI(getUrlAll(cThing, `${ODRL}leftOperand`)[0] || '');
                const op = cleanIRI(getUrlAll(cThing, `${ODRL}operator`)[0] || '');
                const rightOperandStr = getStringNoLocaleAll(cThing, `${ODRL}rightOperand`)[0];
                const rightOperandInt = getInteger(cThing, `${ODRL}rightOperand`);

                if (leftOperand.includes('count')) {
                  constraints.push({
                    type: 'count',
                    operator: (op.includes('lteq') ? 'lteq' : op.includes('gteq') ? 'gteq' : 'eq') as ConstraintOperator,
                    value: rightOperandInt ?? 0,
                  });
                } else if (leftOperand.includes('assignee') || leftOperand.includes('recipient')) {
                  const recipientValue = rightOperandStr || getUrlAll(cThing, `${ODRL}rightOperand`)[0] || '';
                  constraints.push({
                    type: 'recipient',
                    operator: 'eq' as ConstraintOperator,
                    value: cleanIRI(recipientValue),
                  });
                } else if (leftOperand.includes('dateTime') || leftOperand.includes('date')) {
                  const dateValue = rightOperandStr || '';
                  constraints.push({
                    type: 'temporal',
                    operator: (op.includes('lteq') ? 'lteq' : op.includes('gteq') ? 'gteq' : 'eq') as ConstraintOperator,
                    value: dateValue,
                  });
                } else if (leftOperand.includes('spatial')) {
                  constraints.push({
                    type: 'location',
                    operator: 'eq' as ConstraintOperator,
                    value: rightOperandStr || '',
                  });
                }
              }
            });
          }
        });

        const prohibitionUrls = getUrlAll(thing, `${ODRL}prohibition`);
        prohibitionUrls.forEach((prohibUrl: string) => {
          const prohibThing = getThingAll(dataset).find((t: any) => t.url === prohibUrl);
          if (prohibThing) {
            const actionUrls = getUrlAll(prohibThing, `${ODRL}action`);
            actionUrls.forEach((action: string) => {
              const cleanAction = cleanIRI(action);
              if (!prohibitions.includes(cleanAction)) prohibitions.push(cleanAction);
            });
          }
        });

        if (actions.length === 0) actions.push(`${EX}read`);
        if (constraints.length === 0) {
          constraints.push(createDefaultConstraint('count'));
        }

        parsed.push({
          id: thing.url,
          identifier,
          title,
          description,
          targetField: shortIri(target),
          targetIRI: target,
          active,
          actions,
          prohibitions,
          constraints,
          createdAt,
          assignee,
        });
      });
      setPolicies(parsed);
      console.log('✅ Loaded policies:', parsed.length);
    } catch (err) {
      console.error('Failed to load policies:', err);
      setPolicies([
        {
          id: 'default-bloodtype',
          identifier: generatePolicyIdentifier(),
          title: 'Blood Type Access Limit',
          description: 'Limit bloodType access to 1 per session',
          targetField: 'bloodType',
          targetIRI: 'https://schema.org/bloodType',
          active: true,
          actions: ['ex:read'],
          constraints: [createDefaultConstraint('count')],
        },
      ]);
    } finally {
      setLoadingPolicies(false);
    }
  };

  useEffect(() => { loadPolicies(); }, [session]);

  const loadPrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    setLoadingPrivacy(true);
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;

      let savedMappings: PrivacyMapping[] = [];
      try {
        const dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch });
        getThingAll(dataset).forEach((thing: any) => {
          const parsed = parsePrivacyMapping(thing);
          if (parsed) savedMappings.push(parsed);
        });
      } catch (e: any) {
        if (e?.status === 404 || e?.statusCode === 404) {
          const fallbackUrl = mappingUrl.replace('.jsonld', '.ttl');
          try {
            const dataset = await getSolidDataset(fallbackUrl, { fetch: session.fetch });
            getThingAll(dataset).forEach((thing: any) => {
              const parsed = parsePrivacyMapping(thing);
              if (parsed) savedMappings.push(parsed);
            });
          } catch {
            console.log('Privacy mapping file not found. Will create on save.');
          }
        }
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
    } catch (err) {
      console.error('Error loading privacy mappings:', err);
    } finally {
      setLoadingPrivacy(false);
    }
  };

  useEffect(() => { loadPrivacyMappings(); }, [session]);

  const savePolicy = async (policy: Policy) => {
    if (!session?.info?.webId) return;
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;

      let dataset: SolidDataset;
      try {
        dataset = await getSolidDataset(policyUrl, { fetch: session.fetch });
      } catch {
        dataset = createSolidDataset();
      }

      const policySubjectUrl = editingPolicy?.id
        ? editingPolicy.id
        : `${EX_BASE}policy-${policy.targetField.replace(/[^a-z0-9]/gi, '-')}-${Math.random().toString(36).slice(2, 10)}`;

      let policyThing = createThing({ url: policySubjectUrl });
      policyThing = setUrl(policyThing, `${RDF}type`, `${ODRL}Policy`);

      if (!policy.identifier) policy.identifier = generatePolicyIdentifier();
      policyThing = setStringNoLocale(policyThing, `${DCT}identifier`, policy.identifier);
      policyThing = setStringNoLocale(policyThing, `${DCT}title`, policy.title);
      policyThing = setStringNoLocale(policyThing, `${DCT}description`, policy.description || '');

      const createdDate = policy.createdAt || new Date();
      policyThing = setDatetime(policyThing, `${DCT}created`, new Date(toXsdDateTime(createdDate)));
      policyThing = setUrl(policyThing, `${DCT}creator`, `${EX_BASE}pod-owner`);
      policyThing = setUrl(policyThing, `${ODRL}profile`, 'https://w3id.org/dpv/odrl');

      const fullTargetIri = Object.keys(FIELD_LABELS).find(iri => shortIri(cleanIRI(iri)) === policy.targetField) || policy.targetField;
      policyThing = setUrl(policyThing, `${ODRL}target`, fullTargetIri);
      policyThing = setBoolean(policyThing, `${REPORT}policyActive`, policy.active);

      if (policy.assignee) {
        policyThing = setUrl(policyThing, `${ODRL}assignee`, cleanIRI(policy.assignee));
      }

      if (policy.constraints?.length > 0 && policy.actions?.length > 0) {
        policy.actions.forEach((action, idx) => {
          const permissionUrl = `${policySubjectUrl}#permission-${idx}`;
          const permissionThing = createThing({ url: permissionUrl });

          setUrl(permissionThing, `${ODRL}assigner`, `${EX_BASE}pod-owner`);
          setUrl(permissionThing, `${ODRL}assignee`, policy.assignee ? cleanIRI(policy.assignee) : `${EX_BASE}any-app`);
          setUrl(permissionThing, `${ODRL}action`, action);

          policy.constraints.forEach((constraint, cIdx) => {
            const constraintUrl = `${policySubjectUrl}#constraint-${idx}-${cIdx}`;
            const constraintThing = createThing({ url: constraintUrl });

            if (constraint.type === 'count') {
              setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}count`);
              setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
              setInteger(constraintThing, `${ODRL}rightOperand`, Number(constraint.value));
            } else if (constraint.type === 'recipient') {
              setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}assignee`);
              setUrl(constraintThing, `${ODRL}operator`, `${ODRL}eq`);
              setUrl(constraintThing, `${ODRL}rightOperand`, cleanIRI(String(constraint.value)));
            } else if (constraint.type === 'temporal') {
              setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}dateTime`);
              setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
              const dateValue = constraint.value instanceof Date
                ? toXsdDateTime(constraint.value)
                : String(constraint.value);
              setStringNoLocale(constraintThing, `${ODRL}rightOperand`, dateValue);
            } else if (constraint.type === 'location') {
              setUrl(constraintThing, `${ODRL}leftOperand`, `${ODRL}spatial`);
              setUrl(constraintThing, `${ODRL}operator`, `${ODRL}eq`);
              setStringNoLocale(constraintThing, `${ODRL}rightOperand`, String(constraint.value));
            } else if (constraint.type === 'timeWindow') {
              setUrl(constraintThing, `${ODRL}leftOperand`, `${EX_BASE}timeWindow`);
              setUrl(constraintThing, `${ODRL}operator`, `${ODRL}${constraint.operator}`);
              setInteger(constraintThing, `${ODRL}rightOperand`, Number(constraint.value));
            }

            setUrl(permissionThing, `${ODRL}constraint`, constraintThing.url);
            dataset = setThing(dataset, constraintThing);
          });

          setUrl(policyThing, `${ODRL}permission`, permissionThing.url);
          dataset = setThing(dataset, permissionThing);
        });

        const prohibitionUrl = `${policySubjectUrl}#prohibition`;
        const prohibitionThing = createThing({ url: prohibitionUrl });
        setUrl(prohibitionThing, `${ODRL}assignee`, `${EX_BASE}any-app`);
        setUrl(prohibitionThing, `${ODRL}action`, `${ODRL}distribute`);
        setUrl(policyThing, `${ODRL}prohibition`, prohibitionThing.url);
        dataset = setThing(dataset, prohibitionThing);
      }

      if (editingPolicy && editingPolicy.id !== policySubjectUrl) {
        dataset = removeThing(dataset, editingPolicy.id);
      }

      dataset = setThing(dataset, policyThing);
      await saveSolidDatasetAt(policyUrl, dataset, { fetch: session.fetch });

      toast({ title: 'Policy saved', description: `${policy.title} ${editingPolicy ? 'updated' : 'created'}`, status: 'success' });
      await loadPolicies();
    } catch (err: any) {
      console.error('Failed to save policy:', err);
      toast({
        title: 'Failed to save policy',
        description: err?.message || 'Unknown error',
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
      throw err;
    }
  };

  const deletePolicy = async (policy: Policy) => {
    if (!session?.info?.webId) return;
    if (!window.confirm(`Are you sure you want to delete policy "${policy.title}"?`)) return;

    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const policyUrl = `${podUrls[0]}${POLICY_PATH}`;
      const dataset = await getSolidDataset(policyUrl, { fetch: session.fetch });

      const updatedDataset = removeThing(dataset, policy.id);
      await saveSolidDatasetAt(policyUrl, updatedDataset, { fetch: session.fetch });

      toast({ title: 'Policy deleted', description: `${policy.title} has been deleted`, status: 'success' });
      await loadPolicies();
    } catch (err: any) {
      console.error('Failed to delete policy:', err);
      toast({
        title: 'Failed to delete policy',
        description: err?.message || 'Unknown error',
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
    }
  };

  const savePrivacyMappings = async () => {
    if (!session?.info?.webId) return;
    try {
      const podUrls = await getPodUrlAll(session.info.webId!, { fetch: session.fetch });
      const mappingUrl = `${podUrls[0]}${PRIVACY_MAPPING_PATH}`;

      let dataset: SolidDataset;
      try {
        dataset = await getSolidDataset(mappingUrl, { fetch: session.fetch });
      } catch (err: any) {
        if (err?.status === 404) dataset = createSolidDataset();
        else throw err;
      }

      privacyMappings.forEach((mapping) => {
        const shortName = schemaToExShort(mapping.fieldIri);
        const subjectUrl = `${EX}${shortName}`;

        let thing = getThingAll(dataset).find((t: any) => cleanIRI(t.url) === cleanIRI(subjectUrl));
        if (!thing) thing = createThing({ url: subjectUrl });

        thing = setUrl(thing, `${RDF}type`, `${DPV}PersonalData`);
        thing = setStringNoLocale(thing, `${SKOS}prefLabel`, mapping.fieldLabel);
        thing = setUrl(thing, `${DPV}hasPersonalData`, cleanIRI(mapping.personalDataType));
        thing = setUrl(thing, `${DPV}hasDataCategory`, cleanIRI(mapping.dataCategory));
        if (mapping.domain) thing = setStringNoLocale(thing, `${EX}domain`, mapping.domain);

        dataset = setThing(dataset, thing);
      });

      await saveSolidDatasetAt(mappingUrl, dataset, { fetch: session.fetch });
      toast({ title: 'Success', description: 'Privacy settings saved', status: 'success' });
      await loadPrivacyMappings();
      onPrivacyModalClose();
    } catch (err: any) {
      console.error('Failed to save privacy mappings:', err);
      toast({
        title: 'Failed to save privacy settings',
        description: err?.message || 'Unknown error',
        status: 'error',
        duration: 7000,
        isClosable: true,
      });
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
        log.fields.some((f) => f.fieldName.toLowerCase().includes(q) || f.fieldValue.toLowerCase().includes(q))
      );
    });
  }, [logs, search, sensitivity, dateFilter, appFilter, decisionFilter]);

  const violationSummaryData = useMemo(() => {
    const violationLogs = filteredLogs.filter((l) => l.decision === 'VIOLATION' || l.violations.length > 0);
    const grouped: Record<string, AccessLogEntry[]> = {};

    violationLogs.forEach(log => {
      if (!grouped[log.app]) grouped[log.app] = [];
      grouped[log.app].push(log);
    });

    return Object.keys(grouped).map(appName => {
      const appLogs = grouped[appName];
      appLogs.sort((a, b) => {
        const timeA = a.startedAt ? a.startedAt.getTime() : 0;
        const timeB = b.startedAt ? b.startedAt.getTime() : 0;
        return timeB - timeA;
      });
      const latestLog = appLogs[0];

      let violatedPolicyId = 'unknown';
      if (latestLog.violations.length > 0) {
        violatedPolicyId = latestLog.violations[0].violatedPolicy;
      } else if (latestLog.violatedPolicies.length > 0) {
        violatedPolicyId = latestLog.violatedPolicies[0];
      } else if (latestLog.fields.some(f => f.isSensitive)) {
        const firstSensitiveField = latestLog.fields.find(f => f.isSensitive);
        if (firstSensitiveField) violatedPolicyId = firstSensitiveField.fieldIri;
      }

      return { appName, count: appLogs.length, latestTime: latestLog.startedAt, violatedPolicyId, logs: appLogs };
    });
  }, [filteredLogs]);

  const totalPages = Math.ceil(violationSummaryData.length / rowsPerPage);
  const currentSummaryData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return violationSummaryData.slice(start, start + rowsPerPage);
  }, [violationSummaryData, currentPage]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };

  const handleViewHistory = (appName: string) => {
    const summaryItem = violationSummaryData.find(item => item.appName === appName);
    if (summaryItem) {
      setSelectedAppHistory({ appName: summaryItem.appName, logs: summaryItem.logs });
      onDetailModalOpen();
    }
  };

  const findPolicyByViolation = (violatedPolicyIdentifier: string): Policy | undefined => {
    if (!violatedPolicyIdentifier || violatedPolicyIdentifier === 'unknown') return undefined;
    const cleanIdentifier = cleanIRI(violatedPolicyIdentifier);

    const byIdentifier = policies.find(p => p.identifier && cleanIRI(p.identifier) === cleanIdentifier);
    if (byIdentifier) return byIdentifier;

    const byTarget = policies.find(p => cleanIRI(p.targetIRI || '') === cleanIdentifier);
    if (byTarget) return byTarget;

    const byId = policies.find(p => cleanIRI(p.id) === cleanIdentifier);
    if (byId) return byId;

    const shortName = shortIri(cleanIdentifier);
    const byShort = policies.find(p => p.targetField === shortName);
    if (byShort) return byShort;

    return undefined;
  };

  const handleAddPolicy = () => {
    setEditingPolicy(null);
    setNewPolicy({
      title: '',
      description: '',
      targetField: '',
      targetIRI: '',
      active: true,
      actions: ['ex:read'],
      constraints: [createDefaultConstraint('count')],
      assignee: '',
    });
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
      identifier: editingPolicy?.identifier,
      title: newPolicy.title!,
      description: newPolicy.description || '',
      targetField: newPolicy.targetField!,
      targetIRI: editingPolicy?.targetIRI || newPolicy.targetField,
      active: newPolicy.active ?? true,
      actions: newPolicy.actions || ['ex:read'],
      constraints: newPolicy.constraints || [createDefaultConstraint('count')],
      createdAt: editingPolicy?.createdAt || new Date(),
      assignee: newPolicy.assignee,
    };
    await savePolicy(policyToSave);
    onPolicyModalClose();
  };

  const handleToggleSensitivity = (fieldIri: string, newValue: boolean) => {
    setPrivacyMappings((prev) => prev.map((m) => {
      if (cleanIRI(m.fieldIri) === cleanIRI(fieldIri)) {
        const newCategory = newValue ? `${DPV}SensitivePersonalData` : `${DPV}PersonalData`;
        return { ...m, isSensitive: newValue, dataCategory: cleanIRI(newCategory) };
      }
      return m;
    }));
  };

  const formatConstraint = (c: PolicyConstraint): string => {
    if (c.type === 'count') return `Count ${c.operator} ${c.value}`;
    if (c.type === 'recipient') return `Recipient: ${shortIri(String(c.value))}`;
    if (c.type === 'temporal') {
      const dateStr = c.value instanceof Date ? c.value.toLocaleString() : String(c.value);
      return `Valid ${c.operator === 'lteq' ? 'until' : 'from'} ${dateStr}`;
    }
    if (c.type === 'timeWindow') return `Time ${c.operator} ${c.value}h`;
    if (c.type === 'location') return `Location: ${c.value}`;
    return `${c.type}: ${c.value}`;
  };

  const updateConstraintAtIndex = (idx: number, updates: Partial<PolicyConstraint>) => {
    setNewPolicy((p) => {
      const nc = [...(p.constraints || [])];
      nc[idx] = { ...nc[idx], ...updates } as PolicyConstraint;
      return { ...p, constraints: nc };
    });
  };

  const formatViolationReason = (v: FieldViolation): string => {
    if (v.violationType === 'count') {
      return `Count: ${v.observedCount} > ${v.allowedLimit}`;
    }
    if (v.violationType === 'recipient') {
      return `Unauthorized app: ${shortIri(v.requesterWebId || 'unknown')}`;
    }
    if (v.violationType === 'temporal') {
      return `Temporal: ${v.violationReason}`;
    }
    return v.violationReason || 'Unknown violation';
  };

  return (
    <Box maxW="7xl" mx="auto" py={10} px={4}>
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

      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={4} mb={6}>
        <Card><CardBody><Stat><StatLabel>Total Access Events</StatLabel><StatNumber>{stats.total}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Policy Violations</StatLabel><StatNumber color={stats.violations > 0 ? 'red.500' : 'green.500'}>{stats.violations}</StatNumber><StatHelpText>{stats.total > 0 ? `${Math.round((stats.violations / stats.total) * 100)}%` : '0%'}</StatHelpText></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Sensitive Data Accessed</StatLabel><StatNumber color={stats.sensitive > 0 ? 'orange.500' : 'gray.500'}>{stats.sensitive}</StatNumber></Stat></CardBody></Card>
        <Card><CardBody><Stat><StatLabel>Unique Applications</StatLabel><StatNumber>{stats.apps}</StatNumber></Stat></CardBody></Card>
      </SimpleGrid>

      <Card mb={6}>
        <CardBody>
          <Flex justify="space-between" align="center" mb={4}>
            <Text fontWeight="medium">Filters</Text>
            <Button size="sm" leftIcon={<RepeatIcon />} onClick={loadAccessLogs} isLoading={loading}>Refresh Logs</Button>
          </Flex>
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

      {loading && <Flex justify="center" py={10}><Spinner size="xl" /></Flex>}
      {!loading && filteredLogs.length === 0 && <Alert status="info"><AlertIcon />No audit logs match the selected filters.</Alert>}

      {!loading && (
        <Tabs variant="enclosed" defaultIndex={0}>
          <TabList>
            <Tab>Violation Summary (Per App)</Tab>
            <Tab>All Access Logs</Tab>
            <Tab>State of the World</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <Card>
                <CardHeader>
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="bold">Violation Summary by Application</Text>
                    <Button size="sm" leftIcon={<RepeatIcon />} onClick={loadAccessLogs} isLoading={loading}>Refresh</Button>
                  </Flex>
                </CardHeader>
                <CardBody>
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th>Application</Th>
                        <Th>Violations</Th>
                        <Th>Last Violation</Th>
                        <Th>Policy Violated</Th>
                        <Th>Identifier</Th>
                        <Th>Action</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {currentSummaryData.length > 0 ? (
                        currentSummaryData.map((item) => {
                          const matchedPolicy = findPolicyByViolation(item.violatedPolicyId);
                          const policyTitle = matchedPolicy ? matchedPolicy.title : 'Unknown Policy';
                          const policyIdentifier = matchedPolicy?.identifier || shortIri(item.violatedPolicyId);

                          return (
                            <Tr key={item.appName} bg="red.50" _hover={{ bg: 'red.100' }}>
                              <Td fontWeight="bold" textTransform="capitalize">{item.appName}</Td>
                              <Td><Badge colorScheme="red">{item.count}</Badge></Td>
                              <Td>{item.latestTime?.toLocaleString()}</Td>
                              <Td>{policyTitle}</Td>
                              <Td><Code fontSize="xs">{policyIdentifier}</Code></Td>
                              <Td>
                                <Button size="xs" colorScheme="blue" onClick={() => handleViewHistory(item.appName)}>View History</Button>
                              </Td>
                            </Tr>
                          );
                        })
                      ) : (
                        <Tr>
                          <Td colSpan={6} textAlign="center">
                            {logs.filter(l => l.decision === 'VIOLATION').length > 0 ? 'Violations exist but filtered out.' : 'No violations recorded'}
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

            <TabPanel>
              <Card>
                <CardHeader>
                  <Flex justify="space-between" align="center">
                    <Text fontWeight="bold">All Access Logs ({filteredLogs.length})</Text>
                    <Button size="sm" leftIcon={<RepeatIcon />} onClick={loadAccessLogs} isLoading={loading}>Refresh</Button>
                  </Flex>
                </CardHeader>
                <CardBody>
                  <Table variant="simple" size="sm">
                    <Thead>
                      <Tr>
                        <Th>Time</Th>
                        <Th>App</Th>
                        <Th>Decision</Th>
                        <Th>Action</Th>
                        <Th>Fields</Th>
                        <Th>Violations</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {filteredLogs.slice(0, 50).map((log) => (
                        <Tr key={log.id} bg={log.decision === 'VIOLATION' ? 'red.50' : 'white'}>
                          <Td fontSize="xs">{log.startedAt?.toLocaleString()}</Td>
                          <Td fontWeight="medium">{log.app}</Td>
                          <Td>
                            <Badge colorScheme={log.decision === 'VIOLATION' ? 'red' : 'green'}>
                              {log.decision}
                            </Badge>
                          </Td>
                          <Td><Code fontSize="xs">{shortIri(log.accessMethod)}</Code></Td>
                          <Td>
                            <VStack align="start" spacing={0}>
                              {log.fields.slice(0, 3).map((f, i) => (
                                <Text key={i} fontSize="xs">
                                  {f.isSensitive && <Badge colorScheme="red" fontSize="2xs" mr={1}>S</Badge>}
                                  {f.fieldName}
                                </Text>
                              ))}
                              {log.fields.length > 3 && <Text fontSize="xs" color="gray.500">+{log.fields.length - 3} more</Text>}
                            </VStack>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={0}>
                              {log.violations.slice(0, 2).map((v, i) => (
                                <Tooltip key={i} label={v.violationReason}>
                                  <Tag size="sm" colorScheme={v.violationType === 'recipient' ? 'orange' : v.violationType === 'count' ? 'purple' : 'red'}>
                                    {v.violationType || 'unknown'}
                                  </Tag>
                                </Tooltip>
                              ))}
                            </VStack>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </CardBody>
              </Card>
            </TabPanel>

            <TabPanel>
              <Card>
                <CardHeader>
                  <Flex justify="space-between" align="center">
                    <VStack align="start" spacing={1}>
                      <Text fontWeight="bold">State of the World (SOTW)</Text>
                      {sotwData && <Text fontSize="sm" color="gray.500">ID: ex:sotw-current</Text>}
                    </VStack>
                    <Button size="sm" colorScheme="blue" onClick={loadStateOfTheWorld} isLoading={loadingSotw}>Refresh</Button>
                  </Flex>
                </CardHeader>
                <CardBody>
                  {loadingSotw ? <Flex justify="center" py={10}><Spinner /></Flex> : sotwData ? (
                    <VStack align="stretch" spacing={4}>
                      <Flex gap={4} p={4} bg="gray.50" borderRadius="md">
                        <Box flex={1}>
                          <Text fontSize="xs" color="gray.600">Current Time</Text>
                          <Text fontWeight="medium">{sotwData.currentTime?.toLocaleString() || 'N/A'}</Text>
                        </Box>
                        <Box flex={1}>
                          <Text fontSize="xs" color="gray.600">Current Location</Text>
                          <Tag size="sm" colorScheme="purple">{shortIri(sotwData.currentLocation)}</Tag>
                        </Box>
                      </Flex>
                      <Divider />
                      <Text fontWeight="medium">Access Counts</Text>
                      <Table variant="simple" size="sm">
                        <Thead>
                          <Tr>
                            <Th>Field Name</Th>
                            <Th>Count Value</Th>
                            <Th>Target IRI</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {sotwData.counts.map((count) => (
                            <Tr key={count.targetIRI}>
                              <Td fontWeight="medium">{getFieldLabel(count.targetIRI)}</Td>
                              <Td><Badge colorScheme={count.countValue > 0 ? 'red' : 'gray'}>{count.countValue}</Badge></Td>
                              <Td><Code fontSize="xs">{shortIri(count.targetIRI)}</Code></Td>
                            </Tr>
                          ))}
                        </Tbody>
                      </Table>
                    </VStack>
                  ) : <Alert status="warning"><AlertIcon />No SOTW data available.</Alert>}
                </CardBody>
              </Card>
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}

      <Modal isOpen={isDetailModalOpen} onClose={onDetailModalClose} size="6xl">
        <ModalOverlay />
        <ModalContent bg="white" color="gray.800">
          <ModalHeader borderBottom="1px solid" borderColor="gray.200">
            Violation History: {selectedAppHistory?.appName}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {selectedAppHistory && (
              <VStack align="stretch" spacing={4}>
                <Text fontSize="sm" color="gray.600">
                  Showing {selectedAppHistory.logs.length} violation event(s) for <strong>{selectedAppHistory.appName}</strong>.
                </Text>

                <Table variant="simple" size="sm">
                  <Thead bg="gray.50">
                    <Tr>
                      <Th>Time</Th>
                      <Th>Requester</Th>
                      <Th>Policy</Th>
                      <Th>Deontic State</Th>
                      <Th>Violation Type</Th>
                      <Th>Details</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {selectedAppHistory.logs.map((log) => {
                      let violatedPolicyId = 'unknown';
                      if (log.violations.length > 0) violatedPolicyId = log.violations[0].violatedPolicy;
                      else if (log.violatedPolicies.length > 0) violatedPolicyId = log.violatedPolicies[0];

                      const matchedPolicy = findPolicyByViolation(violatedPolicyId);
                      const policyTitle = matchedPolicy ? matchedPolicy.title : 'Unknown Policy';

                      return (
                        <Tr key={log.id} bg="red.50">
                          <Td fontSize="xs">{log.startedAt?.toLocaleString()}</Td>
                          <Td>
                            <Tooltip label={log.requesterWebId}>
                              <Text fontSize="xs" maxW="150px" isTruncated>
                                {shortIri(log.requesterWebId || log.app)}
                              </Text>
                            </Tooltip>
                          </Td>
                          <Td><Text fontWeight="medium" color="red.600" fontSize="xs">{policyTitle}</Text></Td>
                          <Td>
                            <Badge colorScheme={log.deonticState?.includes('Violated') ? 'red' : 'green'}>
                              {shortIri(log.deonticState || log.decision)}
                            </Badge>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={1}>
                              {log.violations.map((v, i) => (
                                <Tag key={i} size="sm" colorScheme={
                                  v.violationType === 'recipient' ? 'orange' :
                                  v.violationType === 'count' ? 'purple' :
                                  v.violationType === 'temporal' ? 'blue' : 'red'
                                }>
                                  {v.violationType || 'unknown'}
                                </Tag>
                              ))}
                            </VStack>
                          </Td>
                          <Td>
                            <VStack align="start" spacing={1}>
                              {log.violations.map((v, i) => (
                                <Text key={i} fontSize="xs" maxW="300px">
                                  {getFieldLabel(v.violatedField)}: {formatViolationReason(v)}
                                </Text>
                              ))}
                              {log.violations.length === 0 && log.fields.some(f => f.isSensitive) && (
                                <Text fontSize="xs" color="orange.600">
                                  Sensitive fields: {log.fields.filter(f => f.isSensitive).map(f => f.fieldName).join(', ')}
                                </Text>
                              )}
                            </VStack>
                          </Td>
                        </Tr>
                      );
                    })}
                  </Tbody>
                </Table>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.200">
            <Button variant="ghost" onClick={onDetailModalClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isPolicyModalOpen} onClose={onPolicyModalClose} size="5xl">
        <ModalOverlay />
        <ModalContent bg="white" color="gray.800">
          <ModalHeader borderBottom="1px solid" borderColor="gray.200">Policy Management</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Accordion allowToggle defaultIndex={editingPolicy ? 0 : -1}>
              <AccordionItem>
                <AccordionButton _hover={{ bg: 'gray.50' }}>
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
                        onChange={(e) => setNewPolicy((p) => ({ ...p, title: e.target.value }))}
                        placeholder="e.g., Blood Type Access Limit"
                      />
                    </FormControl>

                    <FormControl>
                      <FormLabel>Description</FormLabel>
                      <Input
                        value={newPolicy.description || ''}
                        onChange={(e) => setNewPolicy((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Describe what this policy controls"
                      />
                    </FormControl>

                    {editingPolicy && newPolicy.identifier && (
                      <FormControl>
                        <FormLabel>Policy Identifier (Auto-generated)</FormLabel>
                        <Input value={newPolicy.identifier} isReadOnly bg="gray.50" />
                      </FormControl>
                    )}

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
                    </FormControl>

                    <FormControl>
                      <FormLabel>
                        Authorized Recipient (WebID)
                        <Badge ml={2} colorScheme="purple" fontSize="xs">odrl:assignee</Badge>
                      </FormLabel>
                      <Input
                        value={newPolicy.assignee || ''}
                        onChange={(e) => setNewPolicy((p) => ({ ...p, assignee: e.target.value }))}
                        placeholder="https://healthcare-app.example.org/profile/card#me (leave empty for any app)"
                      />
                      <FormHelperText>
                        Restrict access to a specific application identified by its WebID. Leave empty to allow any application.
                      </FormHelperText>
                    </FormControl>

                    <FormControl>
                      <FormLabel>Allowed Actions</FormLabel>
                      <HStack spacing={2} wrap="wrap">
                        {['read', 'create', 'update'].map((action) => {
                          const actionIri = `ex:${action}`;
                          const isSelected = newPolicy.actions?.includes(actionIri);
                          return (
                            <Tag
                              key={action}
                              size="md"
                              variant={isSelected ? 'solid' : 'outline'}
                              colorScheme="blue"
                              cursor="pointer"
                              onClick={() => {
                                setNewPolicy((p) => ({
                                  ...p,
                                  actions: isSelected
                                    ? p.actions?.filter(a => a !== actionIri) || []
                                    : [...(p.actions || []), actionIri]
                                }));
                              }}
                            >
                              {action}
                              {isSelected && <CloseIcon ml={1} boxSize="0.6rem" />}
                            </Tag>
                          );
                        })}
                      </HStack>
                    </FormControl>

                    <Box>
                      <Text fontWeight="bold" mb={2}>Constraints</Text>
                      <VStack spacing={3} align="stretch">
                        {newPolicy.constraints?.map((constraint, idx) => (
                          <Box key={`constraint-${idx}`} p={3} borderWidth="1px" borderRadius="md" borderColor="gray.200">
                            <HStack spacing={3} align="start" wrap="wrap">
                              <Select
                                value={constraint.type}
                                onChange={(e) => {
                                  const newType = e.target.value as ConstraintType;
                                  const newConstraint = createDefaultConstraint(newType);
                                  updateConstraintAtIndex(idx, {
                                    type: newType,
                                    value: newConstraint.value,
                                    operator: newConstraint.operator,
                                  });
                                }}
                                size="sm"
                                width="180px"
                              >
                                <option value="count">🔢 Access Count</option>
                                <option value="recipient">👤 Recipient (WebID)</option>
                                <option value="temporal">📅 Temporal (DateTime)</option>
                                <option value="timeWindow">⏰ Time Window</option>
                                <option value="location">📍 Location</option>
                              </Select>

                              {constraint.type === 'count' && (
                                <>
                                  <Select
                                    value={constraint.operator}
                                    onChange={(e) => updateConstraintAtIndex(idx, { operator: e.target.value as ConstraintOperator })}
                                    size="sm"
                                    width="80px"
                                  >
                                    <option value="lteq">≤</option>
                                    <option value="gteq">≥</option>
                                    <option value="eq">=</option>
                                  </Select>
                                  <NumberInput
                                    value={constraint.value as number}
                                    onChange={(_, val) => updateConstraintAtIndex(idx, { value: val })}
                                    size="sm"
                                    width="100px"
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

                              {constraint.type === 'recipient' && (
                                <Input
                                  flex={1}
                                  placeholder="https://app.example.org/profile/card#me"
                                  value={constraint.value as string}
                                  onChange={(e) => updateConstraintAtIndex(idx, { value: e.target.value })}
                                  size="sm"
                                />
                              )}

                              {constraint.type === 'temporal' && (
                                <>
                                  <Select
                                    value={constraint.operator}
                                    onChange={(e) => updateConstraintAtIndex(idx, { operator: e.target.value as ConstraintOperator })}
                                    size="sm"
                                    width="100px"
                                  >
                                    <option value="lteq">Valid Until</option>
                                    <option value="gteq">Valid From</option>
                                  </Select>
                                  <Input
                                    type="datetime-local"
                                    value={
                                      constraint.value instanceof Date
                                        ? toXsdDateTime(constraint.value).slice(0, 16)
                                        : String(constraint.value).slice(0, 16)
                                    }
                                    onChange={(e) => updateConstraintAtIndex(idx, { value: new Date(e.target.value) })}
                                    size="sm"
                                    width="220px"
                                  />
                                </>
                              )}

                              {constraint.type === 'location' && (
                                <Input
                                  flex={1}
                                  placeholder="City, Region, or Country"
                                  value={constraint.value as string}
                                  onChange={(e) => updateConstraintAtIndex(idx, { value: e.target.value })}
                                  size="sm"
                                />
                              )}

                              {constraint.type === 'timeWindow' && (
                                <>
                                  <Select
                                    value={constraint.operator}
                                    onChange={(e) => updateConstraintAtIndex(idx, { operator: e.target.value as ConstraintOperator })}
                                    size="sm"
                                    width="80px"
                                  >
                                    <option value="lteq">≤</option>
                                    <option value="gteq">≥</option>
                                  </Select>
                                  <NumberInput
                                    value={constraint.value as number}
                                    onChange={(_, val) => updateConstraintAtIndex(idx, { value: val })}
                                    size="sm"
                                    width="100px"
                                  >
                                    <NumberInputField />
                                    <NumberInputStepper>
                                      <NumberIncrementStepper />
                                      <NumberDecrementStepper />
                                    </NumberInputStepper>
                                  </NumberInput>
                                  <Text fontSize="sm" color="gray.600">hours</Text>
                                </>
                              )}

                              <IconButton
                                size="xs"
                                icon={<DeleteIcon />}
                                aria-label="Remove constraint"
                                colorScheme="red"
                                variant="ghost"
                                onClick={() => {
                                  const nc = (newPolicy.constraints || []).filter((_, i) => i !== idx);
                                  setNewPolicy((p) => ({
                                    ...p,
                                    constraints: nc.length ? nc : [createDefaultConstraint('count')]
                                  }));
                                }}
                              />
                            </HStack>
                          </Box>
                        ))}

                        <Button
                          size="sm"
                          leftIcon={<AddIcon />}
                          onClick={() => {
                            const newConstraint = createDefaultConstraint('count');
                            setNewPolicy((p) => ({
                              ...p,
                              constraints: [...(p.constraints || []), newConstraint]
                            }));
                          }}
                        >
                          Add Constraint
                        </Button>
                      </VStack>
                    </Box>

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
                      <Th>Identifier</Th>
                      <Th>Target</Th>
                      <Th>Recipient</Th>
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
                        <Td>{policy.identifier ? <Code fontSize="xs">{policy.identifier}</Code> : <Text fontSize="xs" color="gray.400">N/A</Text>}</Td>
                        <Td><Tag size="sm" colorScheme="purple">{policy.targetField}</Tag></Td>
                        <Td>
                          {policy.assignee ? (
                            <Tooltip label={policy.assignee}>
                              <Tag size="sm" colorScheme="blue">{shortIri(policy.assignee)}</Tag>
                            </Tooltip>
                          ) : (
                            <Text fontSize="xs" color="gray.400">Any App</Text>
                          )}
                        </Td>
                        <Td>
                          <VStack align="start" spacing={1}>
                            {policy.constraints.map((c, idx) => (
                              <Tag key={`${policy.id}-c-${idx}`} size="sm" colorScheme="gray" variant="subtle">
                                {formatConstraint(c)}
                              </Tag>
                            ))}
                          </VStack>
                        </Td>
                        <Td>
                          <Switch size="sm" isChecked={policy.active} onChange={() => handleTogglePolicyActive(policy)} />
                        </Td>
                        <Td>
                          <HStack spacing={2}>
                            <IconButton size="sm" icon={<EditIcon />} aria-label="Edit" onClick={() => handleEditPolicy(policy)} />
                            <IconButton size="sm" icon={<DeleteIcon />} aria-label="Delete" colorScheme="red" variant="ghost" onClick={() => deletePolicy(policy)} />
                          </HStack>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
              )}
            </Box>
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.200">
            <Button variant="ghost" onClick={onPolicyModalClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={isPrivacyModalOpen} onClose={onPrivacyModalClose} size="2xl">
        <ModalOverlay />
        <ModalContent bg="white" color="gray.800">
          <ModalHeader borderBottom="1px solid" borderColor="gray.200">Privacy Data Settings (DPV)</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="info" mb={4} bg="blue.50">
              <AlertIcon />
              Fields marked as sensitive use DPV categories.
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
                      <Text fontSize="sm" ml={2} color="gray.600">Sensitive</Text>
                    </Checkbox>
                  </Flex>
                ))}
              </VStack>
            )}
          </ModalBody>
          <ModalFooter borderTop="1px solid" borderColor="gray.200">
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