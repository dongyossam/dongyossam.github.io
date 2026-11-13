(function () {
  const TS = { ".sv": "timestamp" };
  const load = () => { try { return JSON.parse(localStorage.getItem("fakedb") || "{}"); } catch (e) { return {}; } };
  const parts = p => p.split("/").filter(Boolean);
  const getAt = (t, p) => parts(p).reduce((o, k) => (o && typeof o === "object") ? o[k] : undefined, t);
  const resolve = v => v && v[".sv"] ? Date.now() : (v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)])) : v);
  function setAt(p, v) { const t = load(), ks = parts(p); let o = t; ks.slice(0, -1).forEach(k => { o[k] = o[k] && typeof o[k] === "object" ? o[k] : {}; o = o[k]; });
    if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = resolve(v);
    localStorage.setItem("fakedb", JSON.stringify(t)); fire(); }
  const L = [];
  function fire() { L.forEach(l => l.run()); }
  window.addEventListener("storage", e => { if (e.key === "fakedb") fire(); });
  let n = 0;
  function ref(p) {
    const r = { path: p, _lim: 0,
      child(c) { return ref(p + "/" + c); },
      orderByChild() { return r; }, limitToLast(k) { r._lim = k; return r; },
      on(ev, cb) {
        if (p === ".info/connected") { setTimeout(() => cb({ val: () => true }), 0); return; }
        const seen = new Set(); const l = { run() { const v = getAt(load(), p);
          if (ev === "value") cb({ val: () => v === undefined ? null : v });
          else if (ev === "child_added") Object.entries(v || {}).forEach(([k, x]) => { if (!seen.has(k)) { seen.add(k); cb({ key: k, val: () => x }); } });
          else if (ev === "child_removed") [...seen].forEach(k => { if (!v || !(k in v)) { seen.delete(k); cb({ key: k, val: () => null }); } }); } };
        if (ev === "child_removed") Object.keys(getAt(load(), p) || {}).forEach(k => seen.add(k));
        L.push(l); setTimeout(() => l.run(), 0); r._l = (r._l || []).concat(l);
      },
      off() { (r._l || []).forEach(l => { const i = L.indexOf(l); if (i >= 0) L.splice(i, 1); }); },
      async set(v) { setAt(p, v); }, async remove() { setAt(p, null); },
      async push(v) { const k = "k" + Date.now() + "_" + (n++); setAt(p + "/" + k, v); return ref(p + "/" + k); },
      onDisconnect() { return { remove() {} }; } };
    return r;
  }
  const db = { ref };
  firebase.database = Object.assign(() => db, { ServerValue: { TIMESTAMP: TS } });
})();
