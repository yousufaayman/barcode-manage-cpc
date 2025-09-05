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

const AddJobOrderPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [addLoading, setAddLoading] = useState(false);
  const [newJobOrder, setNewJobOrder] = useState({
    job_order_number: '',
    model_name: '',
    brand_name: '',
    items: [{ color_name: '', size_value: '', quantity: 1 }]
  });
  const [newJobOrderImage, setNewJobOrderImage] = useState<File | null>(null);
  const [newJobOrderImagePreview, setNewJobOrderImagePreview] = useState<string | null>(null);
  
  // Prints flags state
  const [printsFlags, setPrintsFlags] = useState({
    chest: false,
    back: false,
    waist: false,
    right_leg: false,
    left_leg: false,
    pocket: false,
    hood: false,
    right_arm: false,
    left_arm: false,
  });
  
  // Table-based item entry states
  const [tableColors, setTableColors] = useState<string[]>(['']);
  const [tableSizes, setTableSizes] = useState<string[]>(['']);
  const [tableQuantities, setTableQuantities] = useState<number[][]>([[0]]);
  
  // Existing options for dropdowns
  const [existingColors, setExistingColors] = useState<string[]>([]);
  const [existingSizes, setExistingSizes] = useState<string[]>([]);
  const [existingModels, setExistingModels] = useState<string[]>([]);
  const [existingBrands, setExistingBrands] = useState<string[]>([]);
  const [existingMaterials, setExistingMaterials] = useState<string[]>([]);
  
  // Material name input
  const [materialName, setMaterialName] = useState<string>('');

  // Consumption Table State
  const generateKey = (name: string) => name.replace(/\s+/g, '_').toLowerCase();
  const [consumptionCategories, setConsumptionCategories] = useState<Array<{key: string; label: string; usesMaterialName: boolean}>>([
    { key: 'body', label: 'الجسم', usesMaterialName: true },
  ]);

  const [newCategoryName, setNewCategoryName] = useState<string>('');
  const handleAddCategory = () => {
    const name = newCategoryName.trim();
    if (!name) return;
    const key = generateKey(name);
    if (consumptionCategories.find(c => c.key === key)) {
      setNewCategoryName('');
      return;
    }
    setConsumptionCategories(prev => [...prev, { key, label: name, usesMaterialName: false }]);
    setNewCategoryName('');
  };

  // Per-cell consumption values keyed by `${rowIndex}-${categoryKey}`
  const [consumptionValues, setConsumptionValues] = useState<Record<string, number>>({});
  // Bulk values per category
  const [bulkConsumption, setBulkConsumption] = useState<Record<string, number>>({});
  const [jobOrderNotes, setJobOrderNotes] = useState<string>('');

  const handleBulkConsumptionChange = (categoryKey: string, value: number) => {
    setBulkConsumption(prev => ({ ...prev, [categoryKey]: value }));
  };

  const handleConsumptionCellChange = (rowIndex: number, categoryKey: string, value: number) => {
    setConsumptionValues(prev => ({ ...prev, [`${rowIndex}-${categoryKey}`]: value }));
  };
  
  // Total quantity entered in the table
  const totalTableQuantity = tableQuantities.reduce((sum, row) => sum + row.reduce((s, v) => s + (v || 0), 0), 0);

  // Fetch existing colors, sizes, and models for dropdowns
  useEffect(() => {
    const fetchExistingOptions = async () => {
      try {
        const [colors, sizes, models, materials] = await Promise.all([
          jobOrderApi.getExistingColors(),
          jobOrderApi.getExistingSizes(),
          jobOrderApi.getExistingModels(),
          jobOrderApi.getExistingMaterials()
        ]);
        // Fetch brands from jobOrderApi.getAllSimple
        const simpleJobOrders = await jobOrderApi.getAllSimple();
        const brands = [...new Set(simpleJobOrders.map(jo => jo.brand_name).filter(name => name))];
        setExistingColors(colors);
        setExistingSizes(sizes);
        setExistingModels(models);
        setExistingMaterials(materials);
        setExistingBrands(brands);
      } catch (error) {
        console.error('Error fetching existing options:', error);
      }
    };

    fetchExistingOptions();
  }, []);

  // ==================== TABLE-BASED ITEM ENTRY HELPERS ====================
  const handleAddColorRow = () => {
    setTableColors(prev => [...prev, '']);
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
    setTableColors(prev => prev.filter((_, i) => i !== rowIndex));
    setTableQuantities(prev => prev.filter((_, i) => i !== rowIndex));
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
    if (!newJobOrder.brand_name.trim()) {
      toast({
        title: t('common.error'),
        description: 'Brand name is required',
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
      formData.append('brand_name', newJobOrder.brand_name);
      formData.append('items', JSON.stringify(generatedItems));
      // Build materials array from consumption
      const materialsMap: Record<string, number> = {};
      const colorTotals = tableQuantities.map(row => row.reduce((s, v) => s + v, 0));
      tableColors.forEach((color, rowIndex) => {
        const totalQty = colorTotals[rowIndex] || 0;
        if (!color || totalQty === 0) return;
        consumptionCategories.forEach(cat => {
          const cellKey = `${rowIndex}-${cat.key}`;
          const cellVal = consumptionValues[cellKey] ?? bulkConsumption[cat.key] ?? 0;
          if (cellVal && cellVal > 0) {
            const matName = cat.usesMaterialName ? materialName || cat.label : cat.label;
            if (!matName) return;
            const key = `${matName}||${color}`;
            materialsMap[key] = (materialsMap[key] || 0) + cellVal * totalQty;
          }
        });
      });
      const materialsArray = Object.entries(materialsMap).map(([key, quantity]) => {
        const [material_name, color_name] = key.split('||');
        return { material_name, color_name, quantity, consumption: quantity };
      });
      formData.append('materials', JSON.stringify(materialsArray));
      // Append prints JSON
      formData.append('prints', JSON.stringify(printsFlags));
      formData.append('notes', jobOrderNotes);
      if (newJobOrderImage) {
        formData.append('image', newJobOrderImage);
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
                <Input
                  id="job-order-number"
                  value={newJobOrder.job_order_number}
                  onChange={(e) => setNewJobOrder(prev => ({ ...prev, job_order_number: e.target.value }))}
                  placeholder={t('jobOrders.jobOrderNumber')}
                  disabled={addLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand-name">Brand Name *</Label>
                <EditableDropdown
                  value={newJobOrder.brand_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, brand_name: value }))}
                  options={existingBrands}
                  placeholder={t('jobOrders.brandName')}
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
              {/* Material Name Input */}
              <div className="space-y-2">
                <Label htmlFor="material-name-input">Material Name</Label>
                <EditableDropdown
                  value={materialName}
                  onValueChange={(val) => setMaterialName(val)}
                  options={existingMaterials}
                  placeholder="Material Name"
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

            {/* Consumption Table */}
            <div className="space-y-4 mt-6">
              <h3 className="text-lg font-medium">Material Consumption</h3>
              <div className="overflow-auto border rounded-md">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border p-2 min-w-[6rem] text-left">Color</th>
                      {consumptionCategories.map(cat => (
                        <th key={cat.key} className="border p-2 min-w-[8rem] text-center space-y-1">
                          {/* Bulk input */}
                          <Input
                            type="number"
                            step="0.001"
                            value={bulkConsumption[cat.key] ?? ''}
                            onChange={e => handleBulkConsumptionChange(cat.key, parseFloat(e.target.value) || 0)}
                            placeholder={cat.label}
                            className="text-center"
                            disabled={addLoading}
                          />
                          <div className="mt-1 text-xs text-gray-500">{cat.label}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tableColors.map((color, rowIndex) => (
                      <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border p-2">{color}</td>
                        {consumptionCategories.map(cat => {
                          const cellKey = `${rowIndex}-${cat.key}`;
                          return (
                            <td key={cat.key} className="border p-1 text-center">
                              <Input
                                type="number"
                                step="0.001"
                                value={consumptionValues[cellKey] ?? ''}
                                onChange={e => handleConsumptionCellChange(rowIndex, cat.key, parseFloat(e.target.value) || 0)}
                                placeholder="-"
                                className="w-24 text-center"
                                disabled={addLoading}
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

            {/* Add new consumption column */}
            <div className="flex items-center gap-2 mt-4">
              <Input
                value={newCategoryName}
                onChange={e => setNewCategoryName(e.target.value)}
                placeholder="Add consumption column"
                className="w-64"
                disabled={addLoading}
              />
              <Button type="button" onClick={handleAddCategory} disabled={addLoading || !newCategoryName.trim()} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add Column
              </Button>
            </div>

            {/* Prints Flags */}
            <div className="space-y-4 mt-6">
              <Label>Prints (select applicable positions)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    ['chest', 'Chest'],
                    ['back', 'Back'],
                    ['waist', 'Waist'],
                    ['right_leg', 'Right Leg'],
                    ['left_leg', 'Left Leg'],
                    ['pocket', 'Pocket'],
                    ['hood', 'Hood'],
                    ['right_arm', 'Right Arm'],
                    ['left_arm', 'Left Arm'],
                  ] as [keyof typeof printsFlags, string][]
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center space-x-2">
                    <input
                      type="checkbox"
                      className="form-checkbox h-5 w-5 text-green-600"
                      checked={printsFlags[key]}
                      onChange={() => setPrintsFlags(prev => ({ ...prev, [key]: !prev[key] }))}
                      disabled={addLoading}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
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
