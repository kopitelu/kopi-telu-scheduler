import { watchCollection, addItem, deleteItem, setItem } from "./firestore-service.js";

const LEAVE_TYPE_LABELS = {
  off_request: "OFF Request",
  cuti: "Cuti",
  izin: "Izin",
  sakit: "Sakit",
  unavailable: "Unavailable",
};

const DAYS = [
  { key: "mon", label: "Senin" },
  { key: "tue", label: "Selasa" },
  { key: "wed", label: "Rabu" },
  { key: "thu", label: "Kamis" },
  { key: "fri", label: "Jumat" },
  { key: "sat", label: "Sabtu" },
  { key: "sun", label: "Minggu" },
];

let employees = [];
let leaves = [];
let availability = []; // seluruh employee_availability, difilter per pegawai di client
let selectedAvailEmployeeId = null;

const leaveEmployeeSelect = document.getElementById("leaveEmployee");
const availEmployeeSelect = document.getElementById("availEmployee");
const leaveForm = document.getElementById("leaveForm");
const leaveTableWrapper = document.getElementById("leaveTableWrapper");
const availTableWrapper = document.getElementById("availTableWrapper");

// ---------- Load employees (dipakai di 2 dropdown) ----------
watchCollection("employees", (items) => {
  employees = items.filter((e) => e.status === "active");

  const options = employees.map((e) => `<option value="${e.id}">${e.name}</option>`).join("");
  leaveEmployeeSelect.innerHTML = options || `<option value="">Belum ada pegawai</option>`;

  const prevAvailSelected = selectedAvailEmployeeId;
  availEmployeeSelect.innerHTML = options || `<option value="">Belum ada pegawai</option>`;
  if (employees.length > 0) {
    selectedAvailEmployeeId =
      prevAvailSelected && employees.some((e) => e.id === prevAvailSelected)
        ? prevAvailSelected
        : employees[0].id;
    availEmployeeSelect.value = selectedAvailEmployeeId;
  }

  renderLeaveTable();
  renderAvailabilityTable();
}, "name");

function employeeName(id) {
  const e = employees.find((x) => x.id === id);
  return e ? e.name : "(pegawai dihapus)";
}

// ---------- LEAVE ----------
watchCollection("employee_leave", (items) => {
  leaves = items;
  renderLeaveTable();
});

function formatDateID(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function renderLeaveTable() {
  if (leaves.length === 0) {
    leaveTableWrapper.innerHTML = `<div class="empty-state">Belum ada leave yang diajukan.</div>`;
    return;
  }

  const sorted = [...leaves].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  const rows = sorted
    .map((l) => {
      return `
        <tr>
          <td><strong>${employeeName(l.employeeId)}</strong></td>
          <td>${formatDateID(l.startDate)} – ${formatDateID(l.endDate)}</td>
          <td><span class="pill pill-${l.type}">${LEAVE_TYPE_LABELS[l.type] || l.type}</span></td>
          <td>${l.note || "—"}</td>
          <td><button class="btn btn-sm btn-danger" data-delete="${l.id}">Hapus</button></td>
        </tr>`;
    })
    .join("");

  leaveTableWrapper.innerHTML = `
    <table>
      <thead>
        <tr><th>Pegawai</th><th>Tanggal</th><th>Jenis</th><th>Catatan</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  leaveTableWrapper.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus leave ini? Jadwal terkait akan kembali normal (OFF/PAGI/SIANG bisa diisi manual lagi).")) return;
      await deleteItem("employee_leave", btn.dataset.delete);
    });
  });
}

leaveForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const employeeId = leaveEmployeeSelect.value;
  const type = document.getElementById("leaveType").value;
  const startDate = document.getElementById("leaveStart").value;
  const endDate = document.getElementById("leaveEnd").value;
  const note = document.getElementById("leaveNote").value.trim();

  if (!employeeId) {
    alert("Pilih pegawai dulu.");
    return;
  }
  if (!startDate || !endDate) {
    alert("Tanggal mulai dan selesai wajib diisi.");
    return;
  }
  if (startDate > endDate) {
    alert("Tanggal mulai tidak boleh setelah tanggal selesai.");
    return;
  }

  try {
    await addItem("employee_leave", { employeeId, type, startDate, endDate, note });
    leaveForm.reset();
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan leave. Cek console untuk detail.");
  }
});

// ---------- AVAILABILITY ----------
watchCollection("employee_availability", (items) => {
  availability = items;
  renderAvailabilityTable();
});

availEmployeeSelect.addEventListener("change", () => {
  selectedAvailEmployeeId = availEmployeeSelect.value;
  renderAvailabilityTable();
});

function availabilityDocId(employeeId, dayKey) {
  return `${employeeId}_${dayKey}`;
}

function getAvailability(employeeId, dayKey) {
  return availability.find((a) => a.employeeId === employeeId && a.dayOfWeek === dayKey);
}

function renderAvailabilityTable() {
  if (!selectedAvailEmployeeId) {
    availTableWrapper.innerHTML = `<div class="empty-state">Belum ada pegawai.</div>`;
    return;
  }

  const rows = DAYS.map((d) => {
    const record = getAvailability(selectedAvailEmployeeId, d.key);
    const status = record?.status || "available";
    const time = record?.availableFromTime || "14:00";
    const showTime = status === "available_after";

    return `
      <tr>
        <td style="width:120px;"><strong>${d.label}</strong></td>
        <td>
          <select class="availStatus" data-day="${d.key}">
            <option value="available" ${status === "available" ? "selected" : ""}>Available</option>
            <option value="available_after" ${status === "available_after" ? "selected" : ""}>Available after...</option>
            <option value="unavailable" ${status === "unavailable" ? "selected" : ""}>Unavailable</option>
          </select>
        </td>
        <td>
          <input type="time" class="availTime" data-day="${d.key}" value="${time}"
            style="${showTime ? "" : "visibility:hidden;"}" />
        </td>
      </tr>`;
  }).join("");

  availTableWrapper.innerHTML = `
    <table class="avail-table">
      <thead><tr><th>Hari</th><th>Status</th><th>Available After (jam)</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  availTableWrapper.querySelectorAll(".availStatus").forEach((select) => {
    select.addEventListener("change", async (ev) => {
      const dayKey = ev.target.dataset.day;
      const status = ev.target.value;
      const timeInput = availTableWrapper.querySelector(`.availTime[data-day="${dayKey}"]`);
      timeInput.style.visibility = status === "available_after" ? "visible" : "hidden";

      await saveAvailability(dayKey, status, timeInput.value);
    });
  });

  availTableWrapper.querySelectorAll(".availTime").forEach((input) => {
    input.addEventListener("change", async (ev) => {
      const dayKey = ev.target.dataset.day;
      const statusSelect = availTableWrapper.querySelector(`.availStatus[data-day="${dayKey}"]`);
      await saveAvailability(dayKey, statusSelect.value, ev.target.value);
    });
  });
}

async function saveAvailability(dayKey, status, availableFromTime) {
  const id = availabilityDocId(selectedAvailEmployeeId, dayKey);
  try {
    await setItem("employee_availability", id, {
      employeeId: selectedAvailEmployeeId,
      dayOfWeek: dayKey,
      status,
      availableFromTime: status === "available_after" ? availableFromTime : null,
    });
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan availability. Cek console untuk detail.");
  }
}
