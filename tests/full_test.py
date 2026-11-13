#!/usr/bin/env python3
"""동요샘 노래상자 — 2단계 전체 시험

  python3 tests/full_test.py

기능 수정(새 기능·화면 배치·서버나 저장 방식) 때 돌려요. 먼저 1단계 코드 검사를 하고,
통과하면 진짜 화면(index.html)을 브라우저로 띄워 새 기능과 기존 기능을 한 번씩 밟아 봐요.

  · 서버는 Collector.gs 를 흉내 서버(tests/mock/server.js)에서 그대로 돌려요 (시트·드라이브·메일 흉내)
  · 구글 로그인과 실시간 대화는 가짜 파이어베이스(tests/mock/fakefb.js, fakedb.js)로 바꿔 끼워요
  · 진짜 시트·진짜 회원 기록은 건드리지 않아요

필요한 것: node, python3, playwright(크로미움). 처음 한 번 tests/.lib 에 화면용 라이브러리를 받아 둬요.
화면 사진은 tests/결과/ 에 남아요.
"""
import base64, functools, http.server, io, json, os, socket, subprocess, sys, threading, time, traceback, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, "결과"); os.makedirs(OUT, exist_ok=True)
LIB = os.path.join(HERE, ".lib")
RESULTS = []  # (이름, 통과?, 설명)


# ---------- 준비 ----------
def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def ensure_libs():
    need = {"qrcode-generator/qrcode.js": "qrcode-generator@1.4.4", "pdf-lib/dist/pdf-lib.min.js": "pdf-lib@1.17.1", "xlsx/dist/xlsx.full.min.js": "xlsx@0.18.5"}
    miss = [pkg for f, pkg in need.items() if not os.path.exists(os.path.join(LIB, "node_modules", f))]
    if miss:
        print("  화면용 라이브러리 받는 중:", " ".join(miss))
        subprocess.run(["npm", "install", "--no-save", "--no-audit", "--no-fund", "--prefix", LIB] + miss, check=True, capture_output=True)
    rd = lambda f: open(os.path.join(LIB, "node_modules", f), encoding="utf-8").read()
    return {"qrcode-generator": rd("qrcode-generator/qrcode.js"), "pdf-lib": rd("pdf-lib/dist/pdf-lib.min.js"), "xlsx": rd("xlsx/dist/xlsx.full.min.js")}


class Mock:
    def __init__(self):
        self.port = free_port()
        self.proc = subprocess.Popen(["node", os.path.join(HERE, "mock", "server.js"), os.path.join(ROOT, "Collector.gs"), str(self.port)],
                                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        line = self.proc.stdout.readline()
        if "gas mock on" not in line: raise RuntimeError("흉내 서버가 안 떴어요: " + line + self.proc.stdout.read())
        self.url = f"http://127.0.0.1:{self.port}"
        # 회원방 실시간 대화를 켜려면 서비스 계정 열쇠가 있어야 해서, 시험용 가짜 열쇠를 넣어 둬요
        key = subprocess.run(["openssl", "genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048"], capture_output=True, text=True).stdout
        code = 'PropertiesService.getScriptProperties().setProperty("FIREBASE_SA",' + json.dumps(json.dumps({"client_email": "test@test", "private_key": key})) + ')'
        urllib.request.urlopen(urllib.request.Request(self.url + "/__set", data=json.dumps({"code": code}).encode(), method="POST"))

    def get(self, path): return json.loads(urllib.request.urlopen(self.url + path).read())

    def rpc(self, fn, *a):
        r = json.loads(urllib.request.urlopen(urllib.request.Request(self.url + "/", data=json.dumps({"fn": fn, "args": list(a)}).encode(), method="POST")).read())
        if not r.get("ok"): raise AssertionError(f"서버 {fn} 실패: {r.get('error')}")
        return r["result"]

    def sheet(self, name): return self.get("/__sheets").get(name, [])

    def stop(self): self.proc.kill()


def static_server():
    port = free_port()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    H = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}/", srv


def tiny_jpg(color):
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (64, 48), color).save(b, "JPEG"); p = os.path.join(OUT, f"_photo_{color}.jpg"); open(p, "wb").write(b.getvalue()); return p


# ---------- 시험 틀 ----------
def step(name):
    def wrap(fn):
        def run(*a, **k):
            t = time.time()
            try:
                note = fn(*a, **k) or ""
                RESULTS.append((name, True, note)); print(f"  통과  {name}" + (f" — {note}" if note else ""))
            except Exception as e:
                msg = str(e).splitlines()[0][:200] if str(e) else e.__class__.__name__
                RESULTS.append((name, False, msg)); print(f"  걸림  {name} — {msg}")
                if os.environ.get("TEST_DEBUG"): traceback.print_exc()
        return run
    return wrap


def need(cond, msg):
    if not cond: raise AssertionError(msg)


class Browser:
    def __init__(self, pw, base, mock, libs, fake):
        self.b = pw.chromium.launch(); self.base, self.mock, self.libs, self.fake = base, mock, libs, fake
        self.errors = []

    def page(self, w=1280, h=900, who=None, store=None, ua=None, fakedb_seed=None):
        ctx = self.b.new_context(viewport={"width": w, "height": h}, accept_downloads=True, user_agent=ua) if ua else self.b.new_context(viewport={"width": w, "height": h}, accept_downloads=True)
        try: ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception: pass
        pg = ctx.new_page()
        tag = f"[{w}px{' ' + who.split('|')[0] if who else ''}]"
        pg.on("pageerror", lambda e: self.errors.append(f"{tag} {e}"))
        pg.on("console", lambda m: self.errors.append(f"{tag} 콘솔 오류: {m.text}") if m.type == "error" and "favicon" not in m.text and "Failed to load resource" not in m.text else None)
        pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
        pg.route("https://fonts.gstatic.com/**", lambda r: r.fulfill(status=404, body=""))
        pg.route("https://script.google.com/**", self._gas)
        pg.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=self.fake if "app-compat" in r.request.url else ""))
        pg.route("https://www.youtube-nocookie.com/**", lambda r: r.fulfill(status=200, content_type="text/html", body="<body>영상 자리</body>"))
        for k, body in self.libs.items():
            pg.route(f"https://cdnjs.cloudflare.com/ajax/libs/{k}/**", (lambda body: lambda r: r.fulfill(status=200, content_type="application/javascript", body=body))(body))
        init = ""
        if fakedb_seed is not None: init += f'if(!localStorage.getItem("fakedb"))localStorage.setItem("fakedb",{json.dumps(json.dumps(fakedb_seed))});'
        if who: init += f'sessionStorage.setItem("__fu",{json.dumps(who)});'
        for k, v in (store or {}).items(): init += f'localStorage.setItem({json.dumps(k)},{json.dumps(json.dumps(v))});'
        if init: pg.add_init_script(init)
        return pg

    def _gas(self, route):
        req = route.request
        q = req.url.split("/exec", 1)[1] if "/exec" in req.url else ""
        data = req.post_data.encode() if req.method == "POST" else None
        r = urllib.request.urlopen(urllib.request.Request(self.mock.url + "/" + q.lstrip("/"), data=data, method=req.method))
        route.fulfill(status=200, content_type="application/json", body=r.read())

    def close(self): self.b.close()


def ready(pg, ms=6000):
    """불러오는 중 화면이 끝날 때까지 기다려요."""
    pg.wait_for_function("() => !document.querySelector('.booting')", timeout=ms)
    pg.wait_for_timeout(300)


def toast(pg):
    try: return pg.inner_text("#toastHost")
    except Exception: return ""


def shot(pg, name, full=False):
    try: pg.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)
    except Exception: pass


# ---------- 시험 내용 ----------
OWN = "fake|owner@test.kr|uidowner"
KIM, LEE = "fake|kim@test.kr|uidkim", "fake|lee@test.kr|uidlee"
SEED = {"members": {"uidkim": {"n": "김회원", "op": False}, "uidlee": {"n": "이노래", "op": False}, "uidowner": {"n": "동요샘 관리 계정", "op": True}}}


def run_all(B, M):
    U = B.base
    S = {}

    @step("손님: 첫 화면과 메뉴 이동")
    def guest_nav():
        pg = B.page(); pg.goto(U); ready(pg); shot(pg, "01_손님_첫화면")
        tabs = [t.get_attribute("data-tab") for t in pg.locator("nav#tabs button").all()]
        need(len(tabs) >= 4, f"맨 위 메뉴가 {len(tabs)}개뿐이에요")
        for t in tabs:
            pg.click(f'nav#tabs [data-tab="{t}"]'); pg.wait_for_timeout(350)
            need(pg.inner_text("#view").strip(), f"'{t}' 화면이 비어 있어요")
        S["guest"] = pg
        return "메뉴 " + ", ".join(tabs)
    guest_nav()

    @step("손님: 곡 열기 · 노래방 화면 · 곡 QR")
    def song_sheet():
        pg = B.page(); pg.goto(U + "?song=2"); ready(pg); pg.wait_for_selector(".sheet h3", timeout=4000)
        title = pg.inner_text(".sheet h3")
        pg.click('[data-karaoke="2"]'); pg.wait_for_selector(".kara", timeout=3000); pg.keyboard.press("ArrowRight"); pg.wait_for_timeout(200)
        need(pg.locator(".k-line.now").count() == 1, "노래방 화면에 지금 줄이 안 보여요")
        pg.click("[data-k=close]"); pg.wait_for_timeout(200); need(pg.locator(".kara").count() == 0, "노래방 화면이 안 닫혀요")
        pg.click("[data-songqr]"); pg.wait_for_selector(".qr-url", timeout=4000)
        need("song=2" in pg.inner_text(".qr-url"), "곡 QR 주소에 곡 번호가 없어요")
        shot(pg, "02_곡_QR"); pg.context.close()
        return title
    song_sheet()

    @step("가입: 구글 로그인 → 가입 신청(동요샘 회원 신청 포함)")
    def signup():
        pg = B.page(store={}); pg.goto(U + "?tab=mine"); ready(pg)
        pg.click("[data-glogin]"); pg.wait_for_selector("#suName", timeout=4000)
        pg.fill("#suName", "김회원"); pg.fill("#suSchool", "햇살초등학교"); pg.select_option("#suRegion", "전북")
        pg.check("#suMember"); pg.wait_for_selector("#suPos", timeout=2000)
        pg.select_option("#suPos", "교사"); pg.fill("#suPhone", "01012345678"); pg.check("#suPriv"); pg.check("#suReg"); pg.check("#suPromise")
        pg.click("[data-signup]"); pg.wait_for_timeout(1200)
        rows = [r for r in M.sheet("계정") if "kim@test.kr" in r]
        need(rows, "계정 시트에 가입 신청이 안 들어갔어요"); S["kim"] = pg
        return "계정 시트에 기록됨"
    signup()

    @step("승인 뒤 로그인 유지 · 반 만들기")
    def approve_class():
        M.rpc("opAccount", OWN, "kim@test.kr", "O"); M.rpc("opMember", OWN, "kim@test.kr", "O")
        pg = S["kim"]; pg.click("[data-recheck]"); pg.wait_for_timeout(1200)
        pg.reload(); ready(pg); pg.goto(U + "?tab=mine"); ready(pg)
        need(pg.locator("#newCls").count(), "승인 뒤 '반 만들기' 칸이 안 보여요 (로그인이 풀렸을 수 있어요)")
        pg.fill("#newCls", "전북햇살초 5-1"); pg.select_option("#newRegion", "전북"); pg.click("[data-addclass]"); pg.wait_for_timeout(1000)
        need(any("전북햇살초 5-1" in str(r) for r in M.sheet("반")), "반 시트에 새 반이 없어요")
        shot(pg, "03_우리반")
    approve_class()

    @step("학생 기록: 노래 도장 · 투표 · 바꾼 가사 제출과 저장")
    def records():
        pg = S["kim"]
        pg.click('.stampbook [data-stamp="1"]'); pg.wait_for_timeout(900)
        row = [r for r in M.sheet("반") if "전북햇살초 5-1" in str(r)][0]
        need("1" in str(row), "도장이 반 시트에 안 남았어요")
        pg.click('nav#tabs [data-tab="chart"]'); pg.wait_for_timeout(500)
        pg.click('[data-vote="3"]'); pg.wait_for_timeout(900)
        bd = M.get("/?api=board")["result"]; need(bd.get("votes"), "투표가 집계되지 않았어요")
        pg.evaluate("openSong(2)"); pg.wait_for_selector("#vText", timeout=3000)
        pg.fill("#vText", "은행잎에 우리 반 이름 써서\n바람 편에 보내요"); pg.click('[data-addvar="2"]'); pg.wait_for_timeout(1000)
        need(len(M.sheet("바꾼 가사")) >= 2, "바꾼 가사 시트에 안 들어갔어요"); pg.keyboard.press("Escape")
        M.get("/__flush"); pg.reload(); ready(pg); pg.goto(U + "?tab=mine"); ready(pg)
        need(pg.locator('.stampbook [data-stamp="1"].on, .stampbook [data-stamp="1"][aria-pressed="true"]').count() or "1" in str([r for r in M.sheet("반") if "전북햇살초 5-1" in str(r)][0]), "새로 고친 뒤 도장이 사라졌어요")
        return "도장·투표·가사 모두 시트에 저장"
    records()

    @step("회원방: 자료방 올리기·목록·링크·QR")
    def room_lib():
        M.rpc("roomUpload", KIM, {"t": "운동장 한 바퀴 자료 모음", "ty": "수업 자료", "scope": "회원", "link": "유튜브 영상 | https://youtu.be/abc\nhttps://cafe.daum.net/jbdongyo"}, "", "", "")
        pg = B.page(who="kim@test.kr|uidkim", store={"dys-room-sub": "lib"}, fakedb_seed=SEED); pg.goto(U + "?tab=room"); ready(pg); pg.wait_for_timeout(1500)
        need(pg.locator(".lib-row").count() >= 1, "자료방 목록이 비어 있어요")
        need(pg.locator(".lib-row .lnk").count() >= 2, "자료 링크가 여러 개 안 보여요")
        pg.click("[data-libqr] >> nth=0"); pg.wait_for_selector(".qr-url", timeout=4000); need("i=" in pg.inner_text(".qr-url"), "자료 QR 주소가 이상해요")
        pg.click(".sheet [data-close]"); shot(pg, "04_자료방"); S["kimroom"] = pg
        return f"{pg.locator('.lib-row').count()}건"
    room_lib()

    @step("회원방: 운영진만 자료는 회원에게 안 보임")
    def ops_scope():
        b64 = base64.b64encode(b"%PDF test").decode()
        M.rpc("roomUpload", OWN, {"t": "운영진 회의록", "ty": "기타", "scope": "운영진"}, "a.pdf", "application/pdf", b64)
        kim_sees = [i["t"] for i in M.rpc("room", KIM)["items"]]
        need("운영진 회의록" not in kim_sees, "회원에게 운영진만 자료가 보여요")
        need("운영진 회의록" not in [i["t"] for i in M.get("/?api=lib")["result"]["items"]], "누구나 목록에 운영진 자료가 나와요")
    ops_scope()

    @step("회원방: 일정 달력 · 공지")
    def room_cal():
        pg = S["kimroom"]
        pg.click("[data-roomsub=cal]"); pg.wait_for_timeout(600); need(pg.locator(".rcal").count(), "달력이 안 보여요")
        pg.click("[data-roomsub=notice]"); pg.wait_for_timeout(500); need(pg.inner_text("#view").strip(), "공지 화면이 비어 있어요")
    room_cal()

    @step("회원방: 대화방 · 쪽지 · 입력 중 표시")
    def room_chat():
        M.rpc("signup", "fake|lee@test.kr|uidlee", {"name": "이노래", "school": "바람초등학교", "region": "서울", "member": {"pos": "교사", "phone": "01022223333", "priv": True, "reg": True, "promise": True}})
        M.rpc("opAccount", OWN, "lee@test.kr", "O"); M.rpc("opMember", OWN, "lee@test.kr", "O")
        a = B.page(who="kim@test.kr|uidkim", store={"dys-room-sub": "chat"}, fakedb_seed=SEED)
        ctx = a.context
        bb = ctx.new_page(); bb.add_init_script(f'if(!localStorage.getItem("fakedb"))localStorage.setItem("fakedb",{json.dumps(json.dumps(SEED))});sessionStorage.setItem("__fu","lee@test.kr|uidlee");localStorage.setItem("dys-room-sub",JSON.stringify("chat"));')
        for pg in (bb,):
            pg.on("pageerror", lambda e: B.errors.append(f"[이노래] {e}"))
            pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=""))
            pg.route("https://script.google.com/**", B._gas)
            pg.route("https://www.gstatic.com/firebasejs/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=B.fake if "app-compat" in r.request.url else ""))
        bb.goto(U + "?tab=room"); ready(bb); bb.wait_for_timeout(1500)
        a.goto(U + "?tab=room"); ready(a); a.wait_for_timeout(1500)
        a.fill("#chatX", "전체 대화 인사"); a.keyboard.press("Enter"); a.wait_for_timeout(1000)
        need("전체 대화 인사" in a.inner_text("#chatLog"), "보낸 대화가 안 보여요")
        a.click('[data-dmopen="uidlee"]'); a.wait_for_timeout(600)
        a.fill("#chatX", "악보 받으셨어요?"); a.keyboard.press("Enter"); a.wait_for_timeout(1200)
        bb.wait_for_timeout(800); bb.click('[data-dmopen="uidkim"]'); bb.wait_for_timeout(800)
        need("악보 받으셨어요?" in bb.inner_text("#chatLog"), "쪽지가 상대에게 안 갔어요")
        bb.type("#chatX", "네 받았", delay=40); a.wait_for_timeout(1200)
        typing = a.inner_text("#chatTyping") if a.locator("#chatTyping").count() else ""
        need("입력" in typing, "'입력하고 있어요' 표시가 안 떠요")
        shot(a, "05_쪽지"); ctx.close()
    room_chat()

    @step("회원방: 활동 후기 쓰기(사진 3장)·보기·공감")
    def review():
        o = B.page(who="owner@test.kr|uidowner", store={"dys-room-sub": "review"}, fakedb_seed=SEED); o.goto(U + "?tab=room"); ready(o); o.wait_for_timeout(1200)
        o.click("[data-revnew]"); o.wait_for_selector("#rvT", timeout=3000)
        o.fill("#rvT", "제4회 창작동요 발표회"); o.fill("#rvD", "2026-11-08"); o.fill("#rvP", "햇살초 강당"); o.fill("#rvN", "24"); o.fill("#rvW", "김햇살, 박바람"); o.fill("#rvB", "신곡 6곡을 함께 불렀어요.")
        o.set_input_files("#rvF", [tiny_jpg("red"), tiny_jpg("green"), tiny_jpg("blue")]); o.click("[data-revsave]"); o.wait_for_timeout(4000)
        rows = M.sheet("회원방 후기"); need(len(rows) >= 2, "후기가 시트에 안 들어갔어요")
        k = B.page(who="kim@test.kr|uidkim", store={"dys-room-sub": "review"}, fakedb_seed=SEED); k.goto(U + "?tab=room"); ready(k); k.wait_for_timeout(1500)
        k.click("[data-revopen] >> nth=0"); k.wait_for_timeout(1500); need(k.locator(".rev-gal").count(), "후기 사진 넘겨 보기가 안 떠요")
        k.click("[data-revlike]"); k.wait_for_timeout(900); need("1" in k.inner_text("[data-revlike]"), "공감 수가 안 올라가요")
        shot(k, "06_후기"); o.context.close(); k.context.close()
    review()

    @step("운영진: 관리 화면 · 계정 목록 · 곡 고치기(공개 동의) · 오늘의 동요 · 내려받기")
    def op_flow():
        pg = B.page(who="owner@test.kr|uidowner", store={"dys-opsub": "home"}); pg.goto(U + "?tab=op"); ready(pg); pg.wait_for_timeout(1500)
        need(pg.locator(".op-tile").count() >= 3, "운영진 첫 화면 칸이 안 보여요"); shot(pg, "07_운영진", True)
        pg.click("[data-opsub=accounts]"); pg.wait_for_timeout(600); pg.click('[data-opaf="O"]'); pg.wait_for_timeout(300)
        need("김회원" in pg.inner_text("#view"), "승인된 계정 목록에 김회원이 없어요")
        pg.click("[data-opsub=songs]"); pg.wait_for_timeout(500); pg.click('[data-opedit="1"]'); pg.wait_for_selector("#f_consent", timeout=3000)
        if not pg.is_checked("#f_consent"): pg.check("#f_consent")
        pg.click('[data-opsave="1"]'); pg.wait_for_timeout(900); t = toast(pg); need("저장" in t or "고쳤" in t or "바꿨" in t, f"곡 저장 알림이 이상해요: {t[:40]}")
        pg.click("[data-opsub=today]"); pg.wait_for_timeout(500); pg.click("[data-opautofill]"); pg.wait_for_timeout(300); pg.click("[data-opsavetoday]"); pg.wait_for_timeout(900)
        need(len(M.sheet("오늘의 동요")) >= 2, "오늘의 동요가 시트에 저장되지 않았어요")
        pg.click("[data-opsub=export]"); pg.wait_for_timeout(400)
        with pg.expect_download() as dl: pg.click("[data-opexport=classes]")
        txt = open(dl.value.path(), encoding="utf-8-sig").read(); need("전북햇살초 5-1" in txt, "반 기록 내려받기에 우리 반이 없어요")
        pg.context.close()
    op_flow()

    @step("체험 모드: 서버 없이 둘러보기·도장")
    def demo():
        pg = B.page(); pg.goto(U + "?demo&tab=mine"); ready(pg)
        n = pg.locator(".stampbook [data-stamp]").count(); need(n, "체험 모드 도장판이 안 보여요")
        pg.click(".stampbook [data-stamp] >> nth=1"); pg.wait_for_timeout(300); pg.context.close()
    demo()

    @step("휴대폰 화면: 옆으로 밀리지 않음 · 회원방 열림")
    def mobile():
        pg = B.page(390, 844, who="kim@test.kr|uidkim", fakedb_seed=SEED); pg.goto(U); ready(pg); shot(pg, "08_휴대폰", True)
        for t in ["today", "songs", "room"]:
            pg.goto(U + "?tab=" + t); ready(pg); pg.wait_for_timeout(500)
            w = pg.evaluate("document.documentElement.scrollWidth"); need(w <= 392, f"'{t}' 화면이 옆으로 밀려요 (폭 {w}px)")
        pg.context.close()
    mobile()

    if os.path.exists(os.path.join(ROOT, "preview", "index.html")):
        @step("시안(preview): 열림 · 메뉴 이동")
        def preview():
            pg = B.page(); pg.goto(U + "preview/"); ready(pg)
            for t in [x.get_attribute("data-tab") for x in pg.locator("nav#tabs button").all()]:
                pg.click(f'nav#tabs [data-tab="{t}"]'); pg.wait_for_timeout(300)
            pg.context.close()
        preview()

    @step("화면 오류 없음 (모든 시험 동안)")
    def no_errors():
        errs = [e for e in B.errors if "net::ERR" not in e]
        need(not errs, f"{len(errs)}건: " + " / ".join(errs[:3]))
    no_errors()


def main():
    print("[1단계] 코드 검사부터")
    r = subprocess.run([sys.executable, os.path.join(HERE, "code_check.py")], capture_output=True, text=True)
    print("\n".join("  " + l for l in r.stdout.strip().splitlines()[-3:]))
    if r.returncode:
        print(r.stdout); print("코드 검사에서 걸려서 전체 시험을 멈춰요."); sys.exit(1)
    print("\n[2단계] 전체 시험 —", ROOT)
    from playwright.sync_api import sync_playwright
    libs = ensure_libs()
    fake = open(os.path.join(HERE, "mock", "fakefb.js"), encoding="utf-8").read() + "\n" + open(os.path.join(HERE, "mock", "fakedb.js"), encoding="utf-8").read()
    M = Mock(); base, srv = static_server()
    try:
        with sync_playwright() as pw:
            B = Browser(pw, base, M, libs, fake)
            try: run_all(B, M)
            finally: B.close()
    finally:
        M.stop(); srv.shutdown()
    bad = [r for r in RESULTS if not r[1]]
    print()
    if bad:
        print(f"전체 시험: 통과 못 함 ({len(bad)}/{len(RESULTS)}건 걸림) — 올리기 전에 고쳐야 해요")
        for n, _, m in bad: print(f"   - {n}: {m}")
        sys.exit(1)
    print(f"전체 시험: 모두 통과 ({len(RESULTS)}가지) — 화면 사진은 tests/결과/")


if __name__ == "__main__":
    main()
