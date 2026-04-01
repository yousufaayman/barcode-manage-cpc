import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { productionApi, SewingLineSchematic, WorkerOvertimePendingRequest } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { LayoutGrid, Loader2, Plus, Users, Eye, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

const ProductionManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [schematics, setSchematics] = useState<SewingLineSchematic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const [pendingOvertimeRequests, setPendingOvertimeRequests] = useState<WorkerOvertimePendingRequest[]>([]);
  const [loadingOvertimeRequests, setLoadingOvertimeRequests] = useState(false);
  const [overtimeRequestsError, setOvertimeRequestsError] = useState<string | null>(null);
  const [processingOvertimeRequestId, setProcessingOvertimeRequestId] = useState<number | null>(null);

  useEffect(() => {
    const fetchSchematics = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await productionApi.getSchematics({ limit: 500 });
        setSchematics(data);
      } catch (err: unknown) {
        let msg: string | null = null;
        if (err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response) {
          const detail = (err.response as { data?: { detail?: string } }).data?.detail;
          msg = typeof detail === 'string' ? detail : null;
        }
        setError(msg ?? t('productionManagement.loadError'));
        setSchematics([]);
      } finally {
        setLoading(false);
      }
    };
    fetchSchematics();
  }, [t]);

  const refreshPendingOvertime = async () => {
    if (user?.role !== 'admin') return;
    setLoadingOvertimeRequests(true);
    setOvertimeRequestsError(null);
    try {
      const data = await productionApi.getPendingOvertimeRequests();
      setPendingOvertimeRequests(data);
    } catch (err: unknown) {
      let msg: string | null = null;
      if (err && typeof err === 'object' && 'response' in err && err.response && typeof err.response === 'object' && 'data' in err.response) {
        const detail = (err.response as { data?: { detail?: string } }).data?.detail;
        msg = typeof detail === 'string' ? detail : null;
      }
      setOvertimeRequestsError(msg ?? 'Failed to load pending overtime requests');
      setPendingOvertimeRequests([]);
    } finally {
      setLoadingOvertimeRequests(false);
    }
  };

  useEffect(() => {
    refreshPendingOvertime();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green/10">
            <LayoutGrid className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('productionManagement.title')}</h1>
            <p className="text-sm text-gray-500">{t('productionManagement.subtitle')}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {user?.role === 'admin' && (
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Overtime approvals
              </CardTitle>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={loadingOvertimeRequests}
                onClick={refreshPendingOvertime}
              >
                {loadingOvertimeRequests ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </CardHeader>
            <CardContent>
              {overtimeRequestsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {overtimeRequestsError}
                </div>
              )}

              {loadingOvertimeRequests ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-green" />
                </div>
              ) : pendingOvertimeRequests.length === 0 ? (
                <p className="py-8 text-center text-gray-500">No pending overtime requests.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Request</TableHead>
                      <TableHead>Work date</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Schematic</TableHead>
                      <TableHead>Overtime (hrs)</TableHead>
                      <TableHead>Workers</TableHead>
                      <TableHead className="w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingOvertimeRequests.map((r) => (
                      <TableRow key={r.request_id}>
                        <TableCell className="font-medium">#{r.request_id}</TableCell>
                        <TableCell>{r.work_date}</TableCell>
                        <TableCell>{r.phase_name}</TableCell>
                        <TableCell>{r.schematic_name}</TableCell>
                        <TableCell>{r.overtime_hours}</TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">
                                View workers ({r.workers.length})
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[75vw] max-w-[720px] max-h-[75vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>Workers for overtime request #{r.request_id}</DialogTitle>
                              </DialogHeader>

                              <div className="space-y-2">
                                {r.workers.map((w) => (
                                  <div key={w.worker_id} className="flex items-center justify-between gap-3 border rounded-md px-3 py-2">
                                    <span className="font-medium">{w.worker_name || `#${w.worker_id}`}</span>
                                    <span className="text-xs text-gray-500">ID: {w.worker_id}</span>
                                  </div>
                                ))}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={processingOvertimeRequestId === r.request_id}
                              onClick={async () => {
                                setProcessingOvertimeRequestId(r.request_id);
                                try {
                                  await productionApi.approveOvertimeRequest(r.request_id);
                                  toast({
                                    title: 'Approved',
                                    description: `Overtime request #${r.request_id} approved`,
                                  });
                                  await refreshPendingOvertime();
                                } catch (err: unknown) {
                                  const detail =
                                    err && typeof err === 'object' && 'response' in err
                                      ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                                      : undefined;
                                  toast({
                                    title: 'Failed',
                                    description: typeof detail === 'string' ? detail : 'Could not approve request',
                                    variant: 'destructive',
                                  });
                                } finally {
                                  setProcessingOvertimeRequestId(null);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle2 className="mr-1.5 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={processingOvertimeRequestId === r.request_id}
                              onClick={async () => {
                                setProcessingOvertimeRequestId(r.request_id);
                                try {
                                  await productionApi.rejectOvertimeRequest(r.request_id);
                                  toast({
                                    title: 'Rejected',
                                    description: `Overtime request #${r.request_id} rejected`,
                                  });
                                  await refreshPendingOvertime();
                                } catch (err: unknown) {
                                  const detail =
                                    err && typeof err === 'object' && 'response' in err
                                      ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
                                      : undefined;
                                  toast({
                                    title: 'Failed',
                                    description: typeof detail === 'string' ? detail : 'Could not reject request',
                                    variant: 'destructive',
                                  });
                                } finally {
                                  setProcessingOvertimeRequestId(null);
                                }
                              }}
                            >
                              <XCircle className="mr-1.5 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle>{t('productionManagement.schematicsList')}</CardTitle>
            <div className="flex flex-col gap-2 w-full sm:w-auto sm:flex-row">
              <Button variant="outline" asChild>
                <Link to="/production/workers">
                  <Users className="mr-2 h-4 w-4" />
                  {t('productionManagement.manageWorkers')}
                </Link>
              </Button>
              {user?.role === 'admin' && (
                <Button asChild>
                  <Link to="/production/create">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('productionManagement.createSchematic')}
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-green" />
              </div>
            ) : schematics.length === 0 ? (
              <p className="py-8 text-center text-gray-500">{t('productionManagement.noSchematics')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('productionManagement.schematicName')}</TableHead>
                    <TableHead>{t('productionManagement.phase')}</TableHead>
                    <TableHead>{t('productionManagement.status')}</TableHead>
                    <TableHead className="w-[100px]">{t('productionManagement.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schematics.map((s) => (
                    <TableRow key={s.schematic_id}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.phase_name ?? t('common.na')}</TableCell>
                      <TableCell>
                        <Badge variant={s.active ? 'default' : 'secondary'}>
                          {s.active ? t('productionManagement.active') : t('productionManagement.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/production/schematics/${s.schematic_id}`}>
                            <Eye className="mr-1.5 h-4 w-4" />
                            {t('productionManagement.viewDetails')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ProductionManagementPage;
