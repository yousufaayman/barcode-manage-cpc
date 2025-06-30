import React, { useState, useEffect, useMemo } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { jobOrderApi, JobOrder, JobOrderCreate, JobOrderUpdate } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Plus, Edit, Trash2, Eye } from 'lucide-react';
import VirtualizedTable from '../components/VirtualizedTable';

interface JobOrderWithDetails extends JobOrder {
  model_name?: string;
  total_quantity?: number;
  total_items?: number;
}

const JobOrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [jobOrders, setJobOrders] = useState<JobOrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalJobOrders, setTotalJobOrders] = useState(0);
  const [selectedJobOrders, setSelectedJobOrders] = useState<number[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingJobOrder, setEditingJobOrder] = useState<JobOrder | null>(null);
  const [viewingJobOrder, setViewingJobOrder] = useState<JobOrder | null>(null);
  
  // Form states
  const [formData, setFormData] = useState<JobOrderCreate>({
    model_id: 0,
    job_order_number: '',
    items: []
  });
  
  // Dropdown options
  const [models, setModels] = useState<Array<{ model_id: number; model_name: string }>>([]);
  const [colors, setColors] = useState<Array<{ color_id: number; color_name: string }>>([]);
  const [sizes, setSizes] = useState<Array<{ size_id: number; size_value: string }>>([]);
  
  // Filters
  const [filters, setFilters] = useState({
    job_order_number: '',
    model_id: ''
  });

  const itemsPerPage = 50;

  // Fetch models, colors, and sizes for dropdowns
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [modelsResponse, colorsResponse, sizesResponse] = await Promise.all([
          fetch('/api/v1/batches/models/'),
          fetch('/api/v1/batches/colors/'),
          fetch('/api/v1/batches/sizes/')
        ]);
        
        const modelsData = await modelsResponse.json();
        const colorsData = await colorsResponse.json();
        const sizesData = await sizesResponse.json();
        
        setModels(modelsData);
        setColors(colorsData);
        setSizes(sizesData);
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);

  // Fetch job orders
  useEffect(() => {
    const fetchJobOrders = async () => {
      try {
        setLoading(true);
        const response = await jobOrderApi.getAll();
        setJobOrders(response);
        setTotalJobOrders(response.length);
      } catch (error) {
        console.error('Error fetching job orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobOrders();
  }, [currentPage, filters]);

  // Handle filter changes
  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setCurrentPage(1);
  };

  // Handle clear filters
  const handleClearFilters = () => {
    setFilters({
      job_order_number: '',
      model_id: ''
    });
    setCurrentPage(1);
  };

  // Handle form changes
  const handleFormChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Handle item changes
  const handleItemChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  // Add new item
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { color_id: 0, size_id: 0, quantity: 1 }]
    }));
  };

  // Remove item
  const removeItem = (index: number) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Create job order
  const handleCreate = async () => {
    try {
      if (formData.items.length === 0) {
        alert('Please add at least one item');
        return;
      }
      
      await jobOrderApi.create(formData);
      setIsCreateDialogOpen(false);
      setFormData({ model_id: 0, job_order_number: '', items: [] });
      // Refresh the list
      setCurrentPage(1);
    } catch (error) {
      console.error('Error creating job order:', error);
      alert('Failed to create job order');
    }
  };

  // Edit job order
  const handleEdit = async () => {
    if (!editingJobOrder) return;
    
    try {
      const updateData: JobOrderUpdate = {
        model_id: formData.model_id,
        job_order_number: formData.job_order_number,
        items: formData.items
      };
      
      await jobOrderApi.update(editingJobOrder.job_order_id, updateData);
      setIsEditDialogOpen(false);
      setEditingJobOrder(null);
      setFormData({ model_id: 0, job_order_number: '', items: [] });
      // Refresh the list
      setCurrentPage(1);
    } catch (error) {
      console.error('Error updating job order:', error);
      alert('Failed to update job order');
    }
  };

  // Delete job order
  const handleDelete = async (jobOrderId: number) => {
    if (!confirm('Are you sure you want to delete this job order?')) return;
    
    try {
      await jobOrderApi.delete(jobOrderId);
      // Refresh the list
      setCurrentPage(1);
    } catch (error) {
      console.error('Error deleting job order:', error);
      alert('Failed to delete job order');
    }
  };

  // Open edit dialog
  const openEditDialog = (jobOrder: JobOrder) => {
    setEditingJobOrder(jobOrder);
    setFormData({
      model_id: jobOrder.model_id,
      job_order_number: jobOrder.job_order_number,
      items: jobOrder.items.map(item => ({ 
        color_id: item.color_id, 
        size_id: item.size_id, 
        quantity: item.quantity 
      }))
    });
    setIsEditDialogOpen(true);
  };

  // Open view dialog
  const openViewDialog = (jobOrder: JobOrder) => {
    setViewingJobOrder(jobOrder);
    setIsViewDialogOpen(true);
  };

  // Table columns
  const columns = useMemo(() => [
    {
      key: 'job_order_id',
      header: 'ID',
      width: 80,
      render: (item: JobOrderWithDetails) => item.job_order_id
    },
    {
      key: 'job_order_number',
      header: t('barcode.jobOrderNumber'),
      width: 150,
      render: (item: JobOrderWithDetails) => item.job_order_number
    },
    {
      key: 'model_name',
      header: t('bulkBarcode.model'),
      width: 120,
      render: (item: JobOrderWithDetails) => item.model_name || 'N/A'
    },
    {
      key: 'total_items',
      header: 'Items',
      width: 100,
      render: (item: JobOrderWithDetails) => item.items?.length || 0
    },
    {
      key: 'total_quantity',
      header: 'Total Qty',
      width: 100,
      render: (item: JobOrderWithDetails) => 
        item.items?.reduce((sum, item) => sum + item.quantity, 0) || 0
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 150,
      render: (item: JobOrderWithDetails) => (
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => openViewDialog(item)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openEditDialog(item)}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleDelete(item.job_order_id)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )
    }
  ], [t]);

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Job Orders</h1>
        <p className="text-gray-600">Manage job orders and their color/quantity specifications</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Filters */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-semibold">Filters</h2>
            <Button onClick={handleClearFilters} variant="outline">
              Clear Filters
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="job_order_number">Job Order Number</Label>
              <Input
                id="job_order_number"
                name="job_order_number"
                value={filters.job_order_number}
                onChange={handleFilterChange}
                placeholder="Search by job order number"
              />
            </div>
            <div>
              <Label htmlFor="model_id">Model</Label>
              <Select
                value={filters.model_id}
                onValueChange={(value) => setFilters(prev => ({ ...prev, model_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Models</SelectItem>
                  {models.map(model => (
                    <SelectItem key={model.model_id} value={model.model_id.toString()}>
                      {model.model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Create Button */}
        <div className="mb-4">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Job Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Job Order</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="job_order_number">Job Order Number</Label>
                  <Input
                    id="job_order_number"
                    value={formData.job_order_number}
                    onChange={(e) => handleFormChange('job_order_number', e.target.value)}
                    placeholder="Enter job order number"
                  />
                </div>
                <div>
                  <Label htmlFor="model_id">Model</Label>
                  <Select
                    value={formData.model_id.toString()}
                    onValueChange={(value) => handleFormChange('model_id', parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {models.map(model => (
                        <SelectItem key={model.model_id} value={model.model_id.toString()}>
                          {model.model_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <Label>Items (Color/Size/Quantity)</Label>
                    <Button type="button" onClick={addItem} size="sm">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {formData.items.map((item, index) => (
                      <div key={index} className="flex space-x-2">
                        <Select
                          value={item.color_id.toString()}
                          onValueChange={(value) => handleItemChange(index, 'color_id', parseInt(value))}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select color" />
                          </SelectTrigger>
                          <SelectContent>
                            {colors.map(color => (
                              <SelectItem key={color.color_id} value={color.color_id.toString()}>
                                {color.color_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={item.size_id.toString()}
                          onValueChange={(value) => handleItemChange(index, 'size_id', parseInt(value))}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            {sizes.map(size => (
                              <SelectItem key={size.size_id} value={size.size_id.toString()}>
                                {size.size_value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                          placeholder="Qty"
                          className="w-20"
                          min="1"
                        />
                        <Button
                          type="button"
                          onClick={() => removeItem(index)}
                          size="sm"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreate}>
                    Create Job Order
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Job Orders Table */}
        {loading ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">Loading job orders...</p>
          </div>
        ) : (
          <VirtualizedTable
            data={jobOrders}
            columns={columns}
            height={400}
          />
        )}

        {/* Pagination */}
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {jobOrders.length} of {totalJobOrders} job orders
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="px-4 py-2 text-sm">Page {currentPage}</span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage(prev => prev + 1)}
              disabled={jobOrders.length < itemsPerPage}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Job Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit_job_order_number">Job Order Number</Label>
              <Input
                id="edit_job_order_number"
                value={formData.job_order_number}
                onChange={(e) => handleFormChange('job_order_number', e.target.value)}
                placeholder="Enter job order number"
              />
            </div>
            <div>
              <Label htmlFor="edit_model_id">Model</Label>
              <Select
                value={formData.model_id.toString()}
                onValueChange={(value) => handleFormChange('model_id', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map(model => (
                    <SelectItem key={model.model_id} value={model.model_id.toString()}>
                      {model.model_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Items (Color/Size/Quantity)</Label>
                <Button type="button" onClick={addItem} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex space-x-2">
                    <Select
                      value={item.color_id.toString()}
                      onValueChange={(value) => handleItemChange(index, 'color_id', parseInt(value))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select color" />
                      </SelectTrigger>
                      <SelectContent>
                        {colors.map(color => (
                          <SelectItem key={color.color_id} value={color.color_id.toString()}>
                            {color.color_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.size_id.toString()}
                      onValueChange={(value) => handleItemChange(index, 'size_id', parseInt(value))}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {sizes.map(size => (
                          <SelectItem key={size.size_id} value={size.size_id.toString()}>
                            {size.size_value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                      placeholder="Qty"
                      className="w-20"
                      min="1"
                    />
                    <Button
                      type="button"
                      onClick={() => removeItem(index)}
                      size="sm"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleEdit}>
                Update Job Order
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Job Order Details</DialogTitle>
          </DialogHeader>
          {viewingJobOrder && (
            <div className="space-y-4">
              <div>
                <Label>Job Order Number</Label>
                <p className="text-lg font-semibold">{viewingJobOrder.job_order_number}</p>
              </div>
              <div>
                <Label>Model</Label>
                <p className="text-lg font-semibold">{viewingJobOrder.model_name || 'N/A'}</p>
              </div>
              <div>
                <Label>Items</Label>
                <div className="space-y-2">
                  {viewingJobOrder.items.map((item, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                      <div className="flex space-x-4">
                        <span className="font-medium">
                          {item.color_name || `Color ID: ${item.color_id}`}
                        </span>
                        <span className="text-gray-600">
                          Size: {item.size_value || `Size ID: ${item.size_id}`}
                        </span>
                      </div>
                      <span className="text-lg font-semibold">Qty: {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <Label>Total Quantity</Label>
                <p className="text-lg font-semibold">
                  {viewingJobOrder.items.reduce((sum, item) => sum + item.quantity, 0)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default JobOrdersPage; 