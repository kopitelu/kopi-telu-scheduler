# Kopi Telu Scheduler — Phase 1

Master data app: **Employees, Outlets, Shift Templates**. Vanilla JS + Firebase Firestore, dirancang untuk hosting di GitHub Pages (sama seperti Kopi Telu Report), tapi pakai **project Firebase baru yang terpisah**.

## Struktur File
```
kopi-telu-scheduler/
├─ index.html              (Dashboard)
├─ employees.html
├─ outlets.html
├─ shift-templates.html
├─ css/style.css
├─ js/
│  ├─ firebase-config.js   (WAJIB diisi dulu, lihat di bawah)
│  ├─ firestore-service.js
│  ├─ nav.js
│  ├─ employees.js
│  ├─ outlets.js
│  └─ shift-templates.js
└─ firestore.rules
```

## Cara Setup (sekali saja)

1. **Buat project Firebase baru** di https://console.firebase.google.com
   - Nama bebas, misalnya `kopi-telu-scheduler`.
2. **Aktifkan Firestore Database**
   - Build > Firestore Database > Create database > mode Production > region `asia-southeast2` (Jakarta) atau terdekat.
3. **Register Web App**
   - Project Settings (ikon gerigi) > General > "Your apps" > klik ikon Web `</>`.
   - Copy config yang muncul (`apiKey`, `authDomain`, dst).
4. **Isi `js/firebase-config.js`**
   - Tempel config dari langkah 3 menggantikan placeholder `GANTI_DENGAN_...`.
5. **Deploy Firestore Rules** (opsional tapi disarankan)
   - Install Firebase CLI: `npm install -g firebase-tools`
   - `firebase login`
   - `firebase init firestore` (pilih project yang baru dibuat, pakai file `firestore.rules` yang sudah ada)
   - `firebase deploy --only firestore:rules`
   - Kalau skip langkah ini, Firestore defaultnya akan menolak semua read/write (locked mode) — jadi app tidak akan bisa menyimpan data sampai rules di-deploy.
6. **Upload ke GitHub Pages**
   - Push seluruh folder ini ke repo GitHub (bisa repo baru atau branch baru di akun `kopitelu` yang sudah ada).
   - Settings > Pages > pilih branch & folder root.
   - Buka `https://<username>.github.io/<repo>/index.html`.

## Yang Sudah Bisa Dipakai (Phase 1)
- Tambah/edit/hapus **pegawai**: outlet utama, outlet tambahan, kapasitas shift Pagi/Siang, batas jam/hari kerja, preferensi & hari unavailable rutin.
- Tambah/edit/hapus **outlet**: jam operasional, staffing minimum/ideal weekday & weekend, posisi wajib, dan tabel aturan staffing berdasarkan jumlah pegawai kerja (dipakai nanti oleh Auto Scheduler).
- Tambah/edit/hapus **shift template** (PAGI/SIANG/dll.): jam mulai-selesai, break, durasi otomatis, outlet mana saja yang pakai shift ini.
- Semua data realtime (pakai Firestore `onSnapshot`) — kalau dibuka di 2 device sekaligus, perubahan langsung sinkron.

## Belum Ada di Phase 1 (menyusul di phase berikutnya)
- Login/role admin (saat ini semua orang yang tahu URL bisa edit — lihat catatan keamanan di `firestore.rules`)
- Halaman Schedule, Leave, Workload, Fairness, History, Settings (sudah ada di sidebar tapi disabled/"Segera")
- Auto Scheduler, Auto Replacement, Conflict Checker, dll. (logic sudah didesain di dokumen sebelumnya, tinggal diimplementasikan di Phase 2–8)

## Catatan Teknis
- Firestore SDK dipanggil via CDN modular v10 (`https://www.gstatic.com/firebasejs/10.12.2/...`), tidak butuh `npm install` atau build step — konsisten dengan cara Kopi Telu Report dibangun.
- Semua file JS pakai ES Modules (`type="module"`), jadi harus dibuka lewat server (GitHub Pages otomatis begini) — **tidak akan jalan** kalau file HTML dibuka langsung dari `file://` di browser (CORS module blocked). Untuk testing lokal, jalankan `npx serve` atau `python3 -m http.server` di folder ini.
