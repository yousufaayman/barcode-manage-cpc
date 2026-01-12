import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { cutsApi, CutDetailsFull, CutPrintStatus } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { 
  ArrowLeft, 
  Scissors, 
  Calendar, 
  Weight, 
  Layers, 
  Package, 
  RefreshCw,
  ArrowRight,
  FileText,
  Pencil,
  Printer
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/use-toast';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CutDetailsPage: React.FC = () => {
  const { cutId } = useParams<{ cutId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [cut, setCut] = useState<CutDetailsFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const canEditCut = user?.role === 'admin' || user?.role === 'general_operations';

  useEffect(() => {
    if (cutId) {
      fetchCutDetails(parseInt(cutId));
    }
  }, [cutId]);

  const fetchCutDetails = async (id: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await cutsApi.getCutById(id);
      // Ensure rolls and transitions are always arrays
      const cutData: CutDetailsFull = {
        ...data,
        rolls: Array.isArray(data.rolls) ? data.rolls : [],
        transitions: Array.isArray(data.transitions) ? data.transitions : [],
      };
      setCut(cutData);
    } catch (err: any) {
      console.error('Error fetching cut details:', err);
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to fetch cut details';
      setError(errorMessage);
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  const statusOptions: Array<{
    value: CutPrintStatus;
    label: string;
    description: string;
    badgeClass: string;
  }> = useMemo(
    () => [
      {
        value: 'pending',
        label: 'Pending',
        description: 'Waiting to start printing / embroidery',
        badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-200',
      },
      {
        value: 'in_progress',
        label: 'In Progress',
        description: 'Currently in printing / embroidery',
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
      },
      {
        value: 'completed',
        label: 'Completed',
        description: 'Printing / embroidery finished',
        badgeClass: 'bg-green-100 text-green-900 border-green-200',
      },
    ],
    []
  );

  const printConfig = cut?.job_order_print_config;

  const currentStatusMeta = useMemo(() => {
    if (!cut?.requires_printing) return null;
    const value = (cut.print_status || 'pending') as CutPrintStatus;
    return statusOptions.find(option => option.value === value) || statusOptions[0];
  }, [cut?.print_status, cut?.requires_printing, statusOptions]);

  const printTechniqueLabel = useMemo(() => {
    if (printConfig && typeof printConfig === 'object') {
      let maybeType: string | null = null;
      if (typeof printConfig.type === 'string') {
        maybeType = printConfig.type;
      } else {
        const typeEntry = Object.entries(printConfig).find(
          ([key, value]) => key?.toLowerCase() === 'type' && typeof value === 'string'
        );
        if (typeEntry) {
          maybeType = typeEntry[1] as string;
        }
      }

      if (maybeType) {
        const trimmed = maybeType.trim();
        if (trimmed.length > 0) {
          return trimmed;
        }
      }
    }
    return cut?.requires_printing ? 'Printing' : null;
  }, [printConfig, cut?.requires_printing]);

  const printPlacementEntries = useMemo(() => {
    if (!printConfig || typeof printConfig !== 'object') return [];

    const normalized: Record<string, string> = {};
    const toDisplayValue = (value: any) => {
      if (typeof value === 'boolean') return value ? 'Yes' : 'No';
      if (value === null || value === undefined) return '';
      if (typeof value === 'number') return value.toString();
      return String(value);
    };

    const pushEntries = (obj?: Record<string, any>) => {
      if (!obj || typeof obj !== 'object') return;
      Object.entries(obj).forEach(([key, value]) => {
        if (!key) return;
        const display = toDisplayValue(value);
        if (display.trim().length === 0) return;
        normalized[key] = display;
      });
    };

    pushEntries(printConfig.fields as Record<string, any> | undefined);

    Object.entries(printConfig).forEach(([key, value]) => {
      const normalizedKey = key?.toLowerCase();
      if (normalizedKey === 'fields' || normalizedKey === 'type') return;
      if (typeof value === 'object' && value !== null) return;
      if (normalized[key] !== undefined) return;
      const display = toDisplayValue(value);
      if (display.trim().length === 0) return;
      normalized[key] = display;
    });

    return Object.entries(normalized).map(([placement, value]) => ({
      placement,
      value,
    }));
  }, [printConfig]);

  const handlePrintStatusChange = async (nextStatus: CutPrintStatus) => {
    if (!cut || cut.print_status === nextStatus) return;
    try {
      setStatusUpdating(true);
      await cutsApi.updateCut(cut.cut_id, { print_status: nextStatus });
      setCut(prev => (prev ? { ...prev, print_status: nextStatus } : prev));
      toast({
        title: 'Status Updated',
        description: `Printing progress marked as ${nextStatus.replace('_', ' ')}`,
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to update status';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (error || !cut) {
    return (
      <Layout>
        <div className="p-6">
          <Button
            onClick={() => navigate('/cutting')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cuts
          </Button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || 'Cut not found'}</p>
            <Button onClick={() => cutId && fetchCutDetails(parseInt(cutId))} className="mt-4" variant="outline">
              Retry
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-6">
        <div className="mb-6">
          <Button
            onClick={() => navigate('/cutting')}
            variant="outline"
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Cuts
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Scissors className="w-8 h-8 text-green" />
                Cut #{cut.cut_id} Details
              </h1>
              <p className="text-gray-600 mt-1">
                {cut.job_order_number} - {cut.model_name} - {cut.color_name}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {canEditCut && (
                <Button 
                  onClick={() => navigate(`/cutting/createcut?editCutId=${cut.cut_id}`)}
                  className="flex items-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  Edit Cut
                </Button>
              )}
              <Button 
                onClick={() => cutId && fetchCutDetails(parseInt(cutId))} 
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Cut Information */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            {/* Cut Overview with Statistics */}
            <Card>
              <CardHeader>
                <CardTitle>Cut Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 lg:max-h-[520px] overflow-y-auto pr-1">
                {/* Basic Information */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-100 flex flex-col min-h-[80px]">
                    <div className="mb-1.5">
                      <span className="text-[10px] font-medium text-indigo-700 uppercase tracking-wide leading-tight">Job Order</span>
                    </div>
                    <p className="text-base font-bold text-indigo-900 mt-auto leading-tight">{cut.job_order_number}</p>
                  </div>
                  <div className="bg-teal-50 rounded-lg p-3 border border-teal-100 flex flex-col min-h-[80px]">
                    <div className="mb-1.5">
                      <span className="text-[10px] font-medium text-teal-700 uppercase tracking-wide leading-tight">Model</span>
                    </div>
                    <p className="text-base font-bold text-teal-900 mt-auto leading-tight">{cut.model_name}</p>
                  </div>
                  <div className="bg-pink-50 rounded-lg p-3 border border-pink-100 flex flex-col min-h-[80px]">
                    <div className="mb-1.5">
                      <span className="text-[10px] font-medium text-pink-700 uppercase tracking-wide leading-tight">Color</span>
                    </div>
                    <p className="text-base font-bold text-pink-900 mt-auto leading-tight">{cut.color_name}</p>
                  </div>
                  <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-100 flex flex-col min-h-[80px]">
                    <div className="mb-1.5">
                      <span className="text-[10px] font-medium text-cyan-700 uppercase tracking-wide leading-tight">Created At</span>
                    </div>
                    <p className="text-base font-bold text-cyan-900 mt-auto leading-tight">{formatDate(cut.created_at)}</p>
                  </div>
                  <div className="hidden lg:flex"></div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 pt-6 border-t border-gray-200">
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">Total Layers</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-900 mt-auto">{cut.total_layers}</span>
                  </div>

                  <div className="bg-green-50 rounded-lg p-4 border border-green-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-green-700 uppercase tracking-wide">Rolls Used</span>
                    </div>
                    <span className="text-2xl font-bold text-green-900 mt-auto">{cut.num_of_rolls_used}</span>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Weight className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">Cut Weight</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-900 mt-auto">
                      {cut.cut_weight.toFixed(2)} <span className="text-sm font-normal">kg</span>
                    </span>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Scissors className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">Total Pieces</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 mt-auto">
                      {cut.sizes.reduce((sum, size) => sum + size.total_pieces, 0)}
                    </span>
                  </div>

                  {cut.waste_fabric_weight && (
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-100 flex flex-col min-h-[100px]">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4 text-orange-600 flex-shrink-0" />
                        <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">Waste Weight</span>
                      </div>
                      <span className="text-2xl font-bold text-orange-900 mt-auto">
                        {cut.waste_fabric_weight.toFixed(2)} <span className="text-sm font-normal">kg</span>
                      </span>
                    </div>
                  )}
                </div>

                {cut.notes && (
                  <div className="pt-6 border-t border-gray-200">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">Notes</label>
                    <p className="text-sm text-gray-700 leading-relaxed">{cut.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Rolls Table - Expanded to take more vertical space */}
            <Card className="flex flex-col flex-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Rolls ({(cut.rolls || []).length})
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col lg:max-h-[520px] overflow-y-auto pr-1">
                {!cut.rolls || cut.rolls.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500">No rolls recorded for this cut</p>
                  </div>
                ) : (
                  <div className="flex-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Roll #</TableHead>
                          <TableHead>Weight (kg)</TableHead>
                          <TableHead>Layer Weight (kg)</TableHead>
                          <TableHead>Layers</TableHead>
                          <TableHead>Created At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(cut.rolls || []).map((roll) => (
                          <TableRow key={roll.roll_id}>
                            <TableCell className="font-medium">{roll.roll_number}</TableCell>
                            <TableCell>{roll.weight.toFixed(3)}</TableCell>
                            <TableCell>{roll.layer_weight.toFixed(3)}</TableCell>
                            <TableCell>{roll.num_of_layers}</TableCell>
                            <TableCell className="text-sm text-gray-600">
                              {formatDate(roll.created_at)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* Sidebar */}
          <div className="space-y-6 flex flex-col">
            {/* Sizes, Ratios & Quantities Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Layers className="w-5 h-5" />
                  Sizes, Ratios & Quantities
                </CardTitle>
              </CardHeader>
              <CardContent className="lg:max-h-[520px] overflow-y-auto pr-1">
                <div className="space-y-3">
                  {cut.sizes.map((size) => {
                    const ratio = cut.job_order_items_ratios?.[size.item_id.toString()] ?? size.ratio;
                    return (
                      <div
                        key={size.item_id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <Badge variant={size.total_pieces > 0 ? "default" : "outline"} className="text-sm font-medium min-w-[50px] justify-center">
                            {size.size_value}
                          </Badge>
                          {ratio !== null && ratio !== undefined && (
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">Ratio</span>
                              <span className="text-xl font-bold text-blue-700">{ratio}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-medium text-gray-600">Quantity</span>
                          <span className="text-lg font-bold text-gray-900">{size.total_pieces}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-sm font-semibold text-blue-900 uppercase tracking-wide">Total Pieces</span>
                    <span className="text-xl font-bold text-blue-900">
                      {cut.sizes.reduce((sum, size) => sum + size.total_pieces, 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {cut.requires_printing ? (
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Printer className="w-5 h-5" />
                    Printing / Embroidery Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                  <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                    <div className="flex-1 border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        Current Status
                      </span>
                    {currentStatusMeta && (
                      <Badge
                        variant="outline"
                        className={`${currentStatusMeta.badgeClass} text-xs font-semibold px-2.5 py-0.5 inline-flex items-center`}
                      >
                        {currentStatusMeta.label}
                      </Badge>
                    )}
                    </div>
                    <div className="flex-1 border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
                        Technique
                      </span>
                      <Badge
                        variant="outline"
                        className="bg-indigo-50 border-indigo-100 text-indigo-900 text-xs font-semibold px-2.5 py-0.5 inline-flex items-center"
                      >
                        {printTechniqueLabel || 'Printing'}
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
                      Update Status
                    </span>
                    {canEditCut ? (
                      <Select
                        value={(cut.print_status || 'pending') as CutPrintStatus}
                        onValueChange={(value) => handlePrintStatusChange(value as CutPrintStatus)}
                        disabled={statusUpdating}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Choose status" />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-gray-700 text-xs font-semibold px-2.5 py-0.5 inline-flex items-center"
                      >
                        {currentStatusMeta?.label || 'Pending'}
                      </Badge>
                    )}
                  </div>
                  {printPlacementEntries.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        Placements
                      </span>
                      <div className="space-y-1">
                        {printPlacementEntries.map(entry => (
                          <div
                            key={entry.placement}
                            className="flex items-center justify-between text-sm text-gray-700 bg-gray-50 rounded px-3 py-1"
                          >
                            <span className="capitalize">
                              {entry.placement.replace(/_/g, ' ')}
                            </span>
                            <span className="font-semibold text-gray-900">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-col opacity-70">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Printer className="w-5 h-5" />
                    Printing / Embroidery
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">
                    This job order does not have printing or embroidery requirements.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Size Transitions - Below ratios */}
            {cut.transitions && cut.transitions.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    Size Transitions ({(cut.transitions || []).length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="lg:max-h-[320px] overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {(cut.transitions || []).map((transition) => (
                      <div
                        key={transition.transition_id}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs bg-red-500 text-white border-red-500">
                            {transition.from_size_value}
                          </Badge>
                          <ArrowRight className="w-3 h-3 text-gray-400" />
                          <Badge variant="default" className="text-xs">
                            {transition.to_size_value}
                          </Badge>
                        </div>
                        <span className="font-semibold text-gray-800">{transition.quantity}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="opacity-50">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowRight className="w-4 h-4" />
                    Size Transitions (0)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 text-sm text-center py-2">No size transitions</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CutDetailsPage;

