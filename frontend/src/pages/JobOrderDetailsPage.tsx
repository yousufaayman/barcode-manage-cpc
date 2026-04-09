import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { jobOrderApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Edit, X, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { sortSizes } from '../utils/sizeSort';
import { Checkbox } from '../components/ui/checkbox';
import { DEFAULT_PRINT_PLACEMENTS } from '../constants/printPlacements';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';

type PrintConfigState = {
  type: string;
  fields: Record<string, string>;
  placementLabels: Record<string, string>;
  colorBreakdown: Record<string, Record<string, string>>;
};

const normalizePrintConfig = (config: any): PrintConfigState | null => {
  if (!config) return null;

  const typeValue = config.type || config.method || config.mode;
  if (!typeValue) return null;

  const mergedFields: Record<string, string> = {};
  const placementLabels: Record<string, string> = {};
  const colorBreakdown: Record<string, Record<string, string>> = {};

  const mergeEntries = (entries: Record<string, any> | undefined) => {
    if (!entries) return;
    Object.entries(entries).forEach(([key, value]) => {
      if (!key || value === null || value === undefined || value === '') return;
      mergedFields[key] = String(value);
    });
  };

  mergeEntries(config.details);
  mergeEntries(config.fields);

  Object.entries(config).forEach(([key, value]) => {
    if (['type', 'method', 'mode', 'details', 'fields', 'placement_labels', 'placementLabels', 'color_breakdown', 'colorBreakdown'].includes(key)) return;
    if (value === null || value === undefined || value === '') return;
    mergedFields[key] = String(value);
  });

  const labels = config.placement_labels || config.placementLabels;
  if (labels && typeof labels === 'object') {
    Object.entries(labels).forEach(([key, value]) => {
      if (!key || value === null || value === undefined || value === '') return;
      placementLabels[key] = String(value);
    });
  }

  const breakdown = config.color_breakdown || config.colorBreakdown;
  if (breakdown && typeof breakdown === 'object') {
    Object.entries(breakdown).forEach(([color, placements]) => {
      if (!placements || typeof placements !== 'object') return;
      const normalized: Record<string, string> = {};
      Object.entries(placements).forEach(([placementKey, placementValue]) => {
        if (!placementKey || placementValue === null || placementValue === undefined || placementValue === '') return;
        normalized[placementKey] = String(placementValue);
      });
      if (Object.keys(normalized).length > 0) {
        colorBreakdown[color] = normalized;
      }
    });
  }

  if (Object.keys(placementLabels).length === 0 && Object.keys(colorBreakdown).length > 0) {
    const derivedKeys = new Set<string>();
    Object.values(colorBreakdown).forEach(entries => {
      Object.keys(entries).forEach(key => derivedKeys.add(key));
    });
    derivedKeys.forEach(key => {
      const label = key
        .split('_')
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ');
      placementLabels[key] = label || key;
    });
  }

  return { type: typeValue, fields: mergedFields, placementLabels, colorBreakdown };
};

const serializePrintConfig = (config: PrintConfigState | null): Record<string, any> | null => {
  if (!config) return null;
  const payload: Record<string, any> = { type: config.type, fields: {} };
  Object.entries(config.fields).forEach(([key, value]) => {
    if (!key) return;
    payload[key] = value;
    payload.fields[key] = value;
  });
  if (Object.keys(config.placementLabels).length > 0) {
    payload.placement_labels = config.placementLabels;
  }
  if (Object.keys(config.colorBreakdown).length > 0) {
    payload.color_breakdown = config.colorBreakdown;
  }
  return payload;
};

const buildDefaultPlacementLabels = () =>
  DEFAULT_PRINT_PLACEMENTS.reduce<Record<string, string>>((acc, placement) => {
    acc[placement.key] = placement.label;
    return acc;
  }, {});

// Helper to convert backend absolute path to public URL
const getPublicImageUrl = (path: string): string => {
  if (!path) return '';
  // If backend already returns a web-accessible URL, use it directly
  if (path.startsWith('http') || path.startsWith('/')) return path;
  // Otherwise, extract filename and serve from /static/<filename>
  const parts = path.split(/\\|\//); // split on both backslash and slash
  const filename = parts[parts.length - 1];
  return `/static/${encodeURIComponent(filename)}`;
};

const JobOrderDetailsPage: React.FC = () => {
  const { jobOrderId } = useParams<{ jobOrderId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [viewJobOrder, setViewJobOrder] = useState<any>(null);
  const [viewTrackingData, setViewTrackingData] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [compensations, setCompensations] = useState<any[]>([]);
  const [compensationPhaseSummary, setCompensationPhaseSummary] = useState<Array<{phase_id: number; phase_name: string; count: number}>>([]);
  const [qcSummary, setQcSummary] = useState<{
    total_rejected_pieces: number;
    today_rejected_pieces: number;
    phases: Array<{
      phase_id: number;
      phase_name: string;
      phase_type?: string | null;
      reject: number;
      final_stage_production_all_time?: number;
      final_stage_production_today?: number;
      reject_ratio_pct_all_time?: number | null;
      reject_ratio_pct_today?: number | null;
      active_rework_batches: number;
      active_rework_problem_stages: Array<{ problem_stage_name: string; count: number }>;
      rejection_reason_counts: Array<{
        problem_stage_name: string;
        total_count: number;
        workers: Array<{
          worker_name: string;
          total_count: number;
          reasons: Array<{ reason: string; count: number }>;
        }>;
      }>;
      rejection_reason_totals?: Array<{ reason: string; count: number }>;
    }>;
    today_phases: Array<{
      phase_id: number;
      phase_name: string;
      phase_type?: string | null;
      reject: number;
      final_stage_production_all_time?: number;
      final_stage_production_today?: number;
      reject_ratio_pct_all_time?: number | null;
      reject_ratio_pct_today?: number | null;
      active_rework_batches: number;
      active_rework_problem_stages: Array<{ problem_stage_name: string; count: number }>;
      rejection_reason_counts: Array<{
        problem_stage_name: string;
        total_count: number;
        workers: Array<{
          worker_name: string;
          total_count: number;
          reasons: Array<{ reason: string; count: number }>;
        }>;
      }>;
      rejection_reason_totals?: Array<{ reason: string; count: number }>;
    }>;
  }>({
    total_rejected_pieces: 0,
    today_rejected_pieces: 0,
    phases: [],
    today_phases: [],
  });
  const [expandedQcPhaseIds, setExpandedQcPhaseIds] = useState<Record<number, boolean>>({});
  const [showProblemNotifications, setShowProblemNotifications] = useState(false);
  const [topImageVisible, setTopImageVisible] = useState(true);
  const [expandedCompensationDates, setExpandedCompensationDates] = useState<Record<string, boolean>>({});
  const [expandedRejectionStages, setExpandedRejectionStages] = useState<Record<string, boolean>>({});
  const [expandedRejectionWorkers, setExpandedRejectionWorkers] = useState<Record<string, boolean>>({});
  const [viewLoading, setViewLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItems, setEditItems] = useState<Array<{item_id: number, quantity: number, color_name: string, size_value: string}>>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMaterials, setEditMaterials] = useState<Array<{material_name: string, color_name: string, quantity: number, notes?: string}>>([]);
  const [editPrints, setEditPrints] = useState<PrintConfigState | null>(null);
  const [editPrintSelection, setEditPrintSelection] = useState<Record<string, boolean>>({});
  const [editPrintBulkPlacementKey, setEditPrintBulkPlacementKey] = useState<string>(DEFAULT_PRINT_PLACEMENTS[0]?.key || '');
  const [editPrintBulkValue, setEditPrintBulkValue] = useState<string>('');
  // Removed: confirmDialogOpen, confirmAction (close/reopen state)

  // Print copies state
  const [printCopies, setPrintCopies] = useState<number>(1);

  // Edit state
  const [editingJobOrder, setEditingJobOrder] = useState<any>(null);
  const [editMaterialName, setEditMaterialName] = useState<string>('');
  const [editConsumptionCategories, setEditConsumptionCategories] = useState<Array<{key: string; label: string; usesMaterialName: boolean}>>([
    { key: 'body', label: 'الجسم', usesMaterialName: true },
  ]);
  const [editBulkConsumption, setEditBulkConsumption] = useState<Record<string, number>>({});
  const [editConsumptionValues, setEditConsumptionValues] = useState<Record<string, number>>({});

  // Archive state
  const [archiving, setArchiving] = useState(false);
  const [archivingItem, setArchivingItem] = useState<number | null>(null);
  
  // Track if this is the initial page load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const parsedViewPrints = normalizePrintConfig(viewJobOrder?.prints);
  const viewPrintEntries = parsedViewPrints ? Object.entries(parsedViewPrints.fields) : [];
  const viewPrintColorBreakdown = parsedViewPrints?.colorBreakdown || {};
  const viewPlacementLabels = parsedViewPrints?.placementLabels || {};
  const viewColorBreakdownEntries = Object.entries(viewPrintColorBreakdown);
  const compensationPhaseTotals = useMemo(() => {
    const phaseMap = new Map<string, { phaseName: string; count: number; quantity: number }>();
    compensations.forEach((comp) => {
      const phaseName = comp.phase_name || 'Unknown Phase';
      const existing = phaseMap.get(phaseName) || { phaseName, count: 0, quantity: 0 };
      existing.count += 1;
      existing.quantity += Number(comp.quantity || 0);
      phaseMap.set(phaseName, existing);
    });
    return Array.from(phaseMap.values()).sort((a, b) => a.phaseName.localeCompare(b.phaseName));
  }, [compensations]);

  useEffect(() => {
    setTopImageVisible(true);
  }, [viewJobOrder?.image_url]);

  const compensationPhaseDaily = useMemo(() => {
    const dateMap = new Map<string, Map<string, { phaseName: string; count: number; quantity: number }>>();
    compensations.forEach((comp) => {
      if (!comp.created_at) return;
      const parsedDate = new Date(comp.created_at);
      if (Number.isNaN(parsedDate.getTime())) return;
      const dateKey = format(parsedDate, 'yyyy-MM-dd');
      const phaseName = comp.phase_name || 'Unknown Phase';
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, new Map());
      }
      const phaseMap = dateMap.get(dateKey)!;
      const existing = phaseMap.get(phaseName) || { phaseName, count: 0, quantity: 0 };
      existing.count += 1;
      existing.quantity += Number(comp.quantity || 0);
      phaseMap.set(phaseName, existing);
    });

    return Array.from(dateMap.entries())
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
      .flatMap(([date, phaseMap]) =>
        Array.from(phaseMap.values())
          .sort((a, b) => a.phaseName.localeCompare(b.phaseName))
          .map((entry) => ({ date, ...entry }))
      );
  }, [compensations]);

  const viewPlacementOrder = useMemo(() => {
    const entries = Object.entries(viewPlacementLabels);
    if (entries.length > 0) {
      return entries.map(([key, label]) => ({ key, label }));
    }
    const derivedKeys = new Set<string>();
    viewColorBreakdownEntries.forEach(([, placements]) => {
      Object.keys(placements).forEach(key => derivedKeys.add(key));
    });
    return Array.from(derivedKeys).map(key => ({
      key,
      label: key
        .split('_')
        .filter(Boolean)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ') || key
    }));
  }, [viewPlacementLabels, viewColorBreakdownEntries]);

  const generateKey = (name: string) => name.replace(/\s+/g, '_').toLowerCase();

  const editPlacementList = useMemo(() => {
    if (!editPrints) return [];
    const entries = Object.entries(editPrints.placementLabels);
    if (entries.length > 0) {
      return entries.map(([key, label]) => ({ key, label }));
    }
    return DEFAULT_PRINT_PLACEMENTS.map(placement => ({ ...placement }));
  }, [editPrints]);

  const editColorRows = useMemo(() => {
    const colorSet = new Set<string>();
    editItems.forEach(item => {
      if (item.color_name) {
        colorSet.add(item.color_name);
      }
    });
    if (editPrints) {
      Object.keys(editPrints.colorBreakdown).forEach(color => {
        if (color) colorSet.add(color);
      });
    }
    return Array.from(colorSet);
  }, [editItems, editPrints]);

  useEffect(() => {
    if (!editPrints) return;
    if (editPlacementList.length === 0) {
      if (editPrintBulkPlacementKey !== '') {
        setEditPrintBulkPlacementKey('');
      }
      return;
    }
    const hasCurrent = editPlacementList.some(placement => placement.key === editPrintBulkPlacementKey);
    if (!hasCurrent) {
      setEditPrintBulkPlacementKey(editPlacementList[0].key);
    }
  }, [editPlacementList, editPrintBulkPlacementKey, editPrints]);

  useEffect(() => {
    setEditPrintSelection(prev => {
      const next: Record<string, boolean> = {};
      editColorRows.forEach(color => {
        if (prev[color]) {
          next[color] = true;
        }
      });
      return next;
    });
  }, [editColorRows]);

  useEffect(() => {
    if (!editPrints) return;
    if (Object.keys(editPrints.placementLabels).length === 0) {
      setEditPrints(prev => {
        if (!prev || Object.keys(prev.placementLabels).length > 0) return prev;
        return { ...prev, placementLabels: buildDefaultPlacementLabels() };
      });
    }
  }, [editPrints]);

  const makePlacementKey = (label: string) =>
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `placement_${Date.now().toString(36)}`;

  const handleAddEditCategory = () => {
    const name = prompt('Enter new category name');
    if (!name) return;
    const key = generateKey(name);
    if (editConsumptionCategories.find(c => c.key === key)) {
      alert('Category already exists');
      return;
    }
    setEditConsumptionCategories(prev => [...prev, { key, label: name, usesMaterialName: false }]);
  };

  const handleEditBulkConsumptionChange = (categoryKey: string, value: number) => {
    setEditBulkConsumption(prev => ({ ...prev, [categoryKey]: value }));
  };

  const handleEditConsumptionCellChange = (rowIndex: number, categoryKey: string, value: number) => {
    setEditConsumptionValues(prev => ({ ...prev, [`${rowIndex}-${categoryKey}`]: value }));
  };

  const handleEditPlacementAdd = () => {
    if (!editPrints) return;
    const label = prompt('Enter placement name');
    if (!label || !label.trim()) return;
    const baseKey = makePlacementKey(label);
    let candidate = baseKey;
    let counter = 1;
    const existingKeys = new Set(editPlacementList.map(placement => placement.key));
    while (existingKeys.has(candidate)) {
      candidate = `${baseKey}_${counter}`;
      counter += 1;
    }
    setEditPrints(prev => prev ? {
      ...prev,
      placementLabels: { ...prev.placementLabels, [candidate]: label.trim() }
    } : prev);
  };

  const handleEditPlacementRemove = (placementKey: string) => {
    if (!editPrints) return;
    if (editPlacementList.length <= 1) return;
    setEditPrints(prev => {
      if (!prev) return prev;
      const nextLabels = { ...prev.placementLabels };
      delete nextLabels[placementKey];
      const nextBreakdown: Record<string, Record<string, string>> = {};
      Object.entries(prev.colorBreakdown).forEach(([color, placements]) => {
        const updated = { ...placements };
        delete updated[placementKey];
        nextBreakdown[color] = updated;
      });
      return {
        ...prev,
        placementLabels: nextLabels,
        colorBreakdown: nextBreakdown
      };
    });
  };

  const handleEditColorPrintChange = (color: string, placementKey: string, value: string) => {
    if (!editPrints) return;
    const trimmed = value.trim();
    setEditPrints(prev => {
      if (!prev) return prev;
      const nextBreakdown = { ...prev.colorBreakdown };
      const current = { ...(nextBreakdown[color] || {}) };
      if (!trimmed) {
        delete current[placementKey];
      } else {
        current[placementKey] = trimmed;
      }
      if (Object.keys(current).length === 0) {
        delete nextBreakdown[color];
      } else {
        nextBreakdown[color] = current;
      }
      return { ...prev, colorBreakdown: nextBreakdown };
    });
  };

  const handleEditToggleRow = (color: string, checked: boolean) => {
    setEditPrintSelection(prev => ({
      ...prev,
      [color]: checked
    }));
  };

  const handleEditToggleAllRows = (checked: boolean) => {
    if (!checked) {
      setEditPrintSelection({});
      return;
    }
    const next: Record<string, boolean> = {};
    editColorRows.forEach(color => {
      next[color] = true;
    });
    setEditPrintSelection(next);
  };

  const handleEditBulkApply = () => {
    if (!editPrints) return;
    if (!editPrintBulkPlacementKey || !editPrintBulkValue.trim()) return;
    const selectedColors = Object.entries(editPrintSelection)
      .filter(([, selected]) => selected)
      .map(([color]) => color);
    const targets = selectedColors.length > 0 ? selectedColors : editColorRows;
    if (targets.length === 0) return;
    const trimmed = editPrintBulkValue.trim();
    setEditPrints(prev => {
      if (!prev) return prev;
      const nextBreakdown = { ...prev.colorBreakdown };
      targets.forEach(color => {
        if (!color) return;
        const current = { ...(nextBreakdown[color] || {}) };
        current[editPrintBulkPlacementKey] = trimmed;
        nextBreakdown[color] = current;
      });
      return { ...prev, colorBreakdown: nextBreakdown };
    });
    setEditPrintBulkValue('');
  };

  const editSelectedRowCount = Object.values(editPrintSelection).filter(Boolean).length;
  const allEditRowsSelected = editColorRows.length > 0 && editColorRows.every(color => editPrintSelection[color]);

  // Helper to generate a unique key for each material/color/category cell
  const getConsumptionCellKey = (materialName: string, color: string, categoryKey: string) => `${materialName}||${color}||${categoryKey}`;

  const prepareEditMaterials = () => {
    const materialsMap: Record<string, any> = {};
    // Calculate total quantity for each color (sum across all items with that color)
    const colorTotalMap: Record<string, number> = {};
    editItems.forEach(item => {
      if (!item.color_name) return;
      colorTotalMap[item.color_name] = (colorTotalMap[item.color_name] || 0) + (item.quantity || 0);
    });
    const uniqueColors = Object.keys(colorTotalMap);
    uniqueColors.forEach(color => {
      const totalQty = colorTotalMap[color] || 0;
      if (!color || totalQty === 0) return;
      editConsumptionCategories.forEach(cat => {
        const matName = cat.usesMaterialName ? editMaterialName || cat.label : cat.label;
        const cellKey = getConsumptionCellKey(matName, color, cat.key);
        // Always use the input value for per-unit consumption
        const perUnitConsumption = editConsumptionValues[cellKey] ?? editBulkConsumption[cat.key] ?? 0;
        if (perUnitConsumption && perUnitConsumption > 0) {
          const quantity = perUnitConsumption * totalQty;
          materialsMap[cellKey] = { material_name: matName, color_name: color, quantity, consumption: perUnitConsumption };
        }
      });
    });
    return Object.values(materialsMap);
  };

  // Helper: generate printable HTML for single job order
  const generatePrintHTML = () => {
    if (!viewJobOrder) return '';
    console.log('Job Order for printing:', viewJobOrder);
    console.log('Client name:', viewJobOrder.client_name);
    const sortedItems = sortSizes(viewJobOrder.items || []);
    const colors: string[] = Array.from(new Set(sortedItems.map((it: any) => it.color_name))).sort((a, b) =>
      (a || '').localeCompare(b || '')
    );
    const sizes: string[] = Array.from(new Set(sortedItems.map((it: any) => it.size_value)));

    // Build header row with sizes
    const sizeHeader = sizes.map((sz: string) => `<th style="border:1px solid #000;padding:4px;min-width:18mm;text-align:center;">${sz}</th>`).join('');
    // Build rows
    const rows = colors.map((color: string) => {
      const colorItems = sortedItems.filter((it: any) => it.color_name === color);
      const cells = sizes.map((sz: string) => {
        const item = colorItems.find((it: any) => it.size_value === sz);
        return `<td style="border:1px solid #000;padding:4px;text-align:center;">${item ? item.quantity : ''}</td>`;
      }).join('');
      const totalColor = viewJobOrder.items.filter((it: any) => it.color_name === color).reduce((sum: number, it: any) => sum + it.quantity, 0);
      return `<tr><td style="border:1px solid #000;padding:4px;min-width:22mm;">${color}</td>${cells}<td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;">${totalColor}</td></tr>`;
    }).join('');

    const totalJobOrder = viewJobOrder.items.reduce((sum: number, it: any) => sum + it.quantity, 0);

    // Materials section
    const matsHTML = materials.map((m: any) => `<tr><td style="border:1px solid #000;padding:4px;">${m.material_name}</td><td style="border:1px solid #000;padding:4px;">${m.color_name || '-'}</td><td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;">${m.quantity}</td></tr>`).join('');

    // Printing sections
    let printConfigHTML = '';
    const currentPrintConfig = normalizePrintConfig(viewJobOrder.prints);
    if (currentPrintConfig) {
      const fieldEntries = Object.entries(currentPrintConfig.fields);
      const colorBreakdownEntries = Object.entries(currentPrintConfig.colorBreakdown || {});
      const placementEntries = Object.entries(currentPrintConfig.placementLabels || {});
      const derivedPlacementEntries = placementEntries.length > 0 ? placementEntries : Array.from(
        new Set(
          colorBreakdownEntries.flatMap(([, placements]) =>
            Object.keys(placements || {})
          )
        )
      ).map(key => [
        key,
        key
          .split('_')
          .filter(Boolean)
          .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
          .join(' ') || key
      ]);

      const generalDetailsHTML = fieldEntries.length > 0
        ? `
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr><th style="border:1px solid #000;padding:4px;">${t('common.key')}</th><th style="border:1px solid #000;padding:4px;">${t('common.value')}</th></tr></thead>
          <tbody>${fieldEntries.map(([key, value]) => `<tr><td style="border:1px solid #000;padding:4px;">${key}</td><td style="border:1px solid #000;padding:4px;">${value}</td></tr>`).join('')}</tbody>
        </table>`
        : '';

      const colorTableHTML = colorBreakdownEntries.length > 0 && derivedPlacementEntries.length > 0
        ? `
        <table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:4px;">
          <thead>
            <tr>
              <th style="border:1px solid #000;padding:4px;">${t('barcode.color')}</th>
              ${derivedPlacementEntries.map(([, label]) => `<th style="border:1px solid #000;padding:4px;">${label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${colorBreakdownEntries.map(([color, placements]) => `
              <tr>
                <td style="border:1px solid #000;padding:4px;font-weight:600;">${color}</td>
                ${derivedPlacementEntries.map(([key]) => `<td style="border:1px solid #000;padding:4px;">${placements[key] || '-'}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>`
        : '';

      if (generalDetailsHTML || colorTableHTML) {
        printConfigHTML = `
        <h4 style="margin:6px 0 2px 0;">${t('jobOrderDetails.printingDetails')} (${currentPrintConfig.type})</h4>
        ${generalDetailsHTML}
        ${colorTableHTML}`;
      }
    }

    return `
      <div class="print-job-order" style="width:100%;border:1px solid #000;margin-bottom:2mm;padding:3mm;box-sizing:border-box;">
        <p style="margin:0 0 2px 0;font-weight:bold;">${t('jobOrders.clientName')}: ${viewJobOrder.client_name || '-'}</p>
        <p style="margin:0 0 2px 0;">${t('jobOrders.modelName')}: ${viewJobOrder.model_name || '-'}</p>
        <p style="margin:0 0 4px 0;font-size:10pt;">${t('jobOrders.jobOrderNumber')}: ${viewJobOrder.job_order_number}</p>
        ${viewJobOrder.date_created ? `<p style="margin:0 0 4px 0;font-size:10pt;">${t('jobOrderDetails.dateCreated')}: ${format(new Date(viewJobOrder.date_created), 'yyyy-MM-dd HH:mm')}</p>` : ''}

        <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:2px;font-size:9pt;">
          <thead>
            <tr>
              <th style="border:1px solid #000;padding:4px;">${t('barcode.color')}</th>
              ${sizeHeader}
              <th style="border:1px solid #000;padding:4px;">${t('common.total')}</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
            <tr>
              <td style="border:1px solid #000;padding:4px;font-weight:bold;">${t('common.total')}</td>
              <td colspan="${sizes.length}" style="border:2px solid #000;padding:4px;text-align:center;font-weight:bold;">${totalJobOrder}</td>
            </tr>
          </tbody>
        </table>

        ${materials.length > 0 ? `
        <h4 style="margin:6px 0 2px 0;">${t('jobOrderDetails.requiredMaterials')}</h4>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr><th style="border:1px solid #000;padding:4px;">${t('jobOrderDetails.material')}</th><th style="border:1px solid #000;padding:4px;">${t('barcode.color')}</th><th style="border:1px solid #000;padding:4px;">${t('barcode.quantity')}</th></tr></thead>
          <tbody>${matsHTML}</tbody>
        </table>` : ''}

        ${printConfigHTML}

        <div style="display:flex;align-items:flex-start;gap:4mm;margin-top:3px;">
          ${viewJobOrder.image_url ? `<img src="${getPublicImageUrl(viewJobOrder.image_url)}" alt="img" style="width:55mm;height:45mm;object-fit:fill;border:1px solid #000;"/>` : ''}
          ${viewJobOrder.notes ? `
          <div style="border:1px solid #000;padding:3px;font-size:9pt;flex:1;">
            <p style="margin:0;"><strong>${t('jobOrderDetails.notes')}</strong> ${viewJobOrder.notes}</p>
          </div>` : ''}
        </div>
      </div>`;
  };

  const handlePrint = () => {
    if (!viewJobOrder) return;
    const printWindow = window.open('', '_blank') as Window;
    if (!printWindow) return;
    const dirAttr = document.documentElement.getAttribute('dir') || 'ltr';
    printWindow.document.write(`<html><head><title>${t('common.print')}</title><style>
      @page { size: A4 portrait; margin: 5mm; }
      body { font-family: Arial, sans-serif; direction: ${dirAttr}; margin:0; }
      .print-job-order { page-break-inside: avoid; break-inside: avoid; min-height: 75mm; }
      table { border-collapse: collapse; width:100%; }
      th, td { border:1px solid #000; padding:4px; }
    </style></head><body>`);
    for (let i = 0; i < printCopies; i++) {
      printWindow.document.write(generatePrintHTML());
    }
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    // Give the new window time to load images
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  useEffect(() => {
    const fetchData = async () => {
      setViewLoading(true);
      try {
        const jobOrder = await jobOrderApi.getById(Number(jobOrderId));
        setViewJobOrder(jobOrder);
        
        // Get item-level production tracking data
        const itemSummaries = await jobOrderApi.getItemSummaries({
          job_order_id: Number(jobOrderId)
        });
        setViewTrackingData(itemSummaries.items || []);
        
        const mats = await jobOrderApi.getMaterials(Number(jobOrderId));
        setMaterials(mats);
        
        const compsData = await jobOrderApi.getCompensations(Number(jobOrderId));
        setCompensations(Array.isArray(compsData?.compensations) ? compsData.compensations : []);
        setCompensationPhaseSummary(Array.isArray(compsData?.phase_summary) ? compsData.phase_summary : []);

        const qcData = await jobOrderApi.getQcSummary(Number(jobOrderId));
        setQcSummary({
          total_rejected_pieces: Number(qcData?.total_rejected_pieces || 0),
          today_rejected_pieces: Number((qcData as any)?.today_rejected_pieces || 0),
          phases: Array.isArray(qcData?.phases)
            ? qcData.phases.map((phase) => ({
                ...phase,
                active_rework_problem_stages: Array.isArray(phase.active_rework_problem_stages) ? phase.active_rework_problem_stages : [],
                rejection_reason_counts: Array.isArray(phase.rejection_reason_counts) ? phase.rejection_reason_counts : [],
                rejection_reason_totals: Array.isArray((phase as any).rejection_reason_totals) ? (phase as any).rejection_reason_totals : [],
              }))
            : [],
          today_phases: Array.isArray((qcData as any)?.today_phases)
            ? (qcData as any).today_phases.map((phase: any) => ({
                ...phase,
                active_rework_problem_stages: Array.isArray(phase.active_rework_problem_stages) ? phase.active_rework_problem_stages : [],
                rejection_reason_counts: Array.isArray(phase.rejection_reason_counts) ? phase.rejection_reason_counts : [],
                rejection_reason_totals: Array.isArray(phase.rejection_reason_totals) ? phase.rejection_reason_totals : [],
              }))
            : [],
        });
        setExpandedQcPhaseIds({});
        setExpandedRejectionStages({});
        setExpandedRejectionWorkers({});
        
        // --- Populate edit dialog state for materials/consumption ---
        if (editDialogOpen) {
          // Map materials to the expected format
          const mappedMats = mats.map(mat => ({
            material_name: mat.material_name,
            color_name: mat.color_name || '',
            quantity: mat.quantity,
            notes: mat.notes
          }));
          setEditMaterials(mappedMats);
          if (mats.length > 0) {
            setEditMaterialName(mats[0].material_name);
            // For each material/color/category, set the consumption value
            const newConsumptionValues: Record<string, number> = {};
            mats.forEach(mat => {
              // Default to 'body' if no category info
              const categoryKey = 'body';
              const cellKey = getConsumptionCellKey(mat.material_name, mat.color_name || '', categoryKey);
              // Note: consumption field doesn't exist in the API response, so we'll skip this logic
              // The consumption values will be calculated from the quantity and item quantities
            });
            setEditConsumptionValues(newConsumptionValues);
          }
        }
      } catch (error) {
        console.error('Error fetching job order data:', error);
        setViewJobOrder(null);
        setViewTrackingData([]);
        setMaterials([]);
        setCompensations([]);
        setCompensationPhaseSummary([]);
        setQcSummary({
          total_rejected_pieces: 0,
          today_rejected_pieces: 0,
          phases: [],
          today_phases: [],
        });
        setExpandedQcPhaseIds({});
        toast({
          title: t('common.error'),
          description: 'Failed to load job order details',
          variant: 'destructive'
        });
      } finally {
        setViewLoading(false);
      }
    };
    if (jobOrderId) {
      fetchData();
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    }
  }, [jobOrderId, editDialogOpen, t, toast, isInitialLoad]);

  // Edit logic
  const handleEditJobOrder = async () => {
    if (!viewJobOrder) return;
    try {
      setEditLoading(true);
      // Fetch the full job order details
      const fullJobOrder = await jobOrderApi.getById(viewJobOrder.job_order_id);
      setEditingJobOrder(fullJobOrder);
      // Initialize edit items with current quantities
      const items = fullJobOrder.items.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
        color_name: item.color_name || '',
        size_value: item.size_value || ''
      }));
      setEditItems(items);
      // Load notes for editing
      setEditNotes(fullJobOrder.notes || '');
      // Fetch and initialize materials
      const materials = await jobOrderApi.getMaterials(fullJobOrder.job_order_id);
      // Map materials to the expected format
      const mappedMats = materials.map(mat => ({
        material_name: mat.material_name,
        color_name: mat.color_name || '',
        quantity: mat.quantity,
        notes: mat.notes
      }));
      setEditMaterials(mappedMats);
      setEditMaterialName(materials.length > 0 ? materials[0].material_name : '');
      
      // Initialize consumption values from existing materials
      const newConsumptionValues: Record<string, number> = {};
      const newBulkConsumption: Record<string, number> = {};
      
      if (materials.length > 0) {
        // Group materials by color to calculate consumption per unit
        const colorGroups: Record<string, { material_name: string; quantity: number; consumption: number }[]> = {};
        
        materials.forEach(mat => {
          if (mat.color_name && mat.consumption !== null && mat.consumption !== undefined) {
            if (!colorGroups[mat.color_name]) {
              colorGroups[mat.color_name] = [];
            }
            colorGroups[mat.color_name].push({
              material_name: mat.material_name,
              quantity: mat.quantity,
              consumption: mat.consumption
            });
          }
        });
        
        // Use per-unit consumption directly from backend
        Object.entries(colorGroups).forEach(([colorName, colorMats]) => {
          colorMats.forEach(colorMat => {
            if (colorMat.consumption !== undefined && colorMat.consumption !== null) {
              const cellKey = getConsumptionCellKey(colorMat.material_name, colorName, 'body');
              newConsumptionValues[cellKey] = colorMat.consumption;
              newBulkConsumption['body'] = colorMat.consumption;
            }
          });
        });
      }
      
      setEditConsumptionValues(newConsumptionValues);
      setEditBulkConsumption(newBulkConsumption);
      
      // Initialize print config
      const normalizedPrints = normalizePrintConfig(fullJobOrder.prints);
      setEditPrints(normalizedPrints);
      
      setEditDialogOpen(true);
    } catch (error) {
      console.error('Error fetching job order details:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to load job order details for editing',
        variant: 'destructive'
      });
    } finally {
      setEditLoading(false);
    }
  };
  const handleQuantityChange = (itemId: number, newQuantity: number) => {
    setEditItems(prev =>
      prev.map(item =>
        item.item_id === itemId
          ? { ...item, quantity: Math.max(0, newQuantity) }
          : item
      )
    );
  };
  const handleSaveEdit = async () => {
    if (!editingJobOrder) return;
    // Check if item quantities changed
    const originalItems = editingJobOrder.items.map((it: any) => ({ item_id: it.item_id, quantity: it.quantity }));
    const quantitiesChanged = editItems.some(ei => {
      const orig = originalItems.find(oi => oi.item_id === ei.item_id);
      return orig && orig.quantity !== ei.quantity;
    });
    // Check if consumption entries provided
    const hasBulk = Object.values(editBulkConsumption).some(v => v > 0);
    const hasCells = Object.values(editConsumptionValues).some(v => v > 0);
    const consumptionProvided = hasBulk || hasCells;
    if (quantitiesChanged && !consumptionProvided) {
      alert('Please update the consumption table when changing item quantities.');
      return;
    }
    try {
      setEditLoading(true);

      // Prepare the update data
      const updateData: any = {
        items: editItems.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity
        })),
        notes: editNotes,
      };
      // Include print config if provided or if it was removed
      const originalPrints = normalizePrintConfig(editingJobOrder.prints);
      const currentPrintPayload = serializePrintConfig(editPrints);
      const originalPrintPayload = serializePrintConfig(originalPrints);
      if (JSON.stringify(currentPrintPayload) !== JSON.stringify(originalPrintPayload)) {
        updateData.print_config = currentPrintPayload;
      }
      // Include materials only if provided
      if (consumptionProvided) {
        updateData.materials = prepareEditMaterials();
      }

      // Call the API to update the job order
      await jobOrderApi.update(editingJobOrder.job_order_id, updateData);
      
      // Close dialog and refresh data
      setEditDialogOpen(false);
      setEditingJobOrder(null);
      setEditItems([]);
      
      // Refresh the item summaries to recalculate tracking data
      await jobOrderApi.refreshItemSummaries(Number(jobOrderId));
      
      // Add a small delay to ensure backend has processed the refresh
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Refetch job order data
      const jobOrder = await jobOrderApi.getById(Number(jobOrderId));
      setViewJobOrder(jobOrder);
      
      // Get item-level production tracking data
      const itemSummaries = await jobOrderApi.getItemSummaries({
        job_order_id: Number(jobOrderId)
      });
      setViewTrackingData(itemSummaries.items || []);
      
      const mats = await jobOrderApi.getMaterials(Number(jobOrderId));
      setMaterials(mats);
      
      const compsData = await jobOrderApi.getCompensations(Number(jobOrderId));
      setCompensations(Array.isArray(compsData?.compensations) ? compsData.compensations : []);
      setCompensationPhaseSummary(Array.isArray(compsData?.phase_summary) ? compsData.phase_summary : []);
      
      toast({
        title: t('common.success'),
        description: 'Job order updated successfully',
      });
    } catch (error) {
      console.error('Error updating job order:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to update job order',
        variant: 'destructive'
      });
    } finally {
      setEditLoading(false);
    }
  };
  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditItems([]);
    setEditNotes('');
    setEditMaterials([]);
    setEditPrints(null);
  };
  const handleAddMaterial = () => {
    setEditMaterials([...editMaterials, { material_name: '', color_name: '', quantity: 0 }]);
  };
  const handleRemoveMaterial = (index: number) => {
    setEditMaterials(editMaterials.filter((_, i) => i !== index));
  };
  const handleUpdateMaterial = (index: number, field: string, value: string | number) => {
    setEditMaterials(editMaterials.map((material, i) => 
      i === index ? { ...material, [field]: value } : material
    ));
  };
  // Removed: handleToggleClosed, handleConfirmToggleClosed, handleCancelToggleClosed

  // In the edit dialog, before rendering the material consumption table, process editMaterials to group by color and sum quantities.
  const getUniqueColorMaterials = () => {
    const colorMap: Record<string, { material_name: string; color_name: string; quantity: number }> = {};
    editMaterials.forEach((mat) => {
      if (!mat.color_name) return;
      if (!colorMap[mat.color_name]) {
        colorMap[mat.color_name] = { ...mat };
      } else {
        colorMap[mat.color_name].quantity += mat.quantity;
      }
    });
    return Object.values(colorMap);
  };

  // Helper to group materials by color and sum quantities
  const getColorSums = () => {
    const colorMap: Record<string, { material_name: string; color_name: string; quantity: number; indices: number[] }> = {};
    editMaterials.forEach((mat, idx) => {
      if (!mat.color_name) return;
      if (!colorMap[mat.color_name]) {
        colorMap[mat.color_name] = { ...mat, indices: [idx] };
      } else {
        colorMap[mat.color_name].quantity += mat.quantity;
        colorMap[mat.color_name].indices.push(idx);
      }
    });
    return Object.values(colorMap);
  };

  // Handler to update all entries for a color when edited
  const handleUpdateColorSum = (color_name: string, newQuantity: number) => {
    const colorEntries = editMaterials
      .map((mat, idx) => ({ ...mat, idx }))
      .filter(mat => mat.color_name === color_name);
    if (colorEntries.length === 0) return;
    // Distribute the new quantity equally among all entries for this color
    const perEntry = newQuantity / colorEntries.length;
    setEditMaterials(editMaterials.map((mat, idx) =>
      mat.color_name === color_name ? { ...mat, quantity: perEntry } : mat
    ));
  };

  // Helper to get unique colors from editItems
  const getUniqueColors = () => {
    const colorSet = new Set<string>();
    editItems.forEach(item => {
      if (item.color_name) colorSet.add(item.color_name);
    });
    return Array.from(colorSet);
  };

  // For the consumption table, use unique colors as rows
  const uniqueColors = getUniqueColors();

  // When editing a cell, update all items of that color
  const handleEditConsumptionCellChangeUnique = (colorName: string, categoryKey: string, value: number) => {
    const cellKey = getConsumptionCellKey(editMaterialName || 'body', colorName, categoryKey);
    setEditConsumptionValues(prev => ({ ...prev, [cellKey]: value }));
  };

  // Archive handlers
  const handleArchiveJobOrder = async () => {
    if (!jobOrderId) return;

    const confirmMessage = 'Are you sure you want to archive this job order? This will also archive all associated items and batches. This action cannot be undone.';
    
    if (window.confirm(confirmMessage)) {
      try {
        setArchiving(true);
        await jobOrderApi.archive(parseInt(jobOrderId));
        
        toast({
          title: t('common.success'),
          description: 'Job order archived successfully',
        });
        
        // Navigate back to job orders page
        navigate('/job-orders');
      } catch (error: any) {
        console.error('Error archiving job order:', error);
        toast({
          title: t('common.error'),
          description: error?.response?.data?.detail || 'Failed to archive job order',
          variant: 'destructive'
        });
      } finally {
        setArchiving(false);
      }
    }
  };

  const handleArchiveItem = async (itemId: number) => {
    const confirmMessage = 'Are you sure you want to archive this item? This action cannot be undone.';
    
    if (window.confirm(confirmMessage)) {
      try {
        setArchivingItem(itemId);
        await jobOrderApi.archiveItem(itemId);
        
        toast({
          title: t('common.success'),
          description: 'Item archived successfully',
        });
        
        // Refresh the data
        const jobOrder = await jobOrderApi.getById(Number(jobOrderId));
        setViewJobOrder(jobOrder);
        
        const itemSummaries = await jobOrderApi.getItemSummaries({
          job_order_id: Number(jobOrderId)
        });
        setViewTrackingData(itemSummaries.items || []);
      } catch (error: any) {
        console.error('Error archiving item:', error);
        toast({
          title: t('common.error'),
          description: error?.response?.data?.detail || 'Failed to archive item',
          variant: 'destructive'
        });
      } finally {
        setArchivingItem(null);
      }
    }
  };


  // Helper to group items by color
  const groupItemsByColor = (items: any[]) => {
    const grouped: Record<string, any[]> = {};
    items.forEach(item => {
      const color = item.color_name || 'Unknown';
      if (!grouped[color]) {
        grouped[color] = [];
      }
      grouped[color].push(item);
    });
    return grouped;
  };

  // Helper to detect issues for a specific item
  const detectIssues = (item: any) => {
    const issues = [];
    
    // Case 1: Overproduction
    if (item.produced_quantity > item.expected_quantity) {
      issues.push({
        type: 'overproduction',
        message: `Overproduction: ${item.produced_quantity} produced vs ${item.expected_quantity} expected`,
        severity: 'high'
      });
    }
    
    // Case 2: High second degree quantity (>3% of working qty)
    if (item.second_degree_quantity > 0 && item.produced_quantity > 0) {
      const secondDegreePercentage = (item.second_degree_quantity / item.produced_quantity) * 100;
      if (secondDegreePercentage > 3) {
        issues.push({
          type: 'high_second_degree',
          message: `High second degree: ${secondDegreePercentage.toFixed(1)}% (${item.second_degree_quantity} of ${item.produced_quantity})`,
          severity: 'medium'
        });
      }
    }
    
    // Case 3: Notes present (flagged as issue)
    if (item.notes && item.notes.trim()) {
      issues.push({
        type: 'notes',
        message: item.notes,
        severity: 'info'
      });
    }
    
    // Case 4: Lost quantity (working quantity != cut quantity)
    if (item.cut_quantity > item.produced_quantity) {
      const lostQuantity = item.cut_quantity - item.produced_quantity;
      issues.push({
        type: 'lost_quantity',
        message: `Lost quantity: ${lostQuantity} (${item.cut_quantity} cut vs ${item.produced_quantity} working)`,
        severity: 'high'
      });
    }
    
    return issues;
  };

  const getIssueGroupLabel = (type: string) => {
    if (type === 'overproduction') return t('jobOrderDetails.overproductionIssues');
    if (type === 'high_second_degree') return t('jobOrderDetails.highSecondDegreeIssues');
    if (type === 'notes') return t('jobOrderDetails.productionIssues');
    if (type === 'lost_quantity') return t('jobOrderDetails.lostQuantityIssues');
    return `${type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Issues`;
  };

  const toggleQcPhaseExpanded = (phaseId: number) => {
    setExpandedQcPhaseIds(prev => ({
      ...prev,
      [phaseId]: !prev[phaseId],
    }));
  };

  const toggleCompensationDateExpanded = (date: string) => {
    setExpandedCompensationDates(prev => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const toggleRejectionStageExpanded = (key: string) => {
    setExpandedRejectionStages(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleRejectionWorkerExpanded = (key: string) => {
    setExpandedRejectionWorkers(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <Layout>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50 px-4 py-4 shadow-sm">
        <div>
          <h1 className="text-xl md:text-3xl font-bold mb-1 text-slate-900 tracking-tight">
            {viewJobOrder
              ? t('jobOrderDetails.productionDetailsWithNumber', { jobOrderNumber: viewJobOrder.job_order_number })
              : t('jobOrders.title')}
          </h1>
          <p className="text-slate-600 text-sm md:text-base">{t('jobOrderDetails.subtitle')}</p>
          {/* Date Created Display */}
          {viewJobOrder?.date_created && (
            <p className="text-slate-500 text-xs md:text-sm mt-1">
              {t('jobOrderDetails.dateCreated')}: {format(new Date(viewJobOrder.date_created), 'yyyy-MM-dd HH:mm')}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 justify-center md:justify-end">
          <Button 
            variant="outline" 
            onClick={() => navigate(-1)}
            className="text-sm px-3 py-2 md:px-4 md:py-2"
          >
            {t('common.back')}
          </Button>
          {viewJobOrder && (
            <>
              <Button
                variant="outline"
                onClick={handleEditJobOrder}
                className="flex items-center gap-1 text-sm px-3 py-2 md:px-4 md:py-2"
                disabled={editLoading}
              >
                <Edit className="w-4 h-4" /> 
                <span className="hidden sm:inline">{t('common.edit')}</span>
                <span className="sm:hidden">{t('common.edit')}</span>
              </Button>
              
              {/* Archive Button - Only for Admin users */}
              {user?.role === 'admin' && (
                <Button
                  variant="outline"
                  onClick={handleArchiveJobOrder}
                  disabled={archiving}
                  className="flex items-center gap-1 text-sm px-3 py-2 md:px-4 md:py-2 border-orange-300 text-orange-700 hover:bg-orange-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                  <span className="hidden sm:inline">
                    {archiving ? t('common.archiving') : t('common.archive')}
                  </span>
                  <span className="sm:hidden">
                    {archiving ? '...' : t('common.archive')}
                  </span>
                </Button>
              )}
            </>
          )}
          {/* Print Controls */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={printCopies}
              onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 md:w-16 border rounded px-1 text-center text-sm"
              title={t('common.copies')}
            />
            <Button 
              variant="outline" 
              onClick={handlePrint}
              className="text-sm px-3 py-2 md:px-4 md:py-2"
            >
              {t('common.print')}
            </Button>
          </div>
        </div>
      </div>
      {/* Brand and Model Information */}
      {viewJobOrder && (
        <div className="mb-6 p-5 rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm uppercase tracking-wide font-semibold text-blue-700 mb-1">{t('jobOrders.clientName')}</h3>
              <p className="text-blue-950 text-lg font-semibold">{viewJobOrder.client_name || '-'}</p>
            </div>
            <div>
              <h3 className="text-sm uppercase tracking-wide font-semibold text-blue-700 mb-1">{t('jobOrders.modelName')}</h3>
              <p className="text-blue-950 text-lg font-semibold">{viewJobOrder.model_name || '-'}</p>
            </div>
          </div>
        </div>
      )}
  {viewJobOrder?.image_url && topImageVisible && (
        <div className="mb-6 flex justify-center">
          <img
            src={getPublicImageUrl(viewJobOrder.image_url)}
            alt=""
            onError={() => setTopImageVisible(false)}
            className="max-h-64 rounded-2xl shadow-md border border-slate-200 object-contain bg-white"
            style={{ maxWidth: '100%' }}
          />
        </div>
      )}
      {viewLoading ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 border-4 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-gray-600">{t('jobOrderDetails.loadingProductionTracking')}</p>
        </div>
      ) : viewJobOrder ? (
        <>
          {viewJobOrder.notes && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 shadow-sm">
              <strong>{t('jobOrderDetails.notes')}:</strong> {viewJobOrder.notes}
            </div>
          )}
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-5 flex w-full rounded-2xl bg-white/95 p-1.5 shadow-sm border border-slate-200 backdrop-blur">
            <TabsTrigger
              value="overview"
              className="flex-1 px-4 py-2.5 text-sm md:text-base font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-100 data-[state=inactive]:hover:text-slate-900"
            >
              {t('jobOrderDetails.overview')}
            </TabsTrigger>
            <TabsTrigger
              value="phases"
              className="flex-1 px-4 py-2.5 text-sm md:text-base font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-100 data-[state=inactive]:hover:text-slate-900"
            >
              {t('jobOrderDetails.phaseDetails')}
            </TabsTrigger>
            <TabsTrigger
              value="batch_compensation"
              className="flex-1 px-4 py-2.5 text-sm md:text-base font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-100 data-[state=inactive]:hover:text-slate-900"
            >
              {t('batchGeneration.tabCompensation')}
            </TabsTrigger>
            <TabsTrigger
              value="qc"
              className="flex-1 px-4 py-2.5 text-sm md:text-base font-medium rounded-xl transition-all duration-200 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=inactive]:text-slate-600 data-[state=inactive]:hover:bg-slate-100 data-[state=inactive]:hover:text-slate-900"
            >
              QC
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview">
            <div>
              {/* Summary Section */}
              {viewTrackingData.length > 0 && (
                <div className="mb-6 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
              {(() => {
                const colorGroups = groupItemsByColor(viewTrackingData);
                const perColorLossSummary = Object.entries(colorGroups).map(([color, items]) => {
                  const workingTotal = items.reduce((sum, item) => sum + (item.working_quantity || 0), 0);
                  const secondDegreeTotal = items.reduce((sum, item) => sum + (item.second_degree_quantity || 0), 0);
                  const cutTotal = items.reduce((sum, item) => sum + (item.cut_quantity || 0), 0);
                  const lostQtyTotal = Math.max(0, cutTotal - workingTotal);
                  const secondDegreePct = workingTotal > 0 ? (secondDegreeTotal / workingTotal) * 100 : 0;
                  const lostQtyPct = workingTotal > 0 ? (lostQtyTotal / workingTotal) * 100 : 0;

                  return {
                    color,
                    secondDegreePct,
                    lostQtyPct,
                    totalLossPct: secondDegreePct + lostQtyPct
                  };
                });

                return (
                  <>
              <h3 className="text-lg font-semibold mb-4 text-slate-900">{t('jobOrderDetails.productionSummary')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-8 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.expected')}</div>
                  <div className="text-xl font-bold text-gray-800">
                    {viewTrackingData.reduce((sum, item) => sum + item.expected_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.cutQuantity')}</div>
                  <div className="text-xl font-bold text-purple-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.cut_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.secondDegree')}</div>
                  <div className="text-xl font-bold text-orange-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.second_degree_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.completed')}</div>
                  <div className="text-xl font-bold text-green-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.completed_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.remaining')}</div>
                  <div className="text-xl font-bold text-blue-700">
                    {viewTrackingData.reduce((sum, item) => sum + item.remaining_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">{t('jobOrderDetails.workingQty')}</div>
                  <div className="text-xl font-bold text-blue-700">
                    {viewTrackingData.reduce((sum, item) => sum + item.working_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">Consumption (KG)</div>
                  <div className="text-xl font-bold text-purple-700">
                    {(() => {
                      const { sum, count } = viewTrackingData.reduce(
                        (acc, item) => {
                          if (item.true_consumption !== null && item.true_consumption !== undefined) {
                            acc.sum += item.true_consumption;
                            acc.count += 1;
                          }
                          return acc;
                        },
                        { sum: 0, count: 0 }
                      );
                      const avg = count > 0 ? sum / count : null;
                      return avg !== null ? avg.toFixed(4) : '—';
                    })()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-slate-500">Consumption (M)</div>
                  <div className="text-xl font-bold text-indigo-700">
                    {(() => {
                      const { sum, count } = viewTrackingData.reduce(
                        (acc, item) => {
                          if (item.true_consumption_m !== null && item.true_consumption_m !== undefined) {
                            acc.sum += item.true_consumption_m;
                            acc.count += 1;
                          }
                          return acc;
                        },
                        { sum: 0, count: 0 }
                      );
                      const avg = count > 0 ? sum / count : null;
                      return avg !== null ? avg.toFixed(4) : '—';
                    })()}
                  </div>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <div className="font-semibold text-amber-800 mb-2">Second Degree % (Per Color)</div>
                  <div className="space-y-1">
                    {perColorLossSummary.map(({ color, secondDegreePct }) => (
                      <div key={`second-${color}`} className="flex items-center justify-between text-amber-900">
                        <span className="truncate pr-3">{color}</span>
                        <span className="font-semibold">{secondDegreePct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="font-semibold text-rose-800 mb-2">Lost Qty % (Per Color)</div>
                  <div className="space-y-1">
                    {perColorLossSummary.map(({ color, lostQtyPct }) => (
                      <div key={`lost-${color}`} className="flex items-center justify-between text-rose-900">
                        <span className="truncate pr-3">{color}</span>
                        <span className="font-semibold">{lostQtyPct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                  <div className="font-semibold text-red-800 mb-2">Total Loss % (Per Color)</div>
                  <div className="space-y-1">
                    {perColorLossSummary.map(({ color, totalLossPct }) => (
                      <div key={`total-${color}`} className="flex items-center justify-between text-red-900">
                        <span className="truncate pr-3">{color}</span>
                        <span className="font-semibold">{totalLossPct.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
                  </>
                );
              })()}
                </div>
              )}

              {/* Unified Problem Notifications */}
              {(() => {
                const allIssues = viewTrackingData.flatMap(item => {
                  const issues = detectIssues(item);
                  return issues.map(issue => ({
                    ...issue,
                    item: `${item.color_name} - ${item.size_value}`
                  }));
                });

                const hasIssues = allIssues.length > 0;
                const issuesByType = allIssues.reduce((acc, issue) => {
                  if (!acc[issue.type]) acc[issue.type] = [];
                  acc[issue.type].push(issue);
                  return acc;
                }, {} as Record<string, any[]>);

                return (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => setShowProblemNotifications(prev => !prev)}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold border shadow-sm transition-all ${
                        hasIssues
                          ? 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <span>Problem Notifications {hasIssues ? `(${allIssues.length})` : '(0)'}</span>
                      {showProblemNotifications ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {showProblemNotifications && (
                      <div className={`mt-2 p-3 rounded-xl border shadow-sm ${hasIssues ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                        {hasIssues ? (
                          <div className="space-y-2 text-sm">
                            {Object.entries(issuesByType).map(([type, issues]) => (
                              <div key={type}>
                                <div className="font-semibold mb-1">{getIssueGroupLabel(type)} ({(issues as any[]).length})</div>
                                {(issues as any[]).map((issue, idx) => (
                                  <div key={idx}>
                                    <span className="font-medium">{issue.item}:</span> {issue.message}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm">No issues found.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* Summary Table */}
              <div className="overflow-x-auto mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full overflow-hidden">
              <thead className="bg-slate-100 text-slate-800">
                <tr>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.color')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.size')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">Order</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.cutQuantity')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.workingQty')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.completed')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.remainingQuantity')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.secondDegree')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">Consumption (KG)</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">Consumption (M)</th>
                  {user?.role === 'admin' && (
                    <th className="px-4 py-2 border-b border-gray-200 font-semibold text-center">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const groupedItems = groupItemsByColor(viewTrackingData);
                  let rowIndex = 0;
                  
                  return Object.entries(groupedItems).map(([color, items]) => {
                    const sortedItems = sortSizes(items);
                    const colorRows = sortedItems.map((item, itemIdx) => {
                      const secondDegreeColor = item.second_degree_quantity > 0 ? 'text-orange-600 font-medium' : 'text-gray-500';
                      const completedColor = item.completed_quantity > 0 ? 'text-green-600 font-semibold' : 'text-gray-500';
                      const remainingColor = item.remaining_quantity > 0 ? 'text-blue-700 font-semibold' : 'text-gray-700';
                      
                      const issues = detectIssues(item);
                      const hasIssues = issues.length > 0;
                      
                      let rowBackgroundClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-200 hover:bg-gray-300';
                      if (hasIssues) {
                        rowBackgroundClass = 'bg-red-100 hover:bg-red-200 border-l-4 border-l-red-600 shadow-sm';
                      }
                      
                      rowIndex++;
                      
                      return (
                        <tr key={`${item.item_id}-${itemIdx}`} className={`${rowBackgroundClass} transition-colors`}>
                          <td className="px-4 py-2 border-b border-gray-200">
                            {itemIdx === 0 ? (
                              <div className="font-semibold text-gray-800">{color}</div>
                            ) : (
                              <div className="text-gray-500 text-sm">└─</div>
                            )}
                          </td>
                          <td className="px-4 py-2 border-b border-gray-200">{item.size_value}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium">{item.expected_quantity}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium text-purple-700">{item.cut_quantity || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium text-blue-600">{item.working_quantity || 0}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${completedColor}`}>{item.completed_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${remainingColor}`}>{item.remaining_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${secondDegreeColor}`}>{item.second_degree_quantity}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium text-purple-700">
                            {item.true_consumption !== null && item.true_consumption !== undefined
                              ? item.true_consumption.toFixed(4)
                              : '—'}
                          </td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium text-indigo-700">
                            {item.true_consumption_m !== null && item.true_consumption_m !== undefined
                              ? item.true_consumption_m.toFixed(4)
                              : '—'}
                          </td>
                          {user?.role === 'admin' && (
                            <td className="px-4 py-2 border-b border-gray-200 text-center">
                              <button
                                onClick={() => handleArchiveItem(item.item_id)}
                                disabled={archivingItem === item.item_id}
                                className="px-2 py-1 text-xs bg-orange-100 text-orange-700 border border-orange-300 rounded hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="Archive this item"
                              >
                                {archivingItem === item.item_id ? 'Archiving...' : 'Archive'}
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    });
                    
                    return colorRows;
                  }).flat();
                })()}
              </tbody>
            </table>
              </div>

                  {materials.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-2">{t('jobOrderDetails.requiredMaterials')}</h3>
              <table className="min-w-full border rounded-lg overflow-hidden text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 border-b text-left">{t('jobOrderDetails.material')}</th>
                    <th className="px-4 py-2 border-b text-left">{t('barcode.color')}</th>
                    <th className="px-4 py-2 border-b text-right">{t('barcode.quantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 border-b">{m.material_name}</td>
                      <td className="px-4 py-2 border-b">{m.color_name || '-'}</td>
                      <td className="px-4 py-2 border-b text-right">{m.quantity}</td>
                    </tr>
                  ))}
                  </tbody>
                </table>
                </div>
              )}

              {/* Printing Details */}
              {parsedViewPrints && (viewPrintEntries.length > 0 || viewColorBreakdownEntries.length > 0) && (
                <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold">{t('jobOrderDetails.printingDetails')} ({parsedViewPrints.type})</h3>
          {viewPrintEntries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full border rounded-lg overflow-hidden text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 border-b text-left">{t('common.key')}</th>
                    <th className="px-4 py-2 border-b text-left">{t('common.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {viewPrintEntries.map(([key, value], idx) => (
                    <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 border-b">{key}</td>
                      <td className="px-4 py-2 border-b">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {viewColorBreakdownEntries.length > 0 && viewPlacementOrder.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 border-b text-left">{t('barcode.color')}</th>
                    {viewPlacementOrder.map(placement => (
                      <th key={placement.key} className="px-4 py-2 border-b text-left">{placement.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {viewColorBreakdownEntries.map(([color, placements], idx) => (
                    <tr key={color} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-2 border-b font-medium">{color}</td>
                      {viewPlacementOrder.map(placement => (
                        <td key={placement.key} className="px-4 py-2 border-b">
                          {placements[placement.key] || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
                </div>
              )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="phases">
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('jobOrderDetails.phaseDetails')}</h3>
              <table className="w-full border rounded-lg overflow-hidden shadow-sm table-fixed">
                <thead className="bg-gray-100 text-gray-800">
                  <tr>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-24">{t('barcode.color')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-20">{t('barcode.size')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-24">{t('jobOrderDetails.expected')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-28">{t('jobOrderDetails.cutQuantity')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-28">{t('jobOrderDetails.cutInspection')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-32">{t('jobOrderDetails.secondDegreeCut')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-24">{t('jobOrderDetails.sewingIn')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-24">{t('jobOrderDetails.sewingOut')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-20">{t('jobOrderDetails.qcIn')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-20">{t('jobOrderDetails.qcOut')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-28">{t('jobOrderDetails.packagingIn')}</th>
                    <th className="px-3 py-2 border-b border-gray-200 font-semibold text-center align-middle w-28">{t('jobOrderDetails.packagingOut')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const groupedItems = groupItemsByColor(viewTrackingData);
                    let rowIndex = 0;
                    
                    return Object.entries(groupedItems).map(([color, items]) => {
                      const sortedItems = sortSizes(items);
                      const colorRows = sortedItems.map((item, itemIdx) => {
                        const cutColor = item.cut_quantity > item.produced_quantity ? 'text-purple-600 font-bold' : 'text-blue-600 font-medium';
                        
                        const issues = detectIssues(item);
                        const hasIssues = issues.length > 0;
                        
                        let rowBackgroundClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-200 hover:bg-gray-300';
                        if (hasIssues) {
                          rowBackgroundClass = 'bg-red-100 hover:bg-red-200 border-l-4 border-l-red-600 shadow-sm';
                        }
                        
                        const enhancedCutColor = hasIssues 
                          ? 'text-red-700 font-bold'
                          : cutColor;
                        
                        rowIndex++;
                        
                        return (
                          <tr key={`phase-${item.item_id}-${itemIdx}`} className={`${rowBackgroundClass} transition-colors`}>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">
                              {itemIdx === 0 ? (
                                <div className="font-semibold text-gray-800">{color}</div>
                              ) : (
                                <div className="text-gray-500 text-sm">└─</div>
                              )}
                            </td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.size_value}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle font-medium">{item.expected_quantity}</td>
                            <td className={`px-3 py-2 border-b border-gray-200 text-center align-middle ${enhancedCutColor}`}>{item.cut_quantity}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.cut_inspection_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle text-orange-600">{item.second_degree_cut_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.sewing_in_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.sewing_out_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.qc_in_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.qc_out_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.packaging_in_qty ?? 0}</td>
                            <td className="px-3 py-2 border-b border-gray-200 text-center align-middle">{item.packaging_out_qty ?? 0}</td>
                          </tr>
                        );
                      });
                      
                      return colorRows;
                    }).flat();
                  })()}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="batch_compensation">
            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('batchGeneration.tabCompensation')}</h3>

              {compensationPhaseTotals.length > 0 && (
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-md font-semibold mb-3 text-gray-800">Total Aggregate by Compensation Phase</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {compensationPhaseTotals.map((item) => (
                      <div key={item.phaseName} className="p-3 bg-white border border-gray-200 rounded">
                        <div className="font-medium text-gray-700 text-sm">{item.phaseName}</div>
                        <div className="mt-2 flex items-baseline justify-between">
                          <span className="text-xs text-gray-500">Records</span>
                          <span className="text-xl font-bold text-gray-800">{item.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {compensationPhaseDaily.length > 0 && (
                <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <h4 className="text-md font-semibold mb-3 text-gray-800">Daily Aggregate by Compensation Phase</h4>
                  <div className="space-y-2">
                    {Object.entries(
                      compensationPhaseDaily.reduce((acc, item) => {
                        if (!acc[item.date]) acc[item.date] = [];
                        acc[item.date].push(item);
                        return acc;
                      }, {} as Record<string, typeof compensationPhaseDaily>)
                    )
                      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA))
                      .map(([date, items]) => {
                      const isExpanded = expandedCompensationDates[date] ?? false;
                      return (
                        <div key={date} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                          <button
                            type="button"
                            onClick={() => toggleCompensationDateExpanded(date)}
                            className="w-full px-4 py-2 flex items-center justify-between text-left hover:bg-gray-50"
                          >
                            <span className="font-semibold text-gray-800">{date}</span>
                            {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                          </button>
                          {isExpanded && (
                            <table className="w-full">
                              <thead className="bg-gray-100 text-gray-800">
                                <tr>
                                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('batchGeneration.compensationPhase')}</th>
                                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-center">Records</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(items as any[]).map((item, idx) => (
                                  <tr key={`${item.date}-${item.phaseName}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-2 border-b border-gray-200">{item.phaseName}</td>
                                    <td className="px-4 py-2 border-b border-gray-200 text-center font-medium">{item.count}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {compensations.length === 0 && (
                <div className="text-center py-10 text-gray-500">
                  {t('common.none')}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="qc">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">QC</h3>
              <Tabs defaultValue="total" className="w-full">
                <TabsList className="mb-4 flex w-fit rounded-xl bg-white p-1 shadow-sm border border-gray-200">
                  <TabsTrigger value="total" className="px-4 py-2 rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    Total
                  </TabsTrigger>
                  <TabsTrigger value="today" className="px-4 py-2 rounded-lg data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                    Today
                  </TabsTrigger>
                </TabsList>

                {(['total', 'today'] as const).map((scope) => {
                  const scopedPhases = scope === 'today' ? qcSummary.today_phases : qcSummary.phases;
                  const scopedRejectedPieces = scope === 'today' ? qcSummary.today_rejected_pieces : qcSummary.total_rejected_pieces;

                  return (
                    <TabsContent key={scope} value={scope}>
                      <div className="mb-4 max-w-md">
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                          <div className="text-sm text-gray-600 mb-1">
                            {t('jobOrderDetails.qcTotalRejectedPieces')}
                          </div>
                          <div className="text-2xl font-bold text-gray-800">{scopedRejectedPieces}</div>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 font-semibold text-slate-800">
                          {t('jobOrderDetails.qcByPhase')}
                        </div>
                        <table className="w-full overflow-hidden text-sm md:text-base">
                  <thead className="bg-slate-100 text-slate-800">
                    <tr>
                      <th className="px-4 py-3 border-b border-slate-200 font-semibold text-left">
                        {t('jobOrderDetails.qcReturnToPhase')}
                      </th>
                      <th className="px-4 py-3 border-b border-slate-200 font-semibold text-center">
                        {t('jobOrderDetails.qcRejectedPieces')}
                      </th>
                      <th className="px-4 py-3 border-b border-slate-200 font-semibold text-center">
                        {t('jobOrderDetails.qcRejectRatio')}
                      </th>
                      <th className="px-4 py-3 border-b border-slate-200 font-semibold text-center">
                        {t('jobOrderDetails.qcActiveReworkBatches')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopedPhases.length > 0 ? (
                      scopedPhases.flatMap((phase, idx) => {
                        const isExpanded = Boolean(expandedQcPhaseIds[phase.phase_id]);
                        const showActiveReworkStages = phase.phase_type === 'sewing';
                        const scopedRejectPct =
                          scope === 'today'
                            ? phase.reject_ratio_pct_today
                            : phase.reject_ratio_pct_all_time;
                        return [
                          <tr key={`qc-row-${phase.phase_id}`} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'} hover:bg-emerald-50/40 transition-colors`}>
                            <td className="px-4 py-3 border-b border-slate-200">
                              <button
                                type="button"
                                onClick={() => toggleQcPhaseExpanded(phase.phase_id)}
                                className="inline-flex items-center gap-2 text-left font-medium text-slate-800 hover:text-emerald-700"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                <span>{phase.phase_name}</span>
                              </button>
                            </td>
                            <td className="px-4 py-3 border-b border-slate-200 text-center font-semibold text-slate-800">{phase.reject}</td>
                            <td className="px-4 py-3 border-b border-slate-200 text-center font-semibold text-slate-800">
                              {['sewing', 'cutting', 'qc'].includes(phase.phase_type || '') &&
                              scopedRejectPct != null
                                ? `${scopedRejectPct}%`
                                : '—'}
                            </td>
                            <td className="px-4 py-3 border-b border-slate-200 text-center font-semibold text-slate-800">
                              {phase.phase_type === 'sewing' ? phase.active_rework_batches : '-'}
                            </td>
                          </tr>,
                          ...(isExpanded
                            ? [(
                                <tr key={`qc-expand-${phase.phase_id}`} className="bg-slate-50">
                                  <td colSpan={4} className="px-4 py-4 border-b border-slate-200">
                                    <div className="grid grid-cols-1 gap-4">
                                      {showActiveReworkStages && (
                                        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                          <div className="text-base font-semibold text-slate-800 mb-3">Active Rework Problem Stages</div>
                                          {phase.active_rework_problem_stages.length > 0 ? (
                                            <div className="divide-y divide-slate-200">
                                              {phase.active_rework_problem_stages.map((entry, entryIdx) => (
                                                <div key={`${phase.phase_id}-stage-${entry.problem_stage_name}-${entryIdx}`} className={`flex justify-between py-2 ${entryIdx % 2 === 1 ? 'bg-slate-50/60' : ''}`}>
                                                  <span className="text-slate-700 text-sm md:text-base">{entry.problem_stage_name}</span>
                                                  <span className="font-semibold text-slate-900 text-sm md:text-base">{entry.count}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-sm md:text-base text-slate-500">{t('common.none')}</div>
                                          )}
                                        </div>
                                      )}
                                      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                        <div className="text-base font-semibold text-slate-800 mb-3">Rejection Reasons</div>
                                        {phase.phase_type !== 'sewing' ? (
                                          (phase.rejection_reason_totals && phase.rejection_reason_totals.length > 0) ? (
                                            <div className="divide-y divide-slate-200">
                                              {phase.rejection_reason_totals.map((entry, entryIdx) => (
                                                <div key={`${phase.phase_id}-reason-total-${entry.reason}-${entryIdx}`} className={`flex justify-between py-2 ${entryIdx % 2 === 1 ? 'bg-slate-50/60' : ''}`}>
                                                  <span className="text-slate-700 text-sm md:text-base">{entry.reason}</span>
                                                  <span className="font-semibold text-slate-900 text-sm md:text-base">{entry.count}</span>
                                                </div>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-sm md:text-base text-slate-500">{t('common.none')}</div>
                                          )
                                        ) : phase.rejection_reason_counts.length > 0 ? (
                                          <div className="space-y-3">
                                            {phase.rejection_reason_counts.map((stageEntry, stageIdx) => {
                                              const stageKey = `${phase.phase_id}-stage-${stageEntry.problem_stage_name}-${stageIdx}`;
                                              const isStageExpanded = Boolean(expandedRejectionStages[stageKey]);
                                              return (
                                                <div key={`${phase.phase_id}-reason-stage-${stageEntry.problem_stage_name}-${stageIdx}`} className="rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                                                  <button
                                                    type="button"
                                                    onClick={() => toggleRejectionStageExpanded(stageKey)}
                                                    className="w-full flex items-center justify-between text-sm font-semibold text-gray-800 mb-2 text-left"
                                                  >
                                                    <span className="inline-flex items-center gap-2">
                                                      {isStageExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                      {stageEntry.problem_stage_name}
                                                    </span>
                                                    <span>{stageEntry.total_count}</span>
                                                  </button>
                                                  {isStageExpanded && (
                                                    <div className="space-y-2">
                                                      {stageEntry.workers.map((workerEntry, workerIdx) => {
                                                        const workerKey = `${stageKey}-worker-${workerEntry.worker_name}-${workerIdx}`;
                                                        const isWorkerExpanded = Boolean(expandedRejectionWorkers[workerKey]);
                                                        return (
                                                          <div key={`${phase.phase_id}-worker-${workerEntry.worker_name}-${workerIdx}`} className="pl-2 border-l-2 border-emerald-200">
                                                            <button
                                                              type="button"
                                                              onClick={() => toggleRejectionWorkerExpanded(workerKey)}
                                                              className="w-full flex items-center justify-between text-sm font-medium text-gray-700 mb-1 text-left"
                                                            >
                                                              <span className="inline-flex items-center gap-2">
                                                                {isWorkerExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                {workerEntry.worker_name}
                                                              </span>
                                                              <span>{workerEntry.total_count}</span>
                                                            </button>
                                                            {isWorkerExpanded && (
                                                              <div className="pl-2 rounded-md border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
                                                                {workerEntry.reasons.map((reasonEntry, reasonIdx) => (
                                                                  <div
                                                                    key={`${phase.phase_id}-worker-reason-${reasonEntry.reason}-${reasonIdx}`}
                                                                    className={`flex justify-between items-center px-3 py-2 text-sm md:text-base ${reasonIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'} hover:bg-amber-50/70 transition-colors`}
                                                                  >
                                                                    <span className="text-slate-700 font-medium">{reasonEntry.reason}</span>
                                                                    <span className="font-semibold text-slate-900">{reasonEntry.count}</span>
                                                                  </div>
                                                                ))}
                                                              </div>
                                                            )}
                                                          </div>
                                                        );
                                                      })}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-gray-500">{t('common.none')}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )]
                            : []),
                        ];
                      })
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          {t('common.none')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          </TabsContent>

        </Tabs>
        </>
      ) : (
        <div className="text-center py-10 text-red-600">{t('jobOrderDetails.notFound')}</div>
      )}
      {/* Edit Job Order Dialog */}
      {editDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg shadow-lg max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('jobOrders.editJobOrder')}</h2>
            <div className="space-y-6">
              {/* Notes Section */}
              <div>
                <h3 className="text-lg font-semibold mb-2">{t('jobOrderDetails.notes')}</h3>
                <textarea
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full border rounded px-3 py-2 h-20 resize-none"
                  placeholder={t('jobOrderDetails.notes')}
                  disabled={editLoading}
                />
              </div>

              {/* Items Section */}
              <div>
                <h3 className="text-lg font-semibold mb-2">{t('jobOrders.jobOrderItems')}</h3>
            <div className="space-y-3">
              {editItems.map((item, index) => (
                <div key={item.item_id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{item.color_name} - {item.size_value}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('jobOrders.quantity')}:</span>
                    <input
                      type="number"
                      min="0"
                      value={item.quantity}
                      onChange={e => handleQuantityChange(item.item_id, parseInt(e.target.value) || 0)}
                      className="w-24 border rounded px-2 py-1"
                      disabled={editLoading}
                    />
                  </div>
                </div>
              ))}
                </div>
              </div>

              {/* Printing Details Section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">{t('jobOrderDetails.printingDetails')}</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => {
                        if (editPrints) {
                          setEditPrints(null);
                          setEditPrintSelection({});
                          setEditPrintBulkValue('');
                        } else {
                          setEditPrints({ type: 'Printing', fields: {}, placementLabels: buildDefaultPlacementLabels(), colorBreakdown: {} });
                        }
                      }}
                      disabled={editLoading}
                      variant="outline"
                      size="sm"
                    >
                      {editPrints ? t('common.remove') : t('common.add')}
                    </Button>
                  </div>
                </div>
                {editPrints && (
                  <div className="space-y-4 border rounded-lg p-4">
                    <div>
                      <Label>{t('common.type')}</Label>
                      <select
                        value={editPrints.type}
                        onChange={e => setEditPrints(prev => prev ? { ...prev, type: e.target.value } : null)}
                        disabled={editLoading}
                        className="w-full border rounded px-3 py-2 mt-1"
                      >
                        <option value="Printing">Printing</option>
                        <option value="Embroidery">Embroidery</option>
                      </select>
                    </div>
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <Label>{t('common.details')}</Label>
                        <Button
                          type="button"
                          onClick={() => {
                            if (editPrints) {
                              const key = prompt('Enter key name:');
                              if (key && key.trim()) {
                                setEditPrints({
                                  ...editPrints,
                                  fields: { ...editPrints.fields, [key.trim()]: '' }
                                });
                              }
                            }
                          }}
                          disabled={editLoading || !editPrints}
                          variant="outline"
                          size="sm"
                        >
                          {t('common.add')} {t('common.key')}
                        </Button>
                      </div>
                      {Object.keys(editPrints.fields).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(editPrints.fields).map(([key, value]) => (
                            <div key={key} className="flex gap-2 items-center">
                              <Input
                                value={key}
                                onChange={e => {
                                  const newFields = { ...editPrints!.fields };
                                  delete newFields[key];
                                  newFields[e.target.value] = value;
                                  setEditPrints({ ...editPrints!, fields: newFields });
                                }}
                                disabled={editLoading}
                                className="flex-1"
                                placeholder={t('common.key')}
                              />
                              <Input
                                value={value}
                                onChange={e => setEditPrints(prev => prev ? {
                                  ...prev,
                                  fields: { ...prev.fields, [key]: e.target.value }
                                } : null)}
                                disabled={editLoading}
                                className="flex-1"
                                placeholder={t('common.value')}
                              />
                              <Button
                                type="button"
                                onClick={() => {
                                  if (editPrints) {
                                    const newFields = { ...editPrints.fields };
                                    delete newFields[key];
                                    setEditPrints({ ...editPrints, fields: newFields });
                                  }
                                }}
                                disabled={editLoading}
                                variant="outline"
                                size="sm"
                              >
                                {t('common.remove')}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">{t('common.noEntries')}</p>
                      )}
                    </div>
                    <div className="pt-2 space-y-3 border-t">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <Label>Color Specific Placements</Label>
                          <p className="text-xs text-gray-500">Assign print colors per garment color.</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleEditPlacementAdd}
                            disabled={editLoading}
                          >
                            {t('common.add')} Field
                          </Button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <select
                          value={editPrintBulkPlacementKey}
                          onChange={e => setEditPrintBulkPlacementKey(e.target.value)}
                          disabled={editLoading || editPlacementList.length === 0}
                          className="border rounded-md px-3 py-2 min-w-[10rem]"
                        >
                          {editPlacementList.map(placement => (
                            <option key={placement.key} value={placement.key}>
                              {placement.label}
                            </option>
                          ))}
                        </select>
                        <Input
                          value={editPrintBulkValue}
                          onChange={e => setEditPrintBulkValue(e.target.value)}
                          placeholder="Print color"
                          disabled={editLoading}
                          className="min-w-[10rem]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleEditBulkApply}
                          disabled={editLoading || !editPrintBulkPlacementKey || !editPrintBulkValue.trim() || editColorRows.length === 0}
                        >
                          {editSelectedRowCount > 0 ? `Apply to ${editSelectedRowCount} ${editSelectedRowCount === 1 ? 'Color' : 'Colors'}` : 'Apply to All Colors'}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500">Select rows to limit bulk updates.</p>
                      <div className="overflow-auto border rounded-md">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="border p-2 w-12 text-center">
                                <Checkbox
                                  checked={allEditRowsSelected}
                                  onCheckedChange={checked => handleEditToggleAllRows(Boolean(checked))}
                                  disabled={editLoading || editColorRows.length === 0}
                                />
                              </th>
                              <th className="border p-2 text-left">{t('barcode.color')}</th>
                              {editPlacementList.map(placement => (
                                <th key={placement.key} className="border p-2 min-w-[10rem]">
                                  <div className="flex items-center justify-between gap-2">
                                    <span>{placement.label}</span>
                                    {editPlacementList.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleEditPlacementRemove(placement.key)}
                                        disabled={editLoading}
                                      >
                                        <X className="w-3 h-3 text-red-500" />
                                      </button>
                                    )}
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {editColorRows.length > 0 ? (
                              editColorRows.map((color, rowIndex) => (
                                <tr key={color} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="border p-2 text-center align-top">
                                    <Checkbox
                                      checked={Boolean(editPrintSelection[color])}
                                      onCheckedChange={checked => handleEditToggleRow(color, Boolean(checked))}
                                      disabled={editLoading}
                                    />
                                  </td>
                                  <td className="border p-2 font-medium align-top">{color}</td>
                                  {editPlacementList.map(placement => (
                                    <td key={placement.key} className="border p-2">
                                      <Input
                                        value={editPrints.colorBreakdown[color]?.[placement.key] || ''}
                                        onChange={e => handleEditColorPrintChange(color, placement.key, e.target.value)}
                                        placeholder="-"
                                        disabled={editLoading}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={editPlacementList.length + 2} className="border p-4 text-center text-gray-500">
                                  Add job order colors to configure placement colors.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Consumption Table */}
              <div className="space-y-4 mt-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">{t('jobOrderDetails.materialConsumption')}</h3>
                  <Button 
                    type="button" 
                    onClick={handleAddEditCategory} 
                    disabled={editLoading} 
                    variant="outline" 
                    size="sm"
                  >
                    {t('common.add')} {t('jobOrderDetails.consumptionCategory')}
                  </Button>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Label>{t('jobOrderDetails.materialName')}</Label>
                    <Input
                      value={editMaterialName}
                      onChange={(e) => setEditMaterialName(e.target.value)}
                      placeholder={t('jobOrderDetails.materialName')}
                      disabled={editLoading}
                      className="w-64"
                    />
                  </div>
                  <div className="overflow-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border p-2 min-w-[6rem] text-left">{t('barcode.color')}</th>
                          {editConsumptionCategories.map(cat => (
                            <th key={cat.key} className="border p-2 min-w-[8rem] text-center space-y-1">
                              <Input
                                type="number"
                                step="0.001"
                                value={editBulkConsumption[cat.key] ?? ''}
                                onChange={e => handleEditBulkConsumptionChange(cat.key, parseFloat(e.target.value) || 0)}
                                placeholder={cat.label}
                                className="text-center"
                                disabled={editLoading}
                              />
                              <div className="mt-1 text-xs text-gray-500">{cat.label}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueColors.map((color, rowIndex) => (
                          <tr key={color} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="border p-2">{color}</td>
                            {editConsumptionCategories.map(cat => {
                              const matName = cat.usesMaterialName ? editMaterialName || cat.label : cat.label;
                              const cellKey = getConsumptionCellKey(matName, color, cat.key);
                              return (
                                <td key={cat.key} className="border p-1 text-center">
                                  <Input
                                    type="number"
                                    step="0.001"
                                    value={editConsumptionValues[cellKey] ?? ''}
                                    onChange={e => setEditConsumptionValues(prev => ({ ...prev, [cellKey]: parseFloat(e.target.value) || 0 }))}
                                    placeholder="-"
                                    className="w-24 text-center"
                                    disabled={editLoading}
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button onClick={handleCancelEdit} disabled={editLoading} variant="outline">{t('common.cancel')}</Button>
              <Button onClick={handleSaveEdit} disabled={editLoading} variant="default">{editLoading ? t('common.loading') : t('jobOrderDetails.saveChanges')}</Button>
            </div>
          </div>
        </div>
      )}
      {/* Removed: Confirmation Dialog for Close/Reopen */}
    </Layout>
  );
};

export default JobOrderDetailsPage; 