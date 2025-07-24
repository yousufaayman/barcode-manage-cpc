import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { jobOrderApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Edit, CheckCircle, Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { format } from 'date-fns';

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
  const [viewJobOrder, setViewJobOrder] = useState<any>(null);
  const [viewTrackingData, setViewTrackingData] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItems, setEditItems] = useState<Array<{item_id: number, quantity: number, color_name: string, size_value: string}>>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMaterials, setEditMaterials] = useState<Array<{material_name: string, color_name: string, quantity: number}>>([]);
  const [editPrints, setEditPrints] = useState({
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

  const generateKey = (name: string) => name.replace(/\s+/g, '_').toLowerCase();

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
    console.log('Brand name:', viewJobOrder.brand_name);
    console.log('Brand ID:', viewJobOrder.brand_id);
    const colors: string[] = Array.from(new Set(viewJobOrder.items.map((it: any) => it.color_name)));
    const sizes: string[] = Array.from(new Set(viewJobOrder.items.map((it: any) => it.size_value)));

    // Build header row with sizes
    const sizeHeader = sizes.map((sz: string) => `<th style="border:1px solid #000;padding:4px;min-width:18mm;text-align:center;">${sz}</th>`).join('');
    // Build rows
    const rows = colors.map((color: string) => {
      const cells = sizes.map((sz: string) => {
        const item = viewJobOrder.items.find((it: any) => it.color_name === color && it.size_value === sz);
        return `<td style="border:1px solid #000;padding:4px;text-align:center;">${item ? item.quantity : ''}</td>`;
      }).join('');
      const totalColor = viewJobOrder.items.filter((it: any) => it.color_name === color).reduce((sum: number, it: any) => sum + it.quantity, 0);
      return `<tr><td style="border:1px solid #000;padding:4px;min-width:22mm;">${color}</td>${cells}<td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;">${totalColor}</td></tr>`;
    }).join('');

    const totalJobOrder = viewJobOrder.items.reduce((sum: number, it: any) => sum + it.quantity, 0);

    // Materials section
    const matsHTML = materials.map((m: any) => `<tr><td style="border:1px solid #000;padding:4px;">${m.material_name}</td><td style="border:1px solid #000;padding:4px;">${m.color_name || '-'}</td><td style="border:1px solid #000;padding:4px;text-align:center;font-weight:bold;">${m.quantity}</td></tr>`).join('');

    // Printing sections
    const printFlags: [keyof typeof viewJobOrder.prints, string][] = [
      ['chest', t('jobOrderDetails.chest')],
      ['back', t('jobOrderDetails.back')],
      ['waist', t('jobOrderDetails.waist')],
      ['right_leg', t('jobOrderDetails.rightLeg')],
      ['left_leg', t('jobOrderDetails.leftLeg')],
      ['pocket', t('jobOrderDetails.pocket')],
      ['hood', t('jobOrderDetails.hood')],
    ];
    const activePrints = printFlags.filter(([k]) => viewJobOrder.prints?.[k]).map(([_, lbl]) => lbl).join(', ');

    return `
      <div class="print-job-order" style="width:100%;border:1px solid #000;margin-bottom:2mm;padding:3mm;box-sizing:border-box;">
        <p style="margin:0 0 2px 0;font-weight:bold;">${t('jobOrders.brandName')}: ${viewJobOrder.brand_name || viewJobOrder.brand_id || '-'}</p>
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

        <div style="display:flex;align-items:flex-start;gap:4mm;margin-top:3px;">
          ${viewJobOrder.image_url ? `<img src="${getPublicImageUrl(viewJobOrder.image_url)}" alt="img" style="width:55mm;height:45mm;object-fit:fill;border:1px solid #000;"/>` : ''}
          ${(activePrints || viewJobOrder.notes) ? `
          <div style="border:1px solid #000;padding:3px;font-size:9pt;flex:1;">
            ${activePrints ? `<p style="margin:0 0 2px 0;"><strong>${t('jobOrderDetails.printingDetails')}:</strong> ${activePrints}</p>` : ''}
            ${viewJobOrder.notes ? `<p style="margin:0;"><strong>${t('jobOrderDetails.notes')}</strong> ${viewJobOrder.notes}</p>` : ''}
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
        const tracking = await jobOrderApi.getProductionTracking(Number(jobOrderId));
        setViewTrackingData(tracking.tracking_data || []);
        const mats = await jobOrderApi.getMaterials(Number(jobOrderId));
        setMaterials(mats);
        // --- Populate edit dialog state for materials/consumption ---
        if (editDialogOpen) {
          setEditMaterials(mats);
          if (mats.length > 0) {
            setEditMaterialName(mats[0].material_name);
            // For each material/color/category, set the consumption value
            const newConsumptionValues: Record<string, number> = {};
            mats.forEach(mat => {
              // Default to 'body' if no category info
              const categoryKey = 'body';
              const cellKey = getConsumptionCellKey(mat.material_name, mat.color_name, categoryKey);
              if (mat.consumption != null) {
                newConsumptionValues[cellKey] = mat.consumption;
              } else if (mat.quantity && mat.quantity > 0 && mat.color_name) {
                // Try to infer per-unit consumption if possible
                const item = editItems.find(i => i.color_name === mat.color_name);
                if (item && item.quantity > 0) {
                  newConsumptionValues[cellKey] = mat.quantity / item.quantity;
                }
              }
            });
            setEditConsumptionValues(newConsumptionValues);
          }
        }
      } catch (error) {
        setViewJobOrder(null);
        setViewTrackingData([]);
      } finally {
        setViewLoading(false);
      }
    };
    if (jobOrderId) fetchData();
  }, [jobOrderId, editDialogOpen]);

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
      setEditMaterials(materials);
      setEditMaterialName(materials.length > 0 ? materials[0].material_name : '');
      // Reset consumption values
      setEditBulkConsumption({});
      setEditConsumptionValues({});
      setEditDialogOpen(true);
    } catch (error) {
      console.error('Error fetching job order details:', error);
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
      // Only include prints if changed
      if (JSON.stringify(editPrints) !== JSON.stringify({
        chest: editingJobOrder.prints?.chest || false,
        back: editingJobOrder.prints?.back || false,
        waist: editingJobOrder.prints?.waist || false,
        right_leg: editingJobOrder.prints?.right_leg || false,
        left_leg: editingJobOrder.prints?.left_leg || false,
        pocket: editingJobOrder.prints?.pocket || false,
        hood: editingJobOrder.prints?.hood || false,
        right_arm: editingJobOrder.prints?.right_arm || false,
        left_arm: editingJobOrder.prints?.left_arm || false,
      })) {
        updateData.prints = editPrints;
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
      
      // Refetch job order data
      const jobOrder = await jobOrderApi.getById(Number(jobOrderId));
      setViewJobOrder(jobOrder);
      const tracking = await jobOrderApi.getProductionTracking(Number(jobOrderId));
      setViewTrackingData(tracking.tracking_data || []);
      const mats = await jobOrderApi.getMaterials(Number(jobOrderId));
      setMaterials(mats);
      // (Toast success handler removed)
    } catch (error) {
      console.error('Error updating job order:', error);
      // (Toast error handler removed)
    } finally {
      setEditLoading(false);
    }
  };
  const handleCancelEdit = () => {
    setEditDialogOpen(false);
    setEditItems([]);
    setEditNotes('');
    setEditMaterials([]);
    setEditPrints({
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
    // Update all items of this color for this category
    setEditConsumptionValues(prev => {
      const updated = { ...prev };
      uniqueColors.forEach((color, rowIndex) => {
        if (color === colorName) {
          // Update all cells for this color/category
          editItems.forEach((item, idx) => {
            if (item.color_name === colorName) {
              const matName = editConsumptionCategories.find(cat => cat.key === categoryKey)?.usesMaterialName ? editMaterialName || editConsumptionCategories.find(cat => cat.key === categoryKey)?.label : editConsumptionCategories.find(cat => cat.key === categoryKey)?.label;
              if (matName) {
                const cellKey = getConsumptionCellKey(matName, colorName, categoryKey);
                updated[cellKey] = value;
              }
            }
          });
        }
      });
      return updated;
    });
  };

  // Print options array for the edit dialog
  const printOptions: [keyof typeof editPrints, string][] = [
    ['chest', t('jobOrderDetails.chest')],
    ['back', t('jobOrderDetails.back')],
    ['waist', t('jobOrderDetails.waist')],
    ['right_leg', t('jobOrderDetails.rightLeg')],
    ['left_leg', t('jobOrderDetails.leftLeg')],
    ['pocket', t('jobOrderDetails.pocket')],
    ['hood', t('jobOrderDetails.hood')],
    ['right_arm', t('jobOrderDetails.rightArm')],
    ['left_arm', t('jobOrderDetails.leftArm')],
  ];

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-2 text-gray-800">
            {viewJobOrder
              ? t('jobOrderDetails.productionDetailsWithNumber', { jobOrderNumber: viewJobOrder.job_order_number })
              : t('jobOrders.title')}
          </h1>
          <p className="text-gray-600">{t('jobOrderDetails.subtitle')}</p>
          {/* Date Created Display */}
          {viewJobOrder?.date_created && (
            <p className="text-gray-500 text-sm mt-1">
              {t('jobOrderDetails.dateCreated')}: {format(new Date(viewJobOrder.date_created), 'yyyy-MM-dd HH:mm')}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            {t('common.back')}
          </Button>
          {viewJobOrder && (
            <>
              <Button
                variant="outline"
                onClick={handleEditJobOrder}
                className="flex items-center gap-1"
                disabled={editLoading}
              >
                <Edit className="w-4 h-4" /> {t('common.edit')}
              </Button>
              {/* Removed: Close/Reopen button */}
            </>
          )}
          {/* Print Controls */}
          <input
            type="number"
            min={1}
            value={printCopies}
            onChange={e => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 border rounded px-1 text-center"
            title={t('common.copies')}
          />
          <Button variant="outline" onClick={handlePrint}>{t('common.print')}</Button>
        </div>
      </div>
      {/* Brand and Model Information */}
      {viewJobOrder && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-blue-800 mb-2">{t('jobOrders.brandName')}</h3>
              <p className="text-blue-900">{viewJobOrder.brand_name || '-'}</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-800 mb-2">{t('jobOrders.modelName')}</h3>
              <p className="text-blue-900">{viewJobOrder.model_name || '-'}</p>
            </div>
          </div>
        </div>
      )}
      {viewJobOrder?.image_url && (
        <div className="mb-6 flex justify-center">
          <img
            src={getPublicImageUrl(viewJobOrder.image_url)}
            alt="Job Order"
            className="max-h-64 rounded shadow border object-contain bg-white"
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
        <div>
          {/* Job Order Notes */}
          {viewJobOrder.notes && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-gray-800">
              <strong>{t('jobOrderDetails.notes')}:</strong> {viewJobOrder.notes}
            </div>
          )}
          {/* Quantity Issue Indicator */}
          {viewTrackingData.some(item => item.produced_quantity > item.expected_quantity) && (
            <div className="flex items-center mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-700 font-semibold">
              <svg className="w-5 h-5 mr-2 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t('jobOrderDetails.quantityWarning')}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full border rounded-lg overflow-hidden shadow-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.color')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.size')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.expected')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.produced')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.remaining')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.diff')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.completedQuantity')}</th>
                </tr>
              </thead>
              <tbody>
                {viewTrackingData.map((item, idx) => {
                  const diff = item.produced_quantity - item.expected_quantity;
                  let diffColor = diff > 0 ? 'text-red-600 font-bold' : diff === 0 ? 'text-green-700 font-bold' : 'text-gray-500';
                  let producedColor = item.produced_quantity > 0 ? 'text-blue-700 font-semibold' : 'text-gray-700';
                  let remainingColor = item.remaining_quantity > 0 ? 'text-blue-700 font-semibold' : 'text-gray-700';
                  return (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50 hover:bg-gray-100 transition-colors'}>
                      <td className="px-4 py-2 border-b border-gray-200">{item.color_name}</td>
                      <td className="px-4 py-2 border-b border-gray-200">{item.size_value}</td>
                      <td className="px-4 py-2 border-b border-gray-200 text-right font-medium">{item.expected_quantity}</td>
                      <td className={`px-4 py-2 border-b border-gray-200 text-right ${producedColor}`}>{item.produced_quantity}</td>
                      <td className={`px-4 py-2 border-b border-gray-200 text-right ${remainingColor}`}>{item.remaining_quantity}</td>
                      <td className={`px-4 py-2 border-b border-gray-200 text-right ${diffColor}`}>{diff > 0 ? `+${diff}` : diff}</td>
                      <td className="px-4 py-2 border-b border-gray-200 text-right font-semibold">{item.completed_quantity ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Materials section */}
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
          {(() => {
            const printOptions: [keyof typeof viewJobOrder.prints, string][] = [
              ['chest', t('jobOrderDetails.chest')],
              ['back', t('jobOrderDetails.back')],
              ['waist', t('jobOrderDetails.waist')],
              ['right_leg', t('jobOrderDetails.rightLeg')],
              ['left_leg', t('jobOrderDetails.leftLeg')],
              ['pocket', t('jobOrderDetails.pocket')],
              ['hood', t('jobOrderDetails.hood')],
            ];
            const activePrints = printOptions.filter(([key]) => viewJobOrder?.prints?.[key]);
            if (activePrints.length === 0) return null;
            return (
              <div className="mt-8">
                <h3 className="text-lg font-semibold mb-2">{t('jobOrderDetails.printingDetails')}</h3>
                <div className="flex flex-wrap gap-2 text-sm">
                  {activePrints.map(([key, label]) => (
                    <div key={key} className="flex items-center gap-1 bg-green-50 text-green-700 px-2 py-1 rounded border border-green-200">
                      ✔️ <span>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
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
                <h3 className="text-lg font-semibold mb-2">{t('jobOrderDetails.printingDetails')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {printOptions.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editPrints[key]}
                        onChange={e => setEditPrints(prev => ({ ...prev, [key]: e.target.checked }))}
                        disabled={editLoading}
                        className="rounded"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
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