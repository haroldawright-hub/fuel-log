/* Fuel Log app logic */
(() => {
"use strict";
const VERSION = "7";
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
  openSheet(`<div class="sheet-head"><div><div class="label">Backup</div><h2>Saved to Downloads</h2></div>${X}</div>
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
    openSheet(`<div class="sheet-head"><div><div class="label">Restore</div><h2>Merge this backup?</h2></div>${X}</div>
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
  for (let attempt = 0; attempt < 3; attempt++) {
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
      if (attempt < 2) await new Promise(r => setTimeout(r, attempt ? 2600 : 1200));
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
  openSheet(`<div class="sheet-head"><div><div class="label">Barcode ${esc(code)}</div><h2>Product not found</h2></div>${X}</div>
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
    openSheet(`<div class="working"><div class="loader"></div><h2>Reading the label…</h2><p class="muted" id="ocrMsg">${ocrWorker ? "Recognizing text" : "Getting the text reader ready. The first time takes a little longer."}</p><div class="progress"><span id="ocrBar"></span></div><button class="btn small" data-close style="margin-top:16px">Cancel</button></div>`);
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
function working(title, sub) { openSheet(`<div class="working"><div class="loader"></div><h2>${esc(title)}</h2><p class="muted">${esc(sub || "")}</p><button class="btn small" data-close style="margin-top:6px">Cancel</button></div>`); }
function errorSheet(title, msg, retry) {
  openSheet(`<div class="sheet-head"><div><h2>${esc(title)}</h2></div>${X}</div>
    <p class="muted">${esc(msg)}</p>
    <div class="stack" style="margin-top:16px">${retry ? `<button class="btn primary block" data-act="retry">Try again</button>` : ""}<button class="btn block" data-act="manual">Enter it by hand</button></div>`,
    el => { const b = el.querySelector('[data-act="retry"]'); if (b) b.onclick = retry; });
}

/* ---------- icons ---------- */
const I = {
  barcode: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3.5 7V4.5H7M17 4.5h3.5V7M20.5 17v2.5H17M7 19.5H3.5V17M7.5 8.5v7M10.5 8.5v7M13.5 8.5v7M16.5 8.5v7"/></svg>`,
  label: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M5 3h14v18H5z"/><path d="M5 7.5h14" stroke-width="2.6"/><path d="M8 11h8M8 14h8M8 17h5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6"/><path d="M20 20l-5-5"/></svg>`,
  quick: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5L4.5 13.5h6.5l-1 8 8.5-11h-6.5z"/></svg>`,
  prev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>`,
  next: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`
};
const X = `<button class="x" data-close aria-label="Close">${I.x}</button>`;

/* ---------- motion helpers ---------- */
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const prevBars = {};
// Bars render at their previous width, then glide to the new one.
function animateBars(root) {
  const els = root.querySelectorAll("[data-w]");
  els.forEach(el => { const k = el.dataset.key; el.style.width = (prevBars[k] ?? 0) + "%"; });
  requestAnimationFrame(() => requestAnimationFrame(() => els.forEach(el => { el.style.width = el.dataset.w + "%"; prevBars[el.dataset.key] = +el.dataset.w; })));
}
let shownKcal = null;
function countUp(el, to) {
  const from = shownKcal == null ? to : shownKcal; shownKcal = to;
  if (from === to || reduceMotion()) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 650;
  const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------- header & banners ---------- */
function renderTop() {
  const away = S.view === "day" && S.date !== todayKey();
  $("#top").innerHTML = `<div class="mark"><i></i>Fuel Log</div>${away ? `<button class="today-chip" data-act="day-today">Back to today</button>` : ""}`;
  document.querySelectorAll(".tabbar a").forEach(a => { if (a.dataset.view === S.view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
function banners() {
  let h = "";
  if (!storageOK) h += `<div class="banner warn"><span>This browser isn't letting the app save. Private browsing blocks storage; open it in a normal tab.</span></div>`;
  const st = settings(), loggedDays = Object.keys(S.days).length;
  if (loggedDays >= 5 && Date.now() - (st.lastBackup || 0) > 14 * 864e5) h += `<div class="banner"><span>Your log lives only on this phone. Save a backup now and then.</span><button class="link" data-act="backup">Back up</button></div>`;
  return h;
}

/* ---------- day view ---------- */
function relDay(k) {
  const t = todayKey();
  return k === t ? "Today" : k === addDays(t, -1) ? "Yesterday" : k === addDays(t, 1) ? "Tomorrow" : "";
}
function entryRow(e) {
  const q = e.qty == null ? 1 : num(e.qty);
  const serv = q !== 1 ? `${r1(q)} × ${e.serving || "serving"}` : (e.serving || "");
  return `<button class="row" data-act="edit-entry" data-id="${esc(e.id)}">
    <div class="main"><div class="nm">${esc(e.name)}</div>
    <div class="sub">${serv ? `<span>${esc(serv)}</span>` : ""}<span class="mac"><span class="p">${fmt(num(e.protein) * q)}</span><span class="c">${fmt(num(e.carbs) * q)}</span><span class="f">${fmt(num(e.fat) * q)}</span></span></div></div>
    <div class="k">${fmt(num(e.kcal) * q)}</div></button>`;
}
function dvRow(name, have, goal, color, key, unit = "g") {
  const p = goal ? have / goal * 100 : 0;
  return `<div class="dv"><div class="n"><b>${name}</b> <span>${fmt(have)}${unit} / ${fmt(goal)}${unit}</span></div><div class="pct ${p > 115 ? "over" : ""}">${r0(p)}%</div>
    <div class="track"><i data-key="${key}" data-w="${Math.min(p, 100).toFixed(1)}" style="background:${color}"></i></div></div>`;
}
function renderDay() {
  const st = settings(), g = st.goals, list = entriesOf(S.date), t = totals(list);
  const left = g.kcal - t.kcal, over = left < 0, d = parseKey(S.date), rel = relDay(S.date);
  const wd = d.toLocaleDateString(undefined, { weekday: "long" });
  const kicker = rel ? `${rel} · ${wd}` : `${wd} · ${d.getFullYear()}`;
  const title = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const byMeal = MEALS.map(m => list.filter(e => (e.meal || "Snacks") === m));
  const mk = byMeal.map(es => totals(es).kcal);
  const scale = Math.max(g.kcal, t.kcal) || 1;
  const segs = mk.map((v, i) => `<i class="m${i}" data-key="seg${i}" data-w="${(v / scale * 100).toFixed(2)}"></i>`).join("");
  const ovr = over ? `<i class="ovr" style="position:absolute;left:${(g.kcal / scale * 100).toFixed(2)}%;right:0;top:0;bottom:0;border:0"></i><span class="tick" style="left:calc(${(g.kcal / scale * 100).toFixed(2)}% - 1px)"></span>` : "";
  let h = banners();
  if (!st.goalsSet) h += `<div class="banner"><span>Your target is the 2,000 kcal default. Set one that fits you.</span><button class="link" data-act="go-goals">Set goals</button></div>`;
  h += `<section class="dateline"><div class="dl"><div class="label">${esc(kicker)}</div><h1>${esc(title)}</h1></div>
      <div class="arrows"><button class="arrow" data-act="day-prev" aria-label="Previous day">${I.prev}</button><button class="arrow" data-act="day-next" aria-label="Next day">${I.next}</button></div></section>
    <section class="facts" aria-label="Daily totals">
      <div class="facts-head"><h2>Daily Facts</h2><span class="label">Target ${fmt(g.kcal)}</span></div>
      <div class="rule-xl"></div>
      <div class="cal-row"><div class="cw"><small>${over ? "Over target" : "Remaining"}</small>Calories</div><div class="cal-num ${over ? "over" : ""}" id="calNum">${fmt(Math.abs(left))}</div></div>
      <div class="meter" role="img" aria-label="${fmt(t.kcal)} of ${fmt(g.kcal)} calories eaten">${segs}${ovr}</div>
      <div class="meter-key"><span>${MEALS.map((m, i) => `${m[0]} <b>${fmt(mk[i])}</b>`).join(" · ")}</span><span><b>${fmt(t.kcal)}</b> eaten</span></div>
      <div class="rule-l"></div>
      <div class="dv-head label"><span>Amount / target</span><span>% Goal</span></div>
      ${dvRow("Protein", t.protein, g.protein, "var(--pro)", "dvp")}${dvRow("Carbs", t.carbs, g.carbs, "var(--carb)", "dvc")}${dvRow("Fat", t.fat, g.fat, "var(--fat)", "dvf")}${dvRow("Fiber", t.fiber, g.fiber, "var(--ink-2)", "dvb")}
    </section>
    <div class="meals">${MEALS.map((m, i) => {
      const es = byMeal[i];
      return `<section class="meal"><header class="meal-h"><h2>${m}</h2><span class="lead"></span><span class="k">${es.length ? `${fmt(mk[i])}<small>KCAL</small>` : `<small>—</small>`}</span></header>
        ${es.map(entryRow).join("")}<button class="meal-add" data-act="open-add" data-meal="${m}">${I.plus}Add to ${m.toLowerCase()}</button></section>`;
    }).join("")}</div>`;
  const main = $("#main"); main.innerHTML = h;
  animateBars(main);
  const cn = $("#calNum"); if (cn) countUp(cn, Math.abs(left));
}

/* ---------- history ---------- */
function dayStatus(k) {
  const l = entriesOf(k); if (!l.length) return "";
  const p = totals(l).kcal / (settings().goals.kcal || 2000);
  return p < 0.85 ? "under" : p <= 1.1 ? "on" : "over";
}
function streak() {
  let k = todayKey(), n = 0;
  if (!entriesOf(k).length) k = addDays(k, -1);
  while (entriesOf(k).length) { n++; k = addDays(k, -1); }
  return n;
}
function renderCalendar() {
  const [y, m] = S.calMonth.split("-").map(Number);
  const first = new Date(y, m - 1, 1), dim = new Date(y, m, 0).getDate(), lead = first.getDay(), tk = todayKey(), gk = settings().goals.kcal || 2000;
  let cells = ["S", "M", "T", "W", "T", "F", "S"].map(d => `<div class="dow">${d}</div>`).join("");
  for (let i = 0; i < lead; i++) cells += `<div class="day out"></div>`;
  const monthKeys = [];
  for (let d = 1; d <= dim; d++) {
    const k = keyOf(new Date(y, m - 1, d)), st = dayStatus(k), l = entriesOf(k), kc = totals(l).kcal;
    if (l.length) monthKeys.push(k);
    cells += `<button class="day ${st ? "st-" + st : ""} ${k > tk ? "future" : ""} ${k === tk ? "today" : ""} ${k === S.date ? "sel" : ""}" data-act="cal-day" data-k="${k}" aria-label="${esc(parseKey(k).toDateString())}${l.length ? ", " + fmt(kc) + " kcal" : ""}">
      <span class="d">${d}</span>${l.length ? `<span class="fill" style="height:${Math.min(100, kc / gk * 100).toFixed(1)}%"></span>` : ""}</button>`;
  }
  const g = settings().goals, n = monthKeys.length;
  const sums = monthKeys.map(k => totals(entriesOf(k)));
  const avg = f => n ? sums.reduce((a, s) => a + s[f], 0) / n : 0;
  const onT = monthKeys.filter(k => dayStatus(k) === "on").length;
  const sk = streak();
  const mname = first.toLocaleDateString(undefined, { month: "long" });
  $("#main").innerHTML = banners() + `<section class="hist-head"><div class="dl"><div class="label">History · ${y}${sk > 1 ? ` · ${sk}-day streak` : ""}</div><h1>${esc(mname)}</h1></div>
      <div class="arrows"><button class="arrow" data-act="cal-prev" aria-label="Previous month">${I.prev}</button><button class="arrow" data-act="cal-next" aria-label="Next month">${I.next}</button></div></section>
    <div class="cal">${cells}</div>
    <div class="legend"><span><i style="background:var(--good)"></i>On target</span><span><i style="background:var(--ink-3);opacity:.5"></i>Under</span><span><i class="ovr"></i>Over</span><span>Fill = share of target</span></div>
    <div class="spec">
      <div><b>${n}</b><span class="label">Days logged</span></div>
      <div><b>${onT}</b><span class="label">On target (85–110%)</span></div>
      <div><b>${n ? fmt(avg("kcal")) : "–"}</b><span class="label">Avg calories</span></div>
      <div><b>${n ? fmt(avg("protein")) : "–"}${n ? "<small>g</small>" : ""}</b><span class="label">Avg protein</span></div>
    </div>
    <div class="section-h"><h2>Last 14 days</h2><span class="label">Target ${fmt(g.kcal)}</span></div>
    <div class="chart">${chart14()}</div>`;
}
function chart14() {
  const tk = todayKey(), g = settings().goals.kcal || 2000;
  const days = Array.from({ length: 14 }, (_, i) => addDays(tk, i - 13));
  const vals = days.map(k => totals(entriesOf(k)).kcal);
  const max = Math.max(g * 1.25, ...vals) || 1;
  const W = 340, H = 160, padL = 30, padB = 22, padT = 6, iw = W - padL, ih = H - padB - padT, bw = iw / 14;
  const y = v => padT + ih - (v / max) * ih;
  const step = max > 3000 ? 1000 : 500;
  const mono = `style="font-family:var(--mono)"`;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories for the last 14 days"><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--over)" opacity=".35"/><rect width="2.5" height="5" fill="var(--over)"/></pattern></defs>`;
  for (let t = 0; t <= max; t += step) s += `<line x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="var(--hair)" stroke-width="1"/><text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end" font-size="9" fill="var(--ink-3)" ${mono}>${t >= 1000 ? (t / 1000) + "k" : t}</text>`;
  days.forEach((k, i) => {
    const v = vals[i], x = padL + i * bw + bw * 0.2, w = bw * 0.6, st = dayStatus(k);
    const col = st === "over" ? "url(#hatch)" : st === "on" ? "var(--good)" : "var(--ink-3)";
    if (v > 0) s += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${w.toFixed(1)}" height="${(padT + ih - y(v)).toFixed(1)}" rx="1.5" fill="${col}" ${st === "under" ? 'opacity=".55"' : ""}><title>${esc(dayLabel(k))}: ${fmt(v)} kcal</title></rect>`;
    else s += `<rect x="${x.toFixed(1)}" y="${(padT + ih - 2).toFixed(1)}" width="${w.toFixed(1)}" height="2" fill="var(--hair)"/>`;
    const dd = parseKey(k);
    s += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="9" font-weight="${i === 13 ? 600 : 400}" fill="${i === 13 ? "var(--ink)" : "var(--ink-3)"}" ${mono}>${i % 2 === 1 || i === 13 ? dd.getDate() : "SMTWTFS"[dd.getDay()]}</text>`;
  });
  s += `<line x1="${padL}" x2="${W}" y1="${y(g)}" y2="${y(g)}" stroke="var(--signal)" stroke-width="1.5" stroke-dasharray="5 4"/></svg>`;
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
  return `<div><b>${fmt(c.bmr)}</b><span class="label">Resting burn</span></div><div><b>${fmt(c.tdee)}</b><span class="label">With activity</span></div>
    <div><b>${fmt(c.kcal)}</b><span class="label">Suggested target${c.floored ? " (safe minimum)" : ""}</span></div><div><b>${c.protein}/${c.carbs}/${c.fat}</b><span class="label">Protein / carbs / fat g</span></div>`;
}
function splitHTML(g) {
  const gk = num(g.kcal) || 1, pp = num(g.protein) * 4 / gk * 100, cp = num(g.carbs) * 4 / gk * 100, fp = num(g.fat) * 9 / gk * 100;
  return { bar: `<span style="width:${Math.min(pp, 100)}%;background:var(--pro)"></span><span style="width:${Math.min(cp, 100)}%;background:var(--carb)"></span><span style="width:${Math.min(fp, 100)}%;background:var(--fat)"></span>`,
    note: `Protein ${r0(pp)}% · Carbs ${r0(cp)}% · Fat ${r0(fp)}% of calories${Math.abs(pp + cp + fp - 100) > 6 ? `. Your macros add up to ${fmt(num(g.protein) * 4 + num(g.carbs) * 4 + num(g.fat) * 9)} kcal.` : ""}` };
}
function renderGoals() {
  const st = settings();
  if (!G) G = { profile: { ...st.profile }, goals: { ...st.goals }, units: st.units };
  const p = G.profile, us = G.units === "us", c = calc(p);
  const ft = Math.floor(p.heightCm / 2.54 / 12), inch = Math.round(p.heightCm / 2.54 - ft * 12);
  const g = G.goals, sp = splitHTML(g);
  const days = Object.keys(S.days).length, foods = Object.keys(S.foods).length;
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const trow = (k, name, color, unit, big) => `<div class="trow ${big ? "big" : ""}"><span class="tn">${color ? `<i style="background:${color}"></i>` : ""}${name}</span><input id="g-${k}" inputmode="numeric" value="${r0(g[k])}" aria-label="${name} target"><span class="u">${unit}</span></div>`;
  $("#main").innerHTML = banners() + `
  <section class="hist-head"><div class="dl"><div class="label">Goals</div><h1>Daily targets</h1></div></section>
  <section class="targets">
    <div class="facts-head"><h2>Per day</h2><span class="label">${st.goalsSet ? "Saved" : "Default"}</span></div>
    <div class="rule-xl"></div>
    ${trow("kcal", "Calories", "", "kcal", true)}${trow("protein", "Protein", "var(--pro)", "g")}${trow("carbs", "Carbs", "var(--carb)", "g")}${trow("fat", "Fat", "var(--fat)", "g")}${trow("fiber", "Fiber", "var(--ink-2)", "g")}
    <div class="split" id="g-split" aria-hidden="true">${sp.bar}</div>
    <p class="note" id="g-note">${sp.note}</p>
  </section>
  <button class="btn primary block" style="margin-top:12px" data-act="save-goals">Save targets</button>

  <div class="section-h"><h2>Calculator</h2><span class="label">Mifflin–St Jeor</span></div>
  <p class="muted" style="margin:0 0 14px;font-size:14px">Estimates your resting burn, then multiplies by how active you are.</p>
  <div class="form">
    <div class="field full"><span class="label">Units</span><div class="seg"><button data-act="units" data-u="us" aria-pressed="${us}">lb / ft</button><button data-act="units" data-u="metric" aria-pressed="${!us}">kg / cm</button></div></div>
    <div class="field full"><span class="label">Sex</span><div class="seg"><button data-act="sex" data-s="male" aria-pressed="${p.sex === "male"}">Male</button><button data-act="sex" data-s="female" aria-pressed="${p.sex === "female"}">Female</button></div></div>
    <label class="field"><span class="label">Age</span><input id="p-age" inputmode="numeric" value="${r0(p.age)}"></label>
    <label class="field"><span class="label">Weight (${us ? "lb" : "kg"})</span><input id="p-wt" inputmode="decimal" value="${us ? r0(p.weightKg * 2.20462) : r1(p.weightKg)}"></label>
    <div class="field full"><span class="label">Height</span>${us ? `<div class="hpair"><input id="p-ft" inputmode="numeric" value="${ft}" aria-label="Feet"><input id="p-in" inputmode="numeric" value="${inch}" aria-label="Inches"></div>` : `<input id="p-cm" inputmode="numeric" value="${r0(p.heightCm)}" aria-label="Centimeters">`}</div>
    <label class="field full"><span class="label">Activity</span><select id="p-act">${ACT.map(([v, l]) => `<option value="${v}" ${v === p.activity ? "selected" : ""}>${l}</option>`).join("")}</select></label>
    <label class="field full"><span class="label">Goal</span><select id="p-pace">${PACE.map(([v, l]) => `<option value="${v}" ${v === p.pace ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  </div>
  <div class="result" id="calc-out">${calcOut(c)}</div>
  <button class="btn block" style="margin-top:14px" data-act="use-calc">Use these targets</button>
  <p class="note">If your Garmin shows a big active-calorie burn on training days, eat a bit more on those days rather than raising the everyday target. These are estimates, not medical advice.</p>

  <div class="section-h"><h2>Your data</h2><span class="label">On this phone</span></div>
  <div class="datasum"><div><b>${days}</b><span class="label">Days logged</span></div><div><b>${foods}</b><span class="label">Saved foods</span></div><div><b>${st.lastBackup ? esc(new Date(st.lastBackup).toLocaleDateString(undefined, { month: "short", day: "numeric" })) : "Never"}</b><span class="label">Last backup</span></div></div>
  <p class="note">Nothing leaves your phone except barcode and product-search lookups to Open Food Facts.</p>
  <div class="btnrow"><button class="btn" data-act="backup">Back up</button><button class="btn" data-act="restore">Restore</button></div>
  ${foods ? `<p style="margin:12px 0 0"><button class="link" data-act="manage-foods">Manage saved foods</button></p>` : ""}
  ${standalone ? "" : `<p class="note">To use it like an app: in Safari tap Share, then Add to Home Screen. In Chrome, open the ⋮ menu and choose Add to Home screen. Data in a home-screen app is safer from being cleared by the browser.</p>`}
  <p class="colophon">Fuel Log · v${VERSION} · Food data: USDA FoodData Central, Open Food Facts</p>`;
}
function refreshSplit() { const sp = splitHTML(G.goals), b = $("#g-split"), n = $("#g-note"); if (b) b.innerHTML = sp.bar; if (n) n.textContent = sp.note; }
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
  openSheet(`<div class="sheet-head"><div><div class="label">${list.length} saved</div><h2>Saved foods</h2></div>${X}</div>
    <div class="list">${list.map(([id, f]) => `<div class="row"><div class="main"><div class="nm">${esc(f.name)}</div><div class="sub">${f.brand ? `<span>${esc(f.brand)}</span>` : ""}<span>${esc(f.serving || "1 serving")}</span><span>${fmt(f.kcal)} kcal</span></div></div><button class="btn small danger" data-act="del-food" data-id="${esc(id)}">Remove</button></div>`).join("")}</div>
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

/* ---------- food database (bundled, works offline) ---------- */
// usda.json rows: [name, category, kcal, protein, carbs, fat, fiber, sugar, sodium mg, satFat, "portion|grams;..."] per 100 g
// products.json rows: [barcode, name, brand, serving label, serving grams, kcal, protein, carbs, fat, fiber, sugar, sodium mg, satFat] per 100 g
const DB = { usda: null, prod: null, loading: null };
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9%]+/g, " ").trim();
const stem = w => w.length > 3 ? w.replace(/ies$/, "y").replace(/(?<![aeiou])es$|s$/, "") : w;
const wordsOf = s => norm(s).split(" ").filter(Boolean).map(stem);
function loadDB() {
  if (DB.loading) return DB.loading;
  const get = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  DB.loading = Promise.all([get("data/usda.json?v=1"), get("data/products.json?v=1")]).then(([u, p]) => {
    // USDA names read "Base food, details": the base helps "egg" find "Egg, fried" before "Egg burrito"; "NFS" marks the generic version.
    if (u) DB.usda = u.map(r => ({ r, w: wordsOf(r[0]), len: r[0].length, base: wordsOf(r[0].split(",")[0]).join(" "), bonus: (/\bNFS\b/.test(r[0]) ? 1.2 : 0) + (/\braw\b/i.test(r[0]) ? 0.4 : 0) }));
    if (p) DB.prod = p.map((r, i) => ({ r, w: wordsOf(r[1]), bw: wordsOf(r[2]), len: r[1].length, bonus: -i / 40000 }));
    if (!u || !p) DB.loading = null; // try again next time (e.g. was offline)
    const q = $("#foodQ"); if (q) renderFoodList(q.value);
  });
  return DB.loading;
}
// Every query word must match the start of a word in the name (or the brand). Whole words, early words,
// the base food and shorter names rank higher.
function score(x, qws) {
  const words = x.w, bw = x.bw;
  let s = 0;
  for (const q of qws) {
    let best = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i], pos = Math.min(i, 3);
      if (w === q) best = Math.max(best, 3 - pos * 0.4);
      else if (w.startsWith(q)) best = Math.max(best, 1.6 - pos * 0.3);
    }
    if (bw) for (const w of bw) { if (w === q) best = Math.max(best, 2.6); else if (w.startsWith(q)) best = Math.max(best, 1.4); }
    if (best < 0) return null;
    s += best;
  }
  if (words[0] && words[0].startsWith(qws[0])) s += 2;
  if (x.base && x.base === qws.join(" ")) s += 1.5;
  return s - x.len / 50 + (x.bonus || 0);
}
function rank(list, qws, limit) {
  const out = [];
  for (const x of list) { const sc = score(x, qws); if (sc !== null) out.push([sc, x]); }
  out.sort((a, b) => b[0] - a[0]);
  return { total: out.length, items: out.slice(0, limit).map(o => o[1]) };
}
const servingLabel = p => /\d\s*(g|ml)\b/i.test(p.label) ? p.label : `${p.label} (${r1(p.g)} g)`;
function fromUSDA(r) {
  const [name, , kcal, protein, carbs, fat, fiber, sugar, sodium, satFat, ports] = r;
  const per100 = { kcal, protein, carbs, fat, fiber, sugar, sodium, satFat };
  const portions = String(ports || "").split(";").filter(Boolean).map(s => { const i = s.lastIndexOf("|"); return { label: s.slice(0, i), g: +s.slice(i + 1) }; }).filter(p => p.g > 0);
  portions.push({ label: "100 g", g: 100 });
  const p0 = portions[0];
  return cleanItem({ ...scaleFrom(per100, p0.g), name, serving: servingLabel(p0) }, { per100, grams: p0.g, portions, portion: 0 });
}
function fromProd(r) {
  const [code, name, brand, sl, sg, kcal, protein, carbs, fat, fiber, sugar, sodium, satFat] = r;
  const per100 = { kcal, protein, carbs, fat, fiber, sugar, sodium, satFat };
  const portions = sg > 0 ? [{ label: sl || `${r1(sg)} g`, g: sg }, { label: "100 g", g: 100 }] : [{ label: "100 g", g: 100 }];
  const p0 = portions[0];
  return cleanItem({ ...scaleFrom(per100, p0.g), name, brand, serving: servingLabel(p0) }, { per100, grams: p0.g, portions, portion: 0, barcode: code });
}

/* ---------- add sheet & search ---------- */
let addMeal = defaultMeal(), searchCtl = null, searchT = null, POOL = {}, MORE = {};
function openAdd(meal, focusSearch) {
  addMeal = meal || (S.date === todayKey() ? defaultMeal() : addMeal);
  MORE = {};
  openSheet(`<div class="sheet-head"><div><div class="label">${esc(dayLabel(S.date))}</div><h2>Log food</h2></div>${X}</div>
    <div class="seg" role="group" aria-label="Meal">${MEALS.map(m => `<button data-act="add-meal" data-meal="${m}" aria-pressed="${m === addMeal}">${m}</button>`).join("")}</div>
    <div class="searchbox">${I.search}<input id="foodQ" type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search foods and products" aria-label="Search foods"><button class="clear" data-act="clear-q" aria-label="Clear search" hidden>${I.x}</button></div>
    <div class="tools" id="tools">
      <button class="tool" data-act="scan-barcode">${I.barcode}<b>Scan<br>barcode</b></button>
      <button class="tool" data-act="scan-label">${I.label}<b>Scan<br>label</b></button>
      <button class="tool" data-act="quick">${I.quick}<b>Quick<br>add</b></button>
    </div>
    <div id="foodList" class="results"></div>`,
    el => {
      const q = el.querySelector("#foodQ");
      q.addEventListener("input", () => renderFoodList(q.value));
      q.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); q.blur(); runOnline(q.value); } });
      renderFoodList("");
      if (focusSearch) setTimeout(() => q.focus(), 300);
    });
  loadDB();
}
function localPool() {
  const pool = [], seen = new Set();
  const foods = Object.entries(S.foods).map(([id, f]) => ({ ...f, foodId: id })).sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  for (const f of foods) { seen.add((f.name || "").toLowerCase()); pool.push({ item: cleanItem(f, { foodId: f.foodId, per100: f.per100, grams: f.grams, barcode: f.barcode, portions: f.portions, portion: f.portions ? f.portions.findIndex(p => Math.abs(p.g - f.grams) < 0.5) : undefined }), tag: "Saved", src: "food" }); }
  const keys = Object.keys(S.days).sort().reverse().slice(0, 30);
  for (const k of keys) for (const e of entriesOf(k).slice().reverse()) {
    const n = (e.name || "").toLowerCase(); if (!n || seen.has(n)) continue; seen.add(n);
    pool.push({ item: cleanItem(e, { per100: e.per100, grams: e.grams }), tag: "Recent", src: "recent" });
  }
  return pool;
}
function rowHTML(group, i, it, tag) {
  return `<button class="row" data-act="pick" data-g="${group}" data-i="${i}" style="animation-delay:${Math.min(i, 8) * 18}ms"><div class="main"><div class="nm">${esc(it.name)}</div><div class="sub">${tag ? `<span class="tag ${tag === "Saved" ? "sig" : ""}">${tag}</span>` : ""}${it.brand ? `<span>${esc(it.brand)}</span>` : ""}<span>${esc(it.serving || "1 serving")}</span></div></div><div class="k">${fmt(it.kcal)}</div></button>`;
}
function groupHTML(key, title, items, total, tagOf) {
  if (!items.length) return "";
  const shown = items.length;
  return `<div class="grp"><span class="label">${title}</span><span class="cnt">${total > shown ? `${shown} of ${fmt(total)}` : fmt(total)}</span></div>
    <div>${items.map((it, i) => rowHTML(key, i, it, tagOf ? tagOf(i) : "")).join("")}</div>
    ${total > shown ? `<div class="more"><button class="btn small" data-act="more" data-g="${key}">Show more</button></div>` : ""}`;
}
const ONLINE_IDLE = `<div class="state"><button class="btn small" data-act="online">Search more products online</button></div>`;
function renderFoodList(qRaw) {
  const box = $("#foodList"); if (!box) return;
  const raw = String(qRaw || "").trim(), qws = wordsOf(raw);
  const tools = $("#tools"), clr = document.querySelector('[data-act="clear-q"]');
  if (tools) tools.hidden = !!raw; if (clr) clr.hidden = !raw;
  clearTimeout(searchT);
  if (searchCtl) { searchCtl.abort(); searchCtl = null; }
  const pool = localPool();
  if (!qws.length) {
    POOL.local = pool.slice(0, 12).map(p => p.item); POOL.localSrc = pool.slice(0, 12).map(p => p.src);
    box.innerHTML = POOL.local.length ? groupHTML("local", "Recent and saved", POOL.local, POOL.local.length, i => pool[i].tag)
      : `<p class="empty-hint">Search over 5,000 everyday foods and thousands of packaged products, or scan a barcode. Foods you log show up here for one-tap re-use.</p>`;
    return;
  }
  const lim = k => MORE[k] ? 40 : (k === "local" ? 4 : 6);
  const loc = pool.map(p => ({ p, w: wordsOf(p.item.name + " " + (p.item.brand || "")), len: p.item.name.length }));
  const L = rank(loc, qws, lim("local"));
  POOL.local = L.items.map(x => x.p.item); POOL.localSrc = L.items.map(x => x.p.src);
  let h = groupHTML("local", "Your foods", POOL.local, L.total, i => L.items[i].p.tag);
  if (DB.usda) {
    const U = rank(DB.usda, qws, lim("usda"));
    POOL.usda = U.items.map(x => fromUSDA(x.r));
    h += groupHTML("usda", "Everyday foods · USDA", POOL.usda, U.total);
  }
  let nProd = 0;
  if (DB.prod) {
    const P = rank(DB.prod, qws, lim("prod"));
    POOL.prod = P.items.map(x => fromProd(x.r)); nProd = P.total;
    h += groupHTML("prod", "Packaged products", POOL.prod, P.total);
  }
  if (!DB.usda || !DB.prod) h += `<div class="online"><div class="state"><span class="dotpulse"><i></i><i></i><i></i></span>Loading the food database…</div></div>`;
  h += `<div class="grp"><span class="label">More products online</span><span class="cnt">Open Food Facts</span></div><div class="online" id="onlineBox">${ONLINE_IDLE}</div>`;
  if (!L.total && DB.usda && !POOL.usda.length && !nProd) h = `<p class="empty-hint">Nothing matched “${esc(raw)}” in the built-in database. Try fewer or different words.</p>` + h;
  h += `<p style="text-align:center;margin:18px 0 0"><button class="link" data-act="manual">Enter a food manually</button></p>`;
  box.innerHTML = h;
  // Look online automatically only when the built-in database comes up short.
  if (raw.length >= 3 && DB.prod && nProd < 3) searchT = setTimeout(() => runOnline(raw), 1000);
}
async function runOnline(q) {
  q = (q || "").trim(); if (q.length < 2) return;
  if (searchCtl) searchCtl.abort();
  const ctl = searchCtl = new AbortController();
  const box = () => $("#onlineBox");
  if (!box()) return;
  if (!navigator.onLine) { box().innerHTML = `<div class="state">You're offline. The built-in foods above still work.</div>`; return; }
  box().innerHTML = `<div class="state"><span class="dotpulse"><i></i><i></i><i></i></span>Searching Open Food Facts…</div>`;
  try {
    const res = await offSearch(q, ctl.signal);
    if (ctl.signal.aborted || !box()) return;
    POOL.online = res.slice(0, 20);
    box().innerHTML = POOL.online.length ? POOL.online.map((it, i) => rowHTML("online", i, it, "")).join("") : `<div class="state">No more products matched online. Try the brand name, or scan the barcode.</div>`;
  } catch (e) {
    if (ctl.signal.aborted || !box()) return;
    box().innerHTML = `<div class="state" style="flex-wrap:wrap">Open Food Facts is busy right now.<button class="btn small" data-act="online">Try again</button></div>`;
  }
}

/* ---------- review / edit ---------- */
let R = null;
const SRC_LABEL = { label: "From the nutrition label", barcode: "From your saved foods", off: "From Open Food Facts", prod: "From Open Food Facts", usda: "USDA FoodData Central", common: "Common food (USDA values)", manual: "Manual entry", quick: "Quick add", food: "From your foods", recent: "From your log", edit: "Logged entry" };
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
  const f = (k, lbl, color) => `<label><span class="label">${color ? `<i style="background:${color}"></i>` : ""}${lbl}</span><input class="${fl.includes(k) ? "flag" : ""}" data-i="${i}" data-k="${k}" inputmode="decimal" value="${it[k] ? (k === "kcal" ? r0(it[k]) : r1(it[k])) : ""}" placeholder="0"></label>`;
  const ports = it.per100 && it.portions && it.portions.length > 1 ? `<div class="portions" role="group" aria-label="Portion">${it.portions.map((p, j) => `<button class="pchip" data-act="portion" data-i="${i}" data-p="${j}" aria-pressed="${j === it.portion}">${esc(p.label)}</button>`).join("")}</div>` : "";
  return `<div class="nf">
    <div class="nf-top"><input class="name" data-i="${i}" data-k="name" value="${esc(it.name)}" placeholder="Name this food" aria-label="Food name">${R.items.length > 1 ? `<button class="x" data-act="rm-item" data-i="${i}" aria-label="Remove item">${I.x}</button>` : ""}</div>
    ${it.brand ? `<div class="brand-l">${esc(it.brand)}</div>` : ""}
    <div class="serv"><span class="label">Serving</span><input data-i="${i}" data-k="serving" value="${esc(it.serving)}" placeholder="e.g. 1 cup (240 g)" aria-label="Serving size"></div>
    <div class="bar9"></div>
    ${ports}
    <div class="amount">${it.per100 ? `<span class="grams"><input data-i="${i}" data-k="grams" inputmode="decimal" value="${r1(it.grams || 100)}" aria-label="Grams per serving">G ×</span>` : `<span class="label">Servings</span>`}<div class="stepper"><button data-act="qty" data-d="-0.5" data-i="${i}" aria-label="Fewer servings">−</button><input data-i="${i}" data-k="qty" inputmode="decimal" value="${r1(it.qty)}" aria-label="Servings"><button data-act="qty" data-d="0.5" data-i="${i}" aria-label="More servings">+</button></div><span class="ik" id="ik-${i}">${fmt(it.kcal * it.qty)}<small>KCAL</small></span></div>
    <div class="facts-grid">${f("kcal", "Calories")}${f("protein", "Protein g", "var(--pro)")}${f("carbs", "Carbs g", "var(--carb)")}${f("fat", "Fat g", "var(--fat)")}</div>
    <details class="more-n" ${fl.some(k => ["fiber", "sugar", "satFat"].includes(k)) ? "open" : ""}><summary>More nutrients</summary><div class="facts-grid" style="border-top-width:1px">${f("fiber", "Fiber g")}${f("sugar", "Sugar g")}${f("satFat", "Sat fat g")}${f("sodium", "Sodium mg")}</div></details>
  </div>`;
}
const reviewTotals = () => { const t = totals(R.items); return `<b>${fmt(t.kcal)} kcal</b>P ${fmt(t.protein)}g · C ${fmt(t.carbs)}g · F ${fmt(t.fat)}g`; };
function refreshItem(i) {
  const it = R.items[i];
  for (const k of NUTR) { const el = document.querySelector(`input[data-i="${i}"][data-k="${k}"]`); if (el && el !== document.activeElement) el.value = it[k] ? (k === "kcal" ? r0(it[k]) : r1(it[k])) : ""; }
  const sv = document.querySelector(`input[data-i="${i}"][data-k="serving"]`); if (sv && sv !== document.activeElement) sv.value = it.serving;
  const gr = document.querySelector(`input[data-i="${i}"][data-k="grams"]`); if (gr && gr !== document.activeElement && it.grams) gr.value = r1(it.grams);
  document.querySelectorAll(`.pchip[data-i="${i}"]`).forEach(c => c.setAttribute("aria-pressed", +c.dataset.p === it.portion));
  const ik = $("#ik-" + i); if (ik) ik.innerHTML = `${fmt(it.kcal * (it.qty || 0))}<small>KCAL</small>`;
  const tot = $("#revTot"); if (tot) tot.innerHTML = reviewTotals();
}
function renderReview() {
  const editing = !!R.editId;
  openSheet(`<div class="sheet-head"><div><div class="label">${esc(SRC_LABEL[R.src] || "")}</div><h2>${editing ? "Edit entry" : "Add to log"}</h2></div>${X}</div>
    ${R.thumb ? `<img class="thumb" src="${R.thumb}" alt="Your label photo">` : ""}
    ${R.warn ? `<p class="notice warn">${esc(R.warn)}</p>` : ""}
    ${R.notes ? `<p class="notice">${esc(R.notes)}</p>` : ""}
    ${R.items.map(itemCard).join("")}
    ${R.rawText ? `<details class="raw"><summary>Text the scanner read</summary><pre>${esc(R.rawText)}</pre></details>` : ""}
    ${!editing ? `<button class="link add-another" data-act="add-item">Add another item</button>` : ""}
    <div class="meal-pick"><span class="label">Meal</span><div class="seg" role="group" aria-label="Meal">${MEALS.map(m => `<button data-act="rev-meal" data-meal="${m}" aria-pressed="${m === R.meal}">${m}</button>`).join("")}</div></div>
    ${!editing && R.src !== "food" && R.src !== "barcode" ? `<label class="check"><input type="checkbox" id="saveFoods" ${R.saveFoods ? "checked" : ""}> Save to my foods for one-tap re-use${R.barcode ? ` (linked to barcode ${esc(R.barcode)})` : ""}</label>` : ""}
    <div class="sheet-foot">${editing ? `<button class="btn danger" data-act="delete-entry">Delete</button>` : ""}<div class="tot" id="revTot">${reviewTotals()}</div><button class="btn primary" data-act="commit">${editing ? "Save" : "Add to " + R.meal}</button></div>`,
    el => {
      el.addEventListener("input", e => {
        const t = e.target; if (t.id === "saveFoods") { R.saveFoods = t.checked; return; }
        const i = t.dataset.i, k = t.dataset.k; if (i == null || !k) return;
        const it = R.items[+i];
        if (k === "name" || k === "serving") { it[k] = t.value; return; }
        if (k === "grams") {
          const g = num(t.value); if (!(g > 0) || !it.per100) return;
          it.grams = g; Object.assign(it, scaleFrom(it.per100, g)); it.serving = `${r1(g)} g`;
          it.portion = it.portions ? it.portions.findIndex(p => Math.abs(p.g - g) < 0.5) : -1; refreshItem(+i); return;
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
      if (it.per100) { food.per100 = it.per100; food.grams = it.grams; if (Array.isArray(it.portions)) food.portions = it.portions.slice(0, 8); }
      saveFood(foodId, food);
    }
    list.push({ ...strip(it), id: uid(), meal: R.meal, src: R.src, foodId, t: now });
  }
  saveDay(date, list);
  const k = totals(items).kcal, meal = R.meal;
  if (navigator.vibrate) navigator.vibrate(12);
  closeSheet(); if (S.view !== "day") go("day"); else render();
  toast(`Added ${fmt(k)} kcal to ${meal}`);
}

/* ---------- scanner sheet ---------- */
function openScanner() {
  openSheet(`<div class="sheet-head"><div><div class="label">${esc(addMeal)}</div><h2>Scan a barcode</h2></div>${X}</div>
    <div class="scanner"><video id="scanVid" playsinline muted autoplay></video><div class="reticle"></div></div>
    <p class="muted" id="scanMsg" style="text-align:center;margin:10px 0 14px">Line the barcode up inside the box.</p>
    <div class="row2"><input id="codeQ" inputmode="numeric" pattern="[0-9]*" placeholder="Or type the barcode number" aria-label="Barcode number"><button class="btn" data-act="code-go">Look up</button></div>
    <p style="text-align:center;margin:10px 0 0"><button class="link" data-act="barcode-photo">Take a photo instead</button></p>`,
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
    case "quick": openReview({ src: "quick", items: [blankItem({ name: "Quick add" })] }); setTimeout(() => { const k = document.querySelector('input[data-k="kcal"]'); if (k) k.focus(); }, 250); break;
    case "manual": openReview({ src: "manual", items: [blankItem()], saveFoods: true }); break;
    case "manual-for": openReview({ src: "manual", items: [blankItem()], saveFoods: true, barcode: S.pendingBarcode }); break;
    case "pick": {
      const g = b.dataset.g, i = +b.dataset.i;
      if (g === "local") { const it = POOL.local[i], src = POOL.localSrc[i]; if (!it) return; openReview({ src, items: [{ ...it, qty: src === "food" ? 1 : it.qty }] }); }
      else if (g === "usda") { const it = POOL.usda && POOL.usda[i]; if (it) openReview({ src: "usda", items: [{ ...it }], saveFoods: false }); }
      else if (g === "prod") { const it = POOL.prod && POOL.prod[i]; if (it) openReview({ src: "prod", items: [{ ...it }], barcode: it.barcode ? normCode(it.barcode) : null, saveFoods: true }); }
      else if (g === "online") { const it = POOL.online && POOL.online[i]; if (it) openReview({ src: "off", items: [{ ...it }], barcode: it.barcode ? normCode(it.barcode) : null, saveFoods: true }); }
      break;
    }
    case "more": { MORE[b.dataset.g] = true; const q = $("#foodQ"); renderFoodList(q ? q.value : ""); break; }
    case "online": { const q = $("#foodQ"); if (q) runOnline(q.value); break; }
    case "clear-q": { const q = $("#foodQ"); if (q) { q.value = ""; MORE = {}; renderFoodList(""); q.focus(); } break; }
    case "portion": {
      const i = +b.dataset.i, it = R.items[i], p = it && it.portions && it.portions[+b.dataset.p]; if (!p) return;
      if (!it.per100) { toast("You edited the numbers, so portions are off for this item."); return; }
      it.grams = p.g; it.portion = +b.dataset.p; Object.assign(it, scaleFrom(it.per100, p.g)); it.serving = servingLabel(p); refreshItem(i); break;
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
  if (S.view === "goals" && G && /^g-/.test(e.target.id || "")) { readProfile(); refreshSplit(); return; }
  if (S.view !== "goals" || !G || !e.target.id || !/^p-/.test(e.target.id)) return;
  readProfile(); const o = $("#calc-out"); if (o) o.innerHTML = calcOut(calc(G.profile));
});
document.addEventListener("change", e => { if (S.view === "goals" && G && /^p-(act|pace)$/.test(e.target.id)) { readProfile(); $("#calc-out").innerHTML = calcOut(calc(G.profile)); } });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
let lastToday = todayKey();
document.addEventListener("visibilitychange", () => { if (document.hidden) return; const t = todayKey(); if (t !== lastToday) { if (S.date === lastToday) S.date = t; lastToday = t; render(); } });

let touch0 = null;
document.addEventListener("touchstart", e => { touch0 = (S.view === "day" && $("#sheet").hidden && e.touches.length === 1) ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null; }, { passive: true });
document.addEventListener("touchend", e => {
  if (!touch0) return; const t = e.changedTouches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y, fast = Date.now() - touch0.t < 600; touch0 = null;
  if (fast && Math.abs(dx) > 70 && Math.abs(dy) < 45) { S.date = addDays(S.date, dx > 0 ? -1 : 1); shownKcal = null; render(); }
}, { passive: true });

/* ---------- boot ---------- */
load();
route();
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
