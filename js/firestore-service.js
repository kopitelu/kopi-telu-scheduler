// ============================================================
// FIRESTORE SERVICE — helper generik untuk CRUD + realtime watch
// Dipakai oleh employees.js, outlets.js, shift-templates.js, dst.
// ============================================================

import { db } from "./firebase-config.js";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Dengarkan perubahan realtime pada sebuah collection.
 * @param {string} collectionName
 * @param {(items: Array<object>) => void} callback
 * @param {string|null} orderField - field untuk sorting (opsional)
 * @returns {Function} unsubscribe function
 */
export function watchCollection(collectionName, callback, orderField = null) {
  const colRef = collection(db, collectionName);
  const q = orderField ? query(colRef, orderBy(orderField)) : colRef;

  return onSnapshot(
    q,
    (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => {
        items.push({ id: docSnap.id, ...docSnap.data() });
      });
      callback(items);
    },
    (error) => {
      console.error(`Gagal memuat ${collectionName}:`, error);
      callback([], error);
    }
  );
}

export async function addItem(collectionName, data) {
  return addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateItem(collectionName, id, data) {
  return updateDoc(doc(db, collectionName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteItem(collectionName, id) {
  return deleteDoc(doc(db, collectionName, id));
}

/**
 * Baca satu dokumen sekali (bukan realtime). Dipakai saat kita perlu
 * cek "apakah dokumen ini sudah ada?" sebelum membuat yang baru.
 */
export async function getItem(collectionName, id) {
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Buat/timpa dokumen dengan ID yang KITA tentukan sendiri (bukan auto-ID).
 * Dipakai untuk schedules & schedule_shifts supaya satu (outlet, minggu,
 * pegawai, tanggal) selalu punya ID yang sama -> gampang di-upsert tanpa
 * query dulu. merge=true supaya field lain yang tidak dikirim tidak hilang.
 */
export async function setItem(collectionName, id, data, merge = true) {
  return setDoc(
    doc(db, collectionName, id),
    { ...data, updatedAt: serverTimestamp() },
    { merge }
  );
}
