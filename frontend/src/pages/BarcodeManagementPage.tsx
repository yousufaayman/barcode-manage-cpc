import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { cn } from '../lib/utils';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown from '../components/SearchableDropdown';
import { Link } from 'react-router-dom';

interface Barcode {
  batch_id: number;
  job_order_id: number;
  job_order_number?: string;
  barcode: string;
  brand_name: string;
  model_name: string;
  size_value: string;
  color_name: string;
  quantity: number;
  layers: number;
  serial: number;
  phase_name: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  last_updated_at: string;
}

const BarcodeManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Dropdown options state
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  
  // Initialize filters with default phase based on user role
  const getInitialFilters = () => {
    if (user) {
      if (user.role === 'Admin') {
        return {
          barcode: '',
          brand: '',
          model: '',
          size: '',
          color: '',
          phase: '',
          status: '',
          job_order_number: ''
        };
      } else {
        const roleToPhase: { [key: string]: string } = {
          'Cutting': 'Cutting',
          'Sewing': 'Sewing',
          'Packaging': 'Packaging'
        };
        return {
          barcode: '',
          brand: '',
          model: '',
          size: '',
          color: '',
          phase: roleToPhase[user.role] || '',
          status: '',
          job_order_number: ''
        };
      }
    }
    return {
    barcode: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    phase: '',
    status: '',
    job_order_number: ''
    };
  };

  const [filters, setFilters] = useState(getInitialFilters());
  const [printCount, setPrintCount] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [totalBarcodes, setTotalBarcodes] = useState(0);
  
  // Temporary state for edited values
  const [editValues, setEditValues] = useState({
    phase_name: '',
    status: '' as 'Pending' | 'In Progress' | 'Completed',
    quantity: 0
  });
  
  // Items per page
  const itemsPerPage = 50;

  // Temporary state for mobile responsiveness
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768); // md breakpoint is 768px
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch dropdown options
  useEffect(() => {
    const fetchDropdownOptions = async () => {
      try {
        const [brandsResponse, sizesResponse, colorsResponse] = await Promise.all([
          api.get('/batches/brands/'),
          api.get('/batches/sizes/'),
          api.get('/batches/colors/')
        ]);
        
        // Filter out invalid values
        const filterValidOptions = (items: any[], nameKey: string) => 
          items
            .map(item => item[nameKey])
            .filter(value => 
              value && 
              value.toLowerCase() !== 'none' && 
              value.toLowerCase() !== 'null' && 
              value.trim() !== ''
            );
        
        setBrandOptions(filterValidOptions(brandsResponse.data, 'brand_name'));
        setSizeOptions(filterValidOptions(sizesResponse.data, 'size_value'));
        setColorOptions(filterValidOptions(colorsResponse.data, 'color_name'));
      } catch (error) {
        console.error('Error fetching dropdown options:', error);
      }
    };

    fetchDropdownOptions();
  }, []);

  // Update filters when user changes
  useEffect(() => {
    if (user) {
      const newFilters = getInitialFilters();
      setFilters(newFilters);
      setCurrentPage(1); // Reset to first page when user changes
    }
  }, [user]);

  // Fetch barcodes from the database with filters and pagination
  useEffect(() => {
    const fetchBarcodes = async () => {
      try {
        setLoading(true);
        const skip = (currentPage - 1) * itemsPerPage;
        const queryParams = new URLSearchParams({
          skip: skip.toString(),
          limit: itemsPerPage.toString(),
          ...Object.fromEntries(
            Object.entries(filters).filter(([_, value]) => value !== '')
          )
        });
        
        console.log('Fetching barcodes with params:', queryParams.toString());
        const response = await api.get(`/batches/?${queryParams.toString()}`);
        console.log('API response:', response.data);
        setBarcodes(response.data.items);
        setTotalBarcodes(response.data.total);
      } catch (error) {
        console.error('Error fetching barcodes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBarcodes();
  }, [currentPage, filters]);

  // Fetch available printers
  useEffect(() => {
    const fetchPrinters = async () => {
      try {
        const response = await api.get('/barcodes/printers');
        setPrinters(response.data.printers);
        if (response.data.printers.length > 0) {
          setSelectedPrinter(response.data.printers[0]);
        }
      } catch (err) {
        console.error('Error fetching printers:', err);
      }
    };

    fetchPrinters();
  }, []);

  // Handle changes to filter inputs
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    console.log('Filter change:', name, value);
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Handle SearchableDropdown filter changes
  const handleDropdownFilterChange = (field: string, value: string) => {
    console.log('Dropdown filter change:', field, value);
    setFilters(prev => ({ ...prev, [field]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Handle clear filters
  const handleClearFilters = () => {
    setFilters(getInitialFilters());
    setCurrentPage(1); // Reset to first page when filters are cleared
  };
  
  // Calculate total pages
  const totalPages = Math.ceil(totalBarcodes / itemsPerPage);
  
  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
    setSelectedBarcodes([]); // Clear selections when changing pages
  };
  
  // Handle checkbox selection
  const handleSelectBarcode = useCallback((id: number) => {
    setSelectedBarcodes(prev => {
      if (prev.includes(id)) {
        return prev.filter(barcodeId => barcodeId !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);
  
  // Handle "Select All" checkbox
  const handleSelectAll = () => {
    if (selectedBarcodes.length === barcodes.length) {
      setSelectedBarcodes([]);
    } else {
      setSelectedBarcodes(barcodes.map(barcode => barcode.batch_id));
    }
  };
  
  // Start editing a barcode
  const handleEdit = useCallback((barcode: Barcode) => {
    setEditingId(barcode.batch_id);
    setEditValues({
      phase_name: barcode.phase_name,
      status: barcode.status,
      quantity: barcode.quantity
    });
  }, []);
  
  // Handle changes to editable fields
  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditValues(prev => ({ 
      ...prev, 
      [name]: name === 'quantity' ? parseInt(value) || 0 : value
    }));
  }, []);
  
  // Save edits
  const handleSaveEdit = async (id: number) => {
    try {
      // Map phase_name to current_phase based on the phase name
      const phaseMap: { [key: string]: number } = {
        'Cutting': 1,
        'Sewing': 2,
        'Packaging': 3
      };

      const updateData = {
        current_phase: phaseMap[editValues.phase_name],
        status: editValues.status,
        quantity: editValues.quantity
      };

      const response = await api.put(`/batches/${id}`, updateData);

      setBarcodes(prev => 
        prev.map(barcode => 
          barcode.batch_id === id 
            ? { ...barcode, ...response.data } 
            : barcode
        )
      );
      setEditingId(null);
    } catch (error) {
      console.error('Error updating barcode:', error);
      // You might want to show an error message to the user here
    }
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
  };
  
  // Handle delete
  const handleDelete = async (id: number) => {
    if (window.confirm(t('barcodeManagement.confirmDelete'))) {
      try {
        await api.delete(`/batches/${id}`);
        setBarcodes(prev => prev.filter(barcode => barcode.batch_id !== id));
        setSelectedBarcodes(prev => prev.filter(barcodeId => barcodeId !== id));
      } catch (error) {
        console.error('Error deleting barcode:', error);
        // You might want to show an error message to the user here
      }
    }
  };
  
  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToDelete'));
      return;
    }
    
    if (window.confirm(t('barcodeManagement.confirmBulkDelete', { count: selectedBarcodes.length }))) {
      try {
        await Promise.all(selectedBarcodes.map(id => api.delete(`/batches/${id}`)));
        setBarcodes(prev => prev.filter(barcode => !selectedBarcodes.includes(barcode.batch_id)));
        setSelectedBarcodes([]);
      } catch (error) {
        console.error('Error deleting barcodes:', error);
        // You might want to show an error message to the user here
      }
    }
  };
  
  // Handle archive selected
  const handleArchiveSelected = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToArchive'));
      return;
    }
    
    const confirmMessage = t('barcodeManagement.confirmBulkArchive', { count: selectedBarcodes.length })
      .replace('{count}', String(selectedBarcodes.length));
    
    if (window.confirm(confirmMessage)) {
      try {
        await api.post('/batches/archive/bulk', { batch_ids: selectedBarcodes });
        setBarcodes(prev => prev.filter(barcode => !selectedBarcodes.includes(barcode.batch_id)));
        setSelectedBarcodes([]);
        
        const successMessage = t('barcodeManagement.successfullyArchived', { count: selectedBarcodes.length })
          .replace('{count}', String(selectedBarcodes.length));
        alert(successMessage);
      } catch (error) {
        console.error('Error archiving barcodes:', error);
        alert(t('barcodeManagement.failedToArchive'));
      }
    }
  };
  
  // Handle print selected
  const handlePrintSelected = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToPrint'));
      return;
    }
    
    if (!selectedPrinter) {
      alert(t('barcodeManagement.selectPrinterMessage'));
      return;
    }
    
    try {
      setIsPrinting(true);
      const barcodesToPrint = barcodes
        .filter(barcode => selectedBarcodes.includes(barcode.batch_id))
        .map(barcode => ({
          barcode: barcode.barcode,
          brand: barcode.brand_name,
          model: barcode.model_name,
          size: barcode.size_value,
          color: barcode.color_name,
          quantity: barcode.quantity,
          layers: barcode.layers,
          serial: barcode.serial
        }));

      await api.post('/barcodes/print', {
        barcodes: barcodesToPrint,
        count: printCount,
        printer_name: selectedPrinter
      });

      const successMessage = t('barcodeManagement.successfullyPrinted', {
        count: selectedBarcodes.length,
        times: printCount,
        printer: selectedPrinter
      })
      .replace('{count}', String(selectedBarcodes.length))
      .replace('{times}', String(printCount))
      .replace('{printer}', selectedPrinter);

      alert(successMessage);

      // Reset selections and print count
      setSelectedBarcodes([]);
      setPrintCount(1);
    } catch (error) {
      console.error('Error printing barcodes:', error);
      alert(t('barcodeManagement.failedToPrint'));
    } finally {
      setIsPrinting(false);
    }
  };

  // Memoize the columns configuration
  const columns = useMemo(() => {
    const baseColumns = [
    {
      key: 'batch_id',
      header: '',
      width: 40,
      hidden: true,
      render: (item: Barcode) => (
        <input
          type="checkbox"
          checked={selectedBarcodes.includes(item.batch_id)}
          onChange={() => handleSelectBarcode(item.batch_id)}
        />
      )
    },
    { key: 'barcode', header: t('barcode.barcode'), width: 150 },
    { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 120, hidden: true },
    { key: 'brand_name', header: t('bulkBarcode.brand'), width: 120, hidden: true },
    { key: 'model_name', header: t('bulkBarcode.model'), width: 120, hidden: true },
    { key: 'size_value', header: t('bulkBarcode.size'), width: 100, hidden: true },
    { key: 'color_name', header: t('bulkBarcode.color'), width: 100, hidden: true },
    {
      key: 'quantity',
      header: t('barcode.quantity'),
      width: 100,
      hidden: true,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <input
            type="number"
            name="quantity"
            value={editValues.quantity}
            onChange={handleEditChange}
            className="w-20 p-1 border rounded text-sm"
            min="1"
          />
        ) : (
          item.quantity
        )
      )
    },
    {
      key: 'layers',
      header: t('bulkBarcode.layers'),
      width: 100,
      hidden: true,
      render: (item: Barcode) => item.layers
    },
    {
      key: 'serial',
      header: t('bulkBarcode.serial'),
      width: 100,
      hidden: true,
      render: (item: Barcode) => item.serial
    },
    {
      key: 'phase_name',
      header: t('barcode.phase'),
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <select
            name="phase_name"
            value={editValues.phase_name}
            onChange={handleEditChange}
            className="w-24 p-1 border rounded text-sm"
          >
            <option value="Cutting">{t('phases.cutting')}</option>
            <option value="Sewing">{t('phases.sewing')}</option>
            <option value="Packaging">{t('phases.packaging')}</option>
          </select>
        ) : (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
            item.phase_name === 'Sewing' ? 'bg-purple-100 text-purple-800' :
            'bg-orange-100 text-orange-800'
          }`}>
            {t(`phases.${item.phase_name.toLowerCase()}`)}
          </span>
        )
      )
    },
    {
      key: 'status',
      header: t('common.status'),
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <select
            name="status"
            value={editValues.status}
            onChange={handleEditChange}
            className="w-24 p-1 border rounded text-sm"
          >
            <option value="Pending">{t('status.pending')}</option>
            <option value="In Progress">{t('status.inProgress')}</option>
            <option value="Completed">{t('status.completed')}</option>
          </select>
        ) : (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
            item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {item.status === 'In Progress' ? t('status.inProgress') : 
             item.status === 'Pending' ? t('status.pending') : 
             t('status.completed')}
          </span>
        )
      )
      },
    ];

    // Only add actions column for admin users
    if (user?.role === 'Admin') {
      baseColumns.push({
      key: 'actions',
      header: t('common.edit'),
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <div className="flex space-x-1">
            <button
              onClick={() => handleSaveEdit(item.batch_id)}
              className="px-3 py-1 text-sm !bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium flex items-center justify-center min-w-[32px] border border-green-800"
              title={t('common.save')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="black"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors font-medium flex items-center justify-center min-w-[32px]"
              title={t('common.cancel')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex space-x-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                  title={t('common.edit')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(item.batch_id)}
                  className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
                  title={t('common.delete')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
          </div>
        )
      )
      });
    } else if (user?.role === 'Creator') {
      baseColumns.push({
      key: 'actions',
      header: t('common.actions'),
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <div className="flex space-x-1">
            <button
              onClick={() => handleSaveEdit(item.batch_id)}
              className="px-3 py-1 text-sm !bg-green-600 text-white rounded hover:bg-green-700 transition-colors font-medium flex items-center justify-center min-w-[32px] border border-green-800"
              title={t('common.save')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="black"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors font-medium flex items-center justify-center min-w-[32px]"
              title={t('common.cancel')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex space-x-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                  title={t('common.edit')}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
          </div>
        )
      )
      });
    }

    return baseColumns;
  }, [selectedBarcodes, editingId, editValues, user?.role, t]);

  // Check if there are any hidden columns
  const hasHiddenColumns = useMemo(() => {
    return columns.some(column => column.hidden);
  }, [columns]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('barcodeManagement.title')}</h1>
        <p className="text-gray-600">
          {t('barcodeManagement.subtitle')}
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
                value={filters.job_order_number || ''}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <SearchableDropdown
                options={brandOptions}
                value={filters.brand}
                onChange={(value) => handleDropdownFilterChange('brand', value)}
                placeholder={t('bulkBarcode.brand')}
                label={t('bulkBarcode.brand')}
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
            
            {/* Delete and Archive Buttons - moved here to be in same row as status filter */}
            {user?.role === 'Admin' && (
              <div className="form-group">
                <label className="text-sm font-medium text-gray-700">{t('common.actions')}</label>
                <div className="flex gap-2">
                  <button 
                    className="btn-outline text-sm text-red-600 border-red-600 hover:bg-red-600 hover:text-white flex-1" 
                    onClick={handleBulkDelete}
                    disabled={selectedBarcodes.length === 0}
                  >
                    {t('barcodeManagement.deleteSelected')}
                  </button>
                  
                  <button 
                    className="btn-outline text-sm text-orange-600 border-orange-600 hover:bg-orange-600 hover:text-white flex-1" 
                    onClick={handleArchiveSelected}
                    disabled={selectedBarcodes.length === 0}
                  >
                    {t('barcodeManagement.archiveSelected')}
                  </button>
                </div>
              </div>
            )}
            
            {user?.role === 'Creator' && (
              <div className="form-group">
                <label className="text-sm font-medium text-gray-700">{t('common.actions')}</label>
                <div className="flex gap-2">
                  <button 
                    className="btn-outline text-sm text-orange-600 border-orange-600 hover:bg-orange-600 hover:text-white flex-1" 
                    onClick={handleArchiveSelected}
                    disabled={selectedBarcodes.length === 0}
                  >
                    {t('barcodeManagement.archiveSelected')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-4 gap-4">
          <div className="text-sm text-gray-600">
            {t('barcodeManagement.showingBarcodes', { count: barcodes.length, total: totalBarcodes })
              .replace('{count}', String(barcodes.length))
              .replace('{total}', String(totalBarcodes))}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Print Controls */}
            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
              <div className="flex items-center space-x-2">
                <Label htmlFor="printCount">{t('barcodeManagement.printCount')}</Label>
                <Input
                  id="printCount"
                  type="number"
                  min={1}
                  max={100}
                  value={printCount}
                  onChange={(e) => setPrintCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-20"
                  disabled={isPrinting}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Label htmlFor="printer">{t('barcodeManagement.printer')}</Label>
                <Select
                  value={selectedPrinter}
                  onValueChange={setSelectedPrinter}
                  disabled={isPrinting}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder={t('barcodeManagement.selectPrinter')} />
                  </SelectTrigger>
                  <SelectContent>
                    {printers.map((printer) => (
                      <SelectItem key={printer} value={printer}>
                        {printer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handlePrintSelected}
                disabled={isPrinting || selectedBarcodes.length === 0 || !selectedPrinter}
                className={cn(
                  "bg-blue-600 hover:bg-blue-700 text-white",
                  isPrinting && "opacity-50 cursor-not-allowed"
                )}
              >
                {isPrinting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('barcodeManagement.printing')}
                  </span>
                ) : (
                  t('barcodeManagement.print')
                )}
              </Button>
            </div>
          </div>
        </div>
        
        {/* Barcodes Table */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">{t('barcodeManagement.loadingBarcodes')}</p>
          </div>
        ) : (
          <>
            <div className="table-container mb-4 w-full">
              {hasHiddenColumns && isMobile && (
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setShowAllColumns(!showAllColumns)}
                    className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
                  >
                    {showAllColumns ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <span>{t('barcodeManagement.hideAdditionalColumns')}</span>
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span>{t('barcodeManagement.showAdditionalColumns')}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
              <div className="overflow-x-auto w-full">
                {barcodes.length === 0 ? (
                  <div className="text-center py-4">
                    {t('barcodeManagement.noBarcodesFound')}
                  </div>
                ) : (
                  <VirtualizedTable
                    columns={columns}
                    data={barcodes}
                    height={600}
                    rowHeight={48}
                    selectedItems={selectedBarcodes}
                    showAllColumns={showAllColumns}
                    onSelectAll={handleSelectAll}
                    isAllSelected={selectedBarcodes.length === barcodes.length && barcodes.length > 0}
                  />
                )}
              </div>
            </div>
            
            {/* Pagination */}
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
                        className={`px-3 py-1 rounded border ${
                          currentPage === pageNumber ? 'bg-green text-white' : ''
                        }`}
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
      </div>

      {/* Archived Batches Link */}
      <div className="mt-6 text-center">
        <Link
          to="/archived-batches"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          {t('barcodeManagement.viewArchivedBatches')}
        </Link>
      </div>
    </Layout>
  );
};

export default React.memo(BarcodeManagementPage);
