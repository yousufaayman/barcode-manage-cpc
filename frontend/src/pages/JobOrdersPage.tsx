import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api, { jobOrderApi, JobOrder, JobOrderSummary } from '../services/api';
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
import { Plus, Search, Filter, X, Package, CheckCircle, Edit, Eye, ArrowUpDown } from 'lucide-react';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown, { EditableDropdown } from '../components/SearchableDropdown';
import { useToast } from '../hooks/use-toast';
import { Label } from '../components/ui/label';
import { Link } from 'react-router-dom';
import { Textarea } from '../components/ui/textarea';
import PriorityModal from '../components/PriorityModal';

const JobOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
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
    client_name: ''
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
  
  // Add selected job orders state for archiving
  const [selectedJobOrders, setSelectedJobOrders] = useState<number[]>([]);
  
  // Track if this is the initial page load
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Priority modal state
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [allJobOrdersForPriority, setAllJobOrdersForPriority] = useState<JobOrderSummary[]>([]);
  const canManageJobOrders = user?.role === 'admin' || user?.role === 'general_operations';
  
  // Fetch open job orders using summary endpoint
  const fetchOpenJobOrders = async () => {
    try {
      setLoading(true);
      
      // Fetch all open job orders (no skip/limit) - summary aggregates from item-level data
      const allOpenResponse = await jobOrderApi.getSummary({
        limit: 10000,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      
      // Ensure we have valid data
      if (!allOpenResponse || !allOpenResponse.items) {
        console.warn('No job orders data received from API');
        setOpenJobOrders([]);
        setTotalOpenJobOrders(0);
        return;
      }
      
      // Sort by issues hierarchy first: P > T > L > S > O, then by manual priority
      const sortedOpenItems = [...allOpenResponse.items].sort((a, b) => {
        const aIssues = detectIssues(a);
        const bIssues = detectIssues(b);
        
        const getHighestPriority = (issues: any[]) => {
          if (issues.some(i => i.type === 'notes')) return 5;
          if (issues.some(i => i.type === 'stalled')) return 4;
          if (issues.some(i => i.type === 'lost_quantity')) return 3;
          if (issues.some(i => i.type === 'high_second_degree')) return 2;
          if (issues.some(i => i.type === 'overproduction')) return 1;
          return 0;
        };
        
        const aIssuePriority = getHighestPriority(aIssues);
        const bIssuePriority = getHighestPriority(bIssues);
        
        if (aIssuePriority !== bIssuePriority) {
          return bIssuePriority - aIssuePriority;
        }
        
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        
        if (priorityB !== priorityA) {
          return priorityB - priorityA;
        }
        
        return a.job_order_number.localeCompare(b.job_order_number);
      });
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
    // Only auto-refresh on initial page load, not on filter changes or pagination
    const shouldRefresh = isInitialLoad;
    fetchOpenJobOrders();
    if (isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [showOpenOrders, currentPage, filters, t, toast, isInitialLoad]);

  // Fetch dropdown options
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const response = await jobOrderApi.getAllSimple();
        // Extract unique job order numbers, model names, and client names
        const jobOrderNumbers = [...new Set(response.map(jo => jo.job_order_number))];
        const modelNames = [...new Set(response.map(jo => jo.model_name).filter(name => name))];
        const brandNames = [...new Set(response.map(jo => jo.client_name).filter(name => name))];
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
        const [colors, sizes, models] = await Promise.all([
          jobOrderApi.getExistingColors(),
          jobOrderApi.getExistingSizes(),
          jobOrderApi.getExistingModels(),
        ]);
        const clientsResponse = await api.get<Array<{ client_id: number; client_name: string }>>('/batches/clients/');
        const clientsData = Array.isArray(clientsResponse.data) ? clientsResponse.data : [];
        // Fetch clients from jobOrderApi.getAllSimple
        const simpleJobOrders = await jobOrderApi.getAllSimple();
        const brands = [...new Set(simpleJobOrders.map(jo => jo.client_name).filter(name => name))];
        setExistingColors(colors);
        setExistingSizes(sizes);
        setExistingModels(models);
        setExistingBrands(brands);
      } catch (error) {
        console.error('Error fetching existing options:', error);
      }
    };

    fetchExistingOptions();
  }, []);

  useEffect(() => {
    const loadMaterials = async () => {
      try {
        const mats = await jobOrderApi.getExistingMaterials();
        setExistingMaterials(mats);
      } catch (error) {
        console.error('Error fetching materials options:', error);
      }
    };
    loadMaterials();
  }, [newJobOrder.brand_name]);

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
      client_name: ''
    });
    setCurrentPage(1);
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Removed closed pagination

  // Note: Closed job orders functionality removed as closed column no longer exists
  const handleLoadClosedOrders = async () => {
    // This function is no longer needed as closed column was removed
    console.warn('Closed job orders functionality removed - closed column no longer exists');
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

  // Archive-related functions
  const handleSelectJobOrder = (jobOrderId: number) => {
    setSelectedJobOrders(prev => {
      if (prev.includes(jobOrderId)) {
        return prev.filter(id => id !== jobOrderId);
      } else {
        return [...prev, jobOrderId];
      }
    });
  };

  const handleSelectAllJobOrders = () => {
    if (selectedJobOrders.length === openJobOrders.length) {
      setSelectedJobOrders([]);
    } else {
      setSelectedJobOrders(openJobOrders.map(jo => jo.job_order_id));
    }
  };

  const handleArchiveSelected = async () => {
    if (selectedJobOrders.length === 0) {
      toast({
        title: t('common.error'),
        description: 'Please select job orders to archive',
        variant: 'destructive'
      });
      return;
    }

    const confirmMessage = t('jobOrders.confirmArchiveBulk', { count: selectedJobOrders.length });
    
    if (window.confirm(confirmMessage)) {
      try {
        await api.post('/job-orders/archive/bulk', { job_order_ids: selectedJobOrders });
        setSelectedJobOrders([]);
        await fetchOpenJobOrders(); // Refresh the list
        
        toast({
          title: t('common.success'),
          description: t('jobOrders.archivedSuccessfullyBulk', { count: selectedJobOrders.length }),
        });
      } catch (error: any) {
        console.error('Error archiving job orders:', error);
        toast({
          title: t('common.error'),
          description: error?.response?.data?.detail || t('jobOrders.failedToArchive'),
          variant: 'destructive'
        });
      }
    }
  };

  const handleArchiveSingle = async (jobOrderId: number) => {
    const confirmMessage = t('jobOrders.confirmArchiveSingle');
    
    if (window.confirm(confirmMessage)) {
      try {
        await api.post(`/job-orders/${jobOrderId}/archive`);
        await fetchOpenJobOrders(); // Refresh the list
        
        toast({
          title: t('common.success'),
          description: t('jobOrders.archivedSuccessfully'),
        });
      } catch (error: any) {
        console.error('Error archiving job order:', error);
        toast({
          title: t('common.error'),
          description: error?.response?.data?.detail || t('jobOrders.failedToArchiveSingle'),
          variant: 'destructive'
        });
      }
    }
  };

  const handleOpenPriorityModal = async () => {
    try {
      const response = await jobOrderApi.getSummary({ limit: 10000 });
      setAllJobOrdersForPriority(response.items || []);
      setPriorityModalOpen(true);
    } catch (error) {
      console.error('Error fetching job orders for priority:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to load job orders',
        variant: 'destructive'
      });
    }
  };

  const handleSavePriorities = async (updates: Array<{ job_order_id: number; priority: number }>) => {
    try {
      await jobOrderApi.bulkUpdatePriorities(updates);
      await fetchOpenJobOrders();
      toast({
        title: t('common.success'),
        description: 'Priorities updated successfully',
      });
    } catch (error: any) {
      console.error('Error saving priorities:', error);
      toast({
        title: t('common.error'),
        description: error?.response?.data?.detail || 'Failed to save priorities',
        variant: 'destructive'
      });
      throw error;
    }
  };

  // Handler to open the view dialog and fetch tracking data
  const handleViewJobOrder = async (jobOrder: JobOrderSummary) => {
    // This function is no longer needed as the view is handled by a Link
    // Keeping it for now in case it's called elsewhere, but it will be removed.
  };

  const handleAddJobOrder = () => {
    navigate('/add-job-order');
  };

  // Helper to detect issues for a specific item
  const detectIssues = (item: any) => {
    const issues = [];
    
    // Case 1: Overproduction
    if (item.working_quantity > item.total_expected_quantity) {
      issues.push({
        type: 'overproduction',
        message: `Overproduction: ${item.working_quantity} produced vs ${item.total_expected_quantity} expected`,
        severity: 'high'
      });
    }
    
    // Case 2: High second degree quantity (using backend flag)
    if (item.has_high_second_degree) {
      issues.push({
        type: 'high_second_degree',
        message: `High second degree items detected (>3% threshold)`,
        severity: 'medium'
      });
    }
    
    // Case 3: Notes present (flagged as issue)
    if (item.notes && item.notes.trim()) {
      issues.push({
        type: 'notes',
        message: `Notes: ${item.notes}`,
        severity: 'info'
      });
    }
    
    // Case 4: Lost quantity (working quantity != cut quantity)
    if (item.cut_quantity > item.working_quantity) {
      const lostQuantity = item.cut_quantity - item.working_quantity;
      issues.push({
        type: 'lost_quantity',
        message: `Lost quantity: ${lostQuantity} (${item.cut_quantity} cut vs ${item.working_quantity} working)`,
        severity: 'high'
      });
    }
    
    // Case 5: Stalled batches (batches for same item spread across phase groups)
    if (item.has_stalled_batches) {
      issues.push({
        type: 'stalled',
        message: 'Stalled batches: items not in a single phase group',
        severity: 'high'
      });
    }
    
    return issues;
  };

  // Table columns using summary fields directly
  const columns = [
    {
      key: 'selection',
      header: '',
      width: 40,
      render: (item: any) => (
        <input
          type="checkbox"
          checked={selectedJobOrders.includes(item.job_order_id)}
          onChange={() => handleSelectJobOrder(item.job_order_id)}
          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
        />
      ),
      hidden: !canManageJobOrders
    },
    {
      key: 'job_order_number',
      header: t('barcode.jobOrderNumber'),
      width: 200,
      render: (item: any) => (
        <span>{item.job_order_number}</span>
      )
    },
    {
      key: 'client_name',
      header: 'Client',
      width: 200,
      render: (item: any) => (
        <span>{item.client_name || '-'}</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'model_name',
      header: t('barcode.model'),
      width: 200,
      render: (item: any) => (
        <span>{item.model_name || '-'}</span>
      ),
      hidden: false
    },
    {
      key: 'total_items',
      header: 'Total Items',
      width: 120,
      render: (item: any) => (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {item.total_items}
        </Badge>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'total_expected_quantity',
      header: 'Expected',
      width: 120,
      render: (item: any) => (
        <span className="bg-yellow-100 text-yellow-800 font-semibold px-2 py-1 rounded">{item.total_expected_quantity?.toLocaleString()}</span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'cut_quantity',
      header: 'Cut Qty',
      width: 120,
      render: (item: any) => {
        const cutQty = item.cut_quantity || 0;
        const expectedQty = item.total_expected_quantity || 0;
        const isOverCut = cutQty > expectedQty;
        
        return (
          <span className={`${isOverCut ? 'bg-red-100 text-red-800' : 'bg-purple-100 text-purple-800'} font-semibold px-2 py-1 rounded`}>
            {cutQty.toLocaleString()}
          </span>
        );
      },
      hidden: isMobile && !showFullView
    },
    {
      key: 'working_quantity',
      header: 'Working Qty',
      width: 120,
      render: (item: any) => (
        <span className="bg-blue-100 text-blue-800 font-semibold px-2 py-1 rounded">
          {item.working_quantity?.toLocaleString()}
        </span>
      ),
      hidden: isMobile && !showFullView
    },
    {
      key: 'second_degree_quantity',
      header: 'Second Degree',
      width: 120,
      render: (item: any) => {
        const hasHighSecondDegree = item.has_high_second_degree;
        return (
          <span className={`${hasHighSecondDegree ? 'bg-red-100 text-red-800' : 'bg-orange-200 text-orange-900'} font-semibold px-2 py-1 rounded`}>
            {item.second_degree_quantity?.toLocaleString()}
          </span>
        );
      },
      hidden: isMobile && !showFullView
    },
    {
      key: 'remaining_quantity',
      header: 'Cutting Difference',
      width: 120,
      render: (item: any) => {
        const expectedQty = item.total_expected_quantity || 0;
        const cutQty = item.cut_quantity || 0;
        const cuttingDiff = cutQty - expectedQty;
        const isPositive = cuttingDiff > 0;
        
        return (
          <span className={`${isPositive ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'} font-semibold px-2 py-1 rounded`}>
            {cuttingDiff > 0 ? '+' : ''}{cuttingDiff.toLocaleString()}
          </span>
        );
      },
      hidden: isMobile && !showFullView
    },
    {
      key: 'has_issues',
      header: 'Issues',
      width: 80,
      render: (item: any) => {
        const issues = detectIssues(item);
        if (issues.length === 0) return null;
        
        // Count different types of issues
        const overproductionIssues = issues.filter(i => i.type === 'overproduction').length;
        const secondDegreeIssues = issues.filter(i => i.type === 'high_second_degree').length;
        const notesIssues = issues.filter(i => i.type === 'notes').length;
        const lostQuantityIssues = issues.filter(i => i.type === 'lost_quantity').length;
        const stalledIssues = issues.filter(i => i.type === 'stalled').length;
        
        let displayText = '';
        // Hierarchy: P (notes) > T (stalled) > L (lost quantity) > S (second degree) > O (overproduction)
        if (notesIssues > 0) displayText += 'P';
        if (stalledIssues > 0) displayText += 'T';
        if (lostQuantityIssues > 0) displayText += 'L';
        if (secondDegreeIssues > 0) displayText += 'S';
        if (overproductionIssues > 0) displayText += 'O';
        
        return (
          <span className="text-red-600 font-bold" title={issues.map(i => i.message).join(', ')}>
            {displayText || '!'}
          </span>
        );
      },
      hidden: isMobile && !showFullView
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: 120,
      render: (item: JobOrderSummary) => (
        <div className="flex gap-1">
          <Link to={`/job-orders/${item.job_order_id}`} title={t('jobOrders.viewProductionDetails')}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-gray-100"
            >
              <Eye className="w-4 h-4 text-gray-600" />
            </Button>
          </Link>
          {canManageJobOrders && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 hover:bg-orange-100"
              onClick={() => handleArchiveSingle(item.job_order_id)}
              title={t('jobOrders.archiveJobOrder')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </Button>
          )}
        </div>
      ),
      hidden: false
    }
  ];

  const hasActiveFilters = Object.values(filters).some(value => value !== '');

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('jobOrders.title')}</h1>
        <p className="text-gray-600">
          {t('jobOrders.subtitle')}
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Filter Controls */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">{t('barcodeManagement.filters')}</h2>
            <Button
              onClick={handleClearFilters}
              variant="outline"
              size="sm"
              className="text-amber-700 border-amber-400 bg-amber-50 hover:text-amber-800 hover:bg-amber-100 hover:border-amber-500 hover:shadow-md transition-all duration-200 font-medium"
            >
              {t('barcodeManagement.clearFilters')}
            </Button>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="form-group">
                <SearchableDropdown
                  label={t('jobOrders.jobOrderNumber')}
                  options={jobOrderOptions}
                  value={filters.job_order_number}
                  onChange={(value) => handleFilterChange('job_order_number', value)}
                  placeholder={t('jobOrders.placeholders.jobOrderNumber')}
                />
              </div>
              
              <div className="form-group">
                <SearchableDropdown
                  label={t('jobOrders.modelName')}
                  options={modelOptions}
                  value={filters.model_name}
                  onChange={(value) => handleFilterChange('model_name', value)}
                  placeholder={t('jobOrders.placeholders.modelName')}
                />
              </div>
              
              <div className="form-group">
                <SearchableDropdown
                  label={t('jobOrders.clientName')}
                  options={brandOptions}
                  value={filters.client_name}
                  onChange={(value) => handleFilterChange('client_name', value)}
                  placeholder={t('jobOrders.placeholders.clientName')}
                />
              </div>
            </div>
            
            {canManageJobOrders && (
              <div className="form-group">
                <label className="text-sm font-medium text-gray-700 mb-2 block">{t('common.actions')}</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleOpenPriorityModal}
                    variant="outline"
                    className="min-w-[140px] sm:flex-1"
                  >
                    <ArrowUpDown className="h-4 w-4 mr-2" />
                    <span className="whitespace-nowrap">{t('jobOrders.priority.title', 'Prioritize')}</span>
                  </Button>
                  <Button
                    onClick={handleAddJobOrder}
                    className="min-w-[140px] sm:flex-1 text-white font-medium"
                    style={{ backgroundColor: 'rgb(17, 139, 80)', borderColor: 'rgb(17, 139, 80)', color: '#fff', fontWeight: 500 }}
                  >
                    <span className="whitespace-nowrap">{t('jobOrders.addJobOrder')}</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Archive Action Button */}
        {canManageJobOrders && selectedJobOrders.length > 0 && (
          <div className="mb-6 text-center">
            <button
              onClick={handleArchiveSelected}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-orange-600 border border-transparent rounded-md hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all duration-200 ease-in-out"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              {t('jobOrders.archiveSelected', { count: selectedJobOrders.length })}
            </button>
          </div>
        )}
        
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
              <h3 className="text-lg font-semibold text-green-700">{t('jobOrders.openOrders')}</h3>
              <div className="text-sm text-gray-600">
                {t('jobOrders.openOrdersShowing', { count: openJobOrders.length, total: totalOpenJobOrders })}
              </div>
            </div>
            
            {/* Issues Legend */}
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('jobOrders.issueIndicators')}</h4>
              <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-red-600 font-bold">P</span>
                  <span className="text-gray-600">{t('jobOrders.issueLegend.P')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-600 font-bold">T</span>
                  <span className="text-gray-600">{t('jobOrders.issueLegend.T')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-600 font-bold">L</span>
                  <span className="text-gray-600">{t('jobOrders.issueLegend.L')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-600 font-bold">S</span>
                  <span className="text-gray-600">{t('jobOrders.issueLegend.S')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-red-600 font-bold">O</span>
                  <span className="text-gray-600">{t('jobOrders.issueLegend.O')}</span>
                </div>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">{t('jobOrders.loadingOpenOrders')}</p>
              </div>
            ) : (
              <>
                <div className="table-container mb-4 w-full">
                  <div className="overflow-x-auto w-full">
                    {openJobOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        {hasActiveFilters 
                          ? t('jobOrders.noOpenOrdersFilteredAlt')
                          : t('jobOrders.noOpenOrdersAlt')
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
              {t('jobOrders.editJobOrderWithNumber', { jobOrderNumber: editingJobOrder?.job_order_number })}
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

      <PriorityModal
        open={priorityModalOpen}
        onOpenChange={setPriorityModalOpen}
        jobOrders={allJobOrdersForPriority}
        onSave={handleSavePriorities}
      />

    </Layout>
  );
};

export default JobOrdersPage; 