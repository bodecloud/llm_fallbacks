import type { ChatPlugin } from "murm-ui";
import { openShellPanel } from "../../shell-panels";
import { getColumns, applyFilter, sortRows, type FilterState } from "./filters";
import type { CatalogEntry } from "../../providers/browser-router";

export function ModelExplorerPlugin(deps: {
  getCatalog: () => CatalogEntry[];
  getCatalogUrl: () => string;
}): ChatPlugin {
  return {
    name: "model-explorer",
    onMount() {
      window.registerShellPanel?.("explorer", (root) => {
        root.innerHTML = `
          <h3>Model Explorer</h3>
          <p class="panel-hint">Browse and filter <code>free_models.json</code>.</p>
          <label>Filter method
            <select id="explorer-method">
              <option value="value">value</option>
              <option value="regex">regex</option>
              <option value="topn">topn</option>
              <option value="categorical">categorical</option>
              <option value="null">null</option>
            </select>
          </label>
          <label>Column <select id="explorer-column"></select></label>
          <label>Value <input id="explorer-value" type="text" placeholder="filter value" /></label>
          <label>Top N <input id="explorer-topn" type="number" min="1" value="10" /></label>
          <button type="button" id="explorer-apply">Apply filter</button>
          <button type="button" id="explorer-reload">Reload catalog</button>
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
            .join("")}</tr>`;
          tbody.innerHTML = rows
            .slice(0, 200)
            .map(
              (row) =>
                `<tr>${cols
                  .map((c) => `<td>${escapeHtml(String((row as Record<string, unknown>)[c] ?? ""))}</td>`)
                  .join("")}</tr>`
            )
            .join("");
          statusEl.textContent = `${rows.length} model(s) shown${rows.length > 200 ? " (first 200)" : ""}`;
          thead.querySelectorAll("th").forEach((th) => {
            th.addEventListener("click", () => {
              const col = th.getAttribute("data-col")!;
              if (sortColumn === col) sortDir = sortDir === "asc" ? "desc" : "asc";
              else {
                sortColumn = col;
                sortDir = "desc";
              }
              renderTable(sortRows(rows, sortColumn, sortDir));
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
    onInputMount(ctx) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mur-toolbar-btn";
      btn.textContent = "Models";
      btn.title = "Open model explorer";
      btn.addEventListener("click", () => openShellPanel("explorer"));
      ctx.container.prepend(btn);
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
