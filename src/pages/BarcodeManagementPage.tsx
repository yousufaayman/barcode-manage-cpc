
import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';

interface Barcode {
  id: number;
  barcode: string;
  brandId: string;
  modelId: string;
  sizeId: string;
  colorId: string;
  quantity: number;
  layers: number;
  serial: string;
  currentPhase: string;
  status: string;
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
    brandId: '',
    modelId: '',
    sizeId: '',
    colorId: '',
    currentPhase: '',
    status: ''
  });
  
  // Temporary state for edited values
  const [editValues, setEditValues] = useState({
    currentPhase: '',
    status: '',
    quantity: 0,
    layers: 0,
    serial: ''
  });
  
  // Items per page
  const itemsPerPage = 10; // Changed to 10 for demo to make pagination more visible
  
  // Generate mock data on component mount
  useEffect(() => {
    // Simulate API call to fetch barcodes
    setLoading(true);
    
    setTimeout(() => {
      const mockBarcodes: Barcode[] = Array.from({ length: 50 }, (_, i) => {
        // Generate random phase more likely to match user's role if not admin
        let phase = ['Cutting', 'Sewing', 'Packaging'][Math.floor(Math.random() * 3)];
        if (user && user.role !== 'Admin') {
          // 70% chance to match user's role for non-admin users
          if (Math.random() < 0.7) {
            phase = user.role;
          }
        }
        
        return {
          id: i + 1,
          barcode: `BC${(1000000 + i).toString()}`,
          brandId: `BR-${(100 + i % 10).toString()}`,
          modelId: `MD-${(200 + i % 15).toString()}`,
          sizeId: `SZ-${(i % 5 + 1).toString()}`,
          colorId: `CL-${(i % 8 + 1).toString()}`,
          quantity: Math.floor(Math.random() * 50) + 1,
          layers: Math.floor(Math.random() * 5) + 1,
          serial: `SR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          currentPhase: phase,
          status: ['Active', 'Inactive', 'Processing', 'Complete'][Math.floor(Math.random() * 4)],
        };
      });
      
      setBarcodes(mockBarcodes);
      setLoading(false);
    }, 1000);
  }, [user]);
  
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
      (filters.brandId === '' || barcode.brandId.toLowerCase().includes(filters.brandId.toLowerCase())) &&
      (filters.modelId === '' || barcode.modelId.toLowerCase().includes(filters.modelId.toLowerCase())) &&
      (filters.sizeId === '' || barcode.sizeId.toLowerCase().includes(filters.sizeId.toLowerCase())) &&
      (filters.colorId === '' || barcode.colorId.toLowerCase().includes(filters.colorId.toLowerCase())) &&
      (filters.currentPhase === '' || barcode.currentPhase === filters.currentPhase) &&
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
      setSelectedBarcodes(currentBarcodes.map(barcode => barcode.id));
    }
  };
  
  // Start editing a barcode
  const handleEdit = (barcode: Barcode) => {
    setEditingId(barcode.id);
    setEditValues({
      currentPhase: barcode.currentPhase,
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
      [name]: name === 'quantity' || name === 'layers' ? parseInt(value) || 0 : value
    }));
  };
  
  // Save edits
  const handleSaveEdit = (id: number) => {
    setBarcodes(prev => 
      prev.map(barcode => 
        barcode.id === id 
          ? { ...barcode, ...editValues } 
          : barcode
      )
    );
    setEditingId(null);
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setEditingId(null);
  };
  
  // Handle delete
  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to delete this barcode?')) {
      setBarcodes(prev => prev.filter(barcode => barcode.id !== id));
      setSelectedBarcodes(prev => prev.filter(barcodeId => barcodeId !== id));
    }
  };
  
  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedBarcodes.length === 0) {
      alert('Please select at least one barcode to delete.');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete ${selectedBarcodes.length} selected barcodes?`)) {
      setBarcodes(prev => prev.filter(barcode => !selectedBarcodes.includes(barcode.id)));
      setSelectedBarcodes([]);
    }
  };
  
  // Handle print selected
  const handlePrintSelected = () => {
    if (selectedBarcodes.length === 0) {
      alert('Please select at least one barcode to print.');
      return;
    }
    
    // In a real app, this would trigger a print dialog or similar
    alert(`Printing ${selectedBarcodes.length} barcodes`);
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
      <div className="pagination">
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(1)}
          disabled={currentPage === 1}
        >
          First
        </button>
        
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          &lt;
        </button>
        
        {pageNumbers.map(number => (
          <button
            key={number}
            className={`pagination-btn ${currentPage === number ? 'active' : ''}`}
            onClick={() => handlePageChange(number)}
          >
            {number}
          </button>
        ))}
        
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          &gt;
        </button>
        
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(totalPages)}
          disabled={currentPage === totalPages}
        >
          Last
        </button>
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
              <label htmlFor="brandId" className="text-sm font-medium text-gray-700">Brand ID</label>
              <input
                type="text"
                id="brandId"
                name="brandId"
                value={filters.brandId}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="modelId" className="text-sm font-medium text-gray-700">Model ID</label>
              <input
                type="text"
                id="modelId"
                name="modelId"
                value={filters.modelId}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="sizeId" className="text-sm font-medium text-gray-700">Size ID</label>
              <input
                type="text"
                id="sizeId"
                name="sizeId"
                value={filters.sizeId}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="colorId" className="text-sm font-medium text-gray-700">Color ID</label>
              <input
                type="text"
                id="colorId"
                name="colorId"
                value={filters.colorId}
                onChange={handleFilterChange}
                className="input-field"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="currentPhase" className="text-sm font-medium text-gray-700">Current Phase</label>
              <select
                id="currentPhase"
                name="currentPhase"
                value={filters.currentPhase}
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
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Processing">Processing</option>
                <option value="Complete">Complete</option>
              </select>
            </div>
          </div>
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-between items-center mb-4">
          <div className="text-sm text-gray-600">
            Showing {currentBarcodes.length} of {filteredBarcodes.length} barcodes
          </div>
          
          <div className="flex space-x-3">
            <button 
              className="btn-outline text-sm" 
              onClick={handlePrintSelected}
              disabled={selectedBarcodes.length === 0}
            >
              Print Selected
            </button>
            
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
              <table className="table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={currentBarcodes.length > 0 && selectedBarcodes.length === currentBarcodes.length}
                        onChange={handleSelectAll}
                      />
                    </th>
                    <th>Barcode</th>
                    <th>Brand/Model</th>
                    <th>Size/Color</th>
                    <th>Quantity</th>
                    <th>Layers</th>
                    <th>Serial</th>
                    <th>Phase</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentBarcodes.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-4">
                        No barcodes found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    currentBarcodes.map(barcode => (
                      <tr 
                        key={barcode.id} 
                        className={selectedBarcodes.includes(barcode.id) ? 'bg-lime bg-opacity-30' : ''}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedBarcodes.includes(barcode.id)}
                            onChange={() => handleSelectBarcode(barcode.id)}
                          />
                        </td>
                        <td>{barcode.barcode}</td>
                        <td>
                          {barcode.brandId}<br />
                          <span className="text-xs text-gray-500">{barcode.modelId}</span>
                        </td>
                        <td>
                          {barcode.sizeId}<br />
                          <span className="text-xs text-gray-500">{barcode.colorId}</span>
                        </td>
                        
                        <td>
                          {editingId === barcode.id ? (
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
                        
                        <td>
                          {editingId === barcode.id ? (
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
                        
                        <td>
                          {editingId === barcode.id ? (
                            <input
                              type="text"
                              name="serial"
                              value={editValues.serial}
                              onChange={handleEditChange}
                              className="w-24 p-1 border rounded text-sm"
                            />
                          ) : (
                            barcode.serial
                          )}
                        </td>
                        
                        <td>
                          {editingId === barcode.id ? (
                            <select
                              name="currentPhase"
                              value={editValues.currentPhase}
                              onChange={handleEditChange}
                              className="w-24 p-1 border rounded text-sm"
                            >
                              <option value="Cutting">Cutting</option>
                              <option value="Sewing">Sewing</option>
                              <option value="Packaging">Packaging</option>
                            </select>
                          ) : (
                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                              barcode.currentPhase === 'Cutting' ? 'bg-blue-100 text-blue-800' :
                              barcode.currentPhase === 'Sewing' ? 'bg-purple-100 text-purple-800' :
                              'bg-orange-100 text-orange-800'
                            }`}>
                              {barcode.currentPhase}
                            </span>
                          )}
                        </td>
                        
                        <td>
                          {editingId === barcode.id ? (
                            <select
                              name="status"
                              value={editValues.status}
                              onChange={handleEditChange}
                              className="w-24 p-1 border rounded text-sm"
                            >
                              <option value="Active">Active</option>
                              <option value="Inactive">Inactive</option>
                              <option value="Processing">Processing</option>
                              <option value="Complete">Complete</option>
                            </select>
                          ) : (
                            <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                              barcode.status === 'Active' ? 'bg-green-100 text-green-800' :
                              barcode.status === 'Inactive' ? 'bg-gray-100 text-gray-800' :
                              barcode.status === 'Processing' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-mint bg-opacity-30 text-mint'
                            }`}>
                              {barcode.status}
                            </span>
                          )}
                        </td>
                        
                        <td>
                          {editingId === barcode.id ? (
                            <div className="flex space-x-1">
                              <button
                                onClick={() => handleSaveEdit(barcode.id)}
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
                                    onClick={() => handleDelete(barcode.id)}
                                    className="p-1 text-xs bg-red-600 text-white rounded hover:bg-opacity-90"
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                              <button
                                className="p-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                Print
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
