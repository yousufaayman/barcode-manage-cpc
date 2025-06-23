import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import VirtualizedTable from '../components/VirtualizedTable';
import SearchableDropdown from '../components/SearchableDropdown';
import { Link } from 'react-router-dom';

interface Barcode {
  batch_id: number;
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
  archived_at: string;
}

const ArchivedBatchesPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBarcodes, setTotalBarcodes] = useState(0);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  
  // Dropdown options state
  const [brandOptions, setBrandOptions] = useState<string[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [colorOptions, setColorOptions] = useState<string[]>([]);
  
  const [filters, setFilters] = useState({
    barcode: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    phase: '',
    status: ''
  });

  // Items per page
  const itemsPerPage = 50;

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

  // Fetch archived barcodes from the database with filters and pagination
  useEffect(() => {
    const fetchArchivedBarcodes = async () => {
      try {
        setLoading(true);
        const skip = (currentPage - 1) * itemsPerPage;
        const queryParams = new URLSearchParams({
          skip: skip.toString(),
          limit: itemsPerPage.toString(),
          archived: 'true',
          ...Object.fromEntries(
            Object.entries(filters).filter(([_, value]) => value !== '')
          )
        });
        
        const response = await api.get(`/batches/?${queryParams.toString()}`);
        setBarcodes(response.data.items);
        setTotalBarcodes(response.data.total);
        // Clear selections when data changes
        setSelectedBarcodes([]);
      } catch (error) {
        console.error('Error fetching archived barcodes:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchArchivedBarcodes();
  }, [currentPage, filters]);

  // Handle changes to filter inputs
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setFilters({
      barcode: '',
      brand: '',
      model: '',
      size: '',
      color: '',
      phase: '',
      status: ''
    });
    setCurrentPage(1); // Reset to first page when filters are cleared
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

  // Handle bulk delete
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
            return { 
              id, 
              success: false, 
              error: error.response?.data?.detail || error.message || 'Unknown error' 
            };
          }
        });

        const results = await Promise.all(deletePromises);
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        // Update the UI with successful deletions
        if (successful.length > 0) {
          setBarcodes(prev => prev.filter(barcode => !successful.some(s => s.id === barcode.batch_id)));
          setTotalBarcodes(prev => prev - successful.length);
        }

        // Clear selections
        setSelectedBarcodes([]);

        // Show results to user
        if (failed.length === 0) {
          alert(`Successfully deleted ${successful.length} archived barcode(s).`);
        } else if (successful.length === 0) {
          alert(`Failed to delete any archived barcodes. Please try again.`);
        } else {
          alert(`Successfully deleted ${successful.length} archived barcode(s). Failed to delete ${failed.length} archived barcode(s).`);
        }

        // Log failed deletions for debugging
        if (failed.length > 0) {
          console.error('Failed deletions:', failed);
        }

      } catch (error) {
        console.error('Error during bulk delete:', error);
        alert(t('barcodeManagement.failedToDelete'));
      }
    }
  };

  // Handle bulk recovery
  const handleBulkRecovery = async () => {
    if (selectedBarcodes.length === 0) {
      alert(t('barcodeManagement.selectBarcodesToRecover'));
      return;
    }
    
    const confirmMessage = t('barcodeManagement.confirmBulkRecover', { count: selectedBarcodes.length })
      .replace('{count}', String(selectedBarcodes.length));
    
    if (window.confirm(confirmMessage)) {
      try {
        const response = await api.post('/batches/archived/recover/bulk', { 
          batch_ids: selectedBarcodes 
        });
        
        // Update the UI by removing recovered barcodes
        setBarcodes(prev => prev.filter(barcode => !selectedBarcodes.includes(barcode.batch_id)));
        setTotalBarcodes(prev => prev - selectedBarcodes.length);
        setSelectedBarcodes([]);
        
        const successMessage = t('barcodeManagement.successfullyRecovered', { count: selectedBarcodes.length })
          .replace('{count}', String(selectedBarcodes.length));
        alert(successMessage);
      } catch (error: any) {
        console.error('Error during bulk recovery:', error);
        const errorMessage = error.response?.data?.detail || error.message || t('barcodeManagement.failedToRecover');
        alert(errorMessage);
      }
    }
  };

  // Calculate total pages
  const totalPages = Math.ceil(totalBarcodes / itemsPerPage);

  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Memoize the columns configuration
  const columns = useMemo(() => {
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
        render: (item: Barcode) => (
          <input
            type="checkbox"
            checked={selectedBarcodes.includes(item.batch_id)}
            onChange={() => handleSelectBarcode(item.batch_id)}
            className="w-4 h-4 text-green-600 bg-gray-100 border-gray-300 rounded focus:ring-green-500 focus:ring-2"
          />
        )
      },
      { key: 'barcode', header: t('barcode.barcode'), width: 150 },
      { key: 'brand_name', header: t('bulkBarcode.brand'), width: 120 },
      { key: 'model_name', header: t('bulkBarcode.model'), width: 120 },
      { key: 'size_value', header: t('bulkBarcode.size'), width: 100 },
      { key: 'color_name', header: t('bulkBarcode.color'), width: 100 },
      {
        key: 'quantity',
        header: t('barcode.quantity'),
        width: 100,
        render: (item: Barcode) => item.quantity
      },
      {
        key: 'layers',
        header: t('bulkBarcode.layers'),
        width: 100,
        render: (item: Barcode) => item.layers
      },
      {
        key: 'serial',
        header: t('bulkBarcode.serial'),
        width: 100,
        render: (item: Barcode) => item.serial
      },
      {
        key: 'phase_name',
        header: t('barcode.phase'),
        width: 120,
        render: (item: Barcode) => (
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
      {
        key: 'last_updated_at',
        header: t('common.updated'),
        width: 150,
        render: (item: Barcode) => new Date(item.last_updated_at).toLocaleString()
      },
      {
        key: 'archived_at',
        header: 'Archived At',
        width: 150,
        render: (item: Barcode) => new Date(item.archived_at).toLocaleString()
      }
    ];

    return baseColumns;
  }, [t, selectedBarcodes, barcodes.length, handleSelectBarcode]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Archived Batches</h1>
        <p className="text-gray-600">
          View and search through archived barcodes
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Filter Controls */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">{t('barcodeManagement.filters')}</h2>
            <div className="flex space-x-2">
              <button
                onClick={handleClearFilters}
                className="px-3 py-1 text-sm text-purple-700 border-2 border-purple-400 bg-purple-50 rounded-md hover:text-purple-800 hover:bg-purple-100 hover:border-purple-500 hover:shadow-lg hover:scale-105 transition-all duration-200 font-medium"
              >
                Clear Filters
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
              <SearchableDropdown
                options={brandOptions}
                value={filters.brand}
                onChange={(value) => setFilters(prev => ({ ...prev, brand: value }))}
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
                onChange={(value) => setFilters(prev => ({ ...prev, size: value }))}
                placeholder={t('bulkBarcode.size')}
                label={t('bulkBarcode.size')}
              />
            </div>
            
            <div className="form-group">
              <SearchableDropdown
                options={colorOptions}
                value={filters.color}
                onChange={(value) => setFilters(prev => ({ ...prev, color: value }))}
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

            {user?.role === 'Admin' && (
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
                    Recover Selected ({selectedBarcodes.length})
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
                    Delete Selected ({selectedBarcodes.length})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Barcodes Table */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">Loading archived barcodes...</p>
          </div>
        ) : (
          <>
            <div className="table-container mb-4 w-full">
              <div className="overflow-x-auto w-full">
                {barcodes.length === 0 ? (
                  <div className="text-center py-4">
                    No archived barcodes found matching your filters.
                  </div>
                ) : (
                  <VirtualizedTable
                    columns={columns}
                    data={barcodes}
                    height={600}
                    rowHeight={48}
                    showAllColumns={true}
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

      {/* Back to Barcode Management Link */}
      <div className="mt-6 text-center">
        <Link
          to="/barcode-management"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Barcode Management
        </Link>
      </div>
    </Layout>
  );
};

export default React.memo(ArchivedBatchesPage); 