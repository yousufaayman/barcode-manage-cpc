import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { jobOrderApi, batchApi, cutsApi, barcodeApi } from '../services/api';
import { useTranslation } from 'react-i18next';
import SearchableDropdown from '../components/SearchableDropdown';
import { Button } from "@/components/ui/button";
import { zebraPrinterService, BarcodePrintData } from '../services/zebraPrinterService';
import apiInstance from '../services/api';
import { sortSizes } from '../utils/sizeSort';
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
      
      if (found) {
        jobOrderApi.getCuts(selectedJobOrderId)
          .then(setCuts)
          .catch(err => {
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
    }
  }, [selectedJobOrderId, jobOrders]);

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
            className="w-[300px]"
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
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <Tabs defaultValue="from-cut" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="from-cut">{t('batchGeneration.tabFromCut', 'Batch Creation from Cut')}</TabsTrigger>
              <TabsTrigger value="second-degree">{t('batchGeneration.tabSecondDegree', 'Second Degree Batches')}</TabsTrigger>
              <TabsTrigger value="compensation">{t('batchGeneration.tabCompensation', 'Batch Compensation')}</TabsTrigger>
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
                    className="w-full max-w-md mt-2 mb-4"
                  />
                  {cuts.length === 0 && !isLoading && (
                    <p className="text-sm text-gray-500 mt-2">{t('batchGeneration.noCutsMessage', 'No cuts found for this job order')}</p>
                  )}
                </div>

                {selectedCutNumber && cutSizes.length > 0 && (
                  <div className="pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-md font-semibold">{t('batchGeneration.selectSizes', 'Select Sizes to Generate')}</h3>
                      <div className="flex gap-2">
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
                        <SelectTrigger className="w-full max-w-xs">
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
                                setMaxBatchSize(val ? parseInt(val) || undefined : undefined);
                              }}
                              className="w-full max-w-xs"
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
                              value={extraPiecesThreshold}
                              onChange={(e) => setExtraPiecesThreshold(Math.max(0, parseInt(e.target.value) || 5))}
                              className="w-full max-w-xs"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              {t('batchGeneration.extraPiecesThresholdHelp', 'Leftover pieces below this threshold will be merged into the previous batch')}
                            </p>
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
                                  serial: batch.serial || ''
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
                                    serial: item.serial ? parseInt(item.serial) : undefined
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
              <div>
                <h3 className="text-md font-semibold mb-2">{t('batchGeneration.createSecondDegree', 'Create Second Degree Batches')}</h3>
                <p className="text-sm text-gray-600 mb-6">{t('batchGeneration.secondDegreeDescription', 'Create second degree batches for job order items. These batches are initialized with quantity 0.')}</p>
                
                {jobOrderItems.length > 0 ? (
                  <>
                    <div className="border rounded-md overflow-hidden mb-6">
                      <div className="max-h-[400px] overflow-y-auto">
                        <Table>
                          <TableHeader className="sticky top-0 bg-gray-50 z-10">
                            <TableRow>
                              <TableHead>{t('bulkBarcode.color', 'Color')}</TableHead>
                              <TableHead>{t('bulkBarcode.size', 'Size')}</TableHead>
                              <TableHead>{t('barcode.quantity', 'Quantity')}</TableHead>
                              <TableHead>{t('batchGeneration.secondDegreeBatchCount', 'Second Degree Batches')}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {jobOrderItems.map((item) => (
                              <TableRow key={item.item_id}>
                                <TableCell className="font-medium">{item.color_name}</TableCell>
                                <TableCell>{item.size_value}</TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min={0}
                                    value={secondDegreeCounts[item.item_id] || 0}
                                    onChange={(e) => setSecondDegreeCounts(prev => ({
                                      ...prev,
                                      [item.item_id]: Math.max(0, parseInt(e.target.value) || 0)
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
                    
                    <div className="border-t pt-4">
                      <Button
                        onClick={async () => {
                          if (!selectedJobOrderId) {
                            setError('Please select a job order');
                            return;
                          }
                          
                          const itemsToCreate = jobOrderItems
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
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                        <div className={`mt-4 px-4 py-2 rounded-lg ${submitResult.duplicates > 0 ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                          <p className="text-sm font-medium">
                            {submitResult.message || `${submitResult.created} batches created. ${submitResult.duplicates} duplicates found.`}
                          </p>
                        </div>
                      )}
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
              <div>
                <h3 className="text-md font-semibold mb-2">{t('batchGeneration.createCompensation', 'Create Compensation Batches')}</h3>
                <p className="text-sm text-gray-600 mb-6">{t('batchGeneration.compensationDescription', 'Create compensation batches for lost physical barcodes. These batches are not included in cut qty or phase_in_qty calculations.')}</p>
                
                {uniqueColorSizeCombinations.length > 0 ? (
                    <>
                      <div className="border rounded-md overflow-hidden mb-6">
                        <div className="max-h-[400px] overflow-y-auto">
                          <Table>
                            <TableHeader className="sticky top-0 bg-gray-50 z-10">
                              <TableRow>
                                <TableHead>{t('bulkBarcode.color', 'Color')}</TableHead>
                                <TableHead>{t('bulkBarcode.size', 'Size')}</TableHead>
                                <TableHead>{t('batchGeneration.compensationPhase', 'Compensation Phase')}</TableHead>
                                <TableHead>{t('batchGeneration.compensationQty', 'Compensation Quantity')}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {uniqueColorSizeCombinations.map((combo) => {
                                const key = `${combo.color_id}-${combo.size_id}`;
                                return (
                                  <TableRow key={key}>
                                    <TableCell className="font-medium">{combo.color_name}</TableCell>
                                    <TableCell>{combo.size_value}</TableCell>
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
                                        <SelectTrigger className="w-full max-w-xs">
                                          <SelectValue placeholder={t('batchGeneration.selectPhase', 'Select Phase')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availablePhases.map((phase) => (
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
                                            phase_id: prev[key]?.phase_id || availablePhases[0]?.phase_id || 0,
                                            quantity: Math.max(0, parseInt(e.target.value) || 0)
                                          }
                                        }))}
                                        className="w-full max-w-xs"
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
                    
                    <div className="border-t pt-4">
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
                            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                        <div className={`mt-4 px-4 py-2 rounded-lg ${submitResult.duplicates > 0 ? 'bg-yellow-50 border border-yellow-200 text-yellow-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
                          <p className="text-sm font-medium">
                            {submitResult.message || `${submitResult.created} batches created. ${submitResult.duplicates} duplicates found.`}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-500">{t('batchGeneration.loadingItems', 'Loading job order items...')}</p>
                  </div>
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
