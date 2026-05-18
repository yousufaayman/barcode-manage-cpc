import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { productionApi, barcodeApi } from '../services/api';
import type {
  DailyAssignmentResponse,
  RecordProductionResponse,
  Worker,
  StageOption,
  SewingLineSchematic,
  SewingLineSchematicDetail,
  SewingLineStageResponse,
} from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Activity,
  Scan,
  CheckCircle,
  AlertCircle,
  Loader2,
  UserPlus,
  X,
  LayoutGrid,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { useToast } from '../hooks/use-toast';
import ProductionOvertimeTab from './ProductionOvertimeTab';

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const STAGE_DROPDOWN_COLORS = [
  'border-l-emerald-500 bg-emerald-50 data-[highlighted]:bg-emerald-100',
  'border-l-sky-500 bg-sky-50 data-[highlighted]:bg-sky-100',
  'border-l-violet-500 bg-violet-50 data-[highlighted]:bg-violet-100',
  'border-l-amber-500 bg-amber-50 data-[highlighted]:bg-amber-100',
  'border-l-rose-500 bg-rose-50 data-[highlighted]:bg-rose-100',
  'border-l-teal-500 bg-teal-50 data-[highlighted]:bg-teal-100',
  'border-l-indigo-500 bg-indigo-50 data-[highlighted]:bg-indigo-100',
  'border-l-orange-500 bg-orange-50 data-[highlighted]:bg-orange-100',
  'border-l-cyan-500 bg-cyan-50 data-[highlighted]:bg-cyan-100',
  'border-l-fuchsia-500 bg-fuchsia-50 data-[highlighted]:bg-fuchsia-100',
  'border-l-lime-500 bg-lime-50 data-[highlighted]:bg-lime-100',
  'border-l-pink-500 bg-pink-50 data-[highlighted]:bg-pink-100',
];

function getStageItemColor(index: number): string {
  return STAGE_DROPDOWN_COLORS[index % STAGE_DROPDOWN_COLORS.length];
}

const SCANNER_MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'Backspace', 'Delete']);
const SCANNER_FUNCTION_KEYS = new Set(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']);
const SCANNER_NAVIGATION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);

const shouldIgnoreScannerKey = (e: KeyboardEvent): boolean => {
  if (SCANNER_MODIFIER_KEYS.has(e.key) || SCANNER_FUNCTION_KEYS.has(e.key) || SCANNER_NAVIGATION_KEYS.has(e.key)) {
    return true;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) {
    return true;
  }
  return false;
};

const SCANNER_IDLE_DELAY_MS = 300;
const BATCH_BARCODE_PATTERN = /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i;

const isCompleteBatchBarcode = (value: string): boolean => BATCH_BARCODE_PATTERN.test(value.trim());

const SCHEMATIC_VIEW_STAGE_BOX_COLORS = [
  'border-emerald-400/60 bg-emerald-50/50',
  'border-sky-400/60 bg-sky-50/50',
  'border-violet-400/60 bg-violet-50/50',
  'border-amber-400/60 bg-amber-50/50',
  'border-rose-400/60 bg-rose-50/50',
  'border-teal-400/60 bg-teal-50/50',
];
const SCHEMATIC_VIEW_ORDER_BADGE_COLORS = [
  'bg-emerald-200/80 text-emerald-900',
  'bg-sky-200/80 text-sky-900',
  'bg-violet-200/80 text-violet-900',
  'bg-amber-200/80 text-amber-900',
  'bg-rose-200/80 text-rose-900',
  'bg-teal-200/80 text-teal-900',
];
const SCHEMATIC_VIEW_MACHINE_PILL_COLORS = [
  'bg-sky-100 text-sky-800 border border-sky-200',
  'bg-teal-100 text-teal-800 border border-teal-200',
  'bg-amber-100 text-amber-800 border border-amber-200',
  'bg-violet-100 text-violet-800 border border-violet-200',
  'bg-rose-100 text-rose-800 border border-rose-200',
  'bg-emerald-100 text-emerald-800 border border-emerald-200',
];

function lineCapacityFromStages(stages: SewingLineStageResponse[]): number | null {
  if (!stages.length) return null;
  const byOrder = new Map<number, number>();
  for (const s of stages) {
    const qty = s.production_qty ?? 0;
    byOrder.set(s.stage_order, (byOrder.get(s.stage_order) ?? 0) + qty);
  }
  const capacities = Array.from(byOrder.values());
  if (capacities.every((c) => c === 0)) return null;
  return Math.min(...capacities);
}

interface StageNode {
  stage_order: number;
  names: string[];
  totalOutput: number;
  occurrences: number;
  quantities: number[];
  stage_ids: number[];
}

function stagesToOrderedNodes(stages: SewingLineStageResponse[]): StageNode[] {
  const byOrder = new Map<number, { names: string[]; quantities: number[]; stage_ids: number[] }>();
  for (const s of stages) {
    const existing = byOrder.get(s.stage_order);
    const name = s.stage_name?.trim() || '';
    const qty = s.production_qty ?? 0;
    if (!existing) {
      byOrder.set(s.stage_order, { names: name ? [name] : [], quantities: [qty], stage_ids: [s.stage_id] });
    } else {
      if (name && !existing.names.includes(name)) existing.names.push(name);
      existing.quantities.push(qty);
      existing.stage_ids.push(s.stage_id);
    }
  }
  return Array.from(byOrder.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([stage_order, { names, quantities, stage_ids }]) => ({
      stage_order,
      names: names.length ? names : [''],
      totalOutput: quantities.reduce((a, b) => a + b, 0),
      occurrences: quantities.length,
      quantities,
      stage_ids,
    }));
}

type PhaseOption = { phase_id: number; phase_name: string; type?: string };

const ProductionTrackingPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('tracking');

  // --- Tab 1: Production Tracking (worker scan → assignment → batch scan → quantity) ---
  const todayStr = formatDateForInput(new Date());
  const [trackingAssignmentsToday, setTrackingAssignmentsToday] = useState<DailyAssignmentResponse[]>([]);
  const [trackingWorker, setTrackingWorker] = useState<Worker | null>(null);
  const [trackingAssignment, setTrackingAssignment] = useState<DailyAssignmentResponse | null>(null);
  const [trackingBatchBarcode, setTrackingBatchBarcode] = useState<string | null>(null);
  /** Resolved from batches table by barcode: batch_id and batch quantity for production history and UI */
  const [trackingBatchInfo, setTrackingBatchInfo] = useState<{ batch_id: number; barcode: string; quantity: number | null } | null>(null);
  /** Max quantity allowed for this batch at this stage type (null = no limit) */
  const [trackingMaxQuantity, setTrackingMaxQuantity] = useState<number | null>(null);
  const [trackingWorkerInput, setTrackingWorkerInput] = useState('');
  const [trackingBatchInput, setTrackingBatchInput] = useState('');
  const [trackingQuantity, setTrackingQuantity] = useState(1);
  const [trackingLoadingAssignments, setTrackingLoadingAssignments] = useState(false);
  const [trackingLoadingWorker, setTrackingLoadingWorker] = useState(false);
  const [trackingLoadingBatch, setTrackingLoadingBatch] = useState(false);
  const [trackingRecording, setTrackingRecording] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [trackingLastRecord, setTrackingLastRecord] = useState<RecordProductionResponse | null>(null);
  const [trackingIsScanning, setTrackingIsScanning] = useState(false);
  const trackingWorkerInputRef = useRef<HTMLInputElement>(null);
  const trackingBatchInputRef = useRef<HTMLInputElement>(null);
  const trackingScanBufferRef = useRef('');
  const trackingScanTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const trackingLastProcessedScanRef = useRef<{ mode: 'worker' | 'batch'; value: string; at: number } | null>(null);
  const trackingAssignmentsForWorker = useMemo(
    () => (trackingWorker ? trackingAssignmentsToday.filter((a) => a.worker_id === trackingWorker.worker_id) : []),
    [trackingWorker, trackingAssignmentsToday]
  );
  const trackingAssignmentDisplay = useMemo(() => {
    const a = trackingAssignment ?? trackingAssignmentsForWorker[0] ?? null;
    return a ? `${a.worker_name} – ${a.stage_name} (${a.schematic_name})` : '';
  }, [trackingAssignment, trackingAssignmentsForWorker]);

  // --- Tab 2: Worker Assignment ---
  const [sewingPhases, setSewingPhases] = useState<PhaseOption[]>([]);
  const [schematics, setSchematics] = useState<SewingLineSchematic[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [selectedSchematicId, setSelectedSchematicId] = useState<number | null>(null);
  const [schematicDetail, setSchematicDetail] = useState<SewingLineSchematicDetail | null>(null);
  const [resolvedWorker, setResolvedWorker] = useState<Worker | null>(null);
  const [workerResolveError, setWorkerResolveError] = useState<string | null>(null);
  const [assignStageId, setAssignStageId] = useState<number | null>(null);
  const [sequentialModeActive, setSequentialModeActive] = useState(false);
  const [sequentialModeIndex, setSequentialModeIndex] = useState(0);
  const [assignmentDateWorker, setAssignmentDateWorker] = useState(() => formatDateForInput(new Date()));
  const [loadingPhases, setLoadingPhases] = useState(false);
  const [loadingSchematics, setLoadingSchematics] = useState(false);
  const [loadingWorker, setLoadingWorker] = useState(false);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [isScanningWorker, setIsScanningWorker] = useState(false);
  const workerBarcodeInputRef = useRef<HTMLInputElement>(null);
  const workerScanBufferRef = useRef('');
  const workerScanTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const workerLastProcessedScanRef = useRef<{ value: string; at: number } | null>(null);
  const workerAssignmentCardRef = useRef<HTMLDivElement>(null);

  const [stages, setStages] = useState<StageOption[]>([]);

  // --- Tab 3: Schematic View (read-only) ---
  const [schematicViewPhaseId, setSchematicViewPhaseId] = useState<number | null>(null);
  const [schematicViewList, setSchematicViewList] = useState<SewingLineSchematic[]>([]);
  const [schematicViewSelectedId, setSchematicViewSelectedId] = useState<number | null>(null);
  const [schematicViewDetail, setSchematicViewDetail] = useState<SewingLineSchematicDetail | null>(null);
  const [loadingSchematicView, setLoadingSchematicView] = useState(false);
  const [loadingSchematicViewList, setLoadingSchematicViewList] = useState(false);
  const [schematicViewAssignments, setSchematicViewAssignments] = useState<DailyAssignmentResponse[]>([]);
  const stageIdToWorker = useMemo(() => {
    const m: Record<number, { name: string; id: number }> = {};
    schematicViewAssignments.forEach((a) => {
      m[a.stage_id] = { name: a.worker_name ?? '', id: a.worker_id };
    });
    return m;
  }, [schematicViewAssignments]);

  // Load assignments for today when Production Tracking tab is active
  useEffect(() => {
    if (activeTab !== 'tracking') return;
    setTrackingLoadingAssignments(true);
    productionApi
      .getAssignments(todayStr)
      .then(setTrackingAssignmentsToday)
      .catch(() => setTrackingAssignmentsToday([]))
      .finally(() => setTrackingLoadingAssignments(false));
  }, [activeTab, todayStr]);

  // Load stages for Tab 2 stage dropdown labels
  useEffect(() => {
    productionApi.getStages().then(setStages).catch(() => setStages([]));
  }, []);

  // Schematic View tab: today's assignments (for worker names on machines)
  useEffect(() => {
    if (activeTab !== 'schematic-view') return;
    productionApi.getAssignments(todayStr).then(setSchematicViewAssignments).catch(() => setSchematicViewAssignments([]));
  }, [activeTab, todayStr]);

  // Schematic View: default sewing phase when opening tab (same phase list as worker assignment)
  useEffect(() => {
    if (activeTab !== 'schematic-view') return;
    if (schematicViewPhaseId != null) return;
    if (sewingPhases.length > 0) setSchematicViewPhaseId(sewingPhases[0].phase_id);
  }, [activeTab, sewingPhases, schematicViewPhaseId]);

  // Schematic View: load schematics for selected phase (include inactive, like former single-dropdown list)
  useEffect(() => {
    if (schematicViewPhaseId == null) {
      setSchematicViewList([]);
      setSchematicViewSelectedId(null);
      return;
    }
    let cancelled = false;
    setLoadingSchematicViewList(true);
    void productionApi
      .getSchematics({ active_only: false })
      .then((all) => {
        if (cancelled) return;
        const forPhase = all.filter((s) => s.production_phase_id === schematicViewPhaseId);
        setSchematicViewList(forPhase);
        setSchematicViewSelectedId(forPhase.length > 0 ? forPhase[0].schematic_id : null);
      })
      .catch(() => {
        if (!cancelled) {
          setSchematicViewList([]);
          setSchematicViewSelectedId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSchematicViewList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schematicViewPhaseId]);

  // Load schematic detail when selection changes (Schematic View tab)
  useEffect(() => {
    if (schematicViewSelectedId == null) {
      setSchematicViewDetail(null);
      return;
    }
    setLoadingSchematicView(true);
    productionApi
      .getSchematicById(schematicViewSelectedId)
      .then(setSchematicViewDetail)
      .catch(() => setSchematicViewDetail(null))
      .finally(() => setLoadingSchematicView(false));
  }, [schematicViewSelectedId]);

  // Load sewing phases for tab 2
  useEffect(() => {
    const load = async () => {
      setLoadingPhases(true);
      try {
        const phases = await barcodeApi.getPhases();
        const sewing = (phases || []).filter(
          (p) =>
            (p.type || '').toLowerCase() === 'sewing' &&
            (p.phase_name || '').trim().toLowerCase() !== 'sewing'
        );
        setSewingPhases(sewing);
        if (sewing.length > 0 && selectedPhaseId == null) setSelectedPhaseId(sewing[0].phase_id);
      } catch {
        setSewingPhases([]);
      } finally {
        setLoadingPhases(false);
      }
    };
    load();
  }, []);

  // Load schematics when phase changes (tab 2)
  useEffect(() => {
    if (selectedPhaseId == null) {
      setSchematics([]);
      setSelectedSchematicId(null);
      setSchematicDetail(null);
      setAssignStageId(null);
      return;
    }
    const load = async () => {
      setLoadingSchematics(true);
      try {
        const all = await productionApi.getSchematics({ active_only: true });
        const forPhase = all.filter((s) => s.production_phase_id === selectedPhaseId);
        setSchematics(forPhase);
        setSelectedSchematicId(null);
        setSchematicDetail(null);
        setAssignStageId(null);
        if (forPhase.length > 0) setSelectedSchematicId(forPhase[0].schematic_id);
      } catch {
        setSchematics([]);
        setSelectedSchematicId(null);
        setSchematicDetail(null);
      } finally {
        setLoadingSchematics(false);
      }
    };
    load();
  }, [selectedPhaseId]);

  // Load schematic detail (stages) when schematic selected (tab 2)
  useEffect(() => {
    if (selectedSchematicId == null) {
      setSchematicDetail(null);
      setAssignStageId(null);
      setSequentialModeActive(false);
      return;
    }
    const load = async () => {
      try {
        const detail = await productionApi.getSchematicById(selectedSchematicId);
        setSchematicDetail(detail);
        const firstStage = detail.stages?.[0];
        setAssignStageId(firstStage ? firstStage.stage_id : null);
        setSequentialModeActive(false);
        setSequentialModeIndex(0);
      } catch {
        setSchematicDetail(null);
        setAssignStageId(null);
        setSequentialModeActive(false);
      }
    };
    load();
  }, [selectedSchematicId]);

  const markIncompleteTrackingBatchScan = useCallback((barcode: string, clearInput = false) => {
    const code = barcode.trim();
    if (!code) return;
    setTrackingBatchInput(clearInput ? '' : code);
    setTrackingBatchBarcode(code);
    setTrackingBatchInfo(null);
    setTrackingMaxQuantity(null);
    setTrackingQuantity(1);
    setTrackingLastRecord(null);
    setTrackingLoadingBatch(false);
    setTrackingError(t('productionTracking.incompleteBatchBarcode', {
      defaultValue: 'Incomplete batch barcode scan. Please scan again.',
    }));
  }, [t]);

  const resolveTrackingWorker = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    setTrackingWorkerInput(code);
    if (!/^\d+$/.test(code)) {
      setTrackingError(t('productionTracking.workerAssignment.invalidWorkerId'));
      setTrackingWorker(null);
      setTrackingAssignment(null);
      return;
    }
    const workerId = Number(code);
    if (!Number.isSafeInteger(workerId) || workerId < 0) {
      setTrackingError(t('productionTracking.workerAssignment.invalidWorkerId'));
      setTrackingWorker(null);
      setTrackingAssignment(null);
      return;
    }
    setTrackingLoadingWorker(true);
    setTrackingError(null);
    setTrackingWorker(null);
    setTrackingAssignment(null);
    setTrackingBatchBarcode(null);
    try {
      const worker = await productionApi.getWorkerById(workerId);
      const forWorker = trackingAssignmentsToday.filter((a) => a.worker_id === worker.worker_id);
      setTrackingWorker(worker);
      if (forWorker.length === 0) {
        setTrackingError(t('productionTracking.noAssignmentForToday'));
      } else if (forWorker.length === 1) {
        setTrackingAssignment(forWorker[0]);
      }
    } catch {
      setTrackingError(t('productionTracking.workerAssignment.workerNotFound'));
      setTrackingWorker(null);
    } finally {
      setTrackingLoadingWorker(false);
    }
  }, [t, trackingAssignmentsToday]);

  const handleTrackingBatchScan = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code || !trackingAssignment) return;
    if (!isCompleteBatchBarcode(code)) {
      markIncompleteTrackingBatchScan(code);
      return;
    }
    setTrackingBatchInput(code);
    setTrackingError(null);
    setTrackingLastRecord(null);
    setTrackingBatchBarcode(code);
    setTrackingBatchInfo(null);
    setTrackingMaxQuantity(null);
    setTrackingQuantity(1);
    setTrackingLoadingBatch(true);
    try {
      const batch = await barcodeApi.scanBarcode(code);
      setTrackingBatchInfo({
        batch_id: batch.batch_id,
        barcode: batch.barcode,
        quantity: batch.quantity ?? null,
      });
      setTrackingBatchBarcode(batch.barcode);
      setTrackingBatchInput(batch.barcode);

      const maxRes = await productionApi.getMaxProductionQuantity(
        trackingAssignment.daily_assignment_id,
        batch.barcode
      );
      setTrackingMaxQuantity(maxRes.max_allowed);

      if (maxRes.max_allowed !== null && maxRes.max_allowed === 0) {
        setTrackingError(t('productionTracking.batchCompleted'));
        setTrackingQuantity(0);
      } else {
        const batchQty = batch.quantity != null && batch.quantity > 0 ? batch.quantity : 1;
        const initialQty =
          maxRes.max_allowed === null
            ? batchQty
            : Math.min(batchQty, maxRes.max_allowed);
        setTrackingQuantity(initialQty);
      }
    } catch {
      setTrackingError(t('productionTracking.batchNotFound'));
      setTrackingBatchBarcode(null);
      setTrackingBatchInfo(null);
      setTrackingMaxQuantity(null);
    } finally {
      setTrackingLoadingBatch(false);
    }
  }, [markIncompleteTrackingBatchScan, t, trackingAssignment]);

  const handleTrackingSubmit = async () => {
    if (!trackingAssignment || !trackingBatchInfo || !trackingBatchBarcode || trackingQuantity <= 0) return;
    setTrackingRecording(true);
    setTrackingError(null);
    try {
      const result = await productionApi.recordProduction({
        daily_assignment_id: trackingAssignment.daily_assignment_id,
        barcode: trackingBatchBarcode,
        quantity: trackingQuantity,
        tracking_date: todayStr,
      });
      setTrackingLastRecord(result);
      toast({
        title: t('common.success'),
        description: t('productionTracking.recorded', { barcode: trackingBatchBarcode, qty: result.quantity_produced }),
      });
      setTrackingBatchBarcode(null);
      setTrackingBatchInfo(null);
      setTrackingMaxQuantity(null);
      setTrackingBatchInput('');
      setTrackingQuantity(1);
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      setTrackingError(typeof detail === 'string' ? detail : t('productionTracking.recordError'));
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : t('productionTracking.recordError'),
        variant: 'destructive',
      });
    } finally {
      setTrackingRecording(false);
    }
  };

  const clearTrackingBatchSelection = useCallback(() => {
    setTrackingBatchInput('');
    setTrackingBatchBarcode(null);
    setTrackingBatchInfo(null);
    setTrackingMaxQuantity(null);
    setTrackingQuantity(1);
    setTrackingError(null);
    setTrackingLastRecord(null);
  }, []);

  const clearTrackingSession = useCallback(() => {
    setTrackingWorkerInput('');
    setTrackingWorker(null);
    setTrackingAssignment(null);
    setTrackingBatchInput('');
    setTrackingBatchBarcode(null);
    setTrackingBatchInfo(null);
    setTrackingMaxQuantity(null);
    setTrackingQuantity(1);
    setTrackingError(null);
    setTrackingLastRecord(null);
  }, []);

  const processTrackingScannedValue = useCallback((clearIncompleteBatchInput = false) => {
    const scanned = trackingScanBufferRef.current.trim();
    if (!scanned) return;

    const mode = trackingAssignment == null ? 'worker' : 'batch';
    if (mode === 'batch' && !isCompleteBatchBarcode(scanned)) {
      trackingScanBufferRef.current = '';
      setTrackingIsScanning(false);
      markIncompleteTrackingBatchScan(scanned, clearIncompleteBatchInput);
      return;
    }

    const now = Date.now();
    const last = trackingLastProcessedScanRef.current;
    if (last?.mode === mode && last.value === scanned && now - last.at < 1000) {
      trackingScanBufferRef.current = '';
      setTrackingIsScanning(false);
      return;
    }
    trackingLastProcessedScanRef.current = { mode, value: scanned, at: now };

    trackingScanBufferRef.current = '';
    setTrackingIsScanning(false);
    if (mode === 'worker') {
      void resolveTrackingWorker(scanned);
    } else {
      void handleTrackingBatchScan(scanned);
    }
  }, [handleTrackingBatchScan, markIncompleteTrackingBatchScan, resolveTrackingWorker, trackingAssignment]);

  const queueTrackingScannedValue = useCallback((value: string) => {
    const scanned = value.trim();
    trackingScanBufferRef.current = scanned;
    setTrackingIsScanning(Boolean(scanned));
    if (trackingScanTimeoutRef.current) clearTimeout(trackingScanTimeoutRef.current);
    if (!scanned) return;
    trackingScanTimeoutRef.current = setTimeout(() => {
      processTrackingScannedValue(true);
    }, SCANNER_IDLE_DELAY_MS);
  }, [processTrackingScannedValue]);

  // Tab 1: barcode key capture (worker scan then batch scan)
  useEffect(() => {
    if (activeTab !== 'tracking') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const activeInputRef = trackingAssignment == null ? trackingWorkerInputRef.current : trackingBatchInputRef.current;
      if (target !== activeInputRef && (target?.closest?.('input') || target?.closest?.('select') || target?.closest?.('textarea') || target?.closest?.('[role="combobox"]') || target?.closest?.('[role="listbox"]'))) {
        return;
      }
      if (shouldIgnoreScannerKey(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (trackingScanTimeoutRef.current) clearTimeout(trackingScanTimeoutRef.current);
        processTrackingScannedValue();
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      trackingScanBufferRef.current += e.key;
      setTrackingIsScanning(true);
      if (trackingScanTimeoutRef.current) clearTimeout(trackingScanTimeoutRef.current);
      trackingScanTimeoutRef.current = setTimeout(() => {
        processTrackingScannedValue(true);
      }, SCANNER_IDLE_DELAY_MS);
    };
    globalThis.addEventListener('keydown', handleKeyDown, true);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, true);
      if (trackingScanTimeoutRef.current) clearTimeout(trackingScanTimeoutRef.current);
      trackingScanBufferRef.current = '';
      setTrackingIsScanning(false);
    };
  }, [activeTab, processTrackingScannedValue, trackingAssignment]);

  useEffect(() => {
    if (activeTab !== 'tracking') return;
    const focusTrackingInput = () => {
      const targetRef = trackingAssignment == null ? trackingWorkerInputRef.current : trackingBatchInputRef.current;
      const active = document.activeElement as HTMLElement | null;
      if (active && active !== targetRef) {
        if (active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') return;
        if (active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'date') return;
        if (active.closest?.('[role="combobox"]') || active.closest?.('[role="listbox"]')) return;
      }
      targetRef?.focus();
    };
    focusTrackingInput();
    const interval = setInterval(focusTrackingInput, 150);
    return () => clearInterval(interval);
  }, [activeTab, trackingAssignment]);

  // --- Tab 2: resolve worker from barcode (barcode = worker_id)
  const resolveWorkerFromBarcode = useCallback(async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    if (!/^\d+$/.test(code)) {
      setWorkerResolveError(t('productionTracking.workerAssignment.invalidWorkerId'));
      setResolvedWorker(null);
      return;
    }
    const workerId = Number(code);
    if (!Number.isSafeInteger(workerId) || workerId < 0) {
      setWorkerResolveError(t('productionTracking.workerAssignment.invalidWorkerId'));
      setResolvedWorker(null);
      return;
    }
    setLoadingWorker(true);
    setWorkerResolveError(null);
    setResolvedWorker(null);
    try {
      const worker = await productionApi.getWorkerById(workerId);
      setResolvedWorker(worker);
    } catch {
      setWorkerResolveError(t('productionTracking.workerAssignment.workerNotFound'));
      setResolvedWorker(null);
    } finally {
      setLoadingWorker(false);
    }
  }, [t]);

  const processWorkerScannedValue = useCallback(() => {
    const scanned = workerScanBufferRef.current.trim();
    if (!scanned) return;

    const now = Date.now();
    const last = workerLastProcessedScanRef.current;
    if (last?.value === scanned && now - last.at < 1000) {
      workerScanBufferRef.current = '';
      setIsScanningWorker(false);
      if (workerBarcodeInputRef.current) workerBarcodeInputRef.current.value = '';
      return;
    }
    workerLastProcessedScanRef.current = { value: scanned, at: now };

    workerScanBufferRef.current = '';
    setIsScanningWorker(false);
    if (workerBarcodeInputRef.current) workerBarcodeInputRef.current.value = '';
    void resolveWorkerFromBarcode(scanned);
  }, [resolveWorkerFromBarcode]);

  const queueWorkerScannedValue = useCallback((value: string) => {
    const scanned = value.trim();
    workerScanBufferRef.current = scanned;
    setIsScanningWorker(Boolean(scanned));
    if (workerScanTimeoutRef.current) clearTimeout(workerScanTimeoutRef.current);
    if (!scanned) return;
    workerScanTimeoutRef.current = setTimeout(() => {
      processWorkerScannedValue();
    }, SCANNER_IDLE_DELAY_MS);
  }, [processWorkerScannedValue]);

  // Tab 2: auto-capture barcode for worker scan (capture phase, buffer + Enter or idle debounce)
  useEffect(() => {
    if (activeTab !== 'worker-assignment') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target === workerBarcodeInputRef.current) {
        // Our hidden barcode input is focused – always capture
      } else if (target?.closest?.('input') || target?.closest?.('select') || target?.closest?.('textarea') || target?.closest?.('[role="combobox"]') || target?.closest?.('[role="listbox"]')) {
        return;
      }
      if (shouldIgnoreScannerKey(e)) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (workerScanTimeoutRef.current) clearTimeout(workerScanTimeoutRef.current);
        processWorkerScannedValue();
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      workerScanBufferRef.current += e.key;
      setIsScanningWorker(true);
      if (workerScanTimeoutRef.current) clearTimeout(workerScanTimeoutRef.current);
      workerScanTimeoutRef.current = setTimeout(() => {
        processWorkerScannedValue();
      }, SCANNER_IDLE_DELAY_MS);
    };
    globalThis.addEventListener('keydown', handleKeyDown, true);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, true);
      if (workerScanTimeoutRef.current) clearTimeout(workerScanTimeoutRef.current);
      workerScanBufferRef.current = '';
      setIsScanningWorker(false);
    };
  }, [activeTab, processWorkerScannedValue]);

  useEffect(() => {
    if (activeTab === 'worker-assignment') {
      workerBarcodeInputRef.current?.focus();
    }
  }, [activeTab]);

  // Keep worker barcode input focused when on Worker Assignment (same as Barcode Scanner page)
  useEffect(() => {
    if (activeTab !== 'worker-assignment') return;
    const focusWorkerInput = () => {
      const active = document.activeElement;
      if (active && active !== workerBarcodeInputRef.current) {
        if (active.tagName === 'SELECT' || active.tagName === 'TEXTAREA') return;
        if (active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'date') return;
        if ((active as HTMLElement).closest?.('[role="combobox"]') || (active as HTMLElement).closest?.('[role="listbox"]')) return;
      }
      workerBarcodeInputRef.current?.focus();
    };
    const interval = setInterval(focusWorkerInput, 150);
    return () => clearInterval(interval);
  }, [activeTab]);

  const focusWorkerBarcodeInput = (e?: React.MouseEvent) => {
    if (e && e.target instanceof HTMLElement && e.target.closest('button, input, select, [role="combobox"]')) return;
    workerBarcodeInputRef.current?.focus();
  };

  const performAssignAndMaybeAdvance = async (worker: Worker) => {
    if (assignStageId == null) return;
    const stagesForSeq = schematicDetail?.stages ?? [];
    const currentSeqIndex = sequentialModeActive ? sequentialModeIndex : -1;
    await productionApi.createAssignment({
      assignment_date: assignmentDateWorker,
      worker_id: worker.worker_id,
      stage_id: assignStageId,
    });
    toast({
      title: t('common.success'),
      description: t('productionTracking.workerAssignment.assigned', { name: worker.worker_name }),
    });
    setResolvedWorker(null);
    setWorkerResolveError(null);

    if (sequentialModeActive && stagesForSeq.length > 0) {
      const nextIndex = currentSeqIndex + 1;
      if (nextIndex < stagesForSeq.length) {
        setSequentialModeIndex(nextIndex);
        setAssignStageId(stagesForSeq[nextIndex].stage_id);
      } else {
        toast({
          title: t('productionTracking.workerAssignment.sequentialCompleteTitle'),
          description: t('productionTracking.workerAssignment.sequentialComplete'),
        });
        setSequentialModeActive(false);
        setSequentialModeIndex(0);
        setAssignStageId(stagesForSeq[0].stage_id);
      }
    }
  };

  // Sequential mode: auto-assign when a worker is scanned (resolved)
  useEffect(() => {
    if (activeTab !== 'worker-assignment') return;
    if (!sequentialModeActive || resolvedWorker == null || assignStageId == null) return;
    let cancelled = false;
    setLoadingAssign(true);
    performAssignAndMaybeAdvance(resolvedWorker)
      .catch((err: unknown) => {
        if (cancelled) return;
        const detail = err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
        toast({
          title: t('common.error'),
          description: typeof detail === 'string' ? detail : t('productionTracking.workerAssignment.assignError'),
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingAssign(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sequentialModeActive, resolvedWorker]);

  const handleWorkerAssign = async () => {
    if (resolvedWorker == null || assignStageId == null) return;
    setLoadingAssign(true);
    try {
      await performAssignAndMaybeAdvance(resolvedWorker);
    } catch (err: unknown) {
      const detail = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined;
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : t('productionTracking.workerAssignment.assignError'),
        variant: 'destructive',
      });
    } finally {
      setLoadingAssign(false);
    }
  };

  const stagesForSchematic: SewingLineStageResponse[] = schematicDetail?.stages ?? [];

  const { stageNameOccurrenceCount, stageOccurrenceIndex } = useMemo(() => {
    const count: Record<string, number> = {};
    const indexByStageId: Record<number, number> = {};
    const sorted = [...stages].sort((a, b) => {
      const n = (a.stage_name ?? '').localeCompare(b.stage_name ?? '');
      if (n !== 0) return n;
      return (a.schematic_name ?? '').localeCompare(b.schematic_name ?? '');
    });
    const stageNameCounter: Record<string, number> = {};
    sorted.forEach((s) => {
      count[s.stage_name] = (count[s.stage_name] ?? 0) + 1;
      stageNameCounter[s.stage_name] = (stageNameCounter[s.stage_name] ?? 0) + 1;
      indexByStageId[s.stage_id] = stageNameCounter[s.stage_name];
    });
    return { stageNameOccurrenceCount: count, stageOccurrenceIndex: indexByStageId };
  }, [stages]);

  const stageDisplayLabel = (stageName: string, stageId: number, schematicName?: string) => {
    const n = stageNameOccurrenceCount[stageName] ?? 0;
    const num = n > 1 ? ` ${stageOccurrenceIndex[stageId] ?? ''}` : '';
    const base = `${stageName}${num}`;
    return schematicName != null && schematicName !== '' ? `${base} (${schematicName})` : base;
  };

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green/10">
            <Activity className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('productionTracking.title')}</h1>
          </div>
        </div>

        <input
          ref={workerBarcodeInputRef}
          type="text"
          autoComplete="off"
          inputMode="numeric"
          className="absolute opacity-0 w-px h-px pointer-events-none"
          aria-label={t('productionTracking.workerAssignment.barcodeInputLabel')}
          onChange={(e) => queueWorkerScannedValue(e.target.value)}
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full max-w-3xl flex-wrap items-center gap-1 rounded-xl bg-gray-100 border border-gray-200 shadow-inner p-1.5 h-auto">
            <TabsTrigger
              value="tracking"
              className="flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700 data-[state=inactive]:hover:bg-gray-50"
            >
              <Scan className="h-4 w-4 mr-1.5 shrink-0" />
              {t('productionTracking.tabTracking')}
            </TabsTrigger>
            <TabsTrigger
              value="worker-assignment"
              className="flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700 data-[state=inactive]:hover:bg-gray-50"
            >
              <UserPlus className="h-4 w-4 mr-1.5 shrink-0" />
              {t('productionTracking.tabWorkerAssignment')}
            </TabsTrigger>
            <TabsTrigger
              value="schematic-view"
              className="flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700 data-[state=inactive]:hover:bg-gray-50"
            >
              <LayoutGrid className="h-4 w-4 mr-1.5 shrink-0" />
              {t('productionTracking.tabSchematicView')}
            </TabsTrigger>
            <TabsTrigger
              value="overtime"
              className="flex-none whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700 data-[state=inactive]:hover:bg-gray-50"
            >
              <Clock className="h-4 w-4 mr-1.5 shrink-0" />
              {t('productionTracking.tabOvertime')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tracking" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Scan className="h-5 w-5" />
                  {t('productionTracking.tabTracking')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {trackingLoadingAssignments && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                )}

                <div>
                  <Label className="text-sm font-medium text-gray-600">{t('productionTracking.scanWorkerFirst')}</Label>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      ref={trackingWorkerInputRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      value={trackingWorkerInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        setTrackingWorkerInput(value);
                        queueTrackingScannedValue(value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        void resolveTrackingWorker(trackingWorkerInput);
                      }}
                      className="input-field flex-1 min-w-[220px]"
                      placeholder={t('productionTracking.workerAssignment.scanWorkerBarcode')}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setTrackingWorkerInput('');
                        setTrackingWorker(null);
                        setTrackingAssignment(null);
                        setTrackingBatchBarcode(null);
                        setTrackingBatchInfo(null);
                        setTrackingMaxQuantity(null);
                        setTrackingBatchInput('');
                        setTrackingQuantity(1);
                        setTrackingError(null);
                        setTrackingLastRecord(null);
                      }}
                    >
                      {t('common.clear')}
                    </Button>
                  </div>
                  {trackingLoadingWorker && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('common.loading')}
                    </div>
                  )}
                  {trackingWorker && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{trackingWorker.worker_name} (ID: {trackingWorker.worker_id})</span>
                    </div>
                  )}
                  {trackingError && trackingAssignment == null && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {trackingError}
                    </div>
                  )}
                  {trackingAssignmentsForWorker.length > 1 && trackingWorker && !trackingAssignment && (
                    <div className="mt-2 flex flex-col items-stretch gap-3 lg:flex-row lg:items-end">
                      <div className="space-y-1 min-w-0 flex-1">
                        <Label className="text-xs text-gray-500">{t('productionTracking.selectAssignmentPlaceholder')}</Label>
                        <Select
                          value=""
                          onValueChange={(v) => {
                            const a = trackingAssignmentsForWorker.find((x) => String(x.daily_assignment_id) === v);
                            setTrackingAssignment(a ?? null);
                            setTrackingError(null);
                          }}
                        >
                          <SelectTrigger className="w-full max-w-md">
                            <SelectValue placeholder={t('productionTracking.selectAssignmentPlaceholder')} />
                          </SelectTrigger>
                          <SelectContent>
                            {trackingAssignmentsForWorker.map((a) => (
                              <SelectItem key={a.daily_assignment_id} value={String(a.daily_assignment_id)}>
                                {a.stage_name} ({a.schematic_name})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold text-base w-full min-h-14 md:min-h-16 lg:w-auto lg:min-h-12 lg:min-w-[180px] shrink-0"
                        onClick={() => {
                          setTrackingWorkerInput('');
                          setTrackingWorker(null);
                          setTrackingAssignment(null);
                          setTrackingBatchBarcode(null);
                          setTrackingBatchInfo(null);
                          setTrackingMaxQuantity(null);
                          setTrackingBatchInput('');
                          setTrackingQuantity(1);
                          setTrackingError(null);
                          setTrackingLastRecord(null);
                        }}
                        aria-label={t('common.clear')}
                      >
                        <X className="h-5 w-5 mr-1.5" />
                        {t('common.clear')}
                      </Button>
                    </div>
                  )}
                  {trackingWorker && (trackingAssignment || trackingAssignmentsForWorker.length <= 1) && (
                    <div className="mt-2 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
                      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 flex-1 min-w-0">
                        {trackingAssignmentDisplay}
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="lg"
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold text-base w-full min-h-14 md:min-h-16 lg:w-auto lg:min-h-12 lg:min-w-[180px] shrink-0"
                        onClick={() => {
                          setTrackingWorkerInput('');
                          setTrackingWorker(null);
                          setTrackingAssignment(null);
                          setTrackingBatchBarcode(null);
                          setTrackingBatchInfo(null);
                          setTrackingMaxQuantity(null);
                          setTrackingBatchInput('');
                          setTrackingQuantity(1);
                          setTrackingError(null);
                          setTrackingLastRecord(null);
                        }}
                        aria-label={t('common.clear')}
                      >
                        <X className="h-5 w-5 mr-1.5" />
                        {t('common.clear')}
                      </Button>
                    </div>
                  )}
                </div>

                {trackingAssignment && (
                  <>
                    <div>
                      <Label className="text-sm font-medium text-gray-600">{t('productionTracking.scanBatchBarcode')}</Label>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <input
                          ref={trackingBatchInputRef}
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={trackingBatchInput}
                          onChange={(e) => {
                            const value = e.target.value;
                            setTrackingBatchInput(value);
                            queueTrackingScannedValue(value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            e.preventDefault();
                            void handleTrackingBatchScan(trackingBatchInput);
                          }}
                          className="input-field flex-1 min-w-[220px]"
                          placeholder={t('productionTracking.scanBatchBarcode')}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className={`${trackingBatchInfo ? 'hidden lg:inline-flex' : 'w-full lg:w-auto'} min-h-11`}
                          onClick={clearTrackingBatchSelection}
                        >
                          {t('common.clear')}
                        </Button>
                      </div>
                      {trackingLoadingBatch && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('productionTracking.lookingUpBatch')}
                        </div>
                      )}
                      {trackingBatchInfo && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
                          <span className="flex-1 font-mono">{trackingBatchInfo.barcode}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="hidden h-10 w-10 p-0 text-gray-600 hover:bg-gray-200 hover:text-gray-900 lg:inline-flex"
                            onClick={clearTrackingBatchSelection}
                            aria-label={t('common.clear')}
                          >
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      )}
                      {trackingBatchInfo && (
                        <div className="mt-1 text-xs text-gray-500">
                          {t('productionTracking.batchId')}: {trackingBatchInfo.batch_id}
                          {trackingBatchInfo.quantity != null && (
                            <> · {t('productionTracking.batchQuantity')}: {trackingBatchInfo.quantity}</>
                          )}
                        </div>
                      )}
                      {trackingBatchBarcode && !trackingBatchInfo && !trackingLoadingBatch && trackingError && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          {trackingError}
                        </div>
                      )}
                    </div>

                    {trackingBatchInfo && (
                      <div className="border-t border-gray-200 pt-4 space-y-5 flex flex-col items-center">
                        <Label className="text-sm font-medium text-gray-600 text-center block w-full">
                          {t('productionTracking.quantityProduced')}
                          {trackingMaxQuantity != null && (
                            <span className="ml-2 text-gray-500 font-normal">
                              ({t('productionTracking.maxAllowed')}: {trackingMaxQuantity})
                            </span>
                          )}
                        </Label>
                        <div className="flex items-center justify-center gap-4">
                          <Button
                            type="button"
                            size="icon"
                            className="h-14 w-14 rounded-full text-2xl font-semibold shrink-0 bg-rose-500 hover:bg-rose-600 text-white shadow-md hover:shadow-lg transition-shadow border-0"
                            onClick={() => setTrackingQuantity((q) => Math.max(0, q - 1))}
                          >
                            −
                          </Button>
                          <input
                            type="number"
                            min={0}
                            max={trackingMaxQuantity ?? undefined}
                            value={trackingQuantity}
                            onChange={(e) => {
                              const v = Math.max(0, Number.parseInt(e.target.value, 10) || 0);
                              const capped =
                                trackingMaxQuantity != null
                                  ? Math.min(v, trackingMaxQuantity)
                                  : v;
                              setTrackingQuantity(capped);
                            }}
                            className="w-28 h-14 text-center text-3xl font-bold rounded-2xl border-2 border-emerald-200 bg-emerald-50/50 text-gray-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none"
                          />
                          <Button
                            type="button"
                            size="icon"
                            className="h-14 w-14 rounded-full text-2xl font-semibold shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white shadow-md hover:shadow-lg transition-shadow border-0"
                            onClick={() =>
                              setTrackingQuantity((q) => {
                                const max = trackingMaxQuantity ?? Infinity;
                                return Math.min(q + 1, max);
                              })
                            }
                          >
                            +
                          </Button>
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                          {[2, 5, 10].map((n) => (
                            <Button
                              key={`minus-${n}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-400 font-medium"
                              onClick={() => setTrackingQuantity((q) => Math.max(0, q - n))}
                            >
                              −{n}
                            </Button>
                          ))}
                          {[2, 5, 10].map((n) => (
                            <Button
                              key={`plus-${n}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 font-medium"
                              onClick={() =>
                                setTrackingQuantity((q) => {
                                  const max = trackingMaxQuantity ?? Infinity;
                                  return Math.min(q + n, max);
                                })
                              }
                            >
                              +{n}
                            </Button>
                          ))}
                        </div>
                        <div className="grid w-full grid-cols-2 gap-3 lg:flex lg:justify-center">
                          <Button
                            onClick={handleTrackingSubmit}
                            disabled={trackingRecording || !trackingBatchInfo || trackingQuantity <= 0}
                            className="w-full min-h-14 md:min-h-16 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold shadow-md lg:w-auto lg:min-h-12 lg:min-w-[220px]"
                          >
                            {trackingRecording ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            {trackingRecording ? t('common.loading') : t('productionTracking.submitProduction')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={clearTrackingSession}
                            className="w-full min-h-14 md:min-h-16 rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 text-base font-semibold shadow-sm lg:hidden"
                          >
                            {t('common.clear')}
                          </Button>
                        </div>
                      </div>
                    )}

                    {trackingError && trackingBatchBarcode && (
                      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {trackingError}
                      </div>
                    )}
                    {trackingLastRecord && (
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                        <CheckCircle className="h-4 w-4 shrink-0" />
                        {t('productionTracking.lastRecorded', { barcode: trackingLastRecord.barcode, qty: trackingLastRecord.quantity_produced })}
                      </div>
                    )}
                  </>
                )}

                {trackingIsScanning && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-green animate-pulse" />
                    {t('productionTracking.ready')}
                  </span>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="worker-assignment" className="space-y-6 mt-4">
            <Card ref={workerAssignmentCardRef} onClick={(e) => focusWorkerBarcodeInput(e)} className="cursor-default">
              <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-lg sm:text-xl flex items-center gap-2">
                    <UserPlus className="h-5 w-5 sm:h-6 sm:w-6" />
                    {t('productionTracking.workerAssignment.title')}
                  </CardTitle>
                  <Button
                    type="button"
                    variant={sequentialModeActive ? 'destructive' : 'outline'}
                    size="sm"
                    className="shrink-0"
                    disabled={stagesForSchematic.length === 0}
                    onClick={() => {
                      if (sequentialModeActive) {
                        setSequentialModeActive(false);
                        setSequentialModeIndex(0);
                      } else {
                        setSequentialModeActive(true);
                        if (stagesForSchematic.length > 0) {
                          const startIndex =
                            assignStageId != null
                              ? stagesForSchematic.findIndex((s) => s.stage_id === assignStageId)
                              : -1;
                          const index = startIndex >= 0 ? startIndex : 0;
                          setSequentialModeIndex(index);
                          setAssignStageId(stagesForSchematic[index].stage_id);
                        }
                      }
                    }}
                  >
                    {sequentialModeActive
                      ? t('productionTracking.workerAssignment.exitSequential')
                      : t('productionTracking.workerAssignment.sequentialRead')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-5 sm:space-y-6 px-4 sm:px-6 pb-6 sm:pb-8">
                {sequentialModeActive && stagesForSchematic.length > 0 && (
                  <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white text-sm font-bold tabular-nums">
                        {sequentialModeIndex + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700/90">
                          {t('productionTracking.workerAssignment.nowAssigning')}
                        </p>
                        <p className="text-base font-semibold text-emerald-900">
                          {(() => {
                            const s = stagesForSchematic[sequentialModeIndex];
                            return s ? stageDisplayLabel(s.stage_name, s.stage_id) : '';
                          })()}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-emerald-800 tabular-nums">
                      {sequentialModeIndex + 1} {t('productionTracking.workerAssignment.of')} {stagesForSchematic.length}
                    </p>
                  </div>
                )}
                {isScanningWorker && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                    <span className="h-2.5 w-2.5 rounded-full bg-green animate-pulse" />
                    {t('productionTracking.ready')}
                  </span>
                )}
                <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">{t('productionTracking.workerAssignment.productionPhase')}</Label>
                    <Select
                      value={selectedPhaseId == null ? '' : String(selectedPhaseId)}
                      onValueChange={(v) => setSelectedPhaseId(Number(v))}
                      disabled={loadingPhases}
                    >
                      <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full">
                        <SelectValue placeholder={t('productionTracking.workerAssignment.selectPhase')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sewingPhases.map((p) => (
                          <SelectItem key={p.phase_id} value={String(p.phase_id)} className="text-base py-3">
                            {p.phase_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base">{t('productionTracking.workerAssignment.schematic')}</Label>
                    <Select
                      value={selectedSchematicId == null ? '' : String(selectedSchematicId)}
                      onValueChange={(v) => setSelectedSchematicId(Number(v))}
                      disabled={loadingSchematics || schematics.length === 0}
                    >
                      <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full">
                        <SelectValue placeholder={t('productionTracking.workerAssignment.selectSchematic')} />
                      </SelectTrigger>
                      <SelectContent>
                        {schematics.map((s) => (
                          <SelectItem key={s.schematic_id} value={String(s.schematic_id)} className="text-base py-3">
                            {s.name} {s.phase_name ? `(${s.phase_name})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-5 sm:pt-6 flex flex-wrap items-end gap-4">
                  <div className="flex-1 min-w-0 sm:min-w-[280px]">
                    <Label className="text-sm sm:text-base font-medium text-gray-600 block mb-2">
                      {t('productionTracking.workerAssignment.assignToStage')}
                    </Label>
                    <Select
                      value={assignStageId == null ? '' : String(assignStageId)}
                      onValueChange={(v) => setAssignStageId(Number(v))}
                      disabled={stagesForSchematic.length === 0 || sequentialModeActive}
                    >
                      <SelectTrigger
                        className={`min-h-11 sm:min-h-12 text-base w-full border-l-4 ${
                          assignStageId == null
                            ? 'border-l-transparent'
                            : (() => {
                                const idx = stagesForSchematic.findIndex((s) => s.stage_id === assignStageId);
                                return idx >= 0 ? STAGE_DROPDOWN_COLORS[idx % STAGE_DROPDOWN_COLORS.length].split(' ')[0] ?? 'border-l-gray-400' : 'border-l-gray-400';
                              })()
                        }`}
                      >
                        <SelectValue placeholder={t('productionTracking.workerAssignment.selectStage')} />
                      </SelectTrigger>
                      <SelectContent>
                        {stagesForSchematic.map((s, idx) => (
                          <SelectItem
                            key={s.stage_id}
                            value={String(s.stage_id)}
                            className={`text-base py-3 pl-4 border-l-4 ${getStageItemColor(idx)}`}
                          >
                            {stageDisplayLabel(s.stage_name, s.stage_id)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!sequentialModeActive && stagesForSchematic.length > 0 && (
                      <p className="mt-1.5 text-xs text-gray-500">
                        {t('productionTracking.workerAssignment.sequentialStartFromHint')}
                      </p>
                    )}
                  </div>
                  {assignStageId != null && (() => {
                    const selectedStage = stagesForSchematic.find((s) => s.stage_id === assignStageId);
                    if (!selectedStage) return null;
                    const qty = selectedStage.production_qty;
                    return (
                      <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 shadow-sm min-w-[140px] max-w-[200px] shrink-0">
                        <p className="text-xs font-medium uppercase tracking-wide text-emerald-700/90 mb-1">
                          {t('productionTracking.workerAssignment.productionQuantityForStage')}
                        </p>
                        <p className="text-3xl font-bold tabular-nums text-emerald-800">
                          {qty ?? '—'}
                        </p>
                      </div>
                    );
                  })()}
                </div>

                <div className="grid grid-cols-1 gap-4 pt-5 sm:pt-6 sm:flex sm:flex-row sm:flex-wrap sm:justify-center sm:items-end sm:gap-6">
                  <div className="space-y-1.5 w-full min-w-0 overflow-hidden sm:w-auto sm:flex-initial sm:min-w-[180px]">
                    <Label className="text-sm text-gray-600">{t('productionTracking.workerAssignment.assignmentDate')}</Label>
                    <input
                      type="date"
                      value={assignmentDateWorker}
                      onChange={(e) => setAssignmentDateWorker(e.target.value)}
                      className="flex h-11 sm:h-12 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none rounded-md border border-input bg-transparent px-3 sm:px-4 py-2 text-sm sm:text-base shadow-sm transition-colors"
                    />
                  </div>
                  {sequentialModeActive ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium">
                      {loadingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {t('productionTracking.workerAssignment.scanToAutoAssign')}
                    </div>
                  ) : (
                    <Button
                      onClick={handleWorkerAssign}
                      disabled={loadingAssign || resolvedWorker == null || assignStageId == null}
                      className="min-h-12 px-8 text-base font-medium w-full sm:w-auto sm:min-w-[160px]"
                    >
                      {loadingAssign ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                      {loadingAssign ? t('common.loading') : t('productionTracking.workerAssignment.assign')}
                    </Button>
                  )}
                </div>

                <div className="border-t border-gray-200 pt-5 sm:pt-6 mt-4">
                  <Label className="text-sm sm:text-base font-medium text-gray-600">
                    {t('productionTracking.workerAssignment.scanWorkerBarcode')}
                  </Label>
                  {workerResolveError && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm sm:text-base text-red-800">
                      <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                      {workerResolveError}
                    </div>
                  )}
                  {loadingWorker && (
                    <div className="mt-3 flex items-center gap-2 text-sm sm:text-base text-gray-600">
                      <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      {t('common.loading')}
                    </div>
                  )}
                  {resolvedWorker && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm sm:text-base text-green-800">
                      <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
                      {t('productionTracking.workerAssignment.workerResolved', { name: resolvedWorker.worker_name, id: resolvedWorker.worker_id })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="overtime" className="space-y-6 mt-4">
            <ProductionOvertimeTab isActive={activeTab === 'overtime'} />
          </TabsContent>

          <TabsContent value="schematic-view" className="space-y-6 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <LayoutGrid className="h-5 w-5" />
                  {t('productionTracking.tabSchematicView')}
                </CardTitle>
                <p className="text-sm text-gray-500">
                  {t('productionTracking.schematicViewHint')}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base font-medium text-gray-600">
                      {t('productionTracking.workerAssignment.productionPhase')}
                    </Label>
                    <Select
                      value={schematicViewPhaseId == null ? '' : String(schematicViewPhaseId)}
                      onValueChange={(v) => setSchematicViewPhaseId(v ? Number(v) : null)}
                      disabled={loadingPhases || sewingPhases.length === 0}
                    >
                      <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full max-w-md">
                        <SelectValue placeholder={t('productionTracking.workerAssignment.selectPhase')} />
                      </SelectTrigger>
                      <SelectContent>
                        {sewingPhases.map((p) => (
                          <SelectItem key={p.phase_id} value={String(p.phase_id)} className="text-base py-3">
                            {p.phase_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm sm:text-base font-medium text-gray-600">
                      {t('productionTracking.workerAssignment.schematic')}
                    </Label>
                    <Select
                      value={schematicViewSelectedId == null ? '' : String(schematicViewSelectedId)}
                      onValueChange={(v) => setSchematicViewSelectedId(v ? Number(v) : null)}
                      disabled={
                        loadingSchematicViewList ||
                        schematicViewList.length === 0 ||
                        schematicViewPhaseId == null
                      }
                    >
                      <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full max-w-md">
                        <SelectValue placeholder={t('productionTracking.workerAssignment.selectSchematic')} />
                      </SelectTrigger>
                      <SelectContent>
                        {schematicViewList.map((s) => (
                          <SelectItem key={s.schematic_id} value={String(s.schematic_id)} className="text-base py-3">
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {loadingSchematicView && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  </div>
                )}

                {!loadingSchematicView && schematicViewDetail && (() => {
                  const schematic = schematicViewDetail;
                  const totalProduction = schematic.stages?.length
                    ? lineCapacityFromStages(schematic.stages)
                    : null;
                  const orderedNodes = schematic.stages?.length
                    ? stagesToOrderedNodes(schematic.stages)
                    : [];
                  const effectiveOutputs: number[] = [];
                  if (orderedNodes.length > 0) {
                    let runningMin = orderedNodes[0].totalOutput;
                    for (let i = 0; i < orderedNodes.length; i++) {
                      runningMin = Math.min(runningMin, orderedNodes[i].totalOutput);
                      effectiveOutputs.push(runningMin);
                    }
                  }
                  const bottleneckIndices = new Set<number>();
                  if (totalProduction != null && totalProduction > 0) {
                    orderedNodes.forEach((node, i) => {
                      if (node.totalOutput === totalProduction) bottleneckIndices.add(i);
                    });
                  }
                  return (
                    <>
                      <Card className="overflow-hidden border-gray-200/80 shadow-sm">
                        <div className="border-l-4 border-primary bg-primary/5">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-xl font-semibold text-gray-900">{schematic.name}</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 pb-6">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                              <span>
                                <span className="text-sm font-medium text-gray-500">{t('productionManagement.phase')}</span>
                                <span className="ml-2 text-gray-900">{schematic.phase_name ?? t('common.na')}</span>
                              </span>
                              <Badge variant={schematic.active ? 'default' : 'secondary'} className="shrink-0 font-medium">
                                {schematic.active ? t('productionManagement.active') : t('productionManagement.inactive')}
                              </Badge>
                              {schematic.working_hours != null && (
                                <span>
                                  <span className="text-sm font-medium text-gray-500">{t('productionManagement.create.workingHours')}</span>
                                  <span className="ml-2 text-gray-900">{schematic.working_hours} h</span>
                                </span>
                              )}
                              {schematic.start_time != null && schematic.start_time !== '' && (
                                <span>
                                  <span className="text-sm font-medium text-gray-500">
                                    {t('productionManagement.create.startTime')}
                                  </span>
                                  <span className="ml-2 text-gray-900 tabular-nums">
                                    {schematic.start_time.length >= 5
                                      ? schematic.start_time.slice(0, 5)
                                      : schematic.start_time}
                                  </span>
                                </span>
                              )}
                            </div>
                            {(totalProduction != null || (schematic.stages?.length ?? 0) > 0) && (
                              <div className="mt-3 flex flex-wrap gap-4">
                                <div className="w-full min-w-[200px] max-w-xs">
                                  <div className="rounded-xl border-2 border-primary/30 bg-white px-4 py-4 shadow-md ring-1 ring-black/5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                      {t('productionManagement.create.hourlyProductionTotal')}
                                    </p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums text-primary md:text-3xl">
                                      {totalProduction != null ? totalProduction : '—'}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-primary md:text-xl">
                                      {t('productionManagement.create.hourlyUnits')}
                                    </p>
                                  </div>
                                </div>
                                <div className="w-full min-w-[200px] max-w-xs">
                                  <div className="rounded-xl border-2 border-primary/30 bg-white px-4 py-4 shadow-md ring-1 ring-black/5">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                      {t('productionManagement.details.totalDailyProduction')}
                                    </p>
                                    <p className="mt-1 text-2xl font-bold tabular-nums text-primary md:text-3xl">
                                      {totalProduction != null && schematic.working_hours != null && schematic.working_hours > 0
                                        ? Math.round(totalProduction * schematic.working_hours)
                                        : '—'}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold text-primary md:text-xl">
                                      {t('productionManagement.details.dailyUnits')}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </div>
                      </Card>

                      <Card className="overflow-hidden border-gray-200/80 shadow-sm">
                        <CardHeader className="border-b bg-gray-50/50">
                          <CardTitle className="text-lg font-semibold">
                            {t('productionManagement.details.stagesTitle')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 md:p-6">
                          {orderedNodes.length === 0 ? (
                            <p className="py-10 text-center text-gray-500">
                              {t('productionManagement.details.noStages')}
                            </p>
                          ) : (
                            <div className="flex flex-col items-center gap-0 py-2">
                              {orderedNodes.map((node, index) => (
                                <React.Fragment key={node.stage_order}>
                                  <div className="flex w-full max-w-lg flex-col">
                                    <div
                                      className={`flex flex-col rounded-lg border-2 px-4 py-3 shadow-sm ring-1 transition ${
                                        bottleneckIndices.has(index)
                                          ? 'border-amber-500 bg-amber-50/80 ring-amber-400/60'
                                          : `${SCHEMATIC_VIEW_STAGE_BOX_COLORS[index % SCHEMATIC_VIEW_STAGE_BOX_COLORS.length]} ring-black/5`
                                      }`}
                                    >
                                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                        <span
                                          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${SCHEMATIC_VIEW_ORDER_BADGE_COLORS[index % SCHEMATIC_VIEW_ORDER_BADGE_COLORS.length]}`}
                                        >
                                          #{node.stage_order}
                                        </span>
                                        <span className="text-sm font-medium text-gray-800">
                                          {node.names.filter(Boolean).join(', ') || '—'}
                                        </span>
                                        {bottleneckIndices.has(index) && (
                                          <span className="inline-flex items-center rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                                            {t('productionManagement.details.bottleneck')}
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-2 flex flex-col gap-1">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                          {t('productionManagement.details.perStageProduction')}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {node.quantities.length > 0 ? (
                                            node.quantities.map((qty, i) => {
                                              const stageId = node.stage_ids[i];
                                              const worker = stageId != null ? stageIdToWorker[stageId] : undefined;
                                              return (
                                                <span
                                                  key={`qty-${node.stage_order}-${i}`}
                                                  className={`rounded px-2 py-1 text-sm font-medium ${SCHEMATIC_VIEW_MACHINE_PILL_COLORS[i % SCHEMATIC_VIEW_MACHINE_PILL_COLORS.length]}`}
                                                >
                                                  {t('productionManagement.details.machineN', { n: i + 1 })}: {qty}{' '}
                                                  {t('productionManagement.create.hourlyUnits')}
                                                  <span className="ml-1.5 font-normal text-gray-700">
                                                    — {worker ? `${worker.name} (ID: ${worker.id})` : t('productionManagement.details.noAssignedWorker')}
                                                  </span>
                                                </span>
                                              );
                                            })
                                          ) : (
                                            <span className="text-xs text-gray-400">—</span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="mt-1.5 flex flex-col items-center gap-0.5">
                                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                        {effectiveOutputs[index] != null && effectiveOutputs[index] > 0
                                          ? `${effectiveOutputs[index]} ${t('productionManagement.create.hourlyUnits')}`
                                          : '—'}
                                      </span>
                                      {effectiveOutputs[index] != null &&
                                        effectiveOutputs[index] > 0 &&
                                        effectiveOutputs[index] < node.totalOutput && (
                                          <span className="text-xs text-gray-500">
                                            {t('productionManagement.details.effectiveOutput')}
                                          </span>
                                        )}
                                    </div>
                                  </div>
                                  {index < orderedNodes.length - 1 && (
                                    <div className="flex shrink-0 items-center py-1">
                                      <ChevronDown className="h-6 w-6 text-primary/60" aria-hidden />
                                    </div>
                                  )}
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ProductionTrackingPage;
