#!/usr/bin/env python3
"""동요샘 노래상자 — 1단계 코드 검사

  python3 tests/code_check.py

단순 수정(글귀·색·여백·그림 교체) 때는 이것만 돌리고 올려요.
보는 것
  1. 문법 오류      : index.html·preview 안의 스크립트, Collector.gs, sw.js 를 node 로 문법 검사
                     national.json·manifest.webmanifest 는 JSON 으로 읽히는지
  2. 짝 맞추기      : <style> 안 중괄호 { } 짝, 화면 뼈대 태그(div·section·main·nav 등) 열고 닫힌 짝
  3. 단추 → 함수    : 화면이 서버에 부탁하는 기능 이름(rpc·act·opCall·roomDo …)이 서버 FN_ 목록에 있는지,
                     서버 FN_ 목록의 함수가 실제로 있는지, onclick 이 부르는 함수가 있는지,
                     단추에 붙은 data-○○ 가 화면 코드 어딘가에서 실제로 쓰이는지
  4. 판 번호        : Collector.gs SERVER_VERSION · index.html APP.version · sw.js 캐시 이름 · 설치안내.txt '지금 판'
하나라도 걸리면 끝에 '통과 못 함'과 함께 0이 아닌 값으로 끝나요.
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAILS, NOTES = [], []


def ok(msg): print("  통과  " + msg)
def bad(msg): FAILS.append(msg); print("  걸림  " + msg)
def rd(p): return open(os.path.join(ROOT, p), encoding="utf-8").read()


def node_check(code, label, base=1):
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write(code); fn = f.name
    try:
        r = subprocess.run(["node", "--check", fn], capture_output=True, text=True)
    finally:
        os.unlink(fn)
    if r.returncode == 0: ok(label + " 문법")
    else:
        msg = (r.stderr or r.stdout).strip().splitlines()
        where = next((l for l in msg if ".js:" in l), "")
        line = where.rsplit(":", 1)[-1] if where else "?"
        if line.isdigit(): line = str(base + int(line) - 1)
        err = next((l for l in msg if "Error" in l), msg[-1] if msg else "")
        bad(f"{label} 문법 오류 (파일 {line}째 줄 근처): {err}")


def scripts_of(html):
    out = []
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if "src=" in attrs or re.search(r'type="(application/(ld\+)?json|text/template)"', attrs): continue
        if body.strip(): out.append((html[:m.start()].count("\n") + 1, body))
    return out


def strip_scripts(html):
    return re.sub(r"<script\b.*?</script>", lambda m: "\n" * m.group(0).count("\n"), html, flags=re.S | re.I)


def check_html_file(path, label):
    html = rd(path)
    for line, body in scripts_of(html):
        node_check(body, f"{label} 스크립트({line}째 줄부터)", line)
    # <style> 중괄호 짝
    for m in re.finditer(r"<style\b[^>]*>(.*?)</style>", html, re.S | re.I):
        css = re.sub(r"/\*.*?\*/", "", m.group(1), flags=re.S)
        css = re.sub(r'"[^"\n]*"|\'[^\'\n]*\'', '""', css)
        o, c = css.count("{"), css.count("}")
        line = html[:m.start()].count("\n") + 1
        (ok if o == c else bad)(f"{label} 스타일({line}째 줄부터) 중괄호 짝 {o}/{c}")
    # 뼈대 태그 짝 (스크립트 바깥의 정적 HTML)
    static = strip_scripts(re.sub(r"<style\b.*?</style>", "", html, flags=re.S | re.I))
    static = re.sub(r"<!--.*?-->", "", static, flags=re.S)
    probs = []
    for t in ["div", "section", "main", "nav", "header", "footer", "aside", "button", "ul", "ol", "table", "form", "dialog", "svg"]:
        o = len(re.findall(rf"<{t}\b", static, re.I)); c = len(re.findall(rf"</{t}\s*>", static, re.I))
        if o != c: probs.append(f"<{t}> 열기 {o} / 닫기 {c}")
    if probs: bad(f"{label} 태그 짝이 안 맞아요: " + ", ".join(probs))
    else: ok(f"{label} 뼈대 태그 짝")


def string_tags(js, names):
    """화면 코드 안 문자열 속 <button …> 같은 태그의 속성 부분을 뽑아요 (${…} 안의 > 는 건너뜀)."""
    out = []
    for m in re.finditer(r"<(" + "|".join(names) + r")\b", js):
        i, depth, s = m.end(), 0, []
        while i < len(js) and i - m.end() < 1500:
            ch = js[i]
            if js.startswith("${", i): depth += 1; s.append("${"); i += 2; continue
            if ch == "}" and depth: depth -= 1
            elif ch == ">" and not depth: break
            s.append(ch); i += 1
        out.append("".join(s))
    return out


def camel(n): return re.sub(r"-([a-z0-9])", lambda m: m.group(1).upper(), n)


# data-○○ 가운데 클릭 처리가 아니라 모양·상태·값을 담는 데만 쓰는 것 (쓰임새를 따로 찾지 않아요)
DATA_PLAIN = {"theme", "c", "i", "k", "n", "id", "v", "state", "label", "tip", "kind", "step", "build-in", "transition", "x"}


def check_wiring():
    html, gs = rd("index.html"), rd("Collector.gs")
    js = "\n".join(b for _, b in scripts_of(html))
    m = re.search(r"const FN_ = \{(.*?)\n\};", gs, re.S)
    if not m: bad("Collector.gs 에서 FN_ 목록을 못 찾았어요"); return
    pairs = dict(re.findall(r"(\w+)\s*:\s*(\w+)", m.group(1)))
    missing_fn = [f"{k}→{v}" for k, v in pairs.items() if not re.search(rf"\bfunction {re.escape(v)}\s*\(", gs)]
    if missing_fn: bad("서버 FN_ 목록에 있지만 함수가 없어요: " + ", ".join(missing_fn))
    else: ok(f"서버 FN_ 목록 {len(pairs)}개 함수 모두 있음")
    called = set(re.findall(r"\b(?:rpc|rpcRaw|act|opCall|opPost|roomDo)\(\s*\"(\w+)\"", js))
    called |= set(re.findall(r"\bfn:\s*\"(\w+)\"", js))
    lost = sorted(c for c in called if c not in pairs)
    if lost: bad("화면이 부르는데 서버에 없는 기능: " + ", ".join(lost))
    else: ok(f"화면이 부르는 서버 기능 {len(called)}개 모두 서버에 있음")
    # onclick="함수()" 가 가리키는 함수
    on = set(re.findall(r"\bon(?:click|change|input|submit)=\\?\"\s*([A-Za-z_$][\w$]*)\s*\(", html))
    nofn = sorted(f for f in on if not re.search(rf"\b(function\s+{f}\b|(const|let|var)\s+{f}\s*=|{f}\s*:\s*function|window\.{f}\s*=)", js))
    if nofn: bad("onclick 등이 부르는데 정의가 없는 함수: " + ", ".join(nofn))
    else: ok(f"onclick 등이 부르는 함수 {len(on)}개 모두 있음")
    # 단추에 붙은 data-○○ 가 실제로 쓰이는지
    attrs = set()
    for a in string_tags(js + strip_scripts(html), ["button", "a", "input", "select", "textarea", "label", "summary", "div", "span", "li", "tr", "img", "b"]):
        for n in re.findall(r"\bdata-([a-z][a-z0-9-]*)", a):
            attrs.add(n)
    unused = []
    alias = set(re.findall(r"\b(?:const|let|var)\s+(\w+)\s*=\s*[\w.]+\.dataset\b", js))  # const d = t.dataset 같은 줄임 이름
    al = "|".join(map(re.escape, alias)) or "dataset"
    for n in sorted(attrs - DATA_PLAIN):
        if re.search(rf"\[data-{re.escape(n)}\b|data-{re.escape(n)}[\"'\]]|dataset\.{camel(n)}\b|dataset\[\"{camel(n)}\"\]|getAttribute\(\"data-{re.escape(n)}\"\)|\b(?:{al})\.{camel(n)}\b", js):
            continue
        unused.append("data-" + n)
    if unused: bad("단추에 붙어 있는데 처리하는 코드가 없는 표시: " + ", ".join(unused))
    else: ok(f"단추 표시(data-○○) {len(attrs)}가지 모두 처리 코드 있음")


def check_versions():
    found = {}
    m = re.search(r"const SERVER_VERSION = (\d+)", rd("Collector.gs")); found["Collector.gs SERVER_VERSION"] = m and m.group(1)
    m = re.search(r"version:\s*(\d+)", rd("index.html")); found["index.html APP.version"] = m and m.group(1)
    m = re.search(r"var C = 'dongyo-shell-(\d+)'", rd("sw.js")); found["sw.js 캐시 이름"] = m and m.group(1)
    m = re.search(r"지금 판:\s*(\d+)", rd("설치안내.txt")); found["설치안내.txt 지금 판"] = m and m.group(1)
    vals = set(found.values())
    if None in vals: bad("판 번호를 못 찾은 곳: " + ", ".join(k for k, v in found.items() if v is None))
    elif len(vals) > 1: bad("판 번호가 서로 달라요: " + ", ".join(f"{k}={v}" for k, v in found.items()))
    else: ok(f"판 번호 {vals.pop()} (4곳 모두 같음)")


def main():
    print("[1단계] 코드 검사 —", ROOT)
    print("· 문법·짝")
    check_html_file("index.html", "index.html")
    if os.path.exists(os.path.join(ROOT, "preview/index.html")): check_html_file("preview/index.html", "preview(시안)")
    node_check(rd("Collector.gs"), "Collector.gs")
    node_check(rd("sw.js"), "sw.js")
    for j in ["national.json", "manifest.webmanifest"]:
        try: json.loads(rd(j)); ok(j + " JSON")
        except Exception as e: bad(f"{j} JSON 오류: {e}")
    print("· 단추 → 함수")
    check_wiring()
    print("· 판 번호")
    check_versions()
    print()
    if FAILS:
        print(f"코드 검사: 통과 못 함 ({len(FAILS)}건) — 올리기 전에 고쳐야 해요")
        for f in FAILS: print("   - " + f)
        sys.exit(1)
    print("코드 검사: 모두 통과")


if __name__ == "__main__":
    main()
