import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import SearchableDropdown from '@/components/SearchableDropdown';
import { jobOrderApi, cutsApi, CutDetails, CutDetailsListResponse } from '@/services/api';
import { Eye, Download } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { getSizeSortKey } from '@/utils/sizeSort';
import * as XLSX from 'xlsx-js-style';

interface CutRow {
  id: number;
  cutNumber: string;
  jobOrderNumber: string;
  colorName: string;
  modelName: string;
  materialName: string;
  date: string;
  quantity: number;
  printing: string;
  consumptionM: string;
  consumptionKg: string;
}

const CuttingSubTab: React.FC = () => {
  const [clientSearch, setClientSearch] = useState('');
  const [jobOrderSearch, setJobOrderSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [clientOptions, setClientOptions] = useState<string[]>([]);
  const [jobOrderOptions, setJobOrderOptions] = useState<string[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [jobOrderClientByNumber, setJobOrderClientByNumber] =
    useState<Record<string, string>>({});
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [allDates, setAllDates] = useState(false);
  const [cutRows, setCutRows] = useState<CutRow[]>([]);
  const [cutDetailsForBreakdown, setCutDetailsForBreakdown] = useState<CutDetails[]>([]);
  const [loadingCuts, setLoadingCuts] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const navigate = useNavigate();

  const cutsSummary = useMemo(() => {
    const count = cutRows.length;
    const totalQuantity = cutRows.reduce((sum, row) => sum + row.quantity, 0);
    return { count, totalQuantity };
  }, [cutRows]);

  const jobOrderGroups = useMemo(() => {
    type GroupBuilder = {
      clientName: string;
      jobOrderNumber: string;
      cuts: CutDetails[];
      sizeValues: Set<string>;
    };

    const groupsMap = new Map<string, GroupBuilder>();

    for (const cut of cutDetailsForBreakdown) {
      const jobOrderNumber = cut.job_order_number || 'Unknown job order';
      const clientName =
        jobOrderClientByNumber[cut.job_order_number] ?? 'Unknown client';
      const key = `${clientName}||${jobOrderNumber}`;

      let group = groupsMap.get(key);
      if (!group) {
        group = {
          clientName,
          jobOrderNumber,
          cuts: [],
          sizeValues: new Set<string>(),
        };
        groupsMap.set(key, group);
      }

      group.cuts.push(cut);

      for (const size of cut.sizes ?? []) {
        if (size.size_value) {
          group.sizeValues.add(size.size_value);
        }
      }
    }

    const groups = Array.from(groupsMap.values()).map((group) => {
      const sizeLabels = Array.from(group.sizeValues).sort((a, b) => {
        const [aCat, aNum, aLabel] = getSizeSortKey(a);
        const [bCat, bNum, bLabel] = getSizeSortKey(b);
        if (aCat !== bCat) return (aCat as number) - (bCat as number);
        if (aNum !== bNum) return (aNum as number) - (bNum as number);
        return String(aLabel).localeCompare(String(bLabel));
      });

      const sortedCuts = [...group.cuts].sort((a, b) => {
        const colorA = a.color_name ?? 'Unknown color';
        const colorB = b.color_name ?? 'Unknown color';
        const colorCmp = colorA.localeCompare(colorB);
        if (colorCmp !== 0) return colorCmp;

        const dateA = a.created_at ?? '';
        const dateB = b.created_at ?? '';
        const dateCmp = dateA.localeCompare(dateB);
        if (dateCmp !== 0) return dateCmp;

        return (a.cut_id ?? 0) - (b.cut_id ?? 0);
      });

      return {
        clientName: group.clientName,
        jobOrderNumber: group.jobOrderNumber,
        sizeLabels,
        cuts: sortedCuts,
      };
    });

    groups.sort((a, b) => {
      const clientCmp = a.clientName.localeCompare(b.clientName);
      if (clientCmp !== 0) return clientCmp;
      return a.jobOrderNumber.localeCompare(b.jobOrderNumber);
    });

    return groups;
  }, [cutDetailsForBreakdown, jobOrderClientByNumber]);

  useEffect(() => {
    let isMounted = true;

    const loadOptions = async () => {
      try {
        const items = await jobOrderApi.getAllSimple();
        if (!isMounted) return;

        const clients = new Set<string>();
        const jobOrders = new Set<string>();
        const clientMap: Record<string, string> = {};

        for (const jo of items) {
          if (jo.client_name) {
            clients.add(jo.client_name);
          }
          if (jo.job_order_number) {
            jobOrders.add(jo.job_order_number);
            if (jo.client_name) {
              clientMap[jo.job_order_number] = jo.client_name;
            }
          }
        }

        setClientOptions(Array.from(clients).sort((a, b) => a.localeCompare(b)));
        setJobOrderOptions(Array.from(jobOrders).sort((a, b) => a.localeCompare(b)));
        setJobOrderClientByNumber(clientMap);

        const models = await jobOrderApi.getExistingModels();
        if (!isMounted) return;
        setModelOptions([...models].sort((a, b) => a.localeCompare(b)));
      } catch (err) {
        console.error('Failed to load client/job order options for cutting query:', err);
      }
    };

    loadOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;
    setFromDate(iso);
    setToDate(iso);
  }, []);

  const handleSearchCuts = async () => {
    setLoadingCuts(true);
    try {
      let jobOrderId: number | undefined;

      if (jobOrderSearch) {
        try {
          const jo = await jobOrderApi.getByNumber(jobOrderSearch);
          jobOrderId = jo.job_order_id;
        } catch (err) {
          console.error('Failed to resolve job order number for cutting query:', err);
        }
      }

      // The backend caps `limit` at 100 per page, so a single request can silently
      // drop cuts once a job order (or the whole date range) has more than 100 of
      // them. Page through the full result set instead of only reading page 1.
      const pageSize = 100;
      const cuts: CutDetails[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response: CutDetailsListResponse | CutDetails[] = await cutsApi.getAllCuts(
          page,
          pageSize,
          jobOrderId ? { job_order_id: jobOrderId } : undefined
        );

        if (Array.isArray(response)) {
          cuts.push(...response);
          break;
        }

        cuts.push(...(response.cuts ?? []));
        totalPages = response.total_pages ?? 1;
        page += 1;
      } while (page <= totalPages);

      const filteredCuts = cuts.filter((cut) => {
        if (!cut.created_at) return false;
        const d = new Date(cut.created_at);
        if (Number.isNaN(d.getTime())) return false;
        const day = d.toISOString().slice(0, 10);

        if (!allDates) {
          if (fromDate && day < fromDate) return false;
          if (toDate && day > toDate) return false;
        }

        if (clientSearch) {
          const clientName =
            jobOrderClientByNumber[cut.job_order_number] ?? '';
          if (clientName !== clientSearch) {
            return false;
          }
        }

        if (modelSearch && cut.model_name !== modelSearch) {
          return false;
        }

        return true;
      });

      const rows: CutRow[] = filteredCuts.map((cut) => {
        const totalPieces =
          cut.sizes?.reduce((sum, size) => sum + (size.total_pieces ?? 0), 0) ?? 0;

        const consumptionM =
          totalPieces > 0 && cut.marker_length != null && cut.total_layers != null
            ? ((cut.marker_length * cut.total_layers) / totalPieces).toFixed(3)
            : '-';

        const consumptionKg =
          totalPieces > 0 && cut.cut_weight != null
            ? (cut.cut_weight / totalPieces).toFixed(3)
            : '-';

        const layers = cut.total_layers ?? 0;
        const ratioSum =
          cut.sizes?.reduce((sum, size) => {
            if (size.ratio != null) {
              return sum + size.ratio;
            }
            if (layers > 0 && size.total_pieces != null) {
              return sum + size.total_pieces / layers;
            }
            return sum;
          }, 0) ?? 0;

        const quantity =
          layers > 0 && ratioSum > 0 ? Math.round(ratioSum * layers) : totalPieces;

        const raw = cut as CutDetails & { colorName?: string; color?: string };
        const colorName = raw.color_name ?? raw.colorName ?? raw.color ?? '-';
        return {
          id: cut.cut_id,
          cutNumber: String(cut.cut_id),
          jobOrderNumber: cut.job_order_number ?? '-',
          colorName,
          modelName: cut.model_name ?? '-',
          materialName: cut.material_name ?? '-',
          date: cut.created_at ? new Date(cut.created_at).toLocaleDateString() : '-',
          quantity,
          printing: cut.print_status ?? 'N/A',
          consumptionM,
          consumptionKg,
        };
      });

      setCutRows(rows);
      setCutDetailsForBreakdown(filteredCuts);
    } catch (err) {
      console.error('Failed to load cutting data for advanced statistics:', err);
      setCutRows([]);
    } finally {
      setLoadingCuts(false);
    }
  };

  const downloadExcel = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const getCutColor = (c: CutDetails) => {
      const r = c as CutDetails & { colorName?: string; color?: string };
      return r.color_name ?? r.colorName ?? r.color ?? '-';
    };

    // Build Statistics sheet first (with heading and client names)
    const clientsInReport = Array.from(
      new Set(
        cutDetailsForBreakdown
          .map((c) => jobOrderClientByNumber[c.job_order_number ?? ''])
          .filter(Boolean)
      )
    ).sort((a, b) => (a || '').localeCompare(b || ''));
    const clientHeading =
      clientsInReport.length > 0
        ? `Client(s): ${clientsInReport.join(', ')}`
        : 'Client(s): —';

    // Aggregate by model, job order, and color: sum quantity, avg consumption m/kg, size sums per (model, job order, color)
    const byModelJoColor = new Map<
      string,
      {
        modelName: string;
        jobOrderNumber: string;
        colorName: string;
        totalQuantity: number;
        consumptionMSum: number;
        consumptionKgSum: number;
        cutCount: number;
        sizeSums: Record<string, number>;
      }
    >();
    for (const cut of cutDetailsForBreakdown) {
      const modelName = cut.model_name ?? '-';
      const jobOrderNumber = cut.job_order_number ?? '-';
      const colorName = getCutColor(cut);
      const key = `${modelName}\t${jobOrderNumber}\t${colorName}`;
      const totalPieces =
        cut.sizes?.reduce((sum, s) => sum + (s.total_pieces ?? 0), 0) ?? 0;
      const consumptionM =
        totalPieces > 0 && cut.marker_length != null && cut.total_layers != null
          ? (cut.marker_length * cut.total_layers) / totalPieces
          : 0;
      const consumptionKg =
        totalPieces > 0 && cut.cut_weight != null
          ? cut.cut_weight / totalPieces
          : 0;
      const layers = cut.total_layers ?? 0;
      const ratioSum =
        cut.sizes?.reduce((sum, size) => {
          if (size.ratio != null) return sum + size.ratio;
          if (layers > 0 && size.total_pieces != null)
            return sum + size.total_pieces / layers;
          return sum;
        }, 0) ?? 0;
      const cutQuantity =
        layers > 0 && ratioSum > 0 ? Math.round(ratioSum * layers) : totalPieces;

      let agg = byModelJoColor.get(key);
      if (!agg) {
        agg = {
          modelName,
          jobOrderNumber,
          colorName,
          totalQuantity: 0,
          consumptionMSum: 0,
          consumptionKgSum: 0,
          cutCount: 0,
          sizeSums: {},
        };
        byModelJoColor.set(key, agg);
      }
      agg.totalQuantity += cutQuantity;
      agg.consumptionMSum += consumptionM;
      agg.consumptionKgSum += consumptionKg;
      agg.cutCount += 1;
      for (const s of cut.sizes ?? []) {
        const sv = s.size_value ?? '-';
        agg.sizeSums[sv] = (agg.sizeSums[sv] ?? 0) + (s.total_pieces ?? 0);
      }
    }

    const modelOrder = Array.from(byModelJoColor.values()).reduce(
      (acc, v) => (acc.includes(v.modelName) ? acc : [...acc, v.modelName]),
      [] as string[]
    );
    modelOrder.sort((a, b) => a.localeCompare(b));

    // First row left empty for logo (paste from /lovable-uploads/33fc39df-cd6b-474a-93eb-94892c005f8e.png or /company-logo.png); xlsx-js-style cannot embed images
    const statsRows: (string | number)[][] = [
      [], // Logo placeholder row
      ['Cotton Plus Cutting Report'],
      [clientHeading],
      [],
      [
        'Model Number',
        'Job Order Number',
        'Color',
        'Sum Quantity',
        'Avg Consumption (m)',
        'Avg Consumption (kg)',
        'Number of Cuts',
        'Size Breakdown (sum per size)',
      ],
    ];
    for (const modelName of modelOrder) {
      const entries = Array.from(byModelJoColor.values()).filter(
        (e) => e.modelName === modelName
      );
      entries.sort((a, b) => {
        const joCmp = a.jobOrderNumber.localeCompare(b.jobOrderNumber);
        if (joCmp !== 0) return joCmp;
        return a.colorName.localeCompare(b.colorName);
      });
      let modelTotalQty = 0;
      let modelConsMNum = 0;
      let modelConsKgNum = 0;
      let modelCuts = 0;
      let lastJobOrder = '';
      let lastColor = '';
      let colorTotalQty = 0;
      let colorConsMNum = 0;
      let colorConsKgSum = 0;
      let colorCuts = 0;
      let colorSizeSums: Record<string, number> = {};
      const pushColorTotal = (colorName: string) => {
        const avgM = colorCuts > 0 ? (colorConsMNum / colorCuts).toFixed(3) : '-';
        const avgKg = colorCuts > 0 ? (colorConsKgSum / colorCuts).toFixed(3) : '-';
        const colorSizeBreakdownStr = Object.entries(colorSizeSums)
          .sort(([a], [b]) => {
            const [aCat, aNum, aLabel] = getSizeSortKey(a);
            const [bCat, bNum, bLabel] = getSizeSortKey(b);
            if (aCat !== bCat) return (aCat as number) - (bCat as number);
            if (aNum !== bNum) return (aNum as number) - (bNum as number);
            return String(aLabel).localeCompare(String(bLabel));
          })
          .map(([size, qty]) => `${size}: ${qty}`)
          .join(', ');
        statsRows.push([
          '',
          '',
          `${colorName} (Total)`,
          colorTotalQty,
          avgM,
          avgKg,
          colorCuts,
          colorSizeBreakdownStr || '—',
        ]);
      };
      for (const e of entries) {
        if (e.jobOrderNumber !== lastJobOrder || e.colorName !== lastColor) {
          if (lastColor) pushColorTotal(lastColor);
          lastJobOrder = e.jobOrderNumber;
          lastColor = e.colorName;
          colorTotalQty = 0;
          colorConsMNum = 0;
          colorConsKgSum = 0;
          colorCuts = 0;
          colorSizeSums = {};
        }
        const avgM =
          e.cutCount > 0 ? (e.consumptionMSum / e.cutCount).toFixed(3) : '-';
        const avgKg =
          e.cutCount > 0 ? (e.consumptionKgSum / e.cutCount).toFixed(3) : '-';
        const sizeBreakdown = Object.entries(e.sizeSums)
          .sort(([a], [b]) => {
            const [aCat, aNum, aLabel] = getSizeSortKey(a);
            const [bCat, bNum, bLabel] = getSizeSortKey(b);
            if (aCat !== bCat) return (aCat as number) - (bCat as number);
            if (aNum !== bNum) return (aNum as number) - (bNum as number);
            return String(aLabel).localeCompare(String(bLabel));
          })
          .map(([size, qty]) => `${size}: ${qty}`)
          .join(', ');
        statsRows.push([
          e.modelName,
          e.jobOrderNumber,
          e.colorName,
          e.totalQuantity,
          avgM,
          avgKg,
          e.cutCount,
          sizeBreakdown || '—',
        ]);
        modelTotalQty += e.totalQuantity;
        modelConsMNum += e.consumptionMSum;
        modelConsKgNum += e.consumptionKgSum;
        modelCuts += e.cutCount;
        colorTotalQty += e.totalQuantity;
        colorConsMNum += e.consumptionMSum;
        colorConsKgSum += e.consumptionKgSum;
        colorCuts += e.cutCount;
        for (const [size, qty] of Object.entries(e.sizeSums)) {
          colorSizeSums[size] = (colorSizeSums[size] ?? 0) + qty;
        }
      }
      if (lastColor) pushColorTotal(lastColor);
      // Sum per model number: always add a model total row (like "T-Shirt Classic (Total)")
      const modelAvgM =
        modelCuts > 0 ? (modelConsMNum / modelCuts).toFixed(3) : '-';
      const modelAvgKg =
        modelCuts > 0 ? (modelConsKgNum / modelCuts).toFixed(3) : '-';
      const modelSizeBreakdown = entries.reduce<Record<string, number>>(
        (acc, e) => {
          for (const [size, qty] of Object.entries(e.sizeSums)) {
            acc[size] = (acc[size] ?? 0) + qty;
          }
          return acc;
        },
        {}
      );
      const modelSizeBreakdownStr = Object.entries(modelSizeBreakdown)
        .sort(([a], [b]) => {
          const [aCat, aNum, aLabel] = getSizeSortKey(a);
          const [bCat, bNum, bLabel] = getSizeSortKey(b);
          if (aCat !== bCat) return (aCat as number) - (bCat as number);
          if (aNum !== bNum) return (aNum as number) - (bNum as number);
          return String(aLabel).localeCompare(String(bLabel));
        })
        .map(([size, qty]) => `${size}: ${qty}`)
        .join(', ');
      statsRows.push([
        `${modelName} (Total)`,
        '—',
        '—',
        modelTotalQty,
        modelAvgM,
        modelAvgKg,
        modelCuts,
        modelSizeBreakdownStr || '—',
      ]);
    }
    const wsStats = XLSX.utils.aoa_to_sheet(statsRows);
    const statsNumCols = 8;
    wsStats['!merges'] = [
      { s: { r: 1, c: 0 }, e: { r: 1, c: statsNumCols - 1 } }, // Cotton Plus Cutting Report
      { s: { r: 2, c: 0 }, e: { r: 2, c: statsNumCols - 1 } },  // Clients
    ];
    wsStats['!cols'] = [
      { wch: 22 },
      { wch: 18 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
      { wch: 36 },
    ];
    // Style: title and clients (merged, larger text); table header row 4; data from row 5
    const reportTitleFont = { bold: true, color: { rgb: 'FFFFFFFF' }, sz: 20 };
    const reportTitleFill = { patternType: 'solid' as const, fgColor: { rgb: 'FF5B9BD5' } };
    const clientLabelFont = { bold: true, color: { rgb: 'FF000000' }, sz: 14 };
    const clientFill = { patternType: 'solid' as const, fgColor: { rgb: 'FFBDD7EE' } };
    const tableHeaderFill = { patternType: 'solid' as const, fgColor: { rgb: 'FF2F5496' } };
    const totalRowFill = { patternType: 'solid' as const, fgColor: { rgb: 'FFD6DCE4' } };
    const totalFont = { bold: true };
    if (wsStats['A2']) {
      wsStats['A2'].s = { fill: reportTitleFill, font: reportTitleFont, alignment: { horizontal: 'left' } };
    }
    if (wsStats['A3']) {
      wsStats['A3'].s = { fill: clientFill, font: clientLabelFont, alignment: { horizontal: 'left' } };
    }
    for (let c = 0; c < statsNumCols; c++) {
      const ref = XLSX.utils.encode_cell({ r: 4, c });
      if (wsStats[ref]) {
        wsStats[ref].s = { fill: tableHeaderFill, font: { bold: true, color: { rgb: 'FFFFFFFF' } }, alignment: { horizontal: 'center' } };
      }
    }
    for (let r = 5; r < statsRows.length; r++) {
      const cellA = XLSX.utils.encode_cell({ r, c: 0 });
      const cellColor = XLSX.utils.encode_cell({ r, c: 2 });
      const isTotal = (wsStats[cellA]?.v && String(wsStats[cellA].v).includes('(Total)')) || (wsStats[cellColor]?.v && String(wsStats[cellColor].v).includes('(Total)'));
      for (let c = 0; c < statsNumCols; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (wsStats[ref]) {
          if (isTotal) {
            wsStats[ref].s = { fill: totalRowFill, font: totalFont, alignment: { horizontal: c >= 3 ? 'right' : 'left' } };
          } else {
            wsStats[ref].s = { alignment: { horizontal: c >= 3 ? 'right' : 'left' } };
          }
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, wsStats, 'Statistics');

    // By cut and size — size columns, Cut Number, Cut Date, Color, Total; total row after each job order / color
    const allSizeValues = new Set<string>();
    for (const cut of cutDetailsForBreakdown) {
      for (const s of cut.sizes ?? []) {
        if (s.size_value) allSizeValues.add(s.size_value);
      }
    }
    const sizeColumns = Array.from(allSizeValues).sort((a, b) => {
      const [aCat, aNum, aLabel] = getSizeSortKey(a);
      const [bCat, bNum, bLabel] = getSizeSortKey(b);
      if (aCat !== bCat) return (aCat as number) - (bCat as number);
      if (aNum !== bNum) return (aNum as number) - (bNum as number);
      return String(aLabel).localeCompare(String(bLabel));
    });

    const sheet2Rows: (string | number)[][] = [];
    const headerRow: (string | number)[] = [
      'Job Order Number',
      'Cut Number',
      'Cut Date',
      'Color',
      'Material',
      ...sizeColumns.map(String),
      'Total',
      'Consumption (m)',
      'Consumption (kg)',
    ];
    sheet2Rows.push(headerRow);

    // Group cuts by job order, then by color (preserve order)
    const jobOrderGroups = new Map<string, CutDetails[]>();
    for (const cut of cutDetailsForBreakdown) {
      const jo = cut.job_order_number ?? '-';
      let list = jobOrderGroups.get(jo);
      if (!list) {
        list = [];
        jobOrderGroups.set(jo, list);
      }
      list.push(cut);
    }
    const jobOrderOrder = Array.from(jobOrderGroups.keys());

    for (const jobOrderNumber of jobOrderOrder) {
      const cuts = jobOrderGroups.get(jobOrderNumber) ?? [];
      const byColor = new Map<string, CutDetails[]>();
      for (const cut of cuts) {
        const color = getCutColor(cut);
        let list = byColor.get(color);
        if (!list) {
          list = [];
          byColor.set(color, list);
        }
        list.push(cut);
      }
      const jobOrderSizeTotals: Record<string, number> = {};
      let jobOrderRowTotal = 0;
      let jobOrderConsumptionMSum = 0;
      let jobOrderConsumptionKgSum = 0;
      let jobOrderCutCount = 0;

      for (const [colorName, colorCuts] of Array.from(byColor.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        const colorSizeTotals: Record<string, number> = {};
        let colorRowTotal = 0;
        let colorConsumptionMSum = 0;
        let colorConsumptionKgSum = 0;
        let colorCutCount = 0;

        for (const cut of colorCuts) {
          const totalPieces =
            cut.sizes?.reduce((sum, s) => sum + (s.total_pieces ?? 0), 0) ?? 0;
          const consumptionMNum =
            totalPieces > 0 && cut.marker_length != null && cut.total_layers != null
              ? (cut.marker_length * cut.total_layers) / totalPieces
              : 0;
          const consumptionKgNum =
            totalPieces > 0 && cut.cut_weight != null
              ? cut.cut_weight / totalPieces
              : 0;
          const consumptionM =
            consumptionMNum > 0 ? consumptionMNum.toFixed(3) : '-';
          const consumptionKg =
            consumptionKgNum > 0 ? consumptionKgNum.toFixed(3) : '-';
          colorConsumptionMSum += consumptionMNum;
          colorConsumptionKgSum += consumptionKgNum;
          colorCutCount += 1;

          const dateStr = cut.created_at
            ? new Date(cut.created_at).toLocaleDateString()
            : '-';
          const sizeValues: Record<string, number> = {};
          for (const s of cut.sizes ?? []) {
            const sv = s.size_value ?? '-';
            sizeValues[sv] = (sizeValues[sv] ?? 0) + (s.total_pieces ?? 0);
          }
          const rowTotal = sizeColumns.reduce(
            (sum, col) => sum + (sizeValues[col] ?? 0),
            0
          );
          for (const col of sizeColumns) {
            colorSizeTotals[col] = (colorSizeTotals[col] ?? 0) + (sizeValues[col] ?? 0);
            jobOrderSizeTotals[col] = (jobOrderSizeTotals[col] ?? 0) + (sizeValues[col] ?? 0);
          }
          colorRowTotal += rowTotal;
          jobOrderRowTotal += rowTotal;
          jobOrderConsumptionMSum += consumptionMNum;
          jobOrderConsumptionKgSum += consumptionKgNum;
          jobOrderCutCount += 1;

          const row: (string | number)[] = [
            jobOrderNumber,
            String(cut.cut_id),
            dateStr,
            getCutColor(cut),
            cut.material_name ?? '—',
            ...sizeColumns.map((col) => sizeValues[col] ?? ''),
            rowTotal || '',
            consumptionM,
            consumptionKg,
          ];
          sheet2Rows.push(row);
        }

        const avgMColor = colorCutCount > 0 ? (colorConsumptionMSum / colorCutCount).toFixed(3) : '-';
        const avgKgColor = colorCutCount > 0 ? (colorConsumptionKgSum / colorCutCount).toFixed(3) : '-';
        sheet2Rows.push([
          jobOrderNumber,
          'Total',
          '',
          colorName,
          '',
          ...sizeColumns.map((col) => colorSizeTotals[col] ?? 0),
          colorRowTotal,
          avgMColor,
          avgKgColor,
        ]);
      }

      const avgConsumptionM =
        jobOrderCutCount > 0
          ? (jobOrderConsumptionMSum / jobOrderCutCount).toFixed(3)
          : '-';
      const avgConsumptionKg =
        jobOrderCutCount > 0
          ? (jobOrderConsumptionKgSum / jobOrderCutCount).toFixed(3)
          : '-';

      sheet2Rows.push([
        jobOrderNumber,
        'Total',
        '',
        '',
        '',
        ...sizeColumns.map((col) => jobOrderSizeTotals[col] ?? 0),
        jobOrderRowTotal,
        avgConsumptionM,
        avgConsumptionKg,
      ]);
    }

    const ws2 = XLSX.utils.aoa_to_sheet(sheet2Rows);
    ws2['!cols'] = [
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 14 },
      { wch: 22 },
      ...sizeColumns.map(() => ({ wch: 10 })),
      { wch: 10 },
      { wch: 16 },
      { wch: 16 },
    ];
    const numCols = 5 + sizeColumns.length + 3; // Job Order, Cut #, Date, Color, Material, sizes..., Total, Cons m, Cons kg
    for (let c = 0; c < numCols; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      const val = headerRow[c];
      if (val !== undefined && val !== null) {
        if (!ws2[ref]) ws2[ref] = { t: 's', v: '' };
        ws2[ref].v = val;
        ws2[ref].t = typeof val === 'number' ? 'n' : 's';
      }
      if (ws2[ref]) {
        ws2[ref].s = { fill: tableHeaderFill, font: { bold: true, color: { rgb: 'FFFFFFFF' } }, alignment: { horizontal: 'center' } };
      }
    }
    // Highlight total rows (color total and job order total)
    for (let r = 1; r < sheet2Rows.length; r++) {
      const cutNumberCell = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws2[cutNumberCell]?.v === 'Total') {
        for (let c = 0; c < numCols; c++) {
          const ref = XLSX.utils.encode_cell({ r, c });
          if (ws2[ref]) {
            ws2[ref].s = {
              fill: totalRowFill,
              font: totalFont,
              alignment: { horizontal: c >= 5 ? 'right' : 'left' },
            };
          }
        }
      }
    }
    ws2['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet2Rows.length - 1, c: numCols - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws2, 'By Cut and Size');

    const from = fromDate || 'from';
    const to = toDate || 'to';
    XLSX.writeFile(wb, `cutting-tracking-${from}_${to}.xlsx`);
  }, [cutRows, cutDetailsForBreakdown, fromDate, toDate, jobOrderClientByNumber]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Cutting Queries</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
            <div className="space-y-1">
              <label htmlFor="cut-client" className="text-xs font-medium text-gray-600">
                Client
              </label>
              <SearchableDropdown
                value={clientSearch}
                onChange={setClientSearch}
                options={clientOptions}
                placeholder="Select or type client..."
                label=""
                className="h-9 w-full"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cut-model" className="text-xs font-medium text-gray-600">
                Model
              </label>
              <SearchableDropdown
                value={modelSearch}
                onChange={setModelSearch}
                options={modelOptions}
                placeholder="Select or type model..."
                label=""
                className="h-9 w-full"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cut-job-order" className="text-xs font-medium text-gray-600">
                Job Order Number
              </label>
              <SearchableDropdown
                value={jobOrderSearch}
                onChange={setJobOrderSearch}
                options={jobOrderOptions}
                placeholder="Select or type job order..."
                label=""
                className="h-9 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 items-end">
            <div className="space-y-1">
              <label htmlFor="cut-from-date" className="text-xs font-medium text-gray-600">
                From Date
              </label>
              <Input
                id="cut-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                disabled={allDates}
                className="min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="cut-to-date" className="text-xs font-medium text-gray-600">
                To Date
              </label>
              <Input
                id="cut-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                disabled={allDates}
                className="min-w-0 max-w-full overflow-hidden whitespace-nowrap text-ellipsis appearance-none"
              />
            </div>
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center md:gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <Switch
                  checked={allDates}
                  onCheckedChange={(checked) => setAllDates(Boolean(checked))}
                />
                <span>All dates</span>
              </div>
              <Button
                className="px-6 w-full md:flex-1"
                onClick={handleSearchCuts}
                disabled={loadingCuts}
              >
                {loadingCuts ? 'Searching...' : 'Search'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 text-xs text-gray-600 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <span>Show breakdown</span>
            <Switch
              checked={showBreakdown}
              onCheckedChange={(checked) => setShowBreakdown(Boolean(checked))}
            />
            <Button
              variant="outline"
              size="sm"
              className="inline-flex w-full sm:w-auto justify-center items-center gap-1.5"
              onClick={downloadExcel}
              disabled={cutRows.length === 0}
            >
              <Download className="h-4 w-4" />
              Download as Excel
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 text-gray-700">
            <div className="text-center min-w-[80px]">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">
                Cuts
              </div>
              <div className="text-base font-semibold">
                {cutsSummary.count.toLocaleString()}
              </div>
            </div>
            <div className="text-center min-w-[80px]">
              <div className="text-[11px] uppercase tracking-wide text-gray-500">
                Total quantity
              </div>
              <div className="text-base font-semibold">
                {cutsSummary.totalQuantity.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {showBreakdown ? (
          <div className="space-y-6">
            {jobOrderGroups.length === 0 && !loadingCuts && (
              <div className="rounded-md border border-gray-200 py-8 text-center text-sm text-gray-500">
                No results found for the selected filters.
              </div>
            )}
            {jobOrderGroups.map((group) => {
              const { clientName, jobOrderNumber, sizeLabels, cuts } = group;
              const colSpan = 3 + sizeLabels.length + 3;
              const rows: JSX.Element[] = [];

              let lastColor: string | null = null;
              let colorTotals: number[] = new Array(sizeLabels.length).fill(0);
              let colorGrandTotal = 0;
              const jobOrderTotals: number[] = new Array(sizeLabels.length).fill(0);
              let jobOrderGrandTotal = 0;

              let colorConsumptionMNum = 0;
              let colorConsumptionMDen = 0;
              let colorConsumptionKgNum = 0;
              let colorConsumptionKgDen = 0;

              let jobOrderConsumptionMNum = 0;
              let jobOrderConsumptionMDen = 0;
              let jobOrderConsumptionKgNum = 0;
              let jobOrderConsumptionKgDen = 0;

              const pushColorTotalRow = () => {
                if (
                  lastColor &&
                  sizeLabels.length > 0 &&
                  colorTotals.length === sizeLabels.length
                ) {
                  rows.push(
                    <TableRow
                      key={`color-total-${jobOrderNumber}-${lastColor}`}
                      className="bg-blue-50/70 text-[11px] font-semibold text-blue-900"
                    >
                      <TableCell className="pl-6">
                        Color Total: {lastColor}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      {colorTotals.map((val, idx) => (
                        <TableCell
                          key={`color-total-${jobOrderNumber}-${lastColor}-${sizeLabels[idx]}`}
                          className="text-right"
                        >
                          {val || ''}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">
                        {colorGrandTotal}
                      </TableCell>
                      <TableCell className="text-right">
                        {colorConsumptionMDen > 0
                          ? (colorConsumptionMNum / colorConsumptionMDen).toFixed(3)
                          : ''}
                      </TableCell>
                      <TableCell className="text-right">
                        {colorConsumptionKgDen > 0
                          ? (colorConsumptionKgNum / colorConsumptionKgDen).toFixed(3)
                          : ''}
                      </TableCell>
                    </TableRow>
                  );
                }
              };

              for (const cut of cuts) {
                const colorName = cut.color_name || 'Unknown color';

                if (colorName !== lastColor) {
                  pushColorTotalRow();

                  rows.push(
                    <TableRow
                      key={`color-${jobOrderNumber}-${colorName}-${cut.cut_id}`}
                    >
                      <TableCell
                        colSpan={colSpan}
                        className="bg-white text-left text-[11px] font-medium text-gray-600 pl-4"
                      >
                        Color: {colorName}
                      </TableCell>
                    </TableRow>
                  );
                  lastColor = colorName;
                  colorTotals = new Array(sizeLabels.length).fill(0);
                  colorGrandTotal = 0;
                  colorConsumptionMNum = 0;
                  colorConsumptionMDen = 0;
                  colorConsumptionKgNum = 0;
                  colorConsumptionKgDen = 0;
                }

                const perSize = sizeLabels.map((label, idx) => {
                  const match = cut.sizes?.find((s) => s.size_value === label);
                  const val = match?.total_pieces ?? 0;
                  jobOrderTotals[idx] += val;
                  colorTotals[idx] += val;
                  return val;
                });

                const rowTotal = perSize.reduce((sum, value) => sum + value, 0);
                jobOrderGrandTotal += rowTotal;
                colorGrandTotal += rowTotal;

                const totalPieces =
                  cut.sizes?.reduce(
                    (sum, size) => sum + (size.total_pieces ?? 0),
                    0
                  ) ?? 0;

                let consumptionM: string | number = '-';
                let consumptionKg: string | number = '-';

                if (
                  totalPieces > 0 &&
                  cut.marker_length != null &&
                  cut.total_layers != null
                ) {
                  const num = cut.marker_length * cut.total_layers;
                  consumptionM = (num / totalPieces).toFixed(3);
                  colorConsumptionMNum += num;
                  colorConsumptionMDen += totalPieces;
                  jobOrderConsumptionMNum += num;
                  jobOrderConsumptionMDen += totalPieces;
                }

                if (totalPieces > 0 && cut.cut_weight != null) {
                  const numKg = cut.cut_weight;
                  consumptionKg = (numKg / totalPieces).toFixed(3);
                  colorConsumptionKgNum += numKg;
                  colorConsumptionKgDen += totalPieces;
                  jobOrderConsumptionKgNum += numKg;
                  jobOrderConsumptionKgDen += totalPieces;
                }

                rows.push(
                  <TableRow key={`cut-${cut.cut_id}`}>
                    <TableCell>{String(cut.cut_id)}</TableCell>
                    <TableCell>{cut.material_name ?? '—'}</TableCell>
                    <TableCell>
                      {cut.created_at
                        ? new Date(cut.created_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    {perSize.map((value, idx) => (
                      <TableCell
                        key={`${cut.cut_id}-${sizeLabels[idx]}`}
                        className="text-right"
                      >
                        {value || ''}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      {rowTotal}
                    </TableCell>
                    <TableCell className="text-right">{consumptionM}</TableCell>
                    <TableCell className="text-right">{consumptionKg}</TableCell>
                  </TableRow>
                );
              }

              pushColorTotalRow();

              if (
                sizeLabels.length > 0 &&
                jobOrderTotals.length === sizeLabels.length
              ) {
                rows.push(
                  <TableRow
                    key={`total-${jobOrderNumber}`}
                    className="bg-emerald-50/80 font-semibold text-emerald-900"
                  >
                    <TableCell>Total</TableCell>
                    <TableCell />
                    <TableCell />
                    {jobOrderTotals.map((val, idx) => (
                      <TableCell
                        key={`total-${jobOrderNumber}-${sizeLabels[idx]}`}
                        className="text-right"
                      >
                        {val || ''}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      {jobOrderGrandTotal}
                    </TableCell>
                    <TableCell className="text-right">
                      {jobOrderConsumptionMDen > 0
                        ? (
                            jobOrderConsumptionMNum / jobOrderConsumptionMDen
                          ).toFixed(3)
                        : ''}
                    </TableCell>
                    <TableCell className="text-right">
                      {jobOrderConsumptionKgDen > 0
                        ? (
                            jobOrderConsumptionKgNum / jobOrderConsumptionKgDen
                          ).toFixed(3)
                        : ''}
                    </TableCell>
                  </TableRow>
                );
              }

              return (
                <div
                  key={`${clientName}-${jobOrderNumber}`}
                  className="space-y-2"
                >
                  <div className="inline-flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">
                    <span>Client: {clientName}</span>
                    <span className="text-blue-300">—</span>
                    <span>Job Order: {jobOrderNumber}</span>
                  </div>
                  <div className="rounded-md border border-gray-200 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cut Number</TableHead>
                          <TableHead>Material</TableHead>
                          <TableHead>Cut Date</TableHead>
                          {sizeLabels.map((label) => (
                            <TableHead key={label} className="text-right">
                              {label}
                            </TableHead>
                          ))}
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">
                            Consumption (m)
                          </TableHead>
                          <TableHead className="text-right">
                            Consumption (kg)
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>{rows}</TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-md border border-gray-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cut Number</TableHead>
                  <TableHead>Job Order</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead>Cut Date</TableHead>
                  <TableHead className="text-right">Cut Quantity</TableHead>
                  <TableHead className="text-center">Printing</TableHead>
                  <TableHead className="text-right">Consumption (m)</TableHead>
                  <TableHead className="text-right">Consumption (kg)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cutRows.length === 0 && !loadingCuts && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-8 text-center text-sm text-gray-500"
                    >
                      No results found for the selected filters.
                    </TableCell>
                  </TableRow>
                )}
                {cutRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.cutNumber}</TableCell>
                    <TableCell>{row.jobOrderNumber}</TableCell>
                    <TableCell>{row.materialName}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-center">{row.printing}</TableCell>
                    <TableCell className="text-right">{row.consumptionM}</TableCell>
                    <TableCell className="text-right">{row.consumptionKg}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="inline-flex items-center gap-1"
                        onClick={() => navigate(`/cutting/${row.id}`)}
                      >
                        <Eye className="h-4 w-4" />
                        <span>Details</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CuttingSubTab;
