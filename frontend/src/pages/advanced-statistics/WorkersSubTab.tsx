import React, { useCallback, useMemo, useState } from 'react';
import {
  productionApi,
  AllWorkersProductionBreakdownResponse,
} from '@/services/api';
import { Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

type GroupedWorker = {
  workerId: number;
  workerName: string;
  aggregate: {
    totalExpected: number;
    totalTrue: number;
    totalWorkingHours: number;
    totalOvertimeHours: number;
    efficiencyPct: number | null;
  };
  rows: {
    phaseName: string;
    schematicName: string;
    date: string;
    expectedOutput: number;
    trueOutput: number;
    workingHours: number;
    overtimeHours: number;
    efficiencyPct: number | null;
  }[];
};

const WorkersSubTab: React.FC = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<AllWorkersProductionBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null);

  const fetchBreakdown = useCallback(() => {
    if (!fromDate || !toDate) return;
    setError(null);
    setLoading(true);
    productionApi
      .getWorkersProductionBreakdown(fromDate, toDate)
      .then((res) => {
        setData(res);
        setAppliedRange({ from: fromDate, to: toDate });
      })
      .catch(() => {
        setError('Failed to load workers production breakdown.');
        setData(null);
        setAppliedRange(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [fromDate, toDate]);

  const groupedByWorker = useMemo((): GroupedWorker[] => {
    if (!data) return [];
    const records = data.records ?? [];

    const byWorker = new Map<
      number,
      {
        workerName: string;
        totalExpected: number;
        totalTrue: number;
        totalWorkingHours: number;
        totalOvertimeHours: number;
        // Merge potential duplicate records coming from stage switching.
        // Key: phase|schematic|date
        rowsMap: Map<
          string,
          Omit<GroupedWorker['rows'][number], 'efficiencyPct'>
        >;
      }
    >();

    for (const r of records) {
      const entry = byWorker.get(r.worker_id);
      if (!entry) {
        byWorker.set(r.worker_id, {
          workerName: r.worker_name,
          totalExpected: 0,
          totalTrue: 0,
          totalWorkingHours: 0,
          totalOvertimeHours: 0,
          rowsMap: new Map(),
        });
      }

      const next = byWorker.get(r.worker_id);
      if (!next) continue;
      next.totalExpected += r.expected_output;
      next.totalTrue += r.true_output;
      next.totalWorkingHours += r.working_hours ?? 0;
      next.totalOvertimeHours += r.overtime_hours ?? 0;

      const key = `${r.phase_name}|${r.schematic_name}|${r.work_date}`;
      const existingRow = next.rowsMap.get(key);
      if (existingRow) {
        existingRow.expectedOutput += r.expected_output;
        existingRow.trueOutput += r.true_output;
        existingRow.workingHours += r.working_hours ?? 0;
        existingRow.overtimeHours += r.overtime_hours ?? 0;
      } else {
        next.rowsMap.set(key, {
          phaseName: r.phase_name,
          schematicName: r.schematic_name,
          date: r.work_date,
          expectedOutput: r.expected_output,
          trueOutput: r.true_output,
          workingHours: r.working_hours ?? 0,
          overtimeHours: r.overtime_hours ?? 0,
        });
      }
    }

    const result: GroupedWorker[] = Array.from(byWorker.entries()).map(
      ([workerId, v]) => ({
        workerId,
        workerName: v.workerName,
        aggregate: {
          totalExpected: v.totalExpected,
          totalTrue: v.totalTrue,
          totalWorkingHours: v.totalWorkingHours,
          totalOvertimeHours: v.totalOvertimeHours,
          efficiencyPct:
            v.totalExpected > 0 ? (v.totalTrue / v.totalExpected) * 100 : null,
        },
        rows: Array.from(v.rowsMap.values())
          .map((row) => ({
            ...row,
            efficiencyPct:
              row.expectedOutput > 0
                ? (row.trueOutput / row.expectedOutput) * 100
                : null,
          }))
          .sort(
            (a, b) =>
              a.phaseName.localeCompare(b.phaseName) ||
              a.schematicName.localeCompare(b.schematicName) ||
              a.date.localeCompare(b.date)
          ),
      })
    );
    result.sort((a, b) => a.workerName.localeCompare(b.workerName));
    return result;
  }, [data]);

  const hasAppliedRange = appliedRange && fromDate === appliedRange.from && toDate === appliedRange.to;
  const showContent = hasAppliedRange && !loading && data !== null;

  const downloadExcel = useCallback(() => {
    if (!groupedByWorker.length || !appliedRange) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: Compact View — Worker Id, Worker Name, Total Expected, Total True, Total Efficiency
    const compactData = groupedByWorker.map((w) => ({
      'Worker Id': w.workerId,
      'Worker Name': w.workerName,
      'Total Expected': w.aggregate.totalExpected,
      'Total True': w.aggregate.totalTrue,
      'Total Working Hours': w.aggregate.totalWorkingHours,
      'Of which overtime': w.aggregate.totalOvertimeHours,
      'Total Efficiency': w.aggregate.efficiencyPct != null ? `${w.aggregate.efficiencyPct.toFixed(1)}%` : '',
    }));
    const wsCompact = XLSX.utils.json_to_sheet(compactData);
    XLSX.utils.book_append_sheet(wb, wsCompact, 'Compact View');

    // Sheet 2: Breakdown — Worker Id, Worker, Phase, Schematic, Date, Expected, True, Eff.
    const breakdownRows: {
      'Worker Id': number;
      Worker: string;
      Phase: string;
      Schematic: string;
      Date: string;
      Expected: number;
      True: number;
      'Working Hours': number;
      'Of which overtime': number;
      'Eff.': string;
    }[] = [];
    for (const w of groupedByWorker) {
      for (const row of w.rows) {
        breakdownRows.push({
          'Worker Id': w.workerId,
          Worker: w.workerName,
          Phase: row.phaseName,
          Schematic: row.schematicName,
          Date: row.date,
          Expected: row.expectedOutput,
          True: row.trueOutput,
          'Working Hours': row.workingHours,
          'Of which overtime': row.overtimeHours,
          'Eff.': row.efficiencyPct != null ? `${row.efficiencyPct.toFixed(1)}%` : '',
        });
      }
    }
    const wsBreakdown = XLSX.utils.json_to_sheet(breakdownRows);
    XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Breakdown');

    const fileName = `workers-production-${appliedRange.from}_${appliedRange.to}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }, [groupedByWorker, appliedRange]);

  return (
    <div className="space-y-4">
      <p className="text-gray-600 text-sm">
        View production for all workers across phases and schematics in a date range. Choose dates and click Apply.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <h3 className="mb-3 text-base font-semibold text-gray-800">Date range</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="workers-from-date" className="text-xs font-medium text-gray-600">
              From date
            </label>
            <input
              id="workers-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="workers-to-date" className="text-xs font-medium text-gray-600">
              To date
            </label>
            <input
              id="workers-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="pb-1">
            <button
              type="button"
              onClick={fetchBreakdown}
              disabled={!fromDate || !toDate || loading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading…
                </>
              ) : (
                'Apply range'
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <h3 className="mb-3 text-base font-semibold text-gray-800">
          All workers production breakdown
        </h3>
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <label className="inline-flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              className="h-3 w-3 rounded border-gray-300"
              checked={compactView}
              onChange={(e) => setCompactView(e.target.checked)}
            />
            <span className="font-medium">Compact view</span>
            <span className="text-[11px] text-gray-500">
              (totals only, hide detail rows)
            </span>
          </label>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!showContent || groupedByWorker.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Download as Excel
          </button>
        </div>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {!fromDate || !toDate ? (
          <p className="text-sm text-gray-500">
            Choose a date range and click Apply to see worker production.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading workers breakdown…</span>
          </div>
        ) : showContent && groupedByWorker.length === 0 ? (
          <p className="text-sm text-gray-500">
            No production records found for this date range.
          </p>
        ) : showContent && groupedByWorker.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm border border-gray-200 rounded-md">
              <thead className="bg-gray-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2 text-right">Total expected</th>
                  <th className="px-3 py-2 text-right">Total true</th>
                  <th className="px-3 py-2 text-right">Working hours</th>
                  <th className="px-3 py-2 text-right">Of which overtime</th>
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
                      {w.aggregate.totalExpected.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {w.aggregate.totalTrue.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {w.aggregate.totalWorkingHours.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {w.aggregate.totalOvertimeHours.toFixed(2)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                      {w.aggregate.efficiencyPct != null
                        ? `${w.aggregate.efficiencyPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    {!compactView && (
                      <td className="px-3 py-3">
                        <div className="overflow-x-auto">
                          {w.rows.length === 0 ? (
                            <p className="text-xs text-gray-500">
                              No records for this worker in the selected range.
                            </p>
                          ) : (
                            <table className="min-w-full text-[11px] border border-gray-200 rounded-md">
                              <thead>
                                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500 bg-gray-50">
                                  <th className="px-2 py-1">Phase</th>
                                  <th className="px-2 py-1">Schematic</th>
                                  <th className="px-2 py-1">Date</th>
                                  <th className="px-2 py-1 text-right">Expected</th>
                                  <th className="px-2 py-1 text-right">True</th>
                                  <th className="px-2 py-1 text-right">Working hours</th>
                                  <th className="px-2 py-1 text-right">Of which overtime</th>
                                  <th className="px-2 py-1 text-right">Eff.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {w.rows.map((row, idx) => (
                                  <tr
                                    key={`${row.phaseName}-${row.schematicName}-${row.date}-${idx}`}
                                    className="border-t border-gray-100"
                                  >
                                    <td className="px-2 py-1 whitespace-nowrap">
                                      {row.phaseName}
                                    </td>
                                    <td className="px-2 py-1 whitespace-nowrap">
                                      {row.schematicName}
                                    </td>
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
                                      {row.workingHours.toFixed(2)}
                                    </td>
                                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                                      {row.overtimeHours.toFixed(2)}
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
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default WorkersSubTab;
