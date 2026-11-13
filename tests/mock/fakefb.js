window.firebase = (function () {
  const apps = [], ls = []; let user = null;
  const mk = (e, u) => ({ email: e, uid: u, getIdToken: async () => "fake|" + e + "|" + u });
  try { const s = sessionStorage.getItem("__fu"); if (s) { const [e, u] = s.split("|"); user = mk(e, u); } } catch (x) {}
  function auth() { return { get currentUser() { return user; }, onAuthStateChanged(cb) { ls.push(cb); setTimeout(() => cb(user), 0); },
    async signInWithPopup() { const e = window.__fakeEmail || "kim@test.kr", u = window.__fakeUid || "uidkim"; user = mk(e, u); sessionStorage.setItem("__fu", e + "|" + u); ls.forEach(cb => cb(user)); return { user }; },
    async signOut() { user = null; sessionStorage.removeItem("__fu"); ls.forEach(cb => cb(null)); } }; }
  auth.GoogleAuthProvider = function () {};
  return { apps, initializeApp(c) { apps.push(c); return {}; }, auth, database() { throw new Error("no db in test"); } };
})();
