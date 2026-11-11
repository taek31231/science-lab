// ===== 디벗(학생 태블릿) 업무 =====
// 학생: 허용 앱·사이트 신청, 구글 비밀번호 재설정 신청, 학번으로 처리 결과 조회
// 관리자: 기기 현황(기기대장), 비밀번호 요청 처리(임시 비밀번호는 저장하지 않고 AMA 메시지로 전달), 앱 신청 처리, 신입생 구글 계정 CSV
(function () {
  const S = window.SITE, D = S.dibut;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const p2 = (n) => String(n).padStart(2, "0");
  const day = (ms) => (ms ? new Date(ms).toLocaleDateString("ko-KR") : "");
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
  async function busy(btn, fn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = "처리 중…";
    try { await fn(); } catch (e) { console.error(e); alert("문제가 발생했습니다: " + e.message); }
    finally { btn.disabled = false; btn.textContent = t; }
  }
  const sidOf = (d) => (d.grade && d.cls && d.num ? `${d.grade}${p2(d.cls)}${p2(d.num)}` : "");
  // 기기대장에는 이름·구글 계정을 저장하지 않음 (학번·시리얼만). 저장 직전에 항상 거름
  const scrub = (d) => { const { name, account, ...rest } = d; return rest; };
  // 이력·메모 글에서 알려진 이름 지우기
  const stripNames = (text, names) => {
    let t = String(text || "");
    for (const n of names) if (n && t.includes(n)) t = t.split(n).join("");
    return t.replace(/\s{2,}/g, " ").replace(/\(\s*\)/g, "").trim();
  };
  const keyOf = (s) => String(s || "").toLowerCase().replace(/[\s·.\-_()]/g, "");
  const STATE = { assigned: "배정", spare: "예비", repair: "수리 중", lost: "분실", retired: "반납·폐기" };
  const REQ = { pending: "검토 중", done: "처리 완료", rejected: "불가" };
  const PW_DONE_NOTE = "임시 비밀번호를 디벗(AMA 메시지)으로 보냈습니다. 디벗 알림을 확인하세요. 로그인하면 새 비밀번호로 바꾸라는 안내가 나옵니다.";
  const APP_DONE_NOTE = "허용되었습니다. 디벗을 와이파이에 연결한 채 잠시 기다린 뒤 Play 스토어(또는 사이트)에서 확인하세요.";

  // ---------------- 데이터 ----------------
  function demoStore() {
    const K = "sci-dibut-demo-v1";
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    function seed() {
      const dev = (serial, o) => ({ id: serial, serial, type: "student", batch: "2025", history: [], ...o });
      const devices = [
        dev("R54Y2DEMO01", { state: "assigned", grade: 1, cls: 1, num: 1, mgmtNo: "2025_B100000511_0001" }),
        dev("R54Y2DEMO02", { state: "assigned", grade: 1, cls: 1, num: 2, mgmtNo: "2025_B100000511_0002" }),
        dev("R54Y2DEMO03", { state: "assigned", grade: 1, cls: 2, num: 1, mgmtNo: "2025_B100000511_0003" }),
        dev("R54X9DEMO04", { state: "assigned", batch: "2024", grade: 2, cls: 3, num: 15, mgmtNo: "2024_B100000511_0004" }),
        dev("R54Y2DEMO05", { state: "spare", spareNo: 1, mgmtNo: "2025_B100000511_0005",
          history: [{ at: "2026-04-02", text: "회수: 10307 (전출) → 예비 1" }] }),
        dev("R54Y2DEMO06", { state: "spare", spareNo: 2, mgmtNo: "2025_B100000511_0006" }),
        dev("R54Y2DEMO07", { state: "repair", spareNo: 3, mgmtNo: "2025_B100000511_0007", note: "화면 깨짐 A/S 접수" }),
        { id: "R54X9DEMOT1", serial: "R54X9DEMOT1", type: "teacher", state: "assigned", batch: "2024", tLabel: "2024D-1", mgmtNo: "2024_B100000511_0301", history: [] },
        { id: "R54X9DEMOT2", serial: "R54X9DEMOT2", type: "teacher", state: "spare", batch: "2024", tLabel: "2024D-2", mgmtNo: "2024_B100000511_0302", history: [] }
      ];
      return {
        devices: Object.fromEntries(devices.map((d) => [d.id, d])),
        pw: { pw1: { id: "pw1", sid: "10101", name: "", reason: "비밀번호를 잊어버렸어요", status: "pending", adminNote: "", createdAt: Date.now() - 3600e3 } },
        apps: {
          a1: { id: "a1", sid: "10102", kind: "site", title: "패들렛", url: "https://padlet.com", purpose: "국어 수업 모둠 활동", key: keyOf("패들렛"), status: "pending", adminNote: "", createdAt: Date.now() - 7200e3 },
          a2: { id: "a2", sid: "10201", kind: "site", title: "Padlet", url: "", purpose: "과학 탐구 발표", key: keyOf("Padlet"), status: "pending", adminNote: "", createdAt: Date.now() - 5000e3 }
        },
        status: {
          pw1: { id: "pw1", kind: "pw", lookup: "demo", title: "구글 계정 비밀번호 재설정", status: "pending", note: "", createdAt: Date.now() - 3600e3 },
          a1: { id: "a1", kind: "app", lookup: "demo", title: "패들렛", status: "pending", note: "", createdAt: Date.now() - 7200e3 },
          a2: { id: "a2", kind: "app", lookup: "demo", title: "Padlet", status: "pending", note: "", createdAt: Date.now() - 5000e3 }
        }
      };
    }
    const load = () => { try { return JSON.parse(localStorage.getItem(K)) || seed(); } catch { return seed(); } };
    const save = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
    const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
    return {
      async listDevices() { return Object.values(load().devices); },
      async saveDevice(dev) { const d = load(); d.devices[dev.id] = scrub(dev); save(d); },
      async saveDevices(list) { const d = load(); list.forEach((x) => (d.devices[x.id] = scrub(x))); save(d); },
      async replaceDevices(list) { const d = load(); d.devices = Object.fromEntries(list.map((x) => [x.id, scrub(x)])); save(d); },
      async submitPw(r, lookup) {
        const d = load(); const id = uid();
        d.pw[id] = { ...r, id, status: "pending", adminNote: "", createdAt: Date.now() };
        d.status[id] = { id, kind: "pw", lookup, title: "구글 계정 비밀번호 재설정", status: "pending", note: "", createdAt: Date.now() };
        save(d);
      },
      async listPw() { return Object.values(load().pw).sort(byNew); },
      async submitApp(r, lookup) {
        const d = load(); const id = uid();
        d.apps[id] = { ...r, id, status: "pending", adminNote: "", createdAt: Date.now() };
        d.status[id] = { id, kind: "app", lookup, title: r.title, status: "pending", note: "", createdAt: Date.now() };
        save(d);
      },
      async listApps() { return Object.values(load().apps).sort(byNew); },
      async decide(kind, ids, status, note) {
        const d = load(); const col = kind === "pw" ? d.pw : d.apps;
        for (const id of ids) {
          if (col[id]) Object.assign(col[id], { status, adminNote: note, decidedAt: Date.now() });
          if (d.status[id]) Object.assign(d.status[id], { status, note });
        }
        save(d);
      },
      async remove(kind, ids) {
        const d = load(); const col = kind === "pw" ? d.pw : d.apps;
        for (const id of ids) { delete col[id]; delete d.status[id]; }
        save(d);
      },
      async statusByLookup(lookup) { return Object.values(load().status).filter((s) => s.lookup === lookup).sort(byNew); }
    };
  }

  function firebaseStore() {
    const db = firebase.firestore();
    const FV = firebase.firestore.FieldValue;
    const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);
    const rows = (snap) => snap.docs.map((x) => { const v = { id: x.id, ...x.data() }; v.createdAt = ms(v.createdAt); v.addedAt = ms(v.addedAt); return v; });
    const byNew = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
    async function chunked(items, fn) {
      for (let i = 0; i < items.length; i += 400) {
        const b = db.batch(); items.slice(i, i + 400).forEach((x) => fn(b, x)); await b.commit();
      }
    }
    async function submit(col, data, title, kind, lookup) {
      const ref = db.collection(col).doc();
      const b = db.batch();
      b.set(ref, { ...data, status: "pending", adminNote: "", createdAt: FV.serverTimestamp() });
      b.set(db.collection("dibutStatus").doc(ref.id), { kind, lookup, title, status: "pending", note: "", createdAt: FV.serverTimestamp() });
      await b.commit();
    }
    const clean = (o) => JSON.parse(JSON.stringify(o)); // Firestore는 undefined 값을 받지 않음
    return {
      async listDevices() { return rows(await db.collection("devices").get()); },
      async saveDevice(dev) { const { id, ...v } = scrub(dev); await db.collection("devices").doc(id).set(clean(v)); },
      async saveDevices(list) { await chunked(list, (b, x) => { const { id, ...v } = scrub(x); b.set(db.collection("devices").doc(id), clean(v)); }); },
      async replaceDevices(list) {
        const old = await db.collection("devices").get();
        const keep = new Set(list.map((x) => x.id));
        await chunked(old.docs.filter((x) => !keep.has(x.id)), (b, x) => b.delete(x.ref));
        await chunked(list, (b, x) => { const { id, ...v } = scrub(x); b.set(db.collection("devices").doc(id), clean(v)); });
      },
      submitPw: (r, lookup) => submit("pwRequests", r, "구글 계정 비밀번호 재설정", "pw", lookup),
      async listPw() { return rows(await db.collection("pwRequests").get()).sort(byNew); },
      submitApp: (r, lookup) => submit("appRequests", r, r.title, "app", lookup),
      async listApps() { return rows(await db.collection("appRequests").get()).sort(byNew); },
      async decide(kind, ids, status, note) {
        const col = kind === "pw" ? "pwRequests" : "appRequests";
        await chunked(ids, (b, id) => {
          b.update(db.collection(col).doc(id), { status, adminNote: note, decidedAt: FV.serverTimestamp() });
          b.set(db.collection("dibutStatus").doc(id), { status, note }, { merge: true });
        });
      },
      async remove(kind, ids) {
        const col = kind === "pw" ? "pwRequests" : "appRequests";
        await chunked(ids, (b, id) => { b.delete(db.collection(col).doc(id)); b.delete(db.collection("dibutStatus").doc(id)); });
      },
      async statusByLookup(lookup) { return rows(await db.collection("dibutStatus").where("lookup", "==", lookup).get()).sort(byNew); }
    };
  }

  let DS = null;
  const store = () => (DS ||= window.Store.isDemo ? demoStore() : firebaseStore());

  // ---------------- 작은 대화상자 ----------------
  function dialog(title, body, okText = "확인") {
    return new Promise((done) => {
      const back = document.createElement("div");
      back.className = "sigpad-back";
      back.innerHTML = `<form class="sigpad dlg"><b>${esc(title)}</b><div class="dlg-body">${body}</div>
        <div class="actions" style="justify-content:flex-end;margin-top:12px">
          <button type="button" class="btn ghost sm" data-x>취소</button><button class="btn sm">${esc(okText)}</button></div></form>`;
      document.body.appendChild(back);
      const f = back.querySelector("form");
      const close = (v) => { back.remove(); done(v); };
      back.querySelector("[data-x]").onclick = () => close(null);
      f.onsubmit = (e) => { e.preventDefault(); close(Object.fromEntries(new FormData(f))); };
      const first = f.querySelector("input,select,textarea"); if (first) first.focus();
    });
  }
  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    if (btn) { const o = btn.textContent; btn.textContent = "복사됨 ✓"; setTimeout(() => (btn.textContent = o), 1500); }
  }
  // 헷갈리는 글자(0/O, 1/l) 뺀 임시 비밀번호: 영문 소문자 4 + 숫자 4 + ! (9자)
  function tempPassword() {
    const L = "abcdefghjkmnpqrstuvwxyz", N = "23456789";
    const r = crypto.getRandomValues(new Uint32Array(8));
    return [...r.slice(0, 4)].map((x) => L[x % L.length]).join("") + [...r.slice(4)].map((x) => N[x % N.length]).join("") + "!";
  }

  // 조회 열쇠: 이름 + PIN 4자리를 해시로 바꾼 값만 저장 (PIN 자체는 저장하지 않음)
  const pinOk = (p) => /^\d{4}$/.test(String(p || ""));
  async function lookupKey(name, pin) {
    const text = `yongsan-dibut|${String(name).replace(/\s/g, "")}|${pin}`;
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const pinFields = `
    <div class="row"><label>이름<input name="name" maxlength="20" required autocomplete="off"></label>
      <label>조회용 PIN (숫자 4자리)<input name="pin" type="password" inputmode="numeric" maxlength="4" pattern="\\d{4}" required autocomplete="off" placeholder="직접 정하기"></label></div>`;

  // =====================================================================
  //  학생 화면 (#/dibut)
  // =====================================================================
  async function studentView(view) {
    view.innerHTML = `
      <h1>디벗</h1>
      <p class="lead">디벗(학생 태블릿)에서 쓸 앱·사이트 허용 신청과 학교 구글 계정 비밀번호 재설정 신청을 받습니다. 신청할 때 <b>조회용 PIN 4자리</b>를 직접 정하고, 처리 결과는 <a href="#/status">신청 결과 조회</a>에서 <b>이름 + PIN</b>으로 확인하세요.</p>
      <p class="muted small">PIN은 결과 확인용입니다. 구글 비밀번호나 디벗 잠금 비밀번호와 다른 숫자로 정하세요. 앱은 신청하기 전에 디벗의 Play 스토어에서 이미 보이는지 먼저 확인해 주세요.</p>
      <div class="grid2">
        <form class="card" id="appForm">
          <h2>📱 앱·사이트 허용 신청</h2>
          <div class="row"><label>학번<input name="sid" inputmode="numeric" maxlength="5" placeholder="5자리" required></label>
            <label>종류<select name="kind"><option value="app">앱 (Play 스토어)</option><option value="site">웹사이트 (예: 패들렛)</option></select></label></div>
          ${pinFields}
          <div class="row"><label>앱·사이트 이름<input name="title" maxlength="60" required placeholder="예) 패들렛"></label></div>
          <div class="row"><label>링크 (선택)<input name="url" maxlength="300" placeholder="Play 스토어 주소나 사이트 주소"></label></div>
          <div class="row"><label>사용 목적 (과목·선생님)<input name="purpose" maxlength="200" required placeholder="예) 국어 수업 모둠 활동 (OOO 선생님)"></label></div>
          <label class="inline-check" style="margin:2px 0 10px"><input type="checkbox" name="googleAuth"> 학교 구글 계정으로 로그인할 때 <b>'관리자 승인 필요'</b> 또는 <b>'액세스 차단'</b> 화면이 떠요</label>
          <button class="btn">신청하기</button>
          <p class="muted small" style="margin:8px 0 0">학교 수업·활동 목적이 아니면 허용되지 않을 수 있습니다.</p>
        </form>
        <form class="card" id="pwForm">
          <h2>🔑 구글 계정 비밀번호 재설정</h2>
          <p class="muted small" style="margin-top:0">학교 구글 계정 비밀번호를 잊었을 때 신청하세요. 처리되면 <b>임시 비밀번호가 본인 디벗으로 메시지(알림)로 전송</b>됩니다. 디벗을 켜 두고 학교 와이파이에 연결해 두세요.</p>
          <div class="row"><label>학번<input name="sid" inputmode="numeric" maxlength="5" placeholder="5자리" required></label></div>
          ${pinFields}
          <div class="row"><label>메모 (선택)<input name="reason" maxlength="200" placeholder="예) 비밀번호를 잊어버렸어요"></label></div>
          <button class="btn">신청하기</button>
          <p class="muted small" style="margin:8px 0 0">임시 비밀번호로 로그인하면 새 비밀번호를 정하라는 화면이 나옵니다. 새 비밀번호는 다른 사람에게 알려주지 마세요.</p>
        </form>
      </div>`;
    // 학번·이름·PIN 확인 → { sid, name, lookup }
    const checkForm = async (f) => {
      const p = window.parseSid(f.elements.sid.value.trim());
      if (!p) { alert("학번은 5자리로 입력하세요."); return null; }
      const name = f.elements.name.value.replace(/\s/g, "");
      if (!name) { alert("이름을 입력하세요."); return null; }
      if (!pinOk(f.elements.pin.value)) { alert("조회용 PIN은 숫자 4자리로 정하세요."); return null; }
      return { sid: p.sid, name, lookup: await lookupKey(name, f.elements.pin.value) };
    };
    const done = (f, extra) => {
      f.reset();
      alert(`신청되었습니다.${extra}\n'신청 결과 조회'에서 이름과 방금 정한 PIN 4자리로 확인하세요. PIN을 꼭 기억해 두세요.`);
    };
    $("#appForm").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target, d = Object.fromEntries(new FormData(f));
      const title = d.title.trim(), key = keyOf(title);
      busy(f.querySelector("button"), async () => {
        const c = await checkForm(f); if (!c) return;
        const mine = await store().statusByLookup(c.lookup);
        if (mine.some((s) => s.kind === "app" && s.status === "pending" && keyOf(s.title) === key)) return alert("이미 같은 신청이 검토 중입니다.");
        await store().submitApp({ sid: c.sid, name: c.name, kind: d.kind === "site" ? "site" : "app", title, url: d.url.trim(), purpose: d.purpose.trim(), key, googleAuth: !!f.elements.googleAuth.checked }, c.lookup);
        done(f, "");
      });
    };
    $("#pwForm").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target, d = Object.fromEntries(new FormData(f));
      busy(f.querySelector("button"), async () => {
        const c = await checkForm(f); if (!c) return;
        const mine = await store().statusByLookup(c.lookup);
        if (mine.some((s) => s.kind === "pw" && s.status === "pending")) return alert("이미 비밀번호 재설정 신청이 검토 중입니다. 조금만 기다려 주세요.");
        await store().submitPw({ sid: c.sid, name: c.name, reason: d.reason.trim() }, c.lookup);
        done(f, " 처리되면 디벗으로 메시지가 갑니다.");
      });
    };
  }

  // 신청 결과 조회 화면 아래쪽: 이름 + PIN으로 디벗 신청 확인
  function statusSection(box) {
    box.innerHTML = `
      <h2 style="margin-top:28px">디벗 신청 조회</h2>
      <p class="lead">앱·사이트 허용, 구글 비밀번호 재설정 신청 결과를 이름과 신청할 때 정한 PIN 4자리로 확인합니다.</p>
      <form class="card actions" id="dbForm">
        <input name="name" placeholder="이름" maxlength="20" style="flex:1;min-width:140px" required autocomplete="off">
        <input name="pin" type="password" inputmode="numeric" maxlength="4" placeholder="PIN 4자리" style="width:130px" required autocomplete="off">
        <button class="btn">조회</button>
      </form>
      <div id="dbResult"></div>`;
    const show = async (nameRaw, pin) => {
      const name = String(nameRaw).replace(/\s/g, "");
      if (!name || !pinOk(pin)) return ($("#dbResult").innerHTML = '<div class="card error">이름과 PIN 숫자 4자리를 입력하세요.</div>');
      const list = await store().statusByLookup(await lookupKey(name, pin));
      $("#dbResult").innerHTML = list.length ? `<div class="card"><h2>${esc(name)} 디벗 신청 (${list.length}건)</h2>
        ${list.map((s) => `<div class="notice"><div style="flex:1">
          <b>${s.kind === "pw" ? "🔑" : "📱"} ${esc(s.title)}</b> <span class="badge ${s.status === "done" ? "approved" : s.status === "rejected" ? "rejected" : "pending"}">${REQ[s.status] || s.status}</span><br>
          <span class="muted">신청일 ${day(s.createdAt)}</span>
          ${s.kind === "pw" && s.status === "done" ? `<div class="dibut-msg">📩 <b>디벗 메시지를 확인하세요.</b> 임시 비밀번호가 본인 디벗 알림으로 전송되었습니다.</div>` : ""}
          ${s.note && !(s.kind === "pw" && s.status === "done") ? `<div><b>실무사 메모:</b> ${esc(s.note)}</div>` : ""}
        </div></div>`).join("")}</div>`
        : `<div class="card error">일치하는 신청이 없습니다. 이름과 PIN을 다시 확인하세요. (PIN을 잊었다면 과학정보부로 문의)</div>`;
    };
    $("#dbForm").onsubmit = (e) => { e.preventDefault(); const fd = new FormData(e.target); show(fd.get("name"), fd.get("pin")); };
  }

  // =====================================================================
  //  관리자 화면 (관리자 → 디벗 관리)
  // =====================================================================
  let sub = "devices";
  async function admin(body) {
    const subs = { devices: "기기 현황", pw: "비밀번호 요청", apps: "앱·사이트 신청", fresh: "신입생 계정 CSV", promote: "진급 CSV" };
    body.innerHTML = `<div class="tabs subtabs">${Object.entries(subs).map(([k, v]) => `<button data-s="${k}" class="${k === sub ? "on" : ""}">${v}<span data-cnt="${k}"></span></button>`).join("")}</div><div id="dbBody"></div>`;
    body.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { sub = b.dataset.s; admin(body); }));
    // 대기 건수 표시
    Promise.all([store().listPw(), store().listApps()]).then(([pw, ap]) => {
      const n1 = pw.filter((r) => r.status === "pending").length, n2 = ap.filter((r) => r.status === "pending").length;
      if (n1) body.querySelector('[data-cnt="pw"]').innerHTML = ` <b class="cnt">${n1}</b>`;
      if (n2) body.querySelector('[data-cnt="apps"]').innerHTML = ` <b class="cnt">${n2}</b>`;
    }).catch(() => {});
    const el = $("#dbBody", body);
    await ({ devices: adminDevices, pw: adminPw, apps: adminApps, fresh: adminFresh, promote: adminPromote })[sub](el);
  }

  // ---------------- 기기 현황 ----------------
  const devLabel = (d) => (d.type === "teacher" ? (d.tLabel || "교사용") : d.state === "assigned" ? sidOf(d) : d.spareNo ? `${d.batch ? d.batch.slice(2) + "-" : ""}예비 ${d.spareNo}` : "예비");
  const logEntry = (text) => ({ at: stamp(), text });
  let devFilter = { type: "student", state: "", grade: "", q: "" };

  async function adminDevices(el) {
    let list = await store().listDevices();
    const stu = list.filter((d) => d.type !== "teacher"), tch = list.filter((d) => d.type === "teacher");
    const cnt = (arr, st) => arr.filter((d) => d.state === st).length;
    const byGrade = [1, 2, 3].map((g) => stu.filter((d) => d.state === "assigned" && +d.grade === g).length);
    el.innerHTML = `
      <div class="stats">
        <div class="stat"><span>학생용 배정</span><b>${cnt(stu, "assigned")}</b><small>1학년 ${byGrade[0]} · 2학년 ${byGrade[1]} · 3학년 ${byGrade[2]}</small></div>
        <div class="stat ok"><span>예비기기 (바로 배정 가능)</span><b>${cnt(stu, "spare")}</b><small>학생용 예비</small></div>
        <div class="stat warn"><span>수리 중 · 분실</span><b>${cnt(stu, "repair") + cnt(stu, "lost")}</b><small>수리 ${cnt(stu, "repair")} · 분실 ${cnt(stu, "lost")}</small></div>
        <div class="stat"><span>학생용 합계</span><b>${stu.filter((d) => d.state !== "retired").length}</b><small>반납·폐기 ${cnt(stu, "retired")} 제외</small></div>
        <div class="stat"><span>교사용</span><b>${tch.length}</b><small>사용 ${cnt(tch, "assigned")} · 미배정 ${cnt(tch, "spare")}</small></div>
      </div>
      <div class="card">
        <div class="actions" style="justify-content:space-between">
          <div class="actions">
            <select id="fType"><option value="student">학생용</option><option value="teacher">교사용</option><option value="">전체</option></select>
            <select id="fState"><option value="">상태 전체</option>${Object.entries(STATE).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
            <select id="fGrade"><option value="">학년 전체</option><option value="1">1학년</option><option value="2">2학년</option><option value="3">3학년</option></select>
            <input id="fQ" placeholder="학번·시리얼·관리번호 검색" style="width:220px">
          </div>
          <div class="actions">
            <button class="btn sm" id="addTransfer">＋ 전입생 배정</button>
            <button class="btn ghost sm" id="exportLedger">기기대장 엑셀로 내려받기</button>
            <label class="btn ghost sm">기기대장 엑셀 가져오기<input type="file" accept=".xlsx" hidden id="importLedger"></label>
          </div>
        </div>
        <p class="muted small">회수(전출·자퇴·졸업)하면 그 기기는 자동으로 예비기기가 되고, 예비기기를 전입생에게 배정할 수 있습니다. 바뀐 내용은 기기마다 이력으로 남습니다.
          개인정보 보호를 위해 <b>학번·시리얼만 저장</b>하고 이름·구글 계정은 저장하지 않습니다(이름은 학교 엑셀 기기대장에서 확인). 진급은 '진급 CSV' 탭의 [디벗 기기대장에도 반영]으로 바꿉니다.</p>
        ${list.some((d) => d.name || d.account) ? `<p class="warn">⚠ 예전에 저장된 이름·계정이 ${list.filter((d) => d.name || d.account).length}대에 남아 있습니다. <button class="btn sm" id="scrubOld">지금 지우기</button></p>` : ""}
        <div id="devTable"></div>
      </div>`;
    const f = devFilter;
    $("#fType").value = f.type; $("#fState").value = f.state; $("#fGrade").value = f.grade; $("#fQ").value = f.q;
    const draw = () => {
      const q = keyOf(f.q);
      const rows = list.filter((d) => (!f.type || (d.type || "student") === f.type) && (!f.state || d.state === f.state)
          && (!f.grade || String(d.grade) === f.grade)
          && (!q || keyOf([sidOf(d), d.serial, d.mgmtNo, d.tLabel, d.spareNo ? "예비" + d.spareNo : ""].join(" ")).includes(q)))
        .sort((a, b) => (a.state === "assigned" ? 0 : 1) - (b.state === "assigned" ? 0 : 1)
          || sidOf(a).localeCompare(sidOf(b)) || (a.spareNo || 999) - (b.spareNo || 999) || String(a.tLabel || a.serial).localeCompare(String(b.tLabel || b.serial), "ko", { numeric: true }));
      $("#devTable").innerHTML = `<p class="muted small">${rows.length}대</p><div class="table-wrap" style="max-height:560px;overflow:auto"><table class="mini dev">
        <tr><th>상태</th><th>학번·구분</th><th>시리얼</th><th>관리번호</th><th>보급</th><th></th></tr>
        ${rows.map((d) => `<tr>
          <td><span class="badge dev-${d.state}">${STATE[d.state] || d.state}</span></td>
          <td><b>${esc(devLabel(d))}</b></td><td class="mono">${esc(d.serial || "(없음)")}</td>
          <td class="mono small">${esc(d.mgmtNo || "")}</td><td>${esc(d.batch || "")}</td>
          <td class="actions nowrap">
            ${d.state === "assigned" ? `<button class="btn ghost sm" data-ret="${esc(d.id)}">회수</button>` : ""}
            ${d.state === "spare" ? `<button class="btn ok sm" data-asg="${esc(d.id)}">배정</button>` : ""}
            <button class="btn ghost sm" data-edit="${esc(d.id)}">상태·수정</button>
            ${(d.history || []).length ? `<button class="btn ghost sm" data-his="${esc(d.id)}">이력 ${d.history.length}</button>` : ""}
          </td></tr>
          <tr class="detail" id="his-${esc(d.id)}" hidden><td colspan="6">${(d.history || []).slice().reverse().map((h) => `<div class="small">${esc(h.at)} · ${esc(h.text)}</div>`).join("")}${d.note ? `<div class="small"><b>메모:</b> ${esc(d.note)}</div>` : ""}</td></tr>`).join("")
          || '<tr><td colspan="6" class="muted">해당하는 기기가 없습니다. 처음이라면 기존 기기대장 엑셀을 가져오세요.</td></tr>'}
      </table></div>`;
      bindRows();
    };
    const byId = () => Object.fromEntries(list.map((d) => [d.id, d]));
    // 예비 번호는 보급 연도(기기대장 시트)별로 따로 매김
    const nextSpare = (batch) => Math.max(0, ...list.filter((d) => d.type !== "teacher" && d.spareNo && d.batch === batch).map((d) => +d.spareNo)) + 1;
    const commit = async (dev) => { await store().saveDevice(dev); list = list.map((d) => (d.id === dev.id ? dev : d)); adminDevices(el); };

    const assignDialog = async (dev) => {
      const v = await dialog(`${devLabel(dev)} (${dev.serial || "시리얼 없음"}) 배정`, `
        <div class="row"><label>학번<input name="sid" inputmode="numeric" maxlength="5" required></label>
          <label>사유<select name="why"><option>전입</option><option>기기 교체</option><option>신규 배정</option><option>기타</option></select></label></div>
        <p class="small muted" style="margin:4px 0 0">이름·구글 계정은 저장하지 않습니다. 학교 엑셀 기기대장에 적어 두세요.</p>`, "배정");
      if (!v) return;
      const p = window.parseSid(v.sid.trim()); if (!p) return alert("학번 5자리를 확인하세요.");
      const dup = list.find((d) => d.id !== dev.id && d.state === "assigned" && sidOf(d) === p.sid);
      if (dup && !confirm(`${p.sid} 학번에 이미 배정된 기기(${dup.serial})가 있습니다. 그래도 배정할까요?`)) return;
      await commit({ ...dev, state: "assigned", grade: p.grade, cls: p.cls, num: p.num, spareNo: null,
        history: [...(dev.history || []), logEntry(`배정: ${devLabel(dev)} → ${p.sid} (${v.why})`)] });
    };
    const bindRows = () => {
      const m = byId();
      el.querySelectorAll("[data-his]").forEach((b) => (b.onclick = () => { const r = $(`#his-${CSS.escape(b.dataset.his)}`, el); r.hidden = !r.hidden; }));
      el.querySelectorAll("[data-asg]").forEach((b) => (b.onclick = () => assignDialog(m[b.dataset.asg])));
      el.querySelectorAll("[data-ret]").forEach((b) => (b.onclick = async () => {
        const dev = m[b.dataset.ret];
        const no = dev.type === "teacher" ? null : nextSpare(dev.batch);
        const v = await dialog(`${sidOf(dev) || dev.tLabel} 기기 회수`, `
          <p class="small muted" style="margin:0 0 8px">시리얼 ${esc(dev.serial)} · 회수하면 ${no ? `<b>예비 ${no}번</b>` : "미배정"}으로 바뀝니다. 다음 사람에게 주기 전에 공장 초기화가 필요합니다(구글 계정 로그아웃).</p>
          <div class="row"><label>사유<select name="why"><option>전출</option><option>자퇴</option><option>졸업</option><option>기기 교체</option><option>기타</option></select></label>
            <label>예비 번호<input name="no" type="number" min="1" value="${no || ""}" ${no ? "" : "disabled"}></label></div>
          <div class="row"><label>메모 (선택, 이름은 적지 마세요)<input name="note" placeholder="예) 펜 분실, 액정 정상"></label></div>`, "회수");
        if (!v) return;
        const spareNo = dev.type === "teacher" ? null : +v.no || no;
        await commit({ ...dev, state: "spare", spareNo, grade: null, cls: null, num: null, note: v.note.trim() || dev.note || "",
          history: [...(dev.history || []), logEntry(`회수: ${sidOf(dev) || dev.tLabel} (${v.why}) → ${spareNo ? `예비 ${spareNo}` : "미배정"}${v.note.trim() ? ` · ${v.note.trim()}` : ""}`)] });
      }));
      el.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = async () => {
        const dev = m[b.dataset.edit];
        const v = await dialog(`기기 수정 · ${dev.serial || "시리얼 없음"}`, `
          <div class="row"><label>상태<select name="state">${Object.entries(STATE).map(([k, s]) => `<option value="${k}" ${k === dev.state ? "selected" : ""}>${s}</option>`).join("")}</select></label>
            <label>예비 번호<input name="spareNo" type="number" min="1" value="${esc(dev.spareNo || "")}"></label></div>
          <div class="row"><label>시리얼<input name="serial" value="${esc(dev.serial || "")}"></label><label>관리번호<input name="mgmtNo" value="${esc(dev.mgmtNo || "")}"></label></div>
          <div class="row"><label>학번 (배정 시)<input name="sid" maxlength="5" value="${esc(sidOf(dev))}"></label>${dev.type === "teacher" ? `<label>교사용 번호<input name="tLabel" value="${esc(dev.tLabel || "")}"></label>` : ""}</div>
          <div class="row"><label>메모 (이름은 적지 마세요)<input name="note" value="${esc(dev.note || "")}" placeholder="예) 액정 A/S 접수 11/8"></label></div>`, "저장");
        if (!v) return;
        const p = window.parseSid((v.sid || "").trim());
        if (v.state === "assigned" && dev.type !== "teacher" && !p) return alert("배정 상태는 학번 5자리가 필요합니다.");
        const nd = { ...dev, state: v.state, spareNo: v.spareNo ? +v.spareNo : null, serial: v.serial.trim(), mgmtNo: v.mgmtNo.trim(),
          note: v.note.trim(), ...(v.tLabel !== undefined ? { tLabel: v.tLabel.trim() } : {}),
          ...(p ? { grade: p.grade, cls: p.cls, num: p.num } : { grade: null, cls: null, num: null }) };
        const changed = [];
        if (nd.state !== dev.state) changed.push(`상태 ${STATE[dev.state]}→${STATE[nd.state]}`);
        if (sidOf(nd) !== sidOf(dev)) changed.push(`학번 ${sidOf(dev) || "-"}→${sidOf(nd) || "-"}`);
        if (nd.note !== (dev.note || "")) changed.push(`메모: ${nd.note || "(지움)"}`);
        nd.history = [...(dev.history || []), ...(changed.length ? [logEntry("수정: " + changed.join(", "))] : [])];
        await commit(nd);
      }));
    };
    draw();
    $("#fType").onchange = (e) => { f.type = e.target.value; draw(); };
    $("#fState").onchange = (e) => { f.state = e.target.value; draw(); };
    $("#fGrade").onchange = (e) => { f.grade = e.target.value; draw(); };
    $("#fQ").oninput = (e) => { f.q = e.target.value; draw(); };
    $("#addTransfer").onclick = async () => {
      const spares = list.filter((d) => d.type !== "teacher" && d.state === "spare").sort((a, b) => (a.spareNo || 999) - (b.spareNo || 999));
      if (!spares.length) return alert("배정할 수 있는 학생용 예비기기가 없습니다.");
      const v = await dialog("전입생에게 예비기기 배정", `<label>예비기기 선택<select name="id">${spares.map((d) => `<option value="${esc(d.id)}">${esc(devLabel(d))} · ${esc(d.serial || "시리얼 없음")}${d.note ? ` · ${esc(d.note)}` : ""}</option>`).join("")}</select></label>`, "다음");
      if (v) assignDialog(byId()[v.id]);
    };
    $("#exportLedger").onclick = (e) => busy(e.target, () => exportLedger(list));
    const so = $("#scrubOld");
    if (so) so.onclick = () => busy(so, async () => {
      const names = [...new Set(list.flatMap((d) => (d.name ? [d.name, d.name.replace(/\s/g, "")] : [])))].sort((a, b) => b.length - a.length);
      if (!confirm(`저장된 기기 ${list.length}대에서 이름·구글 계정을 지우고, 이력 글에 남은 이름(${names.length}개)도 지웁니다. 되돌릴 수 없습니다. 진행할까요?`)) return;
      await store().saveDevices(list.map((d) => ({ ...d, history: (d.history || []).map((h) => ({ ...h, text: stripNames(h.text, names) })).filter((h) => h.text) })));
      alert("지웠습니다. 다른 이름이 이력에 남아 있을 수 있으니, 가장 확실한 방법은 기기대장 엑셀을 한 번 더 가져오는 것입니다.");
      adminDevices(el);
    });
    $("#importLedger").onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = "";
      if (!file) return;
      try {
        const parsed = await importLedger(file);
        const st = parsed.devices.filter((d) => d.type === "student"), te = parsed.devices.filter((d) => d.type === "teacher");
        const msg = `'${file.name}'에서 읽은 내용:\n\n학생용 ${st.length}대 (배정 ${st.filter((d) => d.state === "assigned").length} · 예비 ${st.filter((d) => d.state === "spare").length})\n교사용 ${te.length}대 (사용 ${te.filter((d) => d.state === "assigned").length})\n` +
          (parsed.notes.length ? `\n참고:\n- ${parsed.notes.slice(0, 15).join("\n- ")}${parsed.notes.length > 15 ? `\n…외 ${parsed.notes.length - 15}건` : ""}\n` : "") +
          `\n지금 사이트에 있는 기기 목록(${list.length}대)을 이 내용으로 바꿀까요?`;
        if (!confirm(msg)) return;
        await store().replaceDevices(parsed.devices);
        alert("가져왔습니다.");
        adminDevices(el);
      } catch (err) { console.error(err); alert("읽지 못했습니다: " + err.message); }
    };
  }

  // 구글 진급 CSV(Email Address, Last Name=새 학번)로 기기대장 학번 바꾸기 계획 세우기
  function parseCsv(text) {
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  // 진급 정보(이전 학번 → 새 학번)로 기기대장 학번 바꾸기. 구글 계정이 대장에 없어도 학번으로 찾음
  function promoteBySid(pairs, list) {
    const bySid = {};
    list.filter((d) => d.type !== "teacher" && d.state === "assigned").forEach((d) => (bySid[sidOf(d)] = d));
    const changes = [], missing = [], nameWarn = [];
    pairs.forEach((p) => {
      const dev = bySid[p.from], s = window.parseSid(p.to);
      if (!s) return;
      if (!dev) { missing.push(`${p.from} ${p.name || ""}`.trim()); return; }
      if (p.name && dev.name && baseName(dev.name) !== baseName(p.name)) { nameWarn.push(`${p.from} 대장 ${dev.name} ↔ 진급정보 ${p.name}`); return; }
      if (p.from === s.sid) return;
      changes.push({ dev, from: p.from, to: s.sid, next: { ...dev, grade: s.grade, cls: s.cls, num: s.num,
        history: [...(dev.history || []), logEntry(`진급: ${p.from} → ${s.sid}`)] } });
    });
    return { changes, missing, nameWarn };
  }

  // 기존 기기대장 엑셀(시트: 2024학생용, 2025학생용, 교사용 디벗) → 기기 목록
  // 같은 시리얼이 여러 줄에 나오면: 현재 배정된 줄 > 예비 목록 > 자퇴·전학 줄(이력으로만) 순서로 정함
  async function importLedger(file) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error("xlsx 파일만 가져올 수 있습니다.");
    await window.Forms.loadExcel();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const T = (c) => window.Forms.cellText(c && c.value);
    const devs = new Map(), notes = [], names = new Set(); // names: 이력·메모에서 지울 이름 (저장 안 함)
    const get = (id, base) => { if (!devs.has(id)) devs.set(id, { id, history: [], ...base }); return devs.get(id); };
    const RANK = { assigned: 3, spare: 2, history: 1 };
    for (const ws of wb.worksheets) {
      const isT = /교사/.test(ws.name), isS = /학생/.test(ws.name);
      if (!isT && !isS) continue;
      const batch = (ws.name.match(/20\d\d/) || [""])[0];
      // 제목줄에서 열 찾기
      const head = {}; const hr = ws.getRow(1);
      hr.eachCell({ includeEmpty: false }, (c, i) => { const h = T(c).replace(/\s/g, ""); (head[h] ||= []).push(i); });
      const col = (name, k = 0) => (head[name] || [])[k];
      // 시트마다 제목이 조금 다름 (2026학생용: 제품일련번호·학생명)
      const cSerial = col("시리얼번호") || col("제품일련번호"), cName = col("이름") || col("학생명"), cAcc = col("구글계정");
      if (!cSerial) { notes.push(`'${ws.name}' 시트에서 '시리얼번호' 열을 찾지 못해 건너뜀`); continue; }
      ws.eachRow({ includeEmpty: false }, (row, n) => {
        if (n === 1) return;
        const v = (c) => (c ? T(row.getCell(c)) : "");
        const serial = v(cSerial).replace(/\s/g, ""), name = v(cName);
        let account = v(cAcc);
        if (name && !/^(학생용|교사용)?\s*예비/.test(name)) { names.add(name); names.add(name.replace(/\s/g, "")); }
        if (isT) {
          const tLabel = v(col("관리번호", 0)), mgmtNo = v(col("관리번호", 1)) || "";
          if (!serial && !name) return;
          const id = serial || `nosn-t-${tLabel || n}`;
          const d = get(id, { serial, type: "teacher", batch: batch || (tLabel.match(/20\d\d/) || [""])[0] });
          Object.assign(d, { tLabel, mgmtNo, name, account, state: name ? "assigned" : "spare" });
          return;
        }
        const gRaw = v(col("학년")), grade = +gRaw || null, cls = +v(col("반")) || null, num = +v(col("번호")) || null;
        const mgmtNo = v(col("관리번호"));
        // 구글 계정 칸에 계정 대신 메모(예: "학생용 예비 25")가 있으면 메모로 취급
        const accNote = account && !account.includes("@") ? account : "";
        if (accNote) account = "";
        const memo = [accNote, ...(cAcc ? [v(cAcc + 1), v(cAcc + 2)] : [])].filter(Boolean).join(" "); // 구글 계정 오른쪽 두 칸(비고). 그 옆 칸(초기 비밀번호 메모)은 읽지 않음
        if (!serial && !name && !num) return;
        if (cls && num && !/^학생용\s*예비/.test(name)) {
          // "예비 44로 변경" = 이 기기가 예비 44번이 됨 ("예비2번에서 변경"은 예비기기를 받은 것이라 해당 없음)
          const toSpare = memo.match(/예비\s*(\d+)\s*번?\s*(?:으로|로)\s*(?:변경|교체)/) || memo.match(/(?:->|→)\s*(?:학생용\s*)?예비\s*(\d+)/);
          const validGrade = grade >= 1 && grade <= 3;
          const gone = !validGrade || !!toSpare || /자퇴|전학|전출|졸업|휴학|유급/.test(memo);
          const sid = `${gRaw || "?"}-${cls}-${p2(num)}`;
          const id = serial || `nosn-${batch}-${gRaw}${p2(cls)}${p2(num)}`;
          const d = get(id, { serial, type: "student", batch, mgmtNo });
          if (gone) {
            d.history.push({ at: batch, text: `${sid} ${name} ${memo}`.trim() });
            if (toSpare && (d.rank || 0) < RANK.spare) Object.assign(d, { rank: RANK.spare, state: "spare", spareNo: +toSpare[1], mgmtNo: d.mgmtNo || mgmtNo });
            else if (!d.rank) { d.rank = RANK.history; Object.assign(d, { state: "spare", mgmtNo: d.mgmtNo || mgmtNo }); }
            if (validGrade && toSpare && !/자퇴|전학|전출|졸업/.test(memo)) notes.push(`${batch} ${sid} ${name}: '${memo}' → 이 기기를 예비 ${toSpare[1]}번으로 등록 (학생이 다른 기기를 쓰는지 확인)`);
          } else if ((d.rank || 0) < RANK.assigned) {
            Object.assign(d, { rank: RANK.assigned, state: "assigned", grade, cls, num, name, account, mgmtNo: mgmtNo || d.mgmtNo, spareNo: null });
            if (memo) d.history.push({ at: batch, text: memo });
          } else notes.push(`시리얼 ${serial}이(가) ${sidOf(d)}, ${grade}${p2(cls)}${p2(num)} 두 줄에 배정되어 있음 (앞 줄 사용)`);
        } else if (num) { // 학년·반이 비고 번호만 있는 줄 = 예비기기
          const id = serial || `nosn-${batch}-spare${num}`;
          if (!serial) notes.push(`${batch} 예비 ${num}번은 시리얼이 비어 있음`);
          const d = get(id, { serial, type: "student", batch, mgmtNo });
          if ((d.rank || 0) < RANK.spare) Object.assign(d, { rank: RANK.spare, state: "spare", spareNo: num, mgmtNo: mgmtNo || d.mgmtNo });
          else if (d.rank === RANK.assigned) d.history.push({ at: batch, text: `예비 ${num}번 목록에도 있었음 (현재 ${sidOf(d)} 사용 중)` });
        }
      });
    }
    // 자퇴·전학 줄에만 있고 예비 번호가 없는 기기
    for (const d of devs.values()) {
      if (d.type === "student" && d.state === "spare" && !d.spareNo) notes.push(`시리얼 ${d.serial}: ${(d.history[d.history.length - 1] || {}).text || "자퇴·전학 기록"} — 예비 번호가 없음 (예비로 등록)`);
      delete d.rank;
    }
    // 이름·계정은 저장하지 않음: 이력 글에서도 이름을 지움 (긴 이름부터)
    const nameList = [...names].sort((a, b) => b.length - a.length);
    for (const d of devs.values()) {
      d.history = d.history.map((h) => ({ ...h, text: stripNames(h.text, nameList) })).filter((h) => h.text);
      delete d.name; delete d.account;
    }
    // 같은 보급 연도 안에서 예비 번호가 겹치는지
    const seen = {};
    for (const d of devs.values()) if (d.type === "student" && d.state === "spare" && d.spareNo) {
      const k = `${d.batch} 예비 ${d.spareNo}`;
      if (seen[k]) notes.push(`${k}번이 두 기기(${seen[k]}, ${d.serial})에 겹침`); else seen[k] = d.serial;
    }
    return { devices: [...devs.values()], notes };
  }

  // 사이트 기기 목록 → 기존과 같은 형식의 기기대장 엑셀
  async function exportLedger(list) {
    await window.Forms.loadExcel();
    const L = D.ledger;
    const wb = new window.ExcelJS.Workbook();
    const head = ["순번", "교육청", "지역", "학교급", "설립구분", "학교명", "OS종류", "시리얼번호", "학년", "반", "번호", "이름", "관리번호", "구글 계정", "상태", "비고", "보급"];
    const style = (ws, widths) => {
      ws.columns = widths.map((w) => ({ width: w }));
      const thin = { style: "thin", color: { argb: "FFBFBFBF" } };
      ws.eachRow((r, n) => r.eachCell({ includeEmpty: true }, (c) => {
        c.font = { name: "맑은 고딕", size: 10, bold: n === 1 }; c.border = { top: thin, left: thin, bottom: thin, right: thin };
        if (n === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      }));
      ws.views = [{ state: "frozen", ySplit: 1 }];
    };
    const base = [L.office, L.region, L.level, L.found, L.school, L.os];
    const stu = list.filter((d) => d.type !== "teacher");
    const assigned = stu.filter((d) => d.state === "assigned").sort((a, b) => sidOf(a).localeCompare(sidOf(b)));
    const others = stu.filter((d) => d.state !== "assigned").sort((a, b) => String(a.batch).localeCompare(String(b.batch)) || (a.spareNo || 999) - (b.spareNo || 999));
    const ws = wb.addWorksheet("학생용");
    ws.addRow(head);
    let i = 1;
    assigned.forEach((d) => ws.addRow([i++, ...base, d.serial, d.grade, d.cls, d.num, "", d.mgmtNo, "", STATE[d.state], d.note || "", d.batch || ""])); // 이름·계정은 사이트에 없음
    ws.addRow([]);
    others.forEach((d) => ws.addRow([i++, ...base, d.serial, "", "", d.spareNo || "", d.state === "spare" ? "학생용 예비기기" : "", d.mgmtNo, "", STATE[d.state], d.note || "", d.batch || ""]));
    style(ws, [6, 8, 8, 9, 8, 13, 9, 14, 6, 5, 6, 10, 23, 26, 8, 30, 6]);
    const wt = wb.addWorksheet("교사용");
    wt.addRow(["순번", "교육청", "지역", "학교급", "설립구분", "학교명", "OS종류", "시리얼번호", "교사용 번호", "이름", "관리번호", "구글 계정", "상태", "비고"]);
    list.filter((d) => d.type === "teacher").sort((a, b) => String(a.tLabel).localeCompare(String(b.tLabel), "ko", { numeric: true }))
      .forEach((d, k) => wt.addRow([k + 1, ...base, d.serial, d.tLabel || "", "", d.mgmtNo || "", "", STATE[d.state], d.note || ""]));
    style(wt, [6, 8, 8, 9, 8, 13, 9, 14, 12, 10, 23, 26, 8, 30]);
    const wh = wb.addWorksheet("변경 이력");
    wh.addRow(["날짜", "시리얼번호", "관리번호", "내용"]);
    list.flatMap((d) => (d.history || []).map((h) => [h.at, d.serial, d.mgmtNo, h.text])).sort((a, b) => String(b[0]).localeCompare(String(a[0]))).forEach((r) => wh.addRow(r));
    style(wh, [12, 14, 23, 70]);
    await window.Forms.saveWorkbook(wb, `디벗 기기대장_${stamp()}.xlsx`);
  }

  // ---------------- 비밀번호 요청 ----------------
  async function adminPw(el) {
    const [reqs, devices] = await Promise.all([store().listPw(), store().listDevices()]);
    const bySid = {}; devices.filter((d) => d.state === "assigned" && d.type !== "teacher").forEach((d) => (bySid[sidOf(d)] = d));
    const pending = reqs.filter((r) => r.status === "pending"), done = reqs.filter((r) => r.status !== "pending");
    const card = (r) => {
      const dev = bySid[r.sid];
      return `<div class="card" data-card="${esc(r.id)}">
        <div class="actions" style="justify-content:space-between"><b>🔑 ${esc(r.sid)} ${esc(r.name)}</b><span class="badge ${r.status === "done" ? "approved" : r.status === "rejected" ? "rejected" : "pending"}">${REQ[r.status]}</span></div>
        <p class="muted small" style="margin:4px 0">신청 ${new Date(r.createdAt).toLocaleString("ko-KR")}${r.reason ? ` · ${esc(r.reason)}` : ""}</p>
        ${dev ? `<p class="small" style="margin:4px 0">기기대장: ${esc(r.sid)} 디벗 시리얼 <span class="mono">${esc(dev.serial)}</span> · 관리번호 <span class="mono">${esc(dev.mgmtNo || "-")}</span> · 본인 여부는 학교 엑셀 기기대장의 이름과 비교하세요</p>`
          : `<p class="warn" style="margin:4px 0">⚠ 기기 현황에 ${esc(r.sid)} 학번으로 배정된 디벗이 없습니다. AMA에서 학생 기기를 직접 찾아야 합니다.</p>`}
        ${r.status === "pending" ? `<div class="actions" style="margin-top:8px">
            <button class="btn sm" data-gen="${esc(r.id)}">임시 비밀번호 만들기</button>
            <button class="btn bad sm" data-rej="${esc(r.id)}">불가</button></div>
          <div class="pw-work" id="work-${esc(r.id)}" hidden></div>`
        : `${r.adminNote ? `<p class="small muted" style="margin:4px 0">메모: ${esc(r.adminNote)}</p>` : ""}`}
      </div>`;
    };
    el.innerHTML = `
      <div class="card help small">
        <b>처리 순서</b> — 임시 비밀번호는 이 사이트에 <u>저장되지 않습니다</u>. 화면을 닫기 전에 ①~③을 끝내세요.
        <ol style="margin:6px 0 0;padding-left:18px">
          <li>[임시 비밀번호 만들기] → 구글 관리 콘솔에서 해당 계정 <b>비밀번호 재설정</b>, '사용자가 로그인할 때 비밀번호를 변경하도록 요청' <b>체크</b></li>
          <li>AMA(스마트 단말관리)에서 그 학생 디벗을 찾아 <b>메시지</b>로 안내문 보내기 (안내문 복사 버튼)</li>
          <li>[처리 완료] → 학생 조회 화면에 "디벗 메시지를 확인하세요"가 표시됩니다</li>
        </ol>
      </div>
      <h2>대기 중 (${pending.length})</h2>${pending.map(card).join("") || '<p class="muted">대기 중인 요청이 없습니다.</p>'}
      <details><summary class="muted" style="cursor:pointer;margin:16px 0">처리 완료 ${done.length}건 보기</summary>
        ${done.length ? `<div class="actions" style="margin-bottom:10px"><button class="btn ghost sm del-t" id="pwClean">처리된 요청 모두 삭제</button></div>` : ""}${done.map(card).join("")}</details>`;
    const byId = Object.fromEntries(reqs.map((r) => [r.id, r]));
    el.querySelectorAll("[data-gen]").forEach((b) => (b.onclick = () => {
      const r = byId[b.dataset.gen], dev = bySid[r.sid];
      const work = $(`#work-${CSS.escape(r.id)}`, el);
      const acc = dev && dev.account ? dev.account : "";
      const draw = (pw) => {
        const msg = `[용산고 과학정보부] 학교 구글 계정 임시 비밀번호 안내\n계정: ${acc || "본인 학교 구글 계정"}\n임시 비밀번호: ${pw}\n로그인하면 새 비밀번호로 바꾸라는 화면이 나옵니다. 새 비밀번호는 다른 사람에게 알려주지 마세요.`;
        work.hidden = false;
        work.innerHTML = `
          <div class="pw-box"><span>임시 비밀번호</span><b class="mono">${esc(pw)}</b>
            <button type="button" class="btn ghost sm" data-cp="pw">복사</button><button type="button" class="btn ghost sm" data-re>다시 만들기</button></div>
          <ol class="small" style="padding-left:18px;margin:8px 0">
            <li>${acc ? `<b>${esc(acc)}</b> <button type="button" class="btn ghost sm" data-cp="acc">계정 복사</button> — ` : `학번 <b>${esc(r.sid)}</b> <button type="button" class="btn ghost sm" data-cp="sid">복사</button> — `}
              <a href="https://admin.google.com/ac/users" target="_blank" rel="noopener">구글 관리 콘솔 열기 ↗</a>에서 ${acc ? "" : "이 학번으로 검색해 "}비밀번호 재설정 (로그인 시 변경 요청 체크)</li>
            <li><a href="https://mdm.sen.go.kr/" target="_blank" rel="noopener">AMA 열기 ↗</a> (학내망·EVPN)에서 시리얼 <b class="mono">${esc(dev ? dev.serial : "?")}</b> 기기에 메시지 보내기</li>
          </ol>
          <textarea readonly rows="4" class="pw-msg">${esc(msg)}</textarea>
          <div class="actions" style="margin-top:6px"><button type="button" class="btn ghost sm" data-cp="msg">안내문 복사</button>
            <span style="flex:1"></span><button type="button" class="btn ok sm" data-fin>처리 완료 (학생에게 표시)</button></div>`;
        work.querySelectorAll("[data-cp]").forEach((c) => (c.onclick = () => copyText({ pw, acc, msg, sid: r.sid }[c.dataset.cp], c)));
        work.querySelector("[data-re]").onclick = () => draw(tempPassword());
        work.querySelector("[data-fin]").onclick = (e) => {
          if (!confirm("구글 관리 콘솔 재설정과 AMA 메시지 전송을 마쳤나요?")) return;
          busy(e.target, async () => { await store().decide("pw", [r.id], "done", PW_DONE_NOTE); adminPw(el); });
        };
      };
      draw(tempPassword());
      b.disabled = true;
    }));
    el.querySelectorAll("[data-rej]").forEach((b) => (b.onclick = async () => {
      const v = await dialog("비밀번호 재설정 불가", `<label>학생에게 보일 사유<input name="note" required placeholder="예) 본인 확인이 필요합니다. 과학정보부로 와 주세요."></label>`, "불가 처리");
      if (v) busy(b, async () => { await store().decide("pw", [b.dataset.rej], "rejected", v.note.trim()); adminPw(el); });
    }));
    const clean = $("#pwClean", el);
    if (clean) clean.onclick = () => {
      if (!confirm(`처리된 요청 ${done.length}건을 삭제할까요? 학생 조회 화면에서도 사라집니다.`)) return;
      busy(clean, async () => { await store().remove("pw", done.map((r) => r.id)); adminPw(el); });
    };
  }

  // ---------------- 앱·사이트 신청 ----------------
  async function adminApps(el) {
    const reqs = await store().listApps();
    const pending = reqs.filter((r) => r.status === "pending"), done = reqs.filter((r) => r.status !== "pending");
    const groups = {};
    pending.forEach((r) => (groups[r.kind + ":" + (r.key || keyOf(r.title))] ||= []).push(r));
    const gl = Object.values(groups).sort((a, b) => b.length - a.length);
    el.innerHTML = `
      <div class="card help small">같은 앱·사이트 신청은 한 줄로 묶어 보여 줍니다. AMA(앱 화이트리스트)나 구글 관리 콘솔(사이트·서드파티 앱 승인)에서 허용한 뒤 <b>[허용 완료]</b>를 누르면, 신청한 학생 모두에게 결과가 표시됩니다.</div>
      <h2>대기 중 (${pending.length}건 · ${gl.length}종)</h2>
      ${gl.map((g, i) => {
        const r0 = g[0], urls = [...new Set(g.map((r) => r.url).filter(Boolean))], titles = [...new Set(g.map((r) => r.title))];
        const ga = g.filter((r) => r.googleAuth).length;
        return `<div class="card">
          <div class="actions" style="justify-content:space-between"><b>${r0.kind === "app" ? "📱 앱" : "🌐 사이트"} · ${esc(titles.join(" / "))}</b>
            <span class="actions">${ga ? `<span class="badge google" title="구글 계정 로그인 시 '관리자 승인 필요' 화면이 뜬다고 체크한 학생 수">🔐 구글 관리자 승인 필요 ${ga}명</span>` : ""}<span class="badge pending">${g.length}명 신청</span></span></div>
          ${ga ? `<p class="small google-help">구글 관리 콘솔 → 보안 → 액세스 및 데이터 제어 → <b>API 제어</b> → 앱 액세스 제어 관리(서드 파티 앱)에서 '${esc(r0.title)}'을(를) 찾아 <b>신뢰함</b>(또는 제한됨)으로 설정하세요. <a href="https://admin.google.com/ac/owl/list?tab=configuredApps" target="_blank" rel="noopener">열기 ↗</a></p>` : ""}
          ${urls.length ? `<p class="small" style="margin:4px 0">${urls.map((u) => /^https?:\/\//i.test(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>` : esc(u)).join("<br>")}</p>` : ""}
          <ul class="small" style="margin:6px 0;padding-left:18px">${g.map((r) => `<li>${esc(r.sid)} ${esc(r.name || "")} · ${esc(r.purpose)}${r.googleAuth ? " · 🔐" : ""} <span class="muted">(${day(r.createdAt)})</span></li>`).join("")}</ul>
          <div class="actions"><button class="btn ok sm" data-ok="${i}">허용 완료</button><button class="btn bad sm" data-no="${i}">불가</button></div>
        </div>`;
      }).join("") || '<p class="muted">대기 중인 신청이 없습니다.</p>'}
      <details><summary class="muted" style="cursor:pointer;margin:16px 0">처리된 신청 ${done.length}건 보기</summary>
        ${done.length ? `<div class="actions" style="margin-bottom:10px"><button class="btn ghost sm del-t" id="apClean">처리된 신청 모두 삭제</button></div>` : ""}
        <div class="table-wrap"><table class="mini"><tr><th>신청일</th><th>신청자</th><th>앱·사이트</th><th>목적</th><th>결과</th><th>메모</th></tr>
        ${done.map((r) => `<tr><td>${day(r.createdAt)}</td><td>${esc(r.sid)} ${esc(r.name || "")}</td><td>${esc(r.title)}</td><td class="small">${esc(r.purpose)}</td><td>${REQ[r.status]}</td><td class="small">${esc(r.adminNote)}</td></tr>`).join("")}</table></div></details>`;
    el.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = async () => {
      const g = gl[+b.dataset.ok];
      const v = await dialog(`${g[0].title} 허용 완료 (${g.length}명)`, `<label>학생에게 보일 메모<input name="msg" value="${esc(APP_DONE_NOTE)}"></label>`, "허용 완료");
      if (v) busy(b, async () => { await store().decide("app", g.map((r) => r.id), "done", v.msg.trim()); adminApps(el); });
    }));
    el.querySelectorAll("[data-no]").forEach((b) => (b.onclick = async () => {
      const g = gl[+b.dataset.no];
      const v = await dialog(`${g[0].title} 불가 처리 (${g.length}명)`, `<label>학생에게 보일 사유<input name="note" required placeholder="예) 수업과 관련 없는 앱이라 허용할 수 없습니다."></label>`, "불가 처리");
      if (v) busy(b, async () => { await store().decide("app", g.map((r) => r.id), "rejected", v.note.trim()); adminApps(el); });
    }));
    const clean = $("#apClean", el);
    if (clean) clean.onclick = () => {
      if (!confirm(`처리된 신청 ${done.length}건을 삭제할까요? 학생 조회 화면에서도 사라집니다.`)) return;
      busy(clean, async () => { await store().remove("app", done.map((r) => r.id)); adminApps(el); });
    };
  }

  // ---------------- 신입생 구글 계정 CSV (브라우저 안에서만 처리, 저장 안 함) ----------------
  function parseRoster(text) {
    const out = [], bad = [];
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim(); if (!t) return;
      const cells = t.split(/\t|,/).map((s) => s.trim()).filter(Boolean);
      let sid = "", name = "";
      // "학번 이름", "이름 학번", "학년 반 번호 이름" 모두 받기
      const nums = cells.filter((c) => /^\d+$/.test(c)), words = cells.filter((c) => !/^\d+$/.test(c));
      if (nums.length === 1 && nums[0].length === 5) sid = nums[0];
      else if (nums.length >= 3) sid = `${+nums[0]}${p2(+nums[1])}${p2(+nums[2])}`;
      if (cells.length === 1) { const m = t.match(/^(\d{5})\s+(.+)$/) || t.match(/^(.+?)\s+(\d{5})$/); if (m) { sid = /^\d/.test(m[1]) ? m[1] : m[2]; name = /^\d/.test(m[1]) ? m[2] : m[1]; } }
      if (!name) name = words.join(" ");
      if (/학번|성명|이름/.test(t) && !window.parseSid(sid)) return; // 제목줄
      if (!window.parseSid(sid) || !name) bad.push(`${i + 1}번째 줄: ${t}`);
      else out.push({ sid, name: name.replace(/\s+/g, "") });
    });
    return { list: out, bad };
  }
  async function rosterFromXlsx(file) {
    await window.Forms.loadExcel();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const T = (c) => window.Forms.cellText(c && c.value);
    let hdr = 0, cols = {};
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (hdr) return;
      const c = {}; row.eachCell((cell, i) => { const h = T(cell).replace(/\s/g, ""); if (h) c[h] = i; });
      const find = (re) => { const k = Object.keys(c).find((h) => re.test(h)); return k ? c[k] : 0; };
      const name = find(/^(성명|이름|학생명)$/), sid = find(/^학번$/), g = find(/^학년$/), cl = find(/^반$/), nu = find(/^번호$/);
      if (name && (sid || (g && cl && nu))) { hdr = n; cols = { name, sid, g, cl, nu }; }
    });
    if (!hdr) throw new Error("첫 시트에서 '학번'(또는 학년·반·번호)과 '성명'(또는 이름) 제목을 찾지 못했습니다.");
    const lines = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n <= hdr) return;
      const v = (i) => (i ? T(row.getCell(i)) : "");
      const sid = cols.sid ? v(cols.sid) : [v(cols.g), v(cols.cl), v(cols.nu)].join("\t");
      if (v(cols.name)) lines.push(`${sid}\t${v(cols.name)}`);
    });
    return lines.join("\n");
  }
  function adminFresh(el) {
    const now = new Date(), yy = String((now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear()) % 100).padStart(2, "0");
    el.innerHTML = `
      <div class="card help small">신입생 명단(학번·이름)으로 <b>구글 워크스페이스 사용자 일괄 업로드용 CSV</b>를 만듭니다. 명단은 <u>이 브라우저 안에서만</u> 처리되고 사이트에 저장되지 않습니다.
        만든 파일은 관리 콘솔 → 디렉터리 → 사용자 → <b>사용자 일괄 업데이트</b> → CSV 파일 첨부로 올립니다.</div>
      <div class="grid2">
        <div class="card">
          <h2>① 명단 넣기</h2>
          <p class="muted small" style="margin-top:0">NEIS 반편성 엑셀에서 <b>학번·이름</b> 두 열을 복사해 붙여넣거나(학년·반·번호·이름도 가능), 엑셀 파일을 불러오세요.</p>
          <textarea id="frText" rows="12" placeholder="학번 · 이름 (엑셀에서 두 열 복사해 붙여넣기)"></textarea>
          <div class="actions" style="margin-top:8px"><label class="btn ghost sm">엑셀 파일 불러오기<input type="file" accept=".xlsx" hidden id="frFile"></label><span class="muted small" id="frCount"></span></div>
        </div>
        <div class="card">
          <h2>② 계정 규칙</h2>
          <div class="row"><label>입학년도 (2자리)<input id="frYY" value="${yy}" maxlength="2"></label><label>시작 번호<input id="frStart" type="number" min="1" value="1"></label></div>
          <div class="row"><label>계정 형식<input id="frPat" value="{yy}s{nnn}"></label><label>도메인<input id="frDom" value="${esc(D.domain)}"></label></div>
          <div class="row"><label>계정 번호 순서<select id="frSort"><option value="name">이름 가나다순 (지금 방식)</option><option value="sid">학번순</option></select></label>
            <label>조직 경로<input id="frOrg" value="${esc(D.orgPath)}"></label></div>
          <div class="row"><label>초기 비밀번호 (8자 이상)<input id="frPw" placeholder="예) 학교에서 정한 비밀번호"></label>
            <label>&nbsp;<button type="button" class="btn ghost sm" id="frGen">학생마다 다르게 자동 생성</button></label></div>
          <label class="inline-check"><input type="checkbox" id="frChange" checked> 첫 로그인 때 비밀번호 바꾸게 하기 (권장)</label>
          <p class="warn" id="frWarn"></p>
        </div>
      </div>
      <div class="card">
        <div class="actions" style="justify-content:space-between"><h2 style="margin:0">③ 미리보기</h2>
          <div class="actions"><button class="btn" id="frCsv">구글 CSV 내려받기</button><button class="btn ghost" id="frRoster">계정 명렬표 엑셀</button></div></div>
        <div id="frPreview" style="margin-top:10px"></div>
      </div>
      <div class="card muted small"><b>AMA 기기 일괄등록 양식</b>은 양식 파일을 받으면 여기에 추가할 예정입니다.</div>`;
    let perPw = null; // 학생별 자동 비밀번호
    const read = () => {
      const { list, bad } = parseRoster($("#frText").value);
      const seen = {}, dup = [];
      list.forEach((s) => { if (seen[s.sid]) dup.push(s.sid); seen[s.sid] = 1; });
      const sorted = list.slice().sort($("#frSort").value === "name" ? (a, b) => a.name.localeCompare(b.name, "ko") || a.sid.localeCompare(b.sid) : (a, b) => a.sid.localeCompare(b.sid));
      const start = +$("#frStart").value || 1, pat = $("#frPat").value || "{yy}s{nnn}", dom = $("#frDom").value.trim();
      const rows = sorted.map((s, i) => {
        const n = start + i;
        const id = pat.replace("{yy}", $("#frYY").value.trim()).replace(/\{(n+)\}/, (_, k) => String(n).padStart(k.length, "0"));
        return { ...s, email: `${id}@${dom}`, pw: perPw ? perPw[s.sid] || (perPw[s.sid] = tempPassword()) : $("#frPw").value };
      });
      return { rows, bad, dup };
    };
    const draw = () => {
      const { rows, bad, dup } = read();
      $("#frCount").textContent = rows.length ? `${rows.length}명 인식` : "";
      const warns = [];
      if (!perPw && $("#frPw").value.length < 8) warns.push("초기 비밀번호를 8자 이상으로 정하세요.");
      if (!$("#frChange").checked) warns.push("첫 로그인 때 비밀번호를 바꾸게 하지 않으면, 학번 순서만 알아도 다른 학생 계정에 로그인할 수 있습니다.");
      if (dup.length) warns.push(`학번이 겹칩니다: ${dup.join(", ")}`);
      $("#frWarn").innerHTML = warns.map(esc).join("<br>");
      $("#frPreview").innerHTML = (bad.length ? `<p class="warn">읽지 못한 줄 ${bad.length}개: ${esc(bad.slice(0, 5).join(" / "))}${bad.length > 5 ? " …" : ""}</p>` : "") +
        (rows.length ? `<div class="table-wrap" style="max-height:380px;overflow:auto"><table class="mini"><tr><th>#</th><th>First Name (이름)</th><th>Last Name (학번)</th><th>Email Address</th><th>Password</th><th>Org Unit Path</th></tr>
          ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.sid)}</td><td>${esc(r.email)}</td><td class="mono">${perPw ? esc(r.pw) : "(공통)"}</td><td>${esc($("#frOrg").value)}</td></tr>`).join("")}</table></div>`
          : '<p class="muted">명단을 넣으면 여기에 미리 보입니다.</p>');
    };
    ["#frText", "#frYY", "#frStart", "#frPat", "#frDom", "#frOrg", "#frPw"].forEach((s) => ($(s, el).oninput = draw));
    ["#frSort", "#frChange"].forEach((s) => ($(s, el).onchange = draw));
    $("#frGen").onclick = (e) => {
      perPw = perPw ? null : {};
      e.target.textContent = perPw ? "공통 비밀번호로 돌아가기" : "학생마다 다르게 자동 생성";
      $("#frPw").disabled = !!perPw; draw();
    };
    $("#frFile").onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = ""; if (!file) return;
      try { $("#frText").value = await rosterFromXlsx(file); draw(); } catch (err) { alert(err.message); }
    };
    const ok = () => {
      const r = read();
      if (!r.rows.length) { alert("명단을 먼저 넣으세요."); return null; }
      if (!perPw && $("#frPw").value.length < 8) { alert("초기 비밀번호를 8자 이상으로 정하세요."); return null; }
      if (r.dup.length && !confirm(`학번이 겹치는 학생이 있습니다 (${r.dup.join(", ")}). 그래도 만들까요?`)) return null;
      return r.rows;
    };
    $("#frCsv").onclick = () => {
      const rows = ok(); if (!rows) return;
      const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
      const lines = [["First Name [Required]", "Last Name [Required]", "Email Address [Required]", "Password [Required]", "Org Unit Path [Required]", "Change Password at Next Sign-In"].join(",")]
        .concat(rows.map((r) => [r.name, r.sid, r.email, r.pw, $("#frOrg").value.trim(), $("#frChange").checked ? "TRUE" : "FALSE"].map(q).join(",")));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      a.download = `구글계정_일괄등록_${$("#frYY").value}학번_${rows.length}명.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $("#frRoster").onclick = (e) => {
      const rows = ok(); if (!rows) return;
      busy(e.target, async () => {
        await window.Forms.loadExcel();
        const wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet("계정 명렬표");
        ws.columns = [{ width: 8 }, { width: 10 }, { width: 30 }, { width: 16 }];
        ws.addRow(["학번", "이름", "구글 계정", "초기 비밀번호"]).font = { bold: true };
        rows.sort((a, b) => a.sid.localeCompare(b.sid)).forEach((r) => ws.addRow([r.sid, r.name, r.email, r.pw]));
        ws.views = [{ state: "frozen", ySplit: 1 }];
        await window.Forms.saveWorkbook(wb, `구글계정_명렬표_${$("#frYY").value}학번.xlsx`);
      });
    };
    draw();
  }

  // ---------------- 진급 CSV (브라우저 안에서만 처리, 저장 안 함) ----------------
  // ① 구글 관리 콘솔 '사용자 다운로드' CSV (성=현재 학번) + ② 진급 정보(NEIS 일괄반편성 엑셀 또는 '이전학번 새학번' 목록)
  //   → 성(Last Name)=새 학번, 조직 경로=새 학년·반 으로 바꾼 '사용자 일괄 업데이트' CSV
  const baseName = (s) => String(s || "").replace(/\s/g, "").replace(/[A-Za-z]$/, ""); // 이름 끝 동명이인 표시(영문 한 글자) 떼기
  async function promoFromXlsx(file) {
    if (!/\.xlsx$/i.test(file.name)) throw new Error("xlsx 파일만 읽을 수 있습니다. NEIS에서 받은 .xls 파일은 엑셀에서 '다른 이름으로 저장 → Excel 통합 문서(*.xlsx)'로 바꿔 주세요.");
    await window.Forms.loadExcel();
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const T = (c) => window.Forms.cellText(c && c.value);
    let hdr = 0, cols = null;
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (hdr) return;
      const c = {}; row.eachCell((cell, i) => { const h = T(cell).replace(/\s/g, ""); if (h) c[h] = i; });
      const find = (...res) => { for (const re of res) { const k = Object.keys(c).find((h) => re.test(h)); if (k) return c[k]; } return 0; };
      const x = { name: find(/^(성명|이름|학생명)$/), pg: find(/^이전학년/), pc: find(/^이전반(명|코드)?$/), pn: find(/^이전(반)?번호$/),
        ng: find(/^진급학년/), nc: find(/^진급반코드$/, /^진급반(명)?$/), nn: find(/^진급(반)?번호$/, /^진급반번호/) };
      if (x.pg && x.pc && x.pn && x.ng && x.nc && x.nn) { hdr = n; cols = x; }
    });
    if (!hdr) throw new Error("첫 시트에서 '이전학년·이전반·이전번호·진급학년·진급반·진급번호' 제목을 찾지 못했습니다. NEIS 일괄반편성 파일이 맞는지 확인하세요.");
    const num = (s) => +String(s).replace(/\D/g, "") || 0;
    const out = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      if (n <= hdr) return;
      const v = (i) => (i ? T(row.getCell(i)) : "");
      const from = `${num(v(cols.pg))}${p2(num(v(cols.pc)))}${p2(num(v(cols.pn)))}`, to = `${num(v(cols.ng))}${p2(num(v(cols.nc)))}${p2(num(v(cols.nn)))}`;
      if (window.parseSid(from) && window.parseSid(to)) out.push({ from, to, name: v(cols.name) });
    });
    return out;
  }
  function promoFromText(text) {
    const out = [], bad = [];
    text.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim(); if (!t) return;
      const nums = t.match(/\d{5}/g) || [], name = (t.replace(/\d+/g, " ").match(/[가-힣A-Za-z]+/g) || []).join("");
      if (nums.length >= 2) out.push({ from: nums[0], to: nums[1], name });
      else if (!/학번|이전|진급/.test(t)) bad.push(`${i + 1}번째 줄: ${t}`);
    });
    return { list: out, bad };
  }
  function adminPromote(el) {
    el.innerHTML = `
      <div class="card help small">구글 계정의 <b>학번(성 칸)과 조직 경로</b>를 새 학년으로 바꾸는 '사용자 일괄 업데이트' CSV를 만듭니다. 파일은 <u>이 브라우저 안에서만</u> 처리되고 저장되지 않습니다.
        <ol style="margin:6px 0 0;padding-left:18px">
          <li>관리 콘솔 → 디렉터리 → 사용자 → 진급할 학년 조직 선택 → <b>사용자 다운로드</b> (모든 사용자 정보 열, CSV)</li>
          <li>진급 정보: NEIS <b>일괄반편성 파일</b>(xlsx) 또는 '이전학번 새학번' 목록</li>
          <li>만든 CSV를 <b>사용자 일괄 업데이트</b>로 올리기. 새 조직(예: /학생/2학년/9반)은 콘솔에 <b>미리 만들어 두어야</b> 합니다.</li>
        </ol></div>
      <div class="grid2">
        <div class="card">
          <h2>① 구글 사용자 다운로드 CSV</h2>
          <label class="btn ghost sm">CSV 파일 고르기<input type="file" accept=".csv" hidden id="pmUsers"></label>
          <p class="muted small" id="pmUsersInfo">아직 고르지 않았습니다.</p>
        </div>
        <div class="card">
          <h2>② 진급 정보</h2>
          <label class="btn ghost sm">NEIS 일괄반편성 엑셀 고르기<input type="file" accept=".xlsx" hidden id="pmNeis"></label>
          <p class="muted small" style="margin:8px 0 4px">또는 '이전학번 새학번 (이름)'을 한 줄에 한 명씩 붙여넣기:</p>
          <textarea id="pmText" rows="5" placeholder="이전 학번 · 새 학번 · 이름 (한 줄에 한 명)"></textarea>
          <p class="muted small" id="pmInfo"></p>
        </div>
      </div>
      <div class="card">
        <h2>③ 설정</h2>
        <div class="row"><label>새 조직 경로 형식<input id="pmOrg" value="/학생/{학년}학년/{반}반"></label>
          <label>진급 정보에 없는 학생 (전출·자퇴·졸업)<select id="pmMiss"><option value="skip">업로드 파일에서 빼기 (그대로 둠)</option><option value="move">아래 조직으로 옮기기</option></select></label>
          <label>옮길 조직<input id="pmMissOrg" placeholder="예) /졸업·전출" disabled></label></div>
        <label class="inline-check"><input type="checkbox" id="pmOrgOn" checked> 조직 경로도 새 학년·반으로 바꾸기</label>
      </div>
      <div class="card">
        <div class="actions" style="justify-content:space-between"><h2 style="margin:0">④ 미리보기</h2>
          <div class="actions"><button class="btn" id="pmCsv" disabled>업로드용 CSV 내려받기</button><button class="btn ghost" id="pmDev" disabled>디벗 기기대장에도 반영</button></div></div>
        <div id="pmOut" style="margin-top:10px"><p class="muted">①과 ②를 넣으면 결과가 여기에 보입니다.</p></div>
      </div>`;
    let users = null, neis = null; // users: { head, rows }, neis: [{from,to,name}]
    const build = () => {
      const info = neis || promoFromText($("#pmText").value).list;
      $("#pmInfo").textContent = info.length ? `진급 정보 ${info.length}명` : "";
      $("#pmDev").disabled = !info.length; // 기기대장 반영은 진급 정보(학번)만 있으면 됨
      if (!users || !info.length) { $("#pmCsv").disabled = true; return info.length ? { info, out: [], changes: [] } : null; }
      const h = users.head, ci = (re) => h.findIndex((x) => re.test(x));
      const cF = ci(/^First Name/i), cL = ci(/^Last Name/i), cE = ci(/^Email Address/i), cO = ci(/^Org Unit Path/i);
      const byFrom = {}; info.forEach((p) => (byFrom[p.from] = p));
      const used = new Set(), out = [], changes = [], skipped = [], moved = [], nameWarn = [];
      const tpl = $("#pmOrg").value, orgOn = $("#pmOrgOn").checked, miss = $("#pmMiss").value, missOrg = $("#pmMissOrg").value.trim();
      users.rows.forEach((r) => {
        const cur = (r[cL] || "").trim(), p = byFrom[cur];
        const row = r.slice();
        if (p) {
          used.add(cur);
          if (p.name && r[cF] && baseName(r[cF]) !== baseName(p.name)) { nameWarn.push(`${cur} ${r[cF]} ↔ 진급정보 ${p.name}`); return; }
          const s = window.parseSid(p.to);
          row[cL] = p.to;
          if (orgOn && cO >= 0) row[cO] = tpl.replace("{학년}", s.grade).replace("{반}", s.cls);
          out.push(row); changes.push({ email: r[cE], name: r[cF], from: cur, to: p.to, org: row[cO] });
        } else if (miss === "move" && missOrg && cO >= 0) {
          row[cO] = missOrg; out.push(row); moved.push(`${cur || "(학번 없음)"} ${r[cF]}`);
        } else skipped.push(`${cur || "(학번 없음)"} ${r[cF]} (${(r[cE] || "").split("@")[0]})`);
      });
      const noAccount = info.filter((p) => !used.has(p.from)).map((p) => `${p.from}→${p.to} ${p.name || ""}`);
      $("#pmCsv").disabled = !out.length;
      const list = (title, arr, cls = "") => arr.length ? `<details ${cls ? "open" : ""}><summary class="${cls}">${title} ${arr.length}명</summary><p class="small">${arr.map(esc).join(" · ")}</p></details>` : "";
      $("#pmOut").innerHTML = `
        <p><b>학번이 바뀌는 계정 ${changes.length}명</b>${moved.length ? ` · 다른 조직으로 옮길 계정 ${moved.length}명` : ""}</p>
        ${list("⚠ 이름이 달라 제외한 계정", nameWarn, "warn")}
        ${list("진급 정보에 없는 계정 (전출·자퇴·졸업 확인)", miss === "move" ? [] : skipped)}
        ${list("옮길 계정", moved)}
        ${list("계정이 없는 학생 (전입생 → '신입생 계정 CSV'에서 새로 만들기)", noAccount)}
        <div class="table-wrap" style="max-height:340px;overflow:auto;margin-top:8px"><table class="mini"><tr><th>이름</th><th>계정</th><th>이전 학번</th><th>새 학번</th><th>새 조직 경로</th></tr>
          ${changes.map((c) => `<tr><td>${esc(c.name)}</td><td class="small">${esc(c.email)}</td><td>${esc(c.from)}</td><td><b>${esc(c.to)}</b></td><td class="small">${esc(c.org || "")}</td></tr>`).join("")}</table></div>`;
      return { info, out, changes };
    };
    const csvText = (head, rows) => {
      const q = (s) => (/[",\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);
      return [head, ...rows].map((r) => r.map((x) => q(x ?? "")).join(",")).join("\r\n");
    };
    $("#pmUsers").onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = ""; if (!file) return;
      try {
        const rows = parseCsv(await file.text());
        const head = rows[0].map((x) => x.trim());
        if (!head.some((x) => /^Last Name/i.test(x)) || !head.some((x) => /^Email Address/i.test(x))) throw new Error("구글 관리 콘솔에서 받은 사용자 CSV가 아닌 것 같습니다 ('Last Name', 'Email Address' 열이 없음).");
        users = { head, rows: rows.slice(1).map((r) => { while (r.length < head.length) r.push(""); return r; }) };
        $("#pmUsersInfo").textContent = `${file.name} · 계정 ${users.rows.length}개`;
        build();
      } catch (err) { alert(err.message); }
    };
    $("#pmNeis").onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = ""; if (!file) return;
      try { neis = await promoFromXlsx(file); $("#pmText").value = ""; $("#pmText").placeholder = `${file.name}에서 ${neis.length}명을 읽었습니다.`; build(); }
      catch (err) { alert(err.message); }
    };
    $("#pmText").oninput = () => { neis = null; build(); };
    ["#pmOrg", "#pmMissOrg"].forEach((s) => ($(s).oninput = build));
    $("#pmOrgOn").onchange = build;
    $("#pmMiss").onchange = (e) => { $("#pmMissOrg").disabled = e.target.value !== "move"; build(); };
    $("#pmCsv").onclick = () => {
      const r = build(); if (!r || !r.out.length) return;
      if ($("#pmOrgOn").checked && !confirm("새 조직(예: " + (r.changes[0] && r.changes[0].org) + ")이 관리 콘솔에 미리 만들어져 있어야 업로드됩니다. 내려받을까요?")) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csvText(users.head, r.out)], { type: "text/csv;charset=utf-8" }));
      a.download = `구글계정_진급_${stamp()}_${r.out.length}명.csv`;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    };
    $("#pmDev").onclick = (e) => {
      const r = build(); if (!r) return;
      busy(e.target, async () => {
        const list = await store().listDevices();
        const plan = promoteBySid(r.info, list);
        const extra = (plan.nameWarn.length ? `\n\n⚠ 이름이 달라 건너뜀 ${plan.nameWarn.length}명:\n- ${plan.nameWarn.slice(0, 10).join("\n- ")}` : "") +
          (plan.missing.length ? `\n\n기기대장에 그 학번의 배정 기기가 없음 ${plan.missing.length}명: ${plan.missing.slice(0, 15).join(", ")}${plan.missing.length > 15 ? " …" : ""}` : "");
        if (!plan.changes.length) return alert("기기대장에서 학번을 바꿀 기기가 없습니다. (이미 반영됨)" + extra);
        if (!confirm(`디벗 기기대장에서 ${plan.changes.length}대의 학번을 바꿀까요? (이전 학번으로 찾음)${extra}`)) return;
        await store().saveDevices(plan.changes.map((c) => c.next));
        alert(`기기대장 ${plan.changes.length}대의 학번을 바꿨습니다.`);
      });
    };
  }

  window.Dibut = { studentView, statusSection, admin, setSub: (s) => { sub = s; } };
})();
