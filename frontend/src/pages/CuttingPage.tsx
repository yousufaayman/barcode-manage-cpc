import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { cutsApi, CutDetails, CutDetailsListResponse, CutFilterOptions } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RefreshCw, Scissors, Calendar, Weight, Layers, Package, FileText, ChevronLeft, ChevronRight, Plus, Printer, X, Filter } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { format } from 'date-fns';
import { sortSizes } from '../utils/sizeSort';

const PAGE_LIMIT = 10;

interface CutFilters {
  job_order_id?: number;
  model_id?: number;
  color_id?: number;
  print_status?: string;
}

const CuttingPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cuts, setCuts] = useState<CutDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<CutFilters>({});
  const [filterOptions, setFilterOptions] = useState<CutFilterOptions | null>(null);

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchCuts(currentPage);
  }, [currentPage, filters]);

  const fetchFilterOptions = async () => {
    try {
      const options = await cutsApi.getFilterOptions();
      setFilterOptions(options);
    } catch (err: any) {
      console.error('Error fetching filter options:', err);
    }
  };

  const fetchCuts = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      const filterParams: any = {};
      if (filters.job_order_id) filterParams.job_order_id = filters.job_order_id;
      if (filters.model_id) filterParams.model_id = filters.model_id;
      if (filters.color_id) filterParams.color_id = filters.color_id;
      if (filters.print_status) filterParams.print_status = filters.print_status;
      
      const data: any = await cutsApi.getAllCuts(page, PAGE_LIMIT, Object.keys(filterParams).length > 0 ? filterParams : undefined);
      
      // Handle both response formats:
      // 1. Expected format: {cuts: [], total: ..., page: ..., limit: ..., total_pages: ...}
      // 2. Fallback format: array directly (in case backend returns array)
      let cutsArray: CutDetails[] = [];
      let totalCount = 0;
      let totalPagesCount = 0;
      
      if (Array.isArray(data)) {
        // Backend returned array directly (legacy/fallback format)
        cutsArray = data;
        totalCount = data.length;
        totalPagesCount = Math.ceil(totalCount / PAGE_LIMIT);
      } else if (data && typeof data === 'object') {
        // Expected format with pagination metadata
        cutsArray = Array.isArray(data.cuts) ? data.cuts : [];
        totalCount = data.total || cutsArray.length;
        totalPagesCount = data.total_pages || Math.ceil(totalCount / PAGE_LIMIT);
      }
      
      setCuts(cutsArray);
      setTotalPages(totalPagesCount);
      setTotal(totalCount);
    } catch (err: any) {
      console.error('Error fetching cuts:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to fetch cuts';
      setError(errorMessage);
      setCuts([]); // Ensure cuts is always an array
      setTotalPages(0);
      setTotal(0);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleFilterChange = (field: keyof CutFilters, value: string | number | undefined) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      if (value === '' || value === undefined || value === null) {
        delete newFilters[field];
      } else {
        if (field === 'job_order_id' || field === 'model_id' || field === 'color_id') {
          newFilters[field] = value as number;
        } else {
          newFilters[field] = value as string;
        }
      }
      return newFilters;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({});
    setCurrentPage(1);
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getPrintingStatusMeta = (cut: CutDetails) => {
    if (!cut.requires_printing) {
      return {
        label: 'No Printing',
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
        description: 'No printing or embroidery required',
      };
    }

    const status = cut.print_status || 'pending';
    switch (status) {
      case 'completed':
        return {
          label: 'Printing Complete',
          badgeClass: 'bg-green-100 text-green-900 border-green-200',
          description: 'Printing / embroidery finished',
        };
      case 'in_progress':
        return {
          label: 'Printing In Progress',
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
          description: 'Printing / embroidery ongoing',
        };
      default:
        return {
          label: 'Printing Pending',
          badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-200',
          description: 'Awaiting printing / embroidery',
        };
    }
  };

  const renderPrintingBadge = (cut: CutDetails) => {
    const meta = getPrintingStatusMeta(cut);
    return (
      <Badge
        variant="outline"
        className={`flex items-center gap-1 text-[11px] font-semibold ${meta.badgeClass}`}
        title={meta.description}
      >
        <Printer className="w-3.5 h-3.5" />
        {meta.label}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="p-6 min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Scissors className="w-8 h-8 text-green" />
              Cutting Management
            </h1>
            <p className="text-gray-600 mt-1">
              View all cutting operations and details {total > 0 && `(${total} total)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={() => navigate('/cutting/createcut')} 
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Cut
            </Button>
            <Button onClick={() => fetchCuts(currentPage)} variant="outline" className="flex items-center gap-2" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 mb-2">{error}</p>
            <Button onClick={() => fetchCuts(currentPage)} variant="outline" size="sm">
              Retry
            </Button>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Filters
              </CardTitle>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Job Order</label>
                <Select
                  value={filters.job_order_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('job_order_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Job Orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Job Orders</SelectItem>
                    {filterOptions?.job_orders.map((jo) => (
                      <SelectItem key={jo.id} value={jo.id.toString()}>
                        {jo.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Model</label>
                <Select
                  value={filters.model_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('model_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Models" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Models</SelectItem>
                    {filterOptions?.models.map((model) => (
                      <SelectItem key={model.id} value={model.id.toString()}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Color</label>
                <Select
                  value={filters.color_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('color_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Colors" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Colors</SelectItem>
                    {filterOptions?.colors.map((color) => (
                      <SelectItem key={color.id} value={color.id.toString()}>
                        {color.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Printing Status</label>
                <Select
                  value={filters.print_status || '__all__'}
                  onValueChange={(value) => handleFilterChange('print_status', value === '__all__' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Statuses</SelectItem>
                    {filterOptions?.print_statuses.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && (!cuts || cuts.length === 0) ? (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (!cuts || cuts.length === 0) && !loading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Scissors className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 text-lg">No cuts found</p>
              <p className="text-gray-400 text-sm mt-2">Create a new cut to get started</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              {(cuts || []).map((cut) => (
              <Card key={cut.cut_id} className="hover:shadow-lg transition-shadow duration-200">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-2">
                    <CardTitle className="text-lg font-semibold text-gray-800">
                      Cut #{cut.cut_id}{' '}
                      <span className="text-sm font-normal text-gray-600">({cut.job_order_number})</span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {cut.color_name}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {cut.model_name}
                      </Badge>
                      {renderPrintingBadge(cut)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">Total Pieces:</span>
                        <span className="text-lg font-bold text-gray-900">
                          {cut.sizes.reduce((sum, size) => sum + size.total_pieces, 0)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-md p-2 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Layers className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Layers</span>
                        </div>
                        <span className="text-xl font-bold text-blue-900">{cut.total_layers}</span>
                      </div>
                      <div className="bg-green-50 rounded-md p-2 border border-green-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Package className="w-4 h-4 text-green-600" />
                          <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Rolls</span>
                        </div>
                        <span className="text-xl font-bold text-green-900">{cut.num_of_rolls_used}</span>
                      </div>
                      <div className="bg-purple-50 rounded-md p-2 border border-purple-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Weight className="w-4 h-4 text-purple-600" />
                          <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">Weight</span>
                        </div>
                        <span className="text-xl font-bold text-purple-900">{cut.cut_weight.toFixed(2)} <span className="text-sm font-normal">kg</span></span>
                      </div>
                      <div className="bg-orange-50 rounded-md p-2 border border-orange-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Calendar className="w-4 h-4 text-orange-600" />
                          <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">Date</span>
                        </div>
                        <span className="text-xs font-bold text-orange-900">{formatDate(cut.created_at)}</span>
                      </div>
                    </div>

                    {cut.waste_fabric_weight && (
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Waste:</span>
                          <span className="font-medium text-gray-800">{cut.waste_fabric_weight.toFixed(2)} kg</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">Sizes:</span>
                      <span className="text-xs text-gray-500">{cut.sizes.length} sizes</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {sortSizes(cut.sizes).map((size) => (
                        <Badge 
                          key={size.item_id} 
                          variant={size.total_pieces > 0 ? "default" : "outline"}
                          className="text-xs"
                        >
                          {size.size_value}: {size.total_pieces}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {cut.notes && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600 line-clamp-2">{cut.notes}</p>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => navigate(`/cutting/${cut.cut_id}`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6 pb-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1 || loading}
                  className="flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((page) => {
                      // Show first page, last page, current page, and pages around current
                      return (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      );
                    })
                    .map((page, index, array) => {
                      // Add ellipsis if there's a gap
                      const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                      return (
                        <React.Fragment key={page}>
                          {showEllipsisBefore && (
                            <span className="px-2 text-gray-500">...</span>
                          )}
                          <Button
                            variant={currentPage === page ? "default" : "outline"}
                            size="sm"
                            onClick={() => handlePageChange(page)}
                            disabled={loading}
                            className="min-w-[40px]"
                          >
                            {page}
                          </Button>
                        </React.Fragment>
                      );
                    })}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages || loading}
                  className="flex items-center gap-1"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Page Info */}
            {totalPages > 0 && (
              <div className="text-center text-sm text-gray-600 pb-4">
                Showing page {currentPage} of {totalPages} ({total} total cuts)
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default CuttingPage;

