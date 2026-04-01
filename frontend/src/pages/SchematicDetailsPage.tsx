import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { productionApi, SewingLineSchematicDetail, SewingLineStageResponse } from '../services/api';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { ArrowLeft, ChevronDown, LayoutGrid, Loader2, Pencil } from 'lucide-react';

const STAGE_BOX_COLORS = [
  'border-emerald-400/60 bg-emerald-50/50 hover:border-emerald-500/70',
  'border-sky-400/60 bg-sky-50/50 hover:border-sky-500/70',
  'border-violet-400/60 bg-violet-50/50 hover:border-violet-500/70',
  'border-amber-400/60 bg-amber-50/50 hover:border-amber-500/70',
  'border-rose-400/60 bg-rose-50/50 hover:border-rose-500/70',
  'border-teal-400/60 bg-teal-50/50 hover:border-teal-500/70',
];

const STAGE_ORDER_BADGE_COLORS = [
  'bg-emerald-200/80 text-emerald-900',
  'bg-sky-200/80 text-sky-900',
  'bg-violet-200/80 text-violet-900',
  'bg-amber-200/80 text-amber-900',
  'bg-rose-200/80 text-rose-900',
  'bg-teal-200/80 text-teal-900',
];

const MACHINE_PILL_COLORS = [
  'bg-sky-100 text-sky-800 border border-sky-200',
  'bg-teal-100 text-teal-800 border border-teal-200',
  'bg-amber-100 text-amber-800 border border-amber-200',
  'bg-violet-100 text-violet-800 border border-violet-200',
  'bg-rose-100 text-rose-800 border border-rose-200',
  'bg-emerald-100 text-emerald-800 border border-emerald-200',
];

function lineCapacityFromStages(stages: SewingLineStageResponse[]): number | null {
  if (!stages.length) return null;
  const byOrder = new Map<number, number>();
  for (const s of stages) {
    const qty = s.production_qty ?? 0;
    byOrder.set(s.stage_order, (byOrder.get(s.stage_order) ?? 0) + qty);
  }
  const capacities = Array.from(byOrder.values());
  if (capacities.every((c) => c === 0)) return null;
  return Math.min(...capacities);
}

interface StageNode {
  stage_order: number;
  names: string[];
  totalOutput: number;
  occurrences: number;
  /** Per-machine production qty (units/hr), one per machine. */
  quantities: number[];
}

function stagesToOrderedNodes(stages: SewingLineStageResponse[]): StageNode[] {
  const byOrder = new Map<
    number,
    { names: string[]; quantities: number[] }
  >();
  for (const s of stages) {
    const existing = byOrder.get(s.stage_order);
    const name = s.stage_name?.trim() || '';
    const qty = s.production_qty ?? 0;
    if (!existing) {
      byOrder.set(s.stage_order, {
        names: name ? [name] : [],
        quantities: [qty],
      });
    } else {
      if (name && !existing.names.includes(name)) existing.names.push(name);
      existing.quantities.push(qty);
    }
  }
  return Array.from(byOrder.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([stage_order, { names, quantities }]) => ({
      stage_order,
      names: names.length ? names : [''],
      totalOutput: quantities.reduce((a, b) => a + b, 0),
      occurrences: quantities.length,
      quantities,
    }));
}

const SchematicDetailsPage: React.FC = () => {
  const { schematicId } = useParams<{ schematicId: string }>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const [schematic, setSchematic] = useState<SewingLineSchematicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (schematicId) {
      const id = Number.parseInt(schematicId, 10);
      if (Number.isNaN(id)) {
        setError(t('productionManagement.details.loadError'));
        setLoading(false);
        return;
      }
      const fetchSchematic = async () => {
        setLoading(true);
        setError(null);
        try {
          const data = await productionApi.getSchematicById(id);
          setSchematic(data);
        } catch {
          setError(t('productionManagement.details.loadError'));
          setSchematic(null);
        } finally {
          setLoading(false);
        }
      };
      fetchSchematic();
    }
  }, [schematicId, t]);

  const totalProduction = useMemo(
    () => (schematic?.stages ? lineCapacityFromStages(schematic.stages) : null),
    [schematic?.stages]
  );

  const orderedNodes = useMemo(
    () => (schematic?.stages?.length ? stagesToOrderedNodes(schematic.stages) : []),
    [schematic?.stages]
  );

  /** Effective output leaving each stage (bottleneck-limited: min capacity from start through this stage). */
  const effectiveOutputs = useMemo(() => {
    if (!orderedNodes.length) return [];
    const result: number[] = [];
    let runningMin = orderedNodes[0].totalOutput;
    for (let i = 0; i < orderedNodes.length; i++) {
      runningMin = Math.min(runningMin, orderedNodes[i].totalOutput);
      result.push(runningMin);
    }
    return result;
  }, [orderedNodes]);

  /** Stage indices where capacity equals line capacity (bottlenecks). */
  const bottleneckIndices = useMemo(() => {
    if (totalProduction == null || totalProduction <= 0 || !orderedNodes.length) return new Set<number>();
    const set = new Set<number>();
    orderedNodes.forEach((node, i) => {
      if (node.totalOutput === totalProduction) set.add(i);
    });
    return set;
  }, [orderedNodes, totalProduction]);

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-b from-gray-50/80 to-white">
        <div className="space-y-6 p-4 md:p-6 lg:p-8">
          {/* Header */}
          <header className="flex flex-wrap items-center gap-4">
            <Button variant="outline" size="icon" className="shrink-0 rounded-full" asChild>
              <Link to="/production">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm">
              <LayoutGrid className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-gray-900">
                {t('productionManagement.details.title')}
              </h1>
            </div>
            {schematic && user?.role === 'admin' && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/production/schematics/${schematic.schematic_id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('productionManagement.details.edit')}
                </Link>
              </Button>
            )}
          </header>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-sm">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          )}
          {!loading && schematic && (
            <>
              {/* Summary card */}
              <Card className="overflow-hidden border-gray-200/80 shadow-sm">
                <div className="border-l-4 border-primary bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg sm:text-xl font-semibold text-gray-900 break-words">
                      {schematic.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pb-6">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      <span>
                        <span className="text-sm font-medium text-gray-500">
                          {t('productionManagement.phase')}
                        </span>
                        <span className="ml-2 text-gray-900">{schematic.phase_name ?? t('common.na')}</span>
                      </span>
                      <Badge
                        variant={schematic.active ? 'default' : 'secondary'}
                        className="shrink-0 font-medium"
                      >
                        {schematic.active ? t('productionManagement.active') : t('productionManagement.inactive')}
                      </Badge>
                      {schematic.working_hours != null && (
                        <span>
                          <span className="text-sm font-medium text-gray-500">
                            {t('productionManagement.create.workingHours')}
                          </span>
                          <span className="ml-2 text-gray-900">{schematic.working_hours} h</span>
                        </span>
                      )}
                    </div>
                    {(totalProduction != null || (schematic.stages?.length ?? 0) > 0) && (
                      <div className="mt-3 flex flex-wrap gap-4">
                        <div className="w-full min-w-[200px] max-w-xs">
                          <div className="rounded-xl border-2 border-primary/30 bg-white px-4 py-4 shadow-md ring-1 ring-black/5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('productionManagement.create.hourlyProductionTotal')}
                            </p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-primary md:text-3xl">
                              {totalProduction != null ? totalProduction : '—'}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-primary md:text-xl">
                              {t('productionManagement.create.hourlyUnits')}
                            </p>
                          </div>
                        </div>
                        <div className="w-full min-w-[200px] max-w-xs">
                          <div className="rounded-xl border-2 border-primary/30 bg-white px-4 py-4 shadow-md ring-1 ring-black/5">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              {t('productionManagement.details.totalDailyProduction')}
                            </p>
                            <p className="mt-1 text-2xl font-bold tabular-nums text-primary md:text-3xl">
                              {totalProduction != null && schematic.working_hours != null && schematic.working_hours > 0
                                ? Math.round(totalProduction * schematic.working_hours)
                                : '—'}
                            </p>
                            <p className="mt-1 text-lg font-semibold text-primary md:text-xl">
                              {t('productionManagement.details.dailyUnits')}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </div>
              </Card>

              {/* Stages flow */}
              <Card className="overflow-hidden border-gray-200/80 shadow-sm">
                <CardHeader className="border-b bg-gray-50/50">
                  <CardTitle className="text-lg font-semibold">
                    {t('productionManagement.details.stagesTitle')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 md:p-6">
                  {orderedNodes.length === 0 ? (
                    <p className="py-10 text-center text-gray-500">
                      {t('productionManagement.details.noStages')}
                    </p>
                  ) : (
                    <div className="flex flex-col items-center gap-0 py-2">
                      {orderedNodes.map((node, index) => (
                        <React.Fragment key={node.stage_order}>
                          {/* Stage box */}
                          <div className="flex w-full max-w-md flex-col">
                            <div
                              className={`flex flex-col rounded-lg border-2 px-3 py-2.5 shadow-sm ring-1 transition ${
                                bottleneckIndices.has(index)
                                  ? 'border-amber-500 bg-amber-50/80 ring-amber-400/60'
                                  : `${STAGE_BOX_COLORS[index % STAGE_BOX_COLORS.length]} ring-black/5`
                              }`}
                            >
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex rounded px-1.5 py-0.5 text-xs font-semibold ${STAGE_ORDER_BADGE_COLORS[index % STAGE_ORDER_BADGE_COLORS.length]}`}
                                >
                                  #{node.stage_order}
                                </span>
                                <span className="text-sm font-medium text-gray-800">
                                  {node.names.filter(Boolean).join(', ') || '—'}
                                </span>
                                {bottleneckIndices.has(index) && (
                                  <span
                                    className="inline-flex items-center rounded bg-amber-200 px-1.5 py-0.5 text-xs font-semibold text-amber-900"
                                    title={t('productionManagement.create.bottleneckTitle')}
                                  >
                                    {t('productionManagement.details.bottleneck')}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 flex flex-col gap-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  {t('productionManagement.details.perStageProduction')}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {node.quantities.length > 0 ? (
                                    node.quantities.map((qty, i) => (
                                      <span
                                        key={`qty-${node.stage_order}-${i}`}
                                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${MACHINE_PILL_COLORS[i % MACHINE_PILL_COLORS.length]}`}
                                      >
                                        {t('productionManagement.details.machineN', {
                                          n: i + 1,
                                        })}
                                        : {qty} {t('productionManagement.create.hourlyUnits')}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {/* Output after stage (bottleneck-limited effective flow) */}
                            <div className="mt-1.5 flex flex-col items-center gap-0.5">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                {effectiveOutputs[index] != null && effectiveOutputs[index] > 0
                                  ? `${effectiveOutputs[index]} ${t('productionManagement.create.hourlyUnits')}`
                                  : '—'}
                              </span>
                              {effectiveOutputs[index] != null &&
                                effectiveOutputs[index] > 0 &&
                                effectiveOutputs[index] < node.totalOutput && (
                                  <span className="text-xs text-gray-500">
                                    {t('productionManagement.details.effectiveOutput')}
                                  </span>
                                )}
                            </div>
                          </div>
                          {/* Arrow between stages */}
                          {index < orderedNodes.length - 1 && (
                            <div className="flex shrink-0 items-center py-1">
                              <ChevronDown className="h-6 w-6 text-primary/60" aria-hidden />
                            </div>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default SchematicDetailsPage;
