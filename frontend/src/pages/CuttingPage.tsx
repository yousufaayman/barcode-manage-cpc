import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { cutsApi, CutDetails, CutFilterOptions } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RefreshCw, Scissors, Calendar, Weight, Layers, Package, FileText, ChevronLeft, ChevronRight, Plus, Printer, X, Filter, Trash2 } from 'lucide-react';
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cutToDelete, setCutToDelete] = useState<CutDetails | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const errorMessage = err.response?.data?.detail || err.message || t('cuttingPage.failedToFetchCuts');
      setError(errorMessage);
      setCuts([]); // Ensure cuts is always an array
      setTotalPages(0);
      setTotal(0);
      toast({
        title: t('common.error'),
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

  const handleDeleteClick = (cut: CutDetails) => {
    setCutToDelete(cut);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!cutToDelete) return;

    try {
      setDeleting(true);
      await cutsApi.deleteCut(cutToDelete.cut_id);
      toast({
        title: t('common.success'),
        description: t('cuttingPage.cutDeletedSuccess', { cutId: cutToDelete.cut_id }),
      });
      setDeleteDialogOpen(false);
      setCutToDelete(null);
      // Refresh the cuts list
      fetchCuts(currentPage);
    } catch (err: any) {
      console.error('Error deleting cut:', err);
      const errorMessage = err.response?.data?.detail || err.message || t('cuttingPage.failedToDeleteCut');
      toast({
        title: t('common.error'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters = Object.keys(filters).length > 0;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.na');
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const getPrintingStatusMeta = (cut: CutDetails) => {
    if (!cut.requires_printing) {
      return {
        label: t('cuttingPage.printingStatuses.noPrinting'),
        badgeClass: 'bg-gray-100 text-gray-700 border-gray-200',
        description: t('cuttingPage.printingDescriptions.noPrinting'),
      };
    }

    const status = cut.print_status || 'pending';
    switch (status) {
      case 'completed':
        return {
          label: t('cuttingPage.printingStatuses.printingComplete'),
          badgeClass: 'bg-green-100 text-green-900 border-green-200',
          description: t('cuttingPage.printingDescriptions.printingComplete'),
        };
      case 'in_progress':
        return {
          label: t('cuttingPage.printingStatuses.printingInProgress'),
          badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
          description: t('cuttingPage.printingDescriptions.printingInProgress'),
        };
      default:
        return {
          label: t('cuttingPage.printingStatuses.printingPending'),
          badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-200',
          description: t('cuttingPage.printingDescriptions.printingPending'),
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
      <div className="p-4 md:p-6 min-h-screen">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
              <Scissors className="w-8 h-8 text-green" />
              {t('cuttingPage.title')}
            </h1>
            <p className="text-gray-600 mt-1">
              {t('cuttingPage.subtitle')} {total > 0 && `(${total} ${t('common.total')})`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2 w-full md:w-auto">
            <Button 
              onClick={() => navigate('/cutting/createcut')} 
              className="flex items-center gap-2 w-full sm:w-auto"
            >
              <Plus className="w-4 h-4" />
              {t('cuttingPage.addNewCut')}
            </Button>
            <Button
              onClick={() => fetchCuts(currentPage)}
              variant="outline"
              className="flex items-center gap-2 w-full sm:w-auto"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('cuttingPage.refresh')}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 mb-2">{error}</p>
            <Button onClick={() => fetchCuts(currentPage)} variant="outline" size="sm">
              {t('cuttingPage.retry')}
            </Button>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="w-5 h-5" />
                {t('cuttingPage.filters')}
              </CardTitle>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="text-xs"
                >
                  <X className="w-4 h-4 mr-1" />
                  {t('cuttingPage.clearFilters')}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('cuttingPage.jobOrder')}</label>
                <Select
                  value={filters.job_order_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('job_order_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('cuttingPage.allJobOrders')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('cuttingPage.allJobOrders')}</SelectItem>
                    {filterOptions?.job_orders.map((jo) => (
                      <SelectItem key={jo.id} value={jo.id.toString()}>
                        {jo.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('cuttingPage.model')}</label>
                <Select
                  value={filters.model_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('model_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('cuttingPage.allModels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('cuttingPage.allModels')}</SelectItem>
                    {filterOptions?.models.map((model) => (
                      <SelectItem key={model.id} value={model.id.toString()}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('cuttingPage.color')}</label>
                <Select
                  value={filters.color_id?.toString() || '__all__'}
                  onValueChange={(value) => handleFilterChange('color_id', value === '__all__' ? undefined : parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('cuttingPage.allColors')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('cuttingPage.allColors')}</SelectItem>
                    {filterOptions?.colors.map((color) => (
                      <SelectItem key={color.id} value={color.id.toString()}>
                        {color.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('cuttingPage.printingStatus')}</label>
                <Select
                  value={filters.print_status || '__all__'}
                  onValueChange={(value) => handleFilterChange('print_status', value === '__all__' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('cuttingPage.allStatuses')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">{t('cuttingPage.allStatuses')}</SelectItem>
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
              <p className="text-gray-500 text-lg">{t('cuttingPage.noCutsFound')}</p>
              <p className="text-gray-400 text-sm mt-2">{t('cuttingPage.createNewCutMessage')}</p>
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
                      {t('cuttingPage.cutNumber')}{cut.cut_id}{' '}
                      <span className="text-sm font-normal text-gray-600">({cut.job_order_number})</span>
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary" className="text-xs">
                        {cut.color_name}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {cut.model_name}
                      </Badge>
                      {cut.material_name != null && cut.material_name !== '' && (
                        <Badge variant="outline" className="text-xs border-amber-200 bg-amber-50 text-amber-900">
                          {cut.material_name}
                        </Badge>
                      )}
                      {renderPrintingBadge(cut)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">{t('cuttingPage.totalPieces')}</span>
                        <span className="text-lg font-bold text-gray-900">
                          {cut.sizes.reduce((sum, size) => sum + size.total_pieces, 0)}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-md p-2 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Layers className="w-4 h-4 text-blue-600" />
                          <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">{t('cuttingPage.layers')}</span>
                        </div>
                        <span className="text-xl font-bold text-blue-900">{cut.total_layers}</span>
                      </div>
                      <div className="bg-green-50 rounded-md p-2 border border-green-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Package className="w-4 h-4 text-green-600" />
                          <span className="text-xs font-medium text-green-700 uppercase tracking-wide">{t('cuttingPage.rolls')}</span>
                        </div>
                        <span className="text-xl font-bold text-green-900">{cut.num_of_rolls_used}</span>
                      </div>
                      <div className="bg-purple-50 rounded-md p-2 border border-purple-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Weight className="w-4 h-4 text-purple-600" />
                          <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">{t('cuttingPage.weight')}</span>
                        </div>
                        <span className="text-xl font-bold text-purple-900">{cut.cut_weight.toFixed(2)} <span className="text-sm font-normal">kg</span></span>
                      </div>
                      <div className="bg-orange-50 rounded-md p-2 border border-orange-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Calendar className="w-4 h-4 text-orange-600" />
                          <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">{t('cuttingPage.date')}</span>
                        </div>
                        <span className="text-xs font-bold text-orange-900">{formatDate(cut.created_at)}</span>
                      </div>
                    </div>

                    {(cut.waste_fabric_weight != null && cut.waste_fabric_weight !== undefined) && (
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{t('cuttingPage.waste')}</span>
                          <span className="font-medium text-gray-800">{cut.waste_fabric_weight.toFixed(2)} kg</span>
                        </div>
                      </div>
                    )}
                    {(cut.marker_length != null && cut.marker_length !== undefined) && (
                      <div className="pt-2 border-t border-gray-200">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{t('cuttingPage.markerLength')}</span>
                          <span className="font-medium text-gray-800">{cut.marker_length.toFixed(3)} M</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{t('cuttingPage.sizes')}</span>
                      <span className="text-xs text-gray-500">{cut.sizes.length} {t('cuttingPage.sizesCount')}</span>
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

                  <div className="pt-2 flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1"
                      onClick={() => navigate(`/cutting/${cut.cut_id}`)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {t('cuttingPage.viewDetails')}
                    </Button>
                    {(user?.role === 'admin' || user?.role === 'general_operations') && (
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => handleDeleteClick(cut)}
                        className="flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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
                  {t('cuttingPage.previous')}
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
                  {t('cuttingPage.next')}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Page Info */}
            {totalPages > 0 && (
              <div className="text-center text-sm text-gray-600 pb-4">
                {t('cuttingPage.showingPage', { current: currentPage, total: totalPages, count: total })}
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('cuttingPage.deleteCut')}</AlertDialogTitle>
              <AlertDialogDescription>
                {cutToDelete && t('cuttingPage.confirmDeleteCut', { cutId: cutToDelete.cut_id })}
                <br />
                <br />
                {t('cuttingPage.deleteWarning')}
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>{t('cuttingPage.deleteCutRecord')}</li>
                  <li>{t('cuttingPage.deleteRolls')}</li>
                  <li>{t('cuttingPage.deleteTransitions')}</li>
                </ul>
                <br />
                <strong>{t('cuttingPage.cannotUndo')}</strong>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? t('cuttingPage.deleting') : t('common.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
};

export default CuttingPage;

