import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api, { jobOrderApi } from '../services/api';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown from '../components/SearchableDropdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Link } from 'react-router-dom';

interface ArchivedBatch {
  batch_id: number;
  job_order_id: number;
  job_order_number?: string;
  barcode: string;
  client_name?: string | null;
  model_name: string;
  size_value: string;
  color_name: string;
  quantity: number;
  layers: number;
  serial: number | string;
  phase_name: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  last_updated_at: string;
  archived_at: string;
}

interface ArchivedJobOrder {
  job_order_id: number;
  model_id: number;
  job_order_number: string;
  client_id?: number | null;
  image_url?: string | null;
  notes?: string | null;
  date_created: string;
  archived_at?: string | null;
  model_name?: string | null;
  client_name?: string | null;
}

interface ArchivedJobOrderItem {
  item_id: number;
  job_order_id: number;
  job_order_number?: string | null;
  color_id: number;
  size_id: number;
  quantity: number;
  weight?: number | null;
  notes?: string | null;
  archived_at: string;
  color_name?: string | null;
  size_value?: string | null;
}

const ArchivePage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  // Tabs
  const [activeTab, setActiveTab] = useState<'job-orders' | 'items' | 'batches'>('job-orders');

  // Archived Job Orders state
  const [archivedJobOrders, setArchivedJobOrders] = useState<ArchivedJobOrder[]>([]);
  const [loadingJobOrders, setLoadingJobOrders] = useState(false);
  const [jobOrdersPage, setJobOrdersPage] = useState(1);
  const jobOrdersPerPage = 50;
  const [jobOrderFilters, setJobOrderFilters] = useState({
    job_order_number: '',
    model_name: '',
    client_name: ''
  });
  const [jobOrderOptions, setJobOrderOptions] = useState<string[]>([]);

  // Archived Items state
  const [selectedJobOrderForItems, setSelectedJobOrderForItems] = useState<string | null>(null);
  const [archivedItems, setArchivedItems] = useState<ArchivedJobOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [allArchivedItems, setAllArchivedItems] = useState<ArchivedJobOrderItem[]>([]);
  const [loadingAllItems, setLoadingAllItems] = useState(false);

  // Archived Batches state
  const [barcodes, setBarcodes] = useState<ArchivedBatch[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBarcodes, setTotalBarcodes] = useState(0);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  
  // Dropdown options state for batches filters
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  
  const [filters, setFilters] = useState({
    barcode: '',
    client: '',
    model: '',
    size: '',
    color: '',
    phase: '',
    status: '',
    job_order_number: ''
  });

  // Items per page for batches
  const itemsPerPage = 50;

  // Fetch dropdown options (brands/sizes/colors) + archived job order options
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const [brandsResponse, sizesResponse, colorsResponse, archivedJOs, allArchivedItems] = await Promise.all([
          api.get('/batches/brands/'),
          api.get('/batches/sizes/'),
          api.get('/batches/colors/'),
          api.get('/job-orders/archive/job-orders/', { params: { skip: 0, limit: 10000, include_partial: true } }),
          jobOrderApi.getAllArchivedItems({ skip: 0, limit: 10000 })
        ]);
        
        const filterValidOptions = (items: any[], nameKey: string) => 
          items
            .map(item => item[nameKey])
            .filter(value => value && value.toLowerCase() !== 'none' && value.toLowerCase() !== 'null' && value.trim() !== '');
        
        setBrandOptions(filterValidOptions(brandsResponse.data, 'brand_name'));
        setSizeOptions(filterValidOptions(sizesResponse.data, 'size_value'));
        setColorOptions(filterValidOptions(colorsResponse.data, 'color_name'));

        // Get job order numbers from both fully archived job orders and job orders with archived items
        const archivedJONumbers = Array.isArray(archivedJOs.data) ? archivedJOs.data.map((jo: ArchivedJobOrder) => jo.job_order_number) : [];
        const itemsJONumbers = allArchivedItems.map((item: ArchivedJobOrderItem) => item.job_order_number).filter(Boolean);
        
        console.log('Archived job order numbers:', archivedJONumbers);
        console.log('Items job order numbers:', itemsJONumbers);
        
        // Combine and deduplicate
        const allJONumbers = [...archivedJONumbers, ...itemsJONumbers];
        const finalOptions = [...new Set(allJONumbers)].sort();
        console.log('Final job order options:', finalOptions);
        setJobOrderOptions(finalOptions);
      } catch (error) {
        console.error('Error fetching dropdown options:', error);
      }
    };

    fetchDropdownOptions();
  }, []);

  // Fetch archived job orders
  useEffect(() => {
    const fetchArchivedJobOrders = async () => {
      try {
        setLoadingJobOrders(true);
        const skip = (jobOrdersPage - 1) * jobOrdersPerPage;
        const params: any = {
          skip,
          limit: jobOrdersPerPage,
          include_partial: true,
          ...Object.fromEntries(Object.entries(jobOrderFilters).filter(([_, v]) => v !== ''))
        };
        console.log('Fetching archived job orders with params:', params);
        const response = await api.get('/job-orders/archive/job-orders/', { params });
        console.log('Archived job orders response:', response.data);
        console.log('Job orders with archived_at:', response.data.filter((jo: ArchivedJobOrder) => jo.archived_at));
        console.log('Job orders without archived_at:', response.data.filter((jo: ArchivedJobOrder) => !jo.archived_at));
        setArchivedJobOrders(response.data);
      } catch (error) {
        console.error('Error fetching archived job orders:', error);
      } finally {
        setLoadingJobOrders(false);
      }
    };
    fetchArchivedJobOrders();
  }, [jobOrdersPage, jobOrderFilters]);

  // Fetch archived items for selected job order
  useEffect(() => {
    const fetchArchivedItems = async () => {
      if (!selectedJobOrderForItems) {
        setArchivedItems([]);
        return;
      }
      try {
        setLoadingItems(true);
        // Get all archived items and filter by job order number
        const response = await jobOrderApi.getAllArchivedItems();
        const filteredItems = response.filter(item => item.job_order_number === selectedJobOrderForItems);
        setArchivedItems(filteredItems);
      } catch (error) {
        console.error('Error fetching archived job order items:', error);
      } finally {
        setLoadingItems(false);
      }
    };
    fetchArchivedItems();
  }, [selectedJobOrderForItems]);

  // Fetch all archived items
  useEffect(() => {
    const fetchAllArchivedItems = async () => {
      try {
        setLoadingAllItems(true);
        console.log('Fetching all archived items...');
        const response = await jobOrderApi.getAllArchivedItems();
        console.log('Archived items response:', response);
        setAllArchivedItems(response);
      } catch (error) {
        console.error('Error fetching all archived items:', error);
      } finally {
        setLoadingAllItems(false);
      }
    };
    fetchAllArchivedItems();
  }, []);

  // Fetch archived batches
  useEffect(() => {
    const fetchArchivedBarcodes = async () => {
      try {
        setLoadingBatches(true);
        const skip = (currentPage - 1) * itemsPerPage;
        const activeFilters = Object.fromEntries(Object.entries(filters).filter(([_, value]) => value !== ''));
        console.log('Current filters:', activeFilters);
        
        const queryParams = new URLSearchParams({
          skip: skip.toString(),
          limit: itemsPerPage.toString(),
          archived: 'true',
          ...activeFilters
        });
        
        console.log('Fetching archived batches with query params:', queryParams.toString());
        const response = await api.get(`/batches/?${queryParams.toString()}`);
        console.log('Archived batches response:', response.data);
        console.log('Total archived batches:', response.data.total);
        console.log('Archived batches items:', response.data.items.length);
        setBarcodes(response.data.items);
        setTotalBarcodes(response.data.total);
        setSelectedBarcodes([]);
      } catch (error) {
        console.error('Error fetching archived barcodes:', error);
      } finally {
        setLoadingBatches(false);
      }
    };

    fetchArchivedBarcodes();
  }, [currentPage, filters]);

  // Handlers common
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  const handleDropdownFilterChange = (field: string, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      barcode: '',
      client: '',
      model: '',
      size: '',
      color: '',
      phase: '',
      status: '',
      job_order_number: ''
    });
    setCurrentPage(1);
  };

  // Selection in batches
  const handleSelectBarcode = useCallback((id: number) => {
    setSelectedBarcodes(prev => (prev.includes(id) ? prev.filter(barcodeId => barcodeId !== id) : [...prev, id]));
  }, []);
  
  const handleSelectAll = () => {
    if (selectedBarcodes.length === barcodes.length) {
      setSelectedBarcodes([]);
    } else {
      setSelectedBarcodes(barcodes.map(barcode => barcode.batch_id));
    }
  };

  // Bulk delete archived batches
  const handleBulkDelete = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToDelete'));
      return;
    }
    
    if (window.confirm(t('barcodeManagement.confirmBulkDelete', { count: selectedBarcodes.length }))) {
      try {
        const deletePromises = selectedBarcodes.map(async (id) => {
          try {
            await api.delete(`/batches/archived/${id}`);
            return { id, success: true };
          } catch (error: any) {
            return { id, success: false, error: error.response?.data?.detail || error.message || 'Unknown error' };
          }
        });

        const results = await Promise.all(deletePromises);
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        if (successful.length > 0) {
          setBarcodes(prev => prev.filter(barcode => !successful.some(s => s.id === barcode.batch_id)));
        }

        setSelectedBarcodes([]);

        if (failed.length === 0) {
          alert(`Successfully deleted ${successful.length} archived barcode(s).`);
        } else if (successful.length === 0) {
          alert(`Failed to delete any archived barcodes. Please try again.`);
        } else {
          alert(`Successfully deleted ${successful.length} archived barcode(s). Failed to delete ${failed.length} archived barcode(s).`);
        }

        if (failed.length > 0) {
          console.error('Failed deletions:', failed);
        }
      } catch (error) {
        console.error('Error during bulk delete:', error);
        alert(t('barcodeManagement.failedToDelete'));
      }
    }
  };

  // Bulk recovery archived batches
  const handleBulkRecovery = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToRecover'));
      return;
    }
    
    const confirmMessage = t('barcodeManagement.confirmBulkRecover', { count: selectedBarcodes.length }).replace('{count}', String(selectedBarcodes.length));
    
    if (window.confirm(confirmMessage)) {
      try {
        await api.post('/batches/archived/recover/bulk', { batch_ids: selectedBarcodes });
        setBarcodes(prev => prev.filter(barcode => !selectedBarcodes.includes(barcode.batch_id)));
        setSelectedBarcodes([]);
        
        const successMessage = t('barcodeManagement.successfullyRecovered', { count: selectedBarcodes.length }).replace('{count}', String(selectedBarcodes.length));
        alert(successMessage);
      } catch (error: any) {
        console.error('Error during bulk recovery:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.failedToRecover');
        alert(errorMessage);
      }
    }
  };

  // Restore job order
  const handleRestoreJobOrder = useCallback(async (jobOrderId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmRestoreJobOrder'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-job-order-id="${jobOrderId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        await jobOrderApi.restoreJobOrder(jobOrderId);
        alert(t('barcodeManagement.archive.jobOrderRestoredSuccess'));
        // Refresh the data by refetching
        setJobOrdersPage(1);
        setArchivedJobOrders([]);
        setAllArchivedItems([]);
        // Trigger a refetch
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error restoring job order:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToRestoreJobOrder');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-job-order-id="${jobOrderId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>`;
        }
      }
    }
  }, []);

  // Restore job order item
  const handleRestoreItem = useCallback(async (itemId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmRestoreItem'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-item-id="${itemId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        await jobOrderApi.restoreItem(itemId);
        alert(t('barcodeManagement.archive.itemRestoredSuccess'));
        // Refresh the data by refetching
        setAllArchivedItems([]);
        // Trigger a refetch
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error restoring item:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToRestoreItem');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-item-id="${itemId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>`;
        }
      }
    }
  }, []);

  // Delete job order (TOP LEVEL - deletes job order + all items + all batches)
  const handleDeleteJobOrder = useCallback(async (jobOrderId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmDeleteJobOrder'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-delete-job-order-id="${jobOrderId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        const result = await jobOrderApi.deleteArchivedJobOrder(jobOrderId);
        alert(t('barcodeManagement.archive.jobOrderDeletedSuccess', { deleted_items: result.deleted_items, deleted_batches: result.deleted_batches }));
        // Refresh the data
        setJobOrdersPage(1);
        setArchivedJobOrders([]);
        setAllArchivedItems([]);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error deleting job order:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToDeleteJobOrder');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-delete-job-order-id="${jobOrderId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>`;
        }
      }
    }
  }, []);

  // Delete job order item (MIDDLE LEVEL - deletes item + its batches, but NOT job order)
  const handleDeleteItem = useCallback(async (itemId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmDeleteItem'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-delete-item-id="${itemId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        const result = await jobOrderApi.deleteArchivedItem(itemId);
        alert(t('barcodeManagement.archive.itemDeletedSuccess', { deleted_batches: result.deleted_batches }));
        // Refresh the data
        setAllArchivedItems([]);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error deleting item:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToDeleteItem');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-delete-item-id="${itemId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>`;
        }
      }
    }
  }, []);

  // Recover batch (BOTTOM LEVEL - recovers batch + restores parent item/job order if needed)
  const handleRecoverBatch = useCallback(async (batchId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmRecoverBatch'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-recover-batch-id="${batchId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        await jobOrderApi.recoverBatch(batchId);
        alert(t('barcodeManagement.archive.batchRecoveredSuccess'));
        // Refresh the data
        setBarcodes([]);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error recovering batch:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToRecoverBatch');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-recover-batch-id="${batchId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>`;
        }
      }
    }
  }, []);

  // Delete batch (BOTTOM LEVEL - deletes only the batch, doesn't affect job order or item)
  const handleDeleteBatch = useCallback(async (batchId: number) => {
    if (window.confirm(t('barcodeManagement.archive.confirmDeleteBatch'))) {
      try {
        // Disable the button to prevent multiple clicks
        const button = document.querySelector(`[data-delete-batch-id="${batchId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = true;
          button.textContent = t('common.loading');
        }
        
        await jobOrderApi.deleteArchivedBatch(batchId);
        alert(t('barcodeManagement.archive.batchDeletedSuccess'));
        // Refresh the data
        setBarcodes([]);
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } catch (error: any) {
        console.error('Error deleting batch:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.archive.failedToDeleteBatch');
        alert(`Error: ${errorMessage}`);
        
        // Re-enable the button on error
        const button = document.querySelector(`[data-delete-batch-id="${batchId}"]`) as HTMLButtonElement;
        if (button) {
          button.disabled = false;
          button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>`;
        }
      }
    }
  }, []);

  // Pagination for batches
  const totalPages = Math.ceil(totalBarcodes / itemsPerPage);
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Columns: Archived Job Orders
  const jobOrderColumns = useMemo(() => {
    return [
      { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 160 },
      { key: 'client_name', header: t('barcodeManagement.archive.brand'), width: 140, render: (item: ArchivedJobOrder) => item.client_name || '—' },
      { key: 'model_name', header: t('bulkBarcode.model'), width: 160, render: (item: ArchivedJobOrder) => item.model_name || '—' },
      { key: 'date_created', header: t('common.created'), width: 160, render: (item: ArchivedJobOrder) => new Date(item.date_created).toLocaleString() },
      { 
        key: 'archived_at', 
        header: t('barcodeManagement.archive.archiveStatus'), 
        width: 160, 
        render: (item: ArchivedJobOrder) => {
          if (item.archived_at) {
            return (
              <span className="inline-block px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                {t('barcodeManagement.archive.fullyArchived')}
              </span>
            );
          } else {
            return (
              <span className="inline-block px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                {t('barcodeManagement.archive.partiallyArchived')}
              </span>
            );
          }
        }
      },
      {
        key: 'actions',
        header: t('common.actions'),
        width: 200,
        render: (item: ArchivedJobOrder) => {
          const isDisabled = !item.archived_at;
          return (
            <div className="flex space-x-2">
              <button
                onClick={() => handleRestoreJobOrder(item.job_order_id)}
                data-job-order-id={item.job_order_id}
                className={`px-2 py-1 text-sm rounded transition-colors ${
                  isDisabled 
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                    : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
                disabled={isDisabled}
                title={isDisabled ? t('barcodeManagement.archive.onlyFullyArchivedCanRestore') : t('barcodeManagement.archive.restoreJobOrder')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => handleDeleteJobOrder(item.job_order_id)}
                data-delete-job-order-id={item.job_order_id}
                className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                title={t('barcodeManagement.archive.deleteJobOrderConfirm')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          );
        }
      }
    ];
  }, [t, handleRestoreJobOrder, handleDeleteJobOrder]);

  // Columns: Archived Items
  const itemColumns = useMemo(() => {
    return [
      { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 160, render: (item: ArchivedJobOrderItem) => item.job_order_number || '—' },
      { key: 'color_name', header: t('bulkBarcode.color'), width: 120 },
      { key: 'size_value', header: t('bulkBarcode.size'), width: 120 },
      { key: 'quantity', header: t('barcode.quantity'), width: 100 },
      { key: 'notes', header: t('barcodeManagement.archive.notes'), width: 200, render: (item: ArchivedJobOrderItem) => item.notes || '' },
      { key: 'archived_at', header: t('barcodeManagement.archive.archivedAt'), width: 160, render: (item: ArchivedJobOrderItem) => new Date(item.archived_at).toLocaleString() },
      {
        key: 'actions',
        header: t('common.actions'),
        width: 200,
        render: (item: ArchivedJobOrderItem) => (
          <div className="flex space-x-2">
            <button
              onClick={() => handleRestoreItem(item.item_id)}
              data-item-id={item.item_id}
              className="px-2 py-1 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
              title={t('barcodeManagement.archive.restoreItem')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteItem(item.item_id)}
              data-delete-item-id={item.item_id}
              className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              title={t('barcodeManagement.archive.deleteItemConfirm')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )
      }
    ];
  }, [t, handleRestoreItem, handleDeleteItem]);

  // Columns: Archived Batches
  const batchColumns = useMemo(() => {
    const baseColumns = [
      {
        key: 'select',
        header: (
          <input
            type="checkbox"
            checked={selectedBarcodes.length === barcodes.length && barcodes.length > 0}
            onChange={handleSelectAll}
            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
          />
        ),
        width: 50,
        render: (item: ArchivedBatch) => (
          <input
            type="checkbox"
            checked={selectedBarcodes.includes(item.batch_id)}
            onChange={() => handleSelectBarcode(item.batch_id)}
            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
          />
        )
      },
      { key: 'barcode', header: t('barcode.barcode'), width: 150 },
      { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 120 },
      { key: 'client_name', header: t('bulkBarcode.client'), width: 120 },
      { key: 'model_name', header: t('bulkBarcode.model'), width: 120 },
      { key: 'size_value', header: t('bulkBarcode.size'), width: 100 },
      { key: 'color_name', header: t('bulkBarcode.color'), width: 100 },
      {
        key: 'quantity',
        header: t('barcode.quantity'),
        width: 100,
        render: (item: ArchivedBatch) => item.quantity
      },
      {
        key: 'layers',
        header: t('bulkBarcode.layers'),
        width: 100,
        render: (item: ArchivedBatch) => item.layers
      },
      {
        key: 'serial',
        header: t('bulkBarcode.serial'),
        width: 100,
        render: (item: ArchivedBatch) => item.serial
      },
      {
        key: 'phase_name',
        header: t('barcode.phase'),
        width: 120,
        render: (item: ArchivedBatch) => (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
            item.phase_name === 'Sewing' ? 'bg-purple-100 text-purple-800' :
            'bg-orange-100 text-orange-800'
          }`}>
            {t(`phases.${item.phase_name.toLowerCase()}`)}
          </span>
        )
      },
      {
        key: 'status',
        header: t('common.status'),
        width: 120,
        render: (item: ArchivedBatch) => (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
            item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {item.status === 'In Progress' ? t('status.inProgress') : item.status === 'Pending' ? t('status.pending') : t('status.completed')}
          </span>
        )
      },
      {
        key: 'last_updated_at',
        header: t('common.updated'),
        width: 150,
        render: (item: ArchivedBatch) => new Date(item.last_updated_at).toLocaleString()
      },
      {
        key: 'archived_at',
        header: t('barcodeManagement.archive.archivedAt'),
        width: 150,
        render: (item: ArchivedBatch) => new Date(item.archived_at).toLocaleString()
      },
      {
        key: 'actions',
        header: t('common.actions'),
        width: 200,
        render: (item: ArchivedBatch) => (
          <div className="flex space-x-2">
            <button
              onClick={() => handleRecoverBatch(item.batch_id)}
              data-recover-batch-id={item.batch_id}
              className="px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              title={t('barcodeManagement.archive.recoverBatch')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => handleDeleteBatch(item.batch_id)}
              data-delete-batch-id={item.batch_id}
              className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              title={t('barcodeManagement.archive.deleteBatchConfirm')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )
      }
    ];

    return baseColumns;
  }, [t, selectedBarcodes, barcodes.length, handleSelectBarcode, handleRecoverBatch, handleDeleteBatch]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('navigation.archive')}</h1>
        <p className="text-gray-600">{t('barcodeManagement.archive.subtitle')}</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="job-orders">{t('barcodeManagement.archive.tabs.jobOrders')}</TabsTrigger>
            <TabsTrigger value="items">{t('barcodeManagement.archive.tabs.items')}</TabsTrigger>
            <TabsTrigger value="batches">{t('barcodeManagement.archive.tabs.batches')}</TabsTrigger>
          </TabsList>

          {/* Archived Job Orders Tab */}
          <TabsContent value="job-orders">
            <div className="space-y-6">
              {/* Filters Section */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('barcodeManagement.archive.filters')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SearchableDropdown
                    options={jobOrderOptions}
                    value={jobOrderFilters.job_order_number}
                    onChange={(val) => { setJobOrderFilters(prev => ({ ...prev, job_order_number: val })); setJobOrdersPage(1); }}
                    placeholder="Job Order Number"
                    label="Job Order Number"
                  />
                  <SearchableDropdown
                    options={[...new Set(archivedJobOrders.map(jo => jo.model_name || '').filter(Boolean))] as string[]}
                    value={jobOrderFilters.model_name}
                    onChange={(val) => { setJobOrderFilters(prev => ({ ...prev, model_name: val })); setJobOrdersPage(1); }}
                    placeholder={t('bulkBarcode.model')}
                    label={t('bulkBarcode.model')}
                  />
                  <SearchableDropdown
                    options={[...new Set(archivedJobOrders.map(jo => jo.client_name || '').filter(Boolean))] as string[]}
                    value={jobOrderFilters.client_name}
                    onChange={(val) => { setJobOrderFilters(prev => ({ ...prev, client_name: val })); setJobOrdersPage(1); }}
                    placeholder={t('bulkBarcode.client')}
                    label={t('bulkBarcode.client')}
                  />
                </div>
              </div>

              {/* Table Section */}
              <div className="bg-white rounded-lg border">
                {loadingJobOrders ? (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-600">{t('barcodeManagement.archive.loadingArchivedJobOrders')}</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4">
                      {archivedJobOrders.length === 0 ? (
                        <div className="text-center py-8 text-gray-600">{t('barcodeManagement.archive.noArchivedJobOrdersFound')}</div>
                      ) : (
                        <VirtualizedTable
                          columns={jobOrderColumns}
                          data={archivedJobOrders}
                          height={600}
                          rowHeight={48}
                          showAllColumns={true}
                        />
                      )}
                    </div>
                    
                    {/* Pagination */}
                    <div className="border-t bg-gray-50 px-4 py-3">
                      <div className="flex justify-center space-x-2">
                        <button 
                          onClick={() => setJobOrdersPage(p => Math.max(1, p - 1))} 
                          disabled={jobOrdersPage === 1} 
                          className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-gray-100"
                        >
                          {t('common.previous')}
                        </button>
                        <div className="px-3 py-1 rounded border bg-green text-white">{jobOrdersPage}</div>
                        <button 
                          onClick={() => setJobOrdersPage(p => (archivedJobOrders.length < jobOrdersPerPage ? p : p + 1))} 
                          disabled={archivedJobOrders.length < jobOrdersPerPage} 
                          className="px-3 py-1 rounded border disabled:opacity-50 hover:bg-gray-100"
                        >
                          {t('common.next')}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Archived Items Tab */}
          <TabsContent value="items">
            <div className="space-y-6">
              {/* Selection Section */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 text-gray-800">{t('barcodeManagement.archive.filterOptions')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <SearchableDropdown
                    options={jobOrderOptions}
                    value={selectedJobOrderForItems || ''}
                    onChange={(val) => {
                      setSelectedJobOrderForItems(val || null);
                    }}
                    placeholder={t('barcodeManagement.archive.selectJobOrderOptional')}
                    label={t('barcodeManagement.archive.filterByJobOrder')}
                  />
                </div>
              </div>

              {/* Table Section */}
              <div className="bg-white rounded-lg border">
                {loadingAllItems ? (
                  <div className="text-center py-10">
                    <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-gray-600">{t('barcodeManagement.archive.loadingArchivedItems')}</p>
                  </div>
                ) : (
                  <div className="p-4">
                    {(() => {
                      const displayItems = selectedJobOrderForItems 
                        ? allArchivedItems.filter(item => item.job_order_number === selectedJobOrderForItems)
                        : allArchivedItems;
                      
                      if (displayItems.length === 0) {
                        return (
                          <div className="text-center py-8 text-gray-600">
                            {selectedJobOrderForItems 
                              ? t('barcodeManagement.archive.noArchivedItemsFoundForJobOrder')
                              : t('barcodeManagement.archive.noArchivedItemsFound')}
                          </div>
                        );
                      }
                      
                      return (
                        <VirtualizedTable
                          columns={itemColumns}
                          data={displayItems}
                          height={600}
                          rowHeight={48}
                          showAllColumns={true}
                        />
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Archived Batches Tab */}
          <TabsContent value="batches">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">{t('barcodeManagement.filters')}</h2>
            <div className="flex space-x-2">
              <button
                onClick={handleClearFilters}
                className="px-3 py-1 text-sm text-purple-700 border-2 border-purple-400 bg-purple-50 rounded-md hover:text-purple-800 hover:bg-purple-100 hover:border-purple-500 hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium"
              >
{t('barcodeManagement.clearFilters')}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label htmlFor="barcode" className="text-sm font-medium text-gray-700">{t('barcode.barcode')}</label>
              <input
                type="text"
                id="barcode"
                name="barcode"
                value={filters.barcode}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="job_order_number" className="text-sm font-medium text-gray-700">{t('barcode.jobOrderNumber')}</label>
              <input
                type="text"
                id="job_order_number"
                name="job_order_number"
                value={filters.job_order_number}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <SearchableDropdown
                options={brandOptions}
                value={filters.client}
                onChange={(value) => handleDropdownFilterChange('client', value)}
                placeholder={t('bulkBarcode.client')}
                label={t('bulkBarcode.client')}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="model" className="text-sm font-medium text-gray-700">{t('bulkBarcode.model')}</label>
              <input
                type="text"
                id="model"
                name="model"
                value={filters.model}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <SearchableDropdown
                options={sizeOptions}
                value={filters.size}
                onChange={(value) => handleDropdownFilterChange('size', value)}
                placeholder={t('bulkBarcode.size')}
                label={t('bulkBarcode.size')}
              />
            </div>
            
            <div className="form-group">
              <SearchableDropdown
                options={colorOptions}
                value={filters.color}
                onChange={(value) => handleDropdownFilterChange('color', value)}
                placeholder={t('bulkBarcode.color')}
                label={t('bulkBarcode.color')}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="phase" className="text-sm font-medium text-gray-700">{t('barcode.phase')}</label>
              <select
                id="phase"
                name="phase"
                value={filters.phase}
                onChange={handleFilterChange}
                className="input-field"
              >
                <option value="">{t('barcodeManagement.allPhases')}</option>
                <option value="Cutting">{t('phases.cutting')}</option>
                <option value="Sewing">{t('phases.sewing')}</option>
                <option value="Packaging">{t('phases.packaging')}</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="status" className="text-sm font-medium text-gray-700">{t('common.status')}</label>
              <select
                id="status"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="input-field"
              >
                <option value="">{t('barcodeManagement.allStatuses')}</option>
                <option value="Pending">{t('status.pending')}</option>
                <option value="In Progress">{t('status.inProgress')}</option>
                <option value="Completed">{t('status.completed')}</option>
              </select>
            </div>

            {user?.role === 'admin' && (
              <div className="form-group">
                <div className="flex space-x-2" style={{ marginTop: '24px' }}>
                  <button
                    onClick={handleBulkRecovery}
                    disabled={selectedBarcodes.length === 0}
                    style={{
                      backgroundColor: 'green',
                      color: 'white',
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedBarcodes.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedBarcodes.length === 0 ? 0.5 : 1,
                      flex: 1
                    }}
                  >
{t('barcodeManagement.archive.recoverSelected')} ({selectedBarcodes.length})
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={selectedBarcodes.length === 0}
                    style={{
                      backgroundColor: 'red',
                      color: 'white',
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: selectedBarcodes.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: selectedBarcodes.length === 0 ? 0.5 : 1,
                      flex: 1
                    }}
                  >
{t('barcodeManagement.archive.deleteSelected')} ({selectedBarcodes.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

            {loadingBatches ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">{t('barcodeManagement.archive.loadingArchivedBarcodes')}</p>
          </div>
        ) : (
          <>
            <div className="table-container mb-4 w-full">
              <div className="overflow-x-auto w-full">
                {barcodes.length === 0 ? (
                      <div className="text-center py-4">{t('barcodeManagement.archive.noArchivedBarcodesFound')}</div>
                ) : (
                  <VirtualizedTable
                        columns={batchColumns}
                    data={barcodes}
                    height={600}
                    rowHeight={48}
                    showAllColumns={true}
                  />
                )}
              </div>
            </div>
            
            {totalPages > 0 && (
              <div className="flex justify-center mt-4">
                <nav className="flex items-center space-x-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 rounded border disabled:opacity-50"
                  >
                    {t('common.previous')}
                  </button>
                  
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber;
                    if (totalPages <= 5) {
                      pageNumber = i + 1;
                    } else if (currentPage <= 3) {
                      pageNumber = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNumber = totalPages - 4 + i;
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
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 rounded border disabled:opacity-50"
                  >
                    {t('common.next')}
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/barcode-management"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('barcodeManagement.archive.backToBarcodeManagement')}
        </Link>
      </div>
    </Layout>
  );
};

export default React.memo(ArchivePage); 