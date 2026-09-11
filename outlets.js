import { watchCollection, addItem, updateItem, deleteItem } from "./firestore-service.js";

let outlets = [];

const formCard = document.getElementById("outletFormCard");
const form = document.getElementById("outletForm");
const formTitle = document.getElementById("formTitle");
const tableWrapper = document.getElementById("outletTableWrapper");
const headcountBody = document.getElementById("headcountRuleBody");

const DEFAULT_HEADCOUNT_RULES = [
  { headcount: 2, pagi: 1, siang: 1 },
  { headcount: 3, pagi: 1, siang: 2 },
  { headcount: 4, pagi: 2, siang: 2 },
  { headcount: 5, pagi: 2, siang: 3 },
];

// ---------- Headcount rule table (dynamic rows) ----------
function addHeadcountRow(headcount = "", pagi = "", siang = "") {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="number" min="1" class="hcHeadcount" value="${headcount}" /></td>
    <td><input type="number" min="0" class="hcPagi" value="${pagi}" /></td>
    <td><input type="number" min="0" class="hcSiang" value="${siang}" /></td>
    <td><button type="button" class="btn btn-sm btn-danger hcRemove">Hapus</button></td>
  `;
  tr.querySelector(".hcRemove").addEventListener("click", () => tr.remove());
  headcountBody.appendChild(tr);
}

document.getElementById("btnAddHeadcountRow").addEventListener("click", () => addHeadcountRow());

function getHeadcountRules() {
  const rows = headcountBody.querySelectorAll("tr");
  const rules = {};
  rows.forEach((row) => {
    const headcount = row.querySelector(".hcHeadcount").value;
    const pagi = row.querySelector(".hcPagi").value;
    const siang = row.querySelector(".hcSiang").value;
    if (headcount) {
      rules[headcount] = { pagi: Number(pagi) || 0, siang: Number(siang) || 0 };
    }
  });
  return rules;
}

function loadHeadcountRules(rules) {
  headcountBody.innerHTML = "";
  const entries = rules && Object.keys(rules).length ? rules : null;
  if (entries) {
    Object.entries(rules)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([headcount, v]) => addHeadcountRow(headcount, v.pagi, v.siang));
  } else {
    DEFAULT_HEADCOUNT_RULES.forEach((r) => addHeadcountRow(r.headcount, r.pagi, r.siang));
  }
}

// ---------- Load outlets ----------
watchCollection("outlets", (items) => {
  outlets = items;
  renderTable();
}, "name");

function renderTable() {
  if (outlets.length === 0) {
    tableWrapper.innerHTML = `<div class="empty-state">Belum ada outlet. Klik "Tambah Outlet" untuk mulai.</div>`;
    return;
  }

  const rows = outlets
    .map((o) => {
      const wd = o.staffingWeekday || {};
      const we = o.staffingWeekend || {};
      return `
        <tr>
          <td><strong>${o.name}</strong></td>
          <td>${o.openTime || "-"} – ${o.closeTime || "-"}</td>
          <td>Weekday: ${wd.minPagi ?? "-"}P / ${wd.minSiang ?? "-"}S (min)<br/>Weekend: ${we.minPagi ?? "-"}P / ${we.minSiang ?? "-"}S (min)</td>
          <td>${(o.requiredPositions || []).join(", ") || "—"}</td>
          <td>
            <div class="row-actions">
              <button class="btn btn-sm" data-edit="${o.id}">Edit</button>
              <button class="btn btn-sm btn-danger" data-delete="${o.id}">Hapus</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableWrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nama Outlet</th>
          <th>Jam Operasional</th>
          <th>Min. Staffing</th>
          <th>Posisi Wajib</th>
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
  document.getElementById("outletId").value = "";
  document.getElementById("openTime").value = "08:00";
  document.getElementById("closeTime").value = "22:00";
  loadHeadcountRules(null);
}

document.getElementById("btnNewOutlet").addEventListener("click", () => {
  resetForm();
  formTitle.textContent = "Tambah Outlet";
  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
});

document.getElementById("btnCancelOutlet").addEventListener("click", () => {
  formCard.style.display = "none";
  resetForm();
});

function openEditForm(id) {
  const o = outlets.find((x) => x.id === id);
  if (!o) return;

  resetForm();
  formTitle.textContent = `Edit Outlet — ${o.name}`;
  document.getElementById("outletId").value = o.id;
  document.getElementById("name").value = o.name || "";
  document.getElementById("openTime").value = o.openTime || "08:00";
  document.getElementById("closeTime").value = o.closeTime || "22:00";
  document.getElementById("requiredPositions").value = (o.requiredPositions || []).join(", ");

  const wd = o.staffingWeekday || {};
  document.getElementById("wdMinPagi").value = wd.minPagi ?? 1;
  document.getElementById("wdMinSiang").value = wd.minSiang ?? 1;
  document.getElementById("wdIdealPagi").value = wd.idealPagi ?? 2;
  document.getElementById("wdIdealSiang").value = wd.idealSiang ?? 2;

  const we = o.staffingWeekend || {};
  document.getElementById("weMinPagi").value = we.minPagi ?? 1;
  document.getElementById("weMinSiang").value = we.minSiang ?? 2;
  document.getElementById("weIdealPagi").value = we.idealPagi ?? 2;
  document.getElementById("weIdealSiang").value = we.idealSiang ?? 3;

  loadHeadcountRules(o.staffingRuleByHeadcount);

  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth" });
}

async function handleDelete(id) {
  const o = outlets.find((x) => x.id === id);
  if (!confirm(`Hapus outlet "${o ? o.name : ""}"? Tindakan ini tidak bisa dibatalkan.`)) return;
  await deleteItem("outlets", id);
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const id = document.getElementById("outletId").value;
  const requiredPositions = document
    .getElementById("requiredPositions")
    .value.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const data = {
    name: document.getElementById("name").value.trim(),
    openTime: document.getElementById("openTime").value,
    closeTime: document.getElementById("closeTime").value,
    requiredPositions,
    staffingWeekday: {
      minPagi: Number(document.getElementById("wdMinPagi").value),
      minSiang: Number(document.getElementById("wdMinSiang").value),
      idealPagi: Number(document.getElementById("wdIdealPagi").value),
      idealSiang: Number(document.getElementById("wdIdealSiang").value),
    },
    staffingWeekend: {
      minPagi: Number(document.getElementById("weMinPagi").value),
      minSiang: Number(document.getElementById("weMinSiang").value),
      idealPagi: Number(document.getElementById("weIdealPagi").value),
      idealSiang: Number(document.getElementById("weIdealSiang").value),
    },
    staffingRuleByHeadcount: getHeadcountRules(),
  };

  if (!data.name) {
    alert("Nama outlet wajib diisi.");
    return;
  }

  try {
    if (id) {
      await updateItem("outlets", id, data);
    } else {
      await addItem("outlets", data);
    }
    formCard.style.display = "none";
    resetForm();
  } catch (err) {
    console.error(err);
    alert("Gagal menyimpan data outlet. Cek console untuk detail.");
  }
});

// initialize default rows on first load
loadHeadcountRules(null);
