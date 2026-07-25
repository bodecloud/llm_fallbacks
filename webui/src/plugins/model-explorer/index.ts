import type { ChatPlugin } from "murm-ui";
import { getColumns, applyFilter, sortRows, type FilterState } from "./filters";
import type { CatalogEntry } from "../../providers/browser-router";
import { setActiveModel } from "../../model-selection";

export function ModelExplorerPlugin(deps: {
  getCatalog: () => CatalogEntry[];
  getCatalogUrl: () => string;
}): ChatPlugin {
  return {
    name: "model-explorer",
    onMount() {
      window.registerShellPanel?.("explorer", (root) => {
        root.innerHTML = `
          <header class="panel-header">
            <h3>Free models</h3>
          </header>
          <p class="panel-hint">Browse the daily-ranked free model list.</p>
          <label>Filter type
            <select id="explorer-method">
              <option value="value">match value</option>
              <option value="regex">pattern (regex)</option>
              <option value="topn">top N by score</option>
              <option value="categorical">category</option>
              <option value="null">empty field</option>
            </select>
          </label>
          <label>Column <select id="explorer-column"></select></label>
          <label>Search <input id="explorer-value" type="text" placeholder="what to match" /></label>
          <label>How many <input id="explorer-topn" type="number" min="1" value="10" /></label>
          <div class="panel-actions">
            <button type="button" id="explorer-apply" class="panel-btn panel-btn-primary">Apply filter</button>
            <button type="button" id="explorer-reload" class="panel-btn">Reload list</button>
          </div>
          <div id="explorer-status" class="panel-status"></div>
          <div class="explorer-table-wrap"><table id="explorer-table"><thead></thead><tbody></tbody></table></div>
        `;

        const methodEl = root.querySelector<HTMLSelectElement>("#explorer-method")!;
        const columnEl = root.querySelector<HTMLSelectElement>("#explorer-column")!;
        const valueEl = root.querySelector<HTMLInputElement>("#explorer-value")!;
        const topNEl = root.querySelector<HTMLInputElement>("#explorer-topn")!;
        const statusEl = root.querySelector<HTMLDivElement>("#explorer-status")!;
        const table = root.querySelector<HTMLTableElement>("#explorer-table")!;
        const thead = table.querySelector("thead")!;
        const tbody = table.querySelector("tbody")!;

        let catalog = deps.getCatalog();
        let sortColumn = "quality_score";
        let sortDir: "asc" | "desc" = "desc";

        function populateColumns() {
          columnEl.innerHTML = "";
          for (const col of getColumns(catalog)) {
            const opt = document.createElement("option");
            opt.value = col;
            opt.textContent = col;
            columnEl.appendChild(opt);
          }
        }

        function renderTable(rows: CatalogEntry[]) {
          const cols = ["id", "provider", "mode", "quality_score"].filter(
            (c) => rows.length === 0 || c in (rows[0] as object)
          );
          thead.innerHTML = `<tr>${cols
            .map(
              (c) =>
                `<th data-col="${c}" style="cursor:pointer">${c}${sortColumn === c ? (sortDir === "asc" ? " ▲" : " ▼") : ""}</th>`
            )
            .join("")}<th>Use</th></tr>`;
          tbody.innerHTML = rows
            .slice(0, 200)
            .map(
              (row, rowIdx) =>
                `<tr data-row-idx="${rowIdx}">${cols
                  .map((c) => `<td>${escapeHtml(String((row as Record<string, unknown>)[c] ?? ""))}</td>`)
                  .join("")}<td><button type="button" class="panel-btn lf-use-model-btn" data-model-id="${escapeHtml(String(row.id ?? ""))}">Use for chat</button></td></tr>`
            )
            .join("");
          statusEl.textContent = `${rows.length} model(s) shown${rows.length > 200 ? " (first 200)" : ""}`;
          thead.querySelectorAll("th").forEach((th) => {
            th.addEventListener("click", () => {
              const col = th.getAttribute("data-col");
              if (!col) return;
              if (sortColumn === col) sortDir = sortDir === "asc" ? "desc" : "asc";
              else {
                sortColumn = col;
                sortDir = "desc";
              }
              renderTable(sortRows(rows, sortColumn, sortDir));
            });
          });
          tbody.querySelectorAll<HTMLButtonElement>(".lf-use-model-btn").forEach((btn) => {
            btn.addEventListener("click", (ev) => {
              ev.stopPropagation();
              const modelId = btn.getAttribute("data-model-id");
              if (!modelId) return;
              setActiveModel(modelId);
              statusEl.textContent = `Model set to ${modelId} — use the composer picker to confirm.`;
            });
          });
        }

        function currentFilter(): FilterState {
          return {
            method: methodEl.value as FilterState["method"],
            column: columnEl.value,
            value: valueEl.value.trim(),
            topN: Number(topNEl.value) || 10,
          };
        }

        root.querySelector("#explorer-apply")?.addEventListener("click", () => {
          renderTable(applyFilter(catalog, currentFilter()));
        });

        root.querySelector("#explorer-reload")?.addEventListener("click", async () => {
          const url = deps.getCatalogUrl();
          if (!url) return;
          statusEl.textContent = "Loading…";
          try {
            const res = await fetch(url);
            catalog = (await res.json()) as CatalogEntry[];
            populateColumns();
            renderTable(catalog);
          } catch (err) {
            statusEl.textContent = `Load failed: ${err instanceof Error ? err.message : String(err)}`;
          }
        });

        populateColumns();
        renderTable(catalog);
      });
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
