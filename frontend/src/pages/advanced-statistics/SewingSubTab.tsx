import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  barcodeApi,
  productionApi,
} from '@/services/api';
import { Loader2, ChevronDown, Eye } from 'lucide-react';

type SewingPhase = {
  phase_id: number;
  phase_name: string;
  type?: string;
  sequence_order?: number;
};

type SchematicRangeStats = {
  schematicId: number;
  name: string;
  expectedHourly: number | null;
  expectedDaily: number | null;
  trueDaily: number | null;
  trueHourly: number | null;
  efficiencyPct: number | null;
};

const EFFICIENCY_STYLES = {
  red: {
    border: 'border-red-300',
    bg: 'bg-red-50',
    badge: 'bg-red-500',
    label: 'text-red-800',
    value: 'text-red-900',
    },
  orange: {
    border: 'border-orange-300',
    bg: 'bg-orange-50',
    badge: 'bg-orange-500',
    label: 'text-orange-800',
    value: 'text-orange-900',
  },
  green: {
    border: 'border-green-300',
    bg: 'bg-green-50',
    badge: 'bg-green-500',
    label: 'text-green-800',
    value: 'text-green-900',
  },
  neutral: {
    border: 'border-gray-200',
    bg: 'bg-gray-50',
    badge: 'bg-gray-400',
    label: 'text-gray-600',
    value: 'text-gray-900',
  },
} as const;

function EfficiencyBlock({
  expectedDaily,
  trueDaily,
}: Readonly<{
  expectedDaily: number | null;
  trueDaily: number | null;
}>) {
  const efficiencyPct =
    expectedDaily != null && expectedDaily > 0 && trueDaily != null
      ? (trueDaily / expectedDaily) * 100
      : null;
  let tier: keyof typeof EFFICIENCY_STYLES = 'neutral';
  if (efficiencyPct != null) {
    if (efficiencyPct < 70) tier = 'red';
    else if (efficiencyPct < 90) tier = 'orange';
    else tier = 'green';
  }
  const s = EFFICIENCY_STYLES[tier];
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg border px-4 py-3 ${s.border} ${s.bg}`}
    >
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold text-white uppercase ${s.badge}`}
      >
        Efficiency
      </span>
      <div className="flex flex-col">
        <span className={`text-[11px] uppercase tracking-wide ${s.label}`}>
          Efficiency (date range)
        </span>
        <span className={`text-lg font-semibold tabular-nums ${s.value}`}>
          {efficiencyPct != null ? `${efficiencyPct.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );
}

const SewingSubTab: React.FC = () => {
  const navigate = useNavigate();
  const [sewingPhases, setSewingPhases] = useState<SewingPhase[]>([]);
  const [loadingSewingPhases, setLoadingSewingPhases] = useState(false);
  const [sewingFromDate, setSewingFromDate] = useState<string>('');
  const [sewingToDate, setSewingToDate] = useState<string>('');
  const [appliedSewingRange, setAppliedSewingRange] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [phaseCapacities, setPhaseCapacities] = useState<
    Record<
      number,
      {
        expectedHourly: number | null;
        expectedDaily: number | null;
        workingHoursTotal: number | null;
        trueDaily: number | null;
        trueHourly: number | null;
      }
    >
  >({});
  const [loadingPhaseCapacities, setLoadingPhaseCapacities] = useState(false);
  const [schematicStatsByPhase, setSchematicStatsByPhase] = useState<
    Record<number, SchematicRangeStats[]>
  >({});
  const [expandedPhaseId, setExpandedPhaseId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadPhases = async () => {
      setLoadingSewingPhases(true);
      try {
        const phases = await barcodeApi.getPhases();
        if (cancelled) return;
        const sewing = (phases || []).filter(
          (p) => (p.type || '').toLowerCase() === 'sewing'
        );
        const withoutBase = sewing.filter(
          (p) => (p.phase_name || '').trim().toLowerCase() !== 'sewing'
        );
        withoutBase.sort(
          (a, b) =>
            (a.sequence_order ?? Number.POSITIVE_INFINITY) -
            (b.sequence_order ?? Number.POSITIVE_INFINITY)
        );
        setSewingPhases(withoutBase);
      } catch {
        if (!cancelled) setSewingPhases([]);
      } finally {
        if (!cancelled) setLoadingSewingPhases(false);
      }
    };
    loadPhases();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // When phases change, reset capacities and schematic stats back to empty
    if (sewingPhases.length === 0) {
      setPhaseCapacities({});
      setSchematicStatsByPhase({});
      return;
    }
  }, [sewingPhases]);

  const handleSewingSearch = () => {
    if (!sewingFromDate || !sewingToDate) return;
    // Clear previous stats before loading new range data
    setPhaseCapacities({});
    setSchematicStatsByPhase({});
    setAppliedSewingRange({ from: sewingFromDate, to: sewingToDate });
  };

  useEffect(() => {
    if (sewingPhases.length === 0 || !appliedSewingRange) return;

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayIso = `${yyyy}-${mm}-${dd}`;

    const { from, to } = appliedSewingRange;
    const fromDate = from || todayIso;
    const toDate = to || todayIso;

    const start = new Date(fromDate);
    const end = new Date(toDate);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      return;
    }

    let cancelled = false;

    const loadDailyAndSchematicConfigs = async () => {
      setLoadingPhaseCapacities(true);
      try {
        const capacities: typeof phaseCapacities = {};
        const schematicStats: typeof schematicStatsByPhase = {};

        for (const phase of sewingPhases) {
          const rangeData = await productionApi.getPhaseSchematicWorkRange(
            phase.phase_id,
            fromDate,
            toDate
          );
          const phaseSchematics = rangeData?.schematics ?? [];

          let expectedDailySum = 0;
          let trueDailySum = 0;
          let workingHoursTotal = 0;
          let expectedHourlySum = 0;

          const phaseSchematicStats: SchematicRangeStats[] = [];

          for (const s of phaseSchematics) {
            const expectedDaily = Number(s.expected_quantity ?? 0);
            const trueDaily = Number(s.true_quantity ?? 0);
            const expectedHourly =
              s.expected_hourly_work != null && Number(s.expected_hourly_work) > 0
                ? Number(s.expected_hourly_work)
                : null;
            if (expectedHourly != null) expectedHourlySum += expectedHourly;

            const trueHourly =
              s.true_hourly_work != null && Number(s.true_hourly_work) > 0
                ? Number(s.true_hourly_work)
                : null;

            // workingHoursTotal is derived from expected-work basis:
            // expected_work / expected_hourly_work.
            const whVal =
              expectedHourly != null && expectedHourly > 0
                ? expectedDaily / expectedHourly
                : 0;
            workingHoursTotal += whVal;

            const efficiencyPct =
              expectedDaily > 0 ? (trueDaily / expectedDaily) * 100 : null;

            phaseSchematicStats.push({
              schematicId: s.schematic_id,
              name: s.schematic_name,
              expectedHourly,
              expectedDaily,
              trueDaily,
              trueHourly,
              efficiencyPct,
            });

            expectedDailySum += expectedDaily;
            trueDailySum += trueDaily;
          }

          capacities[phase.phase_id] = {
            expectedHourly: expectedHourlySum > 0 ? expectedHourlySum : null,
            expectedDaily: expectedDailySum,
            workingHoursTotal: workingHoursTotal > 0 ? workingHoursTotal : null,
            trueDaily: trueDailySum,
            trueHourly:
              workingHoursTotal > 0 && trueDailySum > 0
                ? trueDailySum / workingHoursTotal
                : null,
          };

          schematicStats[phase.phase_id] = phaseSchematicStats;
        }

        if (cancelled) return;

        setPhaseCapacities(capacities);
        setSchematicStatsByPhase(schematicStats);
      } finally {
        if (!cancelled) {
          setLoadingPhaseCapacities(false);
        }
      }
    };

    loadDailyAndSchematicConfigs();

    return () => {
      cancelled = true;
    };
  }, [sewingPhases, appliedSewingRange]);

  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    setSewingFromDate(iso);
    setSewingToDate(iso);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1 w-full sm:w-auto">
          <label
            htmlFor="sewing-from-date"
            className="text-xs font-medium text-gray-600"
          >
            Sewing date from
          </label>
          <Input
            id="sewing-from-date"
            type="date"
            value={sewingFromDate}
            onChange={(e) => setSewingFromDate(e.target.value)}
            className="h-9 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none"
          />
        </div>
        <div className="space-y-1 w-full sm:w-auto">
          <label
            htmlFor="sewing-to-date"
            className="text-xs font-medium text-gray-600"
          >
            Sewing date to
          </label>
          <Input
            id="sewing-to-date"
            type="date"
            value={sewingToDate}
            onChange={(e) => setSewingToDate(e.target.value)}
            className="h-9 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none"
          />
        </div>
        <div className="pb-1 w-full sm:w-auto">
          <Button
            type="button"
            className="w-full sm:w-auto sm:mt-4"
            onClick={handleSewingSearch}
            disabled={!sewingFromDate || !sewingToDate}
          >
            Search
          </Button>
        </div>
      </div>
      {loadingSewingPhases && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading sewing phases…</span>
        </div>
      )}

      {!loadingSewingPhases && sewingPhases.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-500 text-center">
          No additional sewing phases found. Configure sewing phases in Production
          Management to see them here.
        </div>
      )}

      {!loadingSewingPhases && sewingPhases.length > 0 && (
        <div className="space-y-4">
          {sewingPhases.map((phase) => {
            const capacity = phaseCapacities[phase.phase_id];
            const expectedHourly = capacity?.expectedHourly ?? null;
            const expectedDaily = capacity?.expectedDaily ?? null;
            const trueDaily = capacity?.trueDaily ?? null;
            const trueHourly = capacity?.trueHourly ?? null;
            const schematicStats = schematicStatsByPhase[phase.phase_id] ?? [];
            const isExpanded = expandedPhaseId === phase.phase_id;

            return (
              <Card
                key={phase.phase_id}
                className="w-full border border-indigo-100 bg-white/80 shadow-sm hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between gap-2 text-base font-semibold text-gray-800">
                    <div className="flex items-center gap-2">
                      <span>{phase.phase_name}</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        Sewing phase
                      </span>
                    </div>
                    {schematicStats.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPhaseId((prev) =>
                            prev === phase.phase_id ? null : phase.phase_id
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        <span>{isExpanded ? 'Hide schematics' : 'Show schematics'}</span>
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-gray-600">
                  <div className="grid grid-cols-1 gap-3 md:gap-4 lg:grid-cols-3">
                    <div className="flex flex-1 min-w-0 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 uppercase">
                        Expected
                      </span>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wide text-gray-500">
                            Expected work
                          </span>
                          <span className="text-lg font-semibold text-gray-900 tabular-nums">
                            {loadingPhaseCapacities && !capacity
                              ? '…'
                              : expectedDaily != null
                              ? expectedDaily.toLocaleString()
                              : '—'}
                          </span>
                          <span className="text-xs text-gray-500">units</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wide text-gray-500">
                            Expected hourly work
                          </span>
                          <span className="text-lg font-semibold text-gray-900 tabular-nums">
                            {loadingPhaseCapacities && !capacity
                              ? '…'
                              : expectedHourly != null
                              ? expectedHourly.toLocaleString()
                              : '—'}
                          </span>
                          <span className="text-xs text-gray-500">
                            units / hour
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-1 min-w-0 items-center gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3">
                      <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-semibold text-white uppercase">
                        True
                      </span>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wide text-emerald-700">
                            True work
                          </span>
                          <span className="text-lg font-semibold text-emerald-900 tabular-nums">
                            {trueDaily != null
                              ? trueDaily.toLocaleString()
                              : '—'}
                          </span>
                          <span className="text-xs text-emerald-700/80">
                            units
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase tracking-wide text-emerald-700">
                            True hourly work
                          </span>
                          <span className="text-lg font-semibold text-emerald-900 tabular-nums">
                            {trueHourly != null ? trueHourly.toFixed(1) : '—'}
                          </span>
                          <span className="text-xs text-emerald-700/80">
                            units / hour
                          </span>
                        </div>
                      </div>
                    </div>

                    <EfficiencyBlock
                      expectedDaily={expectedDaily}
                      trueDaily={trueDaily}
                    />
                  </div>

                  {isExpanded && schematicStats.length > 0 && (
                    <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-gray-700 shadow-sm">
                      <div className="mb-2 font-semibold text-[12px] uppercase tracking-wide text-indigo-700">
                        Schematic breakdown (date-range expected vs true)
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-[13px]">
                          <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                              <th className="py-2 pr-4">Schematic</th>
                              <th className="py-2 pr-4 text-right">Expected work</th>
                              <th className="py-2 pr-4 text-right">True work</th>
                              <th className="py-2 pr-4 text-right">Expected hourly</th>
                              <th className="py-2 pr-4 text-right">True hourly</th>
                              <th className="py-2 pr-4 text-right">Efficiency</th>
                              <th className="py-2 pl-2 text-center">Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {schematicStats.map((s) => (
                              <tr key={s.schematicId} className="border-t border-indigo-100/70">
                                <td className="py-2 pr-4">
                                  <span className="font-semibold text-gray-800">{s.name}</span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-sm">
                                  {s.expectedDaily != null
                                    ? s.expectedDaily.toLocaleString()
                                    : '—'}
                                  <span className="ml-1 text-[11px] text-gray-500">units</span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-sm">
                                  {s.trueDaily != null
                                    ? s.trueDaily.toLocaleString()
                                    : '—'}
                                  <span className="ml-1 text-[11px] text-gray-500">units</span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-sm">
                                  {s.expectedHourly != null
                                    ? s.expectedHourly.toLocaleString()
                                    : '—'}
                                  <span className="ml-1 text-[11px] text-gray-500">
                                    u/h
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-sm">
                                  {s.trueHourly != null ? s.trueHourly.toFixed(1) : '—'}
                                  <span className="ml-1 text-[11px] text-gray-500">
                                    u/h
                                  </span>
                                </td>
                                <td className="py-2 pr-4 text-right tabular-nums text-sm">
                                  {s.efficiencyPct != null
                                    ? `${s.efficiencyPct.toFixed(1)}%`
                                    : '—'}
                                </td>
                                <td className="py-2 pl-2 text-center">
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
                                    onClick={() => {
                                      const from =
                                        appliedSewingRange?.from ?? sewingFromDate;
                                      const to =
                                        appliedSewingRange?.to ?? sewingToDate;
                                      navigate(
                                        `/advanced-statistics/schematics/${s.schematicId}/worker-breakdown?from=${encodeURIComponent(
                                          from
                                        )}&to=${encodeURIComponent(to)}`
                                      );
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SewingSubTab;
