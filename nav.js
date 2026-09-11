// ============================================================
// SIDEBAR NAVIGATION — dipakai di semua halaman
// Halaman yang belum dibangun (Phase 2+) ditampilkan disabled.
// ============================================================

const NAV_ITEMS = [
  { label: "Dashboard", href: "index.html", key: "dashboard", enabled: true },
  { label: "Schedule", href: "schedule.html", key: "schedule", enabled: true },
  { label: "Employees", href: "employees.html", key: "employees", enabled: true },
  { label: "Outlets", href: "outlets.html", key: "outlets", enabled: true },
  { label: "Shift Templates", href: "shift-templates.html", key: "shift-templates", enabled: true },
  { label: "Leave & Availability", href: "leave-availability.html", key: "leave", enabled: true },
  { label: "Workload", href: "#", key: "workload", enabled: false },
  { label: "Fairness", href: "fairness.html", key: "fairness", enabled: true },
  { label: "History", href: "#", key: "history", enabled: false },
  { label: "Settings", href: "#", key: "settings", enabled: false },
];

export function renderSidebar(activeKey) {
  const container = document.getElementById("sidebar");
  if (!container) return;

  const items = NAV_ITEMS.map((item) => {
    const activeClass = item.key === activeKey ? "nav-item active" : "nav-item";
    const disabledClass = item.enabled ? "" : " nav-item--disabled";
    const badge = item.enabled ? "" : '<span class="badge">Segera</span>';
    return `
      <a href="${item.href}" class="${activeClass}${disabledClass}">
        <span>${item.label}</span>
        ${badge}
      </a>`;
  }).join("");

  container.innerHTML = `
    <div class="sidebar-brand">
      <span class="brand-dot"></span>
      Kopi Telu Scheduler
    </div>
    <nav class="sidebar-nav">${items}</nav>
    <div class="sidebar-footer">Phase 1–7 — sampai Fairness</div>
  `;
}
