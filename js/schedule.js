import { watchCollection, getItem, setItem } from "./firestore-service.js";

const LEAVE_TYPE_TO_CODE = {
  off_request: "OFF",
  cuti: "CUTI",
  izin: "IZIN",
  sakit: "SAKIT",
  unavailable: "UNAVAILABLE",
};

const DAY_DEFS = [
  { short: "Sen" },
  { short: "Sel" },
  { short: "Rab" },
  { short: "Kam" },
  { short: "Jum" },
  { short: "Sab" },
  { short: "Ming" },
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

const SHIFT_OPTIONS = ["OFF", "PAGI", "SIANG"];

let outlets = [];
let employees = [];
let allShifts = []; // seluruh isi collection schedule_shifts (difilter di client)
let leaves = []; // seluruh isi collection employee_leave (difilter di client)
let currentOutletId = null;
let currentWeekStart = getMonday(new Date());

const outletSelect = document.getElementById("outletSelect");
const weekLabel = document.getElementById("weekLabel");
const tableWrapper = document.getElementById("scheduleTableWrapper");
const statusPill = document.getElementById("statusPill");

// ---------- Date helpers ----------
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Minggu, 1 = Senin, ...
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatShort(date) {
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function weekDates(monday) {
  return DAY_DEFS.map((_, i) => addDays(monday, i));
}

function scheduleDocId(outletId, monday) {
  return `${outletId}_${toISODate(monday)}`;
}

function shiftDocId(outletId, monday, employeeId, dateStr) {
  return `${outletId}_${toISODate(monday)}_${employeeId}_${dateStr}`;
}

// ---------- Load outlets ----------
watchCollection("outlets", (items) => {
  outlets = items;
  const previouslySelected = currentOutletId;
  outletSelect.innerHTML = outlets.map((o) => `<option value="${o.id}">${o.name}</option>`).join("");
  if (outlets.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada outlet. Tambahkan outlet dulu di halaman Outlets.</div>`;
    return;
  }
  currentOutletId = previouslySelected && outlets.some((o) => o.id === previouslySelected)
    ? previouslySelected
    : outlets[0].id;
  outletSelect.value = currentOutletId;
  loadAndRender();
}, "name");

outletSelect.addEventListener("change", () => {
  currentOutletId = outletSelect.value;
  loadAndRender();
});

// ---------- Load employees ----------
watchCollection("employees", (items) => {
  employees = items.filter((e) => e.status === "active");
  renderTable();
}, "name");

// ---------- Load all schedule_shifts (filtered client-side per week/outlet) ----------
watchCollection("schedule_shifts", (items) => {
  allShifts = items;
  renderTable();
});

// ---------- Load all leave records (filtered client-side per employee/date) ----------
watchCollection("employee_leave", (items) => {
  leaves = items;
  renderTable();
});

// ---------- Week navigation ----------
document.getElementById("btnPrevWeek").addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, -7);
  loadAndRender();
});
document.getElementById("btnNextWeek").addEventListener("click", () => {
  currentWeekStart = addDays(currentWeekStart, 7);
  loadAndRender();
});
document.getElementById("btnThisWeek").addEventListener("click", () => {
  currentWeekStart = getMonday(new Date());
  loadAndRender();
});

function updateWeekLabel() {
  const dates = weekDates(currentWeekStart);
  const start = dates[0];
  const end = dates[6];
  weekLabel.textContent = `${formatShort(start)} – ${formatShort(end)} ${end.getFullYear()}`;
}

// ---------- Ensure parent `schedules` doc exists, then render ----------
async function loadAndRender() {
  if (!currentOutletId) return;
  updateWeekLabel();

  const id = scheduleDocId(currentOutletId, currentWeekStart);
  const existing = await getItem("schedules", id);
  if (!existing) {
    const dates = weekDates(currentWeekStart);
    await setItem("schedules", id, {
      outletId: currentOutletId,
      weekStartDate: toISODate(dates[0]),
      weekEndDate: toISODate(dates[6]),
      status: "draft",
    });
    statusPill.textContent = "DRAFT";
    statusPill.className = "pill pill-inactive";
  } else {
    statusPill.textContent = (existing.status || "draft").toUpperCase();
    statusPill.className = existing.status === "published" ? "pill pill-active" : "pill pill-inactive";
  }

  renderTable();
}

function employeesForOutlet(outletId) {
  return employees.filter(
    (e) => e.primaryOutletId === outletId || (e.allowedOutletIds || []).includes(outletId)
  );
}

function shiftEntry(employeeId, dateStr) {
  const match = allShifts.find(
    (s) => s.outletId === currentOutletId && s.employeeId === employeeId && s.date === dateStr
  );
  return {
    shiftType: match ? match.shiftType : "OFF",
    isLocked: match ? !!match.isLocked : false,
  };
}

function leaveOverride(employeeId, dateStr) {
  const match = leaves.find(
    (l) => l.employeeId === employeeId && l.startDate <= dateStr && dateStr <= l.endDate
  );
  return match ? LEAVE_TYPE_TO_CODE[match.type] || "UNAVAILABLE" : null;
}

function renderTable() {
  if (!currentOutletId) return;

  const dates = weekDates(currentWeekStart);
  const eligibleEmployees = employeesForOutlet(currentOutletId);

  if (eligibleEmployees.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada pegawai yang terdaftar untuk outlet ini. Cek halaman Employees — pastikan Outlet Utama atau Outlet Lain sudah diisi.</div>`;
    return;
  }

  const headerCells = dates
    .map(
      (d, i) => `
      <th>
        <div class="day-header-name">${DAY_DEFS[i].short}</div>
        <div class="day-header-date">${formatShort(d)}</div>
      </th>`
    )
    .join("");

  const rows = eligibleEmployees
    .map((emp) => {
      const cells = dates
        .map((d) => {
          const dateStr = toISODate(d);
          const override = leaveOverride(emp.id, dateStr);

          if (override) {
            const pillClass = override.toLowerCase() === "off" ? "off_request" : override.toLowerCase();
            return `
              <td>
                <span class="pill pill-${pillClass}" title="Dari data Leave & Availability">${override}</span>
              </td>`;
          }

          const { shiftType: value, isLocked } = shiftEntry(emp.id, dateStr);
          const options = SHIFT_OPTIONS.map(
            (opt) => `<option value="${opt}" ${opt === value ? "selected" : ""}>${opt}</option>`
          ).join("");

          return `
            <td>
              <div class="shift-cell">
                <select class="shift-select val-${value}" data-employee="${emp.id}" data-date="${dateStr}" ${isLocked ? "disabled" : ""}>
                  ${options}
                </select>
                <button type="button" class="lock-btn" data-employee="${emp.id}" data-date="${dateStr}" data-locked="${isLocked}"
                  title="${isLocked ? "Terkunci — klik untuk buka" : "Klik untuk kunci shift ini"}">
                  ${isLocked ? "🔒" : "🔓"}
                </button>
              </div>
            </td>`;
        })
        .join("");

      return `
        <tr>
          <td><strong>${emp.name}</strong></td>
          ${cells}
        </tr>`;
    })
    .join("");

  tableWrapper.innerHTML = `
    <table class="schedule-grid">
      <thead>
        <tr>
          <th>Pegawai</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrapper.querySelectorAll(".shift-select").forEach((select) => {
    select.addEventListener("change", async (ev) => {
      const el = ev.target;
      const employeeId = el.dataset.employee;
      const dateStr = el.dataset.date;
      const shiftType = el.value;

      el.className = `shift-select val-${shiftType}`;

      const id = shiftDocId(currentOutletId, currentWeekStart, employeeId, dateStr);
      try {
        await setItem("schedule_shifts", id, {
          scheduleId: scheduleDocId(currentOutletId, currentWeekStart),
          outletId: currentOutletId,
          employeeId,
          date: dateStr,
          shiftType,
          source: "manual",
        });
      } catch (err) {
        console.error(err);
        alert("Gagal menyimpan perubahan shift. Cek console untuk detail.");
      }
    });
  });

  tableWrapper.querySelectorAll(".lock-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const employeeId = btn.dataset.employee;
      const dateStr = btn.dataset.date;
      const currentlyLocked = btn.dataset.locked === "true";
      const { shiftType } = shiftEntry(employeeId, dateStr);

      const id = shiftDocId(currentOutletId, currentWeekStart, employeeId, dateStr);
      try {
        await setItem("schedule_shifts", id, {
          scheduleId: scheduleDocId(currentOutletId, currentWeekStart),
          outletId: currentOutletId,
          employeeId,
          date: dateStr,
          shiftType,
          isLocked: !currentlyLocked,
          source: "manual",
        });
      } catch (err) {
        console.error(err);
        alert("Gagal mengubah status lock. Cek console untuk detail.");
      }
    });
  });
}
