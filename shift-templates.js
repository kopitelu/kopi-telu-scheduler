import { watchCollection, addItem, updateItem, deleteItem } from "./firestore-service.js";

let outlets = [];
let shifts = [];

const formCard = document.getElementById("shiftFormCard");
const form = document.getElementById("shiftForm");
const formTitle = document.getElementById("formTitle");
const tableWrapper = document.getElementById("shiftTableWrapper");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const breakInput = document.getElementById("breakMinutes");
const durationDisplay = document.getElementById("durationDisplay");

// ---------- Duration calculation ----------
function calcDurationMinutes(start, end, breakMinutes) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // shift lewat tengah malam
  const total = endMin - startMin - Number(breakMinutes || 0);
  return total > 0 ? total : 0;
}

function formatDuration(minutes) {
  if (minutes == null) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} jam${m ? ` ${m} menit` : ""}`;
}

function updateDurationDisplay() {
  const minutes = calcDurationMinutes(startTimeInput.value, endTimeInput.value, breakInput.value);
  durationDisplay.value = formatDuration(minutes);
}

[startTimeInput, endTimeInput, breakInput].forEach((el) =>
  el.addEventListener("input", updateDurationDisplay)
);

// ---------- Outlet checkboxes ----------
function renderOutletCheckboxes() {
  const group = document.getElementById("outletsGroup");
  group.innerHTML =
    outlets
      .map((o) => `<label><input type="checkbox" value="${o.id}" class="outletChk" /> ${o.name}</label>`)
      .join("") ||
    `<span class="help-text">Belum ada outlet. Tambahkan outlet dulu di halaman Outlets.</span>`;
}

watchCollection("outlets", (items) => {
  outlets = items;
  renderOutletCheckboxes();
  renderTable();
}, "name");

watchCollection("shift_templates", (items) => {
  shifts = items;
  renderTable();
}, "name");

function outletNames(ids) {
  return (ids || [])
    .map((id) => outlets.find((o) => o.id === id)?.name)
    .filter(Boolean)
    .join(", ") || "—";
}

function renderTable() {
  if (shifts.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada shift. Klik "Tambah Shift" untuk mulai — minimal buat SHIFT PAGI dan SHIFT SIANG.</div>`;
    return;
  }

  const rows = shifts
    .map((s) => {
      const duration = calcDurationMinutes(s.startTime, s.endTime, s.breakMinutes);
      return `
        <tr>
          <td><strong>${s.name}</strong></td>
          <td>${s.startTime} – ${s.endTime}</td>
          <td>${formatDuration(duration)}</td>
          <td>${s.breakMinutes ?? 0} menit</td>
          <td>${outletNames(s.outletIds)}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-edit="${s.id}">Edit</button>
              <button class="btn btn-sm btn-danger" data-delete="${s.id}">Hapus</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nama Shift</th>
          <th>Jam</th>
          <th>Durasi Kerja</th>
          <th>Break</th>
          <th>Outlet</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  tableWrapper.querySelectorAll("[data-edit]").forEach((btn) =>
    btn.addEventListener("click", () => openEditForm(btn.dataset.edit))
  );
  tableWrapper.querySelectorAll("[data-delete]").forEach((btn) =>
    btn.addEventListener("click", () => handleDelete(btn.dataset.delete))
  );
}

function resetForm() {
  form.reset();
  document.getElementById("shiftId").value = "";
  document.querySelectorAll(".outletChk").forEach((c) => (c.checked = false));
  startTimeInput.value = "08:00";
  endTimeInput.value = "16:00";
  breakInput.value = 60;
  updateDurationDisplay();
}

document.getElementById("btnNewShift").addEventListener("click", () => {
  resetForm();
  formTitle.textContent = "Tambah Shift";
  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("btnCancelShift").addEventListener("click", () => {
  formCard.style.display = "none";
  resetForm();
});

function openEditForm(id) {
  const s = shifts.find((x) => x.id === id);
  if (!s) return;

  resetForm();
  formTitle.textContent = `Edit Shift — ${s.name}`;
  document.getElementById("shiftId").value = s.id;
  document.getElementById("name").value = s.name || "";
  startTimeInput.value = s.startTime || "08:00";
  endTimeInput.value = s.endTime || "16:00";
  breakInput.value = s.breakMinutes ?? 60;
  updateDurationDisplay();

  (s.outletIds || []).forEach((id) => {
    const chk = document.querySelector(`.outletChk[value="${id}"]`);
    if (chk) chk.checked = true;
  });

  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
}

async function handleDelete(id) {
  const s = shifts.find((x) => x.id === id);
  if (!confirm(`Hapus shift "${s ? s.name : ""}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  await deleteItem("shift_templates", id);
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const id = document.getElementById("shiftId").value;
  const outletIds = Array.from(document.querySelectorAll(".outletChk:checked")).map((c) => c.value);
  const durationMinutes = calcDurationMinutes(startTimeInput.value, endTimeInput.value, breakInput.value);

  const data = {
    name: document.getElementById("name").value.trim(),
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    breakMinutes: Number(breakInput.value) || 0,
    durationMinutes,
    outletIds,
  };

  if (!data.name) {
    alert("Nama shift wajib diisi.");
    return;
  }

  try {
    if (id) {
      await updateItem("shift_templates", id, data);
    } else {
      await addItem("shift_templates", data);
    }
    formCard.style.display = "none";
    resetForm();
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan data shift. Cek console untuk detail.");
  }
});

updateDurationDisplay();
