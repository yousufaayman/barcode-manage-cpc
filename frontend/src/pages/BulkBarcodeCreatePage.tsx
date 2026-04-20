import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import apiInstance, { jobOrderApi, batchApi, cutsApi, barcodeApi, productionApi, ReworkBatchResponse, BarcodeData } from '../services/api';
import { useTranslation } from 'react-i18next';
import SearchableDropdown from '../components/SearchableDropdown';
import { Button } from "@/components/ui/button";
import { zebraPrinterService, BarcodePrintData } from '../services/zebraPrinterService';
import { sortSizes, getSizeSortKey } from '../utils/sizeSort';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { AlertTriangle } from "lucide-react";

interface Cut {
  cut_number: string;
  cut_id: number;
  color: string;
  color_id: number;
}

interface GeneratedBatch {
  batch: number;
  size: string;
  quantity: number;
  barcode: string;
  size_id?: number;
  serial_number?: number;
  layers?: number;
}

type GenerationMode = 'auto' | 'manual';

const BulkBarcodeCreatePage: React.FC = () => {
  const { t } = useTranslation();
  const [jobOrders, setJobOrders] = useState<{ job_order_id: number; job_order_number: string; model_name: string | null; client_name: string | null }[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
  const [selectedJobOrder, setSelectedJobOrder] = useState<{ job_order_id: number; job_order_number: string; model_name: string | null; client_name: string | null } | null>(null);
  const [cuts, setCuts] = useState<Cut[]>([]);
  const [selectedCutNumber, setSelectedCutNumber] = useState<string>('');
  const [selectedCutId, setSelectedCutId] = useState<number | null>(null);
  const [cutSizes, setCutSizes] = useState<string[]>([]);
  const [generatedBatches, setGeneratedBatches] = useState<GeneratedBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>('');
  const [submitResult, setSubmitResult] = useState<{created: number, duplicates: number, message?: string} | null>(null);
  const [mode, setMode] = useState<GenerationMode>('auto');
  const [quantityPerBatch, setQuantityPerBatch] = useState<Record<string, number>>({});
  const [extraPiecesThreshold, setExtraPiecesThreshold] = useState<number>(5);
  const [maxBatchSize, setMaxBatchSize] = useState<number | undefined>(undefined);
  const [jobOrderItems, setJobOrderItems] = useState<{item_id: number; color_id: number; color_name: string; size_id: number; size_value: string; quantity: number}[]>([]);
  const [secondDegreeCounts, setSecondDegreeCounts] = useState<Record<number, number>>({});
  const [isCreatingSecondDegree, setIsCreatingSecondDegree] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [allPrinters, setAllPrinters] = useState<{name: string, type: 'server' | 'zebra'}[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [isPrinting, setIsPrinting] = useState(false);
  const [submittedBatches, setSubmittedBatches] = useState<any[]>([]);
  const [compensationData, setCompensationData] = useState<Record<string, {phase_id: number; quantity: number}>>({});
  const [isCreatingCompensation, setIsCreatingCompensation] = useState(false);
  const [availablePhases, setAvailablePhases] = useState<{phase_id: number; phase_name: string}[]>([]);
  const [reworkBatches, setReworkBatches] = useState<ReworkBatchResponse[]>([]);
  const [reworkBatchDetails, setReworkBatchDetails] = useState<Record<number, BarcodeData>>({});
  const [isLoadingReworkBatches, setIsLoadingReworkBatches] = useState(false);
  const [isPrintingRework, setIsPrintingRework] = useState(false);
  const [printingReworkId, setPrintingReworkId] = useState<number | null>(null);
  const [reworkPrintedFilter, setReworkPrintedFilter] = useState<'all' | 'printed' | 'not-printed'>('all');

  const uniqueColorSizeCombinations = useMemo(() => {
    const comboMap = new Map<string, {color_id: number; color_name: string; size_id: number; size_value: string; item_id: number}>();
    jobOrderItems.forEach(item => {
      const key = `${item.color_id}-${item.size_id}`;
      if (!comboMap.has(key)) {
        comboMap.set(key, {
          color_id: item.color_id,
          color_name: item.color_name,
          size_id: item.size_id,
          size_value: item.size_value,
          item_id: item.item_id
        });
      }
    });
    const combinations = Array.from(comboMap.values());
    return sortSizes(combinations).sort((a, b) => {
      const colorCompare = a.color_name.localeCompare(b.color_name);
      if (colorCompare !== 0) return colorCompare;
      return 0;
    });
  }, [jobOrderItems]);

  const sortedSecondDegreeItems = useMemo(() => {
    return [...jobOrderItems].sort((a, b) => {
      const colorCompare = a.color_name.localeCompare(b.color_name);
      if (colorCompare !== 0) return colorCompare;

      const aSizeKey = getSizeSortKey(a.size_value);
      const bSizeKey = getSizeSortKey(b.size_value);

      if (aSizeKey[0] !== bSizeKey[0]) return aSizeKey[0] - bSizeKey[0];
      if (aSizeKey[1] !== bSizeKey[1]) return aSizeKey[1] - bSizeKey[1];
      return aSizeKey[2].localeCompare(bSizeKey[2]);
    });
  }, [jobOrderItems]);

  const compensationPhases = useMemo(
    () => availablePhases.filter((phase) => phase.phase_name.trim().toLowerCase() !== 'sewing'),
    [availablePhases]
  );

  const sortedJobOrderItems = useMemo(() => {
    return [...jobOrderItems].sort((a, b) => {
      const colorCompare = a.color_name.localeCompare(b.color_name);
      if (colorCompare !== 0) return colorCompare;
      const aSizeKey = getSizeSortKey(a.size_value);
      const bSizeKey = getSizeSortKey(b.size_value);
      if (aSizeKey[0] !== bSizeKey[0]) return aSizeKey[0] - bSizeKey[0];
      if (aSizeKey[1] !== bSizeKey[1]) return aSizeKey[1] - bSizeKey[1];
      return aSizeKey[2].localeCompare(bSizeKey[2]);
    });
  }, [jobOrderItems]);

  const groupedReworkBatches = useMemo(() => {
    const phaseMap = new Map<string, Map<string, Map<string, Map<string, ReworkBatchResponse[]>>>>();

    reworkBatches.forEach((rb) => {
      const details = reworkBatchDetails[rb.batch_id];
      const colorName =
        details?.color_name ||
        (details?.color_id != null ? `Color #${details.color_id}` : t('common.unknown', 'Unknown'));
      const stageName = (rb.problem_stage_name || '').trim() || t('batchGeneration.unknownStage', 'Unknown stage');
      const sizeValue = details?.size_value || (details?.size_id != null ? `Size #${details.size_id}` : t('common.unknown', 'Unknown'));

      const phaseId = rb.responsible_phase_id ?? null;
      const phaseLabel =
        phaseId != null
          ? availablePhases.find((p) => p.phase_id === phaseId)?.phase_name || `Phase #${phaseId}`
          : t('common.unknown', 'Unknown');

      if (!phaseMap.has(phaseLabel)) phaseMap.set(phaseLabel, new Map());
      const colorMap = phaseMap.get(phaseLabel)!;
      if (!colorMap.has(colorName)) colorMap.set(colorName, new Map());
      const stageMap = colorMap.get(colorName)!;
      if (!stageMap.has(stageName)) stageMap.set(stageName, new Map());
      const sizeMap = stageMap.get(stageName)!;
      if (!sizeMap.has(sizeValue)) sizeMap.set(sizeValue, []);
      sizeMap.get(sizeValue)!.push(rb);
    });

    return Array.from(phaseMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([phaseName, colorMap]) => ({
        phaseName,
        colors: Array.from(colorMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([colorName, stageMap]) => ({
            colorName,
            stages: Array.from(stageMap.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([stageName, sizeMap]) => ({
                stageName,
                sizes: Array.from(sizeMap.entries())
                  .sort((a, b) => {
                    const aKey = getSizeSortKey(a[0]);
                    const bKey = getSizeSortKey(b[0]);
                    if (aKey[0] !== bKey[0]) return aKey[0] - bKey[0];
                    if (aKey[1] !== bKey[1]) return aKey[1] - bKey[1];
                    return aKey[2].localeCompare(bKey[2]);
                  })
                  .map(([sizeValue, batches]) => ({
                    sizeValue,
                    batches: [...batches].sort((a, b) => b.rework_batch_id - a.rework_batch_id),
                  })),
              })),
          })),
      }));
  }, [reworkBatches, reworkBatchDetails, t, availablePhases]);

  useEffect(() => {
    jobOrderApi.getAllSimple().then(setJobOrders);
    barcodeApi.getPhases().then(phases => {
      const sortedPhases = [...phases].sort((a, b) => {
        const orderA = a.sequence_order ?? 999;
        const orderB = b.sequence_order ?? 999;
        return orderA - orderB;
      });
      setAvailablePhases(sortedPhases);
    });
    
    const fetchAllPrinters = async () => {
      try {
        let zebraPrintersList: string[] = [];
        let serverPrinters: string[] = [];
        
        try {
          const printersResponse = await apiInstance.get('/barcodes/printers');
          serverPrinters = Array.isArray(printersResponse.data) ? printersResponse.data : (printersResponse.data?.printers || []);
        } catch (error) {
          console.log('Server printers not available:', error);
        }
        
        try {
          const isZebraAvailable = await zebraPrinterService.checkServiceAvailability();
          if (isZebraAvailable) {
            const zebraPrintersData = await zebraPrinterService.getAvailablePrinters();
            zebraPrintersList = zebraPrintersData.map(p => p.name);
          }
        } catch (error) {
          console.log('Zebra printers not available:', error);
        }
        
        const combinedPrinters = [
          ...zebraPrintersList.map(name => ({ name, type: 'zebra' as const })),
          ...serverPrinters.map(name => ({ name, type: 'server' as const }))
        ];
        
        setAllPrinters(combinedPrinters);
        
        if (zebraPrintersList.length > 0) {
          setSelectedPrinter(zebraPrintersList[0]);
        } else if (serverPrinters.length > 0) {
          setSelectedPrinter(serverPrinters[0]);
        }
      } catch (err) {
        console.error('Error fetching printers:', err);
      }
    };

    fetchAllPrinters();
  }, []);

  useEffect(() => {
    if (selectedJobOrderId !== null) {
      const found = jobOrders.find(j => j.job_order_id === selectedJobOrderId) || null;
      setSelectedJobOrder(found);
      setCuts([]);
      setSelectedCutNumber('');
      setSelectedCutId(null);
      setCutSizes([]);
      setGeneratedBatches([]);
      setError('');
      setQuantityPerBatch({});
      setSecondDegreeCounts({});
      setSelectedSizes(new Set());
      setSubmittedBatches([]);
      setSubmitResult(null);
      setCompensationData({});
      setReworkBatches([]);
      
      if (found) {
        jobOrderApi.getCuts(selectedJobOrderId)
          .then(cutsData => {
            setCuts(cutsData);
            // Clear error if cuts loaded successfully (even if empty)
            if (Array.isArray(cutsData)) {
              setError('');
            }
          })
          .catch(err => {
            // Only set error for actual API errors, not empty results
            setError(err.response?.data?.detail || 'Failed to load cuts');
            setCuts([]);
          });
        
        jobOrderApi.getById(selectedJobOrderId)
          .then(jobOrder => {
            const items = jobOrder.items.map(item => ({
              item_id: item.item_id,
              color_id: item.color_id,
              color_name: item.color_name || '',
              size_id: item.size_id,
              size_value: item.size_value || '',
              quantity: item.quantity
            }));
            setJobOrderItems(items);
          })
          .catch(err => {
            setError(err.response?.data?.detail || 'Failed to load job order items');
            setJobOrderItems([]);
          });
      }
    } else {
      setSelectedJobOrder(null);
      setCuts([]);
      setSelectedCutNumber('');
      setSelectedCutId(null);
      setCutSizes([]);
      setGeneratedBatches([]);
      setQuantityPerBatch({});
      setJobOrderItems([]);
      setSecondDegreeCounts({});
      setCompensationData({});
      setReworkBatches([]);
    }
  }, [selectedJobOrderId, jobOrders]);

  useEffect(() => {
    if (!selectedJobOrderId) {
      setReworkBatches([]);
      setReworkBatchDetails({});
      return;
    }

    const fetchReworkBatches = async () => {
      try {
        setIsLoadingReworkBatches(true);
        const printedParam =
          reworkPrintedFilter === 'all' ? undefined : reworkPrintedFilter === 'printed';
        const rows = await productionApi.getReworkBatches(
          printedParam == null ? undefined : { printed: printedParam }
        );
        const filtered = rows.filter((row) => row.job_order_id === selectedJobOrderId);
        setReworkBatches(filtered);

        const uniqueBatchIds = Array.from(new Set(filtered.map((r) => r.batch_id)));
        const results = await Promise.allSettled(uniqueBatchIds.map((id) => barcodeApi.getBatchById(id)));
        const detailsMap: Record<number, BarcodeData> = {};
        results.forEach((res, idx) => {
          if (res.status === 'fulfilled') {
            detailsMap[uniqueBatchIds[idx]] = res.value;
          }
        });
        setReworkBatchDetails(detailsMap);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'Failed to load rework batches');
      } finally {
        setIsLoadingReworkBatches(false);
      }
    };

    fetchReworkBatches();
  }, [selectedJobOrderId, reworkPrintedFilter]);

  const buildReworkPrintPayload = async (reworkBatch: ReworkBatchResponse) => {
    const batchDetails = await barcodeApi.getBatchById(reworkBatch.batch_id);
    const phaseName =
      (reworkBatch.responsible_phase_id != null
        ? availablePhases.find((p) => p.phase_id === reworkBatch.responsible_phase_id)?.phase_name
        : null) ||
      (batchDetails.phase_name || '');
    return {
      rework_batch_id: reworkBatch.rework_batch_id,
      barcode: batchDetails.barcode,
      client_name: batchDetails.client_name || '',
      model: batchDetails.model_name || '',
      size: batchDetails.size_value || '',
      color: batchDetails.color_name || '',
      quantity: batchDetails.quantity || 0,
      layers: batchDetails.layers || 1,
      serial: batchDetails.serial || '',
      job_order_number: selectedJobOrder?.job_order_number || '',
      is_second_degree: Boolean(batchDetails.is_second_degree),
      phase_name: phaseName,
      stage_name: (reworkBatch.problem_stage_name || '').trim(),
      is_rework: true,
    };
  };

  const printReworkBatches = async (rows: ReworkBatchResponse[]) => {
    if (!selectedPrinter) {
      setError(t('batchGeneration.selectPrinterMessage', 'Please select a printer'));
      return;
    }
    if (rows.length === 0) {
      return;
    }

    try {
      setIsPrintingRework(true);
      setError('');
      const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
      const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';

      for (const row of rows) {
        const payload = await buildReworkPrintPayload(row);
        if (isZebraPrinter) {
          await zebraPrinterService.printMultipleBarcodes(
            [{
              barcode: payload.barcode,
              brand: payload.client_name,
              model: payload.model,
              size: payload.size,
              color: payload.color,
              quantity: payload.quantity,
              layers: payload.layers,
              serial: payload.serial,
              job_order_number: payload.job_order_number,
              is_second_degree: payload.is_second_degree,
              is_rework: true,
              phase_name: payload.phase_name || '',
              stage_name: payload.stage_name || '',
            }],
            selectedPrinter,
            1
          );
        } else {
          await barcodeApi.printBarcodes([payload], 1, selectedPrinter);
        }
        await productionApi.updateReworkBatch(row.rework_batch_id, { printed: true });
      }

      setReworkBatches((prev) =>
        prev.map((batch) =>
          rows.some((row) => row.rework_batch_id === batch.rework_batch_id)
            ? { ...batch, printed: true }
            : batch
        )
      );
      alert(
        t('batchGeneration.printSuccess', { count: rows.length, printer: selectedPrinter })
          .replace('{count}', String(rows.length))
          .replace('{printer}', selectedPrinter)
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to print rework batches');
    } finally {
      setIsPrintingRework(false);
      setPrintingReworkId(null);
    }
  };

  useEffect(() => {
    if (selectedCutId) {
      cutsApi.getCutById(selectedCutId)
        .then(cut => {
          const sizes = cut.sizes?.map((s: any) => s.size_value) || [];
          setCutSizes(sizes);
          setSelectedSizes(new Set(sizes));
          
          const initialQuantities: Record<string, number> = {};
          sizes.forEach((size: string) => {
            initialQuantities[size] = quantityPerBatch[size] || 0;
          });
          setQuantityPerBatch(initialQuantities);
        })
        .catch(err => {
          setError(err.response?.data?.detail || 'Failed to load cut details');
          setCutSizes([]);
        });
    } else {
      setCutSizes([]);
      setQuantityPerBatch({});
    }
  }, [selectedCutId]);

  const handleCutSelection = (cutDisplay: string) => {
    setSelectedCutNumber(cutDisplay);
    const selectedCut = cuts.find(cut => `${cut.cut_number} – ${cut.color}` === cutDisplay);
    if (selectedCut) {
      setSelectedCutId(selectedCut.cut_id);
    } else {
      setSelectedCutId(null);
    }
  };

  const handleGenerateBatches = async () => {
    if (!selectedJobOrderId || !selectedCutNumber) {
      setError('Please select both a job order and a cut');
      return;
    }

    const selectedCut = cuts.find(cut => `${cut.cut_number} – ${cut.color}` === selectedCutNumber);
    if (!selectedCut) {
      setError('Invalid cut selection');
      return;
    }

    if (selectedSizes.size === 0) {
      setError('Please select at least one size to generate batches');
      return;
    }

    if (mode === 'manual') {
      const hasValidQuantities = Object.entries(quantityPerBatch).some(([size, qty]) => selectedSizes.has(size) && qty > 0);
      if (!hasValidQuantities) {
        setError('Please define quantity per batch for at least one selected size');
        return;
      }
    }

    setIsLoading(true);
    setError('');
    setGeneratedBatches([]);

    try {
      const requestData: any = {
        job_order_id: selectedJobOrderId,
        cut_number: selectedCut.cut_number,
        mode: mode
      };

      if (mode === 'manual') {
        const filteredQuantityPerBatch: Record<string, number> = {};
        selectedSizes.forEach(size => {
          if (quantityPerBatch[size] && quantityPerBatch[size] > 0) {
            filteredQuantityPerBatch[size] = quantityPerBatch[size];
          }
        });
        requestData.quantity_per_batch = filteredQuantityPerBatch;
        requestData.extra_pieces_threshold = extraPiecesThreshold;
      } else {
        if (maxBatchSize) {
          requestData.max_batch_size = maxBatchSize;
        }
        requestData.extra_pieces_threshold = extraPiecesThreshold;
      }

      const batches = await batchApi.generate(
        selectedJobOrderId,
        selectedCut.cut_number,
        mode,
        mode === 'manual' ? quantityPerBatch : undefined,
        mode === 'manual' ? extraPiecesThreshold : extraPiecesThreshold,
        mode === 'auto' ? maxBatchSize : undefined
      );
      
      const filteredBatches = selectedSizes.size > 0 
        ? batches.filter(batch => selectedSizes.has(batch.size))
        : batches;
      
      setGeneratedBatches(filteredBatches);
      setSubmittedBatches([]);
      setSubmitResult(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate batches');
      setGeneratedBatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  const cutOptions = cuts.map(cut => `${cut.cut_number} – ${cut.color}`);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('batchGeneration.title', 'Batch Generation')}</h1>
        <p className="text-gray-600">{t('batchGeneration.subtitle', 'Generate batches from cuts based on rolls, layers, and size ratios')}</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">{t('batchGeneration.selectJobOrder', 'Select Job Order')}</h2>
        <div className="mb-4">
          <SearchableDropdown
            value={selectedJobOrderId ? jobOrders.find(j => j.job_order_id === selectedJobOrderId)?.job_order_number || '' : ''}
            onChange={val => {
              const found = jobOrders.find(j => j.job_order_number === val);
              setSelectedJobOrderId(found ? found.job_order_id : null);
            }}
            options={jobOrders.map(order => order.job_order_number)}
            placeholder={t('batchGeneration.selectJobOrderPlaceholder', 'Select a job order')}
            label={t('batchGeneration.selectJobOrder', 'Select Job Order')}
            disabled={jobOrders.length === 0}
            className="w-full max-w-md"
          />
        </div>
        {selectedJobOrder && (
          <div className="p-4 border rounded bg-gray-50 mb-2">
            <div><strong>{t('barcode.jobOrderNumber')}:</strong> {selectedJobOrder.job_order_number}</div>
            <div><strong>{t('bulkBarcode.model')}:</strong> {selectedJobOrder.model_name || t('bulkBarcode.noModel')}</div>
            <div><strong>{t('bulkBarcode.client')}:</strong> {selectedJobOrder.client_name || t('bulkBarcode.noClient')}</div>
          </div>
        )}
      </div>

      {selectedJobOrder && (
        <div className="bg-white rounded-lg shadow-sm p-[1.8rem] mb-6 min-h-[68vh]">
          <Tabs defaultValue="from-cut" className="w-full">
            <TabsList className="flex w-full flex-wrap gap-2 mb-6 h-auto">
              <TabsTrigger className="flex-1 min-w-[11rem] md:flex-none md:min-w-0" value="from-cut">
                {t('batchGeneration.tabFromCut', 'Batch Creation from Cut')}
              </TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[11rem] md:flex-none md:min-w-0" value="second-degree">
                {t('batchGeneration.tabSecondDegree', 'Second Degree Batches')}
              </TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[11rem] md:flex-none md:min-w-0" value="compensation">
                {t('batchGeneration.tabCompensation', 'Batch Compensation')}
              </TabsTrigger>
              <TabsTrigger className="flex-1 min-w-[11rem] md:flex-none md:min-w-0" value="rework-batches">
                {t('batchGeneration.tabReworkBatches', 'Rework Batches')}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="from-cut" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <h3 className="text-md font-semibold mb-3">{t('batchGeneration.selectCut', 'Select Cut')}</h3>
                  <SearchableDropdown
                    value={selectedCutNumber}
                    onChange={handleCutSelection}
                    options={cutOptions}
                    placeholder={cuts.length > 0 ? t('batchGeneration.selectCutPlaceholder', 'Select a cut') : t('batchGeneration.noCutsAvailable', 'No cuts available')}
                    label={t('batchGeneration.selectCut', 'Select Cut')}
                    disabled={cuts.length === 0 || isLoading}
                    className="w-full mt-2 mb-4"
                  />
                  {cuts.length === 0 && !isLoading && selectedJobOrderId && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-sm font-semibold text-yellow-800 mb-1">
                            {t('batchGeneration.noCutsTitle', 'No Cuts Available')}
                          </h4>
                          <p className="text-sm text-yellow-700 mb-3">
                            {t('batchGeneration.noCutsMessage', 'This job order does not have any cuts yet. You need to create a cut before generating batches.')}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => window.open('/cutting/createcut', '_blank')}
                            className="text-yellow-800 border-yellow-300 hover:bg-yellow-100"
                          >
                            {t('batchGeneration.createCutButton', 'Create Cut')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {selectedCutNumber && cutSizes.length > 0 && (
                  <div className="pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
                      <h3 className="text-md font-semibold">{t('batchGeneration.selectSizes', 'Select Sizes to Generate')}</h3>
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSizes(new Set(cutSizes))}
                        >
                          {t('batchGeneration.selectAll', 'Select All')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedSizes(new Set())}
                        >
                          {t('batchGeneration.deselectAll', 'Deselect All')}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {cutSizes.map((size) => (
                        <label key={size} className="flex items-center space-x-2 p-2 border rounded-md cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={selectedSizes.has(size)}
                            onChange={(e) => {
                              const newSelected = new Set(selectedSizes);
                              if (e.target.checked) {
                                newSelected.add(size);
                              } else {
                                newSelected.delete(size);
                              }
                              setSelectedSizes(newSelected);
                            }}
                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                          />
                          <span className="text-sm font-medium">{size}</span>
                        </label>
                      ))}
                    </div>
                    {selectedSizes.size === 0 && (
                      <p className="text-sm text-amber-600 mt-2">{t('batchGeneration.noSizesSelected', 'Please select at least one size to generate batches')}</p>
                    )}
                  </div>
                )}

                {selectedCutNumber && selectedSizes.size > 0 && (
                  <>
                    <div className="pt-4">
                      <h3 className="text-md font-semibold mb-3">{t('batchGeneration.mode', 'Generation Mode')}</h3>
                      <Select value={mode} onValueChange={(val) => setMode(val as GenerationMode)}>
                        <SelectTrigger className="w-full sm:max-w-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">{t('batchGeneration.modeAuto', 'Auto (Rolls & Layers)')}</SelectItem>
                          <SelectItem value="manual">{t('batchGeneration.modeManual', 'Manual (Quantity per Batch)')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {mode === 'auto' && (
                      <div className="border-t pt-4">
                        <h3 className="text-md font-semibold mb-4">{t('batchGeneration.autoModeSettings', 'Auto Mode Settings')}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="maxBatchSize" className="mb-2 block">
                              {t('batchGeneration.maxBatchSize', 'Max Batch Size (Optional)')}
                            </Label>
                            <Input
                              id="maxBatchSize"
                              type="number"
                              min={1}
                              value={maxBatchSize || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                const nextMax = val ? parseInt(val) || undefined : undefined;
                                setMaxBatchSize(nextMax);
                                if (nextMax && extraPiecesThreshold > nextMax) {
                                  setExtraPiecesThreshold(nextMax);
                                }
                              }}
                              className="w-full sm:max-w-xs"
                              placeholder={t('batchGeneration.noLimit', 'No limit')}
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {t('batchGeneration.maxBatchSizeHelp', 'If set, batches exceeding this size will be split into multiple batches')}
                            </p>
                          </div>
                          <div>
                            <Label htmlFor="extraThresholdAuto" className="mb-2 block">
                              {t('batchGeneration.extraPiecesThreshold', 'Extra Pieces Threshold')}
                            </Label>
                            <Input
                              id="extraThresholdAuto"
                              type="number"
                              min={0}
                              max={maxBatchSize || undefined}
                              value={extraPiecesThreshold}
                              onChange={(e) => {
                                const raw = Math.max(0, parseInt(e.target.value) || 5);
                                const clamped = maxBatchSize ? Math.min(raw, maxBatchSize) : raw;
                                setExtraPiecesThreshold(clamped);
                              }}
                              className="w-full sm:max-w-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {t('batchGeneration.extraPiecesThresholdHelp', 'Leftover pieces below this threshold will be merged into the previous batch')}
                            </p>
                            {maxBatchSize && extraPiecesThreshold > maxBatchSize && (
                              <p className="text-xs text-amber-600 mt-1">
                                {t(
                                  'batchGeneration.extraPiecesThresholdMustBeLEMaxBatchSize',
                                  'Sanity check: Extra Pieces Threshold must be ≤ Max Batch Size'
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {mode === 'manual' && selectedSizes.size > 0 && (
                      <div className="border-t pt-4">
                        <h3 className="text-md font-semibold mb-4">{t('batchGeneration.quantityPerBatch', 'Quantity per Batch')}</h3>
                        <p className="text-sm text-gray-600 mb-4">{t('batchGeneration.quantityPerBatchNote', 'Define quantity per batch for selected sizes only')}</p>
                        <div className="mb-4">
                          <Label htmlFor="extraThreshold" className="mb-2 block">
                            {t('batchGeneration.extraPiecesThreshold', 'Extra Pieces Threshold')}
                          </Label>
                          <Input
                            id="extraThreshold"
                            type="number"
                            min={0}
                            value={extraPiecesThreshold}
                            onChange={(e) => setExtraPiecesThreshold(Math.max(0, parseInt(e.target.value) || 5))}
                            className="w-full max-w-xs"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            {t('batchGeneration.extraPiecesThresholdHelp', 'Leftover pieces below this threshold will be merged into the last batch')}
                          </p>
                        </div>
                        <div className="border rounded-md overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>{t('bulkBarcode.size', 'Size')}</TableHead>
                                <TableHead>{t('batchGeneration.quantityPerBatch', 'Quantity per Batch')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {Array.from(selectedSizes).map((size) => (
                                <TableRow key={size}>
                                  <TableCell className="font-medium">{size}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={1}
                                      value={quantityPerBatch[size] || 0}
                                      onChange={(e) => setQuantityPerBatch(prev => ({
                                        ...prev,
                                        [size]: Math.max(0, parseInt(e.target.value) || 0)
                                      }))}
                                      className="w-full max-w-xs"
                                      placeholder="0"
                                    />
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    <div className="border-t pt-4">
                      <Button
                        onClick={handleGenerateBatches}
                        disabled={isLoading || !selectedCutNumber || selectedSizes.size === 0 || (mode === 'manual' && !Object.values(quantityPerBatch).some(qty => qty > 0))}
                        className="btn-primary"
                        size="lg"
                      >
                        {isLoading ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('batchGeneration.generating', 'Generating...')}
                          </span>
                        ) : (
                          t('batchGeneration.generateBatches', 'Generate Batches')
                        )}
                      </Button>
                    </div>
                  </>
                )}

                {generatedBatches.length > 0 && (
                  <div className="border-t pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{t('batchGeneration.generatedBatches', 'Generated Batches')}</h3>
                      <span className="text-sm text-gray-500">{generatedBatches.length} {t('batchGeneration.batch', 'batches')}</span>
                    </div>
                    <div className="border rounded-md overflow-hidden mb-4">
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-gray-50 z-10">
                            <TableRow>
                              <TableHead>{t('batchGeneration.batch', 'Batch')}</TableHead>
                              <TableHead>{t('bulkBarcode.size', 'Size')}</TableHead>
                              <TableHead>{t('barcode.quantity', 'Quantity')}</TableHead>
                              <TableHead>{t('barcode.barcode', 'Barcode')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {generatedBatches.map((batch) => (
                              <TableRow key={batch.batch}>
                                <TableCell className="font-medium">{batch.batch}</TableCell>
                                <TableCell>{batch.size}</TableCell>
                                <TableCell>{batch.quantity}</TableCell>
                                <TableCell className="font-mono text-sm">{batch.barcode}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        onClick={async () => {
                          if (!selectedJobOrderId || !selectedCutNumber) {
                            setError('Please select both a job order and a cut');
                            return;
                          }
                          
                          const selectedCut = cuts.find(cut => `${cut.cut_number} – ${cut.color}` === selectedCutNumber);
                          if (!selectedCut) {
                            setError('Invalid cut selection');
                            return;
                          }
                          
                          let colorId = selectedCut.color_id;
                          if (!colorId && selectedCut.cut_id) {
                            try {
                              const cutDetails = await cutsApi.getCutById(selectedCut.cut_id);
                              colorId = cutDetails.color_id;
                              if (!colorId) {
                                setError('Cut details do not contain color_id');
                                return;
                              }
                            } catch (err: any) {
                              setError(`Failed to get color_id from cut details: ${err.response?.data?.detail || err.message}`);
                              return;
                            }
                          }
                          
                          if (!colorId) {
                            setError('Missing color_id for selected cut. Please refresh the page and try again.');
                            return;
                          }
                          
                          setIsSubmitting(true);
                          setError('');
                          setSubmitResult(null);
                          
                          try {
                            const result = await batchApi.submit({
                              batches: generatedBatches,
                              job_order_id: selectedJobOrderId,
                              color_id: colorId
                            });
                            
                            setSubmitResult({
                              created: result.created_batches?.length || 0,
                              duplicates: result.duplicate_barcodes?.length || 0,
                              message: result.message
                            });
                            
                            if (result.created_batches && result.created_batches.length > 0) {
                              setSubmittedBatches(result.created_batches);
                              setGeneratedBatches([]);
                            }
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Failed to submit batches');
                          } finally {
                            setIsSubmitting(false);
                          }
                        }}
                        disabled={isSubmitting || generatedBatches.length === 0}
                        className="btn-primary"
                        size="lg"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('batchGeneration.submitting', 'Submitting...')}
                          </span>
                        ) : (
                          t('batchGeneration.submitBatches', 'Submit Batches')
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {submitResult && (
                  <div className="border-t pt-6">
                    <div className={`px-4 py-3 rounded-lg mb-4 ${submitResult.duplicates > 0 ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                      <p className="text-sm font-medium">
                        {submitResult.message || `${submitResult.created} batches created. ${submitResult.duplicates} duplicates found.`}
                      </p>
                    </div>
                    
                    {submitResult.created > 0 && submittedBatches.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold mb-3">{t('batchGeneration.printBatches', 'Print Batches')}</h4>
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                          <div className="flex items-center space-x-2">
                            <Label htmlFor="printer-select">{t('batchGeneration.printer', 'Printer')}</Label>
                            <Select
                              value={selectedPrinter}
                              onValueChange={setSelectedPrinter}
                              disabled={isPrinting}
                            >
                              <SelectTrigger className="w-[250px]">
                                <SelectValue placeholder={t('batchGeneration.selectPrinter', 'Select Printer')} />
                              </SelectTrigger>
                              <SelectContent>
                                {allPrinters.map((printer) => (
                                  <SelectItem key={printer.name} value={printer.name}>
                                    <div className="flex items-center justify-between w-full">
                                      <span>{printer.name}</span>
                                      <span className="ml-2 text-xs text-gray-500">
                                        {printer.type === 'zebra' ? '🖨️ Zebra' : '🖥️ Server'}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            onClick={async () => {
                              if (!selectedPrinter) {
                                setError(t('batchGeneration.selectPrinterMessage', 'Please select a printer'));
                                return;
                              }
                              
                              try {
                                setIsPrinting(true);
                                setError('');
                                
                                const barcodesToPrint = submittedBatches.map(batch => ({
                                  barcode: batch.barcode,
                                  client_name: batch.client_name || '',
                                  model: batch.model_name || '',
                                  size: batch.size_value || '',
                                  color: batch.color_name || '',
                                  quantity: batch.quantity || 0,
                                  layers: batch.layers || 1,
                                  serial: batch.serial || '',
                                  job_order_number: selectedJobOrder?.job_order_number || '',
                                  is_second_degree: Boolean(batch.is_second_degree),
                                }));
                                
                                const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
                                const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';
                                
                                if (isZebraPrinter) {
                                  const zebraPrintData: BarcodePrintData[] = barcodesToPrint.map(item => ({
                                    barcode: item.barcode,
                                    brand: item.client_name || '',
                                    model: item.model,
                                    size: item.size,
                                    color: item.color,
                                    quantity: item.quantity,
                                    layers: item.layers,
                                    serial: item.serial || undefined,
                                    job_order_number: item.job_order_number,
                                    is_second_degree: item.is_second_degree,
                                  }));
                                  
                                  await zebraPrinterService.printMultipleBarcodes(
                                    zebraPrintData,
                                    selectedPrinter,
                                    1
                                  );
                                  
                                  alert(t('batchGeneration.printSuccess', { count: submittedBatches.length, printer: selectedPrinter }).replace('{count}', String(submittedBatches.length)).replace('{printer}', selectedPrinter));
                                } else {
                                  await barcodeApi.printBarcodes(
                                    barcodesToPrint,
                                    1,
                                    selectedPrinter
                                  );
                                  
                                  alert(t('batchGeneration.printSuccess', { count: submittedBatches.length, printer: selectedPrinter }).replace('{count}', String(submittedBatches.length)).replace('{printer}', selectedPrinter));
                                }
                              } catch (error) {
                                console.error('Error printing barcodes:', error);
                                setError(t('batchGeneration.printError', 'Failed to print barcodes. Please try again.'));
                              } finally {
                                setIsPrinting(false);
                              }
                            }}
                            disabled={isPrinting || !selectedPrinter || submittedBatches.length === 0}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {isPrinting ? (
                              <span className="flex items-center">
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                {t('batchGeneration.printing', 'Printing...')}
                              </span>
                            ) : (
                              t('batchGeneration.printBatches', 'Print Batches')
                            )}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="second-degree" className="space-y-6">
              <div className="w-full text-[120%]">
                <h3 className="text-lg font-semibold mb-2">{t('batchGeneration.createSecondDegree', 'Create Second Degree Batches')}</h3>
                <p className="text-base text-gray-600 mb-6">{t('batchGeneration.secondDegreeDescription', 'Create second degree batches for job order items. These batches are initialized with quantity 0.')}</p>
                
                {jobOrderItems.length > 0 ? (
                  <>
                    <div className="border-b pb-4 mb-6">
                      <Button
                        onClick={async () => {
                          if (!selectedJobOrderId) {
                            setError('Please select a job order');
                            return;
                          }
                          
                          const itemsToCreate = sortedSecondDegreeItems
                            .filter(item => (secondDegreeCounts[item.item_id] || 0) > 0)
                            .map(item => ({
                              item_id: item.item_id,
                              count: secondDegreeCounts[item.item_id] || 0
                            }));
                          
                          if (itemsToCreate.length === 0) {
                            setError('Please specify at least one second degree batch to create');
                            return;
                          }
                          
                          setIsCreatingSecondDegree(true);
                          setError('');
                          setSubmitResult(null);
                          
                          try {
                            const result = await batchApi.createSecondDegree({
                              job_order_id: selectedJobOrderId,
                              items: itemsToCreate
                            });
                            
                            setSubmitResult({
                              created: result.created_batches?.length || 0,
                              duplicates: result.duplicate_barcodes?.length || 0,
                              message: result.message
                            });
                            
                            if (result.created_batches && result.created_batches.length > 0) {
                              setSecondDegreeCounts({});
                            }
                          } catch (err: any) {
                            setError(err.response?.data?.detail || 'Failed to create second degree batches');
                          } finally {
                            setIsCreatingSecondDegree(false);
                          }
                        }}
                        disabled={isCreatingSecondDegree || jobOrderItems.length === 0}
                        className="btn-primary"
                        size="lg"
                      >
                        {isCreatingSecondDegree ? (
                          <span className="flex items-center">
                            <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            {t('batchGeneration.creating', 'Creating...')}
                          </span>
                        ) : (
                          t('batchGeneration.createSecondDegreeBatches', 'Create Second Degree Batches')
                        )}
                      </Button>
                      {submitResult && (
                        <div className={`mt-4 px-4 py-3 rounded-lg ${submitResult.duplicates > 0 ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                          <p className="text-base font-medium">
                            {submitResult.message || `${submitResult.created} batches created. ${submitResult.duplicates} duplicates found.`}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="w-full border rounded-md overflow-hidden mb-6">
                      <div className="w-full max-h-[55vh] overflow-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-gray-50 z-10">
                            <TableRow>
                              <TableHead className="text-base">{t('bulkBarcode.color', 'Color')}</TableHead>
                              <TableHead className="text-base">{t('bulkBarcode.size', 'Size')}</TableHead>
                              <TableHead className="text-base">{t('batchGeneration.secondDegreeBatchCount', 'Second Degree Batches')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sortedSecondDegreeItems.map((item) => (
                              <TableRow key={item.item_id}>
                                <TableCell className="font-medium text-base">{item.color_name}</TableCell>
                                <TableCell className="text-base">{item.size_value}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={secondDegreeCounts[item.item_id] || 0}
                                    onChange={(e) => setSecondDegreeCounts(prev => ({
                                      ...prev,
                                      [item.item_id]: Math.max(0, parseInt(e.target.value) || 0)
                                    }))}
                                    className="w-full text-base h-11"
                                    placeholder="0"
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">{t('batchGeneration.loadingItems', 'Loading job order items...')}</p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="compensation" className="space-y-6">
              <div className="w-full text-[120%]">
                <h3 className="text-lg font-semibold mb-2">{t('batchGeneration.createCompensation', 'Create Compensation Batches')}</h3>
                <p className="text-base text-gray-600 mb-6">{t('batchGeneration.compensationDescription', 'Create compensation batches for lost physical barcodes. These batches are not included in cut qty or phase_in_qty calculations.')}</p>
                
                {uniqueColorSizeCombinations.length > 0 ? (
                    <>
                      <div className="border-b pb-4 mb-6">
                        <Button
                          onClick={async () => {
                            if (!selectedJobOrderId) {
                              setError('Please select a job order');
                              return;
                            }
                            
                            const compensationsToCreate = uniqueColorSizeCombinations
                              .filter((combo) => {
                                const key = `${combo.color_id}-${combo.size_id}`;
                                const comp = compensationData[key];
                                return comp && comp.quantity > 0 && comp.phase_id > 0;
                              })
                              .map((combo) => {
                                const key = `${combo.color_id}-${combo.size_id}`;
                                return {
                                  item_id: combo.item_id,
                                  phase_id: compensationData[key].phase_id,
                                  quantity: compensationData[key].quantity
                                };
                              });
                            
                            if (compensationsToCreate.length === 0) {
                              setError('Please specify at least one compensation batch to create');
                              return;
                            }
                            
                            setIsCreatingCompensation(true);
                            setError('');
                            setSubmitResult(null);
                            
                            try {
                              const result = await batchApi.createCompensation({
                                job_order_id: selectedJobOrderId,
                                compensations: compensationsToCreate
                              });
                              
                              setSubmitResult({
                                created: result.created_batches?.length || 0,
                                duplicates: result.duplicate_barcodes?.length || 0,
                                message: result.message
                              });
                              
                              if (result.created_batches && result.created_batches.length > 0) {
                                setCompensationData({});
                              }
                            } catch (err: any) {
                              setError(err.response?.data?.detail || 'Failed to create compensation batches');
                            } finally {
                              setIsCreatingCompensation(false);
                            }
                          }}
                          disabled={isCreatingCompensation || jobOrderItems.length === 0}
                          className="btn-primary"
                          size="lg"
                        >
                          {isCreatingCompensation ? (
                            <span className="flex items-center">
                              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              {t('batchGeneration.creating', 'Creating...')}
                            </span>
                          ) : (
                            t('batchGeneration.createCompensationBatches', 'Create Compensation Batches')
                          )}
                        </Button>
                        {submitResult && (
                          <div className={`mt-4 px-4 py-3 rounded-lg ${submitResult.duplicates > 0 ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                            <p className="text-base font-medium">
                              {submitResult.message || `${submitResult.created} batches created. ${submitResult.duplicates} duplicates found.`}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="w-full border rounded-md overflow-hidden mb-6">
                        <div className="w-full max-h-[55vh] overflow-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-gray-50 z-10">
                              <TableRow>
                                <TableHead className="text-base">{t('bulkBarcode.color', 'Color')}</TableHead>
                                <TableHead className="text-base">{t('bulkBarcode.size', 'Size')}</TableHead>
                                <TableHead className="text-base">{t('batchGeneration.compensationPhase', 'Compensation Phase')}</TableHead>
                                <TableHead className="text-base">{t('batchGeneration.compensationQty', 'Compensation Quantity')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uniqueColorSizeCombinations.map((combo) => {
                                const key = `${combo.color_id}-${combo.size_id}`;
                                return (
                                  <TableRow key={key}>
                                    <TableCell className="font-medium text-base">{combo.color_name}</TableCell>
                                    <TableCell className="text-base">{combo.size_value}</TableCell>
                                    <TableCell>
                                      <Select
                                        value={compensationData[key]?.phase_id?.toString() || ''}
                                        onValueChange={(val) => setCompensationData(prev => ({
                                          ...prev,
                                          [key]: {
                                            ...prev[key],
                                            phase_id: parseInt(val),
                                            quantity: prev[key]?.quantity || 0
                                          }
                                        }))}
                                      >
                                      <SelectTrigger className="w-full text-base h-11">
                                          <SelectValue placeholder={t('batchGeneration.selectPhase', 'Select Phase')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {compensationPhases.map((phase) => (
                                            <SelectItem key={phase.phase_id} value={phase.phase_id.toString()}>
                                              {phase.phase_name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    <TableCell>
                                      <Input
                                        type="number"
                                        min={0}
                                        value={compensationData[key]?.quantity || 0}
                                        onChange={(e) => setCompensationData(prev => ({
                                          ...prev,
                                          [key]: {
                                            ...prev[key],
                                            phase_id: prev[key]?.phase_id || compensationPhases[0]?.phase_id || 0,
                                            quantity: Math.max(0, parseInt(e.target.value) || 0)
                                          }
                                        }))}
                                        className="w-full text-base h-11"
                                        placeholder="0"
                                      />
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">{t('batchGeneration.loadingItems', 'Loading job order items...')}</p>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="rework-batches" className="space-y-6">
              <div>
                <h3 className="text-lg sm:text-xl font-semibold mb-2">
                  {t('batchGeneration.reworkBatchesTitle', 'Rework Batches')}
                </h3>
                <p className="text-sm sm:text-base text-gray-600 mb-6">
                  {t('batchGeneration.reworkBatchesDescription', 'View and print rework batches grouped by problem stage, color, and size.')}
                </p>

                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                    <div>
                      <Label className="mb-2 block">{t('batchGeneration.printedFilter', 'Printed Filter')}</Label>
                      <Select
                        value={reworkPrintedFilter}
                        onValueChange={(value: 'all' | 'printed' | 'not-printed') => setReworkPrintedFilter(value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('batchGeneration.filterAll', 'All')}</SelectItem>
                          <SelectItem value="printed">{t('batchGeneration.filterPrinted', 'Printed')}</SelectItem>
                          <SelectItem value="not-printed">{t('batchGeneration.filterNotPrinted', 'Not Printed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="mb-2 block">{t('batchGeneration.printer', 'Printer')}</Label>
                      <Select value={selectedPrinter} onValueChange={setSelectedPrinter}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('batchGeneration.selectPrinter', 'Select printer')} />
                        </SelectTrigger>
                        <SelectContent>
                          {allPrinters.map((p) => (
                            <SelectItem key={p.name} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {isLoadingReworkBatches ? (
                  <div className="text-sm text-gray-500">{t('batchGeneration.loading', 'Loading...')}</div>
                ) : groupedReworkBatches.length === 0 ? (
                  <div className="text-sm text-gray-500">{t('batchGeneration.noReworkBatches', 'No rework batches found for the selected filters.')}</div>
                ) : (
                  <Accordion type="multiple" className="w-full border rounded-md px-3 sm:px-4">
                    {groupedReworkBatches.map((phaseGroup) => (
                      <AccordionItem key={phaseGroup.phaseName} value={`phase-${phaseGroup.phaseName}`}>
                        <AccordionTrigger className="text-sm sm:text-base font-semibold">
                          <div className="flex flex-col sm:flex-row sm:items-center w-full gap-3">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <span className="truncate">{phaseGroup.phaseName}</span>
                              {(() => {
                                const allRows = phaseGroup.colors.flatMap((c) =>
                                  c.stages.flatMap((st) => st.sizes.flatMap((sz) => sz.batches))
                                );
                                const hasUnprinted = allRows.some((r) => !r.printed);
                                return hasUnprinted ? (
                                  <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-800">
                                    {t('batchGeneration.notFullyPrinted', 'Not fully printed')}
                                  </span>
                                ) : (
                                  <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800">
                                    {t('batchGeneration.allPrinted', 'All printed')}
                                  </span>
                                );
                              })()}
                              <span className="text-[11px] px-2 py-1 rounded bg-slate-100 text-slate-700">
                                {phaseGroup.colors.reduce(
                                  (sum, color) =>
                                    sum +
                                    color.stages.reduce(
                                      (s2, stage) => s2 + stage.sizes.reduce((s3, sz) => s3 + sz.batches.length, 0),
                                      0
                                    ),
                                  0
                                )}{' '}
                                {t('batchGeneration.batch', 'batches')}
                              </span>
                            </div>
                            <div className="sm:ml-auto flex items-center w-full sm:w-auto">
                              <Button
                                type="button"
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                disabled={isPrintingRework || !selectedPrinter || phaseGroup.colors.length === 0}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const rows = phaseGroup.colors.flatMap((c) =>
                                    c.stages.flatMap((st) => st.sizes.flatMap((sz) => sz.batches))
                                  );
                                  printReworkBatches(rows);
                                }}
                              >
                                {t('batchGeneration.print', 'Print')}
                              </Button>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <Accordion type="multiple" className="w-full border rounded-md px-3 sm:px-4 bg-gray-50">
                            {phaseGroup.colors.map((colorGroup) => (
                              <AccordionItem
                                key={`${phaseGroup.phaseName}-${colorGroup.colorName}`}
                                value={`color-${phaseGroup.phaseName}-${colorGroup.colorName}`}
                              >
                                <AccordionTrigger className="text-sm font-medium">
                                  <div className="flex flex-col sm:flex-row sm:items-center w-full gap-3">
                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                      <span className="truncate">{colorGroup.colorName}</span>
                                      {(() => {
                                        const allRows = colorGroup.stages.flatMap((st) =>
                                          st.sizes.flatMap((sz) => sz.batches)
                                        );
                                        const hasUnprinted = allRows.some((r) => !r.printed);
                                        return hasUnprinted ? (
                                          <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-800">
                                            {t('batchGeneration.notFullyPrinted', 'Not fully printed')}
                                          </span>
                                        ) : (
                                          <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800">
                                            {t('batchGeneration.allPrinted', 'All printed')}
                                          </span>
                                        );
                                      })()}
                                      <span className="text-[11px] px-2 py-1 rounded bg-white text-slate-700 border">
                                        {colorGroup.stages.reduce((sum, st) => sum + st.sizes.reduce((s2, sz) => s2 + sz.batches.length, 0), 0)}{' '}
                                        {t('batchGeneration.batch', 'batches')}
                                      </span>
                                    </div>
                                    <div className="sm:ml-auto flex items-center w-full sm:w-auto">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                        disabled={isPrintingRework || !selectedPrinter || colorGroup.stages.length === 0}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          const rows = colorGroup.stages.flatMap((st) =>
                                            st.sizes.flatMap((sz) => sz.batches)
                                          );
                                          printReworkBatches(rows);
                                        }}
                                      >
                                        {t('batchGeneration.print', 'Print')}
                                      </Button>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <Accordion type="multiple" className="w-full border rounded-md px-3 sm:px-4 bg-white">
                                    {colorGroup.stages.map((stageGroup) => (
                                      <AccordionItem
                                        key={`${phaseGroup.phaseName}-${colorGroup.colorName}-${stageGroup.stageName}`}
                                        value={`stage-${phaseGroup.phaseName}-${colorGroup.colorName}-${stageGroup.stageName}`}
                                      >
                                        <AccordionTrigger className="text-sm font-medium">
                                          <div className="flex flex-col sm:flex-row sm:items-center w-full gap-3">
                                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                                              <span className="truncate">{stageGroup.stageName}</span>
                                              {(() => {
                                                const allRows = stageGroup.sizes.flatMap((sz) => sz.batches);
                                                const hasUnprinted = allRows.some((r) => !r.printed);
                                                return hasUnprinted ? (
                                                  <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-800">
                                                    {t('batchGeneration.notFullyPrinted', 'Not fully printed')}
                                                  </span>
                                                ) : (
                                                  <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800">
                                                    {t('batchGeneration.allPrinted', 'All printed')}
                                                  </span>
                                                );
                                              })()}
                                              <span className="text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-700 border">
                                                {stageGroup.sizes.reduce((sum, size) => sum + size.batches.length, 0)}{' '}
                                                {t('batchGeneration.batch', 'batches')}
                                              </span>
                                            </div>
                                            <div className="sm:ml-auto flex items-center w-full sm:w-auto">
                                              <Button
                                                type="button"
                                                size="sm"
                                                className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                                disabled={isPrintingRework || !selectedPrinter || stageGroup.sizes.length === 0}
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  e.stopPropagation();
                                                  const rows = stageGroup.sizes.flatMap((sz) => sz.batches);
                                                  printReworkBatches(rows);
                                                }}
                                              >
                                                {t('batchGeneration.print', 'Print')}
                                              </Button>
                                            </div>
                                          </div>
                                        </AccordionTrigger>
                                        <AccordionContent>
                                          <Accordion type="multiple" className="w-full border rounded-md px-3 sm:px-4 bg-white">
                                            {stageGroup.sizes.map((sizeGroup) => (
                                              <AccordionItem
                                                key={`${phaseGroup.phaseName}-${colorGroup.colorName}-${stageGroup.stageName}-${sizeGroup.sizeValue}`}
                                                value={`size-${phaseGroup.phaseName}-${colorGroup.colorName}-${stageGroup.stageName}-${sizeGroup.sizeValue}`}
                                              >
                                                <AccordionTrigger className="text-sm font-medium">
                                                  <div className="flex flex-col sm:flex-row sm:items-center w-full gap-3">
                                                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                                                      <span className="truncate">{sizeGroup.sizeValue}</span>
                                                      {sizeGroup.batches.some((r) => !r.printed) ? (
                                                        <span className="text-[11px] px-2 py-1 rounded bg-amber-100 text-amber-800">
                                                          {t('batchGeneration.notFullyPrinted', 'Not fully printed')}
                                                        </span>
                                                      ) : (
                                                        <span className="text-[11px] px-2 py-1 rounded bg-green-100 text-green-800">
                                                          {t('batchGeneration.allPrinted', 'All printed')}
                                                        </span>
                                                      )}
                                                      <span className="text-[11px] px-2 py-1 rounded bg-slate-50 text-slate-700 border">
                                                        {sizeGroup.batches.length} {t('batchGeneration.batch', 'batches')}
                                                      </span>
                                                    </div>
                                                    <div className="sm:ml-auto flex items-center w-full sm:w-auto">
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                                        disabled={isPrintingRework || !selectedPrinter || sizeGroup.batches.length === 0}
                                                        onClick={(e) => {
                                                          e.preventDefault();
                                                          e.stopPropagation();
                                                          printReworkBatches(sizeGroup.batches);
                                                        }}
                                                      >
                                                        {t('batchGeneration.print', 'Print')}
                                                      </Button>
                                                    </div>
                                                  </div>
                                                </AccordionTrigger>
                                                <AccordionContent>
                                                  <div className="space-y-2">
                                                    {sizeGroup.batches.map((row) => {
                                                      const details = reworkBatchDetails[row.batch_id];
                                                      const barcode = details?.barcode || row.barcode || `Batch #${row.batch_id}`;
                                                      return (
                                                        <div
                                                          key={row.rework_batch_id}
                                                          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded border bg-white"
                                                        >
                                                          <div className="flex flex-wrap items-center gap-2 text-sm min-w-0">
                                                            <span className="font-medium">#{row.rework_batch_id}</span>
                                                            <span className="text-gray-500 truncate max-w-full min-w-0">{barcode}</span>
                                                            <span className={`text-xs px-2 py-1 rounded ${row.printed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                                                              {row.printed ? t('batchGeneration.printedYes', 'Printed') : t('batchGeneration.printedNo', 'Not Printed')}
                                                            </span>
                                                          </div>
                                                          <Button
                                                            size="sm"
                                                            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
                                                            disabled={isPrintingRework || printingReworkId === row.rework_batch_id || !selectedPrinter}
                                                            onClick={async () => {
                                                              setPrintingReworkId(row.rework_batch_id);
                                                              await printReworkBatches([row]);
                                                            }}
                                                          >
                                                            {printingReworkId === row.rework_batch_id ? t('batchGeneration.printing', 'Printing...') : t('batchGeneration.print', 'Print')}
                                                          </Button>
                                                        </div>
                                                      );
                                                    })}
                                                  </div>
                                                </AccordionContent>
                                              </AccordionItem>
                                            ))}
                                          </Accordion>
                                        </AccordionContent>
                                      </AccordionItem>
                                    ))}
                                  </Accordion>
                                </AccordionContent>
                              </AccordionItem>
                            ))}
                          </Accordion>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </Layout>
  );
};

export default BulkBarcodeCreatePage;
