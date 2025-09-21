import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { cn } from '../lib/utils';
import { zebraPrinterService, BarcodePrintData } from '../services/zebraPrinterService';
import { Label } from '../components/ui/label';
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
  brand_id?: number;
  brand_name: string;
  model_id?: number;
  model_name: string;
  size_id?: number;
  size_value: string;
  color_id?: number;
  color_name: string;
  quantity: number;
  layers: number;
  serial: number | string;
  phase_name: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  last_updated_at: string;
  is_second_degree: boolean;
}

const BarcodeManagementPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  
  // Dropdown options state
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  
  // Add filter state for second degree
  const [secondDegreeFilter, setSecondDegreeFilter] = useState<'all' | 'only' | 'without'>('all');
  
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
        // Don't set default phase filter for non-admin users
        // Let them see all phases and filter manually
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
  // Removed printCount state; printing will always use a count of 1.
  const [isPrinting, setIsPrinting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [allPrinters, setAllPrinters] = useState<{name: string, type: 'server' | 'zebra'}[]>([]);
  const [totalBarcodes, setTotalBarcodes] = useState(0);
  

  
  // Items per page
  const itemsPerPage = 50;

  // Mobile view state
  const [isMobile, setIsMobile] = useState(false);
  const [showFullView, setShowFullView] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  // Check if we're on mobile
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768; // md breakpoint is 768px
      setIsMobile(mobile);
      
      // Only set default view on initial load
      if (initialLoad) {
        setShowFullView(!mobile); // Full view on desktop, compact on mobile
        setInitialLoad(false);
      }
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, [initialLoad]);

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
        // Add is_second_degree filter if needed
        if (secondDegreeFilter === 'only') queryParams.append('is_second_degree', 'true');
        if (secondDegreeFilter === 'without') queryParams.append('is_second_degree', 'false');
        
        const response = await api.get(`/batches/?${queryParams.toString()}`);
        setBarcodes(response.data.items);
        setTotalBarcodes(response.data.total);
      } catch (error) {
        console.error('Error fetching barcodes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchBarcodes();
  }, [currentPage, filters, secondDegreeFilter]);

  // Fetch available printers
  useEffect(() => {
    const fetchAllPrinters = async () => {
      try {
        // Fetch server printers
        const serverResponse = await api.get('/barcodes/printers');
        const serverPrinters = serverResponse.data.printers || [];
        
        // Fetch Zebra printers
        let zebraPrintersList: string[] = [];
        try {
          const isZebraAvailable = await zebraPrinterService.checkServiceAvailability();
          if (isZebraAvailable) {
            const zebraPrintersData = await zebraPrinterService.getAvailablePrinters();
            zebraPrintersList = zebraPrintersData.map(p => p.name);
          }
        } catch (error) {
          console.log('Zebra printers not available:', error);
        }
        
        setPrinters(serverPrinters);
        
        // Combine all printers with type information
        const combinedPrinters = [
          ...zebraPrintersList.map(name => ({ name, type: 'zebra' as const })),
          ...serverPrinters.map(name => ({ name, type: 'server' as const }))
        ];
        
        setAllPrinters(combinedPrinters);
        
        // Default to first Zebra printer, then first server printer
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

  // Add state for phases
  const [phases, setPhases] = useState<{ phase_id: number, phase_name: string }[]>([]);

  // Fetch phases from backend
  useEffect(() => {
    api.get('/phases/').then(res => setPhases(res.data));
  }, []);

  // Helper function to get allowed phases for each role
  const getAllowedPhasesForRole = (role: string): number[] => {
    switch (role) {
      case 'Admin':
        return [1, 2, 3, 4, 7, 8]; // All phases: Cutting, Sewing lines 1-4, Packaging
      case 'Cutting':
        return [1]; // Only cutting
      case 'Sewing':
        return [2, 3, 4, 7, 8]; // All sewing lines (2,3,4,7) and packaging
      case 'Packaging':
        return [8]; // Only packaging
      default:
        return [1]; // Default to cutting
    }
  };

  // Handle changes to filter inputs
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Handle SearchableDropdown filter changes
  const handleDropdownFilterChange = (field: string, value: string) => {
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

      // Check if selected printer is a Zebra printer
      const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
      const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';

      if (isZebraPrinter) {
        // Use Zebra Browser Print for client-side printing
        const zebraPrintData: BarcodePrintData[] = barcodesToPrint.map(item => ({
          barcode: item.barcode,
          brand: item.brand,
          model: item.model,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          layers: item.layers,
          serial: item.serial
        }));

        await zebraPrinterService.printMultipleBarcodes(
          zebraPrintData,
          selectedPrinter,
          1
        );

        alert(t('zebraPrinter.printSuccess', { printer: selectedPrinter }));
      } else {
        // Use server-side printing (existing functionality)
        await api.post('/barcodes/print', {
          barcodes: barcodesToPrint,
          count: 1,
          printer_name: selectedPrinter
        });

        const successMessage = t('barcodeManagement.successfullyPrinted', {
          count: selectedBarcodes.length,
          times: 1,
          printer: selectedPrinter
        })
        .replace('{count}', String(selectedBarcodes.length))
        .replace('{times}', '1')
        .replace('{printer}', selectedPrinter);

        alert(successMessage);
      }

      // Reset selections
      setSelectedBarcodes([]);
    } catch (error) {
      console.error('Error printing barcodes:', error);
      const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
      const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';
      
      const errorMessage = isZebraPrinter
        ? t('zebraPrinter.printError', { error: error instanceof Error ? error.message : 'Unknown error' })
        : t('barcodeManagement.failedToPrint');
      alert(errorMessage);
    } finally {
      setIsPrinting(false);
    }
  };

  const navigate = useNavigate();

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
    // Hide job_order_number in compact view
    { key: 'job_order_number', header: t('barcode.jobOrderNumber'), width: 150, hidden: !showFullView },
    // Add barcode column
    { key: 'barcode', header: t('barcode.barcode'), width: 150, render: (item: Barcode) => item.barcode },
    { key: 'brand_name', header: t('bulkBarcode.brand'), width: 70 },
    { key: 'model_name', header: t('bulkBarcode.model'), width: 100 },
    // Always show size_value column
    { key: 'size_value', header: t('bulkBarcode.size'), width: 70 },
    { key: 'color_name', header: t('bulkBarcode.color'), width: 110, hidden: !showFullView },
    // Always show quantity column
    {
      key: 'quantity',
      header: t('barcode.quantity'),
      width: 70,
      render: (item: Barcode) => item.quantity
    },
    // Removed layers and serial columns from compact view (only show in full view)
    {
      key: 'layers',
      header: t('bulkBarcode.layers'),
      width: 60,
      hidden: true,
      render: (item: Barcode) => item.layers
    },
    {
      key: 'serial',
      header: t('bulkBarcode.serial'),
      width: 80,
      hidden: true,
      render: (item: Barcode) => item.serial
    },
    {
      key: 'phase_name',
      header: t('barcode.phase'),
      width: 100,
      render: (item: Barcode) => (
        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
          item.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
          item.phase_name.startsWith('Sewing') ? 'bg-purple-100 text-purple-800' :
          'bg-orange-100 text-orange-800'
        }`}>
          {item.phase_name}
        </span>
      )
    },
    {
      key: 'status',
      header: t('common.status'),
      width: 100,
      render: (item: Barcode) => (
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
    },
    ];

    // Only add actions column for admin users
    if (user?.role === 'Admin') {
      baseColumns.push({
      key: 'actions',
      header: t('common.actions'),
      width: 120,
      hidden: !showFullView,
      render: (item: Barcode) => (
        <div className="flex space-x-1">
          <button
            onClick={() => handleDelete(item.batch_id)}
            className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-medium"
            title={t('common.delete')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <button
            onClick={() => navigate(`/barcode-details/${item.batch_id}`)}
            className="px-2 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors font-medium"
            title={t('common.view')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      )
      });
    } else if (user?.role === 'Creator') {
      baseColumns.push({
      key: 'actions',
      header: t('common.actions'),
      width: 120,
      hidden: !showFullView,
      render: (item: Barcode) => (
        <div className="flex space-x-1">
          <button
            onClick={() => navigate(`/barcode-details/${item.batch_id}`)}
            className="px-2 py-1 text-sm bg-gray-700 text-white rounded hover:bg-gray-800 transition-colors font-medium"
            title={t('common.view')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      )
      });
    }

    return baseColumns;
  }, [selectedBarcodes, user?.role, t, navigate, phases]);



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
                disabled={phases.length === 0}
              >
                <option value="">{t('barcodeManagement.allPhases')}</option>
                {phases.length === 0 ? (
                  <option value="">{t('common.loading')}</option>
                ) : (
                  phases
                    .filter(phase => {
                      if (user?.role === 'Admin') return true;
                      return getAllowedPhasesForRole(user?.role || '').includes(phase.phase_id);
                    })
                    .map(phase => (
                      <option key={phase.phase_id} value={phase.phase_name}>{phase.phase_name}</option>
                    ))
                )}
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
            
            {/* Second Degree Filter Dropdown */}
            <div className="form-group">
              <label htmlFor="secondDegreeFilter" className="text-sm font-medium text-gray-700">{t('barcodeManagement.secondDegreeFilter')}</label>
              <select
                id="secondDegreeFilter"
                name="secondDegreeFilter"
                value={secondDegreeFilter}
                onChange={e => setSecondDegreeFilter(e.target.value as 'all' | 'only' | 'without')}
                className="input-field"
              >
                <option value="all">{t('barcodeManagement.showAll')}</option>
                <option value="only">{t('barcodeManagement.showOnlySecondDegree')}</option>
                <option value="without">{t('barcodeManagement.showWithoutSecondDegree')}</option>
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
          
          {/* Print Controls - Only for Admins */}
          {user?.role === 'Admin' && (
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                <div className="flex items-center space-x-2">
                  <Label htmlFor="printer">{t('barcodeManagement.printer')}</Label>
                  <Select
                    value={selectedPrinter}
                    onValueChange={setSelectedPrinter}
                    disabled={isPrinting}
                  >
                    <SelectTrigger className="w-[250px]">
                      <SelectValue placeholder={t('barcodeManagement.selectPrinter')} />
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
          )}
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
              <div className="mb-4">
                <Button
                  variant="outline"
                  onClick={() => setShowFullView(!showFullView)}
                  className="w-full"
                >
                  {showFullView ? t('barcodeManagement.compactView') : t('barcodeManagement.fullView')}
                </Button>
              </div>
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
                      showAllColumns={showFullView}
                      onSelectAll={handleSelectAll}
                      isAllSelected={selectedBarcodes.length === barcodes.length && barcodes.length > 0}
                      rowClassName={(idx) => barcodes[idx]?.is_second_degree ? 'text-red-600' : ''}
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
          to="/archive"
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
