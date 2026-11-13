// Collector.gs 를 Node 에서 돌리는 흉내 서버 (시트·캐시·속성·메일 흉내)
const fs = require("fs"), vm = require("vm"), http = require("http"), crypto = require("crypto");
const SRC = process.argv[2], PORT = +process.argv[3] || 8811;
const MAIL = [], RT = {};
const resp = (code, body) => ({ getResponseCode: () => code, getContentText: () => typeof body === "string" ? body : JSON.stringify(body) });
const UrlFetchApp = { fetch(url, o) {
  o = o || {};
  if (/accounts:lookup/.test(url)) { const t = JSON.parse(o.payload).idToken.split("|"); return t[0] === "fake" ? resp(200, { users: [{ email: t[1], localId: t[2] }] }) : resp(400, { error: "bad" }); }
  if (/oauth2\.googleapis\.com\/token/.test(url)) return resp(200, { access_token: "AT" });
  if (/firebasedatabase\.app/.test(url)) { const path = url.split(".app")[1].replace(/\.json.*$/, ""); if ((o.method || "get") === "delete") delete RT[path]; else if (o.method === "put") RT[path] = JSON.parse(o.payload); return resp(200, RT[path] || null); }
  return resp(404, ""); } };
const looksDate = v => typeof v === "string" && (/^\d{4}-\d{2}(-\d{2}( \d{2}:\d{2}(:\d{2})?)?)?$/.test(v) || /^\d{1,2}\/\d{1,2}$/.test(v));
function toCell(v, fmt) {
  if (fmt === "@" || !looksDate(v)) return v;
  if (/^\d{1,2}\/\d{1,2}$/.test(v)) { const [mm, dd] = v.split("/").map(Number); return new Date(Date.UTC(2026, mm - 1, dd, -9)); }
  const [d, t] = v.split(" "), [y, m, dd] = d.split("-").map(Number), [hh, mi, ss] = (t || "0:0:0").split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, dd || 1, (hh || 0) - 9, mi || 0, ss || 0)); // 한국 시간
}
function Sheet(name) {
  this.name = name; this.rows = []; this.fmt = {};
}
Sheet.prototype = {
  getName() { return this.name; },
  width() { return Math.max(0, ...this.rows.map(r => r.length)); },
  appendRow(a) { this.rows.push(a.map((v, i) => toCell(v, this.fmt[i + 1]))); },
  setFrozenRows() {}, getLastRow() { return this.rows.length; },
  deleteRow(i) { this.rows.splice(i - 1, 1); },
  getDataRange() { const w = this.width(), sh = this; return { getValues() { return sh.rows.map(r => Array.from({ length: w }, (_, i) => r[i] === undefined ? "" : r[i])); } }; },
  getRange(r, c, nr, nc) {
    const sh = this;
    if (typeof r === "string") { const col = r.charCodeAt(0) - 64; return { setNumberFormat(f) { sh.fmt[col] = f; return this; } }; }
    nr = nr || 1; nc = nc || 1;
    const cell = (i, j) => { while (sh.rows.length < r + i) sh.rows.push([]); return sh.rows[r - 1 + i]; };
    return {
      setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { cell(i)[c - 1 + j] = toCell(x, sh.fmt[c + j] || (sh.cellFmt || {})[(r + i) + ":" + (c + j)]); })); return this; },
      setValue(x) { cell(0)[c - 1] = toCell(x, sh.fmt[c] || (sh.cellFmt || {})[r + ":" + c]); return this; },
      getValues() { return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = sh.rows[r - 1 + i] || []; const x = row[c - 1 + j]; return x === undefined ? "" : x; })); },
      setFontWeight() { return this; }, setWrap() { return this; },
      setNumberFormat(f) { sh.cellFmt = sh.cellFmt || {}; for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.cellFmt[(r + i) + ":" + (c + j)] = f; return this; }
    };
  }
};
const SHEETS = {};
const ss = { getSheetByName: n => SHEETS[n] || null, insertSheet: n => (SHEETS[n] = new Sheet(n)) };
const cache = {}, props = {};
const pad = n => String(n).padStart(2, "0");
const ctx = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  CacheService: { getScriptCache: () => ({ get: k => (cache[k] && cache[k].exp > Date.now() ? cache[k].v : null), put: (k, v, s) => { cache[k] = { v, exp: Date.now() + (s || 600) * 1000 }; }, remove: k => { delete cache[k]; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] === undefined ? null : props[k], setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getProperties: () => ({ ...props }) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  MailApp: { sendEmail: o => { MAIL.push(o); } },
  Logger: { log() {} }, UrlFetchApp, Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@test.kr' }) },
  DriveApp: (() => { const F = {}; let n = 0, fo = 1;
    const file = fid => ({ getId: () => fid, getName: () => F[fid].name, getSize: () => F[fid].bytes.length, setSharing(a) { F[fid].share = a; }, moveTo(f) { F[fid].folder = f.getId(); }, setTrashed() { F[fid].trashed = true; },
      getBlob: () => ({ getBytes: () => F[fid].bytes, getContentType: () => F[fid].mime }) });
    const folder = (id, name) => ({ getId: () => id, isTrashed: () => false, getUrl: () => "https://drive.google.com/drive/folders/" + id,
      createFolder: nm => folder("FOLDER" + String(++fo).padStart(19, "0"), nm),
      createFile: b => { const fid = "FILE" + String(++n).padStart(24, "0"); F[fid] = Object.assign({ folder: id, share: 0 }, b); return file(fid); } });
    return { Access: { ANYONE_WITH_LINK: 1, PRIVATE: 0 }, Permission: { VIEW: 1, NONE: 0 }, files: F,
      createFolder: name => folder("FOLDER0000000000000000001", name), getFolderById: id => folder(id), getFileById: id => { if (!F[id]) throw new Error("no file"); return file(id); } }; })(),
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
  Utilities: {
    DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
    computeDigest: (a, s) => [...crypto.createHash("sha256").update(s, "utf8").digest()].map(b => b > 127 ? b - 256 : b),
    getUuid: () => crypto.randomUUID(),
    base64Decode: t => [...Buffer.from(t, "base64")],
    base64Encode: b => Buffer.from(b.map(x => x & 255)).toString("base64"),
    base64EncodeWebSafe: s => Buffer.from(typeof s === "string" ? Buffer.from(s, "utf8") : s.map(x => x & 255)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
    computeRsaSha256Signature: (s, k) => [...crypto.createSign("RSA-SHA256").update(s).sign(k)].map(b => b > 127 ? b - 256 : b),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name }),
    formatDate: (d, tz, f) => { const k = new Date(d.getTime() + 9 * 3600000); return f.replace("yyyy", k.getUTCFullYear()).replace("MM", pad(k.getUTCMonth() + 1)).replace("dd", pad(k.getUTCDate())).replace("HH", pad(k.getUTCHours())).replace("mm", pad(k.getUTCMinutes())).replace("ss", pad(k.getUTCSeconds())); }
  },
  console, JSON, Date, Math, Number, String, Array, Object, isFinite, Error, RegExp
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, "utf8") + "\n;this.doGet=doGet;this.doPost=doPost;", ctx);
http.createServer((req, res) => {
  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    const u = new URL(req.url, "http://x");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    if (u.pathname === "/__flush") { for (const k in cache) delete cache[k]; return res.end("{}"); }
    if (u.pathname === "/__files") return res.end(JSON.stringify(Object.fromEntries(Object.entries(ctx.DriveApp.files).map(([k, b]) => [k, { name: b.name, mime: b.mime, size: b.bytes.length, share: b.share, folder: b.folder, trashed: !!b.trashed }]))));
    if (u.pathname === "/__rt") return res.end(JSON.stringify(RT));
    if (u.pathname === "/__mail") return res.end(JSON.stringify(MAIL));
    if (u.pathname === "/__sheets") return res.end(JSON.stringify(Object.fromEntries(Object.entries(SHEETS).map(([k, v]) => [k, v.rows]))));
    if (u.pathname === "/__set") { const a = JSON.parse(body); vm.runInContext(a.code, ctx); return res.end("{}"); }
    const out = req.method === "GET" ? ctx.doGet({ parameter: Object.fromEntries(u.searchParams) }) : ctx.doPost({ postData: { contents: body } });
    res.end(out.t);
  });
}).listen(PORT, () => console.log("gas mock on", PORT));
