import sizeOrder from "../../../shared/size_order.json";

type SizeOrderJson = {
  precedence: string[];
  numeric_start: number;
  numeric_end: number;
};

const { precedence, numeric_start, numeric_end } = sizeOrder as SizeOrderJson;

const precedenceMap = new Map<string, number>(
  precedence.map((size, index) => [size.toUpperCase(), index])
);

/** Full sort order: named sizes from JSON, then integer string sizes numeric_start…numeric_end. */
const unifiedSizeOrder: string[] = (() => {
  const nums: string[] = [];
  for (let n = numeric_start; n <= numeric_end; n++) {
    nums.push(String(n));
  }
  return [...precedence, ...nums];
})();

const findUnifiedIndex = (raw: string): number | null => {
  const s = raw.trim();
  if (!s) return null;
  const upper = s.toUpperCase();
  if (precedenceMap.has(upper)) {
    return precedenceMap.get(upper) ?? null;
  }
  if (/^\d+$/.test(s)) {
    const n = Number.parseInt(s, 10);
    if (n >= numeric_start && n <= numeric_end) {
      return precedence.length + (n - numeric_start);
    }
  }
  return null;
};

export type ExpandSizeRangeResult =
  | { ok: true; sizes: string[] }
  | { ok: false; reason: "unknown_endpoint" | "too_large"; unknownValue?: string; maxSpan?: number };

const DEFAULT_MAX_SPAN = 200;

/**
 * Inclusive range along unified order (precedence letters then numeric sizes per size_order.json).
 * Endpoints are case-insensitive for letter sizes; numeric endpoints must be whole numbers in range.
 */
export const expandSizeRange = (
  fromRaw: string,
  toRaw: string,
  maxSpan: number = DEFAULT_MAX_SPAN
): ExpandSizeRangeResult => {
  const i = findUnifiedIndex(fromRaw);
  if (i === null) {
    return { ok: false, reason: "unknown_endpoint", unknownValue: fromRaw.trim() };
  }
  const j = findUnifiedIndex(toRaw);
  if (j === null) {
    return { ok: false, reason: "unknown_endpoint", unknownValue: toRaw.trim() };
  }
  const lo = Math.min(i, j);
  const hi = Math.max(i, j);
  if (hi - lo > maxSpan) {
    return { ok: false, reason: "too_large", maxSpan };
  }
  return { ok: true, sizes: unifiedSizeOrder.slice(lo, hi + 1) };
};

export const getSizeOrderBounds = () => ({
  numeric_start,
  numeric_end,
  letterExamples: precedence.slice(0, 5).join(", ")
});

export const getSizeSortKey = (value?: string | null): [number, number, string] => {
  if (!value) {
    return [3, Number.POSITIVE_INFINITY, ""];
  }

  const normalized = value.trim().toUpperCase();

  if (precedenceMap.has(normalized)) {
    return [0, precedenceMap.get(normalized) ?? 0, normalized];
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return [1, Number.parseFloat(normalized), normalized];
  }

  return [2, Number.POSITIVE_INFINITY, normalized];
};

export const sortSizes = <T extends { size_value?: string | null; job_order_id?: number | null; item_id?: number | null }>(items: T[]) =>
  [...items].sort((a, b) => {
    const aKey = getSizeSortKey(a.size_value ?? "");
    const bKey = getSizeSortKey(b.size_value ?? "");
    if (aKey[0] !== bKey[0]) return aKey[0] - bKey[0];
    if (aKey[1] !== bKey[1]) return aKey[1] - bKey[1];
    // For custom/unknown sizes, prefer stable ordering by job order id when available.
    if (aKey[0] === 2 && bKey[0] === 2) {
      const aJobOrderId = typeof a.job_order_id === "number" ? a.job_order_id : Number.POSITIVE_INFINITY;
      const bJobOrderId = typeof b.job_order_id === "number" ? b.job_order_id : Number.POSITIVE_INFINITY;
      if (aJobOrderId !== bJobOrderId) return aJobOrderId - bJobOrderId;

      const aItemId = typeof a.item_id === "number" ? a.item_id : Number.POSITIVE_INFINITY;
      const bItemId = typeof b.item_id === "number" ? b.item_id : Number.POSITIVE_INFINITY;
      if (aItemId !== bItemId) return aItemId - bItemId;
    }
    return aKey[2].localeCompare(bKey[2]);
  });



