import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api, { jobOrderApi, JobOrder, refreshJobOrderSummary } from '../services/api';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Search, Filter, X, Package, CheckCircle, Edit, Eye } from 'lucide-react';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown, { EditableDropdown } from '../components/SearchableDropdown';
import { useToast } from '../hooks/use-toast';
import { Label } from '../components/ui/label';
import { Link } from 'react-router-dom';
import { Textarea } from '../components/ui/textarea';

interface JobOrderSummary {
  job_order_id: number;
  job_order_number: string;
  model_name: string;
  brand_name?: string;
  total_colors: number;
  total_quantity: number;
  total_working_quantity: number;
  completion_percentage: number;
  batches?: { status: string }[];
}

const JobOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [openJobOrders, setOpenJobOrders] = useState<any[]>([]);
  const [closedJobOrders, setClosedJobOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClosed, setLoadingClosed] = useState(false);
  const [showClosedOrders, setShowClosedOrders] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageClosed, setCurrentPageClosed] = useState(1);
  const [totalOpenJobOrders, setTotalOpenJobOrders] = useState(0);
  const [totalClosedJobOrders, setTotalClosedJobOrders] = useState(0);
  
  // Filter states
  const [filters, setFilters] = useState({
    job_order_number: '',
    model_name: '',
    brand_name: ''
  });
  
  // Dropdown options
  const [jobOrderOptions, setJobOrderOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  
  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingJobOrder, setEditingJobOrder] = useState<JobOrder | null>(null);
  const [editItems, setEditItems] = useState<Array<{item_id: number, quantity: number, color_name: string, size_value: string}>>([]);
  const [editLoading, setEditLoading] = useState(false);
  
  // Mobile view state
  const [isMobile, setIsMobile] = useState(false);
  const [showFullView, setShowFullView] = useState(false);
  const [showFullViewClosed, setShowFullViewClosed] = useState(false);
  
  // Confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmingJobOrder, setConfirmingJobOrder] = useState<JobOrderSummary | null>(null);
  const [confirmAction, setConfirmAction] = useState<'close' | 'reopen' | null>(null);
  
  // Add job order dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
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

  // -------------------- Consumption Table State --------------------
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
  
  // Items per page
  const itemsPerPage = 50;
  
  // Calculate total pages
  const totalPagesOpen = Math.ceil(totalOpenJobOrders / itemsPerPage);
  const totalPagesClosed = Math.ceil(totalClosedJobOrders / itemsPerPage);
  
  // Total quantity entered in the table
  const totalTableQuantity = tableQuantities.reduce((sum, row) => sum + row.reduce((s, v) => s + (v || 0), 0), 0);

  // Automatically load open job orders on page load
  const [showOpenOrders, setShowOpenOrders] = useState(true);
  
  // Fetch open job orders using summary endpoint
  const fetchOpenJobOrders = async () => {
    try {
      setLoading(true);
      await refreshJobOrderSummary(); // Ensure summary is refreshed before fetching
      // Fetch all open job orders (no skip/limit)
      const allOpenResponse = await jobOrderApi.getSummary({
        limit: 10000,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      // Sort so that has_issues === true come first
      const sortedOpenItems = [...allOpenResponse.items].sort((a, b) => (b.has_issues === true ? 1 : 0) - (a.has_issues === true ? 1 : 0));
      // Apply pagination after sorting
      const pagedOpenItems = sortedOpenItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
      setOpenJobOrders(pagedOpenItems);
      setTotalOpenJobOrders(sortedOpenItems.length);
    } catch (error) {
      console.error('Error fetching open job orders:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to fetch open job orders',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!showOpenOrders) return;
    fetchOpenJobOrders();
  }, [showOpenOrders, currentPage, filters, t, toast]);

  // Fetch dropdown options
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const response = await jobOrderApi.getAllSimple();
        // Extract unique job order numbers, model names, and brand names
        const jobOrderNumbers = [...new Set(response.map(jo => jo.job_order_number))];
        const modelNames = [...new Set(response.map(jo => jo.model_name).filter(name => name))];
        const brandNames = [...new Set(response.map(jo => jo.brand_name).filter(name => name))];
        setJobOrderOptions(jobOrderNumbers);
        setModelOptions(modelNames);
        setBrandOptions(brandNames);
      } catch (error) {
        console.error('Error fetching dropdown options:', error);
      }
    };
    fetchDropdownOptions();
  }, []);

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

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handleClearFilters = () => {
    setFilters({
      job_order_number: '',
      model_name: '',
      brand_name: ''
    });
    setCurrentPage(1);
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Removed closed pagination

  // Fetch closed job orders using summary endpoint
  const handleLoadClosedOrders = async () => {
    if (showClosedOrders) return;
    try {
      setLoadingClosed(true);
      // Fetch all closed job orders (no skip/limit)
      const allClosedResponse = await jobOrderApi.getSummary({
        closed: true,
        limit: 10000,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      // Sort so that has_issues === true come first
      const sortedClosedItems = [...allClosedResponse.items].sort((a, b) => (b.has_issues === true ? 1 : 0) - (a.has_issues === true ? 1 : 0));
      // Apply pagination after sorting
      const pagedClosedItems = sortedClosedItems.slice((currentPageClosed - 1) * itemsPerPage, currentPageClosed * itemsPerPage);
      setClosedJobOrders(pagedClosedItems);
      setTotalClosedJobOrders(sortedClosedItems.length);
      if (!showClosedOrders) {
        setShowClosedOrders(true);
      }
    } catch (error) {
      console.error('Error fetching closed job orders:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to fetch closed job orders',
        variant: 'destructive'
      });
    } finally {
      setLoadingClosed(false);
    }
  };

  const handleEditJobOrder = async (jobOrder: JobOrderSummary) => {
    try {
      setEditLoading(true);
      // Fetch the full job order details
      const fullJobOrder = await jobOrderApi.getById(jobOrder.job_order_id);
      setEditingJobOrder(fullJobOrder);
      
      // Initialize edit items with current quantities
      const items = fullJobOrder.items.map(item => ({
        item_id: item.item_id,
        quantity: item.quantity,
        color_name: item.color_name || '',
        size_value: item.size_value || ''
      }));
      setEditItems(items);
      setEditDialogOpen(true);
    } catch (error) {
      console.error('Error fetching job order details:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to load job order details',
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
    
    try {
      setEditLoading(true);
      
      // Prepare the update data
      const updateData = {
        items: editItems.map(item => ({
          item_id: item.item_id,
          quantity: item.quantity
        }))
      };
      
      // Call the API to update the job order
      await jobOrderApi.update(editingJobOrder.job_order_id, updateData);
      
      // Close dialog and refresh data
      setEditDialogOpen(false);
      setEditingJobOrder(null);
      setEditItems([]);
      await fetchOpenJobOrders(); // Refresh open job orders and loading state
      
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
    setEditingJobOrder(null);
    setEditItems([]);
  };

  const calculateTotalQuantity = () => {
    return editItems.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Removed closed/open toggle logic
  const handleToggleClosed = undefined as never;

  // Removed closed orders refresh

  const handleAddJobOrderItem = () => {
    setNewJobOrder(prev => ({
      ...prev,
      items: [...prev.items, { color_name: '', size_value: '', quantity: 1 }]
    }));
  };

  const handleRemoveJobOrderItem = (index: number) => {
    if (newJobOrder.items.length > 1) {
      setNewJobOrder(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }));
    }
  };

  const handleUpdateJobOrderItem = (index: number, field: string, value: string | number) => {
    setNewJobOrder(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

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
      setAddDialogOpen(false);
      setNewJobOrder({
        job_order_number: '',
        model_name: '',
        brand_name: '',
        items: [{ color_name: '', size_value: '', quantity: 1 }]
      });
      setNewJobOrderImage(null);
      setNewJobOrderImagePreview(null);
      setPrintsFlags({
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
      // Reset table states
      setTableColors(['']);
      setTableSizes(['']);
      setTableQuantities([[0]]);
      await fetchOpenJobOrders();
      toast({
        title: t('common.success'),
        description: t('jobOrders.jobOrderCreated'),
      });
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
    setAddDialogOpen(false);
    setNewJobOrder({
      job_order_number: '',
      model_name: '',
      brand_name: '',
      items: [{ color_name: '', size_value: '', quantity: 1 }]
    });
    setNewJobOrderImage(null);
    setNewJobOrderImagePreview(null);
    setPrintsFlags({
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
    // Reset table states
    setTableColors(['']);
    setTableSizes(['']);
    setTableQuantities([[0]]);
  };

  // Handler to open the view dialog and fetch tracking data
  const handleViewJobOrder = async (jobOrder: JobOrderSummary) => {
    // This function is no longer needed as the view is handled by a Link
    // Keeping it for now in case it's called elsewhere, but it will be removed.
  };

  const handleAddJobOrder = () => {
    setAddDialogOpen(true);
  };

  // Table columns using summary fields directly
  const columns = [
    {
      key: 'job_order_number',
      header: t('barcode.jobOrderNumber'),
      width: 200,
      render: (item: any) => (
        <span>{item.job_order_number}</span>
      )
    },
    {
      key: 'brand_name',
      header: 'Client (Brand)',
      width: 200,
      render: (item: any) => (
        <span>{item.brand_name || 'Unknown'}</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'model_name',
      header: t('barcode.model'),
      width: 200,
      render: (item: any) => (
        <span>{item.model_name}</span>
      ),
      hidden: false
    },
    {
      key: 'total_items',
      header: 'Total Items',
      width: 150,
      render: (item: any) => (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {item.total_items}
        </Badge>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'total_expected_quantity',
      header: t('barcode.quantity'),
      width: 150,
      render: (item: any) => (
        <span>{item.total_expected_quantity?.toLocaleString()}</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'total_produced_quantity',
      header: t('barcode.workingQuantity'),
      width: 150,
      render: (item: any) => (
        <span>{item.total_produced_quantity?.toLocaleString()}</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'completion_percentage',
      header: 'Completion %',
      width: 120,
      render: (item: any) => (
        <span>{item.completion_percentage}%</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'has_issues',
      header: 'Issues',
      width: 80,
      render: (item: any) => item.has_issues ? <span style={{color: 'red'}}>!</span> : null,
      hidden: isMobile && !showFullView
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: 120,
      render: (item: JobOrderSummary) => (
        <div className="flex gap-1">
          <Link to={`/job-orders/${item.job_order_id}`} title="View Production Details">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <Eye className="w-4 h-4 text-gray-600" />
            </Button>
          </Link>
        </div>
      ),
      hidden: false
    }
  ];

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Job Orders Management</h1>
        <p className="text-gray-600">
          Create and manage job orders for production
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Filter Controls */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Filters</h2>
            <Button
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
              className="text-amber-700 border-amber-400 bg-amber-50 hover:text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:shadow-md transition-all duration-200 font-medium"
            >
              Clear Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label htmlFor="job_order_number" className="text-sm font-medium text-gray-700">Job Order Number</label>
              <SearchableDropdown
                label="Job Order"
                options={jobOrderOptions}
                value={filters.job_order_number}
                onChange={(value) => handleFilterChange('job_order_number', value)}
                placeholder="Search job order number..."
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="model_name" className="text-sm font-medium text-gray-700">Model Name</label>
              <SearchableDropdown
                label="Model"
                options={modelOptions}
                value={filters.model_name}
                onChange={(value) => handleFilterChange('model_name', value)}
                placeholder="Search model name..."
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="brand_name" className="text-sm font-medium text-gray-700">Brand Name</label>
              <SearchableDropdown
                label="Brand"
                options={brandOptions}
                value={filters.brand_name}
                onChange={(value) => handleFilterChange('brand_name', value)}
                placeholder="Search brand name..."
              />
            </div>
            
            <div className="form-group">
              <label className="text-sm font-medium text-gray-700">Actions</label>
              <Button
                onClick={handleAddJobOrder}
                className="w-full text-white font-medium"
                style={{ backgroundColor: 'rgb(17, 139, 80)', borderColor: 'rgb(17, 139, 80)', color: '#fff', fontWeight: 500 }}
              >
                Add Job Order
              </Button>
            </div>
          </div>
        </div>
        
        {/* Mobile Full View Toggle for Open Job Orders */}
        {isMobile && (
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => setShowFullView(!showFullView)}
              className="w-full"
            >
              {showFullView ? t('barcodeManagement.compactView') : t('barcodeManagement.fullView')} - Open Orders
            </Button>
          </div>
        )}
        
        {/* Open Job Orders Section */}
        {showOpenOrders && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-green-700">Open Job Orders</h3>
              <div className="text-sm text-gray-600">
                Showing {openJobOrders.length} of {totalOpenJobOrders} open job orders
              </div>
            </div>
            {loading ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading open job orders...</p>
              </div>
            ) : (
              <>
                <div className="table-container mb-4 w-full">
                  <div className="overflow-x-auto w-full">
                    {openJobOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        {hasActiveFilters 
                          ? "No open job orders match your current filters."
                          : "No open job orders found."
                        }
                      </div>
                    ) : (
                      <VirtualizedTable
                        columns={columns}
                        data={openJobOrders}
                        height={700}
                        rowHeight={48}
                        showAllColumns={showFullView}
                        rowClassName={(index) => index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                      />
                    )}
                  </div>
                </div>
                {totalPagesOpen > 0 && (
                  <div className="flex justify-center mt-4">
                    <nav className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {t('common.previous')}
                      </button>
                      {Array.from({ length: Math.min(5, totalPagesOpen) }, (_, i) => {
                        let pageNumber;
                        if (totalPagesOpen <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= totalPagesOpen - 2) {
                          pageNumber = totalPagesOpen - 4 + i;
                        } else {
                          pageNumber = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => handlePageChange(pageNumber)}
                            className={`px-3 py-1 rounded border ${currentPage === pageNumber ? 'bg-green text-white' : ''}`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={currentPage === totalPagesOpen}
                        className="px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {t('common.next')}
                      </button>
                    </nav>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      {/* Close bg-white container */}
      </div>

      {/* Edit Job Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Job Order: {editingJobOrder?.job_order_number}
            </DialogTitle>
          </DialogHeader>
          
          {editingJobOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Model:</span> {editingJobOrder.model_name}
                </div>
                <div>
                  <span className="font-medium">Total Items:</span> {editItems.length}
                </div>
              </div>
              
              <div className="space-y-3">
                <h3 className="font-medium text-lg">Job Order Items</h3>
                <div className="space-y-2">
                  {editItems.map((item, index) => (
                    <div key={item.item_id} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{item.color_name} - {item.size_value}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`quantity-${item.item_id}`} className="text-sm font-medium">
                          Quantity:
                        </Label>
                        <Input
                          id={`quantity-${item.item_id}`}
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={(e) => handleQuantityChange(item.item_id, parseInt(e.target.value) || 0)}
                          className="w-24"
                          disabled={editLoading}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-lg">Total Quantity:</span>
                  <span className="font-bold text-xl text-green-600">
                    {calculateTotalQuantity().toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              onClick={handleCancelEdit}
              disabled={editLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={editLoading}
              className="!bg-green-600 !hover:bg-green-700 !text-white font-bold shadow border border-green-700"
            >
              {editLoading ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Job Order Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="w-[90vw] max-w-[90vw] h-[90vh] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('jobOrders.addNewJobOrder')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* Job Order Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="min-h-[30vh] max-h-[50vh] overflow-auto">
                <table className="min-w-full border text-sm">
                  <thead>
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
                      <tr key={rowIndex}>
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
          
          <DialogFooter>
            <Button
              onClick={handleCancelAddJobOrder}
              disabled={addLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveNewJobOrder}
              disabled={addLoading}
              className="!bg-green-600 !hover:bg-green-700 !text-white font-bold shadow border border-green-700"
            >
              {addLoading ? t('jobOrders.creating') : t('jobOrders.createJobOrder')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default JobOrdersPage; 