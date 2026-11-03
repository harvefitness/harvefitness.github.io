// Data layer. Firebase (Google sign-in + Firestore, one private folder per user)
// or, when public/config.js has no Firebase keys yet, a local demo mode.
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut, onAuthStateChanged } from "firebase/auth";
// Firestore Lite: plain reads/writes over REST, a fraction of the full SDK's size.
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs } from "firebase/firestore/lite";

const cfg = window.APP_CONFIG || {};
export const DEMO = !cfg.firebase?.apiKey;
let app, auth, db, uid = null;
export let currentUser = null;

export function firebaseApp() {
  return app;
}

// localStorage can be unavailable (private mode, embedded previews): fall back to memory.
const mem = {};
export const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
};
let onUserCb = null;
const DEMO_USER = { uid: "demo", displayName: "Chế độ thử", email: "", photoURL: "" };

export function initStore(onUser) {
  onUserCb = onUser;
  if (DEMO) {
    const u = DEMO_USER;
    currentUser = ls.get("dnt_demo_signed") ? u : null;
    uid = currentUser ? "demo" : null;
    setTimeout(() => onUser(currentUser), 0);
    return;
  }
  app = initializeApp(cfg.firebase);
  auth = getAuth(app);
  auth.languageCode = "vi";
  db = getFirestore(app);
  onAuthStateChanged(auth, (u) => {
    const allow = cfg.allowedEmails || [];
    if (u && allow.length && !allow.map((e) => e.toLowerCase()).includes((u.email || "").toLowerCase())) {
      fbSignOut(auth);
      onUser(null, "not_allowed");
      return;
    }
    currentUser = u;
    uid = u?.uid || null;
    onUser(u);
  });
}

export async function signIn() {
  if (DEMO) {
    ls.set("dnt_demo_signed", "1");
    currentUser = DEMO_USER;
    uid = "demo";
    onUserCb(currentUser);
    return;
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) {
      await signInWithRedirect(auth, provider);
    } else throw e;
  }
}

export async function signOut() {
  if (DEMO) {
    ls.del("dnt_demo_signed");
    currentUser = null;
    uid = null;
    onUserCb(null);
    return;
  }
  await fbSignOut(auth);
}

// ---------- Demo storage ----------
const demoKey = "dnt_demo_data";
function demoAll() {
  try {
    return JSON.parse(ls.get(demoKey)) || {};
  } catch {
    return {};
  }
}
function demoSave(all) {
  ls.set(demoKey, JSON.stringify(all));
}

// ---------- Public API: users/{uid} and users/{uid}/{col}/{id} ----------
const clean = (o) => JSON.parse(JSON.stringify(o ?? {}));

export async function getProfile() {
  if (DEMO) return demoAll().profile || null;
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? s.data().profile || null : null;
}
export async function saveProfile(profile) {
  if (DEMO) {
    const a = demoAll();
    a.profile = clean(profile);
    demoSave(a);
    return;
  }
  await setDoc(doc(db, "users", uid), { profile: clean(profile), updatedAt: Date.now(), email: currentUser?.email || "" }, { merge: true });
}

export async function get(col, id) {
  if (DEMO) return demoAll()[col]?.[id] || null;
  const s = await getDoc(doc(db, "users", uid, col, id));
  return s.exists() ? s.data() : null;
}
export async function set(col, id, data) {
  if (DEMO) {
    const a = demoAll();
    (a[col] ||= {})[id] = clean(data);
    demoSave(a);
    return;
  }
  await setDoc(doc(db, "users", uid, col, id), { ...clean(data), updatedAt: Date.now() });
}
export async function del(col, id) {
  if (DEMO) {
    const a = demoAll();
    delete a[col]?.[id];
    demoSave(a);
    return;
  }
  await deleteDoc(doc(db, "users", uid, col, id));
}
/**
 * List docs whose id (YYYY-MM-DD) is in [from, to]. Returns {id: data}.
 * Reads the person's whole sub-collection (one small doc per day) and filters here:
 * no query filters means no index or rule edge cases on Firestore's side.
 */
export async function range(col, from, to) {
  let all;
  if (DEMO) all = demoAll()[col] || {};
  else {
    all = {};
    const snap = await getDocs(collection(db, "users", uid, col));
    snap.forEach((d) => (all[d.id] = d.data()));
  }
  return Object.fromEntries(Object.entries(all).filter(([k]) => (!from || k >= from) && (!to || k <= to)));
}
/** Latest n docs by id. */
export async function latest(col, n = 60) {
  const all = await range(col);
  return Object.fromEntries(Object.entries(all).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, n));
}
