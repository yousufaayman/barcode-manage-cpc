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
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';

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
  const [viewLoading, setViewLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editItems, setEditItems] = useState<Array<{item_id: number, quantity: number, color_name: string, size_value: string}>>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editNotes, setEditNotes] = useState<string>('');
  const [editMaterials, setEditMaterials] = useState<Array<{material_name: string, color_name: string, quantity: number, notes?: string}>>([]);
  const [editPrints, setEditPrints] = useState<{
    type: string;
    details: Record<string, string>;
  } | null>(null);
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
    console.log('Client name:', viewJobOrder.client_name);
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
    let printConfigHTML = '';
    if (viewJobOrder.prints && viewJobOrder.prints.type && viewJobOrder.prints.details) {
      const printDetails = Object.entries(viewJobOrder.prints.details).map(([key, value]) => 
        `<tr><td style="border:1px solid #000;padding:4px;">${key}</td><td style="border:1px solid #000;padding:4px;">${value}</td></tr>`
      ).join('');
      printConfigHTML = `
        <h4 style="margin:6px 0 2px 0;">${t('jobOrderDetails.printingDetails')} (${viewJobOrder.prints.type})</h4>
        <table style="width:100%;border-collapse:collapse;font-size:10pt;">
          <thead><tr><th style="border:1px solid #000;padding:4px;">${t('common.key')}</th><th style="border:1px solid #000;padding:4px;">${t('common.value')}</th></tr></thead>
          <tbody>${printDetails}</tbody>
        </table>`;
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
      if (fullJobOrder.prints && fullJobOrder.prints.type && fullJobOrder.prints.details) {
        setEditPrints({
          type: fullJobOrder.prints.type,
          details: { ...fullJobOrder.prints.details }
        });
      } else {
        setEditPrints(null);
      }
      
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
      const originalPrints = editingJobOrder.prints && editingJobOrder.prints.type 
        ? { type: editingJobOrder.prints.type, details: editingJobOrder.prints.details || {} }
        : null;
      if (JSON.stringify(editPrints) !== JSON.stringify(originalPrints)) {
        updateData.print_config = editPrints;
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

  return (
    <Layout>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold mb-2 text-gray-800">
            {viewJobOrder
              ? t('jobOrderDetails.productionDetailsWithNumber', { jobOrderNumber: viewJobOrder.job_order_number })
              : t('jobOrders.title')}
          </h1>
          <p className="text-gray-600 text-sm md:text-base">{t('jobOrderDetails.subtitle')}</p>
          {/* Date Created Display */}
          {viewJobOrder?.date_created && (
            <p className="text-gray-500 text-xs md:text-sm mt-1">
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
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-lg font-semibold text-blue-800 mb-2">{t('jobOrders.clientName')}</h3>
              <p className="text-blue-900">{viewJobOrder.client_name || '-'}</p>
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
          {/* Summary Section */}
          {viewTrackingData.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('jobOrderDetails.productionSummary')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.expected')}</div>
                  <div className="text-xl font-bold text-gray-800">
                    {viewTrackingData.reduce((sum, item) => sum + item.expected_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.cutQuantity')}</div>
                  <div className="text-xl font-bold text-purple-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.cut_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.secondDegree')}</div>
                  <div className="text-xl font-bold text-orange-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.second_degree_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.completed')}</div>
                  <div className="text-xl font-bold text-green-600">
                    {viewTrackingData.reduce((sum, item) => sum + item.completed_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.remaining')}</div>
                  <div className="text-xl font-bold text-blue-700">
                    {viewTrackingData.reduce((sum, item) => sum + item.remaining_quantity, 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-gray-600">{t('jobOrderDetails.workingQty')}</div>
                  <div className="text-xl font-bold text-blue-700">
                    {viewTrackingData.reduce((sum, item) => sum + item.working_quantity, 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Issue Indicators */}
          {(() => {
            const allIssues = viewTrackingData.flatMap(item => {
              const issues = detectIssues(item);
              return issues.map(issue => ({
                ...issue,
                item: `${item.color_name} - ${item.size_value}`
              }));
            });
            
            if (allIssues.length === 0) return null;
            
            // Group issues by type
            const issuesByType = allIssues.reduce((acc, issue) => {
              if (!acc[issue.type]) acc[issue.type] = [];
              acc[issue.type].push(issue);
              return acc;
            }, {} as Record<string, any[]>);
            
            return (
              <div className="mb-4 space-y-2">
                                {Object.entries(issuesByType).map(([type, issues]) => {
                  const bgColor = 'bg-red-100';
                  const borderColor = 'border-red-300';
                  const textColor = 'text-red-700';
                  const iconColor = 'text-red-600';
                  
                  return (
                    <div key={type} className={`flex items-start p-3 ${bgColor} border ${borderColor} rounded ${textColor}`}>
                      <svg className={`w-5 h-5 mr-2 ${iconColor} mt-0.5 flex-shrink-0`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <div className="font-semibold mb-1">
                          {type === 'overproduction' ? t('jobOrderDetails.overproductionIssues') : 
                           type === 'high_second_degree' ? t('jobOrderDetails.highSecondDegreeIssues') : 
                           type === 'notes' ? t('jobOrderDetails.productionIssues') :
                           type === 'lost_quantity' ? t('jobOrderDetails.lostQuantityIssues') :
                           t('jobOrderDetails.productionIssues')}
                        </div>
                        <div className="text-sm space-y-1">
                          {(issues as any[]).map((issue, idx) => (
                            <div key={idx} className={textColor}>
                              <span className="font-medium">{issue.item}:</span> {issue.message}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {/* Summary Table */}
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full border rounded-lg overflow-hidden shadow-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.color')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.size')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.expected')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.remainingQuantity')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.completed')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.cuttingDifference')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.secondDegree')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.lostQuantity')}</th>
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
                    const colorRows = items.map((item, itemIdx) => {
                      const secondDegreeColor = item.second_degree_quantity > 0 ? 'text-orange-600 font-medium' : 'text-gray-500';
                      const completedColor = item.completed_quantity > 0 ? 'text-green-600 font-semibold' : 'text-gray-500';
                      const remainingColor = item.remaining_quantity > 0 ? 'text-blue-700 font-semibold' : 'text-gray-700';
                      
                      const issues = detectIssues(item);
                      const hasIssues = issues.length > 0;
                      
                      let rowBackgroundClass = rowIndex % 2 === 0 ? 'bg-white' : 'bg-gray-200 hover:bg-gray-300';
                      if (hasIssues) {
                        rowBackgroundClass = 'bg-red-100 hover:bg-red-200 border-l-4 border-l-red-600 shadow-sm';
                      }
                      
                      const enhancedCuttingDiffColor = hasIssues 
                        ? 'text-red-700 font-bold'
                        : remainingColor;
                      
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
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${remainingColor}`}>{item.remaining_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${completedColor}`}>{item.completed_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${enhancedCuttingDiffColor}`}>{item.cut_quantity - item.expected_quantity > 0 ? '+' : ''}{item.cut_quantity - item.expected_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${secondDegreeColor}`}>{item.second_degree_quantity}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-semibold text-orange-700">{item.lost_qty || 0}</td>
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

          {/* Phase Details Table */}
          <div className="overflow-x-auto">
            <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('jobOrderDetails.phaseDetails')}</h3>
            <table className="min-w-full border rounded-lg overflow-hidden shadow-sm">
              <thead className="bg-gray-100 text-gray-800">
                <tr>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.color')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-left">{t('barcode.size')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.expected')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.cutQuantity')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.cutInspection')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.secondDegreeCut')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.sewingIn')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.sewingOut')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.packagingIn')}</th>
                  <th className="px-4 py-2 border-b border-gray-200 font-semibold text-right">{t('jobOrderDetails.packagingOut')}</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const groupedItems = groupItemsByColor(viewTrackingData);
                  let rowIndex = 0;
                  
                  return Object.entries(groupedItems).map(([color, items]) => {
                    const colorRows = items.map((item, itemIdx) => {
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
                          <td className="px-4 py-2 border-b border-gray-200">
                            {itemIdx === 0 ? (
                              <div className="font-semibold text-gray-800">{color}</div>
                            ) : (
                              <div className="text-gray-500 text-sm">└─</div>
                            )}
                          </td>
                          <td className="px-4 py-2 border-b border-gray-200">{item.size_value}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right font-medium">{item.expected_quantity}</td>
                          <td className={`px-4 py-2 border-b border-gray-200 text-right ${enhancedCutColor}`}>{item.cut_quantity}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right">{item.cut_inspection_qty || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right text-orange-600">{item.second_degree_cut_qty || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right">{item.sewing_in_qty || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right">{item.sewing_out_qty || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right">{item.packaging_in_qty || 0}</td>
                          <td className="px-4 py-2 border-b border-gray-200 text-right">{item.packaging_out_qty || 0}</td>
                        </tr>
                      );
                    });
                    
                    return colorRows;
                  }).flat();
                })()}
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
          {viewJobOrder.prints && viewJobOrder.prints.type && viewJobOrder.prints.details && Object.keys(viewJobOrder.prints.details).length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-2">{t('jobOrderDetails.printingDetails')} ({viewJobOrder.prints.type})</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border rounded-lg overflow-hidden text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 border-b text-left">{t('common.key')}</th>
                      <th className="px-4 py-2 border-b text-left">{t('common.value')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(viewJobOrder.prints.details).map(([key, value], idx) => (
                      <tr key={key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-2 border-b">{key}</td>
                        <td className="px-4 py-2 border-b">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">{t('jobOrderDetails.printingDetails')}</h3>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={() => setEditPrints(editPrints ? null : { type: 'Printing', details: {} })}
                      disabled={editLoading}
                      variant="outline"
                      size="sm"
                    >
                      {editPrints ? t('common.remove') : t('common.add')}
                    </Button>
                  </div>
                </div>
                {editPrints && (
                  <div className="space-y-3 border rounded-lg p-4">
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
                                  details: { ...editPrints.details, [key.trim()]: '' }
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
                      {Object.keys(editPrints.details).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries(editPrints.details).map(([key, value]) => (
                            <div key={key} className="flex gap-2 items-center">
                              <Input
                                value={key}
                                onChange={e => {
                                  const newDetails = { ...editPrints!.details };
                                  delete newDetails[key];
                                  newDetails[e.target.value] = value;
                                  setEditPrints({ ...editPrints!, details: newDetails });
                                }}
                                disabled={editLoading}
                                className="flex-1"
                                placeholder={t('common.key')}
                              />
                              <Input
                                value={value}
                                onChange={e => setEditPrints(prev => prev ? {
                                  ...prev,
                                  details: { ...prev.details, [key]: e.target.value }
                                } : null)}
                                disabled={editLoading}
                                className="flex-1"
                                placeholder={t('common.value')}
                              />
                              <Button
                                type="button"
                                onClick={() => {
                                  if (editPrints) {
                                    const newDetails = { ...editPrints.details };
                                    delete newDetails[key];
                                    setEditPrints({ ...editPrints, details: newDetails });
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