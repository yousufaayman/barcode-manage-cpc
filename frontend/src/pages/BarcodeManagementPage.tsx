import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { cn } from '../lib/utils';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';
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
}

const BarcodeManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  
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
          status: ''
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
          status: ''
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
    status: ''
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
    quantity: 0,
    layers: 0,
    serial: 0
  });
  
  // Items per page
  const itemsPerPage = 50;

  // Temporary state for mobile responsiveness
  const [showAllColumns, setShowAllColumns] = useState(false);

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
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1); // Reset to first page when filters change
  };
  
  // Calculate total pages
  const totalPages = Math.ceil(totalBarcodes / itemsPerPage);
  
  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
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
      quantity: barcode.quantity,
      layers: barcode.layers,
      serial: barcode.serial
    });
  }, []);
  
  // Handle changes to editable fields
  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditValues(prev => ({ 
      ...prev, 
      [name]: name === 'quantity' || name === 'layers' || name === 'serial' ? parseInt(value) || 0 : value
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
        quantity: editValues.quantity,
        layers: editValues.layers,
        serial: editValues.serial,
        current_phase: phaseMap[editValues.phase_name],
        status: editValues.status
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
    if (window.confirm('Are you sure you want to delete this barcode?')) {
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
      alert('Please select at least one barcode to delete.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${selectedBarcodes.length} selected barcodes?`)) {
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
  
  // Handle print selected
  const handlePrintSelected = async () => {
    if (selectedBarcodes.length === 0) {
      alert('Please select at least one barcode to print.');
      return;
    }
    
    if (!selectedPrinter) {
      alert('Please select a printer.');
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

      alert(`Successfully printed ${selectedBarcodes.length} barcodes ${printCount} times each on ${selectedPrinter}`);
    } catch (error) {
      console.error('Error printing barcodes:', error);
      alert('Failed to print barcodes. Please try again.');
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
    { key: 'barcode', header: 'Barcode', width: 150 },
    { key: 'brand_name', header: 'Brand', width: 120, hidden: true },
    { key: 'model_name', header: 'Model', width: 120, hidden: true },
    { key: 'size_value', header: 'Size', width: 100, hidden: true },
    { key: 'color_name', header: 'Color', width: 100, hidden: true },
    {
      key: 'quantity',
      header: 'Quantity',
      width: 100,
      hidden: true,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <input
            type="number"
            name="quantity"
            value={editValues.quantity}
            onChange={handleEditChange}
            className="w-16 p-1 border rounded text-sm"
            min="0"
          />
        ) : item.quantity
      )
    },
    {
      key: 'layers',
      header: 'Layers',
      width: 100,
      hidden: true,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <input
            type="number"
            name="layers"
            value={editValues.layers}
            onChange={handleEditChange}
            className="w-16 p-1 border rounded text-sm"
            min="0"
          />
        ) : item.layers
      )
    },
    {
      key: 'serial',
      header: 'Serial',
      width: 100,
      hidden: true,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <input
            type="number"
            name="serial"
            value={editValues.serial}
            onChange={handleEditChange}
            className="w-16 p-1 border rounded text-sm"
            min="0"
          />
        ) : item.serial
      )
    },
    {
      key: 'phase_name',
      header: 'Phase',
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <select
            name="phase_name"
            value={editValues.phase_name}
            onChange={handleEditChange}
            className="w-24 p-1 border rounded text-sm"
          >
            <option value="Cutting">Cutting</option>
            <option value="Sewing">Sewing</option>
            <option value="Packaging">Packaging</option>
          </select>
        ) : (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
            item.phase_name === 'Sewing' ? 'bg-purple-100 text-purple-800' :
            'bg-orange-100 text-orange-800'
          }`}>
            {item.phase_name}
          </span>
        )
      )
    },
    {
      key: 'status',
      header: 'Status',
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <select
            name="status"
            value={editValues.status}
            onChange={handleEditChange}
            className="w-24 p-1 border rounded text-sm"
          >
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
          </select>
        ) : (
          <span className={`inline-block px-2 py-1 text-xs rounded-full ${
            item.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
            item.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
            'bg-green-100 text-green-800'
          }`}>
            {item.status}
          </span>
        )
      )
      },
    ];

    // Only add actions column for admin users
    if (user?.role === 'Admin') {
      baseColumns.push({
      key: 'actions',
      header: 'Actions',
      width: 120,
      render: (item: Barcode) => (
        editingId === item.batch_id ? (
          <div className="flex space-x-1">
            <button
              onClick={() => handleSaveEdit(item.batch_id)}
              className="p-1 text-xs bg-green text-white rounded hover:bg-opacity-90"
            >
              Save
            </button>
            <button
              onClick={handleCancelEdit}
              className="p-1 text-xs bg-gray-500 text-white rounded hover:bg-opacity-90"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex space-x-1">
                <button
                  onClick={() => handleEdit(item)}
                  className="p-1 text-xs bg-mint text-white rounded hover:bg-opacity-90"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(item.batch_id)}
                  className="p-1 text-xs bg-red-600 text-white rounded hover:bg-opacity-90"
                >
                  Delete
                </button>
          </div>
        )
      )
      });
    }

    return baseColumns;
  }, [selectedBarcodes, editingId, editValues, user?.role]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Barcode Management</h1>
        <p className="text-gray-600">
          View, filter, and manage barcodes {user && user.role !== 'Admin' ? `for ${user.role} department` : ''}
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
        
        {/* Action Buttons */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4">
          <div className="text-sm text-gray-600 mb-2 md:mb-0">
            Showing {barcodes.length} of {totalBarcodes} barcodes
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex items-center space-x-2">
              <Label htmlFor="printCount">Print Count:</Label>
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
              <Label htmlFor="printer">Printer:</Label>
              <Select
                value={selectedPrinter}
                onValueChange={setSelectedPrinter}
                disabled={isPrinting}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select printer" />
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
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Printing...
                </span>
              ) : (
                'Print Selected'
              )}
            </Button>
            
            {user?.role === 'Admin' && (
              <button 
                className="btn-outline text-sm text-red-600 border-red-600 hover:bg-red-600 hover:text-white" 
                onClick={handleBulkDelete}
                disabled={selectedBarcodes.length === 0}
              >
                Delete Selected
              </button>
            )}
          </div>
        </div>
        
        {/* Barcodes Table */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">Loading barcodes...</p>
          </div>
        ) : (
          <>
            <div className="table-container mb-4 w-full">
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
                      <span>Hide Additional Columns</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500 transition-transform duration-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span>Show Additional Columns</span>
                    </>
                  )}
                </button>
              </div>
              <div className="overflow-x-auto w-full">
                {barcodes.length === 0 ? (
                  <div className="text-center py-4">
                    No barcodes found matching your filters.
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

      {/* Archived Batches Link */}
      <div className="mt-6 text-center">
        <Link
          to="/archived-batches"
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 ease-in-out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
          View Archived Batches
        </Link>
      </div>
    </Layout>
  );
};

export default React.memo(BarcodeManagementPage);
