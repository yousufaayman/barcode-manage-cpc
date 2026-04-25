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
  Printer,
  Box,
  Palette,
  Ruler,
  Tag,
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
  const canUpdatePrintStatus = canEditCut || user?.role === 'cutting';

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
      const errorMessage = err.response?.data?.detail || err.message || t('cutDetailsPage.failedToFetchCutDetails');
      setError(errorMessage);
      toast({
        title: t('common.error'),
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.na');
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
        label: t('cutDetailsPage.statusPending'),
        description: t('cutDetailsPage.statusPendingDesc'),
        badgeClass: 'bg-yellow-100 text-yellow-900 border-yellow-200',
      },
      {
        value: 'in_progress',
        label: t('cutDetailsPage.statusInProgress'),
        description: t('cutDetailsPage.statusInProgressDesc'),
        badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
      },
      {
        value: 'completed',
        label: t('cutDetailsPage.statusCompleted'),
        description: t('cutDetailsPage.statusCompletedDesc'),
        badgeClass: 'bg-green-100 text-green-900 border-green-200',
      },
    ],
    [t]
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
        title: t('cutDetailsPage.statusUpdated'),
        description: t('cutDetailsPage.statusUpdatedDesc', { status: nextStatus.replace('_', ' ') }),
      });
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || t('cutDetailsPage.failedToUpdateStatus');
      toast({
        title: t('common.error'),
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
            {t('cutDetailsPage.backToCuts')}
          </Button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error || t('cutDetailsPage.cutNotFound')}</p>
            <Button onClick={() => cutId && fetchCutDetails(parseInt(cutId))} className="mt-4" variant="outline">
              {t('cutDetailsPage.retry')}
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
            {t('cutDetailsPage.backToCuts')}
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                <Scissors className="w-8 h-8 text-green" />
                {t('cutDetailsPage.cutDetails', { cutId: cut.cut_id })}
              </h1>
              <p className="text-gray-600 mt-1">
                {cut.job_order_number} - {cut.model_name} - {cut.color_name}
                {cut.material_name != null && cut.material_name !== ''
                  ? ` — ${t('cutDetailsPage.material')}: ${cut.material_name}`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {canEditCut && (
                <Button 
                  onClick={() => navigate(`/cutting/createcut?editCutId=${cut.cut_id}`)}
                  className="flex items-center gap-2"
                >
                  <Pencil className="w-4 h-4" />
                  {t('cutDetailsPage.editCut')}
                </Button>
              )}
              <Button 
                onClick={() => cutId && fetchCutDetails(parseInt(cutId))} 
                variant="outline"
                className="flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                {t('cutDetailsPage.refresh')}
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
                <CardTitle>{t('cutDetailsPage.cutOverview')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 lg:max-h-[520px] overflow-y-auto pr-1">
                {/* Row 1: Job Order, Model, Color, Created At, Marker Length. Row 2: Material, Total Layers, Rolls, Cut Weight, Total Pieces, Waste. */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {/* Row 1 - Detail 1 */}
                  <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-indigo-700 uppercase tracking-wide">{t('cutDetailsPage.jobOrder')}</span>
                    </div>
                    <p className="text-lg font-bold text-indigo-900 mt-auto leading-tight">{cut.job_order_number}</p>
                  </div>
                  {/* Row 1 - Detail 2 */}
                  <div className="bg-teal-50 rounded-lg p-4 border border-teal-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Box className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-teal-700 uppercase tracking-wide">{t('cutDetailsPage.model')}</span>
                    </div>
                    <p className="text-lg font-bold text-teal-900 mt-auto leading-tight">{cut.model_name}</p>
                  </div>
                  {/* Row 1 - Detail 3 */}
                  <div className="bg-pink-50 rounded-lg p-4 border border-pink-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette className="w-4 h-4 text-pink-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-pink-700 uppercase tracking-wide">{t('cutDetailsPage.color')}</span>
                    </div>
                    <p className="text-lg font-bold text-pink-900 mt-auto leading-tight">{cut.color_name}</p>
                  </div>
                  {/* Row 1 - Detail 4 */}
                  <div className="bg-cyan-50 rounded-lg p-4 border border-cyan-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-cyan-700 uppercase tracking-wide">{t('cutDetailsPage.createdAt')}</span>
                    </div>
                    <p className="text-lg font-bold text-cyan-900 mt-auto leading-tight">{formatDate(cut.created_at)}</p>
                  </div>
                  {/* Row 1 - Detail 5 */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Ruler className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-slate-700 uppercase tracking-wide">{t('cutDetailsPage.markerLength')}</span>
                    </div>
                    <span className="text-lg font-bold text-slate-900 mt-auto">
                      {cut.marker_length != null && cut.marker_length !== undefined
                        ? <>{cut.marker_length.toFixed(3)} <span className="text-sm font-normal">M</span></>
                        : '—'}
                    </span>
                  </div>

                  {/* Row 2 - Material */}
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Tag className="w-4 h-4 text-amber-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-amber-800 uppercase tracking-wide">{t('cutDetailsPage.material')}</span>
                    </div>
                    <p className="text-lg font-bold text-amber-900 mt-auto leading-tight break-words">
                      {cut.material_name ?? '—'}
                    </p>
                  </div>

                  {/* Row 2 - Detail 6 */}
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Layers className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-blue-700 uppercase tracking-wide">{t('cutDetailsPage.totalLayers')}</span>
                    </div>
                    <span className="text-2xl font-bold text-blue-900 mt-auto">{cut.total_layers}</span>
                  </div>
                  {/* Row 2 - Detail 7 */}
                  <div className="bg-green-50 rounded-lg p-4 border border-green-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-green-700 uppercase tracking-wide">{t('cutDetailsPage.rollsUsed')}</span>
                    </div>
                    <span className="text-2xl font-bold text-green-900 mt-auto">{cut.num_of_rolls_used}</span>
                  </div>
                  {/* Row 2 - Detail 8 */}
                  <div className="bg-purple-50 rounded-lg p-4 border border-purple-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Weight className="w-4 h-4 text-purple-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-purple-700 uppercase tracking-wide">{t('cutDetailsPage.cutWeight')}</span>
                    </div>
                    <span className="text-2xl font-bold text-purple-900 mt-auto">
                      {cut.cut_weight.toFixed(2)} <span className="text-sm font-normal">kg</span>
                    </span>
                  </div>
                  {/* Row 2 - Detail 9 */}
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Scissors className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">{t('cutDetailsPage.totalPieces')}</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900 mt-auto">
                      {cut.sizes.reduce((sum, size) => sum + size.total_pieces, 0)}
                    </span>
                  </div>
                  {/* Row 2 - Detail 10 */}
                  <div className="bg-orange-50 rounded-lg p-4 border border-orange-100 flex flex-col min-h-[100px]">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-orange-600 flex-shrink-0" />
                      <span className="text-xs font-medium text-orange-700 uppercase tracking-wide">{t('cutDetailsPage.wasteWeight')}</span>
                    </div>
                    <span className="text-2xl font-bold text-orange-900 mt-auto">
                      {cut.waste_fabric_weight != null && cut.waste_fabric_weight !== undefined
                        ? <>{cut.waste_fabric_weight.toFixed(2)} <span className="text-sm font-normal">kg</span></>
                        : '—'}
                    </span>
                  </div>
                </div>

                {cut.notes && (
                  <div className="pt-6 border-t border-gray-200">
                    <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2 block">{t('cutDetailsPage.notes')}</label>
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
                  {t('cutDetailsPage.rolls', { count: (cut.rolls || []).length })}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col lg:max-h-[520px] overflow-y-auto pr-1">
                {!cut.rolls || cut.rolls.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500">{t('cutDetailsPage.noRollsRecorded')}</p>
                  </div>
                ) : (
                  <div className="flex-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('cutDetailsPage.rollNumber')}</TableHead>
                          <TableHead>{t('cutDetailsPage.weight')}</TableHead>
                          <TableHead>{t('cutDetailsPage.layerWeight')}</TableHead>
                          <TableHead>{t('cutDetailsPage.rollWidth')}</TableHead>
                          <TableHead>{t('cutDetailsPage.layers')}</TableHead>
                          <TableHead>{t('cutDetailsPage.createdAtColumn')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(cut.rolls || []).map((roll) => (
                          <TableRow key={roll.roll_id}>
                            <TableCell className="font-medium">{roll.roll_number}</TableCell>
                            <TableCell>{roll.weight.toFixed(3)}</TableCell>
                            <TableCell>{roll.layer_weight.toFixed(3)}</TableCell>
                            <TableCell>
                              {roll.roll_width !== undefined && roll.roll_width !== null
                                ? roll.roll_width.toFixed(3)
                                : '-'}
                            </TableCell>
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
                  {t('cutDetailsPage.sizesRatiosQuantities')}
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
                              <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">{t('cutDetailsPage.ratio')}</span>
                              <span className="text-xl font-bold text-blue-700">{ratio}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-medium text-gray-600">{t('cutDetailsPage.quantity')}</span>
                          <span className="text-lg font-bold text-gray-900">{size.total_pieces}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <span className="text-sm font-semibold text-blue-900 uppercase tracking-wide">{t('cutDetailsPage.totalPiecesLabel')}</span>
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
                    {t('cutDetailsPage.printingEmbroideryProgress')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 lg:max-h-[520px] lg:overflow-y-auto lg:pr-1">
                  <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
                    <div className="flex-1 border border-gray-100 rounded-lg p-3 bg-gray-50">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">
                        {t('cutDetailsPage.currentStatus')}
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
                        {t('cutDetailsPage.technique')}
                      </span>
                      <Badge
                        variant="outline"
                        className="bg-indigo-50 border-indigo-100 text-indigo-900 text-xs font-semibold px-2.5 py-0.5 inline-flex items-center"
                      >
                        {printTechniqueLabel || t('cutDetailsPage.technique')}
                      </Badge>
                    </div>
                  </div>
                  <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">
                      {t('cutDetailsPage.updateStatus')}
                    </span>
                    {canUpdatePrintStatus ? (
                      <Select
                        value={(cut.print_status || 'pending') as CutPrintStatus}
                        onValueChange={(value) => handlePrintStatusChange(value as CutPrintStatus)}
                        disabled={statusUpdating}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder={t('cutDetailsPage.chooseStatus')} />
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
                        {currentStatusMeta?.label || t('cutDetailsPage.statusPending')}
                      </Badge>
                    )}
                  </div>
                  {printPlacementEntries.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-gray-100">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {t('cutDetailsPage.placements')}
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
                    {t('cutDetailsPage.printingEmbroideryProgress')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500">
                    {t('cutDetailsPage.noPrintingRequired')}
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
                    {t('cutDetailsPage.sizeTransitions', { count: (cut.transitions || []).length })}
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
                    {t('cutDetailsPage.sizeTransitions', { count: 0 })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-400 text-sm text-center py-2">{t('cutDetailsPage.noSizeTransitions')}</p>
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

