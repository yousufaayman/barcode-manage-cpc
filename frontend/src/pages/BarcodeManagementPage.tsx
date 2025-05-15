import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { cn } from '../lib/utils';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../components/ui/select';

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
}

const BarcodeManagementPage: React.FC = () => {
  const { user } = useAuth();
  const [barcodes, setBarcodes] = useState<Barcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBarcodes, setSelectedBarcodes] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filters, setFilters] = useState({
    barcode: '',
    brand: '',
    model: '',
    size: '',
    color: '',
    phase: '',
    status: ''
  });
  const [printCount, setPrintCount] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  
  // Temporary state for edited values
  const [editValues, setEditValues] = useState({
    phase_name: '',
    status: '' as 'Pending' | 'In Progress' | 'Completed',
    quantity: 0,
    layers: 0,
    serial: 0
  });
  
  // Items per page
  const itemsPerPage = 10;

  // Temporary state for mobile responsiveness
  const [showAllColumns, setShowAllColumns] = useState(false);

  // Fetch barcodes from the database
  useEffect(() => {
    const fetchBarcodes = async () => {
      try {
        setLoading(true);
        const response = await api.get('/batches/');
        setBarcodes(response.data);
      } catch (error) {
        console.error('Error fetching barcodes:', error);
        // You might want to show an error message to the user here
      } finally {
        setLoading(false);
      }
    };

    fetchBarcodes();
  }, []);

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
  
  // Apply filters to barcodes
  const filteredBarcodes = barcodes.filter(barcode => {
    return (
      (filters.barcode === '' || barcode.barcode.toLowerCase().includes(filters.barcode.toLowerCase())) &&
      (filters.brand === '' || barcode.brand_name.toLowerCase().includes(filters.brand.toLowerCase())) &&
      (filters.model === '' || barcode.model_name.toLowerCase().includes(filters.model.toLowerCase())) &&
      (filters.size === '' || barcode.size_value.toLowerCase().includes(filters.size.toLowerCase())) &&
      (filters.color === '' || barcode.color_name.toLowerCase().includes(filters.color.toLowerCase())) &&
      (filters.phase === '' || barcode.phase_name === filters.phase) &&
      (filters.status === '' || barcode.status === filters.status)
    );
  });
  
  // Get current page barcodes
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBarcodes = filteredBarcodes.slice(indexOfFirstItem, indexOfLastItem);
  
  // Calculate total pages
  const totalPages = Math.ceil(filteredBarcodes.length / itemsPerPage);
  
  // Handle page change
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };
  
  // Handle checkbox selection
  const handleSelectBarcode = (id: number) => {
    setSelectedBarcodes(prev => {
      if (prev.includes(id)) {
        return prev.filter(barcodeId => barcodeId !== id);
      } else {
        return [...prev, id];
      }
    });
  };
  
  // Handle "Select All" checkbox
  const handleSelectAll = () => {
    if (selectedBarcodes.length === currentBarcodes.length) {
      setSelectedBarcodes([]);
    } else {
      setSelectedBarcodes(currentBarcodes.map(barcode => barcode.batch_id));
    }
  };
  
  // Start editing a barcode
  const handleEdit = (barcode: Barcode) => {
    setEditingId(barcode.batch_id);
    setEditValues({
      phase_name: barcode.phase_name,
      status: barcode.status,
      quantity: barcode.quantity,
      layers: barcode.layers,
      serial: barcode.serial
    });
  };
  
  // Handle changes to editable fields
  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditValues(prev => ({ 
      ...prev, 
      [name]: name === 'quantity' || name === 'layers' || name === 'serial' ? parseInt(value) || 0 : value
    }));
  };
  
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

  // Render pagination controls
  const renderPagination = () => {
    const pageNumbers = [];
    const maxPagesToShow = 5; // Show up to 5 page numbers
    
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = startPage + maxPagesToShow - 1;
    
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    return (
      <div className="flex justify-center mt-4">
        <nav className="flex items-center space-x-2">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            Previous
          </button>
          
          {pageNumbers.map(number => (
            <button
              key={number}
              onClick={() => handlePageChange(number)}
              className={`px-3 py-1 rounded border ${
                currentPage === number ? 'bg-green text-white' : ''
              }`}
            >
              {number}
            </button>
          ))}
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            Next
          </button>
        </nav>
      </div>
    );
  };

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
            Showing {currentBarcodes.length} of {filteredBarcodes.length} barcodes
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
            <div className="table-container mb-4">
              <div className="flex justify-end mb-2">
                <button
                  onClick={() => setShowAllColumns(!showAllColumns)}
                  className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                >
                  {showAllColumns ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                      Hide Additional Columns
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      Show Additional Columns
                    </>
                  )}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="md:table-cell hidden md:px-4 md:py-2 px-2 py-1">
                        <input
                          type="checkbox"
                          checked={currentBarcodes.length > 0 && selectedBarcodes.length === currentBarcodes.length}
                          onChange={handleSelectAll}
                        />
                      </th>
                      <th className="md:px-4 md:py-2 px-2 py-1">Barcode</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Brand</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Model</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Size</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Color</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Quantity</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Layers</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Serial</th>
                      <th className="md:px-4 md:py-2 px-2 py-1">Phase</th>
                      <th className="md:px-4 md:py-2 px-2 py-1">Status</th>
                      <th className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentBarcodes.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="text-center py-4">
                          No barcodes found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      currentBarcodes.map(barcode => (
                        <tr 
                          key={barcode.batch_id} 
                          className={selectedBarcodes.includes(barcode.batch_id) ? 'bg-lime bg-opacity-30' : ''}
                        >
                          <td className="md:table-cell hidden md:px-4 md:py-2 px-2 py-1">
                            <input
                              type="checkbox"
                              checked={selectedBarcodes.includes(barcode.batch_id)}
                              onChange={() => handleSelectBarcode(barcode.batch_id)}
                            />
                          </td>
                          <td className="md:px-4 md:py-2 px-2 py-1">{barcode.barcode}</td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{barcode.brand_name}</td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{barcode.model_name}</td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{barcode.size_value}</td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{barcode.color_name}</td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>
                            {editingId === barcode.batch_id ? (
                              <input
                                type="number"
                                name="quantity"
                                value={editValues.quantity}
                                onChange={handleEditChange}
                                className="w-16 p-1 border rounded text-sm"
                                min="0"
                              />
                            ) : (
                              barcode.quantity
                            )}
                          </td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>
                            {editingId === barcode.batch_id ? (
                              <input
                                type="number"
                                name="layers"
                                value={editValues.layers}
                                onChange={handleEditChange}
                                className="w-16 p-1 border rounded text-sm"
                                min="0"
                              />
                            ) : (
                              barcode.layers
                            )}
                          </td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>
                            {editingId === barcode.batch_id ? (
                              <input
                                type="number"
                                name="serial"
                                value={editValues.serial}
                                onChange={handleEditChange}
                                className="w-16 p-1 border rounded text-sm"
                                min="0"
                              />
                            ) : (
                              barcode.serial
                            )}
                          </td>
                          <td className="md:px-4 md:py-2 px-2 py-1">
                            {editingId === barcode.batch_id ? (
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
                                barcode.phase_name === 'Cutting' ? 'bg-blue-100 text-blue-800' :
                                barcode.phase_name === 'Sewing' ? 'bg-purple-100 text-purple-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                {barcode.phase_name}
                              </span>
                            )}
                          </td>
                          <td className="md:px-4 md:py-2 px-2 py-1">
                            {editingId === barcode.batch_id ? (
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
                                barcode.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                barcode.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-green-100 text-green-800'
                              }`}>
                                {barcode.status}
                              </span>
                            )}
                          </td>
                          <td className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>
                            {editingId === barcode.batch_id ? (
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleSaveEdit(barcode.batch_id)}
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
                                {user?.role === 'Admin' && (
                                  <>
                                    <button
                                      onClick={() => handleEdit(barcode)}
                                      className="p-1 text-xs bg-mint text-white rounded hover:bg-opacity-90"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDelete(barcode.batch_id)}
                                      className="p-1 text-xs bg-red-600 text-white rounded hover:bg-opacity-90"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Pagination */}
            {filteredBarcodes.length > itemsPerPage && renderPagination()}
          </>
        )}
      </div>
    </Layout>
  );
};

export default BarcodeManagementPage;
