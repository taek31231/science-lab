// ===== 데이터 저장소 =====
// Firebase 설정이 있으면 Firestore + Firebase Auth, 없으면 localStorage(데모)를 사용합니다.
// 주소에 ?demo=1 을 붙이면 실제 데이터를 건드리지 않는 데모 모드로 열립니다(테스트용).
// 화면 코드(app.js)는 아래 Store의 함수만 호출하므로, 저장 방식이 바뀌어도 화면은 그대로입니다.
//
// 학년도: 3월 1일 ~ 다음 해 2월 말일. 모든 기록에 year(학년도)를 붙여 학년도별로 조회·백업·삭제합니다.
//
// 컬렉션 구조
//   labRequests/{자동ID}       실험실 사용 신청 원본 (이름·학번 포함 → 관리자만 읽기)
//   purchaseRequests/{자동ID}  물품 구입 신청 원본 (관리자만 읽기)
//   statusBoard/{신청ID}       팀명으로 조회하는 신청 결과 (이름·학번 없이 팀명·일시·상태만) - 공개
//   events/{ID}                캘린더 일정 (승인된 실험실 사용, 과학행사) - 공개
//   hours/{학년도_학번}        과학·수학 이수시간 (이름 없이 학번만) - 단건 조회만 공개
//   admins/{uid}               관리자 계정 목록 (Firebase 콘솔에서 직접 추가)

(function () {
  const isDemo = !window.FIREBASE_CONFIG.apiKey || /[?&]demo=1/.test(location.search);

  // 학번 5자리: 학년(1) + 반(2) + 번호(2)  예) 20315 = 2학년 3반 15번
  function parseSid(sid) {
    const s = String(sid).trim();
    if (!/^[1-3]\d{4}$/.test(s)) return null;
    return { sid: s, grade: +s[0], cls: +s.slice(1, 3), num: +s.slice(3) };
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const localDate = (d = new Date()) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };

  // 학년도: 3월 1일에 바뀜. "2026-02-15" → 2025, "2026-03-01" → 2026
  function schoolYear(dateStr) {
    const s = dateStr || localDate();
    const y = +s.slice(0, 4), m = +s.slice(5, 7);
    return m >= 3 ? y : y - 1;
  }
  const yearRange = (y) => ({ from: `${y}-03-01`, to: `${y + 1}-03-01` }); // from 이상, to 미만

  function requestToEvent(r) {
    // 캘린더는 공개되므로 학생 이름·학번은 넣지 않습니다.
    const p = (r.purpose || "").trim();
    return {
      type: "lab",
      title: `${r.lab} · ${r.team || (p.length > 18 ? p.slice(0, 18) + "…" : p)}`,
      start: `${r.date}T${r.start}`,
      end: `${r.date}T${r.end}`,
      lab: r.lab,
      status: "scheduled",
      note: p,
      requestId: r.id
    };
  }

  // 팀명 비교용: 띄어쓰기·대소문자 무시
  const teamKey = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const itemsSum = (items) => (items || []).reduce((a, it) => a + (+it.qty || 0) * (+it.price || 0), 0);
  // 공개 조회용 요약 (학생 이름·학번은 넣지 않음)
  function statusEntry(kind, r) {
    const base = { kind, year: r.year, team: r.team || "", teamKey: teamKey(r.team), status: r.status || "pending", adminNote: r.adminNote || "" };
    return kind === "lab"
      ? { ...base, date: r.date || "", start: r.start || "", end: r.end || "", lab: r.lab || "" }
      : { ...base, useDate: r.useDate || "", itemCount: (r.items || []).length, total: itemsSum(r.items) };
  }
  const inRange = (e, range) => !range || (e.start >= range.from && e.start < range.to);
  const byCreatedDesc = (a, b) => b.createdAt - a.createdAt;

  // ---------------- 데모 (localStorage) ----------------
  function demoStore() {
    const K = "sci-demo-v5";
    const load = () => {
      try { return JSON.parse(localStorage.getItem(K)) || seed(); } catch { return seed(); }
    };
    const save = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
    function seed() {
      const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return localDate(x); };
      const y = schoolYear();
      const data = {
        requests: {
          demo1: { id: "demo1", year: schoolYear(d(9)), team: "케미스토리", date: d(9), start: "16:30", end: "18:00", lab: "화학실험실", purpose: "산화환원 적정 실험",
            teacher: "김화학", users: [{ sid: "20315", name: "홍길동" }, { sid: "20316", name: "김철수" }, {}],
            materials: [{ name: "뷰렛", spec: "50mL", qty: "2" }, { name: "삼각플라스크", spec: "250mL", qty: "4" }],
            reagents: [{ name: "과망가니즈산 칼륨" }], plan: { title: "산화환원 적정", period: "8" }, agree: true,
            status: "pending", adminNote: "", createdAt: Date.now() },
          old1: { id: "old1", year: y - 1, team: "지난해 동아리", date: `${y - 1}-10-10`, start: "16:00", end: "17:00", lab: "생명과학실험실", purpose: "지난 학년도 예시",
            teacher: "최생명", users: [{ sid: "10101", name: "예시학생" }], materials: [], reagents: [], plan: {}, agree: true,
            status: "approved", adminNote: "", createdAt: Date.now() - 300 * 864e5 }
        },
        purchases: {
          p1: { id: "p1", year: y, purpose: "드론 제작 및 비행 안정성 탐구", sid: "20101", name: "이영희", useDate: d(14), teacher: "박물리",
            team: "드론탐구반", status: "pending", adminNote: "", createdAt: Date.now(),
            items: [
              { name: "드론 Simonk 펌웨어 ESC 멀티변속기", spec: "40A", qty: "1", price: "14300", site: "11번가" },
              { name: "드론 Simonk 펌웨어 ESC 멀티변속기 배송비", qty: "1", price: "3000" },
              { name: "베어링", spec: "608zz(8mmx22mmx7mm)", qty: "2", price: "670", site: "11번가" },
              { name: "베어링 배송비", qty: "1", price: "2700" },
              { name: "JST 커넥터", spec: "20AWG JST", qty: "1", price: "12700", site: "g마켓" },
              { name: "실리콘전선", spec: "20AWG", qty: "2", price: "1400" },
              { name: "실리콘전선 배송비", qty: "1", price: "3000" },
              { name: "열수축튜브", qty: "1", price: "4800" },
              { name: "열수축튜브 배송비", qty: "1", price: "3000" }
            ] }
        },
        events: {
          e1: { id: "e1", type: "event", title: "천체관측 (목성·토성)", start: `${d(5)}T19:30`, end: `${d(5)}T21:30`,
            status: "scheduled", note: "날씨에 따라 전날 17시까지 공지" },
          e2: { id: "e2", type: "event", title: "과학 탐구 발표대회", start: `${d(10)}T14:00`, end: `${d(10)}T17:00`,
            status: "scheduled", note: "참가 시 이수시간 2시간" },
          e3: { id: "e3", type: "event", title: "과학의 날 행사", start: `${d(-7)}T13:00`, end: `${d(-7)}T16:00`,
            status: "done", note: "" },
          req_old1: { id: "req_old1", type: "lab", title: "생명과학실험실 · 지난해 동아리", start: `${y - 1}-10-10T16:00`, end: `${y - 1}-10-10T17:00`,
            lab: "생명과학실험실", status: "done", note: "", requestId: "old1" }
        },
        hours: {
          [`${y}_20315`]: { year: y, sid: "20315", grade: 2, cls: 3, num: 15, total: 6,
            records: [{ id: "r1", date: d(-30), activity: "과학의 날 행사", hours: 2 }, { id: "r2", date: d(-10), activity: "천체관측", hours: 4 }] },
          [`${y - 1}_10101`]: { year: y - 1, sid: "10101", grade: 1, cls: 1, num: 1, total: 4,
            records: [{ id: "r3", date: `${y - 1}-11-01`, activity: "지난 학년도 행사", hours: 4 }] }
        }
      };
      save(data);
      return data;
    }
    let authed = false;
    try { authed = sessionStorage.getItem("sci-demo-admin") === "1"; } catch {}
    const listeners = [];
    const ofYear = (obj, y) => Object.values(obj).filter((r) => r.year === y);

    const api = {
      isDemo: true,
      async submitRequest(r) {
        const d = load(); const id = uid();
        d.requests[id] = { ...r, id, status: "pending", adminNote: "", createdAt: Date.now() };
        save(d); return id;
      },
      async listRequests(year) { return ofYear(load().requests, year).sort(byCreatedDesc); },
      async decideRequest(id, status, adminNote) {
        const d = load(); const r = d.requests[id]; if (!r) throw new Error("신청을 찾을 수 없습니다");
        r.status = status; r.adminNote = adminNote || "";
        if (status === "approved") d.events["req_" + id] = { id: "req_" + id, ...requestToEvent(r) };
        else delete d.events["req_" + id];
        save(d);
      },
      async submitPurchase(p) {
        const d = load(); const id = uid();
        d.purchases[id] = { ...p, id, status: "pending", adminNote: "", createdAt: Date.now() };
        save(d); return id;
      },
      async listPurchases(year) { return ofYear(load().purchases, year).sort(byCreatedDesc); },
      async decidePurchase(id, status, adminNote) {
        const d = load(); const p = d.purchases[id]; if (!p) throw new Error("신청을 찾을 수 없습니다");
        p.status = status; p.adminNote = adminNote || ""; save(d);
      },
      async deleteRequests(kind, ids) {
        const d = load(); const col = kind === "lab" ? d.requests : d.purchases;
        for (const id of ids) { delete col[id]; delete d.events["req_" + id]; }
        save(d);
      },
      async setTeacherChecked(kind, id, on) {
        const d = load(); const r = (kind === "lab" ? d.requests : d.purchases)[id];
        if (!r) throw new Error("신청을 찾을 수 없습니다");
        r.teacherChecked = !!on; save(d);
      },
      async listStatusByTeam(team) {
        const d = load(), key = teamKey(team);
        return [
          ...Object.values(d.requests).filter((r) => teamKey(r.team) === key).map((r) => ({ id: r.id, createdAt: r.createdAt, ...statusEntry("lab", r) })),
          ...Object.values(d.purchases).filter((r) => teamKey(r.team) === key).map((r) => ({ id: r.id, createdAt: r.createdAt, ...statusEntry("purchase", r) }))
        ].sort(byCreatedDesc);
      },
      async listEvents(range) { return Object.values(load().events).filter((e) => inRange(e, range)); },
      async saveEvent(ev) {
        const d = load(); const id = ev.id || uid();
        d.events[id] = { ...ev, id }; save(d); return id;
      },
      async saveEvents(list) {
        const d = load();
        for (const ev of list) { const id = uid(); d.events[id] = { ...ev, id }; }
        save(d);
      },
      async deleteEvent(id) { const d = load(); delete d.events[id]; save(d); },
      async getHours(sid, year = schoolYear()) { return load().hours[`${year}_${sid}`] || null; },
      async addHours(sids, rec) {
        const d = load(); const y = schoolYear(rec.date);
        for (const s of sids) {
          const p = parseSid(s); if (!p) continue;
          const key = `${y}_${p.sid}`;
          const h = d.hours[key] || { year: y, ...p, total: 0, records: [] };
          h.records.push({ ...rec, id: uid() });
          h.total = +(h.total + rec.hours).toFixed(1);
          d.hours[key] = h;
        }
        save(d);
      },
      async listHours(year) { return ofYear(load().hours, year).sort((a, b) => a.sid.localeCompare(b.sid)); },
      async yearData(y) {
        return { requests: await api.listRequests(y), purchases: await api.listPurchases(y),
          hours: await api.listHours(y), events: await api.listEvents(yearRange(y)) };
      },
      async deleteYear(y) {
        const d = load(), range = yearRange(y);
        let n = 0;
        for (const col of ["requests", "purchases", "hours"]) {
          for (const [k, v] of Object.entries(d[col])) if (v.year === y) { delete d[col][k]; n++; }
        }
        for (const [k, v] of Object.entries(d.events)) if (inRange(v, range)) { delete d.events[k]; n++; }
        save(d); return n;
      },
      async login() { authed = true; try { sessionStorage.setItem("sci-demo-admin", "1"); } catch {} listeners.forEach((f) => f(true)); },
      async logout() { authed = false; try { sessionStorage.removeItem("sci-demo-admin"); } catch {} listeners.forEach((f) => f(false)); },
      onAuth(cb) { listeners.push(cb); cb(authed); }
    };
    return api;
  }

  // ---------------- Firebase ----------------
  function firebaseStore() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const FV = firebase.firestore.FieldValue;
    const withId = (doc) => ({ id: doc.id, ...doc.data() });
    const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);
    const fixTime = (r) => ({ ...r, createdAt: ms(r.createdAt) });
    const ofYear = async (col, y) => (await db.collection(col).where("year", "==", y).get()).docs.map(withId).map(fixTime).sort(byCreatedDesc);
    const eventsQuery = (range) => {
      let q = db.collection("events");
      if (range) q = q.where("start", ">=", range.from).where("start", "<", range.to);
      return q;
    };
    // 학년도 삭제 대상 (관리자만)
    const yearQueries = (y) => {
      const r = yearRange(y);
      return [
        db.collection("labRequests").where("year", "==", y),
        db.collection("purchaseRequests").where("year", "==", y),
        db.collection("statusBoard").where("year", "==", y),
        db.collection("hours").where("year", "==", y),
        db.collection("enroll").where("year", "==", y),
        db.collection("courses").where("year", "==", y),
        db.collection("programs").where("year", "==", y),
        eventsQuery(r)
      ];
    };

    const api = {
      isDemo: false,
      async submitRequest(r) {
        const ref = db.collection("labRequests").doc();
        const b = db.batch();
        b.set(ref, { ...r, status: "pending", adminNote: "", createdAt: FV.serverTimestamp() });
        b.set(db.collection("statusBoard").doc(ref.id), { ...statusEntry("lab", r), status: "pending", adminNote: "", createdAt: FV.serverTimestamp() });
        await b.commit();
        return ref.id;
      },
      async listStatusByTeam(team) {
        const q = await db.collection("statusBoard").where("teamKey", "==", teamKey(team)).get();
        return q.docs.map(withId).map(fixTime).sort(byCreatedDesc);
      },
      async listRequests(year) { return ofYear("labRequests", year); },
      async decideRequest(id, status, adminNote) {
        const ref = db.collection("labRequests").doc(id);
        const snap = await ref.get(); if (!snap.exists) throw new Error("신청을 찾을 수 없습니다");
        const r = withId(snap);
        const b = db.batch();
        b.update(ref, { status, adminNote: adminNote || "", decidedAt: FV.serverTimestamp() });
        b.set(db.collection("statusBoard").doc(id), { ...statusEntry("lab", { ...r, status, adminNote }), createdAt: r.createdAt || FV.serverTimestamp() });
        const evRef = db.collection("events").doc("req_" + id);
        if (status === "approved") b.set(evRef, requestToEvent(r)); else b.delete(evRef);
        await b.commit();
      },
      async submitPurchase(p) {
        const ref = db.collection("purchaseRequests").doc();
        const b = db.batch();
        b.set(ref, { ...p, status: "pending", adminNote: "", createdAt: FV.serverTimestamp() });
        b.set(db.collection("statusBoard").doc(ref.id), { ...statusEntry("purchase", p), status: "pending", adminNote: "", createdAt: FV.serverTimestamp() });
        await b.commit();
        return ref.id;
      },
      async listPurchases(year) { return ofYear("purchaseRequests", year); },
      async decidePurchase(id, status, adminNote) {
        const b = db.batch();
        b.update(db.collection("purchaseRequests").doc(id), { status, adminNote: adminNote || "", decidedAt: FV.serverTimestamp() });
        b.set(db.collection("statusBoard").doc(id), { status, adminNote: adminNote || "" }, { merge: true });
        await b.commit();
      },
      // 신청 삭제: 원본 + 결과 조회 요약 + (혹시 남은) 캘린더 일정
      async deleteRequests(kind, ids) {
        const col = kind === "lab" ? "labRequests" : "purchaseRequests";
        for (let i = 0; i < ids.length; i += 150) {
          const b = db.batch();
          for (const id of ids.slice(i, i + 150)) {
            b.delete(db.collection(col).doc(id));
            b.delete(db.collection("statusBoard").doc(id));
            if (kind === "lab") b.delete(db.collection("events").doc("req_" + id));
          }
          await b.commit();
        }
      },
      // 관리자가 지도교사에게 확인했는지 표시 (관리자만 수정 가능)
      async setTeacherChecked(kind, id, on) {
        await db.collection(kind === "lab" ? "labRequests" : "purchaseRequests").doc(id).update({ teacherChecked: !!on });
      },
      // range 를 주면 그 기간 일정만 읽습니다 (읽기 횟수 절약)
      async listEvents(range) { return (await eventsQuery(range).get()).docs.map(withId); },
      async saveEvent(ev) {
        const { id, ...data } = ev;
        if (id) { await db.collection("events").doc(id).set(data); return id; }
        const ref = await db.collection("events").add(data); return ref.id;
      },
      async deleteEvent(id) { await db.collection("events").doc(id).delete(); },
      async getHours(sid, year = schoolYear()) {
        const s = await db.collection("hours").doc(`${year}_${sid}`).get();
        return s.exists ? s.data() : null;
      },
      async addHours(sids, rec) {
        const y = schoolYear(rec.date);
        const ok = sids.map(parseSid).filter(Boolean);
        for (let i = 0; i < ok.length; i += 400) { // 한 번에 최대 500건 제한
          const b = db.batch();
          for (const p of ok.slice(i, i + 400)) {
            b.set(db.collection("hours").doc(`${y}_${p.sid}`), {
              year: y, ...p,
              total: FV.increment(rec.hours),
              records: FV.arrayUnion({ ...rec, id: uid() })
            }, { merge: true });
          }
          await b.commit();
        }
      },
      async saveEvents(list) {
        for (let i = 0; i < list.length; i += 400) {
          const b = db.batch();
          for (const ev of list.slice(i, i + 400)) b.set(db.collection("events").doc(), ev);
          await b.commit();
        }
      },
      async listHours(year) {
        const q = await db.collection("hours").where("year", "==", year).get();
        return q.docs.map((d) => d.data()).sort((a, b) => a.sid.localeCompare(b.sid));
      },
      async yearData(y) {
        const [requests, purchases, hours, events] = await Promise.all([
          api.listRequests(y), api.listPurchases(y), api.listHours(y), api.listEvents(yearRange(y))]);
        return { requests, purchases, hours, events };
      },
      async deleteYear(y) {
        let n = 0;
        for (const q of yearQueries(y)) {
          const docs = (await q.get()).docs;
          for (let i = 0; i < docs.length; i += 400) {
            const b = db.batch();
            docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
            await b.commit();
          }
          n += docs.length;
        }
        return n;
      },
      async login(email, pw) {
        const c = await auth.signInWithEmailAndPassword(email, pw);
        const a = await db.collection("admins").doc(c.user.uid).get();
        if (!a.exists) { await auth.signOut(); throw new Error("관리자로 등록되지 않은 계정입니다"); }
      },
      async logout() { await auth.signOut(); },
      onAuth(cb) {
        auth.onAuthStateChanged(async (u) => {
          if (!u) return cb(false);
          const a = await db.collection("admins").doc(u.uid).get().catch(() => null);
          cb(!!(a && a.exists));
        });
      }
    };
    return api;
  }

  window.Store = isDemo ? demoStore() : firebaseStore();
  window.parseSid = parseSid;
  window.schoolYear = schoolYear;
  window.yearRange = yearRange;
  window.localDate = localDate;
})();
