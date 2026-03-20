import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { productionApi, barcodeApi } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { ArrowLeft, LayoutGrid, Loader2, Plus, Trash2, AlertTriangle, GripVertical } from 'lucide-react';
import { useToast } from '../hooks/use-toast';
import { cn } from '../lib/utils';

interface PhaseOption {
  phase_id: number;
  phase_name: string;
  type?: string;
}

interface StageRow {
  id: string;
  stage_name: string;
  variations: number;
  production_qty: string;
  active: boolean;
}

type BottleneckType = 'major' | 'minor' | null;

interface SortableStageRowProps {
  readonly stage: StageRow;
  readonly index: number;
  readonly updateStage: (id: string, field: keyof StageRow, value: string | number | boolean) => void;
  readonly removeStage: (id: string) => void;
  readonly bottleneckType: BottleneckType;
}

function SortableStageRow({ stage, index, updateStage, removeStage, bottleneckType }: SortableStageRowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isMajor = bottleneckType === 'major';
  const isMinor = bottleneckType === 'minor';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border p-3 bg-gray-50/50',
        isMajor && 'border-red-500 border-2 bg-red-50/50',
        isMinor && 'border-amber-500 border-2 bg-amber-50/50',
        isDragging && 'shadow-lg z-50'
      )}
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 flex-shrink-0 touch-none"
      >
        <GripVertical className="h-5 w-5" />
      </div>
      <span className="text-sm font-medium text-gray-500 w-6">{index + 1}.</span>
      {(isMajor || isMinor) && (
        <span
          className="flex-shrink-0"
          title={isMajor ? t('productionManagement.create.bottleneckMajorTooltip') : t('productionManagement.create.bottleneckMinorTooltip')}
        >
          <AlertTriangle className={cn('h-4 w-4', isMajor ? 'text-red-600' : 'text-amber-600')} />
        </span>
      )}
      <Input
        placeholder={t('productionManagement.create.stageNamePlaceholder')}
        value={stage.stage_name}
        onChange={(e) => updateStage(stage.id, 'stage_name', e.target.value)}
        className="flex-1 min-w-[120px]"
      />
      <Input
        type="number"
        min={1}
        placeholder={t('productionManagement.create.variations')}
        value={stage.variations ?? 1}
        onChange={(e) => updateStage(stage.id, 'variations', Math.max(1, Number(e.target.value) || 1))}
        className="w-24"
        title={t('productionManagement.create.variationsHelp')}
      />
      <Input
        type="number"
        min={0}
        placeholder={t('productionManagement.create.productionQty')}
        value={stage.production_qty}
        onChange={(e) => updateStage(stage.id, 'production_qty', e.target.value)}
        className="w-28"
        title={t('productionManagement.create.productionQtyHelp')}
      />
      <div className="flex items-center gap-1">
        <Switch
          checked={stage.active}
          onCheckedChange={(checked) => updateStage(stage.id, 'active', checked)}
        />
        <span className="text-xs text-gray-500">{t('productionManagement.create.active')}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => removeStage(stage.id)}
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

const CreateSewingLineSchematicPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [loadingPhases, setLoadingPhases] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    production_phase_id: 0,
    name: '',
    active: true,
    working_hours: '' as string,
  });
  const [stages, setStages] = useState<StageRow[]>([]);

  const addStage = () => {
    setStages((prev) => [
      ...prev,
      {
        id: `stage-${Date.now()}`,
        stage_name: '',
        variations: 1,
        production_qty: '',
        active: true,
      },
    ]);
  };

  const removeStage = (id: string) => {
    setStages((prev) => prev.filter((s) => s.id !== id));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setStages((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const updateStage = (id: string, field: keyof StageRow, value: string | number | boolean) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  // Bottleneck detection: major = later stage has higher capacity (red); minor = earlier has higher than later (yellow)
  const bottleneckInfo = useMemo(() => {
    if (stages.length < 2) {
      return { majorIndices: new Set<number>(), minorIndices: new Set<number>() };
    }
    const capacities = stages.map(
      (s) => (Number(s.production_qty) || 0) * (s.variations ?? 1)
    );
    const majorIndices = new Set<number>();
    const minorIndices = new Set<number>();
    for (let i = 0; i < stages.length - 1; i++) {
      if (capacities[i + 1] > capacities[i]) {
        majorIndices.add(i);
        majorIndices.add(i + 1);
      } else if (capacities[i] > capacities[i + 1]) {
        minorIndices.add(i);
        minorIndices.add(i + 1);
      }
    }
    return { majorIndices, minorIndices };
  }, [stages]);

  const getBottleneckType = (stageIndex: number): BottleneckType => {
    if (bottleneckInfo.majorIndices.has(stageIndex)) return 'major';
    if (bottleneckInfo.minorIndices.has(stageIndex)) return 'minor';
    return null;
  };

  // Total hourly production = bottleneck (min capacity across stages); per-stage production qty is hourly
  const hourlyProductionTotal = useMemo(() => {
    if (stages.length === 0) return 0;
    const capacities = stages.map(
      (s) => (Number(s.production_qty) || 0) * (s.variations ?? 1)
    );
    return Math.min(...capacities);
  }, [stages]);

  const workingHoursNumber = useMemo(() => {
    const raw = typeof form.working_hours === 'string' ? form.working_hours.trim() : '';
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  }, [form.working_hours]);

  const dailyProductionTotal = useMemo(() => {
    if (!workingHoursNumber || hourlyProductionTotal <= 0) return null;
    return hourlyProductionTotal * workingHoursNumber;
  }, [hourlyProductionTotal, workingHoursNumber]);

  useEffect(() => {
    const fetchPhases = async () => {
      setLoadingPhases(true);
      try {
        const data = await barcodeApi.getPhases();
        const sewingPhases = Array.isArray(data)
          ? (data as PhaseOption[]).filter((p) => (p.type || '').toLowerCase() === 'sewing')
          : [];
        setPhases(sewingPhases);
        if (sewingPhases.length > 0 && form.production_phase_id === 0) {
          setForm((f) => ({ ...f, production_phase_id: sewingPhases[0].phase_id }));
        }
      } catch {
        setPhases([]);
      } finally {
        setLoadingPhases(false);
      }
    };
    fetchPhases();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({
        title: t('common.error'),
        description: t('productionManagement.create.nameRequired'),
        variant: 'destructive',
      });
      return;
    }
    if (form.production_phase_id <= 0) {
      toast({
        title: t('common.error'),
        description: t('productionManagement.create.phaseRequired'),
        variant: 'destructive',
      });
      return;
    }
    const stagesPayload: Array<{ stage_name: string; stage_order: number; production_qty?: number; active: boolean }> = [];
    let stageOrder = 1;
    for (const row of stages.filter((s) => s.stage_name.trim() !== '')) {
      const variations = Math.max(1, Number(row.variations) || 1);
      const productionQty = row.production_qty.trim() ? Number(row.production_qty) : undefined;
      const orderForStage = stageOrder++;
      for (let v = 0; v < variations; v++) {
        stagesPayload.push({
          stage_name: row.stage_name.trim(),
          stage_order: orderForStage,
          production_qty: productionQty,
          active: row.active,
        });
      }
    }

    setSubmitting(true);
    try {
      const workingHoursNum = form.working_hours.trim() ? Number(form.working_hours) : undefined;
      await productionApi.createSchematic({
        production_phase_id: form.production_phase_id,
        name: form.name.trim(),
        active: form.active,
        working_hours: workingHoursNum != null && !Number.isNaN(workingHoursNum) ? workingHoursNum : undefined,
        hourly_production: hourlyProductionTotal,
        stages: stagesPayload.length > 0 ? stagesPayload : undefined,
      });
      toast({
        title: t('common.success'),
        description: t('productionManagement.create.success'),
      });
      navigate('/production');
    } catch (err: unknown) {
      let detail: string | undefined;
      if (err && typeof err === 'object' && 'response' in err) {
        const res = (err as { response?: { data?: { detail?: string } } }).response;
        detail = res?.data?.detail;
      }
      toast({
        title: t('common.error'),
        description: typeof detail === 'string' ? detail : t('productionManagement.create.error'),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
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
            <LayoutGrid className="h-5 w-5 text-green" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('productionManagement.create.title')}</h1>
            <p className="text-sm text-gray-500">{t('productionManagement.create.subtitle')}</p>
          </div>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('productionManagement.create.formTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingPhases ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-green" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-4 py-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    {t('productionManagement.create.hourlyProductionTotal')}
                  </span>
                  <span className="text-2xl font-semibold tabular-nums">
                    {hourlyProductionTotal}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      {t('productionManagement.create.hourlyUnits')}
                    </span>
                  </span>
                </div>
                {dailyProductionTotal != null && (
                  <div className="flex flex-col gap-1 rounded-lg border bg-muted/50 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        {t('productionManagement.details.totalDailyProduction')}
                      </span>
                      <span className="text-2xl font-semibold tabular-nums">
                        {dailyProductionTotal}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          {t('productionManagement.details.dailyUnits')}
                        </span>
                      </span>
                    </div>
                    {workingHoursNumber != null && (
                      <span className="text-xs text-muted-foreground text-right">
                        {t('productionManagement.details.basedOnWorkingHours', {
                          hours: workingHoursNumber,
                        })}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="phase">{t('productionManagement.create.phase')}</Label>
                  <Select
                    value={form.production_phase_id > 0 ? String(form.production_phase_id) : ''}
                    onValueChange={(v) => setForm((f) => ({ ...f, production_phase_id: Number.parseInt(v, 10) || 0 }))}
                  >
                    <SelectTrigger id="phase">
                      <SelectValue placeholder={t('productionManagement.create.selectPhase')} />
                    </SelectTrigger>
                    <SelectContent>
                      {phases.map((p) => (
                        <SelectItem key={p.phase_id} value={String(p.phase_id)}>
                          {p.phase_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">{t('productionManagement.schematicName')}</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t('productionManagement.create.namePlaceholder')}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="working_hours">{t('productionManagement.create.workingHours')}</Label>
                  <Input
                    id="working_hours"
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder={t('productionManagement.create.workingHoursPlaceholder')}
                    value={form.working_hours}
                    onChange={(e) => setForm((f) => ({ ...f, working_hours: e.target.value }))}
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={form.active}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                  />
                  <Label htmlFor="active">{t('productionManagement.create.active')}</Label>
                </div>

                <div className="space-y-3 border-t pt-6">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">{t('productionManagement.create.stagesTitle')}</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addStage}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('productionManagement.create.addStage')}
                    </Button>
                  </div>
                  {stages.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('productionManagement.create.noStages')}</p>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={stages.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {stages.map((stage, index) => (
                            <SortableStageRow
                              key={stage.id}
                              stage={stage}
                              index={index}
                              updateStage={updateStage}
                              removeStage={removeStage}
                              bottleneckType={getBottleneckType(index)}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.saving')}
                      </>
                    ) : (
                      t('productionManagement.create.submit')
                    )}
                  </Button>
                  <Button type="button" variant="outline" asChild>
                    <Link to="/production">{t('common.cancel')}</Link>
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default CreateSewingLineSchematicPage;
