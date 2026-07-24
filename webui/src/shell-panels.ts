type PanelInit = (root: HTMLElement) => void;

const panels = new Map<string, PanelInit>();

export function registerShellPanel(id: string, init: PanelInit): void {
  panels.set(id, init);
  const el = document.getElementById(`panel-${id}`);
  if (el) init(el);
}

export function initShellPanels(): void {
  window.registerShellPanel = registerShellPanel;
  for (const [id, init] of panels) {
    const el = document.getElementById(`panel-${id}`);
    if (el) init(el);
  }
}

export function openShellPanel(id: string): void {
  document.querySelectorAll(".shell-panel").forEach((p) => p.classList.remove("open"));
  const panel = document.getElementById(`shell-panel-${id}`);
  const mask = document.getElementById("sysMask");
  if (panel) panel.classList.add("open");
  if (mask) {
    mask.hidden = false;
  }
  const closeBtn = document.getElementById("closeSet");
  if (closeBtn) closeBtn.style.display = "block";
}

export function closeShellPanel(_id?: string): void {
  document.querySelectorAll(".shell-panel").forEach((p) => p.classList.remove("open"));
  const mask = document.getElementById("sysMask");
  if (mask) mask.hidden = true;
  const closeBtn = document.getElementById("closeSet");
  if (closeBtn) closeBtn.style.display = "none";
}

export function bindTopBarButtons(): void {
  document.getElementById("sysSetting")?.addEventListener("click", () => openShellPanel("failover"));
  document.getElementById("byokSetting")?.addEventListener("click", () => openShellPanel("byok"));
  document.getElementById("explorerSetting")?.addEventListener("click", () => openShellPanel("explorer"));
  document.getElementById("closeSet")?.addEventListener("click", () => closeShellPanel());
  document.getElementById("sysMask")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeShellPanel();
  });
}
