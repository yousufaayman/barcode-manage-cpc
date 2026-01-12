import sizeOrder from "../../../shared/size_order.json";

type SizeOrderJson = {
  precedence: string[];
  numeric_start: number;
  numeric_end: number;
};

const { precedence } = sizeOrder as SizeOrderJson;
const precedenceMap = new Map<string, number>(
  precedence.map((size, index) => [size.toUpperCase(), index])
);

export const getSizeSortKey = (value?: string | null) => {
  if (!value) {
    return [3, Number.POSITIVE_INFINITY, "" as const];
  }

  const normalized = value.trim().toUpperCase();

  if (precedenceMap.has(normalized)) {
    return [0, precedenceMap.get(normalized) ?? 0, normalized] as const;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return [1, parseFloat(normalized), normalized] as const;
  }

  return [2, Number.POSITIVE_INFINITY, normalized] as const;
};

export const sortSizes = <T extends { size_value?: string | null }>(items: T[]) =>
  [...items].sort((a, b) => {
    const aKey = getSizeSortKey(a.size_value ?? "");
    const bKey = getSizeSortKey(b.size_value ?? "");
    if (aKey[0] !== bKey[0]) return aKey[0] - bKey[0];
    if (aKey[1] !== bKey[1]) return aKey[1] - bKey[1];
    return aKey[2].localeCompare(bKey[2]);
  });



