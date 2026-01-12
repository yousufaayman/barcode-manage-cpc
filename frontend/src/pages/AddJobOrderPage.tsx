import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Plus, X, ArrowLeft } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import api, { jobOrderApi } from '../services/api';
import SearchableDropdown, { EditableDropdown } from '../components/SearchableDropdown';
import { Checkbox } from '../components/ui/checkbox';
import { DEFAULT_PRINT_PLACEMENTS, PrintPlacement } from '../constants/printPlacements';

const createColorRowKey = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `color-row-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const AddJobOrderPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  
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
  
  // Existing options for dropdowns
  const [existingColors, setExistingColors] = useState<string[]>([]);
  const [existingSizes, setExistingSizes] = useState<string[]>([]);
  const [existingModels, setExistingModels] = useState<string[]>([]);
  const [existingClients, setExistingClients] = useState<string[]>([]);
  const [autoJobOrderNumber, setAutoJobOrderNumber] = useState<string>('');
  const [autoGenerateJobOrderNumber, setAutoGenerateJobOrderNumber] = useState(true);
  
  const [jobOrderNotes, setJobOrderNotes] = useState<string>('');
  const [enablePrintDetails, setEnablePrintDetails] = useState(false);
  const [printType, setPrintType] = useState<'Printing' | 'Embroidery'>('Printing');
  const [printPlacements, setPrintPlacements] = useState<PrintPlacement[]>(DEFAULT_PRINT_PLACEMENTS);
  const [colorPrintDetails, setColorPrintDetails] = useState<Record<string, Record<string, string>>>({});
  const [selectedPrintRows, setSelectedPrintRows] = useState<Record<string, boolean>>({});
  const [bulkPlacementKey, setBulkPlacementKey] = useState<string>(DEFAULT_PRINT_PLACEMENTS[0]?.key || '');
  const [bulkColorValue, setBulkColorValue] = useState<string>('');
  
  // Total quantity entered in the table
  const totalTableQuantity = tableQuantities.reduce((sum, row) => sum + row.reduce((s, v) => s + (v || 0), 0), 0);

  // Fetch existing colors, sizes, and models for dropdowns
  useEffect(() => {
    const fetchExistingOptions = async () => {
      try {
        const [colors, sizes, models, jobOrders] = await Promise.all([
          jobOrderApi.getExistingColors(),
          jobOrderApi.getExistingSizes(),
          jobOrderApi.getExistingModels(),
          jobOrderApi.getAllSimple()
        ]);
        setExistingColors(colors);
        setExistingSizes(sizes);
        setExistingModels(models);
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
    const label = prompt('Enter placement name');
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
        description: 'Client name is required',
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
        description: 'Please enter quantities for at least one color/size combination.',
          variant: 'destructive'
        });
        return;
      }

    try {
      setAddLoading(true);
      // Build FormData for multipart/form-data
      const formData = new FormData();
      formData.append('job_order_number', newJobOrder.job_order_number);
      formData.append('model_name', newJobOrder.model_name);
      formData.append('client_name', newJobOrder.client_name);
      formData.append('items', JSON.stringify(generatedItems));
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
      await api.post('/job-orders/with-names/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast({
        title: t('common.success'),
        description: t('jobOrders.jobOrderCreated'),
      });
      
      // Navigate back to job orders page
      navigate('/job-orders');
    } catch (error: any) {
      let errorMsg = error?.response?.data?.detail || error.message || 'Failed to create job order';
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
              Back to Job Orders
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{t('jobOrders.addNewJobOrder')}</h1>
          <p className="text-gray-600 mt-2">Create a new job order with items, materials, and specifications</p>
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
                    disabled={autoGenerateJobOrderNumber || addLoading}
                    readOnly={autoGenerateJobOrderNumber}
                  />
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
                    {autoGenerateJobOrderNumber ? 'Disable Auto' : 'Auto Generate'}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-name">Client Name *</Label>
                <EditableDropdown
                  value={newJobOrder.client_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, client_name: value }))}
                  options={existingClients}
                  placeholder={t('jobOrders.clientName')}
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model-name">{t('jobOrders.modelName')} *</Label>
                <EditableDropdown
                  value={newJobOrder.model_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, model_name: value }))}
                  options={existingModels}
                  placeholder={t('jobOrders.modelName')}
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="job-order-image">Job Order Image (optional)</Label>
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
                  <img src={newJobOrderImagePreview} alt="Preview" className="mt-2 max-h-40 rounded shadow" />
                )}
              </div>
            </div>

            {/* Job Order Items */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">{t('jobOrders.jobOrderItems')}</h3>
                <div className="flex gap-2">
                  <Button type="button" onClick={handleAddColorRow} disabled={addLoading} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Add Color Row
                </Button>
                  <Button type="button" onClick={handleAddSizeColumn} disabled={addLoading} variant="outline" size="sm">
                    <Plus className="w-4 h-4 mr-1" /> Add Size Column
                        </Button>
                    </div>
              </div>
              <div className="min-h-[30vh] max-h-[50vh] overflow-auto border rounded-lg">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="border p-2 text-left min-w-[8rem]">Color / Size</th>
                      {tableSizes.map((size, colIndex) => (
                        <th key={colIndex} className="border p-2 min-w-[6rem]">
                          <div className="flex items-center">
                        <EditableDropdown
                              value={size}
                              onValueChange={(value) => handleUpdateSize(colIndex, value)}
                              options={existingSizes}
                          disabled={addLoading}
                        />
                            {tableSizes.length > 1 && (
                              <button type="button" onClick={() => handleRemoveSizeColumn(colIndex)} disabled={addLoading}>
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
                          disabled={addLoading}
                        />
                            {tableColors.length > 1 && (
                              <button type="button" onClick={() => handleRemoveColorRow(rowIndex)} disabled={addLoading}>
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

            {/* Job Order Notes */}
            <div className="mt-4">
              <Label htmlFor="order-notes">Notes</Label>
              <Textarea
                id="order-notes"
                value={jobOrderNotes}
                onChange={e => setJobOrderNotes(e.target.value)}
                placeholder="Enter any notes for this job order"
                disabled={addLoading}
                rows={3}
              />
            </div>

            {/* Print Details */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Printing / Embroidery Details</h3>
                  <p className="text-sm text-gray-500">First choose the technique, then add placement and color notes.</p>
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
                  {enablePrintDetails ? 'Remove Details' : 'Add Details'}
                </Button>
              </div>

              {enablePrintDetails && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="print-type">Technique</Label>
                      <select
                        id="print-type"
                        value={printType}
                        onChange={e => setPrintType(e.target.value as 'Printing' | 'Embroidery')}
                        disabled={addLoading}
                        className="mt-1 w-full border rounded-md px-3 py-2"
                      >
                        <option value="Printing">Printing</option>
                        <option value="Embroidery">Embroidery</option>
                      </select>
                    </div>
                    <div>
                      <Label>Quick Apply</Label>
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
                          options={existingColors}
                          placeholder="Print color"
                          disabled={addLoading}
                          className="min-w-[10rem]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBulkApplyPrintColor}
                          disabled={addLoading || !bulkPlacementKey || !bulkColorValue.trim()}
                        >
                          {selectedRowCount > 0 ? `Apply to ${selectedRowCount} ${selectedRowCount === 1 ? 'Color' : 'Colors'}` : 'Apply to All Colors'}
                        </Button>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Select rows below to target specific colors.</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div>
                      <Label>Placement Fields</Label>
                      <p className="text-xs text-gray-500">Each column applies to all garment colors.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handlePlacementAdd}
                        disabled={addLoading}
                      >
                        <Plus className="w-4 h-4 mr-1" /> Add Field
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
                          <th className="border p-2 text-left min-w-[8rem]">Color</th>
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
                                {color.trim() || <span className="text-gray-400">Set color above</span>}
                              </td>
                              {printPlacements.map(placement => (
                                <td key={placement.key} className="border p-2">
                                  <EditableDropdown
                                    value={colorPrintDetails[rowKey]?.[placement.key] || ''}
                                    onValueChange={value => handleColorPrintChange(rowKey, placement.key, value)}
                                    options={existingColors}
                                    placeholder="Print color"
                                    disabled={addLoading || !color.trim()}
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                        {tableColors.length === 0 && (
                          <tr>
                            <td colSpan={printPlacements.length + 2} className="border p-4 text-center text-gray-500">
                              Add garment colors to configure print positions.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
              {addLoading ? t('jobOrders.creating') : t('jobOrders.createJobOrder')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddJobOrderPage;
