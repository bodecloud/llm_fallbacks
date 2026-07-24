import type { CatalogEntry } from "../../providers/browser-router";

export type FilterMethod = "value" | "regex" | "topn" | "categorical" | "null";

export interface FilterState {
  method: FilterMethod;
  column: string;
  value: string;
  topN: number;
}

export function getColumns(catalog: CatalogEntry[]): string[] {
  if (!catalog.length) return [];
  return Object.keys(catalog[0] as Record<string, unknown>);
}

export function applyFilter(catalog: CatalogEntry[], filter: FilterState): CatalogEntry[] {
  const { method, column, value, topN } = filter;
  let rows = [...catalog];

  switch (method) {
    case "value":
      if (value) {
        rows = rows.filter((row) => String((row as Record<string, unknown>)[column] ?? "") === value);
      }
      break;
    case "regex":
      if (value) {
        const re = new RegExp(value, "i");
        rows = rows.filter((row) => re.test(String((row as Record<string, unknown>)[column] ?? "")));
      }
      break;
    case "categorical":
      if (value) {
        rows = rows.filter(
          (row) => String((row as Record<string, unknown>)[column] ?? "").toLowerCase() === value.toLowerCase()
        );
      }
      break;
    case "null":
      rows = rows.filter((row) => {
        const v = (row as Record<string, unknown>)[column];
        return v === null || v === undefined || v === "";
      });
      break;
    case "topn":
      rows = rows
        .slice()
        .sort((a, b) => {
          const av = Number((a as Record<string, unknown>)[column]) || 0;
          const bv = Number((b as Record<string, unknown>)[column]) || 0;
          return bv - av;
        })
        .slice(0, Math.max(1, topN || 10));
      break;
  }

  return rows;
}

export function sortRows(
  catalog: CatalogEntry[],
  column: string,
  direction: "asc" | "desc"
): CatalogEntry[] {
  return catalog.slice().sort((a, b) => {
    const av = (a as Record<string, unknown>)[column];
    const bv = (b as Record<string, unknown>)[column];
    if (av === bv) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
    return direction === "asc" ? cmp : -cmp;
  });
}
