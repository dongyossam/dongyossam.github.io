/*************************************************************
 * 동요샘 노래상자 — 서버 (Collector.gs)
 * ------------------------------------------------------------
 * 동요샘 운영진 구글 시트 하나에만 설치합니다. 선생님들은 아무것도 설치하지 않고
 * 노래상자 화면에서 구글로 로그인 → 가입 신청 → 운영진 승인 → 씁니다.
 * 모든 반의 도장·투표·릴레이·바꾼 가사와 동요샘 회원방 자료가 이 시트에 쌓입니다.
 *
 * 처음 한 번: 함수 목록에서 setup 을 골라 실행하고 권한을 허용하세요.
 *   이 구글 계정이 '동요샘 관리 계정'이 되어 늘 운영진으로 들어가요.
 * 배포 설정: 다음 사용자로 실행 = 나, 액세스 권한 = 모든 사용자
 * 배포 주소(…/exec)는 저장소 national.json 의 collector 칸에 넣습니다.
 *
 * 운영 일은 노래상자 화면 맨 아래 '운영진' 메뉴에서 합니다. (운영진 권한이 있는 구글 계정으로 로그인)
 *  - 계정: 가입 승인·거절, 동요샘 회원 승인, 운영진 권한 주기·빼기, 도교육청 등록 명단 복사
 *  - 곡 관리, 오늘의 동요, 가사 확인, 릴레이 곡, 참여 반 숨기기, 메일 설정, 운영 기록
 * 시트에서 직접 고쳐도 됩니다. 고친 내용은 2분 안에 화면에 반영됩니다.
 *************************************************************/

const SERVER_VERSION = 11;  // 11: 자료 링크 여러 개, 운영진만 보는 자료, 회원방 활동 후기  10: 구글 로그인, 운영진도 구글 계정 권한으로, 회원 신청에 직위·휴대전화·도교육청 등록 명단 동의  9: 동요샘 회원방(자료방·일정·공지·곡집 원고·대화방·화상 회의)  8: 박자(4/4)가 날짜로 바뀌던 문제 고침  7: 엑셀로 곡 한꺼번에 올리기  6: 노래 파일(mp3)·악보 파일 올리기, 곡 종류(창작곡·편곡)·편곡자, 발표회 없는 개인 창작곡  5: 이번 달·학년도 집계, 로그인 유지, 알림 메일, 기록 내려받기, 공개 동의, 운영 기록  4: 곡 지우기·예시 곡 한꺼번에 지우기  3: 한 시트 방식 — 가입·승인·로그인, 계정 하나에 여러 반
const TZ_ = 'Asia/Seoul';
const BOARD_CACHE_SEC = 120;
const MAX_CLASSES = 20;     // 계정 하나에 만들 수 있는 반
const REGIONS_ = ['서울','부산','대구','인천','광주','대전','울산','세종','경기','강원','충북','충남','전북','전남','경북','경남','제주'];

const SH_ACC = '계정', SH_CLASSES = '반', SH_SONGS = '곡 목록', SH_SET = '설정', SH_LYRICS = '바꾼 가사', SH_RELAY = '릴레이 기록', SH_LOG = '운영 기록', SH_TODAY = '오늘의 동요';
const SH_LIB = '회원방 자료', SH_EVT = '회원방 일정', SH_NOTE = '회원방 공지', SH_CMT = '회원방 댓글', SH_CHAT = '회원방 대화', SH_MS = '곡집 원고', SH_REV = '회원방 후기';
const HEAD_ = {
  '계정': ['이메일(구글)', '구글 UID', '선생님 이름', '학교', '지역', '신청한 날', '승인', '마지막 로그인', '메모', '동요샘 회원', '직위', '휴대전화', '도 등록 명단 동의', '회원 신청한 때', '역할'],
  '반': ['반 ID', '아이디', '반 이름', '지역', '도장', '투표 달', '투표 곡', '좋아요', '릴레이', '만든 날', '마지막 기록', '숨김'],
  '곡 목록': ['곡번호', '곡 제목', '작사', '작곡', '발표회', '발표 연도', '추천 학년군', '주제(쉼표로)', '계절', '조성', '박자', '음역', '가사', '소개', '수업 활용', '영상 주소', '악보 주소', '숨김', '공개 동의', '노래 파일', '곡 종류', '편곡'],
  '설정': ['항목', '값', '설명'],
  '바꾼 가사': ['가사 ID', '반 ID', '곡번호', '바꾼 가사', '반 이름', '지역', '받은 날', '공개'],
  '릴레이 기록': ['릴레이', '반 ID', '반 이름', '지역', '이어받은 때'],
  '운영 기록': ['때', '운영진', '한 일', '대상'],
  '오늘의 동요': ['날짜', '곡번호', '한마디'],
  '회원방 자료': ['자료 ID', '제목', '설명', '종류', '공개', '파일 ID', '파일 이름', '파일 형식', '링크', '아이디', '올린 선생님', '올린 때', '숨김', '받은 수'],
  '회원방 일정': ['일정 ID', '날짜', '시간', '제목', '장소', '큰 행사', '참석(아이디)'],
  '회원방 공지': ['공지 ID', '제목', '내용', '쓴 사람', '쓴 때', '고정'],
  '회원방 댓글': ['댓글 ID', '공지 ID', '아이디', '이름', '내용', '쓴 때'],
  '회원방 대화': ['번호', '때', '아이디', '이름', '내용', '지움'],
  '곡집 원고': ['원고 ID', '곡집', '곡 제목', '지은이', '아이디', '이름', '파일 ID', '쪽수', '검토', '낸 때'],
  '회원방 후기': ['후기 ID', '제목', '날짜', '장소', '참석 인원', '나눔 선생님', '진행 내용', '사진(파일 ID)', '쓴 사람', '쓴 때', '공감(아이디)']
};

/************ 입구 ************/
function doGet(e) {
  const q = (e && e.parameter) || {};
  let out;
  try { out = { ok: true, result: q.api === 'board' ? getBoard_() : q.api === 'lib' ? libPublic_() : { server: SERVER_VERSION, now: now_() } }; }
  catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return json_(out);
}
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const f = FN_[String(body.fn || '')];
    if (!f) throw new Error('알 수 없는 요청');
    out = { ok: true, result: f.apply(null, Array.isArray(body.args) ? body.args : []) };
  } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return json_(out);
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/************ 공통 ************/
function now_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd HH:mm:ss'); }
function month_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM'); }
function today_() { return Utilities.formatDate(new Date(), TZ_, 'yyyy-MM-dd'); }
// 학년도 시작일 (3월 1일)
function yearStart_() { const t = today_(), y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)); return (m >= 3 ? y : y - 1) + '-03-01'; }
// 도장: [곡번호, 찍은 날] 목록 (예전 숫자만 있던 기록도 읽음)
function stampsOf_(cell) { return parse_(cell, []).map(function (x) { return Array.isArray(x) ? [num_(x[0]), String(x[1] || '')] : [num_(x), '']; }).filter(function (x) { return x[0]; }); }
// 시트가 날짜로 바꿔 버린 칸도 yyyy-MM-dd 글자로
function dstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ_, 'yyyy-MM-dd') : String(v || '').trim().slice(0, 10); }
function tstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ_, 'yyyy-MM-dd HH:mm') : String(v || '').trim().slice(0, 16); }
function mstr_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ_, 'yyyy-MM') : String(v || '').trim().slice(0, 7); }
// 박자: 시트가 4/4를 날짜(4월 4일)로 바꿔 버린 칸도 '4/4'로 되돌려 읽기
function beatStr_(v) { return v instanceof Date ? Number(Utilities.formatDate(v, TZ_, 'MM')) + '/' + Number(Utilities.formatDate(v, TZ_, 'dd')) : String(v == null ? '' : v).trim(); }
// 곡 목록에서 글자 그대로 둘 칸(박자·조성·음역·발표 연도)을 '글자' 서식으로
function songTextCols_(sh, row, n) { sh.getRange(row, 10, n, 3).setNumberFormat('@'); }
function okMail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim()); }
const APP_URL = 'https://dongyossam.github.io/';
// 운영진 알림 메일 (하루 40통까지)
function notify_(subject, body) {
  try {
    const to = String(settings_()['알림 이메일'] || '').trim(); if (!okMail_(to)) return;
    const p = PropertiesService.getScriptProperties(), k = 'MAIL_' + today_(), n = Number(p.getProperty(k) || 0);
    if (n >= 40) return;
    p.setProperty(k, String(n + 1));
    MailApp.sendEmail({ to: to, subject: '[동요샘 노래상자] ' + subject, body: body + '\n\n운영진 메뉴: ' + APP_URL + '?tab=op' });
  } catch (e) {}
}
function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { const v = (b + 256) % 256; return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
function clean_(s, max) { return String(s == null ? '' : s).replace(/[<>\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, max); }
function num_(v) { const n = Math.round(Number(v)); return (isFinite(n) && n >= 1 && n <= 9999) ? n : 0; }
function isO_(v) { return /^[OoＯ○◯]$/.test(String(v || '').trim()); }
function parse_(s, d) { try { const v = JSON.parse(s || ''); return v == null ? d : v; } catch (e) { return d; } }
function lyricText_(t) { return String(t == null ? '' : t).replace(/\r/g, '').split('\n').map(function (x) { return clean_(x, 60); }).filter(String).slice(0, 12).join('\n'); }
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(HEAD_[name]); sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD_[name].length).setFontWeight('bold');
    if (name === SH_SONGS) seedSongs_(sh);
    if (name === SH_TODAY) sh.getRange('A:A').setNumberFormat('@');
    if (name === SH_EVT) sh.getRange('B:C').setNumberFormat('@');
    if (name === SH_REV) sh.getRange('C:C').setNumberFormat('@');
    if (name === SH_SET) sh.getRange(2, 1, 4, 3).setValues([
      ['릴레이 이름', '첫 번째 릴레이', '이름을 바꾸면 새 릴레이가 처음부터 시작돼요'],
      ['릴레이 곡번호', 3, '곡 목록의 곡번호'],
      ['문의 이메일', '', '비밀번호를 잊은 선생님이 연락할 주소 (화면에 보여요)'],
      ['알림 이메일', '', '가입 신청·새 가사가 오면 알림을 받을 운영진 주소 (화면에 안 보여요)']
    ]);
  }
  return sh;
}
function values_(name) { return sheet_(name).getDataRange().getValues(); }
function settings_() { const o = {}; values_(SH_SET).slice(1).forEach(function (r) { o[String(r[0]).trim()] = r[1]; }); return o; }
function putSetting_(k, val, note) {
  const sh = sheet_(SH_SET), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).trim() === k) { sh.getRange(i + 1, 2).setValue(val); return; }
  sh.appendRow([k, val, note || '']);
}
function bust_() { CacheService.getScriptCache().remove('board'); }
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('잠시 뒤 다시 눌러 주세요.');
  try { return fn(); } finally { lock.releaseLock(); }
}

/************ 계정 ************/
function findAcc_(id) {
  const v = values_(SH_ACC);
  for (let i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === String(id).toLowerCase()) return { row: i + 1, r: v[i] };
  return null;
}
// 로그인은 구글(파이어베이스)로 해요. 화면이 보낸 구글 로그인 표를 구글에 물어 확인하고 10분 동안 기억해요.
const FB_API_KEY = 'AIzaSyAs7COF8LYZbPmupoMNzq5AyOwmFAx24YM';
const FB_DB_URL = 'https://dongyo-ssam-default-rtdb.asia-southeast1.firebasedatabase.app';
const POSITIONS_ = ['교사', '수석교사', '교감', '교장', '장학사', '장학관', '교육연구사', '교육연구관', '교수', '강사'];
function verify_(idToken) {
  idToken = String(idToken || '');
  if (!idToken) throw new Error('로그인이 필요해요. 다시 로그인해 주세요.');
  const cache = CacheService.getScriptCache(), key = 'V_' + hash_(idToken).slice(0, 40), hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  const res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FB_API_KEY,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
  const j = parse_(res.getContentText(), {}), u = j.users && j.users[0];
  if (!u || !u.email) throw new Error('로그인이 필요해요. 다시 로그인해 주세요.');
  const info = { email: String(u.email).toLowerCase(), uid: String(u.localId) };
  cache.put(key, JSON.stringify(info), 600);
  return info;
}
function phone_(v) {
  const d = String(v || '').replace(/[^0-9]/g, '');
  if (!/^01[016789]\d{7,8}$/.test(d)) throw new Error('휴대전화 번호를 확인해 주세요. (예: 010-1234-5678)');
  return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
}
// 동요샘 회원 신청 정보: 직위·휴대전화·동의 (도교육청 교과연구회 등록 명단용)
function memberInfo_(m) {
  m = m || {};
  const pos = clean_(m.pos, 20);
  if (!pos) throw new Error('직위를 골라 주세요.');
  const phone = phone_(m.phone);
  if (!m.priv) throw new Error('개인정보 수집·이용에 동의해 주세요.');
  if (!m.reg) throw new Error('도교육청 연구회 등록 명단 제출에 동의해야 회원 신청을 할 수 있어요.');
  if (!m.promise) throw new Error('회원 자료 이용 약속에 체크해 주세요.');
  return [pos, phone, 'O', now_()];
}
function signup_(idToken, p) {
  const v = verify_(idToken); p = p || {};
  const name = clean_(p.name, 20), school = clean_(p.school, 30), region = String(p.region || '');
  if (!name || !school) throw new Error('선생님 이름과 학교를 적어 주세요.');
  if (REGIONS_.indexOf(region) === -1) throw new Error('지역을 골라 주세요.');
  const mem = p.member ? memberInfo_(p.member) : ['', '', '', ''];
  withLock_(function () {
    const all = values_(SH_ACC);
    if (all.slice(1).some(function (r) { return String(r[0]).toLowerCase() === v.email; })) throw new Error('이미 가입 신청을 했어요.');
    if (all.slice(1).filter(function (r) { return !String(r[6]).trim(); }).length >= 300) throw new Error('지금은 가입 신청이 너무 많아요. 잠시 뒤 다시 신청해 주세요.');
    const sh = sheet_(SH_ACC);
    sh.appendRow([v.email, v.uid, name, school, region, now_(), '', now_(), '', p.member ? '신청' : ''].concat(mem));
    sh.getRange(sh.getLastRow(), 12).setNumberFormat('@').setValue(mem[1]);
  });
  notify_('가입 신청: ' + name + ' 선생님 (' + school + ')', '새 가입 신청이 왔어요.\n\n이메일: ' + v.email + '\n이름: ' + name + '\n학교: ' + school + ' (' + region + ')' + (p.member ? '\n동요샘 회원방도 신청했어요. (직위: ' + mem[0] + ')' : '') + '\n\n운영진 메뉴의 계정 칸에서 승인해 주세요.');
  return meApi_(idToken);
}
// 승인된 계정만 기록을 남겨요
function who_(idToken) {
  const v = verify_(idToken), a = findAcc_(v.email);
  if (!a) throw new Error('가입 신청을 먼저 해 주세요.');
  const st = String(a.r[6]).trim();
  if (!isO_(st)) throw new Error(st ? '가입이 승인되지 않은 계정이에요. 운영진에게 문의해 주세요.' : '아직 승인 전이에요. 운영진이 승인하면 쓸 수 있어요.');
  return v.email;
}
// 로그인한 뒤 내 상태: none(가입 전) / wait(승인 기다림) / X(거절) / O(승인)
function meApi_(idToken) {
  const v = verify_(idToken), a = findAcc_(v.email);
  const op = !!opInfo_(idToken);
  if (!a) return { status: 'none', email: v.email, op: op };
  const st = String(a.r[6]).trim();
  if (!isO_(st)) return { status: st ? 'X' : 'wait', email: v.email, name: String(a.r[2]), school: String(a.r[3]), member: memberSt_(a.r[9]), op: op };
  if (dstr_(a.r[7]) !== today_()) { try { sheet_(SH_ACC).getRange(a.row, 8).setValue(now_()); } catch (e) {} }
  const me = me_(v.email); me.status = 'O'; me.email = v.email; me.op = op; return me;
}

/************ 반 ************/
function classRow_(r) {
  const st = stampsOf_(r[4]);
  return { cid: String(r[0]), owner: String(r[1]), name: String(r[2]), region: String(r[3]), stamps: st.map(function (x) { return x[0]; }), stampDates: st,
    vote: mstr_(r[5]) && num_(r[6]) ? { month: mstr_(r[5]), song: num_(r[6]) } : null, likes: parse_(r[7], []), relays: parse_(r[8], []), hidden: isO_(r[11]) };
}
function me_(id) {
  const a = findAcc_(id);
  const lyr = {};
  values_(SH_LYRICS).slice(1).forEach(function (r) {
    const st = String(r[7] || '').trim();
    (lyr[String(r[1])] = lyr[String(r[1])] || []).push({ id: String(r[0]), songId: num_(r[2]), text: String(r[3]), status: isO_(st) ? 'O' : st ? 'X' : '' });
  });
  const classes = values_(SH_CLASSES).slice(1).filter(function (r) { return String(r[1]) === id; }).map(function (r) {
    const c = classRow_(r); delete c.owner; delete c.stampDates; c.lyrics = lyr[c.cid] || []; return c;
  });
  return { id: id, name: a ? String(a.r[2]) : '', school: a ? String(a.r[3]) : '', region: a ? String(a.r[4]) : '', member: a ? memberSt_(a.r[9]) : '', classes: classes, month: month_(), status: 'O', email: id };
}
function myClass_(id, cid) {
  const sh = sheet_(SH_CLASSES), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(cid)) {
    if (String(v[i][1]) !== id) throw new Error('내 반이 아니에요.');
    return { sh: sh, row: i + 1, r: v[i] };
  }
  throw new Error('반을 찾지 못했어요.');
}
function addClass_(token, name, region) {
  const id = who_(token), n = clean_(name, 20);
  if (!n) throw new Error('반 이름을 적어 주세요. 예: 서울햇살초 5-1');
  if (REGIONS_.indexOf(region) === -1) throw new Error('지역을 골라 주세요.');
  return withLock_(function () {
    const v = values_(SH_CLASSES);
    if (v.slice(1).filter(function (r) { return String(r[1]) === id; }).length >= MAX_CLASSES) throw new Error('반은 ' + MAX_CLASSES + '개까지 만들 수 있어요.');
    const cid = 'c' + hash_(id + '|' + Utilities.getUuid()).slice(0, 10);
    sheet_(SH_CLASSES).appendRow([cid, id, n, region, '[]', '', '', '[]', '[]', now_(), now_(), '']);
    bust_();
    const me = me_(id); me.newCid = cid; return me;
  });
}
function editClass_(token, cid, name, region) {
  const id = who_(token), n = clean_(name, 20);
  if (!n || REGIONS_.indexOf(region) === -1) throw new Error('반 이름과 지역을 정해 주세요.');
  return withLock_(function () {
    const c = myClass_(id, cid);
    c.sh.getRange(c.row, 3, 1, 2).setValues([[n, region]]);
    bust_(); return me_(id);
  });
}
function touch_(c) { c.sh.getRange(c.row, 11).setValue(now_()); }
function toggleStamp_(token, cid, songId) {
  const id = who_(token), s = num_(songId); if (!s) throw new Error('곡을 찾지 못했어요.');
  return withLock_(function () {
    const c = myClass_(id, cid), list = stampsOf_(c.r[4]), i = list.findIndex(function (x) { return x[0] === s; });
    if (i >= 0) list.splice(i, 1); else list.push([s, today_()]);
    c.sh.getRange(c.row, 5).setValue(JSON.stringify(list)); touch_(c); bust_(); return me_(id);
  });
}
function vote_(token, cid, songId) {
  const id = who_(token), s = num_(songId); if (!s) throw new Error('곡을 찾지 못했어요.');
  return withLock_(function () {
    const c = myClass_(id, cid);
    c.sh.getRange(c.row, 6).setNumberFormat('@'); c.sh.getRange(c.row, 6, 1, 2).setValues([[month_(), s]]); touch_(c); bust_(); return me_(id);
  });
}
function joinRelay_(token, cid, relayId) {
  const id = who_(token), rid = clean_(relayId, 30); if (!rid) throw new Error('릴레이를 찾지 못했어요.');
  return withLock_(function () {
    const c = myClass_(id, cid), list = parse_(c.r[8], []);
    if (list.indexOf(rid) === -1) {
      list.push(rid); c.sh.getRange(c.row, 9).setValue(JSON.stringify(list));
      sheet_(SH_RELAY).appendRow([rid, String(c.r[0]), String(c.r[2]), String(c.r[3]), now_()]);
    }
    touch_(c); bust_(); return me_(id);
  });
}
function addLyric_(token, cid, songId, text) {
  const id = who_(token), s = num_(songId), t = lyricText_(text);
  if (!s) throw new Error('곡을 찾지 못했어요.');
  if (!t) throw new Error('가사를 먼저 적어 주세요.');
  return withLock_(function () {
    const c = myClass_(id, cid), v = values_(SH_LYRICS);
    const mine = v.slice(1).filter(function (r) { return String(r[1]) === String(cid); });
    if (mine.filter(function (r) { return num_(r[2]) === s; }).length >= 3) throw new Error('한 곡에 우리 반 가사는 세 개까지 올릴 수 있어요.');
    sheet_(SH_LYRICS).appendRow([cid + '-' + (mine.length + 1), cid, s, t, String(c.r[2]), String(c.r[3]), now_(), '']);
    notify_('새 바꾼 가사: ' + String(c.r[2]), String(c.r[2]) + ' (' + String(c.r[3]) + ')에서 ' + s + '번 곡의 바꾼 가사를 올렸어요.\n\n' + t + '\n\n운영진 메뉴의 가사 확인 칸에서 공개하거나 숨겨 주세요.');
    touch_(c); return me_(id);
  });
}
function toggleLike_(token, cid, key) {
  const id = who_(token), k = clean_(key, 40);
  if (!k) throw new Error('가사를 찾지 못했어요.');
  if (k.indexOf(String(cid) + '-') === 0) throw new Error('우리 반 가사에는 좋아요를 누를 수 없어요.');
  return withLock_(function () {
    const c = myClass_(id, cid), list = parse_(c.r[7], []), i = list.indexOf(k);
    if (i >= 0) list.splice(i, 1); else list.push(k);
    c.sh.getRange(c.row, 8).setValue(JSON.stringify(list)); touch_(c); bust_(); return me_(id);
  });
}

/************ 전국 현황 ************/
function getBoard_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('board');
  if (hit) return JSON.parse(hit);
  const month = month_(), ok = {};
  values_(SH_ACC).slice(1).forEach(function (r) { if (isO_(r[6])) ok[String(r[0])] = 1; });
  const ys = yearStart_();
  const regions = {}, regionsYear = {}; REGIONS_.forEach(function (r) { regions[r] = { stamps: 0, classes: 0 }; regionsYear[r] = { stamps: 0, classes: 0 }; });
  const songClasses = {}, songMonth = {}, songYear = {}, votes = {}, likeCount = {}, classes = {};
  let classCount = 0, classYear = 0;
  values_(SH_CLASSES).slice(1).forEach(function (r) {
    const c = classRow_(r);
    if (!c.cid || c.hidden || !ok[c.owner] || !regions[c.region]) return;
    classes[c.cid] = c;
    const inMonth = c.stampDates.filter(function (x) { return x[1].slice(0, 7) === month; }).length;
    const inYear = c.stampDates.filter(function (x) { return !x[1] || x[1] >= ys; });
    if (inMonth) { regions[c.region].stamps += inMonth; regions[c.region].classes++; classCount++; }
    if (inYear.length) { regionsYear[c.region].stamps += inYear.length; regionsYear[c.region].classes++; classYear++; }
    c.stampDates.forEach(function (x) {
      songClasses[x[0]] = (songClasses[x[0]] || 0) + 1;
      if (!x[1] || x[1] >= ys) songYear[x[0]] = (songYear[x[0]] || 0) + 1;
      if (x[1].slice(0, 7) === month) songMonth[x[0]] = (songMonth[x[0]] || 0) + 1;
    });
    if (c.vote && c.vote.month === month) votes[c.vote.song] = (votes[c.vote.song] || 0) + 1;
    c.likes.forEach(function (k) { likeCount[k] = (likeCount[k] || 0) + 1; });
  });
  const relays = {};
  values_(SH_RELAY).slice(1).forEach(function (r) {
    const c = classes[String(r[1])]; if (!c) return;
    (relays[String(r[0])] = relays[String(r[0])] || []).push({ pid: c.cid, cls: c.name, region: c.region });
  });
  const lyrics = {};
  values_(SH_LYRICS).slice(1).forEach(function (r) {
    if (!isO_(r[7])) return;
    const c = classes[String(r[1])]; if (!c) return;
    const key = String(r[0]), sid = num_(r[2]);
    (lyrics[sid] = lyrics[sid] || []).push({ key: key, pid: c.cid, cls: c.name, region: c.region, text: String(r[3]), likes: likeCount[key] || 0 });
  });
  const songs = [];
  values_(SH_SONGS).slice(1).forEach(function (r) {
    const id = num_(r[0]);
    if (!id || !String(r[1]).trim() || isO_(r[17])) return;
    songs.push({ id: id, title: clean_(r[1], 40), lyricist: clean_(r[2], 40), composer: clean_(r[3], 40), concert: clean_(r[4], 40),
      year: num_(r[5]) || '', grade: clean_(r[6], 10), themes: String(r[7]).split(/[,，、]/).map(function (x) { return clean_(x, 10); }).filter(String),
      season: clean_(r[8], 20), key: clean_(r[9], 4), beat: clean_(beatStr_(r[10]), 6), range: clean_(r[11], 12),
      lyrics: String(r[12] || '').slice(0, 2000), intro: String(r[13] || '').slice(0, 600), tip: String(r[14] || '').slice(0, 600),
      video: /^https:\/\//.test(String(r[15])) ? String(r[15]).trim() : '', score: /^https:\/\//.test(String(r[16])) ? String(r[16]).trim() : '',
      audio: /^https:\/\//.test(String(r[19] || '')) ? String(r[19]).trim() : '', type: String(r[20] || '').trim() === '편곡' ? '편곡' : '창작곡', arranger: clean_(r[21], 40) });
  });
  const set = settings_();
  const relay = { id: clean_(set['릴레이 이름'], 30) || '첫 번째 릴레이', song: num_(set['릴레이 곡번호']) || (songs[0] ? songs[0].id : 0) };
  const contact = okMail_(set['문의 이메일']) ? String(set['문의 이메일']).trim() : '';
  const td = today_(), sched = {};
  values_(SH_TODAY).slice(1).forEach(function (r) { const d = dstr_(r[0]), id = num_(r[1]); if (id && d >= td && d <= td.slice(0, 7) + '-31') sched[d] = { song: id, note: clean_(r[2], 80) }; });
  const out = { month: month, today: td, yearStart: ys, classes: classCount, classesYear: classYear, regions: regions, regionsYear: regionsYear, songClasses: songClasses, songMonth: songMonth, songYear: songYear, todaySong: sched[td] || null, votes: votes, relays: relays, lyrics: lyrics, songs: songs, relay: relay, contact: contact, updated: now_() };
  try { cache.put('board', JSON.stringify(out), BOARD_CACHE_SEC); } catch (e) {}
  return out;
}
function clearBoardCache() { bust_(); }

/************ 운영진 ************/
// 운영진: 이 시트·앱스크립트를 가진 구글 계정(동요샘 관리 계정)은 늘 운영진이에요.
// 다른 선생님은 가입 승인을 받은 뒤, 운영진이 계정 칸에서 '운영진 권한'을 주면 운영진이 돼요.
function ownerEmail_() {
  const p = PropertiesService.getScriptProperties(); let e = p.getProperty('OWNER');
  if (!e) { try { e = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (x) { e = ''; } if (e) p.setProperty('OWNER', e); }
  return e || '';
}
function opInfo_(token) {
  if (!token) return null;
  let v; try { v = verify_(token); } catch (e) { return null; }
  const c = CacheService.getScriptCache(), k = 'OPE_' + v.email, hit = c.get(k);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  let info = null;
  try {
    const a = findAcc_(v.email), owner = v.email === ownerEmail_();
    if (owner || (a && isO_(String(a.r[6]).trim()) && String(a.r[14] || '').trim() === '운영진'))
      info = { email: v.email, name: a ? String(a.r[2]) : '동요샘 관리 계정', owner: owner };
  } catch (e) {}
  c.put(k, info ? JSON.stringify(info) : '-', 300);
  return info;
}
function log_(who, what, target) { try { sheet_(SH_LOG).appendRow([now_(), who, what, String(target || '').slice(0, 80)]); } catch (e) {} }
function opWho_(token) { const i = opInfo_(token); return i ? i.name : '운영진'; }
function opNeed_(token) { if (!opInfo_(token)) throw new Error('운영진 권한이 있는 구글 계정으로 로그인해 주세요.'); }
function opRole_(token, email, role) {
  opNeed_(token);
  const a = findAcc_(String(email)); if (!a) throw new Error('계정을 찾지 못했어요.');
  if (role === '운영진' && !isO_(String(a.r[6]).trim())) throw new Error('가입 승인을 먼저 해 주세요.');
  sheet_(SH_ACC).getRange(a.row, 15).setValue(role === '운영진' ? '운영진' : '');
  CacheService.getScriptCache().remove('OPE_' + String(a.r[0]).toLowerCase());
  log_(opWho_(token), role === '운영진' ? '운영진 권한 줌' : '운영진 권한 뺌', email + ' ' + String(a.r[2]));
  return opData_(token);
}
// 드라이브 권한 허용: 노래 파일·악보 올리기용. 한 번 실행하면 권한 창이 떠요 (폴더 '동요샘 노래상자 파일'이 생겨요)
function allowDrive() { Logger.log('파일 폴더: ' + folder_().getUrl()); }
// 알림 메일 권한 허용: 새 코드를 붙여 넣은 뒤 이 함수를 한 번 실행하면 메일 보내기 권한을 허용하는 창이 떠요 (메일은 보내지 않아요)
function allowMail() { Logger.log('오늘 보낼 수 있는 메일: ' + MailApp.getRemainingDailyQuota()); }
// 처음 한 번: 이 함수를 실행하면 이 구글 계정이 '동요샘 관리 계정'(늘 운영진)으로 정해지고, 필요한 권한을 한꺼번에 허용해요
function setup() {
  PropertiesService.getScriptProperties().deleteProperty('OWNER');
  Logger.log('관리 계정(늘 운영진): ' + ownerEmail_());
  Logger.log('파일 폴더: ' + folder_().getUrl());
  Logger.log('오늘 보낼 수 있는 메일: ' + MailApp.getRemainingDailyQuota());
  try { UrlFetchApp.fetch('https://www.googleapis.com', { muteHttpExceptions: true }); } catch (e) {}
  fixHeads_();
  Logger.log('준비 끝! 이제 [배포]를 해 주세요.');
}

// 예전 시트에 새 칸 제목 채우기
function fixHeads_() {
  [SH_SONGS, SH_ACC, SH_CLASSES].forEach(function (n) {
    const sh = sheet_(n), h = HEAD_[n], cur = sh.getRange(1, 1, 1, h.length).getValues()[0];
    h.forEach(function (t, i) { const c = String(cur[i]).trim(); if (c === '' || (n === SH_ACC && (c === '아이디' || c === '비밀번호(암호화)'))) sh.getRange(1, i + 1).setValue(t).setFontWeight('bold'); });
  });
}
function opData_(token) {
  opNeed_(token);
  fixHeads_();
  const songs = values_(SH_SONGS).slice(1).filter(function (r) { return num_(r[0]); }).map(function (r) {
    return { id: num_(r[0]), title: String(r[1]), lyricist: String(r[2]), composer: String(r[3]), concert: String(r[4]), year: r[5] === '' ? '' : String(r[5]),
      grade: String(r[6]), themes: String(r[7]), season: String(r[8]), key: String(r[9]), beat: beatStr_(r[10]), range: String(r[11]),
      lyrics: String(r[12]), intro: String(r[13]), tip: String(r[14]), video: String(r[15]), score: String(r[16]), hidden: isO_(r[17]), consent: isO_(r[18]), audio: String(r[19] || ''), type: String(r[20] || '').trim() === '편곡' ? '편곡' : '창작곡', arranger: String(r[21] || '') };
  });
  const lyrics = values_(SH_LYRICS).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const st = String(r[7] || '').trim();
    return { id: String(r[0]), songId: num_(r[2]), text: String(r[3]), cls: String(r[4]), region: String(r[5]), at: tstr_(r[6]), status: isO_(st) ? 'O' : st ? 'X' : '' };
  });
  const from = Utilities.formatDate(new Date(Date.now() - 62 * 86400000), TZ_, 'yyyy-MM') + '-01', schedule = {};
  values_(SH_TODAY).slice(1).forEach(function (r) { const d = dstr_(r[0]), id = num_(r[1]); if (id && d >= from) schedule[d] = { song: id, note: String(r[2] || '') }; });
  const logs = values_(SH_LOG).slice(1).slice(-60).reverse().map(function (r) { return { at: tstr_(r[0]), who: String(r[1]), what: String(r[2]), target: String(r[3]) }; });
  const accounts = values_(SH_ACC).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const st = String(r[6] || '').trim();
    return { id: String(r[0]), name: String(r[2]), school: String(r[3]), region: String(r[4]), at: tstr_(r[5]), last: tstr_(r[7]), status: isO_(st) ? 'O' : st ? 'X' : '', member: memberSt_(r[9]), pos: String(r[10] || ''), phone: String(r[11] || ''), reg: isO_(r[12]), mAt: tstr_(r[13]), role: String(r[14] || '').trim() === '운영진' ? '운영진' : '' };
  });
  const classes = values_(SH_CLASSES).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { pid: String(r[0]), owner: String(r[1]), name: String(r[2]), region: String(r[3]), stamps: parse_(r[4], []).length, last: tstr_(r[10]), hidden: isO_(r[11]) };
  });
  const set = settings_();
  const oi = opInfo_(token);
  return { owner: ownerEmail_(), myEmail: oi ? oi.email : '', songs: songs, lyrics: lyrics, accounts: accounts, classes: classes, logs: logs, schedule: schedule, today: today_(), me: opWho_(token), contact: String(set['문의 이메일'] || ''), notify: String(set['알림 이메일'] || ''),
    relay: { id: String(set['릴레이 이름'] || ''), song: num_(set['릴레이 곡번호']) } };
}
function opAccount_(token, id, status) {
  opNeed_(token);
  const a = findAcc_(String(id)); if (!a) throw new Error('계정을 찾지 못했어요.');
  sheet_(SH_ACC).getRange(a.row, 7).setValue(status === 'O' ? 'O' : status === 'X' ? 'X' : '');
  CacheService.getScriptCache().remove('OPE_' + String(a.r[0]).toLowerCase());
  sheet_(SH_ACC).getRange(a.row, 9).setValue((status === 'O' ? '승인' : status === 'X' ? '거절' : '다시 검토') + ' · ' + opWho_(token) + ' · ' + now_().slice(0, 16));
  log_(opWho_(token), status === 'O' ? '계정 승인' : status === 'X' ? '계정 거절' : '계정 다시 검토', id + ' ' + String(a.r[2]));
  bust_(); return opData_(token);
}
function opContact_(token, email) {
  opNeed_(token);
  const e = String(email || '').trim();
  if (e && !okMail_(e)) throw new Error('이메일 주소 모양이 아니에요.');
  putSetting_('문의 이메일', e, '비밀번호를 잊은 선생님이 연락할 주소 (화면에 보여요)');
  log_(opWho_(token), '문의 이메일 바꿈', e);
  bust_(); return opData_(token);
}
function opNotify_(token, email) {
  opNeed_(token);
  const e = String(email || '').trim();
  if (e && !okMail_(e)) throw new Error('이메일 주소 모양이 아니에요.');
  putSetting_('알림 이메일', e, '가입 신청·새 가사가 오면 알림을 받을 운영진 주소 (화면에 안 보여요)');
  log_(opWho_(token), '알림 이메일 바꿈', e);
  if (e) { try { MailApp.sendEmail({ to: e, subject: '[동요샘 노래상자] 알림 메일 확인', body: '이제 가입 신청과 새 바꾼 가사가 오면 이 주소로 알려 드려요.\n\n운영진 메뉴: ' + APP_URL + '?tab=op' }); } catch (err) { throw new Error('알림 메일을 보내지 못했어요. 서버를 배포할 때 메일 보내기 권한을 허용했는지 확인해 주세요.'); } }
  return opData_(token);
}
// 오늘의 동요 달력: 한 달치를 통째로 바꿔 저장 (entries: [{date, song, note}])
function opToday_(token, month, entries) {
  opNeed_(token);
  const m = String(month || '');
  if (!/^\d{4}-\d{2}$/.test(m)) throw new Error('달을 알 수 없어요.');
  return withLock_(function () {
    const sh = sheet_(SH_TODAY), v = sh.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) if (dstr_(v[i][0]).slice(0, 7) === m) sh.deleteRow(i + 1);
    const rows = (Array.isArray(entries) ? entries : []).filter(function (e) { return e && String(e.date).slice(0, 7) === m && /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) && num_(e.song); })
      .map(function (e) { return [String(e.date), num_(e.song), clean_(e.note, 80)]; });
    if (rows.length) { sh.getRange('A:A').setNumberFormat('@'); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 3).setValues(rows); }
    log_(opWho_(token), '오늘의 동요 달력 저장', m + ' · ' + rows.length + '일');
    bust_(); return opData_(token);
  });
}
// 엑셀로 여러 곡 한꺼번에 올리기: 같은 제목이 이미 있으면 건너뜀, 잘못된 줄은 이유와 함께 알려 줌
function opBulkSongs_(token, list) {
  opNeed_(token);
  if (!Array.isArray(list) || !list.length) throw new Error('올릴 곡이 없어요.');
  if (list.length > 200) throw new Error('한 번에 200곡까지 올릴 수 있어요.');
  return withLock_(function () {
    const sh = sheet_(SH_SONGS), v = sh.getDataRange().getValues(), have = {};
    let max = 0;
    for (let i = 1; i < v.length; i++) { max = Math.max(max, num_(v[i][0])); have[String(v[i][1]).trim()] = 1; }
    const rows = [], skipped = [];
    list.forEach(function (s, k) {
      const t = clean_(s && s.title, 40), at = (s && s.line) || (k + 1);
      if (t && have[t]) { skipped.push(at + '번째 줄 「' + t + '」: 같은 제목이 이미 있어요'); return; }
      try { rows.push(songData_(s, max + rows.length + 1)); have[t] = 1; }
      catch (e) { skipped.push(at + '번째 줄' + (t ? ' 「' + t + '」' : '') + ': ' + e.message); }
    });
    if (rows.length) {
      const start = sh.getLastRow() + 1;
      songTextCols_(sh, start, rows.length);
      sh.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
      sh.getRange(start, 13, rows.length, 3).setWrap(true);
    }
    log_(opWho_(token), '엑셀로 곡 올림', rows.length + '곡' + (skipped.length ? ' · 건너뜀 ' + skipped.length : ''));
    bust_();
    const d = opData_(token); d.bulk = { added: rows.length, skipped: skipped }; return d;
  });
}
// 노래 파일(mp3)·악보(PDF·그림) 올리기: 운영진 구글 드라이브의 '동요샘 노래상자 파일' 폴더에 저장하고 링크로 공유
const UPLOAD_MAX = 20 * 1024 * 1024;
function folder_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('DRIVE_FOLDER');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder('동요샘 노래상자 파일');
  p.setProperty('DRIVE_FOLDER', f.getId());
  return f;
}
function opUpload_(token, kind, name, mime, data) {
  opNeed_(token);
  mime = String(mime || '');
  const okType = kind === 'audio' ? /^audio\//.test(mime) || mime === 'video/mp4' : /^image\//.test(mime) || mime === 'application/pdf';
  if (!okType) throw new Error(kind === 'audio' ? 'mp3 같은 노래 파일만 올릴 수 있어요.' : '악보는 PDF나 그림 파일만 올릴 수 있어요.');
  const bytes = Utilities.base64Decode(String(data || ''));
  if (!bytes.length) throw new Error('파일이 비어 있어요.');
  if (bytes.length > UPLOAD_MAX) throw new Error('파일이 너무 커요. 20MB까지 올릴 수 있어요.');
  let file;
  try { file = folder_().createFile(Utilities.newBlob(bytes, mime, clean_(name, 80) || '파일')); }
  catch (e) { throw new Error('드라이브에 저장하지 못했어요. 편집기에서 allowDrive 를 한 번 실행해 권한을 허용해 주세요.'); }
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (e) { throw new Error('파일은 올렸지만 링크 공유를 켜지 못했어요. 드라이브에서 직접 "링크가 있는 모든 사용자"로 바꿔 주세요.'); }
  log_(opWho_(token), kind === 'audio' ? '노래 파일 올림' : '악보 파일 올림', file.getName());
  return { id: file.getId(), name: file.getName(), url: 'https://drive.google.com/file/d/' + file.getId() + '/view' };
}
// 기록 내려받기: 반별·곡별
function opExport_(token) {
  opNeed_(token);
  const month = month_(), ys = yearStart_(), acc = {};
  values_(SH_ACC).slice(1).forEach(function (r) { acc[String(r[0])] = { name: String(r[2]), school: String(r[3]) }; });
  const lyrCount = {}, lyrSong = {};
  values_(SH_LYRICS).slice(1).forEach(function (r) { lyrCount[String(r[1])] = (lyrCount[String(r[1])] || 0) + 1; if (isO_(r[7])) lyrSong[num_(r[2])] = (lyrSong[num_(r[2])] || 0) + 1; });
  const songStat = {};
  const classes = values_(SH_CLASSES).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const c = classRow_(r), a = acc[c.owner] || { name: '', school: '' };
    const m = c.stampDates.filter(function (x) { return x[1].slice(0, 7) === month; }).length, y = c.stampDates.filter(function (x) { return !x[1] || x[1] >= ys; }).length;
    c.stampDates.forEach(function (x) { const st = songStat[x[0]] = songStat[x[0]] || { all: 0, year: 0, month: 0 }; st.all++; if (!x[1] || x[1] >= ys) st.year++; if (x[1].slice(0, 7) === month) st.month++; });
    return [c.name, c.region, a.school, a.name, c.owner, c.stamps.length, y, m, c.vote && c.vote.month === month ? c.vote.song : '', lyrCount[c.cid] || 0, c.relays.length, dstr_(r[9]), tstr_(r[10]), c.hidden ? '숨김' : ''];
  });
  const votes = {};
  values_(SH_CLASSES).slice(1).forEach(function (r) { if (mstr_(r[5]) === month && num_(r[6])) votes[num_(r[6])] = (votes[num_(r[6])] || 0) + 1; });
  const songs = values_(SH_SONGS).slice(1).filter(function (r) { return num_(r[0]); }).map(function (r) {
    const id = num_(r[0]), st = songStat[id] || { all: 0, year: 0, month: 0 };
    return [id, String(r[1]), String(r[20] || '').trim() === '편곡' ? '편곡' : '창작곡', String(r[2]), String(r[3]), String(r[21] || ''), String(r[4]) || '발표회 없음', st.all, st.year, st.month, votes[id] || 0, lyrSong[id] || 0, isO_(r[17]) ? '숨김' : '', isO_(r[18]) ? 'O' : ''];
  });
  log_(opWho_(token), '기록 내려받기', '');
  return { month: month, yearStart: ys,
    classHead: ['반 이름', '지역', '학교', '선생님', '아이디', '스티커(모두)', '스티커(올해)', '스티커(이번 달)', '이번 달 투표 곡번호', '올린 가사', '릴레이 참여', '만든 날', '마지막 기록', '숨김'], classes: classes,
    songHead: ['곡번호', '곡 제목', '곡 종류', '작사', '작곡', '편곡', '발표회', '부른 반(모두)', '부른 반(올해)', '부른 반(이번 달)', '이번 달 투표', '공개된 바꾼 가사', '숨김', '공개 동의'], songs: songs };
}
// 곡 한 줄 만들기 (확인할 것을 확인하고, 시트에 들어갈 칸 순서대로)
function songData_(s, id) {
  s = s || {};
  const title = clean_(s.title, 40);
  if (!title) throw new Error('곡 제목을 적어 주세요.');
  if (!s.consent) throw new Error('작사·작곡·편곡 선생님께 공개 동의를 받았는지 확인해 주세요.');
  if (s.type === '편곡' && !clean_(s.arranger, 40)) throw new Error('편곡한 선생님 이름을 적어 주세요.');
  if (/^[-–—\s]+$/.test(String(s.concert || ''))) s.concert = '';
  const link = function (u) { u = String(u || '').trim(); if (u && !/^https:\/\//.test(u)) throw new Error('영상·노래·악보 주소는 https:// 로 시작해야 해요.'); return u.slice(0, 500); };
  const long = function (t, n) { return String(t == null ? '' : t).replace(/\r/g, '').replace(/[<>]/g, '').slice(0, n); };
  return [id, title, clean_(s.lyricist, 40), clean_(s.composer, 40), clean_(s.concert, 40), num_(s.year) || '', clean_(s.grade, 10),
    clean_(s.themes, 60), clean_(s.season, 20), clean_(s.key, 4), clean_(s.beat, 6), clean_(s.range, 12),
    long(s.lyrics, 2000), long(s.intro, 600), long(s.tip, 600), link(s.video), link(s.score), s.hidden ? 'O' : '', 'O', link(s.audio), s.type === '편곡' ? '편곡' : '창작곡', s.type === '편곡' ? clean_(s.arranger, 40) : ''];
}
function opSaveSong_(token, s) {
  opNeed_(token);
  s = s || {};
  songData_(s, 0);
  const title = clean_(s.title, 40);
  return withLock_(function () {
    const sh = sheet_(SH_SONGS), v = sh.getDataRange().getValues();
    let id = num_(s.id), row = 0, max = 0;
    for (let i = 1; i < v.length; i++) { const n = num_(v[i][0]); max = Math.max(max, n); if (id && n === id) row = i + 1; }
    if (!id) id = max + 1;
    const data = songData_(s, id);
    if (!row) row = sh.getLastRow() + 1;
    songTextCols_(sh, row, 1);
    sh.getRange(row, 1, 1, data.length).setValues([data]);
    sh.getRange(row, 13, 1, 3).setWrap(true);
    log_(opWho_(token), num_(s.id) ? '곡 고침' : '새 곡 올림', id + '. ' + title);
    bust_(); return opData_(token);
  });
}
function opDeleteSong_(token, id) {
  opNeed_(token);
  const n = num_(id); if (!n) throw new Error('곡을 찾지 못했어요.');
  return withLock_(function () {
    const sh = sheet_(SH_SONGS), v = sh.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) if (num_(v[i][0]) === n) { log_(opWho_(token), '곡 지움', n + '. ' + String(v[i][1])); sh.deleteRow(i + 1); bust_(); return opData_(token); }
    throw new Error('곡을 찾지 못했어요.');
  });
}
// 처음 설치 때 들어간 예시 곡(작사·작곡이 "예시"로 시작)만 지움
function opClearExamples_(token) {
  opNeed_(token);
  return withLock_(function () {
    const sh = sheet_(SH_SONGS), v = sh.getDataRange().getValues();
    let n = 0;
    for (let i = v.length - 1; i >= 1; i--) if (/^예시/.test(String(v[i][2])) || /^예시/.test(String(v[i][3]))) { sh.deleteRow(i + 1); n++; }
    log_(opWho_(token), '예시 곡 모두 지움', n + '곡');
    bust_(); return opData_(token);
  });
}
function opLyric_(token, id, status) {
  opNeed_(token);
  const sh = sheet_(SH_LYRICS), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) {
    sh.getRange(i + 1, 8).setValue(status === 'O' ? 'O' : status === 'X' ? 'X' : '');
    log_(opWho_(token), status === 'O' ? '가사 공개' : status === 'X' ? '가사 숨김' : '가사 확인 전으로', String(v[i][4]) + ' · ' + String(v[i][3]).split('\n')[0]);
    bust_(); return opData_(token);
  }
  throw new Error('그 가사를 찾지 못했어요.');
}
function opRelay_(token, name, songId) {
  opNeed_(token);
  const n = clean_(name, 30), id = num_(songId);
  if (!n || !id) throw new Error('릴레이 이름과 곡을 정해 주세요.');
  putSetting_('릴레이 이름', n); putSetting_('릴레이 곡번호', id);
  log_(opWho_(token), '릴레이 정함', n + ' · ' + id + '번 곡');
  bust_(); return opData_(token);
}
function opClass_(token, cid, hidden) {
  opNeed_(token);
  const sh = sheet_(SH_CLASSES), v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(cid)) {
    sh.getRange(i + 1, 12).setValue(hidden ? 'O' : '');
    log_(opWho_(token), hidden ? '반 숨김' : '반 다시 보이기', String(v[i][2]));
    bust_(); return opData_(token);
  }
  throw new Error('그 반을 찾지 못했어요.');
}

/* 요청 이름 → 함수 (맨 아래에 두어야 위 함수들이 모두 준비된 뒤 묶임) */
/************ 동요샘 회원방 ************/
// 노래상자 계정 가운데 운영진이 '동요샘 회원'으로 승인한 선생님만 들어와요.
// '회원만' 자료는 회원이 아니면 목록·제목·파일 어느 것도 받지 못해요 (드라이브 파일도 비공개로 둬요).
const LIB_KINDS_ = ['악보', '반주(MR)', '음원', '가사', '수업 자료', '공연·발표회', '기타'];
const ROOM_FILE_MAX = 20 * 1024 * 1024;
function memberSt_(v) { const t = String(v == null ? '' : v).trim(); return isO_(t) ? 'O' : t === '신청' ? '신청' : t ? 'X' : ''; }
function member_(token) {
  const v = verify_(token), a = findAcc_(v.email);
  if (a && isO_(String(a.r[6]).trim()) && memberSt_(a.r[9]) === 'O') return { id: v.email, name: String(a.r[2]), school: String(a.r[3]) };
  // 운영진은 회원 승인이 없어도 들어와요
  const op = opInfo_(token);
  if (op) return { id: v.email, name: op.name, school: a ? String(a.r[3]) : '운영진', op: true };
  throw new Error('동요샘 회원만 쓸 수 있어요. 운영진이 회원으로 승인하면 열려요.');
}
function isOp_(t) { return !!opInfo_(t); }
function rid_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function findRow_(name, id) {
  const v = values_(name);
  for (let i = 1; i < v.length; i++) if (String(v[i][0]) === String(id)) return { row: i + 1, r: v[i] };
  return null;
}
function hm_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ_, 'HH:mm') : String(v == null ? '' : v).trim().slice(0, 5); }
// 링크 여러 개: 줄마다 '설명 | 주소' 또는 주소만 (최대 10줄)
function links_(v) {
  const lines = String(v || '').replace(/\r/g, '').split('\n').map(function (x) { return x.trim(); }).filter(String).slice(0, 10);
  return lines.map(function (ln) {
    const i = ln.lastIndexOf('|'), label = i >= 0 ? clean_(ln.slice(0, i), 40) : '', url = cleanUrl_(i >= 0 ? ln.slice(i + 1) : ln);
    if (!url) throw new Error('링크는 줄마다 "설명 | https://주소" 또는 https:// 로 시작하는 주소로 적어 주세요: ' + ln.slice(0, 40));
    return label ? label + ' | ' + url : url;
  }).join('\n');
}
function cleanUrl_(v) { const t = String(v || '').trim().slice(0, 300); return /^https?:\/\/[^\s<>"]+$/.test(t) ? t : ''; }
function longText_(v, max) { return String(v == null ? '' : v).replace(/\r/g, '').replace(/[<>\u0000-\u0009\u000b-\u001f]/g, '').trim().slice(0, max); }
function subFolder_(key, name) {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = folder_().createFolder(name);
  p.setProperty(key, f.getId());
  return f;
}
// kind: PUB(누구나) / MEM(회원만) / MS(곡집 원고) — 누구나 자료만 링크 공개, 나머지는 비공개
function roomSave_(kind, name, mime, data) {
  const bytes = Utilities.base64Decode(String(data || ''));
  if (!bytes.length) throw new Error('파일이 비어 있어요.');
  if (bytes.length > ROOM_FILE_MAX) throw new Error('파일이 너무 커요. 20MB까지 올릴 수 있어요.');
  let file;
  try {
    const f = kind === 'PUB' ? subFolder_('F_PUB', '회원방 - 누구나 자료') : kind === 'OPS' ? subFolder_('F_OPS', '회원방 - 운영진만 자료') : kind === 'MS' ? subFolder_('F_MS', '회원방 - 곡집 원고') : subFolder_('F_MEM', '회원방 - 회원만 자료');
    file = f.createFile(Utilities.newBlob(bytes, String(mime || 'application/octet-stream'), clean_(name, 80) || '파일'));
  } catch (e) { throw new Error('드라이브에 저장하지 못했어요. 편집기에서 allowDrive 를 한 번 실행해 권한을 허용해 주세요.'); }
  if (kind === 'PUB') { try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {} }
  return file;
}
function trash_(fid) { if (fid) { try { DriveApp.getFileById(String(fid)).setTrashed(true); } catch (e) {} } }
function fileOut_(fid) {
  const f = DriveApp.getFileById(String(fid)), b = f.getBlob(), by = b.getBytes();
  if (by.length > 26 * 1024 * 1024) throw new Error('파일이 너무 커서 여기서 열 수 없어요.');
  return { name: f.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(by) };
}

// 회원방 신청 (이미 로그인한 선생님)
function roomApply_(token, m) {
  const id = who_(token), a = findAcc_(id);
  if (!a) throw new Error('계정을 찾지 못했어요.');
  if (memberSt_(a.r[9]) !== 'O') {
    const info = memberInfo_(m), sh = sheet_(SH_ACC);
    sh.getRange(a.row, 10).setValue('신청');
    sh.getRange(a.row, 12).setNumberFormat('@');
    sh.getRange(a.row, 11, 1, 4).setValues([info]);
    notify_('회원방 신청: ' + a.r[2] + ' 선생님 (' + a.r[3] + ')', String(a.r[2]) + ' 선생님이 동요샘 회원방을 신청했어요. (직위: ' + info[0] + ')\n\n운영진 메뉴의 계정 칸에서 회원으로 승인해 주세요.');
  }
  const me = me_(id); me.status = 'O'; me.email = id; return me;
}
function opMember_(token, id, st) {
  opNeed_(token);
  const a = findAcc_(String(id)); if (!a) throw new Error('계정을 찾지 못했어요.');
  sheet_(SH_ACC).getRange(a.row, 10).setValue(st === 'O' ? 'O' : st === 'X' ? 'X' : '');
  if (st !== 'O' && a.r[1]) { try { rtdb_('delete', '/members/' + a.r[1]); CacheService.getScriptCache().remove('FBJ_' + a.r[1]); } catch (e) {} }
  log_(opWho_(token), st === 'O' ? '회원방 회원 승인' : st === 'X' ? '회원방 회원 뺌' : '회원방 신청 다시 검토', id + ' ' + String(a.r[2]));
  return opData_(token);
}

/* 자료방 */
// 공개 범위: 누구나 / 회원(동요샘 회원만) / 운영진(운영진만)
function scopeOf_(v) { const t = String(v || '').trim(); return t === '회원' || t === '운영진' ? t : '누구나'; }
function libOut_(r, uid) {
  const sc = scopeOf_(r[4]), m = sc !== '누구나', fid = String(r[5] || '');
  return { id: String(r[0]), t: String(r[1]), d: String(r[2]), ty: String(r[3]) || '기타', m: m, op: sc === '운영진', hasFile: !!fid, fname: String(r[6] || ''), mime: String(r[7] || ''),
    link: String(r[8] || ''), by: String(r[10]), at: tstr_(r[11]), n: Number(r[13]) || 0, mine: !!uid && String(r[9]) === uid,
    url: !m && fid ? 'https://drive.google.com/file/d/' + fid + '/view' : '' };
}
// 누구나 보는 목록: '회원만' 자료는 아예 넣지 않아요
function libPublic_() {
  const cache = CacheService.getScriptCache(), hit = cache.get('lib');
  if (hit) return JSON.parse(hit);
  const items = values_(SH_LIB).slice(1).filter(function (r) { return r[0] !== '' && !isO_(r[12]) && scopeOf_(r[4]) === '누구나'; })
    .map(function (r) { const o = libOut_(r, ''); delete o.mine; return o; }).reverse();
  const out = { items: items, kinds: LIB_KINDS_, updated: now_() };
  try { cache.put('lib', JSON.stringify(out), 120); } catch (e) {}
  return out;
}
function room_(token, opToken) {
  const u = member_(token);
  const accs = {};
  values_(SH_ACC).slice(1).forEach(function (r) { accs[String(r[0])] = { n: String(r[2]), sc: String(r[3]), m: memberSt_(r[9]) === 'O' }; });
  const seeOp = isOp_(token);
  const items = values_(SH_LIB).slice(1).filter(function (r) { return r[0] !== '' && !isO_(r[12]) && (seeOp || scopeOf_(r[4]) !== '운영진'); }).map(function (r) { return libOut_(r, u.id); }).reverse();
  const cm = values_(SH_CMT).slice(1).filter(function (r) { return r[0] !== ''; });
  const notices = values_(SH_NOTE).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    return { id: String(r[0]), t: String(r[1]), body: String(r[2]), by: String(r[3]), at: tstr_(r[4]), pin: isO_(r[5]),
      cm: cm.filter(function (c) { return String(c[1]) === String(r[0]); }).map(function (c) { return { id: String(c[0]), by: String(c[3]), x: String(c[4]), at: tstr_(c[5]), mine: String(c[2]) === u.id }; }) };
  }).reverse();
  const events = values_(SH_EVT).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) {
    const att = String(r[6] || '').split(',').filter(String);
    return { id: String(r[0]), d: dstr_(r[1]), tm: hm_(r[2]), t: String(r[3]), p: String(r[4]), big: isO_(r[5]), att: att.map(function (x) { return accs[x] ? accs[x].n : x === ownerEmail_() ? '동요샘 관리 계정' : '운영진'; }), me: att.indexOf(u.id) !== -1 };
  }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.tm < b.tm ? -1 : 1; });
  const book = bookTitle_();
  const ms = values_(SH_MS).slice(1).filter(function (r) { return r[0] !== '' && String(r[1]) === book; }).map(function (r) {
    return { id: String(r[0]), t: String(r[2]), by: String(r[3]), name: String(r[5]), pages: Number(r[7]) || 0, ok: isO_(r[8]), at: tstr_(r[9]), mine: String(r[4]) === u.id };
  });
  const members = Object.keys(accs).filter(function (k) { return accs[k].m; }).map(function (k) { return { n: accs[k].n, sc: accs[k].sc }; });
  u.hid = hash_('c|' + u.id).slice(0, 12);
  const reviews = values_(SH_REV).slice(1).filter(function (r) { return r[0] !== ''; }).map(function (r) { return reviewOut_(r, u.id); }).sort(function (a, b) { return a.d < b.d ? 1 : -1; });
  return { me: u, op: isOp_(opToken), reviews: reviews, kinds: LIB_KINDS_, items: items, notices: notices, events: events, book: book, ms: ms, members: members, meet: meetState_(), chat: chatTail_(0), today: today_() };
}
function roomUpload_(token, it, name, mime, data) {
  const u = member_(token); it = it || {};
  const t = clean_(it.t, 60); if (!t) throw new Error('자료 이름을 적어 주세요.');
  const scope = scopeOf_(it.scope), mem = scope !== '누구나', ty = LIB_KINDS_.indexOf(it.ty) !== -1 ? it.ty : '기타';
  if (scope === '운영진' && !isOp_(token)) throw new Error('운영진만 보는 자료는 운영진만 올릴 수 있어요.');
  const link = links_(it.link);
  let fid = '', fname = '', fm = '';
  if (data) { const f = roomSave_(scope === '운영진' ? 'OPS' : mem ? 'MEM' : 'PUB', name, mime, data); fid = f.getId(); fname = f.getName(); fm = String(mime || ''); }
  else if (!link) throw new Error('파일을 고르거나 링크를 적어 주세요.');
  withLock_(function () { sheet_(SH_LIB).appendRow([rid_(), t, longText_(it.d, 500), ty, scope, fid, fname, fm, link, u.id, u.name, now_(), '', 0]); });
  CacheService.getScriptCache().remove('lib');
  return { ok: true };
}
function roomEdit_(token, id, e, opToken) {
  const u = member_(token), x = findRow_(SH_LIB, id);
  if (!x || isO_(x.r[12])) throw new Error('자료를 찾지 못했어요.');
  if (String(x.r[9]) !== u.id && !isOp_(opToken)) throw new Error('올린 선생님이나 운영진만 바꿀 수 있어요.');
  e = e || {};
  const sh = sheet_(SH_LIB), fid = String(x.r[5] || '');
  if (e.hide) {
    sh.getRange(x.row, 13).setValue('O'); trash_(fid);
    if (String(x.r[9]) !== u.id) log_(opWho_(opToken), '회원방 자료 지움', String(x.r[1]));
  } else {
    const t = clean_(e.t, 60); if (!t) throw new Error('자료 이름을 적어 주세요.');
    const link = links_(e.link);
    if (!fid && !link) throw new Error('파일이나 링크가 하나는 있어야 해요.');
    const scope = scopeOf_(e.scope), was = scopeOf_(x.r[4]), mem = scope !== '누구나';
    if ((scope === '운영진' || was === '운영진') && scope !== was && !isOp_(opToken || token)) throw new Error('운영진만 보는 자료로 바꾸거나 풀 수 있는 건 운영진뿐이에요.');
    if (fid && scope !== was) {
      try {
        const f = DriveApp.getFileById(fid);
        if (scope === '운영진') { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); f.moveTo(subFolder_('F_OPS', '회원방 - 운영진만 자료')); }
        else if (mem) { f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE); f.moveTo(subFolder_('F_MEM', '회원방 - 회원만 자료')); }
        else { f.moveTo(subFolder_('F_PUB', '회원방 - 누구나 자료')); f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
      } catch (er) { throw new Error('파일 공개 범위를 바꾸지 못했어요. 편집기에서 allowDrive 를 한 번 실행해 주세요.'); }
    }
    sh.getRange(x.row, 2, 1, 4).setValues([[t, longText_(e.d, 500), LIB_KINDS_.indexOf(e.ty) !== -1 ? e.ty : '기타', scope]]);
    sh.getRange(x.row, 9).setValue(link);
  }
  CacheService.getScriptCache().remove('lib');
  return { ok: true };
}
// 파일 받기: '회원만' 자료는 회원 로그인 확인 뒤에만 파일을 보내요
function roomFile_(token, id) {
  const x = findRow_(SH_LIB, id);
  if (!x || isO_(x.r[12]) || !x.r[5]) throw new Error('자료를 찾지 못했어요.');
  const sc = scopeOf_(x.r[4]);
  if (sc === '운영진') opNeed_(token); else if (sc === '회원') member_(token);
  const out = fileOut_(x.r[5]);
  try { sheet_(SH_LIB).getRange(x.row, 14).setValue((Number(x.r[13]) || 0) + 1); } catch (e) {}
  return out;
}

/* 일정 · 공지 · 댓글 */
function opEvent_(opToken, ev) {
  opNeed_(opToken); ev = ev || {};
  const d = String(ev.d || ''), tm = String(ev.tm || '').trim(), t = clean_(ev.t, 50);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !t) throw new Error('날짜와 제목을 적어 주세요.');
  if (tm && !/^\d{1,2}:\d{2}$/.test(tm)) throw new Error('시간은 14:30 처럼 적어 주세요.');
  const sh = sheet_(SH_EVT);
  sh.getRange('B:C').setNumberFormat('@');
  sh.appendRow([rid_(), d, tm, t, clean_(ev.p, 60), ev.big ? 'O' : '', '']);
  log_(opWho_(opToken), '회원방 일정 올림', d + ' ' + t);
  return { ok: true };
}
function opEventDel_(opToken, id) {
  opNeed_(opToken); const x = findRow_(SH_EVT, id);
  if (x) { sheet_(SH_EVT).deleteRow(x.row); log_(opWho_(opToken), '회원방 일정 지움', String(x.r[3])); }
  return { ok: true };
}
function roomAttend_(token, id) {
  const u = member_(token);
  return withLock_(function () {
    const x = findRow_(SH_EVT, id); if (!x) throw new Error('일정을 찾지 못했어요.');
    const att = String(x.r[6] || '').split(',').filter(String), i = att.indexOf(u.id);
    if (i === -1) att.push(u.id); else att.splice(i, 1);
    sheet_(SH_EVT).getRange(x.row, 7).setValue(att.join(','));
    return { ok: true, on: i === -1 };
  });
}
function opNotice_(opToken, t, body, pin) {
  opNeed_(opToken);
  t = clean_(t, 60); body = longText_(body, 3000);
  if (!t || !body) throw new Error('제목과 내용을 적어 주세요.');
  sheet_(SH_NOTE).appendRow([rid_(), t, body, opWho_(opToken), now_(), pin ? 'O' : '']);
  log_(opWho_(opToken), '회원방 공지 올림', t);
  return { ok: true };
}
function opNoticeDel_(opToken, id) {
  opNeed_(opToken); const x = findRow_(SH_NOTE, id);
  if (x) { sheet_(SH_NOTE).deleteRow(x.row); log_(opWho_(opToken), '회원방 공지 지움', String(x.r[1])); }
  return { ok: true };
}
function opNoticePin_(opToken, id) {
  opNeed_(opToken); const x = findRow_(SH_NOTE, id);
  if (x) sheet_(SH_NOTE).getRange(x.row, 6).setValue(isO_(x.r[5]) ? '' : 'O');
  return { ok: true };
}
function roomComment_(token, nid, text) {
  const u = member_(token), x = longText_(text, 500);
  if (!x) throw new Error('댓글을 적어 주세요.');
  if (!findRow_(SH_NOTE, nid)) throw new Error('공지를 찾지 못했어요.');
  sheet_(SH_CMT).appendRow([rid_(), String(nid), u.id, u.name, x, now_()]);
  return { ok: true };
}
function roomCommentDel_(token, id, opToken) {
  const u = member_(token), x = findRow_(SH_CMT, id);
  if (!x) return { ok: true };
  if (String(x.r[2]) !== u.id && !isOp_(opToken)) throw new Error('내 댓글만 지울 수 있어요.');
  sheet_(SH_CMT).deleteRow(x.row);
  return { ok: true };
}

/* 대화방: 화면이 몇 초마다 새 말만 받아 가요 */
function chatRow_(r) { const del = isO_(r[5]); return { no: Number(r[0]), at: tstr_(r[1]), id: hash_('c|' + String(r[2])).slice(0, 12), n: String(r[3]), x: del ? '' : String(r[4]), del: del }; }
function chatTail_(since) {
  const v = values_(SH_CHAT).slice(1).filter(function (r) { return Number(r[0]) > 0; });
  const list = since ? v.filter(function (r) { return Number(r[0]) > since; }) : v.slice(-80);
  return list.slice(-100).map(chatRow_);
}
function chatLast_() {
  const c = CacheService.getScriptCache(), hit = c.get('CHAT_LAST');
  if (hit) return Number(hit);
  const sh = sheet_(SH_CHAT), n = sh.getLastRow(), last = n > 1 ? Number(sh.getRange(n, 1, 1, 1).getValues()[0][0]) || 0 : 0;
  c.put('CHAT_LAST', String(last), 21600);
  return last;
}
function chatGet_(token, since) {
  member_(token);
  since = Number(since) || 0;
  if (since && chatLast_() <= since) return { list: [], meet: meetState_() };
  return { list: chatTail_(since), meet: meetState_() };
}
function chatSend_(token, text, since) {
  const u = member_(token), x = longText_(text, 500);
  if (!x) throw new Error('보낼 말을 적어 주세요.');
  withLock_(function () {
    const last = (function () { const sh = sheet_(SH_CHAT), n = sh.getLastRow(); return n > 1 ? Number(sh.getRange(n, 1, 1, 1).getValues()[0][0]) || 0 : 0; })();
    sheet_(SH_CHAT).appendRow([last + 1, now_(), u.id, u.name, x, '']);
    CacheService.getScriptCache().put('CHAT_LAST', String(last + 1), 21600);
  });
  return { list: chatTail_(Number(since) || 0) };
}
function chatDel_(token, no, opToken) {
  const u = member_(token), v = values_(SH_CHAT);
  for (let i = 1; i < v.length; i++) if (Number(v[i][0]) === Number(no)) {
    if (String(v[i][2]) !== u.id && !isOp_(opToken)) throw new Error('내가 쓴 말만 지울 수 있어요.');
    sheet_(SH_CHAT).getRange(i + 1, 6).setValue('O');
    return { ok: true };
  }
  return { ok: true };
}

/* 화상 회의실: 운영진이 구글 미트 같은 회의 주소를 걸어 두면 회원이 들어가요 */
function meetState_() {
  const c = CacheService.getScriptCache(), map = parse_(c.get('MEET_IN'), {}), lim = Date.now() - 2 * 3600000;
  const inRoom = Object.keys(map).filter(function (k) { return map[k].t > lim; }).map(function (k) { return map[k].n; });
  return { url: String(settings_()['화상 회의 주소'] || ''), in: inRoom };
}
function meetIn_(token, on) {
  const u = member_(token), c = CacheService.getScriptCache();
  withLock_(function () {
    const map = parse_(c.get('MEET_IN'), {});
    if (on) map[u.id] = { n: u.name, t: Date.now() }; else delete map[u.id];
    c.put('MEET_IN', JSON.stringify(map), 21600);
  });
  return meetState_();
}
function opMeet_(opToken, url) {
  opNeed_(opToken);
  const t = cleanUrl_(url);
  if (String(url || '').trim() && !t) throw new Error('회의 주소는 https:// 로 시작하게 적어 주세요.');
  putSetting_('화상 회의 주소', t, '회원방 화상 회의실 주소 (구글 미트·줌 등)');
  log_(opWho_(opToken), '회원방 화상 회의 주소 바꿈', t);
  return { ok: true };
}

/* 곡집·음반 원고 모으기: 회원이 곡마다 원고 PDF를 내고, 운영진이 한 권으로 합쳐요 */
function bookTitle_() { const t = String(settings_()['곡집 제목'] || '').trim(); return t || today_().slice(0, 4) + ' 동요샘 창작동요 곡집'; }
function opBookTitle_(opToken, t) {
  opNeed_(opToken);
  t = clean_(t, 50); if (!t) throw new Error('곡집 제목을 적어 주세요.');
  putSetting_('곡집 제목', t, '회원방 곡집 원고를 모으는 곡집 이름 (바꾸면 새 곡집으로 모아요)');
  log_(opWho_(opToken), '곡집 제목 정함', t);
  return { ok: true };
}
function msUpload_(token, t, author, data, pages, replaceId) {
  const u = member_(token);
  t = clean_(t, 60); author = clean_(author, 60);
  if (!t) throw new Error('곡 제목을 적어 주세요.');
  const f = roomSave_('MS', '[원고] ' + t + '.pdf', 'application/pdf', data);
  const n = Math.max(1, Math.min(200, Math.round(Number(pages) || 1)));
  if (replaceId) {
    const x = findRow_(SH_MS, replaceId);
    if (!x || String(x.r[4]) !== u.id) { trash_(f.getId()); throw new Error('내가 낸 원고만 바꿀 수 있어요.'); }
    trash_(x.r[6]);
    sheet_(SH_MS).getRange(x.row, 3, 1, 8).setValues([[t, author, u.id, u.name, f.getId(), n, '', now_()]]);
  } else sheet_(SH_MS).appendRow([rid_(), bookTitle_(), t, author, u.id, u.name, f.getId(), n, '', now_()]);
  notify_('곡집 원고: ' + t + ' (' + u.name + ')', u.name + ' 선생님이 ' + bookTitle_() + ' 원고를 냈어요.\n\n곡: ' + t + ' (' + n + '쪽)');
  return { ok: true };
}
function msDel_(token, id, opToken) {
  const u = member_(token), x = findRow_(SH_MS, id);
  if (!x) return { ok: true };
  if (String(x.r[4]) !== u.id && !isOp_(opToken)) throw new Error('내가 낸 원고만 뺄 수 있어요.');
  trash_(x.r[6]); sheet_(SH_MS).deleteRow(x.row);
  return { ok: true };
}
function msFile_(token, id, opToken) {
  const u = member_(token), x = findRow_(SH_MS, id);
  if (!x) throw new Error('원고를 찾지 못했어요.');
  if (String(x.r[4]) !== u.id && !isOp_(opToken)) throw new Error('원고는 낸 선생님과 운영진만 받을 수 있어요.');
  return fileOut_(x.r[6]);
}
function opMsReview_(opToken, id, ok) {
  opNeed_(opToken); const x = findRow_(SH_MS, id);
  if (x) { sheet_(SH_MS).getRange(x.row, 9).setValue(ok ? 'O' : ''); log_(opWho_(opToken), ok ? '곡집 원고 검토 완료' : '곡집 원고 검토 취소', String(x.r[2])); }
  return { ok: true };
}

/* 파이어베이스 대화방 출입 명단: 서버가 동요샘 회원의 구글 UID만 /members 에 적어 두고, 규칙이 그 명단으로 출입을 막아요.
   스크립트 속성 FIREBASE_SA 에 파이어베이스 서비스 계정 키(JSON 내용 전체)를 넣어 두면 켜져요. 없으면 대화방은 시트로 돌아가요. */
function fbAccess_() {
  const c = CacheService.getScriptCache(), hit = c.get('FB_AT');
  if (hit) return hit;
  const sa = parse_(PropertiesService.getScriptProperties().getProperty('FIREBASE_SA'), null);
  if (!sa || !sa.client_email || !sa.private_key) return '';
  const b64 = function (x) { return Utilities.base64EncodeWebSafe(x, Utilities.Charset.UTF_8).replace(/=+$/, ''); };
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
    aud: 'https://oauth2.googleapis.com/token', iat: iat, exp: iat + 3600 }));
  const sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + body, sa.private_key, Utilities.Charset.UTF_8)).replace(/=+$/, '');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + sig } });
  const at = parse_(res.getContentText(), {}).access_token || '';
  if (at) c.put('FB_AT', at, 3000);
  return at;
}
function rtdb_(method, path, data) {
  const at = fbAccess_(); if (!at) return null;
  const o = { method: method, muteHttpExceptions: true, contentType: 'application/json', headers: { Authorization: 'Bearer ' + at } };
  if (data !== undefined) o.payload = JSON.stringify(data);
  return UrlFetchApp.fetch(FB_DB_URL + path + '.json', o);
}
function fbJoin_(token, opToken) {
  const u = member_(token);
  const v = verify_(token), op = isOp_(opToken), c = CacheService.getScriptCache(), key = 'FBJ_' + v.uid, want = u.name + '|' + (op ? 1 : 0);
  if (c.get(key) === want) return { uid: v.uid };
  const r = rtdb_('put', '/members/' + v.uid, { n: u.name, op: op });
  if (!r || r.getResponseCode() >= 300) return { uid: '' };
  c.put(key, want, 21600);
  return { uid: v.uid };
}
// 서비스 계정 키를 넣은 뒤 이 함수를 실행해 보면 대화방 연결이 되는지 알려 줘요
function checkFirebase() {
  const sa = parse_(PropertiesService.getScriptProperties().getProperty('FIREBASE_SA'), null);
  if (!sa || !sa.private_key) { Logger.log('스크립트 속성 FIREBASE_SA 가 비어 있거나 JSON 모양이 아니에요.'); return; }
  CacheService.getScriptCache().remove('FB_AT');
  const r = rtdb_('put', '/check', { at: now_() });
  Logger.log(r && r.getResponseCode() < 300 ? '파이어베이스 대화방 연결이 잘 돼요: ' + sa.client_email : '연결하지 못했어요: ' + (r ? r.getContentText() : '키를 확인해 주세요'));
}

/* 활동 후기: 운영진이 쓰고 사진을 한 장씩 올려요. 사진은 비공개 폴더에 두고 회원에게만 서버가 보내 줘요 */
function reviewOut_(r, uid) {
  const ph = String(r[7] || '').split(',').filter(String), lk = String(r[10] || '').split(',').filter(String);
  return { id: String(r[0]), t: String(r[1]), d: dstr_(r[2]), p: String(r[3]), n: String(r[4]), who: String(r[5]), body: String(r[6]),
    photos: ph.length, by: String(r[8]), at: tstr_(r[9]), likes: lk.length, liked: lk.indexOf(uid) !== -1 };
}
function opReview_(token, rv) {
  opNeed_(token); rv = rv || {};
  const t = clean_(rv.t, 60), d = String(rv.d || '');
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('제목과 날짜를 적어 주세요.');
  const row = [t, d, clean_(rv.p, 60), clean_(rv.n, 20), clean_(rv.who, 120), longText_(rv.body, 4000)];
  const sh = sheet_(SH_REV);
  sh.getRange('C:C').setNumberFormat('@');
  if (rv.id) {
    const x = findRow_(SH_REV, rv.id); if (!x) throw new Error('후기를 찾지 못했어요.');
    sh.getRange(x.row, 2, 1, 6).setValues([row]);
    log_(opWho_(token), '활동 후기 고침', t);
    return { id: String(rv.id) };
  }
  const id = rid_();
  sh.appendRow([id].concat(row, ['', opWho_(token), now_(), '']));
  log_(opWho_(token), '활동 후기 올림', t);
  return { id: id };
}
function opReviewPhoto_(token, id, data) {
  opNeed_(token);
  const x = findRow_(SH_REV, id); if (!x) throw new Error('후기를 찾지 못했어요.');
  const bytes = Utilities.base64Decode(String(data || ''));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error('사진을 올리지 못했어요.');
  let f;
  try { f = subFolder_('F_REV', '회원방 - 활동 후기 사진').createFile(Utilities.newBlob(bytes, 'image/jpeg', clean_(x.r[1], 40) + '.jpg')); }
  catch (e) { throw new Error('드라이브에 저장하지 못했어요. 편집기에서 setup 을 한 번 실행해 주세요.'); }
  return withLock_(function () {
    const y = findRow_(SH_REV, id), ph = String(y.r[7] || '').split(',').filter(String);
    ph.push(f.getId()); sheet_(SH_REV).getRange(y.row, 8).setValue(ph.join(','));
    return { photos: ph.length };
  });
}
function opReviewPhotoDel_(token, id, idx) {
  opNeed_(token);
  const x = findRow_(SH_REV, id); if (!x) return { ok: true };
  const ph = String(x.r[7] || '').split(',').filter(String), i = Number(idx);
  if (i >= 0 && i < ph.length) { trash_(ph[i]); ph.splice(i, 1); sheet_(SH_REV).getRange(x.row, 8).setValue(ph.join(',')); }
  return { photos: ph.length };
}
function opReviewDel_(token, id) {
  opNeed_(token);
  const x = findRow_(SH_REV, id); if (!x) return { ok: true };
  String(x.r[7] || '').split(',').filter(String).forEach(trash_);
  sheet_(SH_REV).deleteRow(x.row);
  log_(opWho_(token), '활동 후기 지움', String(x.r[1]));
  return { ok: true };
}
function reviewPhoto_(token, id, idx) {
  member_(token);
  const x = findRow_(SH_REV, id); if (!x) throw new Error('후기를 찾지 못했어요.');
  const ph = String(x.r[7] || '').split(',').filter(String), fid = ph[Number(idx)];
  if (!fid) throw new Error('사진을 찾지 못했어요.');
  const c = CacheService.getScriptCache(), k = 'RP_' + fid, hit = c.get(k);
  if (hit) return { mime: 'image/jpeg', b64: hit };
  const out = fileOut_(fid);
  try { if (out.b64.length < 95000) c.put(k, out.b64, 21600); } catch (e) {}
  return out;
}
function reviewLike_(token, id) {
  const u = member_(token);
  return withLock_(function () {
    const x = findRow_(SH_REV, id); if (!x) throw new Error('후기를 찾지 못했어요.');
    const lk = String(x.r[10] || '').split(',').filter(String), i = lk.indexOf(u.id);
    if (i === -1) lk.push(u.id); else lk.splice(i, 1);
    sheet_(SH_REV).getRange(x.row, 11).setValue(lk.join(','));
    return { likes: lk.length, liked: i === -1 };
  });
}

const FN_ = {
  signup: signup_, me: meApi_,
  addClass: addClass_, editClass: editClass_,
  toggleStamp: toggleStamp_, vote: vote_, joinRelay: joinRelay_, addLyric: addLyric_, toggleLike: toggleLike_,
  opRole: opRole_, opData: opData_, opSaveSong: opSaveSong_, opLyric: opLyric_, opRelay: opRelay_,
  opClass: opClass_, opAccount: opAccount_, opContact: opContact_,
  opDeleteSong: opDeleteSong_, opClearExamples: opClearExamples_, opNotify: opNotify_, opExport: opExport_, opToday: opToday_, opUpload: opUpload_, opBulkSongs: opBulkSongs_,
  opMember: opMember_, roomApply: roomApply_, room: room_, roomUpload: roomUpload_, roomEdit: roomEdit_, roomFile: roomFile_,
  roomAttend: roomAttend_, roomComment: roomComment_, roomCommentDel: roomCommentDel_, chatGet: chatGet_, chatSend: chatSend_, chatDel: chatDel_, meetIn: meetIn_,
  msUpload: msUpload_, msDel: msDel_, msFile: msFile_, fbJoin: fbJoin_,
  opNotice: opNotice_, opNoticeDel: opNoticeDel_, opNoticePin: opNoticePin_, opEvent: opEvent_, opEventDel: opEventDel_, opMeet: opMeet_, opMsReview: opMsReview_, opBookTitle: opBookTitle_,
  opReview: opReview_, opReviewPhoto: opReviewPhoto_, opReviewPhotoDel: opReviewPhotoDel_, opReviewDel: opReviewDel_, reviewPhoto: reviewPhoto_, reviewLike: reviewLike_
};

/************ 곡 목록 예시 (처음 한 번) ************/
function seedSongs_(sh) {
  const ex = [
    [1, '운동장 한 바퀴', '예시 회원 A', '예시 회원 A', '제3회 동요샘 창작동요 발표회', 2026, '1~2학년', '학교생활, 몸놀이', '가을', 'D', '2/4', '레~레',
      '운동장 한 바퀴 뛰어 볼까\n발소리 콩콩 바람도 콩콩\n숨이 차도 괜찮아\n친구 손 잡고 또 한 바퀴', '아이들이 달리기 전에 부르며 몸을 깨우는 곡입니다.', "'콩콩'에서 제자리 뛰기, '한 바퀴'에서 짝과 손잡고 한 바퀴 돌기."],
    [2, '은행잎 편지', '예시 회원 B', '예시 회원 C', '제3회 동요샘 창작동요 발표회', 2026, '3~4학년', '계절, 자연', '가을', 'F', '3/4', '도~레',
      '노란 은행잎에 편지를 써요\n바람아 바람아 전해 주렴\n멀리 사는 할머니께\n가을이 왔다고', '가을 길을 걸으며 떠오른 이야기를 담은 3박자 노래입니다.', "국어 '마음을 전하는 글' 단원과 엮어 은행잎 카드에 편지 쓰기."],
    [3, '우리 반 무지개', '예시 회원 D', '예시 회원 D', '제2회 동요샘 창작동요 발표회', 2025, '전 학년', '친구, 학교생활', '봄', 'G', '4/4', '레~미',
      '빨간 마음 주황 웃음\n노란 목소리 모여서\n우리 반은 무지개\n하나하나 달라서 예뻐', '3월 첫 주 학급 세우기에 많이 쓰인 곡입니다.', '일곱 색 모둠으로 나누어 한 소절씩 이어 부르기.'],
    [4, '할머니 손 칼국수', '예시 회원 E', '예시 회원 A', '제2회 동요샘 창작동요 발표회', 2025, '3~4학년', '가족', '겨울', 'C', '6/8', '도~도',
      '쓱쓱 밀고 톡톡 썰고\n할머니 손은 마술 손\n김이 모락모락\n우리 집이 따뜻해져요', '6/8박자의 흔들리는 느낌이 부엌 소리와 잘 어울리는 곡입니다.', '흉내말에 맞춰 몸짓 만들기.'],
    [5, '빗방울 합창단', '예시 회원 F', '예시 회원 F', '제1회 동요샘 창작동요 발표회', 2024, '1~2학년', '자연, 계절', '여름', 'F', '2/4', '도~라',
      '똑 똑 똑 지붕 위에서\n또 똑 똑 창문 위에서\n빗방울 합창단이\n여름 노래 불러요', '음역이 좁아 누구나 편하게 부를 수 있습니다.', "컵으로 '똑 똑 똑' 리듬 치기."],
    [6, '내일의 나에게', '예시 회원 G', '예시 회원 D', '제1회 동요샘 창작동요 발표회', 2024, '5~6학년', '꿈, 감정', '겨울', 'A♭', '4/4', '시~파',
      '오늘 넘어진 나를 안아 줘\n괜찮다고 말해 줘\n내일의 나에게 보내는\n작은 노래 하나', '졸업을 앞둔 6학년을 생각하며 만든 곡입니다.', '졸업식 합창곡이나 진로 수업 마무리 곡.'],
    [7, '줄넘기 리듬송', '예시 회원 A', '예시 회원 A', '제3회 동요샘 창작동요 발표회', 2026, '3~4학년', '몸놀이, 학교생활', '봄', 'E', '2/4', '미~미',
      '하나 둘 넘고 셋 넷 넘고\n줄이 돌면 나도 돌아\n걸려도 다시 하나부터\n우리 같이 뛰어 보자', '줄넘기 속도에 맞춘 빠르기로 만든 곡입니다.', '긴 줄넘기 들어가기 연습에 맞춰 부르기.'],
    [8, '별에게 물어봐', '예시 회원 H', '예시 회원 F', '제2회 동요샘 창작동요 발표회', 2025, '5~6학년', '자연, 꿈', '여름', 'D', '3/4', '라~레',
      '밤하늘 별에게 물어봐\n너는 얼마나 멀리서 왔니\n반짝이는 대답 대신\n가만히 나를 비춰 줘', '과학 별 단원과 연결해 쓰려고 만든 곡입니다.', '별자리 관찰 뒤 감상곡으로, 2부 합창으로 화음 쌓기.']
  ];
  sh.getRange(2, 1, ex.length, 15).setValues(ex);
  sh.getRange(2, 13, ex.length, 3).setWrap(true);
}
