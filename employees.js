import { watchCollection, addItem, updateItem, deleteItem } from "./firestore-service.js";

const DAYS = [
  { key: "mon", label: "Senin" },
  { key: "tue", label: "Selasa" },
  { key: "wed", label: "Rabu" },
  { key: "thu", label: "Kamis" },
  { key: "fri", label: "Jumat" },
  { key: "sat", label: "Sabtu" },
  { key: "sun", label: "Minggu" },
];

let outlets = [];
let employees = [];

const formCard = document.getElementById("employeeFormCard");
const form = document.getElementById("employeeForm");
const formTitle = document.getElementById("formTitle");
const tableWrapper = document.getElementById("employeeTableWrapper");

// ---------- Render checkbox groups that depend on outlets/days ----------
function renderOutletCheckboxes() {
  const group = document.getElementById("allowedOutletsGroup");
  group.innerHTML = outlets
    .map(
      (o) => `<label><input type="checkbox" value="${o.id}" class="allowedOutletChk" /> ${o.name}</label>`
    )
    .join("") || `<span class="help-text">Belum ada outlet. Tambahkan outlet dulu di halaman Outlets.</span>`;

  const primarySelect = document.getElementById("primaryOutletId");
  primarySelect.innerHTML = outlets
    .map((o) => `<option value="${o.id}">${o.name}</option>`)
    .join("");
}

function renderDayCheckboxes(containerId, className) {
  const group = document.getElementById(containerId);
  group.innerHTML = DAYS.map(
    (d) => `<label><input type="checkbox" value="${d.key}" class="${className}" /> ${d.label}</label>`
  ).join("");
}
renderDayCheckboxes("preferredDaysOffGroup", "preferredDayChk");
renderDayCheckboxes("unavailableDaysGroup", "unavailableDayChk");

// ---------- Load outlets (for dropdown/checkboxes) ----------
watchCollection("outlets", (items) => {
  outlets = items;
  renderOutletCheckboxes();
  renderTable(); // re-render in case outlet names changed
});

// ---------- Load employees ----------
watchCollection("employees", (items) => {
  employees = items;
  renderTable();
}, "name");

function outletName(id) {
  const o = outlets.find((x) => x.id === id);
  return o ? o.name : "—";
}

function renderTable() {
  if (employees.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada pegawai. Klik "Tambah Pegawai" untuk mulai.</div>`;
    return;
  }

  const rows = employees
    .map((e) => {
      const pillClass = e.status === "active" ? "pill-active" : "pill-inactive";
      const shifts = [e.canWorkPagi ? "Pagi" : null, e.canWorkSiang ? "Siang" : null]
        .filter(Boolean)
        .join(" & ") || "—";
      return `
        <tr>
          <td><strong>${e.name}</strong><br/><span class="help-text">${e.position || ""}</span></td>
          <td>${outletName(e.primaryOutletId)}</td>
          <td>${shifts}</td>
          <td>${e.maxDaysPerWeek ?? "-"} hari / ${e.maxHoursPerWeek ?? "-"} jam</td>
          <td>${e.minDaysOffPerWeek ?? "-"}</td>
          <td><span class="pill ${pillClass}">${e.status}</span></td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-edit="${e.id}">Edit</button>
              <button class="btn btn-sm btn-danger" data-delete="${e.id}">Hapus</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nama</th>
          <th>Outlet Utama</th>
          <th>Kapasitas Shift</th>
          <th>Batas Kerja</th>
          <th>Min. Libur/Minggu</th>
          <th>Status</th>
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

// ---------- Form open/close ----------
function resetForm() {
  form.reset();
  document.getElementById("employeeId").value = "";
  document.querySelectorAll(".allowedOutletChk").forEach((c) => (c.checked = false));
  document.querySelectorAll(".preferredDayChk").forEach((c) => (c.checked = false));
  document.querySelectorAll(".unavailableDayChk").forEach((c) => (c.checked = false));
  document.getElementById("canWorkPagi").checked = true;
  document.getElementById("canWorkSiang").checked = true;
}

document.getElementById("btnNewEmployee").addEventListener("click", () => {
  resetForm();
  formTitle.textContent = "Tambah Pegawai";
  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("btnCancelEmployee").addEventListener("click", () => {
  formCard.style.display = "none";
  resetForm();
});

function openEditForm(id) {
  const e = employees.find((x) => x.id === id);
  if (!e) return;

  resetForm();
  formTitle.textContent = `Edit Pegawai — ${e.name}`;
  document.getElementById("employeeId").value = e.id;
  document.getElementById("name").value = e.name || "";
  document.getElementById("status").value = e.status || "active";
  document.getElementById("position").value = e.position || "";
  document.getElementById("primaryOutletId").value = e.primaryOutletId || "";
  document.getElementById("maxHoursPerWeek").value = e.maxHoursPerWeek ?? 40;
  document.getElementById("maxDaysPerWeek").value = e.maxDaysPerWeek ?? 6;
  document.getElementById("minDaysOffPerWeek").value = e.minDaysOffPerWeek ?? 1;
  document.getElementById("canWorkPagi").checked = !!e.canWorkPagi;
  document.getElementById("canWorkSiang").checked = !!e.canWorkSiang;
  document.getElementById("notes").value = e.notes || "";

  (e.allowedOutletIds || []).forEach((id) => {
    const chk = document.querySelector(`.allowedOutletChk[value="${id}"]`);
    if (chk) chk.checked = true;
  });
  (e.preferredDaysOff || []).forEach((d) => {
    const chk = document.querySelector(`.preferredDayChk[value="${d}"]`);
    if (chk) chk.checked = true;
  });
  (e.unavailableDays || []).forEach((d) => {
    const chk = document.querySelector(`.unavailableDayChk[value="${d}"]`);
    if (chk) chk.checked = true;
  });

  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
}

async function handleDelete(id) {
  const e = employees.find((x) => x.id === id);
  if (!confirm(`Hapus pegawai "${e ? e.name : ""}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  await deleteItem("employees", id);
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const id = document.getElementById("employeeId").value;
  const allowedOutletIds = Array.from(document.querySelectorAll(".allowedOutletChk:checked")).map(
    (c) => c.value
  );
  const preferredDaysOff = Array.from(document.querySelectorAll(".preferredDayChk:checked")).map(
    (c) => c.value
  );
  const unavailableDays = Array.from(document.querySelectorAll(".unavailableDayChk:checked")).map(
    (c) => c.value
  );

  const data = {
    name: document.getElementById("name").value.trim(),
    status: document.getElementById("status").value,
    position: document.getElementById("position").value.trim(),
    primaryOutletId: document.getElementById("primaryOutletId").value,
    allowedOutletIds,
    maxHoursPerWeek: Number(document.getElementById("maxHoursPerWeek").value),
    maxDaysPerWeek: Number(document.getElementById("maxDaysPerWeek").value),
    minDaysOffPerWeek: Number(document.getElementById("minDaysOffPerWeek").value),
    canWorkPagi: document.getElementById("canWorkPagi").checked,
    canWorkSiang: document.getElementById("canWorkSiang").checked,
    preferredDaysOff,
    unavailableDays,
    notes: document.getElementById("notes").value.trim(),
  };

  if (!data.name) {
    alert("Nama pegawai wajib diisi.");
    return;
  }

  try {
    if (id) {
      await updateItem("employees", id, data);
    } else {
      await addItem("employees", data);
    }
    formCard.style.display = "none";
    resetForm();
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan data pegawai. Cek console untuk detail.");
  }
});
