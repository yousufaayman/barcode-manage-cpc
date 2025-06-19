import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import VirtualizedTable from '../components/VirtualizedTable';
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
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalBarcodes, setTotalBarcodes] = useState(0);
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

  // Calculate total pages
  const totalPages = Math.ceil(totalBarcodes / itemsPerPage);

  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Memoize the columns configuration
  const columns = useMemo(() => [
    { key: 'barcode', header: 'Barcode', width: 150 },
    { key: 'brand_name', header: 'Brand', width: 120 },
    { key: 'model_name', header: 'Model', width: 120 },
    { key: 'size_value', header: 'Size', width: 100 },
    { key: 'color_name', header: 'Color', width: 100 },
    { key: 'quantity', header: 'Quantity', width: 100 },
    { key: 'layers', header: 'Layers', width: 100 },
    { key: 'serial', header: 'Serial', width: 100 },
    {
      key: 'phase_name',
      header: 'Phase',
      width: 120,
      render: (item: Barcode) => (
        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
          item.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
          item.phase_name === 'Sewing' ? 'bg-purple-100 text-purple-800' :
          'bg-orange-100 text-orange-800'
        }`}>
          {item.phase_name}
        </span>
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (item: Barcode) => (
        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
          item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
          item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
          'bg-green-100 text-green-800'
        }`}>
          {item.status}
        </span>
      )
    },
    {
      key: 'last_updated_at',
      header: 'Last Updated',
      width: 150,
      render: (item: Barcode) => new Date(item.last_updated_at).toLocaleString()
    },
    {
      key: 'archived_at',
      header: 'Archived At',
      width: 150,
      render: (item: Barcode) => new Date(item.archived_at).toLocaleString()
    }
  ], []);

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
          <h2 className="text-lg font-semibold mb-3">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="form-group">
              <label htmlFor="barcode" className="text-sm font-medium text-gray-700">Barcode</label>
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
              <label htmlFor="brand" className="text-sm font-medium text-gray-700">Brand</label>
              <input
                type="text"
                id="brand"
                name="brand"
                value={filters.brand}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="model" className="text-sm font-medium text-gray-700">Model</label>
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
              <label htmlFor="size" className="text-sm font-medium text-gray-700">Size</label>
              <input
                type="text"
                id="size"
                name="size"
                value={filters.size}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="color" className="text-sm font-medium text-gray-700">Color</label>
              <input
                type="text"
                id="color"
                name="color"
                value={filters.color}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="phase" className="text-sm font-medium text-gray-700">Phase</label>
              <select
                id="phase"
                name="phase"
                value={filters.phase}
                onChange={handleFilterChange}
                className="input-field"
              >
                <option value="">All Phases</option>
                <option value="Cutting">Cutting</option>
                <option value="Sewing">Sewing</option>
                <option value="Packaging">Packaging</option>
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="status" className="text-sm font-medium text-gray-700">Status</label>
              <select
                id="status"
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="input-field"
              >
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
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
                    Previous
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
                    Next
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