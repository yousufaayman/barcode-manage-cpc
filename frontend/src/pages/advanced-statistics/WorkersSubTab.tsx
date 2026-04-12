import React, { useCallback, useMemo, useState } from 'react';
import {
  productionApi,
  AllWorkersProductionBreakdownResponse,
} from '@/services/api';
import { Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';

/** Highlight efficiency, quality, and utilization when strictly below this threshold. */
const LOW_PCT_THRESHOLD = 90;

const XLSX_LOW_PCT_FILL = { patternType: 'solid' as const, fgColor: { rgb: 'FFFEF3C7' } };
const XLSX_LOW_PCT_FONT = { bold: true, color: { rgb: 'FF92400E' } };

function isLowMetricPct(pct: number | null | undefined): boolean {
  return pct != null && pct < LOW_PCT_THRESHOLD;
}

function lowPctHighlightClass(pct: number | null | undefined): string {
  return isLowMetricPct(pct) ? 'bg-amber-50 font-semibold text-amber-900' : '';
}

function parsePctStringFromCell(v: unknown): number | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s.endsWith('%')) return null;
  const n = parseFloat(s.replace(/%/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Resolve 0-based column indices by matching header text in row 0. */
function columnIndicesByHeaders(ws: XLSX.WorkSheet, headerNames: string[]): number[] {
  const ref = ws['!ref'];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const R = range.s.r;
  const indexByHeader = new Map<string, number>();
  for (let C = range.s.c; C <= range.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: C });
    const v = ws[addr]?.v;
    if (v != null) indexByHeader.set(String(v).trim(), C);
  }
  return headerNames.map((name) => indexByHeader.get(name.trim())).filter((i): i is number => i != null);
}

/** Style Total Efficiency, Quality, Worker utilization cells when value is a percent below threshold. */
function applyLowPctHighlightsToWorksheet(ws: XLSX.WorkSheet, colIndices: number[], firstDataRow = 1) {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  for (let R = firstDataRow; R <= range.e.r; R++) {
    for (const C of colIndices) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      if (!cell || cell.v == null || cell.v === '') continue;
      const pct = parsePctStringFromCell(cell.v);
      if (pct != null && pct < LOW_PCT_THRESHOLD) {
        cell.s = {
          fill: XLSX_LOW_PCT_FILL,
          font: XLSX_LOW_PCT_FONT,
          alignment: { horizontal: 'right' },
        };
      }
    }
  }
}

/** Set column widths from max content length per column (fits headers and values). */
function autoFitWorksheetColumns(ws: XLSX.WorkSheet, maxWch = 48) {
  const ref = ws['!ref'];
  if (!ref) return;
  const range = XLSX.utils.decode_range(ref);
  const cols: { wch: number }[] = [];
  for (let C = range.s.c; C <= range.e.c; C++) {
    let maxLen = 8;
    for (let R = range.s.r; R <= range.e.r; R++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr];
      const raw = cell?.v != null ? String(cell.v) : '';
      if (raw.length > maxLen) maxLen = raw.length;
    }
    cols.push({ wch: Math.min(maxLen + 2, maxWch) });
  }
  ws['!cols'] = cols;
}

function aggregateQualityPct(totalTrue: number, totalRework: number): number | null {
  if (totalTrue < 0 || totalRework < 0) return null;
  if (totalRework <= 0) return totalTrue > 0 ? 100 : null;
  const d = totalTrue + totalRework;
  if (d <= 0) return null;
  return (totalTrue / d) * 100;
}

function rowQualityPct(trueOut: number, rework: number): number | null {
  if (trueOut < 0 || rework < 0) return null;
  if (rework <= 0) return trueOut > 0 ? 100 : null;
  return (trueOut / (trueOut + rework)) * 100;
}

type GroupedWorker = {
  workerId: number;
  workerName: string;
  aggregate: {
    totalExpected: number;
    totalTrue: number;
    totalWorkingHours: number;
    totalOvertimeHours: number;
    totalCapacityWorkingHours: number;
    totalReworkPcs: number;
    workerUtilizationPct: number | null;
    qualityPct: number | null;
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
    capacityWorkingHours: number;
    reworkPcs: number;
    workerUtilizationPct: number | null;
    qualityPct: number | null;
    efficiencyPct: number | null;
  }[];
};

const WorkersSubTab: React.FC = () => {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [data, setData] = useState<AllWorkersProductionBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(true);
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
        totalCapacityWorkingHours: number;
        totalReworkPcs: number;
        // Merge potential duplicate records coming from stage switching.
        // Key: phase|schematic|date
        rowsMap: Map<
          string,
          Omit<GroupedWorker['rows'][number], 'efficiencyPct' | 'workerUtilizationPct' | 'qualityPct'>
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
          totalCapacityWorkingHours: 0,
          totalReworkPcs: 0,
          rowsMap: new Map(),
        });
      }

      const next = byWorker.get(r.worker_id);
      if (!next) continue;
      const cap = r.capacity_working_hours ?? 0;
      const rework = r.rework_pcs ?? 0;
      next.totalExpected += r.expected_output;
      next.totalTrue += r.true_output;
      next.totalWorkingHours += r.working_hours ?? 0;
      next.totalOvertimeHours += r.overtime_hours ?? 0;
      next.totalCapacityWorkingHours += cap;
      next.totalReworkPcs += rework;

      const key = `${r.phase_name}|${r.schematic_name}|${r.work_date}`;
      const existingRow = next.rowsMap.get(key);
      if (existingRow) {
        existingRow.expectedOutput += r.expected_output;
        existingRow.trueOutput += r.true_output;
        existingRow.workingHours += r.working_hours ?? 0;
        existingRow.overtimeHours += r.overtime_hours ?? 0;
        existingRow.capacityWorkingHours += cap;
        existingRow.reworkPcs += rework;
      } else {
        next.rowsMap.set(key, {
          phaseName: r.phase_name,
          schematicName: r.schematic_name,
          date: r.work_date,
          expectedOutput: r.expected_output,
          trueOutput: r.true_output,
          workingHours: r.working_hours ?? 0,
          overtimeHours: r.overtime_hours ?? 0,
          capacityWorkingHours: cap,
          reworkPcs: rework,
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
          totalCapacityWorkingHours: v.totalCapacityWorkingHours,
          totalReworkPcs: v.totalReworkPcs,
          workerUtilizationPct:
            v.totalCapacityWorkingHours > 0
              ? (v.totalWorkingHours / v.totalCapacityWorkingHours) * 100
              : null,
          qualityPct: aggregateQualityPct(v.totalTrue, v.totalReworkPcs),
          efficiencyPct:
            v.totalExpected > 0 ? (v.totalTrue / v.totalExpected) * 100 : null,
        },
        rows: Array.from(v.rowsMap.values())
          .map((row) => ({
            ...row,
            workerUtilizationPct:
              row.capacityWorkingHours > 0
                ? (row.workingHours / row.capacityWorkingHours) * 100
                : null,
            qualityPct: rowQualityPct(row.trueOutput, row.reworkPcs),
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
      'Total working hours': Number(w.aggregate.totalCapacityWorkingHours.toFixed(2)),
      'True working hours': Number(w.aggregate.totalWorkingHours.toFixed(2)),
      'Of which overtime': w.aggregate.totalOvertimeHours,
      'Rework pcs': Math.round(w.aggregate.totalReworkPcs),
      'Total Efficiency': w.aggregate.efficiencyPct != null ? `${w.aggregate.efficiencyPct.toFixed(1)}%` : '',
      Quality:
        w.aggregate.qualityPct != null ? `${w.aggregate.qualityPct.toFixed(1)}%` : '',
      'Worker utilization':
        w.aggregate.workerUtilizationPct != null
          ? `${w.aggregate.workerUtilizationPct.toFixed(1)}%`
          : '',
    }));
    const wsCompact = XLSX.utils.json_to_sheet(compactData);
    applyLowPctHighlightsToWorksheet(
      wsCompact,
      columnIndicesByHeaders(wsCompact, ['Total Efficiency', 'Quality', 'Worker utilization'])
    );
    autoFitWorksheetColumns(wsCompact);
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
      'Total working hours': number;
      'True working hours': number;
      'Of which overtime': number;
      'Rework pcs': number;
      'Eff.': string;
      Quality: string;
      'Worker utilization': string;
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
          'Total working hours': Number(row.capacityWorkingHours.toFixed(2)),
          'True working hours': Number(row.workingHours.toFixed(2)),
          'Of which overtime': row.overtimeHours,
          'Rework pcs': Number(row.reworkPcs.toFixed(2)),
          'Eff.': row.efficiencyPct != null ? `${row.efficiencyPct.toFixed(1)}%` : '',
          Quality: row.qualityPct != null ? `${row.qualityPct.toFixed(1)}%` : '',
          'Worker utilization':
            row.workerUtilizationPct != null
              ? `${row.workerUtilizationPct.toFixed(1)}%`
              : '',
        });
      }
    }
    const wsBreakdown = XLSX.utils.json_to_sheet(breakdownRows);
    applyLowPctHighlightsToWorksheet(
      wsBreakdown,
      columnIndicesByHeaders(wsBreakdown, ['Eff.', 'Quality', 'Worker utilization'])
    );
    autoFitWorksheetColumns(wsBreakdown);
    XLSX.utils.book_append_sheet(wb, wsBreakdown, 'Breakdown');

    const fileName = `workers-production-${appliedRange.from}_${appliedRange.to}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }, [groupedByWorker, appliedRange]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
        <h3 className="mb-3 text-base font-semibold text-gray-800">Date range</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="space-y-1 w-full sm:w-auto">
            <label htmlFor="workers-from-date" className="text-xs font-medium text-gray-600">
              From date
            </label>
            <input
              id="workers-from-date"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none rounded-md border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="space-y-1 w-full sm:w-auto">
            <label htmlFor="workers-to-date" className="text-xs font-medium text-gray-600">
              To date
            </label>
            <input
              id="workers-to-date"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-9 w-full min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none rounded-md border border-gray-300 px-2 text-sm"
            />
          </div>
          <div className="pb-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={fetchBreakdown}
              disabled={!fromDate || !toDate || loading}
              className="inline-flex w-full justify-center items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 sm:w-auto"
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
          <button
            type="button"
            onClick={() => setCompactView((v) => !v)}
            disabled={!showContent || groupedByWorker.length === 0}
            className="inline-flex w-full sm:w-auto justify-center items-center rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {compactView ? 'Expand view' : 'Compact view'}
          </button>
          <button
            type="button"
            onClick={downloadExcel}
            disabled={!showContent || groupedByWorker.length === 0}
            className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
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
          <>
            {/* Mobile: card layout */}
            <div className="space-y-3 sm:hidden">
              {groupedByWorker.map((w) => (
                <div key={w.workerId} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{w.workerName}</div>
                      <div className="text-xs text-gray-500">ID: {w.workerId}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-right">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Efficiency</div>
                        <div
                          className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${lowPctHighlightClass(w.aggregate.efficiencyPct) || 'text-gray-900'}`}
                        >
                          {w.aggregate.efficiencyPct != null ? `${w.aggregate.efficiencyPct.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Quality</div>
                        <div
                          className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${lowPctHighlightClass(w.aggregate.qualityPct) || 'text-gray-900'}`}
                        >
                          {w.aggregate.qualityPct != null ? `${w.aggregate.qualityPct.toFixed(1)}%` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-500">Utilization</div>
                        <div
                          className={`inline-block rounded px-1.5 py-0.5 font-semibold tabular-nums ${lowPctHighlightClass(w.aggregate.workerUtilizationPct) || 'text-gray-900'}`}
                        >
                          {w.aggregate.workerUtilizationPct != null
                            ? `${w.aggregate.workerUtilizationPct.toFixed(1)}%`
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-md bg-gray-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">Expected</div>
                      <div className="font-semibold tabular-nums text-gray-900">{w.aggregate.totalExpected.toLocaleString()}</div>
                    </div>
                    <div className="rounded-md bg-gray-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">True</div>
                      <div className="font-semibold tabular-nums text-gray-900">{w.aggregate.totalTrue.toLocaleString()}</div>
                    </div>
                    <div className="rounded-md bg-gray-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">Hours</div>
                      <div className="font-semibold tabular-nums text-gray-900">{w.aggregate.totalWorkingHours.toFixed(2)}</div>
                    </div>
                    <div className="rounded-md bg-gray-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-gray-500">Overtime</div>
                      <div className="font-semibold tabular-nums text-gray-900">{w.aggregate.totalOvertimeHours.toFixed(2)}</div>
                    </div>
                  </div>

                  {!compactView && (
                    <details className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                      <summary className="cursor-pointer text-sm font-medium text-gray-700">
                        Records ({w.rows.length})
                      </summary>
                      {w.rows.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500">No records for this worker in the selected range.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {w.rows.map((row, idx) => (
                            <div key={`${row.phaseName}-${row.schematicName}-${row.date}-${idx}`} className="rounded-md bg-white p-2 border border-gray-200">
                              <div className="text-xs font-semibold text-gray-800 truncate">
                                {row.phaseName} · {row.schematicName}
                              </div>
                              <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-gray-600">
                                <div><span className="text-gray-500">Date:</span> {row.date}</div>
                                <div className="text-right">
                                  <span className="text-gray-500">Eff:</span>{' '}
                                  <span
                                    className={`tabular-nums rounded px-0.5 ${lowPctHighlightClass(row.efficiencyPct) || 'text-gray-900'}`}
                                  >
                                    {row.efficiencyPct != null ? `${row.efficiencyPct.toFixed(1)}%` : '—'}
                                  </span>
                                </div>
                                <div className="col-span-2 grid grid-cols-2 gap-1">
                                  <div>
                                    <span className="text-gray-500">Qual:</span>{' '}
                                    <span
                                      className={`tabular-nums rounded px-0.5 ${lowPctHighlightClass(row.qualityPct) || 'text-gray-900'}`}
                                    >
                                      {row.qualityPct != null ? `${row.qualityPct.toFixed(1)}%` : '—'}
                                    </span>
                                  </div>
                                  <div className="text-right">
                                    <span className="text-gray-500">Util:</span>{' '}
                                    <span
                                      className={`tabular-nums rounded px-0.5 ${lowPctHighlightClass(row.workerUtilizationPct) || 'text-gray-900'}`}
                                    >
                                      {row.workerUtilizationPct != null
                                        ? `${row.workerUtilizationPct.toFixed(1)}%`
                                        : '—'}
                                    </span>
                                  </div>
                                </div>
                                <div><span className="text-gray-500">Exp:</span> {row.expectedOutput.toLocaleString()}</div>
                                <div className="text-right"><span className="text-gray-500">True:</span> {row.trueOutput.toLocaleString()}</div>
                                <div><span className="text-gray-500">Hrs:</span> {row.workingHours.toFixed(2)}</div>
                                <div className="text-right"><span className="text-gray-500">OT:</span> {row.overtimeHours.toFixed(2)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop/tablet: table layout */}
            <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-xs md:text-sm border border-gray-200 rounded-md">
              <thead className="bg-gray-50">
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2 text-right">Total expected</th>
                  <th className="px-3 py-2 text-right">Total true</th>
                  <th className="px-3 py-2 text-right">Working hours</th>
                  <th className="px-3 py-2 text-right">Of which overtime</th>
                  <th className="px-3 py-2 text-right">Efficiency</th>
                  <th className="px-3 py-2 text-right">Quality</th>
                  <th className="px-3 py-2 text-right">Utilization</th>
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
                    <td
                      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap rounded-sm ${lowPctHighlightClass(
                        w.aggregate.efficiencyPct
                      )}`}
                    >
                      {w.aggregate.efficiencyPct != null
                        ? `${w.aggregate.efficiencyPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap rounded-sm ${lowPctHighlightClass(
                        w.aggregate.qualityPct
                      )}`}
                    >
                      {w.aggregate.qualityPct != null
                        ? `${w.aggregate.qualityPct.toFixed(1)}%`
                        : '—'}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums whitespace-nowrap rounded-sm ${lowPctHighlightClass(
                        w.aggregate.workerUtilizationPct
                      )}`}
                    >
                      {w.aggregate.workerUtilizationPct != null
                        ? `${w.aggregate.workerUtilizationPct.toFixed(1)}%`
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
                                  <th className="px-2 py-1 text-right">Qual.</th>
                                  <th className="px-2 py-1 text-right">Util.</th>
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
                                    <td
                                      className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${lowPctHighlightClass(
                                        row.efficiencyPct
                                      )}`}
                                    >
                                      {row.efficiencyPct != null
                                        ? `${row.efficiencyPct.toFixed(1)}%`
                                        : '—'}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${lowPctHighlightClass(
                                        row.qualityPct
                                      )}`}
                                    >
                                      {row.qualityPct != null
                                        ? `${row.qualityPct.toFixed(1)}%`
                                        : '—'}
                                    </td>
                                    <td
                                      className={`px-2 py-1 text-right tabular-nums whitespace-nowrap ${lowPctHighlightClass(
                                        row.workerUtilizationPct
                                      )}`}
                                    >
                                      {row.workerUtilizationPct != null
                                        ? `${row.workerUtilizationPct.toFixed(1)}%`
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
          </>
        ) : null}
      </div>
    </div>
  );
};

export default WorkersSubTab;
