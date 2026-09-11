// ============================================================
// KONFIGURASI FIREBASE — GANTI DENGAN CONFIG PROJECT BARU KAMU
// ============================================================
// Cara dapatkan config ini:
// 1. Buka https://console.firebase.google.com
// 2. Buat project baru khusus untuk scheduler ini (terpisah dari
//    project Kopi Telu Report).
// 3. Di dalam project: Project Settings > General > "Your apps"
//    > pilih ikon Web (</>) > register app > copy config di bawah.
// 4. Aktifkan Firestore Database (mode production, region terdekat
//    misalnya asia-southeast2 / Jakarta).
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBsPqtRPHuL2iBdg05pj52d0A7BXxiwLfA",
  authDomain: "kopi-telu-scheduler.firebaseapp.com",
  projectId: "kopi-telu-scheduler",
  storageBucket: "kopi-telu-scheduler.firebasestorage.app",
  messagingSenderId: "1093928599459",
  appId: "1:1093928599459:web:f64e3c82da13cd0951e416",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
