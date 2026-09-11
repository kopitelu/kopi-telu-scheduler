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
let shiftTemplates = []; // dipakai untuk tahu jam mulai PAGI (availability "after jam X")
let availability = []; // employee_availability, difilter per pegawai/hari di client

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
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

// ---------- Load shift templates (dipakai generator utk tahu jam mulai PAGI) ----------
watchCollection("shift_templates", (items) => {
  shiftTemplates = items;
});

// ---------- Load availability (dipakai generator, bukan buat ditampilkan di sini) ----------
watchCollection("employee_availability", (items) => {
  availability = items;
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

  const checkPanel = document.getElementById("checkResultsPanel");
  checkPanel.style.display = "none";
  document.getElementById("btnMarkReady").style.display = "none";
  const genPanel = document.getElementById("generatePreviewPanel");
  genPanel.style.display = "none";
  genPanel.innerHTML = "";
  const autoFixPanel = document.getElementById("autoFixPreviewPanel");
  autoFixPanel.style.display = "none";
  autoFixPanel.innerHTML = "";

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

// Status kerja seseorang pada tanggal tsb, LINTAS OUTLET (dipakai untuk
// cek jumping shift, hari kerja, dan hari libur — karena constraint ini
// berlaku ke pegawainya, bukan cuma di outlet yang sedang dilihat).
function anyOutletEffectiveType(employeeId, dateStr) {
  const override = leaveOverride(employeeId, dateStr);
  if (override) return override;
  const shiftsOnDate = allShifts.filter(
    (s) => s.employeeId === employeeId && s.date === dateStr && s.shiftType !== "OFF"
  );
  if (shiftsOnDate.length === 0) return "OFF";
  return shiftsOnDate[0].shiftType;
}

const MAX_CONSECUTIVE_DEFAULT = 6; // default sementara, akan jadi setting di Phase 8

function runConflictChecker() {
  const dates = weekDates(currentWeekStart);
  const eligibleEmployees = employeesForOutlet(currentOutletId);
  const outlet = outlets.find((o) => o.id === currentOutletId);
  const results = [];

  // ---- 1. Staffing per hari (untuk outlet yang sedang dilihat) ----
  dates.forEach((d) => {
    const dateStr = toISODate(d);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const staffing = (isWeekend ? outlet?.staffingWeekend : outlet?.staffingWeekday) || {};

    let pagiCount = 0;
    let siangCount = 0;
    eligibleEmployees.forEach((emp) => {
      const override = leaveOverride(emp.id, dateStr);
      const { shiftType } = shiftEntry(emp.id, dateStr);
      const effective = override || shiftType;
      if (effective === "PAGI") pagiCount++;
      if (effective === "SIANG") siangCount++;

      // Leave tapi masih ada shift kerja tersimpan (data lama sebelum leave diinput)
      if (override && (shiftType === "PAGI" || shiftType === "SIANG")) {
        results.push({
          severity: "CRITICAL",
          message: `${emp.name} sedang ${override} tapi masih ada data shift ${shiftType} tanggal ${formatShort(d)} (buka dropdown-nya lagi setelah leave dihapus untuk membersihkan).`,
        });
      }
    });

    if (staffing.minPagi != null && pagiCount < staffing.minPagi) {
      results.push({
        severity: "CRITICAL",
        message: `${formatShort(d)}: Shift PAGI understaffed (${pagiCount}/${staffing.minPagi} minimum).`,
      });
    }
    if (staffing.minSiang != null && siangCount < staffing.minSiang) {
      results.push({
        severity: "CRITICAL",
        message: `${formatShort(d)}: Shift SIANG understaffed (${siangCount}/${staffing.minSiang} minimum).`,
      });
    }
  });

  // ---- 2. Double-booking lintas outlet (semua pegawai aktif, bukan cuma yg eligible di outlet ini) ----
  dates.forEach((d) => {
    const dateStr = toISODate(d);
    employees.forEach((emp) => {
      const shiftsOnDate = allShifts.filter(
        (s) => s.employeeId === emp.id && s.date === dateStr && s.shiftType !== "OFF"
      );
      const distinctOutlets = new Set(shiftsOnDate.map((s) => s.outletId));
      if (distinctOutlets.size > 1) {
        results.push({
          severity: "CRITICAL",
          message: `${emp.name} terjadwal di lebih dari satu outlet pada ${formatShort(d)}.`,
        });
      }
    });
  });

  // ---- 3. Jumping shift + rekap mingguan per pegawai (lintas outlet) ----
  const dayBeforeWeek = addDays(currentWeekStart, -1);
  employees.forEach((emp) => {
    let workingDays = 0;
    let offDays = 0;
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    // cek jumping mulai dari 1 hari sebelum minggu ini, supaya nyambung dgn minggu lalu
    let prevType = anyOutletEffectiveType(emp.id, toISODate(dayBeforeWeek));

    dates.forEach((d) => {
      const dateStr = toISODate(d);
      const effective = anyOutletEffectiveType(emp.id, dateStr);

      if (prevType === "SIANG" && effective === "PAGI") {
        results.push({
          severity: "CRITICAL",
          message: `${emp.name}: jumping shift terdeteksi — SIANG lalu PAGI keesokan harinya (${formatShort(d)}).`,
        });
      }

      if (effective === "PAGI" || effective === "SIANG") {
        workingDays++;
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
        if (effective === "OFF") offDays++;
      }

      prevType = effective;
    });

    if (emp.maxDaysPerWeek && workingDays > emp.maxDaysPerWeek) {
      results.push({
        severity: "WARNING",
        message: `${emp.name}: bekerja ${workingDays} hari minggu ini, melebihi maksimal ${emp.maxDaysPerWeek} hari/minggu.`,
      });
    }
    if (emp.minDaysOffPerWeek && offDays < emp.minDaysOffPerWeek) {
      results.push({
        severity: "WARNING",
        message: `${emp.name}: hanya dapat ${offDays} hari OFF minggu ini, di bawah minimum ${emp.minDaysOffPerWeek} hari/minggu.`,
      });
    }
    if (maxConsecutive > MAX_CONSECUTIVE_DEFAULT) {
      results.push({
        severity: "WARNING",
        message: `${emp.name}: bekerja ${maxConsecutive} hari berturut-turut (default maksimal ${MAX_CONSECUTIVE_DEFAULT} hari — bisa diatur di Settings nanti).`,
      });
    }
  });

  return results;
}

function renderCheckResults(results) {
  const panel = document.getElementById("checkResultsPanel");
  const criticalCount = results.filter((r) => r.severity === "CRITICAL").length;
  const warningCount = results.filter((r) => r.severity === "WARNING").length;

  panel.style.display = "block";

  if (results.length === 0) {
    panel.innerHTML = `<div class="check-item ok"><span class="tag">OK</span> Tidak ada masalah ditemukan untuk minggu & outlet ini.</div>`;
  } else {
    const sorted = [...results].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "CRITICAL" ? -1 : 1));
    panel.innerHTML =
      `<div class="help-text" style="margin-bottom:8px;">${criticalCount} critical, ${warningCount} warning</div>` +
      sorted
        .map(
          (r) => `
        <div class="check-item ${r.severity.toLowerCase()}">
          <span class="tag">${r.severity}</span> ${r.message}
        </div>`
        )
        .join("");
  }

  document.getElementById("btnMarkReady").style.display = criticalCount === 0 ? "inline-block" : "none";
  return criticalCount;
}

// ============================================================
// AUTO SCHEDULER (Phase 5)
// Pendekatan: greedy per-hari + 1-day lookahead + fairness ringan.
// TIDAK menyentuh cell yang locked atau yang sedang leave.
// TIDAK langsung menulis ke Firestore -> hasil ditampilkan dulu
// sebagai preview, admin yang klik "Terapkan" atau "Batal".
// ============================================================

function getPagiStartTime() {
  const pagiTemplate = shiftTemplates.find((t) => (t.name || "").toUpperCase().includes("PAGI"));
  return pagiTemplate?.startTime || "08:00";
}

function getAvailabilityFor(employeeId, dayKey) {
  return availability.find((a) => a.employeeId === employeeId && a.dayOfWeek === dayKey);
}

const LOOKBACK_WEEKS = 6; // jendela histori fairness (Phase 7) — belum bisa diatur di Settings, itu Phase 8

// Rekap kerja pegawai LINTAS OUTLET dalam N minggu terakhir SEBELUM minggu yang
// sedang digenerate. Dipakai supaya rolling OFF & weekend fairness tidak cuma
// lihat minggu ini, tapi histori beberapa minggu (sesuai prinsip di desain awal).
function computeHistoricalCounts(employeeId) {
  const rangeStart = addDays(currentWeekStart, -7 * LOOKBACK_WEEKS);
  let workDays = 0;
  let pagi = 0;
  let siang = 0;
  let weekendOff = 0;

  for (let d = new Date(rangeStart); d < currentWeekStart; d = addDays(d, 1)) {
    const dateStr = toISODate(d);
    const type = anyOutletEffectiveType(employeeId, dateStr);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (type === "PAGI") { pagi++; workDays++; }
    else if (type === "SIANG") { siang++; workDays++; }
    else if (type === "OFF" && isWeekend) weekendOff++;
  }

  return { workDays, pagi, siang, weekendOff };
}

function generateSchedule() {
  const dates = weekDates(currentWeekStart);
  const eligibleEmployees = employeesForOutlet(currentOutletId);
  const outlet = outlets.find((o) => o.id === currentOutletId);
  const pagiStart = getPagiStartTime();

  const proposal = {}; // proposal[employeeId][dateStr] = 'PAGI' | 'SIANG' | 'OFF'
  const finalType = {}; // dipakai internal utk cek jumping & lookahead, termasuk 1 hari sebelum minggu ini
  const counters = {}; // akumulasi selama proses generate minggu ini (ditambah ke histori di bawah)
  const shortages = [];

  const hist = {}; // histori 6 minggu ke belakang per pegawai — dasar rolling OFF & weekend fairness
  eligibleEmployees.forEach((emp) => {
    hist[emp.id] = computeHistoricalCounts(emp.id);
  });

  const dayBeforeStr = toISODate(addDays(currentWeekStart, -1));
  eligibleEmployees.forEach((emp) => {
    finalType[emp.id] = { [dayBeforeStr]: anyOutletEffectiveType(emp.id, dayBeforeStr) };
    counters[emp.id] = { pagi: 0, siang: 0 };
  });

  dates.forEach((d, dayIndex) => {
    const dateStr = toISODate(d);
    const dayKey = DAY_KEYS[dayIndex];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const staffing = (isWeekend ? outlet?.staffingWeekend : outlet?.staffingWeekday) || {};
    const targetPagi = staffing.idealPagi ?? staffing.minPagi ?? 1;
    const targetSiang = staffing.idealSiang ?? staffing.minSiang ?? 1;
    const minPagi = staffing.minPagi ?? 0;
    const minSiang = staffing.minSiang ?? 0;

    const flexible = [];
    let lockedPagiCount = 0;
    let lockedSiangCount = 0;

    eligibleEmployees.forEach((emp) => {
      // Leave -> jangan disentuh sama sekali, sudah ditampilkan sbg badge
      if (leaveOverride(emp.id, dateStr)) {
        finalType[emp.id][dateStr] = leaveOverride(emp.id, dateStr);
        return;
      }
      // Locked -> pertahankan apa adanya
      const entry = shiftEntry(emp.id, dateStr);
      if (entry.isLocked) {
        finalType[emp.id][dateStr] = entry.shiftType;
        if (entry.shiftType === "PAGI") { counters[emp.id].pagi++; lockedPagiCount++; }
        if (entry.shiftType === "SIANG") { counters[emp.id].siang++; lockedSiangCount++; }
        return;
      }
      // Availability rutin -> unavailable jadi OFF paksa
      const avail = getAvailabilityFor(emp.id, dayKey);
      if (avail?.status === "unavailable") {
        finalType[emp.id][dateStr] = "OFF";
        return;
      }
      flexible.push(emp);
    });

    const prevTypeOf = (empId) => finalType[empId][toISODate(addDays(d, -1))] || "OFF";

    const canDoPagi = (emp) => {
      if (!emp.canWorkPagi) return false;
      if (prevTypeOf(emp.id) === "SIANG") return false; // HARD: anti-jumping
      const avail = getAvailabilityFor(emp.id, dayKey);
      if (avail?.status === "available_after" && avail.availableFromTime > pagiStart) return false;
      return true;
    };
    const canDoSiang = (emp) => emp.canWorkSiang;

    // ---- Lookahead: siapa yang besok jadi satu-satunya andalan Pagi? ----
    const atRisk = new Set();
    if (dayIndex < dates.length - 1) {
      const tomorrow = dates[dayIndex + 1];
      const tomorrowStr = toISODate(tomorrow);
      const tomorrowKey = DAY_KEYS[dayIndex + 1];
      const tomorrowIsWeekend = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
      const tomorrowStaffing = (tomorrowIsWeekend ? outlet?.staffingWeekend : outlet?.staffingWeekday) || {};
      const tomorrowTargetPagi = tomorrowStaffing.idealPagi ?? tomorrowStaffing.minPagi ?? 1;

      const potentialPagiTomorrow = eligibleEmployees.filter((emp) => {
        if (!emp.canWorkPagi) return false;
        if (leaveOverride(emp.id, tomorrowStr)) return false;
        const availTom = getAvailabilityFor(emp.id, tomorrowKey);
        if (availTom?.status === "unavailable") return false;
        if (availTom?.status === "available_after" && availTom.availableFromTime > pagiStart) return false;
        return true;
      });
      if (potentialPagiTomorrow.length <= tomorrowTargetPagi) {
        potentialPagiTomorrow.forEach((e) => atRisk.add(e.id));
      }
    }

    // ---- Rolling fairness: siapa yang paling "berhak" kerja hari ini? ----
    // Skor makin RENDAH = makin diprioritaskan kerja (histori kerja sedikit,
    // atau di weekend ini dia sudah sering dapat weekend-OFF sebelumnya).
    function workPriorityScore(emp) {
      const h = hist[emp.id];
      const c = counters[emp.id];
      let score = h.workDays + c.pagi + c.siang;
      if (isWeekend) score -= h.weekendOff * 0.5;
      return score;
    }

    const priorityOrder = [...flexible].sort((a, b) => workPriorityScore(a) - workPriorityScore(b));

    let pagiSlotsLeft = Math.max(0, targetPagi - lockedPagiCount);
    let siangSlotsLeft = Math.max(0, targetSiang - lockedSiangCount);
    const assignedPagiIds = new Set();
    const assignedSiangIds = new Set();

    priorityOrder.forEach((emp) => {
      if (pagiSlotsLeft === 0 && siangSlotsLeft === 0) return;

      const eligiblePagiNow = pagiSlotsLeft > 0 && canDoPagi(emp);
      const eligibleSiangNow = siangSlotsLeft > 0 && canDoSiang(emp) && !atRisk.has(emp.id);

      if (eligiblePagiNow && eligibleSiangNow) {
        // dua-duanya bisa -> pilih yang histori+minggu-ini-nya masih lebih rendah, utk seimbangkan Pagi vs Siang
        const h = hist[emp.id];
        const c = counters[emp.id];
        const preferPagi = h.pagi + c.pagi <= h.siang + c.siang;
        if (preferPagi) { assignedPagiIds.add(emp.id); pagiSlotsLeft--; }
        else { assignedSiangIds.add(emp.id); siangSlotsLeft--; }
      } else if (eligiblePagiNow) {
        assignedPagiIds.add(emp.id);
        pagiSlotsLeft--;
      } else if (siangSlotsLeft > 0 && canDoSiang(emp)) {
        // fallback: kalau ke-skip Siang gara-gara atRisk tapi ternyata tidak eligible Pagi sama sekali,
        // tetap boleh Siang drpd nganggur percuma
        assignedSiangIds.add(emp.id);
        siangSlotsLeft--;
      }
    });

    flexible.forEach((emp) => {
      let type = "OFF";
      if (assignedPagiIds.has(emp.id)) type = "PAGI";
      else if (assignedSiangIds.has(emp.id)) type = "SIANG";

      finalType[emp.id][dateStr] = type;
      if (type === "PAGI") counters[emp.id].pagi++;
      if (type === "SIANG") counters[emp.id].siang++;

      const currentType = shiftEntry(emp.id, dateStr).shiftType;
      if (currentType !== type) {
        proposal[emp.id] = proposal[emp.id] || {};
        proposal[emp.id][dateStr] = type;
      }
    });

    const totalPagiToday = lockedPagiCount + assignedPagiIds.size;
    const totalSiangToday = lockedSiangCount + assignedSiangIds.size;

    if (totalPagiToday < minPagi) {
      shortages.push(
        `${formatShort(d)}: total PAGI cuma ${totalPagiToday} (minimum ${minPagi}) — kemungkinan besar semua kandidat sedang leave/locked/kena aturan anti-jumping.`
      );
    }
    if (totalSiangToday < minSiang) {
      shortages.push(
        `${formatShort(d)}: total SIANG cuma ${totalSiangToday} (minimum ${minSiang}) — kemungkinan besar semua kandidat sedang leave/locked/kena aturan anti-jumping.`
      );
    }
  });

  return { proposal, shortages };
}

function renderGeneratePreview({ proposal, shortages }) {
  const panel = document.getElementById("generatePreviewPanel");
  panel.style.display = "block";

  const changeEntries = [];
  Object.entries(proposal).forEach(([employeeId, byDate]) => {
    const emp = employees.find((e) => e.id === employeeId);
    Object.entries(byDate).forEach(([dateStr, newType]) => {
      const oldType = shiftEntry(employeeId, dateStr).shiftType;
      changeEntries.push({ empName: emp ? emp.name : employeeId, dateStr, oldType, newType });
    });
  });

  if (changeEntries.length === 0) {
    panel.innerHTML = `
      <div class="preview-box">
        <strong>Tidak ada perubahan.</strong> Jadwal minggu ini untuk outlet ini sudah sesuai hasil Auto Scheduler
        (atau semua cell sedang locked/leave).
      </div>`;
    return;
  }

  const shortageHtml = shortages.length
    ? shortages.map((s) => `<div class="check-item critical"><span class="tag">SHORTAGE</span> ${s}</div>`).join("")
    : `<div class="check-item ok"><span class="tag">OK</span> Semua shift wajib berhasil terisi sesuai minimum staffing.</div>`;

  const changesHtml = changeEntries
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr) || a.empName.localeCompare(b.empName))
    .map(
      (c) => `
      <div>
        <strong>${c.empName}</strong> — ${c.dateStr}:
        <span class="arrow-old">${c.oldType}</span> → <span class="arrow-new">${c.newType}</span>
      </div>`
    )
    .join("");

  panel.innerHTML = `
    <div class="preview-box">
      <strong>Preview Auto Scheduler</strong>
      <div class="help-text">Belum tersimpan. Cell yang locked atau sedang leave tidak ikut diubah.</div>
      ${shortageHtml}
      <div class="preview-change-list">${changesHtml}</div>
      <div class="preview-actions">
        <button class="btn btn-primary btn-sm" id="btnApplyGenerate">Terapkan Perubahan</button>
        <button class="btn btn-sm" id="btnCancelGenerate">Batal</button>
      </div>
    </div>`;

  document.getElementById("btnCancelGenerate").addEventListener("click", () => {
    panel.style.display = "none";
    panel.innerHTML = "";
  });

  document.getElementById("btnApplyGenerate").addEventListener("click", async () => {
    try {
      for (const [employeeId, byDate] of Object.entries(proposal)) {
        for (const [dateStr, shiftType] of Object.entries(byDate)) {
          const id = shiftDocId(currentOutletId, currentWeekStart, employeeId, dateStr);
          await setItem("schedule_shifts", id, {
            scheduleId: scheduleDocId(currentOutletId, currentWeekStart),
            outletId: currentOutletId,
            employeeId,
            date: dateStr,
            shiftType,
            source: "auto",
          });
        }
      }
      panel.style.display = "none";
      panel.innerHTML = "";
      document.getElementById("checkResultsPanel").style.display = "none";
      document.getElementById("btnMarkReady").style.display = "none";
    } catch (err) {
      console.error(err);
      alert("Gagal menerapkan hasil Auto Scheduler. Cek console untuk detail.");
    }
  });
}

document.getElementById("btnGenerateSchedule").addEventListener("click", () => {
  const result = generateSchedule();
  renderGeneratePreview(result);
});

// ============================================================
// AUTO FIX (Phase 6) = Auto Replacement + Auto Rebalance
// Beda dengan Generate Schedule: ini TIDAK menulis ulang seluruh
// minggu dari nol. Ini cuma menambal kekurangan pada jadwal yang
// SUDAH ADA (hasil manual atau hasil Generate sebelumnya):
//   1. Bersihkan shift PAGI/SIANG yang nyangkut di tanggal yang
//      ternyata sudah jadi leave (tanpa menyentuh yang locked).
//   2. Untuk tiap hari yang understaffed: cari pegawai yang
//      sedang OFF & eligible (Auto Replacement).
//   3. Kalau tidak ada yang OFF & eligible: coba tukar pegawai
//      yang sedang kerja shift lain, lalu isi slot yang dia
//      tinggalkan kalau ada penggantinya (Auto Rebalance).
//   4. Kalau tetap tidak bisa: laporkan sebagai unresolved,
//      JANGAN memaksakan (prinsip §41 di desain awal).
// ============================================================

function runAutoFix() {
  const dates = weekDates(currentWeekStart);
  const eligibleEmployees = employeesForOutlet(currentOutletId);
  const outlet = outlets.find((o) => o.id === currentOutletId);
  const pagiStart = getPagiStartTime();

  const proposal = {}; // key `${employeeId}|${dateStr}` -> newType (semua utk currentOutletId)
  const actions = [];
  const unresolved = [];

  const hist = {}; // histori 6 minggu, dipakai sbg fairness tie-breaker saat pilih replacement/rebalance
  eligibleEmployees.forEach((emp) => {
    hist[emp.id] = computeHistoricalCounts(emp.id);
  });

  function proposalKey(employeeId, dateStr) {
    return `${employeeId}|${dateStr}`;
  }

  // type efektif LINTAS OUTLET dgn proposal di outlet ini ikut dipertimbangkan (utk cek jumping)
  function typeForJumpingCheck(employeeId, dateStr) {
    const key = proposalKey(employeeId, dateStr);
    if (proposal[key] !== undefined) return proposal[key];
    return anyOutletEffectiveType(employeeId, dateStr);
  }

  // type di OUTLET INI SAJA dgn proposal ikut dipertimbangkan (utk hitung staffing outlet ini)
  function typeAtThisOutlet(employeeId, dateStr) {
    const key = proposalKey(employeeId, dateStr);
    if (proposal[key] !== undefined) return proposal[key];
    const override = leaveOverride(employeeId, dateStr);
    if (override) return override;
    return shiftEntry(employeeId, dateStr).shiftType;
  }

  function setProposal(employeeId, dateStr, type) {
    proposal[proposalKey(employeeId, dateStr)] = type;
  }

  // ---- Step 1: bersihkan shift lama yang bentrok dgn leave ----
  dates.forEach((d) => {
    const dateStr = toISODate(d);
    eligibleEmployees.forEach((emp) => {
      const override = leaveOverride(emp.id, dateStr);
      const current = shiftEntry(emp.id, dateStr);
      if (override && (current.shiftType === "PAGI" || current.shiftType === "SIANG") && !current.isLocked) {
        setProposal(emp.id, dateStr, "OFF");
        actions.push(`${emp.name}: dibersihkan dari shift ${current.shiftType} pada ${formatShort(d)} karena sedang ${override}.`);
      }
    });
  });

  // ---- Step 2: tambal kekurangan staffing hari demi hari ----
  dates.forEach((d, dayIndex) => {
    const dateStr = toISODate(d);
    const dayKey = DAY_KEYS[dayIndex];
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const staffing = (isWeekend ? outlet?.staffingWeekend : outlet?.staffingWeekday) || {};
    const minPagi = staffing.minPagi ?? 0;
    const minSiang = staffing.minSiang ?? 0;

    function countsToday() {
      let pagi = 0, siang = 0;
      eligibleEmployees.forEach((emp) => {
        const t = typeAtThisOutlet(emp.id, dateStr);
        if (t === "PAGI") pagi++;
        if (t === "SIANG") siang++;
      });
      return { pagi, siang };
    }

    function isEligibleFor(emp, shiftTypeNeeded) {
      if (leaveOverride(emp.id, dateStr)) return false;
      const entry = shiftEntry(emp.id, dateStr);
      if (entry.isLocked) return false;
      if (shiftTypeNeeded === "PAGI" && !emp.canWorkPagi) return false;
      if (shiftTypeNeeded === "SIANG" && !emp.canWorkSiang) return false;
      if (shiftTypeNeeded === "PAGI") {
        const prevType = typeForJumpingCheck(emp.id, toISODate(addDays(d, -1)));
        if (prevType === "SIANG") return false; // HARD: anti-jumping
      }
      const avail = getAvailabilityFor(emp.id, dayKey);
      if (avail?.status === "unavailable") return false;
      if (shiftTypeNeeded === "PAGI" && avail?.status === "available_after" && avail.availableFromTime > pagiStart) return false;
      return true;
    }

    function tryFillShortage(shiftTypeNeeded, minRequired) {
      let guard = 0; // jaga-jaga supaya tidak infinite loop kalau ada bug
      while (guard < eligibleEmployees.length + 1) {
        guard++;
        const { pagi, siang } = countsToday();
        const currentCount = shiftTypeNeeded === "PAGI" ? pagi : siang;
        if (currentCount >= minRequired) return;

        // 2a. Auto Replacement: pegawai yang sedang OFF & eligible
        const candidates = eligibleEmployees
          .filter((emp) => typeAtThisOutlet(emp.id, dateStr) === "OFF" && isEligibleFor(emp, shiftTypeNeeded))
          .sort((a, b) => hist[a.id].workDays - hist[b.id].workDays);

        if (candidates.length > 0) {
          const chosen = candidates[0];
          setProposal(chosen.id, dateStr, shiftTypeNeeded);
          actions.push(`${chosen.name}: OFF → ${shiftTypeNeeded} pada ${formatShort(d)} (replacement).`);
          continue;
        }

        // 2b. Auto Rebalance: pindahkan yang sedang kerja shift LAIN, cari backfill utk slot yg ditinggal
        const otherType = shiftTypeNeeded === "PAGI" ? "SIANG" : "PAGI";
        const otherMin = otherType === "PAGI" ? minPagi : minSiang;

        const movable = eligibleEmployees
          .filter((emp) => typeAtThisOutlet(emp.id, dateStr) === otherType && isEligibleFor(emp, shiftTypeNeeded))
          .sort((a, b) => hist[b.id].workDays - hist[a.id].workDays); // yang paling banyak kerja histori didahulukan utk dipindah (dia yg paling "mampu")

        let rebalanced = false;
        for (const mover of movable) {
          const { pagi: p2, siang: s2 } = countsToday();
          const otherCountNow = otherType === "PAGI" ? p2 : s2;
          const wouldBeLeftBehind = otherCountNow - 1;

          const backfillCandidates = eligibleEmployees
            .filter((emp) => emp.id !== mover.id && typeAtThisOutlet(emp.id, dateStr) === "OFF" && isEligibleFor(emp, otherType))
            .sort((a, b) => hist[a.id].workDays - hist[b.id].workDays);

          if (backfillCandidates.length > 0) {
            const backfill = backfillCandidates[0];
            setProposal(mover.id, dateStr, shiftTypeNeeded);
            setProposal(backfill.id, dateStr, otherType);
            actions.push(
              `${mover.name}: ${otherType} → ${shiftTypeNeeded}, ${backfill.name}: OFF → ${otherType} pada ${formatShort(d)} (rebalance).`
            );
            rebalanced = true;
            break;
          }

          if (wouldBeLeftBehind >= otherMin) {
            setProposal(mover.id, dateStr, shiftTypeNeeded);
            actions.push(
              `${mover.name}: ${otherType} → ${shiftTypeNeeded} pada ${formatShort(d)} (rebalance, slot lama masih di atas minimum tanpa pengganti).`
            );
            rebalanced = true;
            break;
          }
          // kalau tidak, coba mover berikutnya — pindahin dia akan bikin shortage baru
        }

        if (!rebalanced) {
          unresolved.push(
            `${formatShort(d)}: butuh ${minRequired - currentCount} lagi untuk ${shiftTypeNeeded}, tapi tidak ada kandidat replacement maupun rebalance yang valid (leave/locked/anti-jumping menghalangi semua kandidat tersisa).`
          );
          return;
        }
      }
    }

    tryFillShortage("PAGI", minPagi);
    tryFillShortage("SIANG", minSiang);
  });

  return { proposal, actions, unresolved };
}

function renderAutoFixPreview({ proposal, actions, unresolved }) {
  const panel = document.getElementById("autoFixPreviewPanel");
  panel.style.display = "block";

  const changeEntries = Object.keys(proposal).map((key) => {
    const [employeeId, dateStr] = key.split("|");
    const emp = employees.find((e) => e.id === employeeId);
    const oldType = shiftEntry(employeeId, dateStr).shiftType;
    return { employeeId, empName: emp ? emp.name : employeeId, dateStr, oldType, newType: proposal[key] };
  });

  if (changeEntries.length === 0 && unresolved.length === 0) {
    panel.innerHTML = `
      <div class="preview-box">
        <strong>Tidak ada yang perlu ditambal.</strong> Semua shift wajib sudah terisi sesuai minimum staffing.
      </div>`;
    return;
  }

  const unresolvedHtml = unresolved.length
    ? unresolved.map((s) => `<div class="check-item critical"><span class="tag">SHORTAGE</span> ${s}</div>`).join("")
    : `<div class="check-item ok"><span class="tag">OK</span> Semua kekurangan berhasil ditambal.</div>`;

  const actionsHtml = actions.length
    ? actions.map((a) => `<div>• ${a}</div>`).join("")
    : `<div class="help-text">Tidak ada aksi replacement/rebalance yang dilakukan.</div>`;

  panel.innerHTML = `
    <div class="preview-box">
      <strong>Preview Auto Fix</strong>
      <div class="help-text">Belum tersimpan. Cell yang locked tidak ikut diubah atau dipakai sebagai pengganti.</div>
      ${unresolvedHtml}
      <div class="preview-change-list">${actionsHtml}</div>
      <div class="preview-actions">
        ${changeEntries.length > 0 ? '<button class="btn btn-primary btn-sm" id="btnApplyAutoFix">Terapkan Perubahan</button>' : ""}
        <button class="btn btn-sm" id="btnCancelAutoFix">Batal</button>
      </div>
    </div>`;

  document.getElementById("btnCancelAutoFix").addEventListener("click", () => {
    panel.style.display = "none";
    panel.innerHTML = "";
  });

  const applyBtn = document.getElementById("btnApplyAutoFix");
  if (applyBtn) {
    applyBtn.addEventListener("click", async () => {
      try {
        for (const entry of changeEntries) {
          const id = shiftDocId(currentOutletId, currentWeekStart, entry.employeeId, entry.dateStr);
          await setItem("schedule_shifts", id, {
            scheduleId: scheduleDocId(currentOutletId, currentWeekStart),
            outletId: currentOutletId,
            employeeId: entry.employeeId,
            date: entry.dateStr,
            shiftType: entry.newType,
            source: "auto_fix",
          });
        }
        panel.style.display = "none";
        panel.innerHTML = "";
        document.getElementById("checkResultsPanel").style.display = "none";
        document.getElementById("btnMarkReady").style.display = "none";
      } catch (err) {
        console.error(err);
        alert("Gagal menerapkan Auto Fix. Cek console untuk detail.");
      }
    });
  }
}

document.getElementById("btnAutoFix").addEventListener("click", () => {
  const result = runAutoFix();
  renderAutoFixPreview(result);
});

document.getElementById("btnCheckSchedule").addEventListener("click", () => {
  const results = runConflictChecker();
  renderCheckResults(results);
});

document.getElementById("btnMarkReady").addEventListener("click", async () => {
  const id = scheduleDocId(currentOutletId, currentWeekStart);
  try {
    await setItem("schedules", id, { status: "ready" });
    statusPill.textContent = "READY";
    statusPill.className = "pill pill-active";
  } catch (err) {
    console.error(err);
    alert("Gagal mengubah status jadwal. Cek console untuk detail.");
  }
});

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
        document.getElementById("checkResultsPanel").style.display = "none";
        document.getElementById("btnMarkReady").style.display = "none";
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
