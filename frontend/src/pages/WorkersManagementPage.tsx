import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { productionApi, Worker, WorkerGroup } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { ArrowLeft, Users, Loader2, Plus } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

const WorkersManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerGroups, setWorkerGroups] = useState<WorkerGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingWorkerId, setUpdatingWorkerId] = useState<number | null>(null);
  const [newWorker, setNewWorker] = useState({
    worker_name: '',
    worker_id: '' as string,
    worker_group_id: '' as string, // required
    active: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [newWorkerGroup, setNewWorkerGroup] = useState({ group_name: '', working_hours: '8' as string });
  const [submittingGroup, setSubmittingGroup] = useState(false);
  const [updatingGroupId, setUpdatingGroupId] = useState<number | null>(null);
  const [groupHoursDrafts, setGroupHoursDrafts] = useState<Record<number, string>>({});

  const fetchWorkers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await productionApi.getWorkers({ limit: 500 });
      setWorkers(data);
    } catch (err: unknown) {
      let msg: string | null = null;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: { detail?: string } } }).response;
        msg = typeof res?.data?.detail === 'string' ? res.data.detail : null;
      }
      setError(msg ?? t('productionManagement.workers.loadError'));
      setWorkers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkerGroups = async () => {
    setLoadingGroups(true);
    try {
      const data = await productionApi.getWorkerGroups({ limit: 500 });
      setWorkerGroups(data);
    } catch (err: unknown) {
      // Groups are optional for worker creation; do not hard-fail the whole page.
      setWorkerGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
    fetchWorkerGroups();
  }, [t]);

  // Auto-select the first available group when the page loads.
  useEffect(() => {
    if (!workerGroups.length) return;
    if (newWorker.worker_group_id) return;
    setNewWorker((prev) => ({ ...prev, worker_group_id: String(workerGroups[0].group_id) }));
  }, [workerGroups]);

  // Initialize working-hours drafts for the edit inputs.
  useEffect(() => {
    if (!workerGroups.length) return;
    setGroupHoursDrafts((prev) => {
      const next = { ...prev };
      for (const g of workerGroups) {
        next[g.group_id] = g.working_hours != null ? String(g.working_hours) : '';
      }
      return next;
    });
  }, [workerGroups]);

  const handleUpdateWorkerGroup = async (workerId: number, groupId: number) => {
    if (updatingWorkerId != null) return;
    setUpdatingWorkerId(workerId);
    try {
      await productionApi.updateWorker(workerId, { worker_group_id: groupId });
      await fetchWorkers();
      toast({
        title: t('common.success'),
        description: 'Worker group updated.',
      });
    } catch (err: unknown) {
      let detail: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: { detail?: string } } }).response;
        detail = res?.data?.detail;
      }
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : 'Failed to update worker group.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingWorkerId(null);
    }
  };

  const handleUpdateGroupHours = async (groupId: number) => {
    if (updatingGroupId != null) return;
    const raw = (groupHoursDrafts[groupId] ?? '').trim();
    if (raw !== '' && (Number.isNaN(Number(raw)) || !Number.isFinite(Number(raw)))) {
      toast({
        title: t('common.error'),
        description: 'Working hours must be a valid number.',
        variant: 'destructive',
      });
      return;
    }

    const workingHoursVal = raw === '' ? null : Number(raw);
    setUpdatingGroupId(groupId);
    try {
      await productionApi.updateWorkerGroup(groupId, { working_hours: workingHoursVal });
      await fetchWorkerGroups();
      toast({
        title: t('common.success'),
        description: 'Group working hours updated.',
      });
    } catch (err: unknown) {
      let detail: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: { detail?: string } } }).response;
        detail = res?.data?.detail;
      }
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : 'Failed to update group working hours.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingGroupId(null);
    }
  };

  const handleAddWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.worker_name.trim()) {
      toast({
        title: t('common.error'),
        description: t('productionManagement.workers.nameRequired'),
        variant: 'destructive',
      });
      return;
    }
    const workerIdNum = newWorker.worker_id.trim() ? Number(newWorker.worker_id) : undefined;
    const workerGroupIdNum =
      newWorker.worker_group_id.trim() ? Number(newWorker.worker_group_id) : undefined;

    if (!workerGroupIdNum) {
      toast({
        title: t('common.error'),
        description: 'Please select a worker group.',
        variant: 'destructive',
      });
      return;
    }

    if (
      (Number.isNaN(workerGroupIdNum) || workerGroupIdNum < 1 || !Number.isInteger(workerGroupIdNum))
    ) {
      toast({
        title: t('common.error'),
        description: 'Worker group ID must be a positive whole number.',
        variant: 'destructive',
      });
      return;
    }

    if (workerIdNum !== undefined && (Number.isNaN(workerIdNum) || workerIdNum < 1 || !Number.isInteger(workerIdNum))) {
      toast({
        title: t('common.error'),
        description: t('productionManagement.workers.workerIdInvalid'),
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      await productionApi.createWorker({
        worker_name: newWorker.worker_name.trim(),
        active: newWorker.active,
        worker_id: workerIdNum ?? undefined,
        worker_group_id: workerGroupIdNum ?? undefined,
      });
      toast({
        title: t('common.success'),
        description: t('productionManagement.workers.createSuccess'),
      });
      setNewWorker({ worker_name: '', worker_id: '', worker_group_id: '', active: true });
      await fetchWorkers();
    } catch (err: unknown) {
      let detail: string | undefined;
      let status: number | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { status?: number; data?: { detail?: string } } }).response;
        detail = res?.data?.detail;
        status = res?.status;
      }
      const isConflict = status === 409;
      toast({
        title: t('common.error'),
        description: isConflict ? t('productionManagement.workers.idConflict') : (typeof detail === 'string' ? detail : t('productionManagement.workers.createError')),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddWorkerGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkerGroup.group_name.trim()) {
      toast({
        title: t('common.error'),
        description: 'Group name is required.',
        variant: 'destructive',
      });
      return;
    }
    const workingHoursNum = newWorkerGroup.working_hours.trim() ? Number(newWorkerGroup.working_hours) : undefined;
    if (
      workingHoursNum === undefined ||
      Number.isNaN(workingHoursNum) ||
      workingHoursNum < 0 ||
      !Number.isFinite(workingHoursNum)
    ) {
      toast({
        title: t('common.error'),
        description: 'Working hours must be a valid non-negative number.',
        variant: 'destructive',
      });
      return;
    }

    setSubmittingGroup(true);
    try {
      await productionApi.createWorkerGroup({
        group_name: newWorkerGroup.group_name.trim(),
        working_hours: workingHoursNum,
      });
      toast({
        title: t('common.success'),
        description: 'Worker group created.',
      });
      setNewWorkerGroup({ group_name: '', working_hours: '8' });
      await fetchWorkerGroups();
    } catch (err: unknown) {
      let detail: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: { detail?: string }; status?: number } }).response;
        detail = res?.data?.detail;
      }
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : 'Failed to create worker group.',
        variant: 'destructive',
      });
    } finally {
      setSubmittingGroup(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/production">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green/10">
            <Users className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('productionManagement.workers.title')}</h1>
            <p className="text-sm text-gray-500">{t('productionManagement.workers.subtitle')}</p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>{t('productionManagement.workers.addWorker')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddWorker} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[120px]">
                <Label htmlFor="worker_id">{t('productionManagement.workers.workerId')}</Label>
                <Input
                  id="worker_id"
                  type="number"
                  min={1}
                  step={1}
                  value={newWorker.worker_id}
                  onChange={(e) => setNewWorker((prev) => ({ ...prev, worker_id: e.target.value }))}
                  placeholder={t('productionManagement.workers.workerIdPlaceholder')}
                  title={t('productionManagement.workers.workerIdHelp')}
                />
              </div>
              <div className="space-y-2 min-w-[200px]">
                <Label htmlFor="worker_name">{t('productionManagement.workers.workerName')}</Label>
                <Input
                  id="worker_name"
                  value={newWorker.worker_name}
                  onChange={(e) => setNewWorker((prev) => ({ ...prev, worker_name: e.target.value }))}
                  placeholder={t('productionManagement.workers.workerNamePlaceholder')}
                />
              </div>

              <div className="space-y-2 min-w-[240px]">
                <Label>Worker group</Label>
                <Select
                  value={newWorker.worker_group_id}
                  onValueChange={(v) => setNewWorker((prev) => ({ ...prev, worker_group_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {workerGroups.map((g) => (
                      <SelectItem key={g.group_id} value={String(g.group_id)}>
                        {g.group_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="worker_active"
                  checked={newWorker.active}
                  onCheckedChange={(checked) => setNewWorker((prev) => ({ ...prev, active: checked }))}
                />
                <Label htmlFor="worker_active">{t('productionManagement.create.active')}</Label>
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('productionManagement.workers.add')}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Worker groups</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddWorkerGroup} className="flex flex-wrap items-end gap-4">
              <div className="space-y-2 min-w-[240px]">
                <Label htmlFor="group_name">Group name</Label>
                <Input
                  id="group_name"
                  value={newWorkerGroup.group_name}
                  onChange={(e) => setNewWorkerGroup((prev) => ({ ...prev, group_name: e.target.value }))}
                  placeholder="e.g. Sewing Line 1"
                />
              </div>
              <div className="space-y-2 min-w-[200px]">
                <Label htmlFor="group_working_hours">Working hours (h/day)</Label>
                <Input
                  id="group_working_hours"
                  type="number"
                  step={0.5}
                  value={newWorkerGroup.working_hours}
                  onChange={(e) => setNewWorkerGroup((prev) => ({ ...prev, working_hours: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={submittingGroup}>
                {submittingGroup ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create group
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6">
              {loadingGroups ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-green" />
                </div>
              ) : workerGroups.length === 0 ? (
                <p className="py-4 text-center text-gray-500">No worker groups yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">ID</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Working hours</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workerGroups.map((g) => (
                      <TableRow key={g.group_id}>
                        <TableCell className="tabular-nums text-muted-foreground">{g.group_id}</TableCell>
                        <TableCell className="font-medium">{g.group_name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.5}
                            value={groupHoursDrafts[g.group_id] ?? ''}
                            onChange={(e) =>
                              setGroupHoursDrafts((prev) => ({
                                ...prev,
                                [g.group_id]: e.target.value,
                              }))
                            }
                            className="w-[160px]"
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            disabled={updatingGroupId === g.group_id}
                            onClick={() => handleUpdateGroupHours(g.group_id)}
                          >
                            {updatingGroupId === g.group_id ? 'Saving…' : 'Save'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('productionManagement.workers.listTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-green" />
              </div>
            ) : workers.length === 0 ? (
              <p className="py-8 text-center text-gray-500">{t('productionManagement.workers.noWorkers')}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t('productionManagement.workers.workerId')}</TableHead>
                    <TableHead>{t('productionManagement.workers.workerName')}</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>{t('productionManagement.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.map((w) => (
                    <TableRow key={w.worker_id}>
                      <TableCell className="tabular-nums text-muted-foreground">{w.worker_id}</TableCell>
                      <TableCell className="font-medium">{w.worker_name}</TableCell>
                      <TableCell>
                        <Select
                          value={String(w.worker_group_id ?? workerGroups[0]?.group_id ?? '')}
                          onValueChange={(v) =>
                            handleUpdateWorkerGroup(w.worker_id, Number(v))
                          }
                          disabled={!workerGroups.length || updatingWorkerId === w.worker_id}
                        >
                          <SelectTrigger className="w-[240px]">
                            <SelectValue placeholder="Select group" />
                          </SelectTrigger>
                          <SelectContent>
                            {workerGroups.map((g) => (
                              <SelectItem key={g.group_id} value={String(g.group_id)}>
                                {g.group_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <span className={w.active ? 'text-green-600' : 'text-gray-500'}>
                          {w.active ? t('productionManagement.active') : t('productionManagement.inactive')}
                        </span>
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

export default WorkersManagementPage;
