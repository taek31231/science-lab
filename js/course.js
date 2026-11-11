// ===== 과학중점 수강신청 (심화실험 캠프 · 이공계 진로특강 등) =====
// 학생: 학교 구글 계정 아이디 + 이름 + PIN 4자리로 로그인 → 정해진 시각에 열리는 강좌를 담고(선착순) 내 신청 목록 확인
// 관리자: 행사·강좌 개설(정원·예비·인정 시간·신청 기간), 신청 현황, 출석부·학급별 열람표 인쇄, 출석 체크 → 이수시간 바로 반영
//
// 저장 구조 (Firebase)
//   programs/{ID}  행사 (제목·신청 기간·대상 학년·이수시간 활동명) - 공개
//   courses/{ID}   강좌 (코드·날짜·교시·정원·예비·인정 시간, last=마지막 신청 순번, q=살아 있는 신청 순번 목록) - 공개 (이름·학번 없음)
//   enroll/{행사ID_시간칸_학생열쇠}  신청 1건 (학번·이름·순번) - 관리자와 본인만 읽기. 같은 시간칸에는 한 강좌만 신청됨
//   roster/{학생열쇠}  학생 명단: '계정 아이디+이름'을 해시로 바꾼 열쇠 → 학번 (계정 아이디·이름 자체는 저장 안 함)
//   resets/{학생열쇠} PIN 초기화 횟수
//   students/{로그인ID} 로그인한 학생의 학번·이름
// PIN은 저장하지 않습니다. 로그인 비밀번호(Firebase 인증)로만 쓰이고, 틀리면 로그인이 되지 않습니다.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const p2 = (n) => String(n).padStart(2, "0");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  async function busy(btn, fn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = "처리 중…";
    try { await fn(); } catch (e) { console.error(e); alert(e.userMsg || "문제가 발생했습니다: " + e.message); }
    finally { btn.disabled = false; btn.textContent = t; }
  }
  const fail = (msg) => { const e = new Error(msg); e.userMsg = msg; throw e; };
  const STU_DOMAIN = "stu.yongsan-sci.invalid"; // 로그인용 가짜 주소 (메일은 보내지 않음)
  const KIND = { camp: "심화실험 캠프", lecture: "이공계 진로특강", other: "기타" };

  // ---------- 학생 열쇠 ----------
  // 계정 아이디: 앞뒤 공백·@도메인 제거, 소문자.  이름: 공백 제거, 동명이인 표시(끝의 영문 A·B…) 제거
  // (NFC: 맥·아이패드에서 한글 자모가 풀려 입력돼도 같은 글자로 맞춤)
  const normAcct = (s) => String(s || "").normalize("NFC").trim().toLowerCase().replace(/@.*$/, "").replace(/\s/g, "");
  const normName = (s) => String(s || "").normalize("NFC").replace(/\s/g, "").replace(/[A-Za-z]+$/, "");
  async function sha(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const studentKey = async (acct, name) => (await sha(`yongsan-roster|${normAcct(acct)}|${normName(name)}`)).slice(0, 40);
  const pinOk = (p) => /^\d{4}$/.test(String(p || ""));
  const loginPw = (key, pin) => `ys!${pin}!${key.slice(0, 6)}`; // Firebase 비밀번호는 6자 이상이어야 함

  // ---------- 시간 ----------
  const slotOf = (date, period) => `${date}_${String(period || "").replace(/[\/\s.()~:]/g, "")}`;
  const dayLabel = (ds) => { const d = new Date(ds + "T00:00"); return isNaN(d) ? ds : `${d.getMonth() + 1}.${d.getDate()}.(${"일월화수목금토"[d.getDay()]})`; };
  const fmtDT = (ms) => { if (!ms) return "-"; const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]}) ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const toLocalInput = (ms) => { if (!ms) return ""; const d = new Date(ms); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const phase = (p, now = Date.now()) => (now < p.openAt ? "before" : now > p.closeAt ? "closed" : "open");
  const PHASE = { before: "신청 전", open: "신청 중", closed: "마감" };

  // 신청 순번(pos)이 정원 안인지: q(살아 있는 순번)를 순서대로 세어 정원까지 확정, 그 뒤는 예비
  function rankOf(c, pos) {
    const q = [...(c.q || [])].sort((a, b) => a - b);
    const i = q.indexOf(pos);
    if (i < 0) return null;
    return i < c.cap ? { ok: true, n: i + 1 } : { ok: false, n: i - c.cap + 1 };
  }
  const rankText = (r) => (!r ? "-" : r.ok ? "확정" : `예비 ${r.n}`);
  const activityOf = (p, c) => c.activity || (p.kind === "camp" ? `${p.activity}(${c.code})` : `${p.activity}${c.code}`);

  // =====================================================================
  //  데이터
  // =====================================================================
  function demoStore() {
    const K = "sci-course-demo-v1", ME = "sci-course-me";
    function seed() {
      const y = window.schoolYear(), now = Date.now();
      const day = (n) => window.localDate(new Date(now + n * 864e5));
      const pid = "camp1", pid2 = "lec1";
      const c = (id, code, date, period, title, lecturer, place, extra = {}) => ({
        id, programId: extra.programId || pid, year: y, code, date, period, slot: slotOf(date, period), title, lecturer, place,
        cap: 20, wait: 10, hours: 3, last: 0, q: [], ...extra });
      const courses = [
        c("c1", "물리5", day(10), "1교시(08:00~10:30)", "이중 무지개 만들기", "김태윤", "물리실"),
        c("c2", "물리6", day(10), "2교시(10:40~13:10)", "이중 무지개 만들기", "김태윤", "물리실"),
        c("c3", "화학5", day(10), "1교시(08:00~10:30)", "분광광도계를 이용한 평형상수 결정", "김현호", "화학실"),
        c("c4", "화학6", day(10), "2교시(10:40~13:10)", "분광광도계를 이용한 평형상수 결정", "김현호", "화학실", { cap: 2, wait: 1 }),
        c("c5", "생명7", day(24), "1교시(08:00~10:30)", "무척추동물의 구조와 기능", "이지선", "생명과학실"),
        c("c6", "지구4", day(24), "2교시(10:40~13:10)", "아두이노 기상관측기", "이흥기", "AI실", { cap: 12, wait: 5 }),
        c("l1", "C", day(14), "15:00", "인공지능 속 수학 - 수학적 최적화", "이병준 (가톨릭대학교)", "소강당(별관동 4층)", { programId: pid2, cap: 80, wait: 10, hours: 2 })
      ];
      // 데모: 화학6은 이미 2명 신청(정원 2) → 다음 신청은 예비
      courses[3].last = 2; courses[3].q = [1, 2];
      const enroll = {
        [`${pid}_${courses[3].slot}_demoA`]: { id: `${pid}_${courses[3].slot}_demoA`, programId: pid, courseId: "c4", slot: courses[3].slot, key: "demoA", sid: "10208", name: "예시학생", pos: 1, at: now - 3600e3, year: y },
        [`${pid}_${courses[3].slot}_demoB`]: { id: `${pid}_${courses[3].slot}_demoB`, programId: pid, courseId: "c4", slot: courses[3].slot, key: "demoB", sid: "20811", name: "예시학생", pos: 2, at: now - 3000e3, year: y }
      };
      return {
        programs: {
          [pid]: { id: pid, year: y, kind: "camp", title: `${y}학년도 2학기 심화실험 캠프`, activity: "심화실험 캠프", grades: "12",
            openAt: now - 3600e3, closeAt: now + 5 * 864e5, note: "같은 날 같은 교시에는 한 강좌만 신청할 수 있습니다. 불참 시 다음 캠프 신청이 제한될 수 있습니다." },
          [pid2]: { id: pid2, year: y, kind: "lecture", title: "이공계 진로특강 (3차)", activity: "이공계진로특강", grades: "123",
            openAt: now + 2 * 864e5, closeAt: now + 6 * 864e5, note: "" }
        },
        courses: Object.fromEntries(courses.map((x) => [x.id, x])),
        enroll,
        roster: {}, // 열쇠 → 학번 (아래 demoRoster로 채움)
        users: {}   // 열쇠 → { pw, n }
      };
    }
    // 데모 학생 명단 (계정 아이디 / 이름 / 학번)
    const DEMO_ROSTER = [["26001", "김민준", "10101"], ["26002", "이서연", "10102"], ["25s101", "박지호", "20315"]];
    let cache = null;
    async function load() {
      if (cache) return cache;
      try { cache = JSON.parse(localStorage.getItem(K)); } catch {}
      if (!cache) {
        cache = seed();
        for (const [a, n, s] of DEMO_ROSTER) cache.roster[await studentKey(a, n)] = { sid: s };
        save(cache);
      }
      return cache;
    }
    const save = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
    let me = null;
    try { me = JSON.parse(sessionStorage.getItem(ME)); } catch {}
    const setMe = (v) => { me = v; try { v ? sessionStorage.setItem(ME, JSON.stringify(v)) : sessionStorage.removeItem(ME); } catch {} };
    const open = (d, c) => { const p = d.programs[c.programId]; return p && phase(p) === "open"; };
    return {
      demoRoster: DEMO_ROSTER,
      async listPrograms(year) { const d = await load(); return Object.values(d.programs).filter((p) => p.year === year).sort((a, b) => b.openAt - a.openAt); },
      async saveProgram(p) { const d = await load(); const id = p.id || uid(); d.programs[id] = { ...p, id }; save(d); return id; },
      async deleteProgram(id) {
        const d = await load(); delete d.programs[id];
        for (const [k, c] of Object.entries(d.courses)) if (c.programId === id) delete d.courses[k];
        for (const [k, e] of Object.entries(d.enroll)) if (e.programId === id) delete d.enroll[k];
        save(d);
      },
      async listCourses(programId) { const d = await load(); return Object.values(d.courses).filter((c) => c.programId === programId); },
      async saveCourse(c) {
        const d = await load(); const id = c.id || uid(); const old = d.courses[id] || { last: 0, q: [] };
        d.courses[id] = { ...c, id, last: old.last, q: old.q }; save(d); return id;
      },
      async deleteCourse(id) {
        const d = await load(); delete d.courses[id];
        for (const [k, e] of Object.entries(d.enroll)) if (e.courseId === id) delete d.enroll[k];
        save(d);
      },
      async listEnroll(programId) { const d = await load(); return Object.values(d.enroll).filter((e) => e.programId === programId); },
      async adminCancel(e) {
        const d = await load(); const c = d.courses[e.courseId];
        if (c) c.q = c.q.filter((x) => x !== e.pos);
        delete d.enroll[e.id]; save(d);
      },
      async setAttend(ids, on) { const d = await load(); ids.forEach((id) => d.enroll[id] && (d.enroll[id].attend = on)); save(d); },
      async markHours(courseId, info) { const d = await load(); d.courses[courseId].hoursDone = info; save(d); },
      // 명단
      async replaceRoster(list) { const d = await load(); d.roster = Object.fromEntries(list.map((r) => [r.key, { sid: r.sid }])); save(d); },
      async addRoster(key, sid) { const d = await load(); d.roster[key] = { sid }; save(d); },
      async rosterCount() { return Object.keys((await load()).roster).length; },
      async hasRoster(key) { return !!(await load()).roster[key]; },
      async resetPin(key) { const d = await load(); delete d.users[key]; save(d); },
      // 학생 로그인
      async login(acct, name, pin, confirmPin) {
        const d = await load(); const key = await studentKey(acct, name);
        const r = d.roster[key];
        if (!r) fail("학교 명단에서 찾을 수 없습니다. 구글 계정 아이디와 이름을 다시 확인하세요.");
        const u = d.users[key];
        if (u) { if (u.pw !== loginPw(key, pin)) fail("PIN이 맞지 않습니다. 잊었다면 과학정보부에 PIN 초기화를 요청하세요."); }
        else {
          if (confirmPin == null) return { needConfirm: true };
          if (confirmPin !== pin) fail("PIN 확인이 서로 다릅니다. 다시 입력하세요.");
          d.users[key] = { pw: loginPw(key, pin) }; save(d);
        }
        setMe({ key, sid: r.sid, name: normName(name) });
        return { ok: true };
      },
      async logout() { setMe(null); },
      async current() { return me; },
      async myEnroll(programId) { const d = await load(); return me ? Object.values(d.enroll).filter((e) => e.key === me.key && e.programId === programId) : []; },
      async enroll(courseId) {
        const d = await load(); const c = d.courses[courseId];
        if (!me) fail("먼저 로그인하세요.");
        if (!open(d, c)) fail("지금은 신청 기간이 아닙니다.");
        const id = `${c.programId}_${c.slot}_${me.key}`;
        if (d.enroll[id]) fail("같은 시간에 이미 신청한 강좌가 있습니다.");
        if (c.q.length >= c.cap + c.wait) fail("정원과 예비 인원이 모두 찼습니다.");
        const pos = (c.last || 0) + 1; c.last = pos; c.q = [...c.q, pos];
        d.enroll[id] = { id, programId: c.programId, courseId, slot: c.slot, key: me.key, sid: me.sid, name: me.name, pos, at: Date.now(), year: c.year };
        save(d);
      },
      async cancel(e) {
        const d = await load(); const c = d.courses[e.courseId];
        if (!open(d, c)) fail("신청 기간이 끝나 취소할 수 없습니다. 과학정보부에 문의하세요.");
        c.q = c.q.filter((x) => x !== e.pos); delete d.enroll[e.id]; save(d);
      }
    };
  }

  function firebaseStore() {
    const db = firebase.firestore(), auth = firebase.auth();
    const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
    const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);
    const rows = (snap) => snap.docs.map((x) => ({ id: x.id, ...x.data() }));
    const progOut = (p) => ({ ...p, openAt: ms(p.openAt), closeAt: ms(p.closeAt) });
    const enrOut = (e) => ({ ...e, at: ms(e.at) });
    async function chunked(items, fn) {
      for (let i = 0; i < items.length; i += 400) { const b = db.batch(); items.slice(i, i + 400).forEach((x) => fn(b, x)); await b.commit(); }
    }
    // 신청이 몰릴 때 충돌하면 잠깐 쉬었다 다시 시도
    async function retry(fn) {
      for (let i = 0; ; i++) {
        try { return await fn(); }
        catch (e) {
          if (e.userMsg || i >= 8 || !/aborted|failed-precondition|unavailable|deadline/.test(e.code || "")) {
            if (e.code === "permission-denied") fail("신청할 수 없습니다. 신청 시간·대상 학년을 확인하거나 새로고침 후 다시 시도하세요.");
            throw e;
          }
          await new Promise((r) => setTimeout(r, 200 + Math.random() * 600 * (i + 1)));
        }
      }
    }
    let me = null;
    const ready = new Promise((ok) => {
      auth.onAuthStateChanged(async (u) => {
        me = null;
        if (u && (u.email || "").endsWith("@" + STU_DOMAIN)) {
          const s = await db.collection("students").doc(u.uid).get().catch(() => null);
          if (s && s.exists) me = { uid: u.uid, ...s.data() };
        }
        ok();
      });
    });
    return {
      async listPrograms(year) { return rows(await db.collection("programs").where("year", "==", year).get()).map(progOut).sort((a, b) => b.openAt - a.openAt); },
      async saveProgram(p) {
        const { id, ...v } = p; const data = { ...v, openAt: TS.fromMillis(v.openAt), closeAt: TS.fromMillis(v.closeAt) };
        if (id) { await db.collection("programs").doc(id).set(data); return id; }
        return (await db.collection("programs").add(data)).id;
      },
      async deleteProgram(id) {
        const cs = await db.collection("courses").where("programId", "==", id).get();
        const es = await db.collection("enroll").where("programId", "==", id).get();
        await chunked([...es.docs, ...cs.docs], (b, x) => b.delete(x.ref));
        await db.collection("programs").doc(id).delete();
      },
      async listCourses(programId) { return rows(await db.collection("courses").where("programId", "==", programId).get()); },
      async saveCourse(c) {
        const { id, last, q, ...v } = c;
        if (id) { await db.collection("courses").doc(id).set(v, { merge: true }); return id; }
        return (await db.collection("courses").add({ ...v, last: 0, q: [] })).id;
      },
      async deleteCourse(id) {
        const es = await db.collection("enroll").where("courseId", "==", id).get();
        await chunked(es.docs, (b, x) => b.delete(x.ref));
        await db.collection("courses").doc(id).delete();
      },
      async listEnroll(programId) { return rows(await db.collection("enroll").where("programId", "==", programId).get()).map(enrOut); },
      async adminCancel(e) {
        await db.runTransaction(async (t) => {
          const cRef = db.collection("courses").doc(e.courseId), c = await t.get(cRef);
          if (c.exists) t.update(cRef, { q: (c.data().q || []).filter((x) => x !== e.pos) });
          t.delete(db.collection("enroll").doc(e.id));
        });
      },
      async setAttend(ids, on) { await chunked(ids, (b, id) => b.update(db.collection("enroll").doc(id), { attend: on })); },
      async markHours(courseId, info) { await db.collection("courses").doc(courseId).update({ hoursDone: info }); },
      async replaceRoster(list) {
        const old = await db.collection("roster").get();
        const keep = new Set(list.map((r) => r.key));
        await chunked(old.docs.filter((x) => !keep.has(x.id)), (b, x) => b.delete(x.ref));
        await chunked(list, (b, r) => b.set(db.collection("roster").doc(r.key), { sid: r.sid }));
      },
      async addRoster(key, sid) { await db.collection("roster").doc(key).set({ sid }); },
      async rosterCount() { return (await db.collection("roster").get()).size; },
      async hasRoster(key) { return (await db.collection("roster").doc(key).get()).exists; },
      async resetPin(key) {
        const ref = db.collection("resets").doc(key), r = await ref.get();
        const st = await db.collection("students").where("key", "==", key).get();
        const b = db.batch();
        b.set(ref, { n: ((r.exists && r.data().n) || 0) + 1 });
        st.docs.forEach((x) => b.delete(x.ref));
        await b.commit();
      },
      async login(acct, name, pin, confirmPin) {
        const key = await studentKey(acct, name);
        const r = await db.collection("roster").doc(key).get();
        if (!r.exists) fail("학교 명단에서 찾을 수 없습니다. 구글 계정 아이디와 이름을 다시 확인하세요.");
        const rs = await db.collection("resets").doc(key).get();
        const email = `${key}.${(rs.exists && rs.data().n) || 0}@${STU_DOMAIN}`, pw = loginPw(key, pin);
        try { await auth.signInWithEmailAndPassword(email, pw); }
        catch (e) {
          if (e.code === "auth/too-many-requests") fail("PIN을 여러 번 틀려 잠시 막혔습니다. 몇 분 뒤 다시 시도하세요.");
          if (!/user-not-found|invalid-credential|wrong-password|invalid-login/.test(e.code || "")) throw e;
          if (confirmPin == null) return { needConfirm: true }; // 처음 로그인이거나 PIN이 틀림
          if (confirmPin !== pin) fail("PIN 확인이 서로 다릅니다. 다시 입력하세요.");
          try { await auth.createUserWithEmailAndPassword(email, pw); }
          catch (e2) {
            if (e2.code === "auth/email-already-in-use") fail("이미 PIN을 정한 계정입니다. PIN이 맞지 않습니다. 잊었다면 과학정보부에 PIN 초기화를 요청하세요.");
            throw e2;
          }
        }
        const u = auth.currentUser, data = { key, sid: r.data().sid, name: normName(name), at: FV.serverTimestamp() };
        await db.collection("students").doc(u.uid).set(data);
        me = { uid: u.uid, ...data };
        return { ok: true };
      },
      async logout() { me = null; await auth.signOut(); },
      async current() { await ready; return me; },
      async myEnroll(programId) {
        if (!me) return [];
        return rows(await db.collection("enroll").where("key", "==", me.key).where("programId", "==", programId).get()).map(enrOut);
      },
      async enroll(courseId) {
        if (!me) fail("먼저 로그인하세요.");
        await retry(() => db.runTransaction(async (t) => {
          const cRef = db.collection("courses").doc(courseId), cs = await t.get(cRef);
          if (!cs.exists) fail("강좌를 찾을 수 없습니다.");
          const c = cs.data();
          const eRef = db.collection("enroll").doc(`${c.programId}_${c.slot}_${me.key}`);
          if ((await t.get(eRef)).exists) fail("같은 시간에 이미 신청한 강좌가 있습니다.");
          const q = c.q || [];
          if (q.length >= c.cap + c.wait) fail("정원과 예비 인원이 모두 찼습니다.");
          const pos = (c.last || 0) + 1;
          t.update(cRef, { last: pos, q: [...q, pos] });
          t.set(eRef, { programId: c.programId, courseId, slot: c.slot, key: me.key, sid: me.sid, name: me.name, pos, at: FV.serverTimestamp(), year: c.year });
        }));
      },
      async cancel(e) {
        await retry(() => db.runTransaction(async (t) => {
          const cRef = db.collection("courses").doc(e.courseId), cs = await t.get(cRef);
          const eRef = db.collection("enroll").doc(e.id), es = await t.get(eRef);
          if (!es.exists) return;
          t.update(cRef, { q: (cs.data().q || []).filter((x) => x !== es.data().pos) });
          t.delete(eRef);
        }));
      }
    };
  }

  let CS = null;
  const store = () => (CS ||= window.Store.isDemo ? demoStore() : firebaseStore());

  // =====================================================================
  //  학생 화면 (#/course)
  // =====================================================================
  let timer = null;
  async function studentView(view) {
    clearInterval(timer);
    const me = await store().current();
    if (!me) return loginView(view);
    // 신청 중 → 곧 열림 → 최근 마감(2주 안) 순서
    const order = { open: 0, before: 1, closed: 2 };
    const programs = (await store().listPrograms(window.schoolYear())).filter((p) => p.closeAt > Date.now() - 14 * 864e5)
      .sort((a, b) => order[phase(a)] - order[phase(b)] || a.openAt - b.openAt);
    const grade = me.sid[0];
    view.innerHTML = `
      <div class="actions" style="justify-content:space-between"><h1>수강신청</h1>
        <div class="actions"><span><b>${esc(me.sid)}</b> ${esc(me.name)}</span><button class="btn ghost sm" id="csOut">로그아웃</button></div></div>
      <p class="lead">강좌를 <b>담으면 바로 신청</b>됩니다. 신청한 순서대로 정원까지 <b>확정</b>, 그 뒤는 <b>예비</b>이며 확정자가 취소하면 예비가 차례로 올라갑니다. 신청 기간 안에는 언제든 취소·변경할 수 있습니다.</p>
      ${programs.length ? programs.map((p) => `<section class="card" data-prog="${esc(p.id)}"><p class="muted">불러오는 중…</p></section>`).join("")
        : '<div class="card"><p class="muted">지금 신청할 수 있는 행사가 없습니다.</p></div>'}`;
    $("#csOut").onclick = async () => { await store().logout(); studentView(view); };
    const drawAll = async () => {
      for (const p of programs) {
        const box = view.querySelector(`[data-prog="${p.id}"]`);
        if (box) await drawProgram(box, p, me, grade, drawAll).catch((e) => { console.error(e); box.innerHTML = `<p class="error">${esc(e.message)}</p>`; });
      }
    };
    await drawAll();
    // 신청 중이거나 곧 열리는 행사가 있으면 1분마다 잔여석 새로고침 (화면이 보일 때만)
    if (programs.some((p) => phase(p) !== "closed")) {
      timer = setInterval(() => {
        if (!document.body.contains(view.querySelector("[data-prog]"))) return clearInterval(timer);
        if (!document.hidden) drawAll();
      }, 60000);
    }
  }

  async function drawProgram(box, p, me, grade, redraw) {
    const [courses, mine] = await Promise.all([store().listCourses(p.id), store().myEnroll(p.id)]);
    const ph = phase(p), canGrade = (p.grades || "123").includes(grade);
    const bySlot = {};
    courses.sort((a, b) => (a.date + a.period + a.code).localeCompare(b.date + b.period + b.code)).forEach((c) => (bySlot[c.slot] ||= []).push(c));
    const mineBySlot = Object.fromEntries(mine.map((e) => [e.slot, e]));
    const cById = Object.fromEntries(courses.map((c) => [c.id, c]));
    const myRows = mine.map((e) => ({ e, c: cById[e.courseId] })).filter((x) => x.c).sort((a, b) => a.c.slot.localeCompare(b.c.slot));
    box.innerHTML = `
      <div class="actions" style="justify-content:space-between"><h2 style="margin:0">${esc(p.title)} <span class="badge ${ph === "open" ? "approved" : ph === "before" ? "pending" : "done"}">${PHASE[ph]}</span></h2>
        <button class="btn ghost sm" data-refresh>새로고침</button></div>
      <p class="muted small">신청 기간: ${fmtDT(p.openAt)} ~ ${fmtDT(p.closeAt)} · 대상: ${[...(p.grades || "")].map((g) => g + "학년").join(", ")}${p.note ? `<br>${esc(p.note)}` : ""}</p>
      ${!canGrade ? '<p class="warn">대상 학년이 아니라 신청할 수 없습니다.</p>' : ""}
      ${ph === "before" ? `<p class="warn">⏰ ${fmtDT(p.openAt)}에 신청이 열립니다. 시간이 되면 [새로고침]을 누르세요.</p>` : ""}
      <div class="my-list"><b>내 신청 목록</b> ${myRows.length ? myRows.map(({ e, c }) => { const r = rankOf(c, e.pos);
        return `<span class="chip ${r && r.ok ? "ok" : "wait"}">${esc(dayLabel(c.date))} ${esc(c.period.replace(/\(.*\)/, ""))} · <b>${esc(c.code)}</b> ${rankText(r)}</span>`; }).join("") : '<span class="muted">아직 신청한 강좌가 없습니다.</span>'}</div>
      ${Object.entries(bySlot).map(([slot, list]) => `
        <div class="slot-head">${esc(dayLabel(list[0].date))} ${esc(list[0].period)}</div>
        <div class="course-grid">${list.map((c) => courseCard(c, mineBySlot[slot], ph === "open" && canGrade)).join("")}</div>`).join("")}`;
    box.querySelector("[data-refresh]").onclick = (ev) => busy(ev.target, redraw);
    box.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => busy(b, async () => {
      const c = cById[b.dataset.add], had = mineBySlot[c.slot];
      if (had) {
        const old = cById[had.courseId];
        if (!confirm(`같은 시간에 신청한 '${old.code}'을(를) 취소하고 '${c.code}'을(를) 신청할까요?\n'${old.code}'의 신청 순서는 사라집니다.`)) return;
        await store().cancel(had);
      }
      await store().enroll(c.id);
      await redraw();
    })));
    box.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = () => busy(b, async () => {
      const e = mine.find((x) => x.id === b.dataset.cancel), c = cById[e.courseId];
      if (!confirm(`'${c.code}' 신청을 취소할까요? 다시 신청하면 맨 뒤 순서가 됩니다.`)) return;
      await store().cancel(e);
      await redraw();
    })));
  }

  function courseCard(c, mineInSlot, canAct) {
    const mineHere = mineInSlot && mineInSlot.courseId === c.id ? mineInSlot : null;
    const n = (c.q || []).length, full = n >= c.cap + c.wait;
    const conf = Math.min(n, c.cap), waitN = Math.max(0, n - c.cap);
    const r = mineHere ? rankOf(c, mineHere.pos) : null;
    let act = "";
    if (mineHere) act = `<span class="badge ${r && r.ok ? "approved" : "pending"}">${rankText(r)}</span>${canAct ? ` <button class="btn ghost sm" data-cancel="${esc(mineHere.id)}">취소</button>` : ""}`;
    else if (!canAct) act = "";
    else if (full) act = '<span class="badge rejected">마감</span>';
    else act = `<button class="btn sm" data-add="${esc(c.id)}">${mineInSlot ? "이걸로 바꾸기" : n >= c.cap ? "예비로 담기" : "담기"}</button>`;
    return `<div class="ccard ${mineHere ? "mine" : ""}">
      <div class="actions" style="justify-content:space-between"><b class="ccode">${esc(c.code)}</b>${act}</div>
      <div>${esc(c.title)}</div>
      <div class="muted small">${esc(c.lecturer || "")}${c.place ? " · " + esc(c.place) : ""} · ${c.hours}시간 인정</div>
      <div class="seat"><div style="width:${Math.min(100, Math.round((conf / c.cap) * 100))}%"></div></div>
      <div class="small">신청 <b>${conf}</b> / 정원 ${c.cap}${c.wait ? ` · 예비 ${waitN} / ${c.wait}` : ""}${n < c.cap ? ` · <span class="okc">남은 자리 ${c.cap - n}</span>` : ""}</div>
    </div>`;
  }

  function loginView(view) {
    const saved = (() => { try { return JSON.parse(localStorage.getItem("sci-course-login")) || {}; } catch { return {}; } })();
    view.innerHTML = `
      <h1>수강신청 로그인</h1>
      <p class="lead">심화실험 캠프·이공계 진로특강 등 과학중점 행사 수강신청입니다. <b>학교 구글 계정 아이디</b>와 <b>이름</b>, 그리고 <b>PIN 4자리</b>로 로그인합니다.</p>
      <form class="card" id="csLogin" style="max-width:460px">
        <div class="row"><label>학교 구글 계정 아이디 <span class="muted small">(@${esc(window.SITE.dibut.domain)} 앞부분만 적어도 됨)</span><input name="acct" required autocomplete="off" placeholder="예) 26001 또는 26001@${esc(window.SITE.dibut.domain)}" value="${esc(saved.acct || "")}"></label></div>
        <div class="row"><label>이름<input name="name" required maxlength="20" autocomplete="off" value="${esc(saved.name || "")}"></label></div>
        <div class="row"><label>PIN (숫자 4자리)<input name="pin" type="password" inputmode="numeric" maxlength="4" required autocomplete="off"></label></div>
        <div class="row" id="pinAgain" hidden><label>PIN 한 번 더 (처음 로그인할 때만)<input name="pin2" type="password" inputmode="numeric" maxlength="4" autocomplete="off"></label></div>
        <p class="warn" id="csMsg" hidden></p>
        <label class="inline-check small"><input type="checkbox" name="remember" ${saved.acct ? "checked" : ""}> 이 기기에 아이디·이름 기억하기 (PIN은 기억하지 않음)</label>
        <button class="btn" style="margin-top:10px">로그인</button>
        <p class="muted small" style="margin:10px 0 0">처음 로그인할 때 정한 PIN이 계속 쓰입니다. 구글 비밀번호·디벗 잠금 번호와 다른 숫자로 정하고 친구에게 알려주지 마세요. PIN을 잊으면 과학정보부에서 초기화해 줍니다.</p>
        ${window.Store.isDemo ? `<p class="muted small">데모 계정: ${store().demoRoster.map(([a, n]) => `${a} / ${n}`).join(", ")}</p>` : ""}
      </form>`;
    const f = $("#csLogin");
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      busy(f.querySelector("button"), async () => {
        if (!pinOk(d.pin)) return alert("PIN은 숫자 4자리입니다.");
        const again = !$("#pinAgain").hidden;
        if (again && !pinOk(d.pin2)) return alert("PIN을 한 번 더 숫자 4자리로 입력하세요.");
        const r = await store().login(d.acct, d.name, d.pin, again ? d.pin2 : null);
        if (r.needConfirm) {
          $("#pinAgain").hidden = false;
          $("#csMsg").hidden = false;
          $("#csMsg").textContent = "처음 로그인이면 PIN을 한 번 더 입력해 등록하세요. 이미 PIN을 정했다면 PIN이 틀린 것입니다.";
          f.elements.pin2.focus();
          return;
        }
        try { d.remember ? localStorage.setItem("sci-course-login", JSON.stringify({ acct: d.acct.trim(), name: d.name.trim() })) : localStorage.removeItem("sci-course-login"); } catch {}
        studentView(view);
      });
    };
  }

  // =====================================================================
  //  관리자 화면 (관리자 → 수강신청)
  // =====================================================================
  let sub = "setup", selProg = "";
  async function admin(body, year) {
    const subs = { setup: "행사·강좌 개설", status: "신청 현황·명단", attend: "출석 → 이수시간", roster: "학생 명단·PIN" };
    body.innerHTML = `<div class="tabs subtabs">${Object.entries(subs).map(([k, v]) => `<button data-s="${k}" class="${k === sub ? "on" : ""}">${v}</button>`).join("")}</div><div id="csBody"></div>`;
    body.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { sub = b.dataset.s; admin(body, year); }));
    const el = $("#csBody", body);
    if (sub === "roster") return adminRoster(el);
    const programs = await store().listPrograms(year);
    if (!programs.some((p) => p.id === selProg)) selProg = programs[0] ? programs[0].id : "";
    const again = () => admin(body, year);
    if (sub === "setup") return adminSetup(el, year, programs, again);
    if (!programs.length) { el.innerHTML = '<div class="card"><p class="muted">먼저 \'행사·강좌 개설\'에서 행사를 만드세요.</p></div>'; return; }
    const pick = `<label class="inline-check">행사 <select id="csProg">${programs.map((p) => `<option value="${esc(p.id)}" ${p.id === selProg ? "selected" : ""}>${esc(p.title)} (${PHASE[phase(p)]})</option>`).join("")}</select></label>`;
    el.innerHTML = `<div class="card actions">${pick}</div><div id="csInner"></div>`;
    $("#csProg").onchange = (e) => { selProg = e.target.value; again(); };
    const p = programs.find((x) => x.id === selProg);
    const [courses, enroll] = await Promise.all([store().listCourses(p.id), store().listEnroll(p.id)]);
    courses.sort((a, b) => (a.date + a.period + a.code).localeCompare(b.date + b.period + b.code));
    const inner = $("#csInner");
    if (sub === "status") return adminStatus(inner, p, courses, enroll, again);
    return adminAttend(inner, p, courses, enroll, again);
  }

  // ---------- 행사·강좌 개설 ----------
  function adminSetup(el, year, programs, again) {
    const p = programs.find((x) => x.id === selProg);
    el.innerHTML = `
      <div class="card">
        <div class="actions" style="justify-content:space-between"><h2 style="margin:0">${year}학년도 행사</h2><button class="btn sm" id="pNew">+ 새 행사</button></div>
        <div class="table-wrap"><table><tr><th>행사</th><th>신청 기간</th><th>대상</th><th>상태</th><th></th></tr>
        ${programs.map((x) => `<tr class="${x.id === selProg ? "sel" : ""}"><td><b>${esc(x.title)}</b><br><span class="muted small">${KIND[x.kind] || ""} · 이수시간 활동명: ${esc(x.activity)}</span></td>
          <td class="small">${fmtDT(x.openAt)} ~<br>${fmtDT(x.closeAt)}</td><td>${[...(x.grades || "")].join("·")}학년</td><td>${PHASE[phase(x)]}</td>
          <td class="actions"><button class="btn ghost sm" data-pick="${esc(x.id)}">강좌 보기</button><button class="btn ghost sm" data-pedit="${esc(x.id)}">수정</button><button class="btn ghost sm del-t" data-pdel="${esc(x.id)}">삭제</button></td></tr>`).join("")
          || '<tr><td colspan="5" class="muted">아직 행사가 없습니다. [+ 새 행사]로 만드세요.</td></tr>'}
        </table></div>
        <p class="muted small">추가 신청을 받을 때는 행사를 [수정]해서 신청 기간만 다시 열면 됩니다. 학생의 '내 신청 목록'이 그대로 이어지므로 추가인지 변경인지 헷갈리지 않습니다.</p>
      </div>
      <div id="courseBox"></div>`;
    el.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => { selProg = b.dataset.pick; again(); }));
    $("#pNew").onclick = () => programDialog({ year, kind: "camp", grades: "12" }, again);
    el.querySelectorAll("[data-pedit]").forEach((b) => (b.onclick = () => programDialog(programs.find((x) => x.id === b.dataset.pedit), again)));
    el.querySelectorAll("[data-pdel]").forEach((b) => (b.onclick = async () => {
      const x = programs.find((y) => y.id === b.dataset.pdel);
      if (prompt(`'${x.title}'과 그 강좌·신청 기록을 모두 삭제합니다. 되돌릴 수 없습니다.\n확인하려면 '삭제'를 입력하세요.`) !== "삭제") return;
      await store().deleteProgram(x.id); again();
    }));
    if (p) drawCourses($("#courseBox"), p, again);
  }

  async function programDialog(p, again) {
    const back = document.createElement("div");
    back.className = "sigpad-back";
    const now = Date.now();
    back.innerHTML = `<form class="sigpad dlg" style="max-width:560px"><b>${p.id ? "행사 수정" : "새 행사"}</b><div class="dlg-body">
      <div class="row"><label>종류<select name="kind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === p.kind ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>대상 학년<select name="grades">${["12", "1", "2", "3", "123", "23"].map((g) => `<option value="${g}" ${g === p.grades ? "selected" : ""}>${[...g].join("·")}학년</option>`).join("")}</select></label></div>
      <div class="row"><label>행사 제목 (학생 화면에 보임)<input name="title" required value="${esc(p.title || "")}" placeholder="예) 2026학년도 2학기 심화실험 캠프"></label></div>
      <div class="row"><label>이수시간 활동명<input name="activity" required value="${esc(p.activity || "")}" placeholder="예) 심화실험 캠프 → '심화실험 캠프(물리5)'로 기록"></label></div>
      <div class="row"><label>신청 시작<input type="datetime-local" name="openAt" required value="${toLocalInput(p.openAt || now)}"></label>
        <label>신청 마감<input type="datetime-local" name="closeAt" required value="${toLocalInput(p.closeAt || now + 7 * 864e5)}"></label></div>
      <div class="row"><label>안내 문구 (선택)<input name="note" value="${esc(p.note || "")}" placeholder="예) 불참 시 다음 캠프 신청이 제한될 수 있습니다."></label></div>
      </div><div class="actions" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn ghost sm" data-x>취소</button><button class="btn sm">저장</button></div></form>`;
    document.body.appendChild(back);
    const f = back.querySelector("form");
    f.elements.kind.onchange = () => { if (!f.elements.activity.value) f.elements.activity.value = { camp: "심화실험 캠프", lecture: "이공계진로특강" }[f.elements.kind.value] || ""; };
    if (!p.id) f.elements.kind.onchange();
    back.querySelector("[data-x]").onclick = () => back.remove();
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      const openAt = new Date(d.openAt).getTime(), closeAt = new Date(d.closeAt).getTime();
      if (!(closeAt > openAt)) return alert("마감이 시작보다 늦어야 합니다.");
      busy(f.querySelector("button:last-child"), async () => {
        selProg = await store().saveProgram({ ...(p.id ? { id: p.id } : {}), year: p.year, kind: d.kind, grades: d.grades, title: d.title.trim(), activity: d.activity.trim(), openAt, closeAt, note: d.note.trim() });
        back.remove(); again();
      });
    };
  }

  async function drawCourses(box, p, again) {
    const courses = (await store().listCourses(p.id)).sort((a, b) => (a.date + a.period + a.code).localeCompare(b.date + b.period + b.code));
    box.innerHTML = `
      <div class="card">
        <h2>${esc(p.title)} · 강좌 ${courses.length}개</h2>
        <div class="table-wrap"><table><tr><th>코드</th><th>날짜·교시</th><th>주제</th><th>강사·장소</th><th>정원/예비</th><th>시간</th><th>신청</th><th></th></tr>
        ${courses.map((c) => `<tr><td><b>${esc(c.code)}</b></td><td class="small">${esc(dayLabel(c.date))}<br>${esc(c.period)}</td><td>${esc(c.title)}<br><span class="muted small">이수시간: ${esc(activityOf(p, c))}</span></td>
          <td class="small">${esc(c.lecturer)}<br>${esc(c.place)}</td><td>${c.cap} / ${c.wait}</td><td>${c.hours}</td><td>${(c.q || []).length}</td>
          <td class="actions"><button class="btn ghost sm" data-cedit="${esc(c.id)}">수정</button><button class="btn ghost sm del-t" data-cdel="${esc(c.id)}">삭제</button></td></tr>`).join("")
          || '<tr><td colspan="8" class="muted">강좌가 없습니다. 아래에서 추가하세요.</td></tr>'}
        </table></div>
      </div>
      <form class="card" id="cForm">
        <h2 id="cTitle">강좌 추가</h2><input type="hidden" name="id">
        <div class="row"><label>강좌 코드<input name="code" required placeholder="예) 물리5 / A"></label>
          <label>날짜<input type="date" name="date" required></label>
          <label>교시·시간<input name="period" required placeholder="예) 1교시(08:00~10:30)"></label></div>
        <div class="row"><label>주제<input name="title" required></label></div>
        <div class="row"><label>강사<input name="lecturer" placeholder="예) 김태윤"></label><label>장소<input name="place" placeholder="예) 물리실"></label></div>
        <div class="row"><label>정원<input type="number" name="cap" min="1" value="${p.kind === "lecture" ? 80 : 20}" required></label>
          <label>예비 인원<input type="number" name="wait" min="0" value="10" required></label>
          <label>인정 시간<input type="number" name="hours" step="0.5" min="0.5" value="${p.kind === "lecture" ? 2 : 3}" required></label></div>
        <div class="row"><label>이수시간 활동명 (비우면 자동: ${esc(p.kind === "camp" ? `${p.activity}(코드)` : `${p.activity}코드`)})<input name="activity"></label></div>
        <p class="muted small">같은 날짜·같은 교시(글자 그대로)인 강좌끼리는 학생이 하나만 신청할 수 있습니다. 1교시와 2교시는 따로 신청합니다.</p>
        <div class="actions"><button class="btn">저장</button><button type="button" class="btn ghost" id="cReset">새로 작성</button></div>
      </form>
      <div class="card">
        <h2>강좌 한꺼번에 추가 (엑셀에서 복사·붙여넣기)</h2>
        <p class="muted small">열 순서: <b>강좌코드 · 날짜 · 교시 · 주제 · 강사 · 장소 · 정원 · 예비 · 인정시간</b> (정원·예비·시간을 비우면 위 기본값). 날짜는 2026-10-24 또는 10.24 형식.</p>
        <textarea id="cBulk" rows="5" placeholder="물리5&#9;2026-10-24&#9;1교시(08:00~10:30)&#9;이중 무지개 만들기&#9;김태윤&#9;물리실&#9;20&#9;10&#9;3"></textarea>
        <div class="actions" style="margin-top:8px"><button class="btn" id="cBulkBtn">추가하기</button><span class="muted small" id="cBulkMsg"></span></div>
      </div>`;
    const f = $("#cForm", box), byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    const toCourse = (d) => ({ programId: p.id, year: p.year, code: d.code.trim(), date: d.date, period: d.period.trim(), slot: slotOf(d.date, d.period.trim()),
      title: d.title.trim(), lecturer: (d.lecturer || "").trim(), place: (d.place || "").trim(), cap: +d.cap, wait: +d.wait, hours: +d.hours, activity: (d.activity || "").trim() });
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      busy(f.querySelector("button"), async () => {
        const old = d.id ? byId[d.id] : null, c = toCourse(d);
        if (old && (old.q || []).length && old.slot !== c.slot) return alert("신청자가 있는 강좌는 날짜·교시를 바꿀 수 없습니다. 신청자를 먼저 정리하세요.");
        if (courses.some((x) => x.code === c.code && x.id !== d.id)) return alert("같은 강좌 코드가 이미 있습니다.");
        await store().saveCourse({ ...(old || {}), ...c, id: d.id || undefined });
        drawCourses(box, p, again);
      });
    };
    $("#cReset", box).onclick = () => drawCourses(box, p, again);
    box.querySelectorAll("[data-cedit]").forEach((b) => (b.onclick = () => {
      const c = byId[b.dataset.cedit];
      for (const k of ["id", "code", "date", "period", "title", "lecturer", "place", "cap", "wait", "hours", "activity"]) f.elements[k].value = c[k] ?? "";
      $("#cTitle", box).textContent = `강좌 수정: ${c.code}`;
      f.scrollIntoView({ behavior: "smooth" });
    }));
    box.querySelectorAll("[data-cdel]").forEach((b) => (b.onclick = async () => {
      const c = byId[b.dataset.cdel], n = (c.q || []).length;
      if (!confirm(`'${c.code}' 강좌를 삭제할까요?${n ? `\n신청한 학생 ${n}명의 신청도 함께 지워집니다.` : ""}`)) return;
      await store().deleteCourse(c.id); drawCourses(box, p, again);
    }));
    $("#cBulkBtn", box).onclick = (e) => busy(e.target, async () => {
      const y = String(p.year), list = [], bad = [];
      for (const line of $("#cBulk", box).value.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const c = line.split("\t").map((s) => s.trim());
        let date = c[1] || "";
        const m = date.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})/);
        if (m && !/^\d{4}/.test(date)) { const yy = +m[1] < 3 ? +y + 1 : +y; date = `${yy}-${p2(m[1])}-${p2(m[2])}`; }
        if (!c[0] || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !c[2] || !c[3]) { bad.push(c[0] || line.slice(0, 10)); continue; }
        list.push(toCourse({ code: c[0], date, period: c[2], title: c[3], lecturer: c[4], place: c[5], cap: c[6] || f.elements.cap.value, wait: c[7] || f.elements.wait.value, hours: c[8] || f.elements.hours.value }));
      }
      const dup = list.filter((c) => courses.some((x) => x.code === c.code));
      if (!list.length) return alert("추가할 줄이 없습니다. 열 순서를 확인하세요." + (bad.length ? `\n형식이 맞지 않는 줄: ${bad.join(", ")}` : ""));
      if (!confirm(`강좌 ${list.length - dup.length}개를 추가할까요?${dup.length ? `\n이미 있는 코드 ${dup.map((c) => c.code).join(", ")}는 건너뜁니다.` : ""}${bad.length ? `\n형식이 맞지 않아 건너뛰는 줄: ${bad.join(", ")}` : ""}`)) return;
      for (const c of list) if (!dup.includes(c)) await store().saveCourse(c);
      drawCourses(box, p, again);
    });
  }

  // ---------- 신청 현황·명단 ----------
  function rankedList(c, enroll) {
    const mine = enroll.filter((e) => e.courseId === c.id).sort((a, b) => a.pos - b.pos);
    return mine.map((e) => ({ ...e, r: rankOf(c, e.pos) }));
  }
  function adminStatus(el, p, courses, enroll, again) {
    const total = new Set(enroll.map((e) => e.sid)).size;
    el.innerHTML = `
      <div class="card">
        <div class="actions" style="justify-content:space-between">
          <div><b>${esc(p.title)}</b> · ${PHASE[phase(p)]} · 신청 학생 <b>${total}</b>명 · 신청 <b>${enroll.length}</b>건</div>
          <div class="actions"><button class="btn ghost sm" id="prAtt">출석부 인쇄</button><button class="btn ghost sm" id="prCls">학급별 열람표 인쇄</button><button class="btn ghost sm" id="xlOut">엑셀 내려받기</button></div>
        </div>
        <p class="muted small">순위는 신청한 순서입니다. 확정자를 취소하면 예비 1번이 자동으로 확정됩니다. 정원을 늘리려면 '행사·강좌 개설'에서 강좌를 수정하세요.</p>
      </div>
      ${courses.map((c) => { const list = rankedList(c, enroll); return `
        <details class="card" ${list.length ? "" : ""}>
          <summary><b>${esc(c.code)}</b> ${esc(dayLabel(c.date))} ${esc(c.period)} · ${esc(c.title)} — 확정 ${Math.min(list.length, c.cap)}/${c.cap} · 예비 ${Math.max(0, list.length - c.cap)}/${c.wait}</summary>
          <div class="table-wrap"><table><tr><th>순위</th><th>결과</th><th>학번</th><th>이름</th><th>신청 시각</th><th></th></tr>
          ${list.map((e, i) => `<tr><td>${i + 1}</td><td><span class="badge ${e.r && e.r.ok ? "approved" : "pending"}">${rankText(e.r)}</span></td><td>${esc(e.sid)}</td><td>${esc(e.name)}</td>
            <td class="small">${e.at ? new Date(e.at).toLocaleString("ko-KR") : "-"}</td><td><button class="btn ghost sm del-t" data-ecancel="${esc(e.id)}">신청 취소</button></td></tr>`).join("") || '<tr><td colspan="6" class="muted">신청자 없음</td></tr>'}
          </table></div>
        </details>`; }).join("")}`;
    const byId = Object.fromEntries(enroll.map((e) => [e.id, e]));
    el.querySelectorAll("[data-ecancel]").forEach((b) => (b.onclick = () => {
      const e = byId[b.dataset.ecancel];
      if (!confirm(`${e.sid} ${e.name} 학생의 신청을 취소할까요?`)) return;
      busy(b, async () => { await store().adminCancel(e); again(); });
    }));
    $("#prAtt").onclick = () => printAttendance(p, courses, enroll);
    $("#prCls").onclick = () => printClasses(p, courses, enroll);
    $("#xlOut").onclick = (e) => busy(e.target, () => exportXlsx(p, courses, enroll));
  }

  // 인쇄용 창 (브라우저 인쇄 → PDF로 저장 가능)
  function printWindow(title, pages) {
    const w = window.open("", "_blank");
    if (!w) return alert("팝업이 막혀 있습니다. 주소창 오른쪽에서 팝업을 허용해 주세요.");
    w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
      <style>
        body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;margin:0;color:#111}
        .page{padding:14mm 12mm;page-break-after:always} .page:last-child{page-break-after:auto}
        h1{font-size:20px;text-align:center;margin:0 0 10px} .meta{font-size:13px;margin:0 0 10px;line-height:1.7}
        table{width:100%;border-collapse:collapse;font-size:13px} th,td{border:1px solid #444;padding:5px 6px;text-align:center} th{background:#eee}
        td.l{text-align:left} .w{color:#666} .bar{position:sticky;top:0;background:#fffbe6;padding:8px 12px;border-bottom:1px solid #ddd;font-size:13px}
        @media print{.bar{display:none}.page{padding:8mm 6mm}} @page{size:A4;margin:8mm}
      </style></head><body><div class="bar"><button onclick="print()">인쇄 / PDF로 저장</button> 인쇄 창에서 대상: 'PDF로 저장'을 고르면 PDF 파일이 됩니다.</div>${pages.join("")}</body></html>`);
    w.document.close();
  }
  function printAttendance(p, courses, enroll) {
    const pages = courses.map((c) => {
      const list = rankedList(c, enroll), ok = list.filter((e) => e.r && e.r.ok), wait = list.filter((e) => e.r && !e.r.ok);
      return `<div class="page"><h1>${esc(p.title)} 출석부</h1>
        <div class="meta">수업명: <b>${esc(c.code)}</b> · ${esc(dayLabel(c.date))} ${esc(c.period)}<br>주제: ${esc(c.title)}<br>강사: ${esc(c.lecturer)} · 장소: ${esc(c.place)}<br>※ 출석: ○ &nbsp; 결석: / &nbsp; 지각: △ 로 표시</div>
        <table><tr><th style="width:9%">연번</th><th style="width:16%">학번</th><th style="width:20%">이름</th><th style="width:18%">출석 확인</th><th>비고</th></tr>
        ${ok.map((e, i) => `<tr><td>${i + 1}</td><td>${esc(e.sid)}</td><td>${esc(e.name)}</td><td></td><td></td></tr>`).join("")}
        ${Array.from({ length: Math.max(0, 3) }, () => `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>`).join("")}</table>
        ${wait.length ? `<p class="meta w" style="margin-top:10px">예비: ${wait.map((e) => `${rankText(e.r)} ${esc(e.sid)} ${esc(e.name)}`).join(" · ")}</p>` : ""}</div>`;
    });
    printWindow(`${p.title} 출석부`, pages);
  }
  function printClasses(p, courses, enroll) {
    const slots = [...new Map(courses.map((c) => [c.slot, c])).values()];
    const cById = Object.fromEntries(courses.map((c) => [c.id, c]));
    const bySid = {};
    for (const e of enroll) (bySid[e.sid] ||= { sid: e.sid, name: e.name, by: {} }).by[e.slot] = e;
    const classes = {};
    for (const s of Object.values(bySid)) (classes[s.sid.slice(0, 3)] ||= []).push(s);
    const pages = Object.keys(classes).sort().map((k) => {
      const list = classes[k].sort((a, b) => a.sid.localeCompare(b.sid));
      return `<div class="page"><h1>${esc(p.title)} 신청 결과 (${+k[0]}학년 ${+k.slice(1)}반)</h1>
        <p class="meta">신청한 학생만 표시합니다. 확정된 강좌에만 참석하고, 예비는 자리가 나면 따로 연락합니다.</p>
        <table><tr><th>번호</th><th>학번</th><th>이름</th>${slots.map((s) => `<th>${esc(dayLabel(s.date))}<br>${esc(s.period.replace(/\(.*\)/, ""))}</th>`).join("")}</tr>
        ${list.map((s) => `<tr><td>${+s.sid.slice(3)}</td><td>${esc(s.sid)}</td><td>${esc(s.name)}</td>${slots.map((sl) => { const e = s.by[sl.slot]; if (!e) return "<td></td>"; const c = cById[e.courseId]; const r = rankOf(c, e.pos);
          return `<td>${esc(c.code)}${r && !r.ok ? ` <span class="w">(${rankText(r)})</span>` : ""}</td>`; }).join("")}</tr>`).join("")}</table></div>`;
    });
    if (!pages.length) return alert("신청한 학생이 없습니다.");
    printWindow(`${p.title} 학급별 신청 결과`, pages);
  }
  async function exportXlsx(p, courses, enroll) {
    await window.Forms.loadExcel();
    const wb = new window.ExcelJS.Workbook();
    const ws = wb.addWorksheet("신청 명단");
    ws.addRow(["강좌코드", "날짜", "교시", "주제", "순위", "결과", "학번", "이름", "신청 시각", "출석"]);
    for (const c of courses) rankedList(c, enroll).forEach((e, i) =>
      ws.addRow([c.code, c.date, c.period, c.title, i + 1, rankText(e.r), +e.sid, e.name, e.at ? new Date(e.at).toLocaleString("ko-KR") : "", e.attend === true ? "출석" : e.attend === false ? "결석" : ""]));
    // 기존 '체험활동이수시간_매크로'의 '담당' 탭에 그대로 붙여넣을 수 있는 형식 (확정자, 출석 체크 반영)
    const w2 = wb.addWorksheet("이수시간 매크로용");
    w2.addRow(["연번", "담당교사", "활동명", "기준 시간", "활동일", "학번", "이름", "출석", "인정 시간", "비고"]);
    let n = 0;
    for (const c of courses) for (const e of rankedList(c, enroll).filter((x) => x.r && x.r.ok)) {
      const att = e.attend === false ? 0 : 1;
      w2.addRow([++n, "", activityOf(p, c), c.hours, new Date(c.date + "T00:00"), +e.sid, e.name, att, att * c.hours, e.attend == null ? "출석 미확인" : ""]);
    }
    w2.getColumn(5).numFmt = "yyyy-mm-dd";
    [ws, w2].forEach((s) => { s.getRow(1).font = { bold: true }; s.columns.forEach((col) => (col.width = 14)); });
    ws.getColumn(4).width = 36; w2.getColumn(3).width = 26;
    await window.Forms.saveWorkbook(wb, `${p.title}_신청명단_${window.localDate()}.xlsx`);
  }

  // ---------- 출석 → 이수시간 ----------
  function adminAttend(el, p, courses, enroll, again) {
    const cid = adminAttend.sel && courses.some((c) => c.id === adminAttend.sel) ? adminAttend.sel : (courses[0] || {}).id;
    if (!cid) { el.innerHTML = '<div class="card"><p class="muted">강좌가 없습니다.</p></div>'; return; }
    const c = courses.find((x) => x.id === cid), list = rankedList(c, enroll);
    const ok = list.filter((e) => e.r && e.r.ok), wait = list.filter((e) => e.r && !e.r.ok);
    const done = c.hoursDone, doneSet = new Set((done && done.sids) || []);
    const act = activityOf(p, c);
    const row = (e, def) => `<tr><td><input type="checkbox" data-att="${esc(e.id)}" ${(e.attend ?? def) ? "checked" : ""} ${doneSet.has(e.sid) ? "disabled" : ""}></td>
      <td>${rankText(e.r)}</td><td>${esc(e.sid)}</td><td>${esc(e.name)}</td><td>${doneSet.has(e.sid) ? '<span class="badge approved">이수시간 반영됨</span>' : ""}</td></tr>`;
    el.innerHTML = `
      <div class="card">
        <div class="actions">${courses.map((x) => `<button class="btn ${x.id === cid ? "" : "ghost"} sm" data-cpick="${esc(x.id)}">${esc(x.code)}${x.hoursDone ? " ✓" : ""}</button>`).join("")}</div>
      </div>
      <div class="card">
        <h2>${esc(c.code)} · ${esc(dayLabel(c.date))} ${esc(c.period)} · ${esc(c.title)}</h2>
        <p class="muted small">강사에게 받은 출석부를 보고 <b>결석한 학생의 체크를 해제</b>한 뒤 [출석 저장] → [이수시간 반영]을 누르세요. 체크된 학생에게 <b>'${esc(act)}' ${c.hours}시간</b>(${esc(c.date)})이 이수시간 조회에 바로 들어갑니다. 예비 학생이 대신 참석했다면 그 학생을 체크하세요.</p>
        <div class="table-wrap"><table><tr><th>출석</th><th>결과</th><th>학번</th><th>이름</th><th></th></tr>
          ${ok.map((e) => row(e, true)).join("") || '<tr><td colspan="5" class="muted">확정자 없음</td></tr>'}
          ${wait.length ? `<tr><td colspan="5" class="muted small">예비 (참석한 경우만 체크)</td></tr>${wait.map((e) => row(e, false)).join("")}` : ""}
        </table></div>
        <div class="actions" style="margin-top:10px"><button class="btn ghost" id="attSave">출석 저장</button><button class="btn" id="attHours">이수시간 반영</button>
          <span class="muted small">${done ? `${new Date(done.at).toLocaleString("ko-KR")}에 ${doneSet.size}명 반영함. 이후 추가로 체크한 학생만 더 반영됩니다.` : "아직 이수시간을 반영하지 않았습니다."}</span></div>
      </div>`;
    el.querySelectorAll("[data-cpick]").forEach((b) => (b.onclick = () => { adminAttend.sel = b.dataset.cpick; adminAttend(el, p, courses, enroll, again); }));
    const checked = () => [...el.querySelectorAll("[data-att]")].map((x) => ({ id: x.dataset.att, on: x.checked }));
    const saveAtt = async () => {
      const cs = checked().filter((x) => !el.querySelector(`[data-att="${x.id}"]`).disabled);
      const on = cs.filter((x) => x.on).map((x) => x.id), off = cs.filter((x) => !x.on).map((x) => x.id);
      if (on.length) await store().setAttend(on, true);
      if (off.length) await store().setAttend(off, false);
      for (const x of cs) { const e = enroll.find((y) => y.id === x.id); if (e) e.attend = x.on; }
    };
    $("#attSave").onclick = (e) => busy(e.target, async () => { await saveAtt(); alert("출석을 저장했습니다."); });
    $("#attHours").onclick = (e) => busy(e.target, async () => {
      await saveAtt();
      const byId = Object.fromEntries(list.map((x) => [x.id, x]));
      const sids = checked().filter((x) => x.on).map((x) => byId[x.id].sid).filter((s) => !doneSet.has(s));
      if (!sids.length) return alert(done ? "새로 반영할 학생이 없습니다." : "출석으로 체크된 학생이 없습니다.");
      if (!confirm(`${sids.length}명에게 '${act}' ${c.hours}시간(${c.date})을 이수시간으로 반영할까요?`)) return;
      await window.Store.addHours(sids, { activity: act, date: c.date, hours: c.hours });
      const all = [...doneSet, ...sids];
      await store().markHours(c.id, { at: Date.now(), sids: all });
      c.hoursDone = { at: Date.now(), sids: all };
      alert(`${sids.length}명에게 반영했습니다. 학생은 '이수시간 조회'에서 학번으로 바로 확인할 수 있습니다.`);
      adminAttend(el, p, courses, enroll, again);
    });
  }

  // ---------- 학생 명단·PIN ----------
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
  async function adminRoster(el) {
    const n = await store().rosterCount();
    el.innerHTML = `
      <div class="card help small">학생이 수강신청에 로그인할 때 쓰는 명단입니다. 구글 관리 콘솔의 <b>사용자 다운로드 CSV</b>(학생 조직, 이름·성·이메일 열)를 고르면
        <b>'계정 아이디 + 이름'을 되돌릴 수 없는 해시로 바꾼 값과 학번만</b> 저장합니다. 계정 아이디·이름 자체는 사이트에 저장되지 않습니다.
        학년이 바뀌어 학번이 달라지면(진급 CSV를 올린 뒤) 새로 받은 CSV로 다시 올리세요. 학생이 정한 PIN은 그대로 유지됩니다.</div>
      <div class="card">
        <h2>학생 명단 <span class="muted small">현재 ${n}명</span></h2>
        <label class="btn ghost">구글 사용자 CSV 고르기<input type="file" accept=".csv" hidden id="rsFile"></label>
        <p class="muted small" id="rsMsg">'신입생 계정 CSV'로 만든 일괄 등록 CSV(First Name·Last Name·Email)도 됩니다. 성(Last Name) 칸이 학번 5자리인 줄만 읽습니다.</p>
      </div>
      <form class="card" id="rsAdd">
        <h2>한 명 추가 (시험용 계정·전입생)</h2>
        <p class="muted small">교직원 계정(예: 24t053)으로 직접 시험해 보거나, 명단을 다시 올리기 전에 전입생을 넣을 때 씁니다.
          <b>시험용이면 학번 칸은 비워 두세요</b>(출석부·이수시간용 시험 번호 19999가 자동으로 붙음). 전입생이면 실제 학번을 적으세요. 명단 CSV를 다시 올리면 여기서 추가한 계정은 지워집니다.</p>
        <div class="row"><label>구글 계정 아이디<input name="acct" required autocomplete="off" placeholder="예) 24t053"></label><label>이름<input name="name" required autocomplete="off"></label>
          <label>학번 (전입생만)<input name="sid" inputmode="numeric" maxlength="5" placeholder="시험용은 비워 두기"></label></div>
        <button class="btn">추가</button>
      </form>
      <form class="card" id="rsReset">
        <h2>PIN 초기화</h2>
        <p class="muted small">PIN을 잊었거나, 다른 사람이 먼저 PIN을 정해 버린 경우 초기화합니다. 학생 본인인지 확인한 뒤 진행하세요. 초기화하면 학생이 다음 로그인 때 새 PIN을 정하며, 이미 한 수강신청은 그대로 남습니다.</p>
        <div class="row"><label>구글 계정 아이디<input name="acct" required autocomplete="off" placeholder="예) 26001"></label><label>이름<input name="name" required autocomplete="off"></label></div>
        <button class="btn">PIN 초기화</button>
      </form>`;
    $("#rsFile").onchange = (e) => {
      const file = e.target.files[0]; e.target.value = "";
      if (!file) return;
      busy($("#rsFile").parentElement, async () => {
        const rows = parseCsv(await file.text());
        const head = rows[0].map((h) => h.trim());
        const col = (re) => head.findIndex((h) => re.test(h));
        const iF = col(/^First Name/i), iL = col(/^Last Name/i), iE = col(/^Email( Address)?/i);
        if (iF < 0 || iL < 0 || iE < 0) fail("구글 사용자 CSV가 아닌 것 같습니다 ('First Name', 'Last Name', 'Email Address' 열이 필요).");
        const seen = new Map(), list = [], skip = [];
        for (const r of rows.slice(1)) {
          const sid = String(r[iL] || "").trim(), acct = normAcct(r[iE]), name = normName(r[iF]);
          if (!window.parseSid(sid) || !acct || !name) { skip.push(r[iE]); continue; }
          const key = await studentKey(acct, name);
          if (seen.has(key)) continue;
          seen.set(key, sid); list.push({ key, sid });
        }
        const sids = list.map((x) => x.sid), dupSid = sids.filter((s, i) => sids.indexOf(s) !== i);
        const g = [1, 2, 3].map((x) => sids.filter((s) => s[0] === String(x)).length);
        if (!list.length) fail("학번(성 칸 5자리)이 있는 학생 줄이 없습니다.");
        if (!confirm(`학생 ${list.length}명 (1학년 ${g[0]} · 2학년 ${g[1]} · 3학년 ${g[2]})으로 명단을 바꿀까요?${skip.length ? `\n학번이 없는 ${skip.length}줄(교사 등)은 건너뜁니다.` : ""}${dupSid.length ? `\n⚠ 학번이 겹치는 계정: ${[...new Set(dupSid)].join(", ")}` : ""}\n이 파일에 없는 예전 명단은 지워집니다.`)) return;
        await store().replaceRoster(list);
        alert("명단을 저장했습니다.");
        adminRoster(el);
      });
    };
    $("#rsAdd").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      busy(e.target.querySelector("button"), async () => {
        const test = !d.sid.trim(), p = window.parseSid(test ? "19999" : d.sid.trim());
        if (!p) fail("전입생 학번은 5자리입니다. 시험용이면 비워 두세요.");
        if (!normAcct(d.acct) || !normName(d.name)) fail("계정 아이디와 이름을 입력하세요.");
        await store().addRoster(await studentKey(d.acct, d.name), p.sid);
        alert(`추가했습니다. 수강신청 화면에서 ${normAcct(d.acct)} / ${normName(d.name)} / PIN으로 로그인하면 됩니다.${test ? "\n(시험용이라 신청 명단에는 학번 19999로 보입니다. 1학년 대상 행사에서 시험하세요.)" : ""}`);
        adminRoster(el);
      });
    };
    $("#rsReset").onsubmit = (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      busy(e.target.querySelector("button"), async () => {
        const key = await studentKey(d.acct, d.name);
        if (!(await store().hasRoster(key))) fail("명단에 없는 계정·이름입니다. 철자를 확인하세요.");
        if (!confirm(`${normAcct(d.acct)} (${normName(d.name)}) 학생의 PIN을 초기화할까요?`)) return;
        await store().resetPin(key);
        alert("초기화했습니다. 학생에게 다음 로그인 때 새 PIN을 정하라고 안내하세요.");
        e.target.reset();
      });
    };
  }

  window.Course = { studentView, admin };
})();
