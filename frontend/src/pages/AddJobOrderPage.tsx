import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, X, ArrowLeft, ListOrdered } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import api, { jobOrderApi } from '../services/api';
import { EditableDropdown } from '../components/SearchableDropdown';
import { Checkbox } from '../components/ui/checkbox';
import { PrintPlacement } from '../constants/printPlacements';
import { expandSizeRange, getSizeOrderBounds } from '../utils/sizeSort';

const SIZE_ORDER_BOUNDS = getSizeOrderBounds();

const createColorRowKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `color-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const parseJobOrderPrintConfig = (jobOrder: any): Record<string, any> | null => {
  const raw = jobOrder?.prints ?? jobOrder?.print_config ?? jobOrder?.printConfig;
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, any>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return null;
};

const placementKeyToFallbackLabel = (key: string) =>
  key
    .split('_')
    .filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ') || key;

const buildPlacementsFromPrintConfig = (
  printConfig: Record<string, any>,
  chestLabel: string
): PrintPlacement[] => {
  const labels = printConfig.placement_labels || printConfig.placementLabels || {};
  const breakdown = printConfig.color_breakdown || printConfig.colorBreakdown || {};
  const keySet = new Set<string>();
  Object.keys(labels).forEach(k => {
    if (k) keySet.add(k);
  });
  Object.values(breakdown).forEach(placements => {
    if (placements && typeof placements === 'object') {
      Object.keys(placements as Record<string, string>).forEach(k => {
        if (k) keySet.add(k);
      });
    }
  });
  if (keySet.size === 0) {
    return [{ key: 'chest', label: chestLabel }];
  }
  return Array.from(keySet).map(key => ({
    key,
    label: labels[key] != null && String(labels[key]).trim() !== ''
      ? String(labels[key])
      : placementKeyToFallbackLabel(key)
  }));
};

const printConfigHasData = (pc: Record<string, any> | null): boolean => {
  if (!pc) return false;
  if (pc.type || pc.Type || pc.method || pc.mode) return true;
  const cb = pc.color_breakdown || pc.colorBreakdown;
  if (cb && typeof cb === 'object' && Object.keys(cb).length > 0) return true;
  const pl = pc.placement_labels || pc.placementLabels;
  if (pl && typeof pl === 'object' && Object.keys(pl).length > 0) return true;
  return false;
};

const MAX_SIZE_RANGE_SPAN = 200;

const mergeSizesFromRange = (prevSizes: string[], rangeSizes: string[]): string[] => {
  const trimmed = prevSizes.map(s => s.trim());
  if (trimmed.length === 1 && trimmed[0] === '') {
    return rangeSizes;
  }
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const s of trimmed) {
    if (s && !seen.has(s)) {
      seen.add(s);
      merged.push(s);
    }
  }
  for (const s of rangeSizes) {
    if (!seen.has(s)) {
      seen.add(s);
      merged.push(s);
    }
  }
  return merged;
};

const remapQuantitiesForMergedSizes = (
  prevSizes: string[],
  mergedSizes: string[],
  prevQuantities: number[][]
): number[][] =>
  prevQuantities.map(row => {
    const qtyBySize: Record<string, number> = {};
    prevSizes.forEach((s, i) => {
      qtyBySize[s.trim()] = row[i] ?? 0;
    });
    return mergedSizes.map(s => qtyBySize[s.trim()] ?? 0);
  });

const AddJobOrderPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editJobOrderIdParam = searchParams.get('editJobOrderId');
  const editJobOrderId = editJobOrderIdParam ? Number(editJobOrderIdParam) : NaN;
  const isEditMode = Number.isFinite(editJobOrderId) && editJobOrderId > 0;
  
  const [addLoading, setAddLoading] = useState(false);
  const [newJobOrder, setNewJobOrder] = useState({
    job_order_number: '',
    model_name: '',
    client_name: '',
    items: [{ color_name: '', size_value: '', quantity: 1 }]
  });
  const [newJobOrderImage, setNewJobOrderImage] = useState<File | null>(null);
  const [newJobOrderImagePreview, setNewJobOrderImagePreview] = useState<string | null>(null);
  
  // Table-based item entry states
  const [tableColors, setTableColors] = useState<string[]>(['']);
  const [colorRowKeys, setColorRowKeys] = useState<string[]>([createColorRowKey()]);
  const [tableSizes, setTableSizes] = useState<string[]>(['']);
  const [tableQuantities, setTableQuantities] = useState<number[][]>([[0]]);
  const [sizeRangeFrom, setSizeRangeFrom] = useState('');
  const [sizeRangeTo, setSizeRangeTo] = useState('');
  const [tablePercentageDelta, setTablePercentageDelta] = useState('2');
  
  // Existing options for dropdowns
  const [existingColors, setExistingColors] = useState<string[]>([]);
  const [existingSizes, setExistingSizes] = useState<string[]>([]);
  const [existingModels, setExistingModels] = useState<string[]>([]);
  const [existingClients, setExistingClients] = useState<string[]>([]);
  const [existingMaterials, setExistingMaterials] = useState<string[]>([]);
  const [autoJobOrderNumber, setAutoJobOrderNumber] = useState<string>('');
  const [autoGenerateJobOrderNumber, setAutoGenerateJobOrderNumber] = useState(true);
  const [materialRows, setMaterialRows] = useState<Array<{ key: string; type: string; panel_type: string; measurement_scale: 'KG' | 'M'; consumptions: Record<string, number>; apply_all_value: number }>>([]);
  const [itemIdByColorSize, setItemIdByColorSize] = useState<Record<string, number>>({});
  
  const [jobOrderNotes, setJobOrderNotes] = useState<string>('');
  const [enablePrintDetails, setEnablePrintDetails] = useState(false);
  const [printType, setPrintType] = useState<'Printing' | 'Embroidery'>('Printing');
  const [printPlacements, setPrintPlacements] = useState<PrintPlacement[]>([
    { key: 'chest', label: t('jobOrderDetails.chest') }
  ]);
  const [colorPrintDetails, setColorPrintDetails] = useState<Record<string, Record<string, string>>>({});
  const [selectedPrintRows, setSelectedPrintRows] = useState<Record<string, boolean>>({});
  const [bulkPlacementKey, setBulkPlacementKey] = useState<string>('chest');
  const [bulkColorValue, setBulkColorValue] = useState<string>('');
  
  // Total quantity entered in the table
  const totalTableQuantity = tableQuantities.reduce((sum, row) => sum + row.reduce((s, v) => s + (v || 0), 0), 0);

  // Fetch existing colors, sizes, and models for dropdowns
  useEffect(() => {
    const fetchExistingOptions = async () => {
      try {
        const [colors, sizes, models, jobOrders, materials] = await Promise.all([
          jobOrderApi.getExistingColors(),
          jobOrderApi.getExistingSizes(),
          jobOrderApi.getExistingModels(),
          jobOrderApi.getAllSimple(),
          jobOrderApi.getExistingMaterials()
        ]);
        setExistingColors(colors);
        setExistingSizes(sizes);
        setExistingModels(models);
        setExistingMaterials(materials);
        const clientsResponse = await api.get('/batches/clients/');
        const clientsData = Array.isArray(clientsResponse.data) ? clientsResponse.data : [];
        const clientNames = clientsData
          .map((client: { client_name?: string }) => client.client_name)
          .filter((name: string | undefined): name is string => Boolean(name));
        setExistingClients(clientNames);
        const maxId = jobOrders.reduce((max, jo) => Math.max(max, jo.job_order_id || 0), 0);
        const nextId = maxId + 1;
        const computedNumber = `JO-${nextId}`;
        setAutoJobOrderNumber(computedNumber);
      } catch (error) {
        console.error('Error fetching existing options:', error);
      }
    };

    fetchExistingOptions();
  }, []);

  useEffect(() => {
    if (autoGenerateJobOrderNumber && autoJobOrderNumber) {
      setNewJobOrder(prev => ({
        ...prev,
        job_order_number: autoJobOrderNumber
      }));
    }
  }, [autoGenerateJobOrderNumber, autoJobOrderNumber]);

  useEffect(() => {
    if (!isEditMode) return;
    const loadForEdit = async () => {
      try {
        setAddLoading(true);
        const [jobOrder, materials] = await Promise.all([
          jobOrderApi.getById(editJobOrderId),
          jobOrderApi.getMaterials(editJobOrderId)
        ]);

        setNewJobOrder(prev => ({
          ...prev,
          job_order_number: jobOrder.job_order_number || '',
          model_name: jobOrder.model_name || '',
          client_name: jobOrder.client_name || '',
          items: prev.items
        }));
        setJobOrderNotes(jobOrder.notes || '');

        const colorOrder: string[] = [];
        const sizeOrder: string[] = [];
        const qtyMatrixByColor: Record<string, Record<string, number>> = {};
        const mapping: Record<string, number> = {};
        (jobOrder.items || []).forEach((item: any) => {
          const color = String(item.color_name || '').trim();
          const size = String(item.size_value || '').trim();
          if (!color || !size) return;
          if (!colorOrder.includes(color)) colorOrder.push(color);
          if (!sizeOrder.includes(size)) sizeOrder.push(size);
          if (!qtyMatrixByColor[color]) qtyMatrixByColor[color] = {};
          qtyMatrixByColor[color][size] = Number(item.quantity || 0);
          mapping[`${color}::${size}`] = Number(item.item_id);
        });
        const newColorRowKeys =
          colorOrder.length > 0 && sizeOrder.length > 0
            ? colorOrder.map(() => createColorRowKey())
            : [];

        if (colorOrder.length > 0 && sizeOrder.length > 0) {
          setTableColors(colorOrder);
          setColorRowKeys(newColorRowKeys);
          setTableSizes(sizeOrder);
          setTableQuantities(
            colorOrder.map(color => sizeOrder.map(size => Number(qtyMatrixByColor[color]?.[size] || 0)))
          );
        }
        setItemIdByColorSize(mapping);

        const groupedMaterials: Record<string, { key: string; type: string; panel_type: string; measurement_scale: 'KG' | 'M'; consumptions: Record<string, number>; apply_all_value: number }> = {};
        (materials || []).forEach((material: any) => {
          const type = String(material.type || material.material_name || '').trim();
          const panelType = String(material.panel_type || 'default').trim();
          const measurementScale = (String(material.measurement_scale || 'KG').toUpperCase() === 'M' ? 'M' : 'KG') as 'KG' | 'M';
          const colorName = String(material.color_name || '').trim();
          const consumption = Number(material.consumption || 0);
          if (!type || !panelType || !colorName || consumption <= 0) return;
          const rowKey = `${type}::${panelType}::${measurementScale}`;
          if (!groupedMaterials[rowKey]) {
            groupedMaterials[rowKey] = {
              key: createColorRowKey(),
              type,
              panel_type: panelType,
              measurement_scale: measurementScale,
              consumptions: {},
              apply_all_value: 0
            };
          }
          groupedMaterials[rowKey].consumptions[colorName] = consumption;
        });
        setMaterialRows(Object.values(groupedMaterials));

        const printConfig = parseJobOrderPrintConfig(jobOrder);
        if (printConfig && printConfigHasData(printConfig)) {
          setEnablePrintDetails(true);
          const rawType =
            printConfig.type ||
            printConfig.Type ||
            printConfig.method ||
            printConfig.mode ||
            'Printing';
          setPrintType(String(rawType) === 'Embroidery' ? 'Embroidery' : 'Printing');
          setPrintPlacements(buildPlacementsFromPrintConfig(printConfig, t('jobOrderDetails.chest')));

          const breakdown =
            printConfig.color_breakdown || printConfig.colorBreakdown || {};
          const mappedByRowKey: Record<string, Record<string, string>> = {};
          if (newColorRowKeys.length > 0) {
            colorOrder.forEach((colorName, idx) => {
              const rowKey = newColorRowKeys[idx];
              const row = breakdown[colorName];
              if (!rowKey || !row || typeof row !== 'object') return;
              const cleaned: Record<string, string> = {};
              Object.entries(row).forEach(([placementKey, val]) => {
                if (val == null) return;
                const s = String(val).trim();
                if (s) cleaned[placementKey] = s;
              });
              if (Object.keys(cleaned).length > 0) {
                mappedByRowKey[rowKey] = cleaned;
              }
            });
          }
          setColorPrintDetails(mappedByRowKey);
        } else {
          setEnablePrintDetails(false);
          setColorPrintDetails({});
        }
      } catch (error) {
        toast({
          title: t('common.error'),
          description: t('addJobOrder.failedToLoadForEdit'),
          variant: 'destructive'
        });
        navigate('/job-orders');
      } finally {
        setAddLoading(false);
      }
    };
    loadForEdit();
  }, [isEditMode, editJobOrderId, navigate, t, toast]);

  useEffect(() => {
    if (printPlacements.length === 0) {
      if (bulkPlacementKey !== '') {
        setBulkPlacementKey('');
      }
      return;
    }
    const hasCurrent = printPlacements.some(placement => placement.key === bulkPlacementKey);
    if (!hasCurrent) {
      setBulkPlacementKey(printPlacements[0].key);
    }
  }, [printPlacements, bulkPlacementKey]);

  // ==================== TABLE-BASED ITEM ENTRY HELPERS ====================
  const handleAddColorRow = () => {
    setTableColors(prev => [...prev, '']);
    setColorRowKeys(prev => [...prev, createColorRowKey()]);
    setTableQuantities(prev => [...prev, Array(tableSizes.length).fill(0)]);
  };

  const handleAddSizeColumn = () => {
    setTableSizes(prev => [...prev, '']);
    setTableQuantities(prev => prev.map(row => [...row, 0]));
  };

  const handleAddSizeRange = () => {
    if (!sizeRangeFrom.trim() || !sizeRangeTo.trim()) {
      toast({
        title: t('common.error'),
        description: t('addJobOrder.sizeRangeInvalid'),
        variant: 'destructive'
      });
      return;
    }
    const result = expandSizeRange(sizeRangeFrom, sizeRangeTo, MAX_SIZE_RANGE_SPAN);
    if (!result.ok) {
      if (result.reason === 'unknown_endpoint') {
        const bounds = getSizeOrderBounds();
        toast({
          title: t('common.error'),
          description: t('addJobOrder.sizeRangeUnknownEndpoint', {
            value: result.unknownValue ?? '',
            min: bounds.numeric_start,
            max: bounds.numeric_end,
            examples: bounds.letterExamples
          }),
          variant: 'destructive'
        });
        return;
      }
      if (result.reason === 'too_large') {
        toast({
          title: t('common.error'),
          description: t('addJobOrder.sizeRangeTooLarge', { max: result.maxSpan ?? MAX_SIZE_RANGE_SPAN }),
          variant: 'destructive'
        });
        return;
      }
      return;
    }
    const rangeSizes = result.sizes;
    setTableSizes(prevSizes => {
      const merged = mergeSizesFromRange(prevSizes, rangeSizes);
      setTableQuantities(prevQ => remapQuantitiesForMergedSizes(prevSizes, merged, prevQ));
      return merged;
    });
    setSizeRangeFrom('');
    setSizeRangeTo('');
    toast({
      title: t('common.success'),
      description: t('addJobOrder.sizeRangeAdded', { count: rangeSizes.length })
    });
  };

  const handleUpdateColor = (rowIndex: number, value: string) => {
    setTableColors(prev => prev.map((c, i) => (i === rowIndex ? value : c)));
  };

  const handleUpdateSize = (colIndex: number, value: string) => {
    setTableSizes(prev => prev.map((s, i) => (i === colIndex ? value : s)));
  };

  const handleRemoveColorRow = (rowIndex: number) => {
    if (tableColors.length === 1) return;
    const rowKey = colorRowKeys[rowIndex];
    setTableColors(prev => prev.filter((_, i) => i !== rowIndex));
    setTableQuantities(prev => prev.filter((_, i) => i !== rowIndex));
    setColorRowKeys(prev => prev.filter((_, i) => i !== rowIndex));
    setColorPrintDetails(prev => {
      if (!rowKey) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setSelectedPrintRows(prev => {
      if (!rowKey) return prev;
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
  };

  const handleRemoveSizeColumn = (colIndex: number) => {
    if (tableSizes.length === 1) return;
    setTableSizes(prev => prev.filter((_, i) => i !== colIndex));
    setTableQuantities(prev => prev.map(row => row.filter((_, i) => i !== colIndex)));
  };

  const handleQuantityTableChange = (rowIndex: number, colIndex: number, value: number) => {
    setTableQuantities(prev => prev.map((row, i) =>
      i === rowIndex ? row.map((v, j) => (j === colIndex ? value : v)) : row
    ));
  };

  const handleApplyPercentageToTable = () => {
    const percentage = Number.parseFloat(tablePercentageDelta);
    if (!Number.isFinite(percentage)) {
      toast({
        title: t('common.error'),
        description: t('addJobOrder.invalidPercentage'),
        variant: 'destructive'
      });
      return;
    }

    const multiplier = 1 + percentage / 100;
    setTableQuantities(prev =>
      prev.map(row =>
        row.map(value => {
          const baseValue = Number(value) || 0;
          const adjusted = Math.round(baseValue * multiplier);
          return adjusted < 0 ? 0 : adjusted;
        })
      )
    );
    setTablePercentageDelta('');
    toast({
      title: t('common.success'),
      description: t('addJobOrder.percentageApplied', { percent: percentage })
    });
  };

  const handleAddMaterialRow = () => {
    setMaterialRows(prev => [...prev, { key: createColorRowKey(), type: '', panel_type: '', measurement_scale: 'KG', consumptions: {}, apply_all_value: 0 }]);
  };

  const handleRemoveMaterialRow = (rowIndex: number) => {
    setMaterialRows(prev => prev.filter((_, index) => index !== rowIndex));
  };

  const handleMaterialRowChange = (
    rowIndex: number,
    field: 'type' | 'panel_type' | 'measurement_scale' | 'apply_all_value',
    value: string | number
  ) => {
    setMaterialRows(prev =>
      prev.map((row, index) => (index === rowIndex ? { ...row, [field]: value } : row))
    );
  };

  const handleMaterialConsumptionByColorChange = (
    rowIndex: number,
    colorName: string,
    value: number
  ) => {
    setMaterialRows(prev =>
      prev.map((row, index) => {
        if (index !== rowIndex) return row;
        return {
          ...row,
          consumptions: {
            ...row.consumptions,
            [colorName]: value
          }
        };
      })
    );
  };

  const handleApplyMaterialConsumptionToAllColors = (rowIndex: number) => {
    if (availableItemColors.length === 0) return;
    setMaterialRows(prev =>
      prev.map((row, index) => {
        if (index !== rowIndex) return row;
        const applyValue = Number(row.apply_all_value) || 0;
        const nextConsumptions: Record<string, number> = { ...row.consumptions };
        availableItemColors.forEach(colorName => {
          nextConsumptions[colorName] = applyValue;
        });
        return {
          ...row,
          consumptions: nextConsumptions
        };
      })
    );
  };

  const getItemsFromTable = () => {
    // Merge duplicates (same color & size) by summing their quantities
    const map = new Map<string, { color_name: string; size_value: string; quantity: number }>();
    for (let r = 0; r < tableColors.length; r++) {
      const color = tableColors[r].trim();
      if (!color) continue;
      for (let c = 0; c < tableSizes.length; c++) {
        const size = tableSizes[c].trim();
        if (!size) continue;
        const qty = tableQuantities[r]?.[c] || 0;
        if (qty > 0) {
          const key = `${color}::${size}`;
          if (!map.has(key)) {
            map.set(key, { color_name: color, size_value: size, quantity: qty });
          } else {
            map.get(key)!.quantity += qty;
          }
        }
      }
    }
    return Array.from(map.values());
  };
  // ==================== END TABLE HELPERS ====================

  const generatePlacementKey = (label: string) => {
    const normalized = label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    return normalized || `placement_${Date.now().toString(36)}`;
  };

  const handlePlacementAdd = () => {
    const label = prompt(t('addJobOrder.enterPlacementName'));
    if (!label || !label.trim()) return;
    const baseKey = generatePlacementKey(label);
    let candidate = baseKey;
    let counter = 1;
    while (printPlacements.some(placement => placement.key === candidate)) {
      candidate = `${baseKey}_${counter}`;
      counter += 1;
    }
    setPrintPlacements(prev => [...prev, { key: candidate, label: label.trim() }]);
  };

  const handlePlacementRemove = (placementKey: string) => {
    if (printPlacements.length === 1) return;
    setPrintPlacements(prev => prev.filter(placement => placement.key !== placementKey));
    setColorPrintDetails(prev => {
      const next: Record<string, Record<string, string>> = {};
      Object.entries(prev).forEach(([rowKey, details]) => {
        if (!details) return;
        const updated = { ...details };
        delete updated[placementKey];
        next[rowKey] = updated;
      });
      return next;
    });
  };

  const handleColorPrintChange = (rowKey: string, placementKey: string, value: string) => {
    setColorPrintDetails(prev => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [placementKey]: value
      }
    }));
  };

  const handleTogglePrintRow = (rowKey: string, checked: boolean) => {
    setSelectedPrintRows(prev => ({
      ...prev,
      [rowKey]: checked
    }));
  };

  const handleToggleAllPrintRows = (checked: boolean) => {
    if (!checked) {
      setSelectedPrintRows({});
      return;
    }
    const next: Record<string, boolean> = {};
    colorRowKeys.forEach(key => {
      next[key] = true;
    });
    setSelectedPrintRows(next);
  };

  const handleBulkApplyPrintColor = () => {
    if (!bulkPlacementKey || !bulkColorValue.trim()) return;
    const explicitTargets = Object.entries(selectedPrintRows)
      .filter(([, selected]) => selected)
      .map(([rowKey]) => rowKey);
    const targets = explicitTargets.length > 0 ? explicitTargets : colorRowKeys;
    if (targets.length === 0) return;
    const trimmedValue = bulkColorValue.trim();
    setColorPrintDetails(prev => {
      const next = { ...prev };
      targets.forEach(rowKey => {
        if (!rowKey) return;
        const current = next[rowKey] ? { ...next[rowKey] } : {};
        current[bulkPlacementKey] = trimmedValue;
        next[rowKey] = current;
      });
      return next;
    });
    setBulkColorValue('');
  };

  const selectedRowCount = Object.values(selectedPrintRows).filter(Boolean).length;
  const allPrintRowsSelected = colorRowKeys.length > 0 && colorRowKeys.every(key => selectedPrintRows[key]);
  const availableItemColors = Array.from(
    new Set(tableColors.map(color => color.trim()).filter(Boolean))
  );

  /** Print ink suggestions: master color list + garment colors on this order (custom text still allowed). */
  const printColorSuggestions = useMemo(() => {
    const set = new Set<string>();
    existingColors.forEach(c => {
      const v = String(c || '').trim();
      if (v) set.add(v);
    });
    availableItemColors.forEach(c => {
      const v = String(c || '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [existingColors, availableItemColors]);

  const handleSaveNewJobOrder = async () => {
    // Validate required fields
    if (!newJobOrder.job_order_number.trim()) {
      toast({
        title: t('common.error'),
        description: t('jobOrders.validationErrors.jobOrderNumberRequired'),
        variant: 'destructive'
      });
      return;
    }
    if (!newJobOrder.client_name.trim()) {
      toast({
        title: t('common.error'),
        description: t('jobOrders.validationErrors.clientNameRequired'),
        variant: 'destructive'
      });
      return;
    }
    if (!newJobOrder.model_name.trim()) {
      toast({
        title: t('common.error'),
        description: t('jobOrders.validationErrors.modelNameRequired'),
        variant: 'destructive'
      });
      return;
    }

    // Generate items from table data
    const generatedItems = getItemsFromTable();
    if (generatedItems.length === 0) {
        toast({
          title: t('common.error'),
        description: t('addJobOrder.atLeastOneQuantityRequired'),
          variant: 'destructive'
        });
        return;
      }

    const colorTotals: Record<string, number> = {};
    tableColors.forEach((color, rowIndex) => {
      const colorName = color.trim();
      if (!colorName) return;
      const totalForColor = (tableQuantities[rowIndex] || []).reduce((sum, quantity) => sum + (Number(quantity) || 0), 0);
      colorTotals[colorName] = totalForColor;
    });

    const normalizedMaterials: Array<{ type: string; panel_type: string; consumption: number; quantity: number; measurement_scale: 'KG' | 'M'; color_name: string }> = [];
    materialRows.forEach(row => {
      const type = row.type.trim();
      const panelType = row.panel_type.trim();
      if (!type || !panelType) return;
      availableItemColors.forEach(colorName => {
        const consumption = Number(row.consumptions[colorName]) || 0;
        const quantity = consumption * Number(colorTotals[colorName] || 0);
        if (consumption > 0) {
          normalizedMaterials.push({
            type,
            panel_type: panelType,
            consumption,
            quantity,
            measurement_scale: row.measurement_scale,
            color_name: colorName
          });
        }
      });
    });

    try {
      setAddLoading(true);
      // Build FormData for multipart/form-data
      const formData = new FormData();
      formData.append('job_order_number', newJobOrder.job_order_number);
      formData.append('model_name', newJobOrder.model_name);
      formData.append('client_name', newJobOrder.client_name);
      formData.append('items', JSON.stringify(generatedItems));
      formData.append('materials', JSON.stringify(normalizedMaterials));
      formData.append('notes', jobOrderNotes);
      if (newJobOrderImage) {
        formData.append('image', newJobOrderImage);
      }
      if (enablePrintDetails) {
        const placementLabels = printPlacements.reduce<Record<string, string>>((acc, placement) => {
          acc[placement.key] = placement.label;
          return acc;
        }, {});
        const colorBreakdown: Record<string, Record<string, string>> = {};
        tableColors.forEach((colorValue, rowIndex) => {
          const colorName = colorValue.trim();
          if (!colorName) return;
          const rowKey = colorRowKeys[rowIndex];
          if (!rowKey) return;
          const rowEntries = colorPrintDetails[rowKey];
          if (!rowEntries) return;
          const cleaned: Record<string, string> = {};
          Object.entries(rowEntries).forEach(([placementKey, placementValue]) => {
            if (!placementValue || !placementValue.trim()) return;
            cleaned[placementKey] = placementValue.trim();
          });
          if (Object.keys(cleaned).length > 0) {
            colorBreakdown[colorName] = cleaned;
          }
        });
        if (Object.keys(colorBreakdown).length > 0) {
          const printPayload: Record<string, any> = {
            type: printType,
            fields: {},
            placement_labels: placementLabels,
            color_breakdown: colorBreakdown
          };
          formData.append('prints', JSON.stringify(printPayload));
        }
      }
      if (isEditMode) {
        const unknownCombinations = generatedItems.filter(
          item => !itemIdByColorSize[`${item.color_name}::${item.size_value}`]
        );
        if (unknownCombinations.length > 0) {
          toast({
            title: t('common.error'),
            description: t('addJobOrder.editingCombinationsNotSupported'),
            variant: 'destructive'
          });
          setAddLoading(false);
          return;
        }

        const updatePayload: any = {
          items: generatedItems.map(item => ({
            item_id: itemIdByColorSize[`${item.color_name}::${item.size_value}`],
            quantity: item.quantity
          })),
          notes: jobOrderNotes,
          materials: normalizedMaterials,
          print_config: null
        };

        if (enablePrintDetails) {
          const placementLabels = printPlacements.reduce<Record<string, string>>((acc, placement) => {
            acc[placement.key] = placement.label;
            return acc;
          }, {});
          const colorBreakdown: Record<string, Record<string, string>> = {};
          tableColors.forEach((colorValue, rowIndex) => {
            const colorName = colorValue.trim();
            if (!colorName) return;
            const rowKey = colorRowKeys[rowIndex];
            const rowEntries = rowKey ? colorPrintDetails[rowKey] : undefined;
            if (!rowEntries) return;
            const cleaned: Record<string, string> = {};
            Object.entries(rowEntries).forEach(([placementKey, placementValue]) => {
              if (!placementValue || !placementValue.trim()) return;
              cleaned[placementKey] = placementValue.trim();
            });
            if (Object.keys(cleaned).length > 0) colorBreakdown[colorName] = cleaned;
          });
          updatePayload.print_config = {
            type: printType,
            fields: {},
            placement_labels: placementLabels,
            color_breakdown: colorBreakdown
          };
        }

        await jobOrderApi.update(editJobOrderId, updatePayload);
      } else {
        await api.post('/job-orders/with-names/', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      }
      
      toast({
        title: t('common.success'),
        description: isEditMode ? t('jobOrders.jobOrderUpdated') : t('jobOrders.jobOrderCreated'),
      });
      
      navigate(isEditMode ? `/job-orders/${editJobOrderId}` : '/job-orders');
    } catch (error: any) {
      let errorMsg = error?.response?.data?.detail || error.message || (isEditMode ? t('jobOrders.failedToUpdate') : t('jobOrders.failedToCreate'));
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
      }
      toast({
        title: t('common.error'),
        description: errorMsg,
        variant: 'destructive'
      });
    } finally {
      setAddLoading(false);
    }
  };

  const handleCancelAddJobOrder = () => {
    navigate('/job-orders');
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Button
              variant="outline"
              onClick={handleCancelAddJobOrder}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('addJobOrder.backToJobOrders')}
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{isEditMode ? t('jobOrders.editJobOrder') : t('jobOrders.addNewJobOrder')}</h1>
          <p className="text-gray-600 mt-2">
            {isEditMode
              ? t('addJobOrder.editSubtitle')
              : t('addJobOrder.createSubtitle')}
          </p>
        </div>

        {/* Main Form */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <div className="space-y-8">
            {/* Job Order Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="job-order-number">{t('jobOrders.jobOrderNumber')} *</Label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    id="job-order-number"
                    className="flex-1"
                    value={newJobOrder.job_order_number}
                    onChange={(e) => {
                      if (autoGenerateJobOrderNumber) return;
                      setNewJobOrder(prev => ({ ...prev, job_order_number: e.target.value }));
                    }}
                    placeholder={autoJobOrderNumber || t('jobOrders.jobOrderNumber')}
                    disabled={isEditMode || autoGenerateJobOrderNumber || addLoading}
                    readOnly={isEditMode || autoGenerateJobOrderNumber}
                  />
                  {!isEditMode && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const nextAutoState = !autoGenerateJobOrderNumber;
                        setAutoGenerateJobOrderNumber(nextAutoState);
                        if (nextAutoState && autoJobOrderNumber) {
                          setNewJobOrder(prev => ({ ...prev, job_order_number: autoJobOrderNumber }));
                        }
                        if (!nextAutoState) {
                          setNewJobOrder(prev => ({ ...prev, job_order_number: '' }));
                        }
                      }}
                      disabled={addLoading}
                    >
                      {autoGenerateJobOrderNumber ? t('addJobOrder.disableAuto') : t('addJobOrder.autoGenerate')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-name">{t('jobOrders.clientName')} *</Label>
                <EditableDropdown
                  value={newJobOrder.client_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, client_name: value }))}
                  options={existingClients}
                  placeholder={t('jobOrders.clientName')}
                  disabled={isEditMode || addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model-name">{t('jobOrders.modelName')} *</Label>
                <EditableDropdown
                  value={newJobOrder.model_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, model_name: value }))}
                  options={existingModels}
                  placeholder={t('jobOrders.modelName')}
                  disabled={isEditMode || addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-order-image">{t('jobOrders.jobOrderImageOptional')}</Label>
                <Input
                  id="job-order-image"
                  type="file"
                  accept="image/*"
                  onChange={e => {
                    const file = e.target.files?.[0] || null;
                    setNewJobOrderImage(file);
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = ev => setNewJobOrderImagePreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                    } else {
                      setNewJobOrderImagePreview(null);
                    }
                  }}
                  disabled={addLoading}
                />
                {newJobOrderImagePreview && (
                  <img src={newJobOrderImagePreview} alt={t('addJobOrder.imagePreviewAlt')} className="mt-2 max-h-40 rounded shadow" />
                )}
              </div>
            </div>

            {/* Job Order Items */}
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-muted/40 via-background to-background p-5 shadow-sm ring-1 ring-black/5 dark:ring-white/10 sm:p-6">
                <h3 className="mb-5 text-center text-lg font-semibold tracking-tight text-foreground">
                  {t('jobOrders.jobOrderItems')}
                </h3>

                <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-center lg:gap-8">
                  <div className="flex w-full max-w-lg flex-col items-center gap-3">
                    <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t('addJobOrder.quickAddSizes')}
                    </p>
                    <p
                      id="size-range-hint"
                      className="max-w-md text-center text-xs leading-relaxed text-muted-foreground"
                    >
                      {t('addJobOrder.sizeRangeHint', {
                        min: SIZE_ORDER_BOUNDS.numeric_start,
                        max: SIZE_ORDER_BOUNDS.numeric_end,
                        examples: SIZE_ORDER_BOUNDS.letterExamples
                      })}
                    </p>
                    <div
                      className="flex w-full flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center"
                      dir="ltr"
                    >
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-border/70 bg-background/90 px-3 py-2 shadow-inner">
                        <Label htmlFor="size-range-from" className="sr-only">
                          {t('addJobOrder.sizeRangeFrom')}
                        </Label>
                        <Input
                          id="size-range-from"
                          type="text"
                          autoComplete="off"
                          placeholder={t('addJobOrder.sizeRangePlaceholderFrom')}
                          value={sizeRangeFrom}
                          onChange={e => setSizeRangeFrom(e.target.value)}
                          disabled={isEditMode || addLoading}
                          aria-describedby="size-range-hint"
                          className="h-10 min-w-[5rem] max-w-[6rem] border-0 bg-transparent text-center text-sm font-medium tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <span className="shrink-0 text-xs font-medium text-muted-foreground" aria-hidden>
                          —
                        </span>
                        <Label htmlFor="size-range-to" className="sr-only">
                          {t('addJobOrder.sizeRangeTo')}
                        </Label>
                        <Input
                          id="size-range-to"
                          type="text"
                          autoComplete="off"
                          placeholder={t('addJobOrder.sizeRangePlaceholderTo')}
                          value={sizeRangeTo}
                          onChange={e => setSizeRangeTo(e.target.value)}
                          disabled={isEditMode || addLoading}
                          aria-describedby="size-range-hint"
                          className="h-10 min-w-[5rem] max-w-[6rem] border-0 bg-transparent text-center text-sm font-medium tabular-nums shadow-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={handleAddSizeRange}
                        disabled={isEditMode || addLoading}
                        className="h-10 min-w-[9rem] gap-2 rounded-xl font-medium shadow-sm"
                        variant="default"
                      >
                        <ListOrdered className="h-4 w-4 opacity-90" aria-hidden />
                        {t('addJobOrder.addSizeRange')}
                      </Button>
                    </div>
                  </div>

                  <div className="h-px w-full max-w-xs shrink-0 bg-border/70 lg:hidden" aria-hidden />
                  <div className="hidden w-px shrink-0 self-stretch bg-border/60 lg:block" aria-hidden />

                  <div className="flex w-full flex-wrap items-center justify-center gap-2 sm:gap-3">
                    <Button
                      type="button"
                      onClick={handleAddColorRow}
                      disabled={isEditMode || addLoading}
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl border-border/80 px-4 shadow-sm"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> {t('jobOrders.addColorRow')}
                    </Button>
                    <Button
                      type="button"
                      onClick={handleAddSizeColumn}
                      disabled={isEditMode || addLoading}
                      variant="outline"
                      size="sm"
                      className="h-10 rounded-xl border-border/80 px-4 shadow-sm"
                    >
                      <Plus className="mr-1.5 h-4 w-4" /> {t('jobOrders.addSizeColumn')}
                    </Button>
                    <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-background px-2 py-1 shadow-sm">
                      <Input
                        type="number"
                        step="0.01"
                        value={tablePercentageDelta}
                        onChange={e => setTablePercentageDelta(e.target.value)}
                        placeholder={t('addJobOrder.percentagePlaceholder')}
                        disabled={addLoading}
                        className="h-8 w-24 border-0 bg-transparent px-1 text-center shadow-none focus-visible:ring-1"
                      />
                      <Button
                        type="button"
                        onClick={handleApplyPercentageToTable}
                        disabled={addLoading || tablePercentageDelta.trim() === ''}
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-3"
                      >
                        {t('addJobOrder.addPercentage')}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="min-h-[30vh] max-h-[50vh] overflow-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border p-2 text-left min-w-[8rem]">{t('jobOrders.colorSize')}</th>
                      {tableSizes.map((size, colIndex) => (
                        <th key={colIndex} className="border p-2 min-w-[6rem]">
                          <div className="flex items-center">
                        <EditableDropdown
                              value={size}
                              onValueChange={(value) => handleUpdateSize(colIndex, value)}
                              options={existingSizes}
                          disabled={isEditMode || addLoading}
                        />
                            {tableSizes.length > 1 && (
                              <button type="button" onClick={() => handleRemoveSizeColumn(colIndex)} disabled={isEditMode || addLoading}>
                                <X className="w-3 h-3 ml-1 text-red-600" />
                              </button>
                            )}
                      </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableColors.map((color, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border p-2 min-w-[8rem]">
                          <div className="flex items-center">
                        <EditableDropdown
                              value={color}
                              onValueChange={(value) => handleUpdateColor(rowIndex, value)}
                              options={existingColors}
                          disabled={isEditMode || addLoading}
                        />
                            {tableColors.length > 1 && (
                              <button type="button" onClick={() => handleRemoveColorRow(rowIndex)} disabled={isEditMode || addLoading}>
                                <X className="w-3 h-3 ml-1 text-red-600" />
                              </button>
                            )}
                      </div>
                        </td>
                        {tableSizes.map((_, colIndex) => (
                          <td key={colIndex} className="border p-1 min-w-[6rem]">
                        <Input
                          type="number"
                              min="0"
                              value={tableQuantities[rowIndex]?.[colIndex] ?? 0}
                              onChange={(e) => handleQuantityTableChange(rowIndex, colIndex, parseInt(e.target.value) || 0)}
                          disabled={addLoading}
                              className="w-24"
                        />
                          </td>
                ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Material Consumption */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">{t('addJobOrder.materialConsumptionTitle')}</h3>
                  <p className="text-sm text-gray-500">
                    {t('addJobOrder.materialConsumptionDescription')}
                  </p>
                </div>
                <Button type="button" onClick={handleAddMaterialRow} disabled={addLoading} variant="outline" size="sm">
                  <Plus className="w-4 h-4 mr-1" /> {t('addJobOrder.addMaterialRow')}
                </Button>
              </div>
              <div className="overflow-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border p-2 text-left min-w-[10rem]">{t('common.type')}</th>
                      <th className="border p-2 text-left min-w-[10rem]">{t('jobOrderDetails.panelType')}</th>
                      <th className="border p-2 text-left min-w-[7rem]">{t('addJobOrder.scale')}</th>
                      <th className="border p-2 text-left min-w-[12rem]">{t('addJobOrder.applyToAllColors')}</th>
                      {availableItemColors.map(colorName => (
                        <th key={colorName} className="border p-2 text-left min-w-[8rem]">
                          {colorName}
                        </th>
                      ))}
                      <th className="border p-2 w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {materialRows.map((row, rowIndex) => (
                      <tr key={row.key} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border p-2">
                          <EditableDropdown
                            value={row.type}
                            onValueChange={value => handleMaterialRowChange(rowIndex, 'type', value)}
                            options={existingMaterials}
                            placeholder={t('addJobOrder.materialTypePlaceholder')}
                            disabled={addLoading}
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            value={row.panel_type}
                            onChange={e => handleMaterialRowChange(rowIndex, 'panel_type', e.target.value)}
                            placeholder={t('addJobOrder.panelTypePlaceholder')}
                            disabled={addLoading}
                          />
                        </td>
                        <td className="border p-2">
                          <select
                            value={row.measurement_scale}
                            onChange={e => handleMaterialRowChange(rowIndex, 'measurement_scale', e.target.value as 'KG' | 'M')}
                            disabled={addLoading}
                            className="w-full border rounded px-2 py-1"
                          >
                            <option value="KG">KG</option>
                            <option value="M">M</option>
                          </select>
                        </td>
                        <td className="border p-2">
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.apply_all_value}
                              onChange={e =>
                                handleMaterialRowChange(
                                  rowIndex,
                                  'apply_all_value',
                                  Number.parseFloat(e.target.value) || 0
                                )
                              }
                              disabled={addLoading || availableItemColors.length === 0}
                              className="w-24"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleApplyMaterialConsumptionToAllColors(rowIndex)}
                              disabled={addLoading || availableItemColors.length === 0}
                            >
                              {t('addJobOrder.apply')}
                            </Button>
                          </div>
                        </td>
                        {availableItemColors.map(colorName => (
                          <td key={`${row.key}-${colorName}`} className="border p-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.001"
                              value={row.consumptions[colorName] ?? 0}
                              onChange={e =>
                                handleMaterialConsumptionByColorChange(
                                  rowIndex,
                                  colorName,
                                  Number.parseFloat(e.target.value) || 0
                                )
                              }
                              disabled={addLoading}
                            />
                          </td>
                        ))}
                        <td className="border p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveMaterialRow(rowIndex)}
                            disabled={addLoading}
                          >
                            <X className="w-3 h-3 text-red-600" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {materialRows.length === 0 && (
                      <tr>
                        <td colSpan={Math.max(4, availableItemColors.length + 4)} className="border p-4 text-center text-gray-500">
                          {t('addJobOrder.noMaterialRows')}
                        </td>
                      </tr>
                    )}
                    {materialRows.length > 0 && availableItemColors.length === 0 && (
                      <tr>
                        <td colSpan={5} className="border p-4 text-center text-gray-500">
                          {t('addJobOrder.addItemColorsFirst')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Print Details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">{t('addJobOrder.printingEmbroideryDetails')}</h3>
                  <p className="text-sm text-gray-500">{t('addJobOrder.printingEmbroideryDescription')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (enablePrintDetails) {
                      setEnablePrintDetails(false);
                      setColorPrintDetails({});
                      setSelectedPrintRows({});
                      setBulkColorValue('');
                    } else {
                      setEnablePrintDetails(true);
                    }
                  }}
                  disabled={addLoading}
                >
                  {enablePrintDetails ? t('addJobOrder.removeDetails') : t('addJobOrder.addDetails')}
                </Button>
              </div>

              {enablePrintDetails && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="print-type">{t('addJobOrder.technique')}</Label>
                      <select
                        id="print-type"
                        value={printType}
                        onChange={e => setPrintType(e.target.value as 'Printing' | 'Embroidery')}
                        disabled={addLoading}
                        className="mt-1 w-full border rounded-md px-3 py-2"
                      >
                        <option value="Printing">{t('jobOrderDetails.techniquePrinting')}</option>
                        <option value="Embroidery">{t('jobOrderDetails.techniqueEmbroidery')}</option>
                      </select>
                    </div>
                    <div>
                      <Label>{t('addJobOrder.quickApply')}</Label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        <select
                          value={bulkPlacementKey}
                          onChange={e => setBulkPlacementKey(e.target.value)}
                          disabled={addLoading || printPlacements.length === 0}
                          className="border rounded-md px-3 py-2 min-w-[10rem]"
                        >
                          {printPlacements.map(placement => (
                            <option key={placement.key} value={placement.key}>
                              {placement.label}
                            </option>
                          ))}
                        </select>
                        <EditableDropdown
                          value={bulkColorValue}
                          onValueChange={setBulkColorValue}
                          options={printColorSuggestions}
                          placeholder={t('addJobOrder.printColorPlaceholder')}
                          disabled={addLoading}
                          className="min-w-[10rem]"
                          showAddNewOption={false}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBulkApplyPrintColor}
                          disabled={addLoading || !bulkPlacementKey || !bulkColorValue.trim()}
                        >
                          {selectedRowCount > 0
                            ? t('addJobOrder.applyToSelectedColors', { count: selectedRowCount })
                            : t('addJobOrder.applyToAllColors')}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{t('addJobOrder.selectRowsHint')}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Label>{t('addJobOrder.placementFields')}</Label>
                      <p className="text-xs text-gray-500">{t('addJobOrder.placementFieldsDescription')}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePlacementAdd}
                        disabled={addLoading}
                      >
                        <Plus className="w-4 h-4 mr-1" /> {t('addJobOrder.addField')}
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="border p-2 w-12 text-center">
                            <Checkbox
                              checked={allPrintRowsSelected}
                              onCheckedChange={checked => handleToggleAllPrintRows(Boolean(checked))}
                              disabled={addLoading || tableColors.length === 0}
                            />
                          </th>
                          <th className="border p-2 text-left min-w-[8rem]">{t('barcode.color')}</th>
                          {printPlacements.map(placement => (
                            <th key={placement.key} className="border p-2 min-w-[10rem]">
                              <div className="flex items-center justify-between gap-2">
                                <span>{placement.label}</span>
                                {printPlacements.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => handlePlacementRemove(placement.key)}
                                    disabled={addLoading}
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
                        {tableColors.map((color, rowIndex) => {
                          const rowKey = colorRowKeys[rowIndex];
                          const rowSelected = Boolean(selectedPrintRows[rowKey]);
                          return (
                            <tr key={rowKey} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                              <td className="border p-2 text-center align-top">
                                <Checkbox
                                  checked={rowSelected}
                                  onCheckedChange={checked => handleTogglePrintRow(rowKey, Boolean(checked))}
                                  disabled={addLoading}
                                />
                              </td>
                              <td className="border p-2 align-top">
                                {color.trim() || <span className="text-gray-400">{t('addJobOrder.setColorAbove')}</span>}
                              </td>
                              {printPlacements.map(placement => (
                                <td key={placement.key} className="border p-2">
                                  <EditableDropdown
                                    value={colorPrintDetails[rowKey]?.[placement.key] || ''}
                                    onValueChange={value => handleColorPrintChange(rowKey, placement.key, value)}
                                    options={printColorSuggestions}
                                    placeholder={t('addJobOrder.printColorPlaceholder')}
                                    disabled={addLoading || !color.trim()}
                                    showAddNewOption={false}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {tableColors.length === 0 && (
                          <tr>
                            <td colSpan={printPlacements.length + 2} className="border p-4 text-center text-gray-500">
                              {t('addJobOrder.addGarmentColorsHint')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Job Order Notes */}
            <div className="mt-4">
              <Label htmlFor="order-notes">{t('jobOrderDetails.notes')}</Label>
              <Textarea
                id="order-notes"
                value={jobOrderNotes}
                onChange={e => setJobOrderNotes(e.target.value)}
                placeholder={t('addJobOrder.notesPlaceholder')}
                disabled={addLoading}
                rows={3}
              />
            </div>

            {/* Total Quantity */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium text-lg">{t('jobOrders.totalQuantityLabel')}</span>
                <span className="font-bold text-xl text-green-600">
                  {totalTableQuantity.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-end gap-4 mt-8 pt-6 border-t">
            <Button
              onClick={handleCancelAddJobOrder}
              disabled={addLoading}
              variant="outline"
              className="px-6"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveNewJobOrder}
              disabled={addLoading}
              className="!bg-green-600 !hover:bg-green-700 !text-white font-bold shadow border border-green-700 px-6"
            >
              {addLoading ? t('jobOrders.creating') : (isEditMode ? t('jobOrderDetails.saveChanges') : t('jobOrders.createJobOrder'))}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddJobOrderPage;
