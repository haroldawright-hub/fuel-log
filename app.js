/* Fuel Log app logic */
(() => {
"use strict";
const VERSION = "6";
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = v => { const x = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")); return isFinite(x) ? x : 0; };
const r0 = v => Math.round(v || 0);
const r1 = v => Math.round((v || 0) * 10) / 10;
const fmt = v => r0(v).toLocaleString();
const uid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snacks"];
const NUTR = ["kcal", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "satFat"];
const OFF = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,generic_name,brands,serving_size,serving_quantity,nutriments";

/* ---------- dates ---------- */
const keyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
function dayLabel(k) {
  const t = todayKey();
  if (k === t) return "Today";
  if (k === addDays(t, -1)) return "Yesterday";
  if (k === addDays(t, 1)) return "Tomorrow";
  return parseKey(k).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function defaultMeal() { const d = new Date(), h = d.getHours() + d.getMinutes() / 60; return h < 10.5 ? "Breakfast" : h < 15 ? "Lunch" : h < 20.5 ? "Dinner" : "Snacks"; }

/* ---------- state & storage (this device) ---------- */
const DEFAULTS = {
  goals: { kcal: 2000, protein: 130, carbs: 220, fat: 65, fiber: 30 },
  profile: { sex: "male", age: 35, heightCm: 178, weightKg: 82, activity: 1.375, pace: 0 },
  units: "us", goalsSet: false, lastBackup: 0
};
const S = { view: "day", date: todayKey(), calMonth: todayKey().slice(0, 7), days: {}, foods: {}, settings: structuredClone(DEFAULTS) };
const LS_KEY = "fuel-log-v1";
let storageOK = true;
function load() {
  try { const j = JSON.parse(localStorage.getItem(LS_KEY) || "null"); if (j) { S.days = j.days || {}; S.foods = j.foods || {}; S.settings = j.settings || S.settings; } }
  catch { storageOK = false; }
}
function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, days: S.days, foods: S.foods, settings: S.settings })); storageOK = true; }
  catch { storageOK = false; toast("Couldn't save. Your phone's storage for this app may be full."); }
}
const settings = () => ({ ...DEFAULTS, ...S.settings, goals: { ...DEFAULTS.goals, ...(S.settings.goals || {}) }, profile: { ...DEFAULTS.profile, ...(S.settings.profile || {}) } });
const entriesOf = k => (S.days[k] && Array.isArray(S.days[k].entries)) ? S.days[k].entries : [];
function totals(list) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0 };
  for (const e of list) { const q = e.qty == null ? 1 : num(e.qty); for (const k in t) t[k] += num(e[k]) * q; }
  return t;
}
function saveDay(k, entries) { const d = { ...S.days }; if (entries.length) d[k] = { entries, updated: Date.now() }; else delete d[k]; S.days = d; persist(); }
function saveFood(id, food) { S.foods = { ...S.foods, [id]: food }; persist(); }
function deleteFood(id) { const f = { ...S.foods }; delete f[id]; S.foods = f; persist(); }
function saveSettings(next) { S.settings = next; persist(); }

/* ---------- backup ---------- */
async function exportData() {
  const json = JSON.stringify({ app: "fuel-log", v: 1, exported: new Date().toISOString(), days: S.days, foods: S.foods, settings: S.settings });
  const name = `fuel-log-backup-${todayKey()}.json`;
  let file = new File([json], name, { type: "application/json" });
  const done = () => { saveSettings({ ...settings(), lastBackup: Date.now() }); render(); toast("Backup saved"); };
  // Chrome on Android won't share .json files, but will share .txt, which opens the share sheet (Drive, etc.).
  const canShare = f => { try { return !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch { return false; } };
  const diag = { share: typeof navigator.share === "function", canShare: typeof navigator.canShare === "function", json: canShare(file), txt: false, err: "" };
  // Android Chrome's canShare says yes to .json but share() then rejects it ("Permission denied"), so use .txt there.
  if (!diag.json || /Android/i.test(navigator.userAgent)) { const txt = new File([json], name.replace(/\.json$/, ".txt"), { type: "text/plain" }); diag.txt = canShare(txt); if (diag.txt) file = txt; }
  if (canShare(file)) {
    try { await navigator.share({ files: [file], title: "Fuel Log backup" }); done(); return; }
    catch (e) { if (e && e.name === "AbortError") return; diag.err = (e && (e.name + ": " + e.message)) || "unknown"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  saveSettings({ ...settings(), lastBackup: Date.now() }); render();
  const yn = b => b ? "yes" : "no";
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Backup</div><h2>Saved to Downloads</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <p class="muted">This browser didn't open the share sheet, so the file was downloaded instead. To put it in Google Drive, open the Files app, long-press the backup file, and choose Share → Drive.</p>
    <p class="note">Details: share ${yn(diag.share)} · canShare ${yn(diag.canShare)} · json ${yn(diag.json)} · txt ${yn(diag.txt)}${diag.err ? " · " + esc(diag.err) : ""} · v${VERSION}</p>
    <div class="btnrow"><button class="btn primary" data-close>OK</button></div>`);
}
let pendingImport = null;
$("#jsonIn").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (j.app !== "fuel-log" || typeof j.days !== "object") throw 0;
    pendingImport = j;
    const nDays = Object.keys(j.days).length, nFoods = Object.keys(j.foods || {}).length;
    openSheet(`<div class="sheet-head"><div><div class="eyebrow">Restore</div><h2>Merge this backup?</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <p class="muted">Backup from ${esc(new Date(j.exported).toLocaleString())}: ${nDays} logged days and ${nFoods} saved foods. Entries are merged with what's already on this phone, so nothing here is deleted.</p>
      <div class="btnrow"><button class="btn" data-close>Cancel</button><button class="btn primary" data-act="do-import">Merge backup</button></div>`);
  } catch { toast("That file isn't a Fuel Log backup."); }
});
function doImport() {
  const j = pendingImport; pendingImport = null; if (!j) return;
  // Only accept well-formed records: real date keys, plain-object entries, safe ids.
  const isObj = o => o && typeof o === "object" && !Array.isArray(o);
  const safeId = s => typeof s === "string" && /^[A-Za-z0-9_\-]{1,40}$/.test(s);
  const cleanEntry = e => isObj(e) && safeId(e.id) ? { ...strip(cleanItem(e)), id: e.id, meal: MEALS.includes(e.meal) ? e.meal : "Snacks", src: String(e.src || "").slice(0, 20), foodId: safeId(e.foodId) ? e.foodId : null, t: num(e.t) } : null;
  const days = { ...S.days };
  for (const [k, d] of Object.entries(isObj(j.days) ? j.days : {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(d) || !Array.isArray(d.entries)) continue;
    const have = entriesOf(k), ids = new Set(have.map(e => e.id));
    const merged = have.concat(d.entries.map(cleanEntry).filter(e => e && !ids.has(e.id)));
    if (merged.length) days[k] = { entries: merged, updated: Date.now() };
  }
  const foods = { ...S.foods };
  for (const [id, f] of Object.entries(isObj(j.foods) ? j.foods : {})) {
    if (!safeId(id) || !isObj(f)) continue;
    const food = { ...strip(cleanItem(f)), qty: 1, barcode: f.barcode ? normCode(f.barcode) : null, uses: num(f.uses), lastUsed: num(f.lastUsed) };
    if (isObj(f.per100)) { food.per100 = {}; for (const k of NUTR) food.per100[k] = num(f.per100[k]); food.grams = num(f.grams) || 100; }
    if (!foods[id] || food.lastUsed > (foods[id].lastUsed || 0)) foods[id] = food;
  }
  S.days = days; S.foods = foods;
  if (isObj(j.settings) && j.settings.goalsSet && !settings().goalsSet && isObj(j.settings.goals)) {
    const g = {}; for (const k of Object.keys(DEFAULTS.goals)) g[k] = num(j.settings.goals[k]) || DEFAULTS.goals[k];
    S.settings = { ...settings(), goals: g, goalsSet: true };
  }
  persist(); closeSheet(); render(); toast("Backup merged");
}

/* ---------- Open Food Facts ---------- */
async function offProduct(code) {
  const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  return j && j.status === 1 && j.product ? j.product : null;
}
const searchCache = new Map();
async function offSearch(q, signal) {
  const key = q.toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key);
  const url = `${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&tagtype_0=countries&tag_contains_0=contains&tag_0=united-states&fields=${OFF_FIELDS}`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { signal });
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json();
      const out = (j.products || []).map(fromOFF).filter(Boolean);
      searchCache.set(key, out);
      return out;
    } catch (e) {
      if (signal && signal.aborted) throw e;
      lastErr = e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}
function scaleFrom(per100, grams) { const o = {}; for (const k of NUTR) o[k] = (per100[k] || 0) * grams / 100; return o; }
function fromOFF(p) {
  const n = p.nutriments || {};
  const g = k => (n[k] == null || n[k] === "") ? null : num(n[k]);
  const kcal100 = g("energy-kcal_100g") ?? (g("energy_100g") != null ? g("energy_100g") / 4.184 : null);
  const per100 = kcal100 == null ? null : { kcal: kcal100, protein: g("proteins_100g") || 0, carbs: g("carbohydrates_100g") || 0, fat: g("fat_100g") || 0, fiber: g("fiber_100g") || 0, sugar: g("sugars_100g") || 0, sodium: (g("sodium_100g") || 0) * 1000, satFat: g("saturated-fat_100g") || 0 };
  const sq = num(p.serving_quantity);
  let vals, serving, grams = null;
  if (per100 && sq > 0) { vals = scaleFrom(per100, sq); serving = p.serving_size || `${r1(sq)} g`; grams = sq; }
  else if (g("energy-kcal_serving") != null) {
    vals = { kcal: g("energy-kcal_serving"), protein: g("proteins_serving") || 0, carbs: g("carbohydrates_serving") || 0, fat: g("fat_serving") || 0, fiber: g("fiber_serving") || 0, sugar: g("sugars_serving") || 0, sodium: (g("sodium_serving") || 0) * 1000, satFat: g("saturated-fat_serving") || 0 };
    serving = p.serving_size || "1 serving";
  }
  else if (per100) { vals = scaleFrom(per100, 100); serving = "100 g"; grams = 100; }
  else return null;
  const name = (p.product_name || p.generic_name || "").trim();
  if (!name) return null;
  return cleanItem({ ...vals, name, brand: String(p.brands || "").split(",")[0].trim(), serving }, { per100: per100 || null, grams, barcode: p.code || null });
}
function fromCommon(row) {
  const [name, s, g, kcal, protein, carbs, fat, fiber] = row;
  const vals = { kcal, protein, carbs, fat, fiber };
  const per100 = {}; for (const k of NUTR) per100[k] = (vals[k] || 0) * 100 / g;
  return cleanItem({ ...vals, name, serving: `${s} (${r1(g)} g)` }, { per100, grams: g, common: true });
}

/* ---------- barcode ---------- */
const normCode = c => { c = String(c || "").replace(/\D/g, ""); return c.length === 12 ? "0" + c : c; };
function zxHints() {
  const Z = window.ZXing, hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E]);
  hints.set(Z.DecodeHintType.TRY_HARDER, true);
  return hints;
}
async function canvasFrom(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
async function decodeBarcodePhoto(file) {
  const canvas = await canvasFrom(file);
  if ("BarcodeDetector" in window) {
    try { const r = await new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(canvas); if (r[0]) return r[0].rawValue; } catch {}
  }
  if (window.ZXing) {
    const Z = window.ZXing, hints = zxHints(), reader = new Z.MultiFormatReader(); reader.setHints(hints);
    for (const scale of [1, 0.6]) {
      let c = canvas;
      if (scale !== 1) { c = document.createElement("canvas"); c.width = canvas.width * scale; c.height = canvas.height * scale; c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height); }
      try { const res = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))), hints); if (res) return res.getText(); } catch {}
    }
  }
  return null;
}
let scan = null;
function stopScan() { if (scan) { const s = scan; scan = null; try { s.stop(); } catch {} } }
async function startScan(video, msg) {
  const onCode = code => { if (!scan) return; stopScan(); if (navigator.vibrate) navigator.vibrate(60); lookupBarcode(normCode(code)); };
  try {
    let native = false;
    if ("BarcodeDetector" in window) { try { native = (await BarcodeDetector.getSupportedFormats()).includes("ean_13"); } catch {} }
    if (native) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      let alive = true;
      scan = { stop() { alive = false; stream.getTracks().forEach(t => t.stop()); } };
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const loop = async () => { if (!alive) return; try { const r = await det.detect(video); if (r[0]) { onCode(r[0].rawValue); return; } } catch {} setTimeout(loop, 150); };
      loop();
    } else {
      if (!window.ZXing) await new Promise(r => setTimeout(r, 1200));
      if (!window.ZXing) throw new Error("scanner library not loaded");
      const reader = new window.ZXing.BrowserMultiFormatReader(zxHints(), 250);
      scan = { stop() { reader.reset(); } };
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, res => { if (res) onCode(res.getText()); });
    }
  } catch (e) {
    stopScan();
    if (msg) msg.textContent = (e && e.name === "NotAllowedError") ? "Camera access is off for this app. Allow it in your browser settings, or take a photo or type the number below." : "The live camera isn't available here. Take a photo of the barcode or type the number below.";
  }
}
async function lookupBarcode(code) {
  if (!code || code.length < 8) { toast("That barcode number looks too short."); return; }
  const local = S.foods[code] ? { ...S.foods[code], id: code } : Object.entries(S.foods).map(([id, f]) => ({ ...f, id })).find(f => normCode(f.barcode) === code);
  if (local) { openReview({ src: "barcode", items: [cleanItem(local, { foodId: local.id, per100: local.per100, grams: local.grams })], barcode: code }); return; }
  working("Looking up barcode…", code);
  try {
    const p = await offProduct(code);
    if ($("#sheet").hidden) return;
    const it = p && fromOFF(p);
    if (it) { openReview({ src: "off", items: [it], barcode: code, saveFoods: true }); return; }
    notFound(code, "This product isn't in the Open Food Facts database yet.");
  } catch {
    if ($("#sheet").hidden) return;
    notFound(code, navigator.onLine ? "Couldn't reach the product database right now." : "You're offline, so the product database can't be checked.");
  }
}
function notFound(code, why) {
  S.pendingBarcode = code;
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Barcode ${esc(code)}</div><h2>Product not found</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <p class="muted">${esc(why)} Scan its Nutrition Facts label once and it's saved to this barcode, so the next scan logs it instantly.</p>
    <div class="stack" style="margin-top:16px">
      <button class="btn primary block" data-act="label-for">${I.label} Scan the nutrition label</button>
      <button class="btn block" data-act="manual-for">Type it in by hand</button></div>`);
}

/* ---------- label OCR (on-device) ---------- */
let ocrWorker = null, ocrProgress = null;
function loadScript(src, integrity) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; } s.onload = res; s.onerror = rej; document.head.append(s); }); }
async function getOCR() {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js", "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F");
  ocrWorker = await window.Tesseract.createWorker("eng", 1, { logger: m => ocrProgress && ocrProgress(m) });
  return ocrWorker;
}
async function prepForOCR(file) {
  const c = await canvasFrom(file, 2200), ctx = c.getContext("2d");
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let lo = 255, hi = 0; const lum = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; lum[j] = y; }
  const sorted = Array.from(lum.filter((_, i) => i % 50 === 0)).sort((a, b) => a - b);
  lo = sorted[Math.floor(sorted.length * 0.02)] || 0; hi = sorted[Math.floor(sorted.length * 0.98)] || 255; if (hi - lo < 40) { lo = 0; hi = 255; }
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { const v = Math.max(0, Math.min(255, (lum[j] - lo) * 255 / (hi - lo))); d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return c;
}
function parseLabel(raw) {
  const flat = raw.replace(/\s+/g, " ").toLowerCase();
  const orig = raw.replace(/\s+/g, " ");
  const N = "(<?\\s*\\d[\\do]*(?:[.,]\\d+)?)\\s*(mg|g|9)?";
  const fixNum = s => parseFloat(s.replace(/o/g, "0").replace(",", ".").replace(/[<\s]/g, ""));
  const grab = pats => { for (const p of pats) { const m = flat.match(new RegExp(p + "\\s*[:\\-]?\\s*" + N)); if (m) return m; } return null; };
  const cands = m => {
    if (!m) return null;
    const rawN = m[1].replace(/\s/g, ""), unit = m[2] || "", v = fixNum(rawN);
    const out = [{ v, alt: false }];
    if (!unit && /\d9$/.test(rawN.replace(/[.,]\d+$/, "")) && !/[.,]/.test(rawN)) out.push({ v: fixNum(rawN.slice(0, -1)), alt: true });
    return out;
  };
  const res = { flags: [] };
  let km = flat.match(/calories(?! from)(?:\s*per\s*serving)?\s*[:\-]?\s*(\d[\do]{0,3})\b/) || flat.match(/(\d{2,4})\s*kcal/);
  res.kcal = km ? fixNum(km[1]) : null;
  const macro = {
    protein: cands(grab(["protein"])),
    carbs: cands(grab(["total\\s*carb\\w*\\.?", "carbohydrates?", "carbs?\\.?"])),
    fat: cands(grab(["total\\s*fat", "\\bfat"]))
  };
  // pick the combination of readings that best matches the calories (fixes "3g" misread as "39")
  const keys = Object.keys(macro).filter(k => macro[k]);
  let best = null;
  const combos = [[]];
  for (const k of keys) { const next = []; for (const c of combos) for (const o of macro[k]) next.push([...c, [k, o]]); combos.splice(0, combos.length, ...next); }
  for (const c of combos) {
    const o = Object.fromEntries(c.map(([k, x]) => [k, x.v]));
    const calc = 4 * (o.protein || 0) + 4 * (o.carbs || 0) + 9 * (o.fat || 0);
    const err = res.kcal ? Math.abs(calc - res.kcal) / Math.max(res.kcal, 1) : c.filter(([, x]) => x.alt).length;
    const alts = c.filter(([, x]) => x.alt).length;
    if (!best || err < best.err - 0.02 || (Math.abs(err - best.err) <= 0.02 && alts < best.alts)) best = { c, err, alts };
  }
  for (const [k, x] of (best ? best.c : [])) { res[k] = x.v; if (x.alt) res.flags.push(k); }
  for (const k of ["protein", "carbs", "fat"]) if (res[k] == null) res.flags.push(k);
  if (res.kcal == null) res.flags.push("kcal");
  if (best && res.kcal && best.err > 0.2) res.flags.push("kcal", "protein", "carbs", "fat");
  const minor = (k, pats, max) => {
    const c = cands(grab(pats)); if (!c) return;
    let pick = c[0];
    if (max != null && pick.v > max && c[1]) pick = c[1];
    res[k] = pick.v; if (pick.alt || (max != null && pick.v > max)) res.flags.push(k);
  };
  minor("fiber", ["dietary\\s*fib(?:er|re)", "fib(?:er|re)"], res.carbs);
  minor("sugar", ["total\\s*sugars?", "sugars?"], res.carbs);
  minor("satFat", ["sat\\w*\\.?\\s*fat"], res.fat);
  const sm = flat.match(/sodium\s*[:\-]?\s*(\d[\d,o]*(?:\.\d+)?)\s*(mg|g)?/);
  if (sm) { let v = fixNum(sm[1].replace(/,/g, "")); if (sm[2] === "g") v *= 1000; res.sodium = v; }
  const ss = orig.match(/serving\s*size\s*[:\-]?\s*(.{1,40}?\(\s*\d+(?:\.\d+)?\s*(?:g|ml|mL)?\s*\))/i) || orig.match(/serving\s*size\s*[:\-]?\s*(.{1,28}?)(?=\s+(?:\w*ount|calories|servings|per container|%)|$)/i);
  // "(559)" is how the scanner often reads "(55g)"
  res.serving = ss ? ss[1].trim().replace(/\((\d+(?:\.\d+)?)\s*9\s*\)/, "($1g)").replace(/\((\d+(?:\.\d+)?)\)/, "($1g)") : "";
  const sp = orig.match(/(?:about\s*)?(\d+(?:\.\d+)?)\s*servings?\s*per\s*container/i) || orig.match(/servings?\s*per\s*container\s*[:\-]?\s*(?:about\s*)?(\d+(?:\.\d+)?)/i);
  res.servingsPer = sp ? num(sp[1]) : null;
  res.flags = [...new Set(res.flags)];
  res.found = ["kcal", "protein", "carbs", "fat"].filter(k => res[k] != null).length;
  return res;
}
function flowLabel(barcode) {
  pickPhoto(async file => {
    openSheet(`<div class="working"><div class="spinner"></div><h2>Reading the label…</h2><p class="muted" id="ocrMsg">${ocrWorker ? "Recognizing text" : "Getting the text reader ready. The first time takes a little longer."}</p><div class="progress"><span id="ocrBar"></span></div><button class="btn ghost" data-close style="margin-top:14px">Cancel</button></div>`);
    let cancelled = false; sheetCleanup = () => { cancelled = true; };
    ocrProgress = m => {
      const bar = $("#ocrBar"), msg = $("#ocrMsg"); if (!bar) return;
      if (m.status === "recognizing text") { bar.style.width = r0(m.progress * 100) + "%"; if (msg) msg.textContent = "Recognizing text"; }
      else if (/load/.test(m.status) && msg) msg.textContent = "Getting the text reader ready. The first time takes a little longer.";
    };
    try {
      const [worker, canvas, thumb] = await Promise.all([getOCR(), prepForOCR(file), thumbOf(file)]);
      const { data } = await worker.recognize(canvas);
      if (cancelled) return;
      const p = parseLabel(data.text || "");
      if (p.found < 2) {
        errorSheet("Couldn't read that label", "Make sure the Nutrition Facts panel is flat, in focus and fills most of the photo, with no glare.", () => flowLabel(barcode));
        return;
      }
      const it = cleanItem({ name: "", serving: p.serving, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat, fiber: p.fiber, sugar: p.sugar, sodium: p.sodium, satFat: p.satFat }, { flags: p.flags });
      const notes = [p.servingsPer ? `About ${r1(p.servingsPer)} servings per container.` : "", "Name it so you can find it later."].filter(Boolean).join(" ");
      openReview({ src: "label", items: [it], barcode: barcode || null, saveFoods: true, thumb, notes, warn: p.flags.length ? "Check the highlighted numbers against the label. Text recognition can misread small print." : "", rawText: data.text });
    } catch (e) {
      if (cancelled) return;
      errorSheet("Couldn't read that label", navigator.onLine || ocrWorker ? "The text reader hit a problem. Try again, or type the numbers in." : "The text reader downloads once (about 10 MB) and needs a connection the first time.", () => flowLabel(barcode));
    } finally { ocrProgress = null; }
  });
}
async function thumbOf(file) { try { const c = await canvasFrom(file, 900); return c.toDataURL("image/jpeg", 0.8); } catch { return ""; } }

/* ---------- photo input ---------- */
let photoCb = null, useLibrary = false;
function pickPhoto(cb) { photoCb = cb; const el = useLibrary ? $("#fileIn") : $("#camIn"); el.value = ""; el.click(); }
for (const id of ["#camIn", "#fileIn"]) $(id).addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f && photoCb) { const cb = photoCb; photoCb = null; cb(f); } });

/* ---------- toast ---------- */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2800); }

/* ---------- sheets ---------- */
let sheetCleanup = null;
function openSheet(html, onMount) {
  if (sheetCleanup) { const c = sheetCleanup; sheetCleanup = null; c(); }
  const root = $("#sheet");
  root.innerHTML = `<div class="scrim" data-close></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  root.hidden = false; document.body.classList.add("locked");
  onMount && onMount(root.querySelector(".sheet"));
}
function closeSheet() {
  if (sheetCleanup) { const c = sheetCleanup; sheetCleanup = null; c(); }
  stopScan(); if (searchCtl) searchCtl.abort();
  $("#sheet").hidden = true; $("#sheet").innerHTML = ""; document.body.classList.remove("locked");
}
function working(title, sub) { openSheet(`<div class="working"><div class="spinner"></div><h2>${esc(title)}</h2><p class="muted">${esc(sub || "")}</p><button class="btn ghost" data-close>Cancel</button></div>`); }
function errorSheet(title, msg, retry) {
  openSheet(`<div class="sheet-head"><div><h2>${esc(title)}</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <p class="muted">${esc(msg)}</p>
    <div class="stack" style="margin-top:16px">${retry ? `<button class="btn primary block" data-act="retry">Try again</button>` : ""}<button class="btn block" data-act="manual">Enter it by hand</button></div>`,
    el => { const b = el.querySelector('[data-act="retry"]'); if (b) b.onclick = retry; });
}

/* ---------- icons ---------- */
const I = {
  barcode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7V5h3M17 5h3v2M20 17v2h-3M7 19H4v-2M7 9v6M10 9v6M13 9v6M16 9v6"/></svg>`,
  label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 10.5h8M8 14h5M8 17h6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/></svg>`,
  quick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>`,
  prev: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>`,
  next: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>`
};

/* ---------- header & banners ---------- */
function renderTop() {
  $("#top").innerHTML = S.view === "day"
    ? `<div class="brand"><i></i>Fuel Log</div><div class="datenav"><button data-act="day-prev" aria-label="Previous day">${I.prev}</button><button class="lbl" data-act="day-today">${esc(dayLabel(S.date))}</button><button data-act="day-next" aria-label="Next day">${I.next}</button></div>`
    : `<div class="brand"><i></i>Fuel Log</div>`;
  document.querySelectorAll(".tabbar a").forEach(a => { if (a.dataset.view === S.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function banners() {
  let h = "";
  if (!storageOK) h += `<div class="banner warn">This browser isn't letting the app save. Private browsing blocks storage; open it in a normal tab.</div>`;
  const st = settings(), loggedDays = Object.keys(S.days).length;
  if (loggedDays >= 5 && Date.now() - (st.lastBackup || 0) > 14 * 864e5) h += `<div class="banner">Your log lives only on this phone. Save a backup now and then.<button class="btn ghost" data-act="backup">Back up</button></div>`;
  return h;
}

/* ---------- day view ---------- */
function ringSVG(pct, over) {
  const R = 54, C = 2 * Math.PI * R, p = Math.min(pct, 1);
  return `<svg viewBox="0 0 132 132" aria-hidden="true"><circle cx="66" cy="66" r="${R}" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
    <circle cx="66" cy="66" r="${R}" fill="none" stroke="${over ? "var(--over)" : "var(--accent)"}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${(C * p).toFixed(1)} ${C.toFixed(1)}"/></svg>`;
}
function macroBlock(label, color, have, goal) {
  const pct = goal ? Math.min(100, have / goal * 100) : 0;
  return `<div class="macro"><div class="row">${label}<b>${fmt(have)}g</b></div><div class="bar"><span style="width:${pct}%;background:${color}"></span></div><div class="of">of ${fmt(goal)}g · ${have > goal ? fmt(have - goal) + "g over" : fmt(goal - have) + "g left"}</div></div>`;
}
function entryRow(e) {
  const q = e.qty == null ? 1 : num(e.qty);
  return `<button class="entry" data-act="edit-entry" data-id="${esc(e.id)}">
    <div class="main"><div class="nm">${esc(e.name)}</div>
    <div class="sub">${q !== 1 ? `<span>${r1(q)} × ${esc(e.serving || "serving")}</span>` : e.serving ? `<span>${esc(e.serving)}</span>` : ""}<span class="p">P ${fmt(num(e.protein) * q)}</span><span class="c">C ${fmt(num(e.carbs) * q)}</span><span class="f">F ${fmt(num(e.fat) * q)}</span></div></div>
    <div class="k">${fmt(num(e.kcal) * q)}</div></button>`;
}
function renderDay() {
  const st = settings(), g = st.goals, list = entriesOf(S.date), t = totals(list);
  const left = g.kcal - t.kcal, over = left < 0;
  let h = banners();
  if (!st.goalsSet) h += `<div class="banner">Your target is the 2,000 kcal default.<button class="btn ghost" data-act="go-goals">Set goals</button></div>`;
  h += `<section class="card"><div class="summary">
      <div class="ring">${ringSVG(g.kcal ? t.kcal / g.kcal : 0, over)}<div class="center"><div class="big">${fmt(Math.abs(left))}</div><div class="small">${over ? "kcal over" : "kcal left"}</div></div></div>
      <dl class="kv"><dt>Eaten</dt><dd>${fmt(t.kcal)}</dd><dt>Target</dt><dd>${fmt(g.kcal)}</dd><dt>Fiber</dt><dd>${fmt(t.fiber)} / ${fmt(g.fiber)}g</dd></dl>
    </div>
    <div class="macros">${macroBlock("Protein", "var(--pro)", t.protein, g.protein)}${macroBlock("Carbs", "var(--carb)", t.carbs, g.carbs)}${macroBlock("Fat", "var(--fat)", t.fat, g.fat)}</div>
  </section>`;
  if (!list.length) {
    h += `<section class="card empty" style="margin-top:14px"><h2>Nothing logged ${S.date === todayKey() ? "yet today" : "for this day"}</h2>
      <p>Scan a barcode or nutrition label, or search for a food.</p>
      <button class="btn primary" data-act="open-add">Add food</button></section>`;
  } else {
    h += `<div class="stack" style="margin-top:14px">`;
    for (const m of MEALS) {
      const es = list.filter(e => (e.meal || "Snacks") === m);
      h += `<section class="card"><div class="meal-head"><h3>${m}</h3><span class="kc">${es.length ? fmt(totals(es).kcal) + " kcal" : ""}</span><button class="add-mini" data-act="open-add" data-meal="${m}" aria-label="Add to ${m}">+</button></div>
        ${es.length ? es.map(entryRow).join("") : `<div class="meal-empty">Nothing yet</div>`}</section>`;
    }
    h += `</div>`;
  }
  $("#main").innerHTML = h;
}

/* ---------- calendar ---------- */
function dayStatus(k) {
  const l = entriesOf(k); if (!l.length) return "";
  const p = totals(l).kcal / (settings().goals.kcal || 2000);
  return p < 0.85 ? "under" : p <= 1.1 ? "on" : "over";
}
function renderCalendar() {
  const [y, m] = S.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1), dim = new Date(y, m, 0).getDate(), lead = first.getDay(), tk = todayKey();
  let cells = ["S", "M", "T", "W", "T", "F", "S"].map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < lead; i++) cells += `<div class="day out"></div>`;
  const monthKeys = [];
  for (let d = 1; d <= dim; d++) {
    const k = keyOf(new Date(y, m - 1, d)), st = dayStatus(k), l = entriesOf(k), kc = totals(l).kcal;
    if (l.length) monthKeys.push(k);
    cells += `<button class="day ${st ? "st-" + st : ""} ${k > tk ? "future" : ""} ${k === tk ? "today" : ""} ${k === S.date ? "sel" : ""}" data-act="cal-day" data-k="${k}" aria-label="${parseKey(k).toDateString()}${l.length ? ", " + fmt(kc) + " kcal" : ""}">
      <span class="d">${d}</span><span class="kc">${l.length ? fmt(kc) : ""}</span></button>`;
  }
  const g = settings().goals, n = monthKeys.length;
  const sums = monthKeys.map(k => totals(entriesOf(k)));
  const avg = f => n ? sums.reduce((a, s) => a + s[f], 0) / n : 0;
  const onT = monthKeys.filter(k => dayStatus(k) === "on").length;
  const label = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("#main").innerHTML = banners() + `<section class="card"><div class="cal-head"><h2>${esc(label)}</h2>
      <div class="datenav"><button data-act="cal-prev" aria-label="Previous month">${I.prev}</button><button data-act="cal-next" aria-label="Next month">${I.next}</button></div></div>
    <div class="cal">${cells}</div>
    <div class="legend"><span><i style="background:var(--on)"></i>Within 85–110% of target</span><span><i style="background:var(--under)"></i>Under</span><span><i style="background:var(--over)"></i>Over</span></div></section>
  <h3 style="margin:20px 0 10px">${esc(first.toLocaleDateString(undefined, { month: "long" }))}</h3>
  <div class="stats">
    <div class="stat"><b>${n}</b><span>days logged</span></div>
    <div class="stat"><b>${onT}</b><span>days on target</span></div>
    <div class="stat"><b>${n ? fmt(avg("kcal")) : "–"}</b><span>avg kcal / day</span></div>
    <div class="stat"><b>${n ? fmt(avg("protein")) + "g" : "–"}</b><span>avg protein / day</span></div>
  </div>
  <section class="card chart" style="margin-top:14px"><h3>Last 14 days</h3><p class="note" style="margin:2px 0 10px">Calories per day. The dashed line is your ${fmt(g.kcal)} kcal target.</p>${chart14()}</section>`;
}
function chart14() {
  const tk = todayKey(), g = settings().goals.kcal || 2000;
  const days = Array.from({ length: 14 }, (_, i) => addDays(tk, i - 13));
  const vals = days.map(k => totals(entriesOf(k)).kcal);
  const max = Math.max(g * 1.25, ...vals) || 1;
  const W = 340, H = 150, padL = 34, padB = 20, padT = 8, iw = W - padL - 4, ih = H - padB - padT, bw = iw / 14;
  const y = v => padT + ih - (v / max) * ih;
  const step = max > 3000 ? 1000 : 500;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories for the last 14 days">`;
  for (let t = 0; t <= max; t += step) s += `<line x1="${padL}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${padL - 6}" y="${y(t) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--ink-3)">${t >= 1000 ? (t / 1000) + "k" : t}</text>`;
  days.forEach((k, i) => {
    const v = vals[i], x = padL + i * bw + bw * 0.18, w = bw * 0.64, st = dayStatus(k);
    const col = st === "over" ? "var(--over)" : st === "on" ? "var(--on)" : "var(--under)";
    if (v > 0) s += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(padT + ih - y(v)).toFixed(1)}" rx="3" fill="${col}"><title>${dayLabel(k)}: ${fmt(v)} kcal</title></rect>`;
    if (i % 2 === 1) s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="${i === 13 ? "var(--ink)" : "var(--ink-3)"}">${parseKey(k).getDate()}</text>`;
  });
  s += `<line x1="${padL}" x2="${W - 4}" y1="${y(g)}" y2="${y(g)}" stroke="var(--ink-2)" stroke-width="1.2" stroke-dasharray="4 3"/></svg>`;
  return s;
}

/* ---------- goals & data ---------- */
const ACT = [[1.2, "Mostly sitting (desk job, little exercise)"], [1.375, "Lightly active (exercise 1–3 days/week)"], [1.55, "Active (exercise 3–5 days/week)"], [1.725, "Very active (hard training 6–7 days/week)"], [1.9, "Athlete (twice-a-day training or physical job)"]];
const PACE = [[-750, "Lose about 1.5 lb a week"], [-500, "Lose about 1 lb a week"], [-250, "Lose about 0.5 lb a week"], [0, "Maintain weight"], [250, "Gain about 0.5 lb a week"]];
let G = null;
function calc(p) {
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "female" ? -161 : 5);
  const tdee = bmr * p.activity, floor = p.sex === "female" ? 1200 : 1500;
  const kcal = Math.max(floor, Math.round((tdee + p.pace) / 10) * 10);
  const protein = Math.round(p.weightKg * (p.pace < 0 ? 2.0 : 1.6));
  const fat = Math.round(kcal * 0.28 / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { bmr, tdee, kcal, protein, fat, carbs, fiber: Math.round(kcal / 1000 * 14), floored: tdee + p.pace < floor };
}
function calcOut(c) {
  return `<div><b>${fmt(c.bmr)}</b><span>resting burn (kcal)</span></div><div><b>${fmt(c.tdee)}</b><span>daily burn with activity</span></div>
    <div><b>${fmt(c.kcal)}</b><span>suggested target${c.floored ? " (safe minimum)" : ""}</span></div><div><b>${c.protein} / ${c.carbs} / ${c.fat}</b><span>protein / carbs / fat (g)</span></div>`;
}
function renderGoals() {
  const st = settings();
  if (!G) G = { profile: { ...st.profile }, goals: { ...st.goals }, units: st.units };
  const p = G.profile, us = G.units === "us", c = calc(p);
  const ft = Math.floor(p.heightCm / 2.54 / 12), inch = Math.round(p.heightCm / 2.54 - ft * 12);
  const g = G.goals, gk = num(g.kcal) || 1;
  const pp = num(g.protein) * 4 / gk * 100, cp = num(g.carbs) * 4 / gk * 100, fp = num(g.fat) * 9 / gk * 100;
  const days = Object.keys(S.days).length, foods = Object.keys(S.foods).length;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("#main").innerHTML = banners() + `
  <section class="card">
    <div class="eyebrow">Daily targets</div><h2 style="margin:2px 0 14px">What you're aiming for</h2>
    <div class="form">
      <label class="full">Calories (kcal)<input id="g-kcal" inputmode="numeric" value="${r0(g.kcal)}"></label>
      <label>Protein (g)<input id="g-protein" inputmode="numeric" value="${r0(g.protein)}"></label>
      <label>Carbs (g)<input id="g-carbs" inputmode="numeric" value="${r0(g.carbs)}"></label>
      <label>Fat (g)<input id="g-fat" inputmode="numeric" value="${r0(g.fat)}"></label>
      <label>Fiber (g)<input id="g-fiber" inputmode="numeric" value="${r0(g.fiber)}"></label>
    </div>
    <div class="split" aria-hidden="true"><span style="width:${Math.min(pp, 100)}%;background:var(--pro)"></span><span style="width:${Math.min(cp, 100)}%;background:var(--carb)"></span><span style="width:${Math.min(fp, 100)}%;background:var(--fat)"></span></div>
    <p class="note">Protein ${r0(pp)}% · Carbs ${r0(cp)}% · Fat ${r0(fp)}% of calories${Math.abs(pp + cp + fp - 100) > 6 ? `. Your macros add up to ${fmt(num(g.protein) * 4 + num(g.carbs) * 4 + num(g.fat) * 9)} kcal.` : ""}</p>
    <button class="btn primary block" style="margin-top:14px" data-act="save-goals">Save targets</button>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="eyebrow">Calculator</div><h2 style="margin:2px 0 4px">Work out a starting point</h2>
    <p class="muted" style="margin:0 0 14px;font-size:13.5px">Uses the Mifflin–St Jeor equation for resting burn, multiplied by your activity level.</p>
    <div class="form">
      <label class="full">Units<div class="seg"><button data-act="units" data-u="us" aria-pressed="${us}">lb / ft</button><button data-act="units" data-u="metric" aria-pressed="${!us}">kg / cm</button></div></label>
      <label class="full">Sex<div class="seg"><button data-act="sex" data-s="male" aria-pressed="${p.sex === "male"}">Male</button><button data-act="sex" data-s="female" aria-pressed="${p.sex === "female"}">Female</button></div></label>
      <label>Age<input id="p-age" inputmode="numeric" value="${r0(p.age)}"></label>
      <label>Weight (${us ? "lb" : "kg"})<input id="p-wt" inputmode="decimal" value="${us ? r0(p.weightKg * 2.20462) : r1(p.weightKg)}"></label>
      <label class="full">Height${us ? `<div class="hpair"><input id="p-ft" inputmode="numeric" value="${ft}" aria-label="Feet"><input id="p-in" inputmode="numeric" value="${inch}" aria-label="Inches"></div>` : `<input id="p-cm" inputmode="numeric" value="${r0(p.heightCm)}">`}</label>
      <label class="full">Activity<select id="p-act">${ACT.map(([v, l]) => `<option value="${v}" ${v === p.activity ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="full">Goal<select id="p-pace">${PACE.map(([v, l]) => `<option value="${v}" ${v === p.pace ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    </div>
    <div class="result" id="calc-out">${calcOut(c)}</div>
    <button class="btn block" style="margin-top:14px" data-act="use-calc">Use these targets</button>
    <p class="note">If your Garmin shows a big active-calorie burn on training days, eat a bit more on those days rather than raising the everyday target. These are estimates, not medical advice.</p>
  </section>

  <section class="card" style="margin-top:14px">
    <div class="eyebrow">Your data</div><h2 style="margin:2px 0 6px">Stored on this phone</h2>
    <p class="muted" style="margin:0;font-size:13.5px">${days} logged ${days === 1 ? "day" : "days"} and ${foods} saved ${foods === 1 ? "food" : "foods"}. Nothing is sent anywhere except barcode and search lookups to Open Food Facts. Last backup: ${st.lastBackup ? esc(new Date(st.lastBackup).toLocaleDateString()) : "never"}.</p>
    <div class="btnrow"><button class="btn" data-act="backup">Back up</button><button class="btn" data-act="restore">Restore</button></div>
    ${foods ? `<button class="link-btn" style="margin-top:8px" data-act="manage-foods">Manage saved foods</button>` : ""}
    <p class="note" style="text-align:center">Fuel Log version ${VERSION}</p>
    ${standalone ? "" : `<p class="note">To use it like an app: in Safari tap Share, then Add to Home Screen. In Chrome, open the ⋮ menu and choose Add to Home screen. Data saved in a home-screen app is also safer from being cleared by the browser.</p>`}
  </section>`;
}
function readProfile() {
  const p = G.profile, us = G.units === "us", v = id => $("#" + id) ? num($("#" + id).value) : null;
  if (v("p-age")) p.age = v("p-age");
  const w = v("p-wt"); if (w) p.weightKg = us ? w / 2.20462 : w;
  if (us) { const f = v("p-ft"), i = v("p-in"); if (f || i) p.heightCm = ((f || 0) * 12 + (i || 0)) * 2.54; }
  else { const c = v("p-cm"); if (c) p.heightCm = c; }
  if ($("#p-act")) p.activity = num($("#p-act").value);
  if ($("#p-pace")) p.pace = num($("#p-pace").value);
  for (const k of ["kcal", "protein", "carbs", "fat", "fiber"]) { const el = $("#g-" + k); if (el) G.goals[k] = num(el.value); }
}
function openManageFoods() {
  const list = Object.entries(S.foods).sort((a, b) => (a[1].name || "").localeCompare(b[1].name || ""));
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${list.length} saved</div><h2>Saved foods</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <div class="list">${list.map(([id, f]) => `<div class="entry"><div class="main"><div class="nm">${esc(f.name)}</div><div class="sub">${f.brand ? `<span>${esc(f.brand)}</span>` : ""}<span>${esc(f.serving || "1 serving")}</span><span>${fmt(f.kcal)} kcal</span>${f.barcode ? `<span>${esc(f.barcode)}</span>` : ""}</div></div><button class="btn danger" style="padding:6px 10px" data-act="del-food" data-id="${esc(id)}">Remove</button></div>`).join("")}</div>
    <p class="note">Removing a saved food doesn't change anything you've already logged.</p>`);
}

/* ---------- routing ---------- */
function render() { renderTop(); if (S.view === "calendar") renderCalendar(); else if (S.view === "goals") renderGoals(); else renderDay(); }
function route() {
  const h = location.hash.replace("#", "");
  const v = h === "calendar" ? "calendar" : h === "goals" ? "goals" : "day";
  if (v !== S.view) { S.view = v; G = null; window.scrollTo(0, 0); }
  render();
}
window.addEventListener("hashchange", route);
function go(view) { const h = view === "day" ? "#log" : "#" + view; if (location.hash !== h) location.hash = h; else route(); }

/* ---------- add sheet & search ---------- */
let addMeal = defaultMeal(), searchCtl = null, searchT = null, POOL = {};
function openAdd(meal, focusSearch) {
  addMeal = meal || (S.date === todayKey() ? defaultMeal() : addMeal);
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${esc(dayLabel(S.date))}</div><h2>Add food</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <div class="chips" style="margin-bottom:14px" role="group" aria-label="Meal">${MEALS.map(m => `<button class="chip" data-act="add-meal" data-meal="${m}" aria-pressed="${m === addMeal}">${m}</button>`).join("")}</div>
    <div class="actions">
      <button class="action" data-act="scan-barcode">${I.barcode}<b>Scan barcode</b><span>Looks up millions of packaged foods</span></button>
      <button class="action" data-act="scan-label">${I.label}<b>Scan label</b><span>Photo of the Nutrition Facts panel</span></button>
      <button class="action" data-act="focus-search">${I.search}<b>Search</b><span>Common foods, your foods, products</span></button>
      <button class="action" data-act="quick">${I.quick}<b>Quick add</b><span>Just the calories and macros</span></button>
    </div>
    <div class="section-lbl"><h3>Find a food</h3><button class="link-btn" data-act="manual">Enter manually</button></div>
    <input class="search" id="foodQ" type="search" enterkeyhint="search" autocomplete="off" placeholder="e.g. banana, chicken breast, Kind bar" aria-label="Search foods">
    <div id="foodList"></div>`,
    el => {
      const q = el.querySelector("#foodQ");
      q.addEventListener("input", () => renderFoodList(q.value));
      q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); q.blur(); runOnline(q.value, 0); } });
      renderFoodList("");
      if (focusSearch) setTimeout(() => q.focus(), 250);
    });
}
function localPool() {
  const pool = [], seen = new Set();
  const foods = Object.entries(S.foods).map(([id, f]) => ({ ...f, foodId: id })).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  for (const f of foods) { seen.add((f.name || "").toLowerCase()); pool.push({ item: cleanItem(f, { foodId: f.foodId, per100: f.per100, grams: f.grams, barcode: f.barcode }), tag: "Saved", src: "food" }); }
  const keys = Object.keys(S.days).sort().reverse().slice(0, 30);
  for (const k of keys) for (const e of entriesOf(k).slice().reverse()) {
    const n = (e.name || "").toLowerCase(); if (!n || seen.has(n)) continue; seen.add(n);
    pool.push({ item: cleanItem(e, { per100: e.per100, grams: e.grams }), tag: "Recent", src: "recent" });
  }
  return pool;
}
function matches(name, q) { const n = name.toLowerCase(); return q.split(/\s+/).every(w => n.includes(w)); }
function rowHTML(group, i, it, tag) {
  return `<button class="entry" data-act="pick" data-g="${group}" data-i="${i}"><div class="main"><div class="nm">${esc(it.name)}</div><div class="sub">${it.brand ? `<span>${esc(it.brand)}</span>` : ""}<span>${esc(it.serving || "1 serving")}</span>${tag ? `<span class="pill">${tag}</span>` : ""}</div></div><div class="k">${fmt(it.kcal)}</div></button>`;
}
function renderFoodList(q) {
  const box = $("#foodList"); if (!box) return;
  q = q.trim().toLowerCase();
  POOL.local = localPool().filter(p => !q || matches(p.item.name + " " + (p.item.brand || ""), q)).slice(0, q ? 20 : 10);
  POOL.common = q ? (window.COMMON_FOODS || []).filter(r => matches(r[0], q)).slice(0, 12).map(fromCommon) : [];
  let h = "";
  if (POOL.local.length) h += `<div class="group-lbl">${q ? "Your foods" : "Recent and saved"}</div><div class="list">${POOL.local.map((p, i) => rowHTML("local", i, p.item, p.tag)).join("")}</div>`;
  if (POOL.common.length) h += `<div class="group-lbl">Common foods</div><div class="list">${POOL.common.map((it, i) => rowHTML("common", i, it, "")).join("")}</div>`;
  if (q.length >= 3) h += `<div id="onlineBox"><div class="group-lbl">Packaged products</div><p class="note" style="margin:0 2px">Searching Open Food Facts…</p></div>`;
  else if (!q) h += POOL.local.length ? "" : `<p class="note" style="text-align:center;padding:14px 0">Foods you log show up here for one-tap re-use.</p>`;
  box.innerHTML = h;
  clearTimeout(searchT);
  if (q.length >= 3) searchT = setTimeout(() => runOnline(q, 0), 900);
}
async function runOnline(q, _) {
  q = (q || "").trim(); if (q.length < 2) return;
  if (searchCtl) searchCtl.abort();
  const ctl = searchCtl = new AbortController();
  const box = () => $("#onlineBox");
  if (!box()) { const fl = $("#foodList"); if (fl) fl.insertAdjacentHTML("beforeend", `<div id="onlineBox"><div class="group-lbl">Packaged products</div><p class="note" style="margin:0 2px">Searching Open Food Facts…</p></div>`); }
  if (!navigator.onLine) { if (box()) box().innerHTML = `<div class="group-lbl">Packaged products</div><p class="note" style="margin:0 2px">You're offline. Common foods and your saved foods still work.</p>`; return; }
  try {
    const res = await offSearch(q, ctl.signal);
    if (ctl.signal.aborted || !box()) return;
    POOL.online = res.slice(0, 20);
    box().innerHTML = `<div class="group-lbl">Packaged products</div>` + (POOL.online.length ? `<div class="list">${POOL.online.map((it, i) => rowHTML("online", i, it, "")).join("")}</div>` : `<p class="note" style="margin:0 2px">No products matched. Try the brand name, or scan the barcode.</p>`);
  } catch (e) {
    if (ctl.signal.aborted || !box()) return;
    box().innerHTML = `<div class="group-lbl">Packaged products</div><p class="note" style="margin:0 2px">The product search didn't respond. Try again in a moment.</p>`;
  }
}

/* ---------- review / edit ---------- */
let R = null;
const SRC_LABEL = { label: "From the nutrition label", barcode: "From your saved foods", off: "From Open Food Facts", common: "Common food (USDA values)", manual: "Manual entry", quick: "Quick add", food: "From your foods", recent: "From your log", edit: "Logged entry" };
function blankItem(extra) { return { name: "", serving: "", kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodium: 0, satFat: 0, qty: 1, ...extra }; }
function cleanItem(o, extra = {}) {
  const it = blankItem();
  it.name = String(o.name || "").slice(0, 120);
  if (o.brand) it.brand = String(o.brand).slice(0, 80);
  it.serving = String(o.serving || "").slice(0, 80);
  for (const k of NUTR) it[k] = Math.max(0, num(o[k]));
  if (o.qty != null) it.qty = num(o.qty) || 1;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) it[k] = v;
  return it;
}
function openReview(r) { R = { meal: addMeal, saveFoods: false, notes: "", ...r }; renderReview(); }
function itemCard(it, i) {
  const fl = it.flags || [];
  const f = (k, lbl, cls = "") => `<label class="${cls}">${lbl}<input class="${fl.includes(k) ? "flag" : ""}" data-i="${i}" data-k="${k}" inputmode="decimal" value="${it[k] ? r1(it[k]) : ""}" placeholder="0"></label>`;
  return `<div class="item ${R.src === "label" ? "nf" : ""}">
    ${R.src === "label" ? `<div class="nf-title">Nutrition Facts</div>` : ""}
    <div class="item-top"><input class="name" data-i="${i}" data-k="name" value="${esc(it.name)}" placeholder="Name this food" aria-label="Food name">${R.items.length > 1 ? `<button class="icon-btn" data-act="rm-item" data-i="${i}" aria-label="Remove item">×</button>` : ""}</div>
    ${it.brand ? `<div class="brand-l">${esc(it.brand)}</div>` : ""}
    <div class="serv"><input data-i="${i}" data-k="serving" value="${esc(it.serving)}" placeholder="Serving size, e.g. 1 cup (240 g)" aria-label="Serving size"></div>
    <div class="fields">${f("kcal", "Calories")}${f("protein", "Protein g", "p")}${f("carbs", "Carbs g", "c")}${f("fat", "Fat g", "f")}</div>
    <details ${fl.some(k => ["fiber", "sugar", "satFat"].includes(k)) ? "open" : ""}><summary>More nutrients</summary><div class="fields">${f("fiber", "Fiber g")}${f("sugar", "Sugar g")}${f("satFat", "Sat fat g")}${f("sodium", "Sodium mg")}</div></details>
    <div class="qty">${it.per100 ? `<span class="grams">Serving<input data-i="${i}" data-k="grams" inputmode="decimal" value="${r1(it.grams || 100)}" aria-label="Grams per serving">g</span>` : ""}<span>×</span><div class="stepper"><button data-act="qty" data-d="-0.5" data-i="${i}" aria-label="Fewer servings">−</button><input data-i="${i}" data-k="qty" inputmode="decimal" value="${r1(it.qty)}" aria-label="Servings"><button data-act="qty" data-d="0.5" data-i="${i}" aria-label="More servings">+</button></div><span class="ik" id="ik-${i}">${fmt(it.kcal * it.qty)} kcal</span></div>
  </div>`;
}
const reviewTotals = () => { const t = totals(R.items); return `<b>${fmt(t.kcal)} kcal</b>P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}`; };
function refreshItem(i) {
  const it = R.items[i];
  for (const k of NUTR) { const el = document.querySelector(`input[data-i="${i}"][data-k="${k}"]`); if (el && el !== document.activeElement) el.value = it[k] ? r1(it[k]) : ""; }
  const sv = document.querySelector(`input[data-i="${i}"][data-k="serving"]`); if (sv && sv !== document.activeElement) sv.value = it.serving;
  const ik = $("#ik-" + i); if (ik) ik.textContent = fmt(it.kcal * (it.qty || 0)) + " kcal";
  const tot = $("#revTot"); if (tot) tot.innerHTML = reviewTotals();
}
function renderReview() {
  const editing = !!R.editId;
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${esc(SRC_LABEL[R.src] || "")}</div><h2>${editing ? "Edit entry" : "Review and add"}</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <div class="stack">
      ${R.thumb ? `<img class="thumb" src="${R.thumb}" alt="Your label photo">` : ""}
      ${R.warn ? `<p class="ai-note warn">${esc(R.warn)}</p>` : ""}
      ${R.notes ? `<p class="ai-note">${esc(R.notes)}</p>` : ""}
      ${R.items.map(itemCard).join("")}
      ${R.rawText ? `<details><summary>Text the scanner read</summary><pre>${esc(R.rawText)}</pre></details>` : ""}
      ${!editing ? `<button class="link-btn" style="text-align:left" data-act="add-item">+ Add another item</button>` : ""}
      <div class="chips" role="group" aria-label="Meal">${MEALS.map(m => `<button class="chip" data-act="rev-meal" data-meal="${m}" aria-pressed="${m === R.meal}">${m}</button>`).join("")}</div>
      ${!editing && R.src !== "food" && R.src !== "barcode" ? `<label class="check"><input type="checkbox" id="saveFoods" ${R.saveFoods ? "checked" : ""}> Save to my foods for one-tap re-use${R.barcode ? ` (linked to barcode ${esc(R.barcode)})` : ""}</label>` : ""}
    </div>
    <div class="sheet-foot">${editing ? `<button class="btn danger" data-act="delete-entry">Delete</button>` : ""}<div class="tot" id="revTot">${reviewTotals()}</div><button class="btn primary" data-act="commit">${editing ? "Save" : "Add to " + R.meal}</button></div>`,
    el => {
      el.addEventListener("input", e => {
        const t = e.target; if (t.id === "saveFoods") { R.saveFoods = t.checked; return; }
        const i = t.dataset.i, k = t.dataset.k; if (i == null || !k) return;
        const it = R.items[+i];
        if (k === "name" || k === "serving") { it[k] = t.value; return; }
        if (k === "grams") {
          const g = num(t.value); if (!(g > 0) || !it.per100) return;
          it.grams = g; Object.assign(it, scaleFrom(it.per100, g)); it.serving = `${r1(g)} g`; refreshItem(+i); return;
        }
        it[k] = num(t.value);
        if (it.flags) { it.flags = it.flags.filter(f => f !== k); t.classList.remove("flag"); }
        if (NUTR.includes(k) && it.per100) { it.per100 = null; }
        refreshItem(+i);
      });
      el.addEventListener("change", e => { if (e.target.id === "saveFoods") R.saveFoods = e.target.checked; });
    });
}
function strip(it) {
  const o = { name: (it.name || "").trim() || "Food", serving: it.serving || "", qty: it.qty == null ? 1 : num(it.qty) };
  if (it.brand) o.brand = it.brand;
  for (const k of NUTR) o[k] = r1(num(it[k]));
  return o;
}
function commitReview() {
  const items = R.items.filter(it => it.name.trim() || it.kcal > 0);
  if (!items.length) { toast("Add a name or calories first."); return; }
  if (items.some(it => !(num(it.qty) > 0))) { toast("Servings must be more than zero."); return; }
  const date = R.date || S.date, now = Date.now();
  let list = entriesOf(date).slice();
  if (R.editId) {
    list = list.map(e => e.id === R.editId ? { ...e, ...strip(items[0]), meal: R.meal } : e);
    saveDay(date, list); closeSheet(); render(); toast("Entry updated"); return;
  }
  for (const it of items) {
    let foodId = it.foodId || null;
    if (R.saveFoods || foodId) {
      const single = items.length === 1;
      foodId = foodId || (R.barcode && single ? R.barcode : uid());
      const prev = S.foods[foodId] || {};
      const food = { ...strip(it), qty: 1, barcode: (R.barcode && single) ? R.barcode : (prev.barcode || it.barcode || null), uses: (prev.uses || 0) + 1, lastUsed: now };
      if (it.per100) { food.per100 = it.per100; food.grams = it.grams; }
      saveFood(foodId, food);
    }
    list.push({ ...strip(it), id: uid(), meal: R.meal, src: R.src, foodId, t: now });
  }
  saveDay(date, list);
  const k = totals(items).kcal, meal = R.meal;
  closeSheet(); if (S.view !== "day") go("day"); else render();
  toast(`Added ${fmt(k)} kcal to ${meal}`);
}

/* ---------- scanner sheet ---------- */
function openScanner() {
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${esc(addMeal)}</div><h2>Scan a barcode</h2></div><button class="icon-btn" data-close aria-label="Close">×</button></div>
    <div class="scanner"><video id="scanVid" playsinline muted autoplay></video><div class="reticle"></div></div>
    <p class="muted" id="scanMsg" style="text-align:center;margin:10px 0 14px">Line the barcode up inside the box.</p>
    <div class="row2"><input id="codeQ" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" aria-label="Barcode number"><button class="btn" data-act="code-go">Look up</button></div>
    <p style="text-align:center;margin:10px 0 0"><button class="link-btn" data-act="barcode-photo">Take a photo instead</button></p>`,
    el => { sheetCleanup = stopScan; startScan(el.querySelector("#scanVid"), el.querySelector("#scanMsg")); });
}
function flowBarcodePhoto() {
  stopScan();
  pickPhoto(async file => {
    working("Reading barcode…", "");
    let code = null; try { code = await decodeBarcodePhoto(file); } catch {}
    if ($("#sheet").hidden) return;
    if (!code) { errorSheet("Couldn't read that barcode", "Try again closer, with the bars filling most of the frame and no glare. You can also type the number.", flowBarcodePhoto); return; }
    lookupBarcode(normCode(code));
  });
}

/* ---------- clicks ---------- */
document.addEventListener("click", e => {
  if (e.target.closest("[data-close]")) { closeSheet(); return; }
  const b = e.target.closest("[data-act]"); if (!b) return;
  const a = b.dataset.act;
  switch (a) {
    case "open-add": openAdd(b.dataset.meal); break;
    case "add-meal": addMeal = b.dataset.meal; document.querySelectorAll('[data-act="add-meal"]').forEach(x => x.setAttribute("aria-pressed", x.dataset.meal === addMeal)); break;
    case "scan-barcode": openScanner(); break;
    case "code-go": { const c = normCode($("#codeQ").value); stopScan(); lookupBarcode(c); break; }
    case "barcode-photo": flowBarcodePhoto(); break;
    case "scan-label": flowLabel(null); break;
    case "label-for": flowLabel(S.pendingBarcode); break;
    case "focus-search": { const q = $("#foodQ"); if (q) { q.focus(); q.scrollIntoView({ block: "start", behavior: "smooth" }); } break; }
    case "quick": openReview({ src: "quick", items: [blankItem({ name: "Quick add" })] }); setTimeout(() => { const k = document.querySelector('input[data-k="kcal"]'); if (k) k.focus(); }, 250); break;
    case "manual": openReview({ src: "manual", items: [blankItem()], saveFoods: true }); break;
    case "manual-for": openReview({ src: "manual", items: [blankItem()], saveFoods: true, barcode: S.pendingBarcode }); break;
    case "pick": {
      const g = b.dataset.g, i = +b.dataset.i;
      if (g === "local") { const p = POOL.local[i]; if (!p) return; openReview({ src: p.src, items: [{ ...p.item, qty: p.src === "food" ? 1 : p.item.qty }] }); }
      else if (g === "common") { const it = POOL.common[i]; if (it) openReview({ src: "common", items: [{ ...it }], saveFoods: false }); }
      else if (g === "online") { const it = POOL.online && POOL.online[i]; if (it) openReview({ src: "off", items: [{ ...it }], barcode: it.barcode ? normCode(it.barcode) : null, saveFoods: true }); }
      break;
    }
    case "qty": { const i = +b.dataset.i, it = R.items[i], d = num(b.dataset.d); let q = (num(it.qty) || 1) + d; if (it.qty <= 0.5 && d < 0) q = 0.25; if (it.qty === 0.25 && d > 0) q = 0.5; it.qty = Math.max(0.25, r1(q)); const inp = document.querySelector(`input[data-i="${i}"][data-k="qty"]`); if (inp) inp.value = it.qty; refreshItem(i); break; }
    case "rm-item": R.items.splice(+b.dataset.i, 1); renderReview(); break;
    case "add-item": R.items.push(blankItem()); renderReview(); break;
    case "rev-meal": R.meal = b.dataset.meal; document.querySelectorAll('[data-act="rev-meal"]').forEach(x => x.setAttribute("aria-pressed", x.dataset.meal === R.meal)); { const c = document.querySelector('[data-act="commit"]'); if (c && !R.editId) c.textContent = "Add to " + R.meal; } break;
    case "commit": commitReview(); break;
    case "edit-entry": { const en = entriesOf(S.date).find(x => x.id === b.dataset.id); if (!en) return; openReview({ src: "edit", editId: en.id, date: S.date, meal: en.meal || "Snacks", items: [cleanItem(en)] }); break; }
    case "delete-entry": {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Tap again to delete"; return; }
      saveDay(R.date, entriesOf(R.date).filter(x => x.id !== R.editId)); closeSheet(); render(); toast("Entry deleted"); break;
    }
    case "day-prev": S.date = addDays(S.date, -1); render(); break;
    case "day-next": S.date = addDays(S.date, 1); render(); break;
    case "day-today": S.date = todayKey(); render(); break;
    case "cal-prev": case "cal-next": { const [y, m] = S.calMonth.split("-").map(Number); S.calMonth = keyOf(new Date(y, m - 1 + (a === "cal-next" ? 1 : -1), 1)).slice(0, 7); render(); break; }
    case "cal-day": S.date = b.dataset.k; go("day"); break;
    case "go-goals": go("goals"); break;
    case "units": readProfile(); G.units = b.dataset.u; renderGoals(); break;
    case "sex": readProfile(); G.profile.sex = b.dataset.s; renderGoals(); break;
    case "use-calc": { readProfile(); const c = calc(G.profile); G.goals = { kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat, fiber: c.fiber }; renderGoals(); toast("Targets filled in. Tap Save targets to keep them."); window.scrollTo({ top: 0, behavior: "smooth" }); break; }
    case "save-goals": { readProfile(); if (num(G.goals.kcal) < 800) { toast("That calorie target looks too low. Check the number."); return; } saveSettings({ ...settings(), goals: { ...G.goals }, profile: { ...G.profile }, units: G.units, goalsSet: true }); toast("Targets saved"); renderGoals(); break; }
    case "backup": exportData(); break;
    case "restore": $("#jsonIn").click(); break;
    case "do-import": doImport(); break;
    case "manage-foods": openManageFoods(); break;
    case "del-food": {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Confirm"; return; }
      deleteFood(b.dataset.id); openManageFoods(); if (S.view === "goals") renderGoals(); break;
    }
  }
});
document.addEventListener("input", e => {
  if (S.view !== "goals" || !G || !e.target.id || !/^p-/.test(e.target.id)) return;
  readProfile(); const o = $("#calc-out"); if (o) o.innerHTML = calcOut(calc(G.profile));
});
document.addEventListener("change", e => { if (S.view === "goals" && G && /^p-(act|pace)$/.test(e.target.id)) { readProfile(); $("#calc-out").innerHTML = calcOut(calc(G.profile)); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
let lastToday = todayKey();
document.addEventListener("visibilitychange", () => { if (document.hidden) return; const t = todayKey(); if (t !== lastToday) { if (S.date === lastToday) S.date = t; lastToday = t; render(); } });

/* ---------- boot ---------- */
load();
route();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
