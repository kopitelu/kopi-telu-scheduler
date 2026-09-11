import { watchCollection } from "./firestore-service.js";

const LOOKBACK_WEEKS = 6; // sama dengan yang dipakai Auto Scheduler di schedule.js

const LEAVE_TYPE_TO_CODE = {
  off_request: "OFF",
  cuti: "CUTI",
  izin: "IZIN",
  sakit: "SAKIT",
  unavailable: "UNAVAILABLE",
};

const DAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Ming"];

let employees = [];
let allShifts = [];
let leaves = [];

const tableWrapper = document.getElementById("fairnessTableWrapper");
const lookbackInfo = document.getElementById("lookbackInfo");

// ---------- Date helpers (sama seperti di schedule.js) ----------
function getMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
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
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

function leaveOverride(employeeId, dateStr) {
  const match = leaves.find((l) => l.employeeId === employeeId && l.startDate <= dateStr && dateStr <= l.endDate);
  return match ? LEAVE_TYPE_TO_CODE[match.type] || "UNAVAILABLE" : null;
}

function anyOutletEffectiveType(employeeId, dateStr) {
  const override = leaveOverride(employeeId, dateStr);
  if (override) return override;
  const shiftsOnDate = allShifts.filter(
    (s) => s.employeeId === employeeId && s.date === dateStr && s.shiftType !== "OFF"
  );
  if (shiftsOnDate.length === 0) return "OFF";
  return shiftsOnDate[0].shiftType;
}

function computeStats(employeeId) {
  const thisMonday = getMonday(new Date());
  const lastMonday = addDays(thisMonday, -7);
  const rangeStart = addDays(thisMonday, -7 * LOOKBACK_WEEKS);
  const rangeEndExclusive = addDays(thisMonday, 7);

  let thisWeekOff = 0;
  let lastWeekOff = 0;
  const offByDay = [0, 0, 0, 0, 0, 0, 0]; // index 0=Sen ... 6=Ming
  let weekendOff = 0;
  let pagi = 0;
  let siang = 0;

  for (let d = new Date(rangeStart); d < rangeEndExclusive; d = addDays(d, 1)) {
    const dateStr = toISODate(d);
    const type = anyOutletEffectiveType(employeeId, dateStr);
    const jsDay = d.getDay(); // 0 = Minggu ... 6 = Sabtu
    const mondayFirstIndex = (jsDay + 6) % 7; // 0 = Senin ... 6 = Minggu
    const isWeekend = jsDay === 0 || jsDay === 6;

    if (type === "PAGI") pagi++;
    else if (type === "SIANG") siang++;
    else if (type === "OFF") {
      offByDay[mondayFirstIndex]++;
      if (isWeekend) weekendOff++;
      if (d >= thisMonday) thisWeekOff++;
      else if (d >= lastMonday && d < thisMonday) lastWeekOff++;
    }
  }

  return { thisWeekOff, lastWeekOff, offByDay, weekendOff, pagi, siang };
}

function renderTable() {
  const activeEmployees = employees.filter((e) => e.status === "active");

  if (activeEmployees.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada pegawai aktif.</div>`;
    return;
  }

  const thisMonday = getMonday(new Date());
  const rangeStart = addDays(thisMonday, -7 * LOOKBACK_WEEKS);
  lookbackInfo.textContent = `Histori dihitung dari ${formatShort(rangeStart)} sampai akhir minggu ini (${LOOKBACK_WEEKS} minggu ke belakang).`;

  const rows = activeEmployees
    .map((emp) => {
      const s = computeStats(emp.id);
      const dayCells = s.offByDay.map((c) => `<td>${c}</td>`).join("");
      return `
        <tr>
          <td><strong>${emp.name}</strong></td>
          <td class="badge-num">${s.thisWeekOff}</td>
          <td class="badge-num">${s.lastWeekOff}</td>
          ${dayCells}
          <td class="badge-num">${s.weekendOff}</td>
          <td class="badge-num">${s.pagi}</td>
          <td class="badge-num">${s.siang}</td>
        </tr>`;
    })
    .join("");

  const dayHeaders = DAY_LABELS.map((l) => `<th>${l} OFF</th>`).join("");

  tableWrapper.innerHTML = `
    <table class="fairness-table">
      <thead>
        <tr>
          <th>Pegawai</th>
          <th>This Week OFF</th>
          <th>Last Week OFF</th>
          ${dayHeaders}
          <th>Weekend OFF</th>
          <th>Pagi Count</th>
          <th>Siang Count</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

watchCollection("employees", (items) => {
  employees = items;
  renderTable();
}, "name");

watchCollection("schedule_shifts", (items) => {
  allShifts = items;
  renderTable();
});

watchCollection("employee_leave", (items) => {
  leaves = items;
  renderTable();
});
