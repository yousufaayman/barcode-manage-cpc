import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Layout from '../components/Layout';
import {
  productionApi,
  SewingLineSchematicDetail,
  SchematicWorkerBreakdownResponse,
} from '@/services/api';
import { Loader2 } from 'lucide-react';

const SchematicWorkerBreakdownPage: React.FC = () => {
  const { schematicId } = useParams<{ schematicId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialFrom = searchParams.get('from') ?? '';
  const initialTo = searchParams.get('to') ?? '';

  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [schematicDetail, setSchematicDetail] =
    useState<SewingLineSchematicDetail | null>(null);
  const [loadingSchematic, setLoadingSchematic] = useState(false);
  const [schematicError, setSchematicError] = useState<string | null>(null);
  const [breakdown, setBreakdown] =
    useState<SchematicWorkerBreakdownResponse | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);

  // If URL query changes (e.g. via navigation), sync inputs
  useEffect(() => {
    setFromDate(initialFrom);
    setToDate(initialTo);
  }, [initialFrom, initialTo]);

  useEffect(() => {
    if (!schematicId) return;
    setLoadingSchematic(true);
    setSchematicError(null);
    productionApi
      .getSchematicById(Number(schematicId))
      .then((detail) => {
        setSchematicDetail(detail);
      })
      .catch(() => {
        setSchematicError('Failed to load schematic details.');
        setSchematicDetail(null);
      })
      .finally(() => {
        setLoadingSchematic(false);
      });
  }, [schematicId]);

  useEffect(() => {
    if (!schematicId || !fromDate || !toDate) {
      setBreakdown(null);
      return;
    }
    setLoadingBreakdown(true);
    setBreakdownError(null);
    productionApi
      .getSchematicWorkerBreakdown(Number(schematicId), fromDate, toDate)
      .then((data) => {
        setBreakdown(data);
      })
      .catch(() => {
        setBreakdownError('Failed to load worker breakdown data.');
        setBreakdown(null);
      })
      .finally(() => {
        setLoadingBreakdown(false);
      });
  }, [schematicId, fromDate, toDate]);

  const groupedByWorker = useMemo(() => {
    if (!breakdown) return [];

    const records = breakdown.records ?? [];
    const aggregates = breakdown.aggregates ?? [];

    const map = new Map<
      number,
      {
        workerId: number;
        workerName: string;
        rows: {
          stageId: number;
          stageName: string;
          stageOrder: number;
          date: string;
          expectedOutput: number;
          trueOutput: number;
          efficiencyPct: number | null;
        }[];
        aggregate?: {
          totalExpected: number;
          totalTrue: number;
          efficiencyPct: number | null;
        };
      }
    >();

    for (const r of records) {
      const workerId = r.worker_id;
      const existing = map.get(workerId);
      const row = {
        stageId: r.stage_id,
        stageName: r.stage_name,
        stageOrder: r.stage_order,
        date: r.work_date,
        expectedOutput: r.expected_output,
        trueOutput: r.true_output,
        efficiencyPct:
          r.efficiency_pct != null ? Number(r.efficiency_pct) : null,
      };
      if (!existing) {
        map.set(workerId, {
          workerId,
          workerName: r.worker_name,
          rows: [row],
        });
      } else {
        existing.rows.push(row);
      }
    }

    for (const agg of aggregates) {
      const entry = map.get(agg.worker_id);
      if (entry) {
        entry.aggregate = {
          totalExpected: agg.total_expected_output,
          totalTrue: agg.total_true_output,
          efficiencyPct:
            agg.efficiency_pct != null ? Number(agg.efficiency_pct) : null,
        };
      }
    }

    // Sort rows within each worker by stage_order, then stage_name, then date
    const workers = Array.from(map.values());
    workers.forEach((w) => {
      w.rows.sort((a, b) => {
        if (a.stageOrder !== b.stageOrder) {
          return a.stageOrder - b.stageOrder;
        }
        const nameCmp = a.stageName.localeCompare(b.stageName);
        if (nameCmp !== 0) return nameCmp;
        return a.date.localeCompare(b.date);
      });
    });

    // Sort workers alphabetically
    workers.sort((a, b) => a.workerName.localeCompare(b.workerName));

    return workers;
  }, [breakdown]);

  const handleApplyRange = () => {
    if (!schematicId) return;
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    navigate(
      `/advanced-statistics/schematics/${schematicId}/worker-breakdown?${params.toString()}`
    );
  };

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-800">
            Schematic Worker Production Breakdown
          </h1>
          <p className="text-sm text-gray-600">
            Placeholder page for detailed worker-level production analytics for this schematic.
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <p>
            <span className="font-medium">Schematic ID:</span>{' '}
            <span className="font-mono">{schematicId}</span>
          </p>
          <p className="mt-1">
            <span className="font-medium">Schematic name:</span>{' '}
            {schematicDetail ? (
              <span className="font-semibold text-gray-900">
                {schematicDetail.name}
                {schematicDetail.phase_name
                  ? ` (${schematicDetail.phase_name})`
                  : ''}
              </span>
            ) : loadingSchematic ? (
              <span className="inline-flex items-center gap-1 text-gray-500">
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading...
              </span>
            ) : (
              <span className="text-gray-500">Not loaded</span>
            )}
          </p>
          <p className="mt-1">
            <span className="font-medium">Date range:</span>{' '}
            {fromDate && toDate ? (
              <span className="font-mono">
                {fromDate} → {toDate}
              </span>
            ) : (
              <span className="text-gray-500">Not specified</span>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label
                htmlFor="schematic-from-date"
                className="text-xs font-medium text-gray-600"
              >
                From date
              </label>
              <input
                id="schematic-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="schematic-to-date"
                className="text-xs font-medium text-gray-600"
              >
                To date
              </label>
              <input
                id="schematic-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
            </div>
            <div className="pb-1">
              <button
                type="button"
                onClick={handleApplyRange}
                disabled={!fromDate || !toDate}
                className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                Apply range
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            Schematic drawing (sorted by stage order)
          </h2>
          {schematicError && (
            <p className="mb-2 text-sm text-red-600">{schematicError}</p>
          )}
          {loadingSchematic && !schematicDetail && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading schematic stages…</span>
            </div>
          )}
          {!loadingSchematic && schematicDetail && schematicDetail.stages.length === 0 && (
            <p className="text-sm text-gray-500">
              This schematic has no configured stages.
            </p>
          )}
          {!loadingSchematic && schematicDetail && schematicDetail.stages.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {schematicDetail.stages
                .slice()
                .sort((a, b) => a.stage_order - b.stage_order)
                .map((stage, index) => (
                  <React.Fragment key={stage.stage_id}>
                    <div className="flex flex-col items-center">
                      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 shadow-sm">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                          #{stage.stage_order}
                        </div>
                        <div className="mt-1 text-sm font-medium text-gray-900">
                          {stage.stage_name}
                        </div>
                      </div>
                    </div>
                    {index < schematicDetail.stages.length - 1 && (
                      <span className="text-lg text-gray-400">→</span>
                    )}
                  </React.Fragment>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            Worker production breakdown
          </h2>
          <div className="mb-3 flex items-center gap-3 text-xs text-gray-600">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                className="h-3 w-3 rounded border-gray-300"
                checked={compactView}
                onChange={(e) => setCompactView(e.target.checked)}
              />
              <span className="font-medium">Compact view</span>
              <span className="text-[11px] text-gray-500">
                (totals only, hide daily rows)
              </span>
            </label>
          </div>
          {breakdownError && (
            <p className="mb-2 text-sm text-red-600">{breakdownError}</p>
          )}
          {(!fromDate || !toDate) && (
            <p className="text-sm text-gray-500">
              Select a valid date range above to see worker breakdown.
            </p>
          )}
          {fromDate &&
            toDate &&
            loadingBreakdown && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading worker breakdown…</span>
              </div>
            )}
          {fromDate &&
            toDate &&
            !loadingBreakdown &&
            groupedByWorker.length === 0 && !breakdownError && (
              <p className="text-sm text-gray-500">
                No worker production records found for this schematic and date range.
              </p>
            )}
          {fromDate &&
            toDate &&
            !loadingBreakdown &&
            groupedByWorker.length > 0 && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs md:text-sm border border-gray-200 rounded-md">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      <th className="px-3 py-2">Worker</th>
                      <th className="px-3 py-2 text-right">Total expected</th>
                      <th className="px-3 py-2 text-right">Total true</th>
                      <th className="px-3 py-2 text-right">Efficiency</th>
                      {!compactView && (
                        <th className="px-3 py-2">Production records</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedByWorker.map((w) => (
                      <tr key={w.workerId} className="border-t border-gray-200 align-top">
                        <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
                          {w.workerName}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {w.aggregate
                            ? w.aggregate.totalExpected.toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {w.aggregate
                            ? w.aggregate.totalTrue.toLocaleString()
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                          {w.aggregate && w.aggregate.efficiencyPct != null
                            ? `${w.aggregate.efficiencyPct.toFixed(1)}%`
                            : '—'}
                        </td>
                        {!compactView && (
                          <td className="px-3 py-3">
                            <div className="space-y-3">
                              {w.rows.length === 0 && (
                                <p className="text-xs text-gray-500">
                                  No records for this worker in the selected range.
                                </p>
                              )}
                              {w.rows.length > 0 && (
                                <div className="space-y-3">
                                  {Object.values(
                                    w.rows.reduce((acc, row) => {
                                      const key = `${row.stageOrder}-${row.stageName}`;
                                      if (!acc[key]) {
                                        acc[key] = {
                                          stageName: row.stageName,
                                          stageOrder: row.stageOrder,
                                          rows: [] as typeof w.rows,
                                        };
                                      }
                                      acc[key].rows.push(row);
                                      return acc;
                                    }, {} as Record<string, { stageName: string; stageOrder: number; rows: typeof w.rows }>)
                                  )
                                    .sort(
                                      (a, b) => a.stageOrder - b.stageOrder
                                    )
                                    .map((group) => (
                                      <div key={`${group.stageOrder}-${group.stageName}`} className="border border-gray-200 rounded-md">
                                        <div className="bg-gray-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                          Stage: {group.stageName}
                                        </div>
                                        <div className="overflow-x-auto">
                                          <table className="min-w-full text-[11px]">
                                            <thead>
                                              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500">
                                                <th className="px-2 py-1">Date</th>
                                                <th className="px-2 py-1 text-right">
                                                  Expected
                                                </th>
                                                <th className="px-2 py-1 text-right">
                                                  True
                                                </th>
                                                <th className="px-2 py-1 text-right">
                                                  Eff.
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {group.rows.map((row) => (
                                                <tr key={`${row.stageId}-${row.date}`} className="border-t border-gray-100">
                                                  <td className="px-2 py-1 whitespace-nowrap">
                                                    {row.date}
                                                  </td>
                                                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                                                    {row.expectedOutput.toLocaleString()}
                                                  </td>
                                                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                                                    {row.trueOutput.toLocaleString()}
                                                  </td>
                                                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                                                    {row.efficiencyPct != null
                                                      ? `${row.efficiencyPct.toFixed(1)}%`
                                                      : '—'}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </div>
    </Layout>
  );
};

export default SchematicWorkerBreakdownPage;

