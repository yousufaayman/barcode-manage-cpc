import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import { Clock, X } from 'lucide-react';
import { productionApi, barcodeApi } from '../services/api';
import type { SewingLineSchematic, Worker, DailyAssignmentResponse } from '../services/api';

function formatDateForInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type OvertimeWorker = Pick<Worker, 'worker_id' | 'worker_name'>;

interface ProductionOvertimeTabProps {
  isActive: boolean;
}

const ProductionOvertimeTab: React.FC<ProductionOvertimeTabProps> = ({ isActive }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const todayStr = useMemo(() => formatDateForInput(new Date()), []);

  const [loadingPhases, setLoadingPhases] = useState(false);
  const [phases, setPhases] = useState<Array<{ phase_id: number; phase_name: string; type?: string }>>([]);

  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [loadingSchematics, setLoadingSchematics] = useState(false);
  const [schematics, setSchematics] = useState<SewingLineSchematic[]>([]);
  const [selectedSchematicId, setSelectedSchematicId] = useState<number | null>(null);

  const [overtimeHoursStr, setOvertimeHoursStr] = useState<string>('1');
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const [overtimeWorkers, setOvertimeWorkers] = useState<OvertimeWorker[]>([]);

  const [todayAssignments, setTodayAssignments] = useState<DailyAssignmentResponse[]>([]);
  const [todayAssignmentsLoaded, setTodayAssignmentsLoaded] = useState(false);
  const [loadingTodayAssignments, setLoadingTodayAssignments] = useState(false);

  const [isScanningWorker, setIsScanningWorker] = useState(false);
  const overtimeBarcodeInputRef = useRef<HTMLInputElement>(null);
  const overtimeScanBufferRef = useRef('');
  const overtimeScanTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const workersSet = useMemo(() => {
    const s = new Set<number>();
    overtimeWorkers.forEach((w) => s.add(w.worker_id));
    return s;
  }, [overtimeWorkers]);

  useEffect(() => {
    if (!isActive) return;
    overtimeBarcodeInputRef.current?.focus();
  }, [isActive]);

  const ensureTodayAssignmentsLoaded = async () => {
    if (todayAssignmentsLoaded || loadingTodayAssignments) return;
    setLoadingTodayAssignments(true);
    try {
      const rows = await productionApi.getAssignments(todayStr);
      setTodayAssignments(rows);
      setTodayAssignmentsLoaded(true);
    } catch {
      // If assignments cannot be loaded, fail closed (no worker should be added).
      setTodayAssignments([]);
      setTodayAssignmentsLoaded(true);
    } finally {
      setLoadingTodayAssignments(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    ensureTodayAssignmentsLoaded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, todayStr]);

  useEffect(() => {
    // Load phases once: sewing-type phases only, excluding the phase named "Sewing".
    const load = async () => {
      setLoadingPhases(true);
      try {
        const all = await barcodeApi.getPhases();
        const sewing = (all || [])
          .filter((p) => (p.type || '').toLowerCase() === 'sewing')
          .filter((p) => (p.phase_name || '').trim().toLowerCase() !== 'sewing');
        setPhases(sewing);
        if (sewing.length > 0) setSelectedPhaseId((prev) => prev ?? sewing[0].phase_id);
      } catch {
        setPhases([]);
      } finally {
        setLoadingPhases(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (selectedPhaseId == null) {
      setSchematics([]);
      setSelectedSchematicId(null);
      return;
    }
    const load = async () => {
      setLoadingSchematics(true);
      try {
        const all = await productionApi.getSchematics({ active_only: true });
        const forPhase = all.filter((s) => s.production_phase_id === selectedPhaseId);
        setSchematics(forPhase);
        setSelectedSchematicId(forPhase.length ? forPhase[0].schematic_id : null);
      } finally {
        setLoadingSchematics(false);
      }
    };
    load();
  }, [selectedPhaseId]);

  const addWorkerById = async (workerId: number) => {
    if (workersSet.has(workerId)) {
      toast({
        title: t('productionTracking.overtime.toastOvertimeTitle'),
        description: t('productionTracking.overtime.toastWorkerAlreadyAdded', { workerId }),
      });
      return;
    }

    await ensureTodayAssignmentsLoaded();
    const hasTodayAssignment = todayAssignments.some((a) => Number(a.worker_id) === workerId);
    if (!hasTodayAssignment) {
      setRequestError(t('productionTracking.overtime.workerNotAssignedToday', { workerId }));
      return;
    }

    const worker = await productionApi.getWorkerById(workerId);
    setOvertimeWorkers((prev) => [...prev, { worker_id: worker.worker_id, worker_name: worker.worker_name }]);
  };

  const resolveWorkerFromBarcode = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;
    const workerId = Number.parseInt(code, 10);
    if (Number.isNaN(workerId) || workerId <= 0) {
      setRequestError(t('productionTracking.overtime.invalidWorkerBarcode'));
      return;
    }
    try {
      await addWorkerById(workerId);
      setRequestError(null);
    } catch {
      setRequestError(t('productionTracking.overtime.workerNotFound', { workerId }));
    }
  };

  // Barcode scanning: capture key events into a buffer and resolve on Enter/short timeout.
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target !== overtimeBarcodeInputRef.current &&
        (target?.closest?.('input') ||
          target?.closest?.('select') ||
          target?.closest?.('textarea') ||
          target?.closest?.('[role="combobox"]') ||
          target?.closest?.('[role="listbox"]'))
      ) {
        return;
      }

      const skipKeys = [
        'Shift',
        'Control',
        'Alt',
        'Meta',
        'CapsLock',
        'Tab',
        'Escape',
        'Backspace',
        'Delete',
        'F1',
        'F2',
        'F3',
        'F4',
        'F5',
        'F6',
        'F7',
        'F8',
        'F9',
        'F10',
        'F11',
        'F12',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
        'PageUp',
        'PageDown',
      ];
      if (skipKeys.includes(e.key) || e.ctrlKey || e.altKey || e.metaKey || e.key.length !== 1) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Enter') {
        const scanned = overtimeScanBufferRef.current;
        if (!scanned) return;
        overtimeScanBufferRef.current = '';
        resolveWorkerFromBarcode(scanned);
        return;
      }

      overtimeScanBufferRef.current += e.key;
      setIsScanningWorker(true);
      if (overtimeScanTimeoutRef.current) clearTimeout(overtimeScanTimeoutRef.current);
      overtimeScanTimeoutRef.current = setTimeout(() => {
        setIsScanningWorker(false);
        const scanned = overtimeScanBufferRef.current;
        if (!scanned) return;
        overtimeScanBufferRef.current = '';
        resolveWorkerFromBarcode(scanned);
      }, 50);
    };

    globalThis.addEventListener('keydown', handleKeyDown, true);
    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown, true);
      if (overtimeScanTimeoutRef.current) clearTimeout(overtimeScanTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, workersSet]);

  const overtimeHoursValue = Number.parseFloat(overtimeHoursStr);
  const overtimeHoursValid = Number.isFinite(overtimeHoursValue) && overtimeHoursValue > 0;

  const handleRequestOvertime = async () => {
    setRequestError(null);
    if (selectedPhaseId == null || selectedSchematicId == null) {
      setRequestError(t('productionTracking.overtime.selectPhaseAndSchematic'));
      return;
    }
    if (!overtimeHoursValid) {
      setRequestError(t('productionTracking.overtime.enterValidOvertimeHours'));
      return;
    }
    if (overtimeWorkers.length === 0) {
      setRequestError(t('productionTracking.overtime.scanAtLeastOneWorker'));
      return;
    }

    setRequesting(true);
    try {
      await productionApi.createOvertimeRequest({
        phase_id: selectedPhaseId,
        schematic_id: selectedSchematicId,
        work_date: todayStr,
        overtime_hours: overtimeHoursValue,
        worker_ids: overtimeWorkers.map((w) => w.worker_id),
      });

      toast({
        title: t('productionTracking.overtime.toastRequestCreatedTitle'),
        description: t('productionTracking.overtime.toastRequestCreatedDescription'),
      });

      setOvertimeWorkers([]);
      setOvertimeHoursStr('1');
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : undefined;

      if (typeof detail === 'string') {
        setRequestError(detail);
      } else if (Array.isArray(detail)) {
        const first = detail[0];
        const msg =
          typeof first === 'object' && first
            ? (first as { msg?: string }).msg ?? JSON.stringify(first)
            : String(first);
        setRequestError(msg);
      } else if (detail != null) {
        setRequestError(JSON.stringify(detail));
      } else {
        setRequestError(t('productionTracking.overtime.failedToCreateRequest'));
      }
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('productionTracking.overtime.title')}
        </CardTitle>
        <p className="text-sm text-gray-500">{t('productionTracking.overtime.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <input
          ref={overtimeBarcodeInputRef}
          type="text"
          autoComplete="off"
          className="absolute opacity-0 w-0 h-0 pointer-events-none"
          aria-label={t('productionTracking.overtime.scanWorkerBarcodeLabel')}
          readOnly
        />

        <div className="grid gap-4 sm:gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm sm:text-base">{t('productionTracking.overtime.phaseLabel')}</Label>
            <Select
              value={selectedPhaseId == null ? '' : String(selectedPhaseId)}
              onValueChange={(v) => setSelectedPhaseId(Number(v))}
              disabled={loadingPhases}
            >
              <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full">
                <SelectValue placeholder={t('productionTracking.overtime.selectPhasePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {phases.map((p) => (
                  <SelectItem key={p.phase_id} value={String(p.phase_id)} className="text-base py-3">
                    {p.phase_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm sm:text-base">{t('productionTracking.overtime.schematicLabel')}</Label>
            <Select
              value={selectedSchematicId == null ? '' : String(selectedSchematicId)}
              onValueChange={(v) => setSelectedSchematicId(Number(v))}
              disabled={loadingSchematics || schematics.length === 0}
            >
              <SelectTrigger className="min-h-11 sm:min-h-12 text-base w-full">
                <SelectValue placeholder={t('productionTracking.overtime.selectSchematicPlaceholder')} />
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

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px] space-y-2">
            <Label className="text-sm sm:text-base">{t('productionTracking.overtime.overtimeHoursLabel')}</Label>
            <Input
              inputMode="decimal"
              type="number"
              step={0.25}
              min={0}
              value={overtimeHoursStr}
              onChange={(e) => setOvertimeHoursStr(e.target.value)}
              disabled={requesting}
              className="h-11 sm:h-12"
            />
            {/* Message intentionally removed: approval/application behavior is documented elsewhere. */}
          </div>
          <div className="pb-1">
            <Badge variant="outline" className="px-3 py-2 text-sm">
              {t('productionTracking.overtime.workDateLabel')}: {todayStr}
            </Badge>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-3">
          <Label className="text-sm font-medium text-gray-600">{t('productionTracking.overtime.scanWorkerBarcodeLabel')}</Label>
          {isScanningWorker && (
            <div className="text-xs text-gray-500 inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('productionTracking.overtime.scanReady')}
            </div>
          )}
          {requestError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {requestError}
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-gray-700">
                  {t('productionTracking.overtime.addedWorkersLabel')}: {overtimeWorkers.length}
              </div>
              {overtimeWorkers.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={requesting}
                  onClick={() => setOvertimeWorkers([])}
                >
                    {t('productionTracking.overtime.clear')}
                </Button>
              )}
            </div>

            {overtimeWorkers.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">{t('productionTracking.overtime.scanWorkerIdsHint')}</p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {overtimeWorkers.map((w) => (
                  <Badge key={w.worker_id} variant="secondary" className="px-2 py-1 flex items-center gap-2">
                    <span className="font-medium">
                      {w.worker_name} (ID: {w.worker_id})
                    </span>
                    <button
                      type="button"
                      className="ml-1 inline-flex items-center justify-center rounded-full hover:bg-black/10 w-6 h-6"
                      aria-label={t('productionTracking.overtime.removeWorkerAriaLabel')}
                      onClick={() => setOvertimeWorkers((prev) => prev.filter((x) => x.worker_id !== w.worker_id))}
                      disabled={requesting}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center w-full pt-2">
          <Button
            onClick={handleRequestOvertime}
            disabled={requesting || !overtimeHoursValid || overtimeWorkers.length === 0 || selectedSchematicId == null}
            className="min-w-[220px] h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-md"
          >
            {requesting ? t('productionTracking.overtime.requesting') : t('productionTracking.overtime.requestOvertimeButton')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductionOvertimeTab;

