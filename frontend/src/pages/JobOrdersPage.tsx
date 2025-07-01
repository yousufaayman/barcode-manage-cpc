import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { jobOrderApi, JobOrder } from '../services/api';
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
import { Plus, Search, Filter, X, Package, CheckCircle, Edit } from 'lucide-react';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown, { EditableDropdown } from '../components/SearchableDropdown';
import { useToast } from '../hooks/use-toast';
import { Label } from '../components/ui/label';

interface JobOrderSummary {
  job_order_id: number;
  job_order_number: string;
  model_name: string;
  total_colors: number;
  total_quantity: number;
  total_working_quantity: number;
  completion_percentage: number;
  closed: boolean;
}

const JobOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [openJobOrders, setOpenJobOrders] = useState<JobOrderSummary[]>([]);
  const [closedJobOrders, setClosedJobOrders] = useState<JobOrderSummary[]>([]);
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
    model_name: ''
  });
  
  // Dropdown options
  const [jobOrderOptions, setJobOrderOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  
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
    items: [{ color_name: '', size_value: '', quantity: 1 }]
  });
  
  // Existing options for dropdowns
  const [existingColors, setExistingColors] = useState<string[]>([]);
  const [existingSizes, setExistingSizes] = useState<string[]>([]);
  const [existingModels, setExistingModels] = useState<string[]>([]);
  
  // Items per page
  const itemsPerPage = 50;
  
  // Calculate total pages
  const totalPagesOpen = Math.ceil(totalOpenJobOrders / itemsPerPage);
  const totalPagesClosed = Math.ceil(totalClosedJobOrders / itemsPerPage);

  // Fetch open job orders from the database with filters and pagination
  useEffect(() => {
    const fetchOpenJobOrders = async () => {
      try {
        setLoading(true);
        const skip = (currentPage - 1) * itemsPerPage;
        
        // Fetch open job orders only
        const openResponse = await jobOrderApi.getAll({
          skip,
          limit: itemsPerPage,
          closed: false,
          ...Object.fromEntries(
            Object.entries(filters).filter(([_, value]) => value !== '')
          )
        });
        
        // Transform open job orders data
        const transformedOpenData: JobOrderSummary[] = openResponse.items.map((jobOrder: JobOrder) => {
          const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
          const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
          const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
          
          return {
            job_order_id: jobOrder.job_order_id,
            job_order_number: jobOrder.job_order_number,
            model_name: jobOrder.model_name || 'Unknown',
            total_colors: jobOrder.items.length,
            total_quantity: totalQuantity,
            total_working_quantity: totalWorkingQuantity,
            completion_percentage: completionPercentage,
            closed: jobOrder.closed
          };
        });
        
        setOpenJobOrders(transformedOpenData);
        setTotalOpenJobOrders(openResponse.total);
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

    fetchOpenJobOrders();
  }, [currentPage, filters, t, toast]);

  // Fetch dropdown options
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const response = await jobOrderApi.getAllSimple();
        
        // Extract unique job order numbers and model names
        const jobOrderNumbers = [...new Set(response.map(jo => jo.job_order_number))];
        const modelNames = [...new Set(response.map(jo => jo.model_name).filter(name => name))];
        
        setJobOrderOptions(jobOrderNumbers);
        setModelOptions(modelNames);
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
          jobOrderApi.getExistingModels()
        ]);
        
        setExistingColors(colors);
        setExistingSizes(sizes);
        setExistingModels(models);
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
      model_name: ''
    });
    setCurrentPage(1);
  };

  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  const handlePageChangeClosed = (pageNumber: number) => {
    setCurrentPageClosed(pageNumber);
  };

  // Refresh closed orders when pagination changes
  useEffect(() => {
    if (showClosedOrders) {
      handleLoadClosedOrders();
    }
  }, [currentPageClosed, filters]);

  const handleAddJobOrder = () => {
    setAddDialogOpen(true);
  };

  const handleLoadClosedOrders = async () => {
    if (showClosedOrders) return; // Already loaded
    
    try {
      setLoadingClosed(true);
      const skip = (currentPageClosed - 1) * itemsPerPage;
      
      // Fetch closed job orders
      const closedResponse = await jobOrderApi.getAll({
        skip,
        limit: itemsPerPage,
        closed: true,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      
      // Transform closed job orders data
      const transformedClosedData: JobOrderSummary[] = closedResponse.items.map((jobOrder: JobOrder) => {
        const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
        const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
        
        return {
          job_order_id: jobOrder.job_order_id,
          job_order_number: jobOrder.job_order_number,
          model_name: jobOrder.model_name || 'Unknown',
          total_colors: jobOrder.items.length,
          total_quantity: totalQuantity,
          total_working_quantity: totalWorkingQuantity,
          completion_percentage: completionPercentage,
          closed: jobOrder.closed
        };
      });
      
      setClosedJobOrders(transformedClosedData);
      setTotalClosedJobOrders(closedResponse.total);
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
      
      // Refresh both tables
      const skip = (currentPage - 1) * itemsPerPage;
      
      // Fetch updated open job orders
      const openResponse = await jobOrderApi.getAll({
        skip,
        limit: itemsPerPage,
        closed: false,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      
      // Fetch updated closed job orders
      const skipClosed = (currentPageClosed - 1) * itemsPerPage;
      const closedResponse = await jobOrderApi.getAll({
        skip: skipClosed,
        limit: itemsPerPage,
        closed: true,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      
      // Transform open job orders data
      const transformedOpenData: JobOrderSummary[] = openResponse.items.map((jobOrder: JobOrder) => {
        const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
        const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
        
        return {
          job_order_id: jobOrder.job_order_id,
          job_order_number: jobOrder.job_order_number,
          model_name: jobOrder.model_name || 'Unknown',
          total_colors: jobOrder.items.length,
          total_quantity: totalQuantity,
          total_working_quantity: totalWorkingQuantity,
          completion_percentage: completionPercentage,
          closed: jobOrder.closed
        };
      });
      
      // Transform closed job orders data
      const transformedClosedData: JobOrderSummary[] = closedResponse.items.map((jobOrder: JobOrder) => {
        const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
        const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
        
        return {
          job_order_id: jobOrder.job_order_id,
          job_order_number: jobOrder.job_order_number,
          model_name: jobOrder.model_name || 'Unknown',
          total_colors: jobOrder.items.length,
          total_quantity: totalQuantity,
          total_working_quantity: totalWorkingQuantity,
          completion_percentage: completionPercentage,
          closed: jobOrder.closed
        };
      });
      
      setOpenJobOrders(transformedOpenData);
      setClosedJobOrders(transformedClosedData);
      setTotalOpenJobOrders(openResponse.total);
      setTotalClosedJobOrders(closedResponse.total);
      
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

  const handleToggleClosed = (jobOrder: JobOrderSummary) => {
    setConfirmingJobOrder(jobOrder);
    setConfirmAction(jobOrder.closed ? 'reopen' : 'close');
    setConfirmDialogOpen(true);
  };

  const handleConfirmToggleClosed = async () => {
    if (!confirmingJobOrder || !confirmAction) return;
    
    try {
      setEditLoading(true);
      
      // Toggle the closed status
      const newClosedStatus = !confirmingJobOrder.closed;
      
      // Call the API to update the job order
      await jobOrderApi.update(confirmingJobOrder.job_order_id, {
        closed: newClosedStatus
      });
      
      // Refresh open job orders
      const skip = (currentPage - 1) * itemsPerPage;
      const openResponse = await jobOrderApi.getAll({
        skip,
        limit: itemsPerPage,
        closed: false,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });
      
      // Transform and update open job orders
      const transformedOpenData: JobOrderSummary[] = openResponse.items.map((jobOrder: JobOrder) => {
        const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
        const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
        
        return {
          job_order_id: jobOrder.job_order_id,
          job_order_number: jobOrder.job_order_number,
          model_name: jobOrder.model_name || 'Unknown',
          total_colors: jobOrder.items.length,
          total_quantity: totalQuantity,
          total_working_quantity: totalWorkingQuantity,
          completion_percentage: completionPercentage,
          closed: jobOrder.closed
        };
      });
      
      setOpenJobOrders(transformedOpenData);
      setTotalOpenJobOrders(openResponse.total);
      
      // If closed orders are loaded, refresh them too
      if (showClosedOrders) {
        const skipClosed = (currentPageClosed - 1) * itemsPerPage;
        const closedResponse = await jobOrderApi.getAll({
          skip: skipClosed,
          limit: itemsPerPage,
          closed: true,
          ...Object.fromEntries(
            Object.entries(filters).filter(([_, value]) => value !== '')
          )
        });
        
        const transformedClosedData: JobOrderSummary[] = closedResponse.items.map((jobOrder: JobOrder) => {
          const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
          const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
          const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
          
          return {
            job_order_id: jobOrder.job_order_id,
            job_order_number: jobOrder.job_order_number,
            model_name: jobOrder.model_name || 'Unknown',
            total_colors: jobOrder.items.length,
            total_quantity: totalQuantity,
            total_working_quantity: totalWorkingQuantity,
            completion_percentage: completionPercentage,
            closed: jobOrder.closed
          };
        });
        
        setClosedJobOrders(transformedClosedData);
        setTotalClosedJobOrders(closedResponse.total);
      }
      
      toast({
        title: t('common.success'),
        description: `Job order ${newClosedStatus ? 'closed' : 'opened'} successfully`,
      });
    } catch (error) {
      console.error('Error toggling job order status:', error);
      toast({
        title: t('common.error'),
        description: 'Failed to update job order status',
        variant: 'destructive'
      });
    } finally {
      setEditLoading(false);
      setConfirmDialogOpen(false);
      setConfirmingJobOrder(null);
      setConfirmAction(null);
    }
  };

  const handleCancelToggleClosed = () => {
    setConfirmDialogOpen(false);
    setConfirmingJobOrder(null);
    setConfirmAction(null);
  };

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

    if (!newJobOrder.model_name.trim()) {
      toast({
        title: t('common.error'),
        description: t('jobOrders.validationErrors.modelNameRequired'),
        variant: 'destructive'
      });
      return;
    }

    // Validate items
    for (let i = 0; i < newJobOrder.items.length; i++) {
      const item = newJobOrder.items[i];
      if (!item.color_name.trim()) {
        toast({
          title: t('common.error'),
          description: t('jobOrders.validationErrors.colorRequired', { itemNumber: i + 1 }),
          variant: 'destructive'
        });
        return;
      }
      if (!item.size_value.trim()) {
        toast({
          title: t('common.error'),
          description: t('jobOrders.validationErrors.sizeRequired', { itemNumber: i + 1 }),
          variant: 'destructive'
        });
        return;
      }
      if (item.quantity <= 0) {
        toast({
          title: t('common.error'),
          description: t('jobOrders.validationErrors.quantityRequired', { itemNumber: i + 1 }),
          variant: 'destructive'
        });
        return;
      }
    }

    try {
      setAddLoading(true);
      
      // Create the job order
      await jobOrderApi.createWithNames({
        job_order_number: newJobOrder.job_order_number.trim(),
        model_name: newJobOrder.model_name.trim(),
        items: newJobOrder.items.map(item => ({
          color_name: item.color_name.trim(),
          size_value: item.size_value.trim(),
          quantity: item.quantity
        })),
        closed: false
      });

      // Close dialog and reset form
      setAddDialogOpen(false);
      setNewJobOrder({
        job_order_number: '',
        model_name: '',
        items: [{ color_name: '', size_value: '', quantity: 1 }]
      });

      // Refresh the open job orders list
      const skip = (currentPage - 1) * itemsPerPage;
      const openResponse = await jobOrderApi.getAll({
        skip,
        limit: itemsPerPage,
        closed: false,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });

      const transformedOpenData: JobOrderSummary[] = openResponse.items.map((jobOrder: JobOrder) => {
        const totalQuantity = jobOrder.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalWorkingQuantity = jobOrder.total_working_quantity || 0;
        const completionPercentage = totalQuantity > 0 ? Math.round((totalWorkingQuantity / totalQuantity) * 100) : 0;
        
        return {
          job_order_id: jobOrder.job_order_id,
          job_order_number: jobOrder.job_order_number,
          model_name: jobOrder.model_name || 'Unknown',
          total_colors: jobOrder.items.length,
          total_quantity: totalQuantity,
          total_working_quantity: totalWorkingQuantity,
          completion_percentage: completionPercentage,
          closed: jobOrder.closed
        };
      });

      setOpenJobOrders(transformedOpenData);
      setTotalOpenJobOrders(openResponse.total);

      toast({
        title: t('common.success'),
        description: t('jobOrders.jobOrderCreated'),
      });
    } catch (error: any) {
      console.error('Error creating job order:', error);
      toast({
        title: t('common.error'),
        description: error.response?.data?.detail || t('jobOrders.failedToCreate'),
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
      items: [{ color_name: '', size_value: '', quantity: 1 }]
    });
  };

  // Table columns configuration
  const columns = [
    {
      key: 'job_order_number',
      header: t('barcode.jobOrderNumber'),
      width: 200
    },
    {
      key: 'model_name',
      header: t('barcode.model'),
      width: 200,
      hidden: isMobile && !showFullView
    },
    {
      key: 'total_colors',
      header: 'Total Colors',
      width: 150,
      hidden: isMobile && !showFullView,
      render: (item: JobOrderSummary) => (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          {item.total_colors}
        </Badge>
      )
    },
    {
      key: 'total_quantity',
      header: t('barcode.quantity'),
      width: 150,
      render: (item: JobOrderSummary) => (
        <span className="font-medium text-gray-900">{item.total_quantity.toLocaleString()}</span>
      )
    },
    {
      key: 'total_working_quantity',
      header: t('barcode.workingQuantity'),
      width: 150,
      render: (item: JobOrderSummary) => (
        <span className="font-medium text-green-600">{item.total_working_quantity.toLocaleString()}</span>
      )
    },
    {
      key: 'completion_percentage',
      header: t('barcode.progress'),
      width: 150,
      render: (item: JobOrderSummary) => {
        const percentage = item.completion_percentage;
        const isCompleted = percentage >= 100;
        const isOverQuantity = item.total_working_quantity > item.total_quantity;
        const isBelowThreshold = percentage < 97; // Below 97% (3% below 100%)
        
        // Determine color based on conditions
        let barColor = 'bg-blue-500'; // Default blue
        let textColor = 'text-gray-600';
        
        if (isOverQuantity) {
          barColor = 'bg-red-500'; // Red for over quantity
          textColor = 'text-red-600';
        } else if (isBelowThreshold) {
          barColor = 'bg-red-500'; // Red for below threshold
          textColor = 'text-red-600';
        } else if (isCompleted) {
          barColor = 'bg-green-500'; // Green for completed
          textColor = 'text-green-600';
        }
        
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-medium ${textColor}`}>
              {isCompleted && !isOverQuantity ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                `${percentage}%`
              )}
            </span>
          </div>
        );
      }
    },
    {
      key: 'closed',
      header: 'Status',
      width: 120,
      hidden: isMobile && !showFullView,
      render: (item: JobOrderSummary) => (
        <Badge 
          variant={item.closed ? "secondary" : "default"}
          className={item.closed ? "bg-gray-100 text-gray-800" : "bg-green-100 text-green-800"}
        >
          {item.closed ? 'Closed' : 'Open'}
        </Badge>
      )
    },
    {
      key: 'actions',
      header: t('common.actions'),
      width: 200,
      hidden: isMobile && !showFullView,
      render: (item: JobOrderSummary) => (
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEditJobOrder(item)}
            disabled={editLoading}
          >
            <Edit className="w-4 h-4 mr-1" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleToggleClosed(item)}
            disabled={editLoading}
            className={item.closed ? "!bg-orange-600 !hover:bg-orange-700 !text-white" : "!bg-blue-600 !hover:bg-blue-700 !text-white"}
          >
            {item.closed ? 'Reopen' : 'Close'}
          </Button>
        </div>
      )
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="form-group">
              <label htmlFor="job_order_number" className="text-sm font-medium text-gray-700">Job Order Number</label>
              <SearchableDropdown
                options={jobOrderOptions}
                value={filters.job_order_number}
                onChange={(value) => handleFilterChange('job_order_number', value)}
                placeholder="Search job order number..."
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="model_name" className="text-sm font-medium text-gray-700">Model Name</label>
              <SearchableDropdown
                options={modelOptions}
                value={filters.model_name}
                onChange={(value) => handleFilterChange('model_name', value)}
                placeholder="Search model name..."
              />
            </div>
            
            <div className="form-group">
              <label className="text-sm font-medium text-gray-700">Actions</label>
              <Button
                onClick={handleAddJobOrder}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium"
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
                      height={400}
                      rowHeight={48}
                      showAllColumns={showFullView}
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

        {/* Load Closed Orders Button */}
        {!showClosedOrders && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-700">Closed Job Orders</h3>
              <Button
                onClick={handleLoadClosedOrders}
                disabled={loadingClosed}
                variant="outline"
                className="text-gray-600 hover:text-gray-800"
              >
                {loadingClosed ? 'Loading...' : 'Load Closed Orders'}
              </Button>
            </div>
          </div>
        )}

        {/* Mobile Full View Toggle for Closed Job Orders */}
        {isMobile && showClosedOrders && (
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => setShowFullViewClosed(!showFullViewClosed)}
              className="w-full"
            >
              {showFullViewClosed ? t('barcodeManagement.compactView') : t('barcodeManagement.fullView')} - Closed Orders
            </Button>
          </div>
        )}

        {/* Closed Job Orders Section */}
        {showClosedOrders && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-700">Closed Job Orders</h3>
              <div className="text-sm text-gray-600">
                Showing {closedJobOrders.length} of {totalClosedJobOrders} closed job orders
              </div>
            </div>
            
            {loadingClosed ? (
              <div className="text-center py-10">
                <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-gray-600">Loading closed job orders...</p>
              </div>
            ) : (
              <>
                <div className="table-container mb-4 w-full">
                  <div className="overflow-x-auto w-full">
                    {closedJobOrders.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        {hasActiveFilters 
                          ? "No closed job orders match your current filters."
                          : "No closed job orders found."
                        }
                      </div>
                    ) : (
                      <VirtualizedTable
                        columns={columns}
                        data={closedJobOrders}
                        height={400}
                        rowHeight={48}
                        showAllColumns={showFullViewClosed}
                      />
                    )}
                  </div>
                </div>
                {totalPagesClosed > 0 && (
                  <div className="flex justify-center mt-4">
                    <nav className="flex items-center space-x-2">
                      <button
                        onClick={() => handlePageChangeClosed(currentPageClosed - 1)}
                        disabled={currentPageClosed === 1}
                        className="px-3 py-1 rounded border disabled:opacity-50"
                      >
                        {t('common.previous')}
                      </button>
                      {Array.from({ length: Math.min(5, totalPagesClosed) }, (_, i) => {
                        let pageNumber;
                        if (totalPagesClosed <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPageClosed <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPageClosed >= totalPagesClosed - 2) {
                          pageNumber = totalPagesClosed - 4 + i;
                        } else {
                          pageNumber = currentPageClosed - 2 + i;
                        }
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => handlePageChangeClosed(pageNumber)}
                            className={`px-3 py-1 rounded border ${currentPageClosed === pageNumber ? 'bg-green text-white' : ''}`}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handlePageChangeClosed(currentPageClosed + 1)}
                        disabled={currentPageClosed === totalPagesClosed}
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
      </div>

      {/* Edit Job Order Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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

      {/* Confirmation Dialog for Close/Reopen */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'close' ? 'Close Job Order' : 'Reopen Job Order'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'close' 
                ? `Are you sure you want to close job order "${confirmingJobOrder?.job_order_number}"? This will mark it as completed.`
                : `Are you sure you want to reopen job order "${confirmingJobOrder?.job_order_number}"? This will mark it as active again.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelToggleClosed}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmToggleClosed}
              className={confirmAction === 'close' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-orange-600 hover:bg-orange-700'}
            >
              {confirmAction === 'close' ? 'Close Job Order' : 'Reopen Job Order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Job Order Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                <Label htmlFor="model-name">{t('jobOrders.modelName')} *</Label>
                <EditableDropdown
                  value={newJobOrder.model_name}
                  onValueChange={(value) => setNewJobOrder(prev => ({ ...prev, model_name: value }))}
                  options={existingModels}
                  placeholder={t('jobOrders.modelName')}
                  disabled={addLoading}
                />
              </div>
            </div>

            {/* Job Order Items */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">{t('jobOrders.jobOrderItems')}</h3>
                <Button
                  type="button"
                  onClick={handleAddJobOrderItem}
                  disabled={addLoading}
                  variant="outline"
                  size="sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('jobOrders.addItem')}
                </Button>
              </div>
              
              <div className="space-y-3">
                {newJobOrder.items.map((item, index) => (
                  <div key={index} className="border rounded-lg p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">{t('jobOrders.item')} {index + 1}</h4>
                      {newJobOrder.items.length > 1 && (
                        <Button
                          type="button"
                          onClick={() => handleRemoveJobOrderItem(index)}
                          disabled={addLoading}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`color-${index}`}>{t('jobOrders.color')} *</Label>
                        <EditableDropdown
                          value={item.color_name}
                          onValueChange={(value) => handleUpdateJobOrderItem(index, 'color_name', value)}
                          options={existingColors}
                          placeholder={t('jobOrders.color')}
                          disabled={addLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`size-${index}`}>{t('jobOrders.size')} *</Label>
                        <EditableDropdown
                          value={item.size_value}
                          onValueChange={(value) => handleUpdateJobOrderItem(index, 'size_value', value)}
                          options={existingSizes}
                          placeholder={t('jobOrders.size')}
                          disabled={addLoading}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`quantity-${index}`}>{t('jobOrders.quantity')} *</Label>
                        <Input
                          id={`quantity-${index}`}
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleUpdateJobOrderItem(index, 'quantity', parseInt(e.target.value) || 1)}
                          placeholder={t('jobOrders.quantity')}
                          disabled={addLoading}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Total Quantity */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <span className="font-medium text-lg">{t('jobOrders.totalQuantityLabel')}</span>
                <span className="font-bold text-xl text-green-600">
                  {newJobOrder.items.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()}
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