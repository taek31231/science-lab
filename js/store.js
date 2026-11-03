// ===== 데이터 저장소 =====
// Firebase 설정이 있으면 Firestore + Firebase Auth, 없으면 localStorage(데모)를 사용합니다.
// 화면 코드(app.js)는 아래 Store의 함수만 호출하므로, 저장 방식이 바뀌어도 화면은 그대로입니다.
//
// 컬렉션 구조
//   labRequests/{자동ID}  실험실 사용 신청 원본 (이름·학번 포함 → 관리자만 읽기)
//   purchaseRequests/{자동ID}  물품 구입 신청 (관리자만 목록 조회)
//   statusBoard/{신청ID}  팀명으로 조회하는 신청 결과 (이름·학번 없이 팀명·일시·상태만) - 공개
//   events/{ID}           캘린더 일정 (승인된 실험실 사용, 천체관측, 과학행사) - 공개
//   hours/{학번}          과학·수학 이수시간 (이름 없이 학번만) - 학번으로 단건 조회만 가능
//   admins/{uid}          관리자 계정 목록 (Firebase 콘솔에서 직접 추가)

(function () {
  const isDemo = !window.FIREBASE_CONFIG.apiKey;

  // 학번 5자리: 학년(1) + 반(2) + 번호(2)  예) 20315 = 2학년 3반 15번
  function parseSid(sid) {
    const s = String(sid).trim();
    if (!/^[1-3]\d{4}$/.test(s)) return null;
    return { sid: s, grade: +s[0], cls: +s.slice(1, 3), num: +s.slice(3) };
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function requestToEvent(r) {
    // 캘린더는 공개되므로 학생 이름·학번은 넣지 않습니다.
    const p = (r.purpose || "").trim();
    return {
      type: "lab",
      title: `${r.lab} · ${r.team || (p.length > 18 ? p.slice(0, 18) + "…" : p)}`,
      start: `${r.date}T${r.start}`,
      end: `${r.date}T${r.end}`,
      lab: r.lab,
      status: "confirmed",
      note: p,
      requestId: r.id
    };
  }

  // 팀명 비교용: 띄어쓰기·대소문자 무시
  const teamKey = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
  const itemsSum = (items) => (items || []).reduce((a, it) => a + (+it.qty || 0) * (+it.price || 0), 0);
  // 공개 조회용 요약 (학생 이름·학번은 넣지 않음)
  function statusEntry(kind, r) {
    const base = { kind, team: r.team || "", teamKey: teamKey(r.team), status: r.status || "pending", adminNote: r.adminNote || "" };
    return kind === "lab"
      ? { ...base, date: r.date || "", start: r.start || "", end: r.end || "", lab: r.lab || "" }
      : { ...base, useDate: r.useDate || "", itemCount: (r.items || []).length, total: itemsSum(r.items) };
  }

  // ---------------- 데모 (localStorage) ----------------
  function demoStore() {
    const K = "sci-demo-v3";
    const load = () => {
      try { return JSON.parse(localStorage.getItem(K)) || seed(); } catch { return seed(); }
    };
    const save = (d) => localStorage.setItem(K, JSON.stringify(d));
    function seed() {
      const t = new Date();
      const d = (n) => { const x = new Date(t); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
      const data = {
        requests: {
          demo1: { id: "demo1", team: "케미스토리", date: d(9), start: "16:30", end: "18:00", lab: "화학실험실", purpose: "산화환원 적정 실험",
            teacher: "김화학", users: [{ sid: "20315", name: "홍길동" }, { sid: "20316", name: "김철수" }, {}],
            materials: [{ name: "뷰렛", spec: "50mL", qty: "2" }, { name: "삼각플라스크", spec: "250mL", qty: "4" }],
            reagents: [{ name: "과망가니즈산 칼륨" }], plan: { title: "산화환원 적정", period: "8" }, agree: true,
            status: "pending", adminNote: "", createdAt: Date.now() }
        },
        purchases: {
          p1: { id: "p1", purpose: "드론 제작 및 비행 안정성 탐구", sid: "20101", name: "이영희", useDate: d(14), teacher: "박물리",
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
          e1: { id: "e1", type: "astro", title: "11월 천체관측 (목성·토성)", start: `${d(5)}T19:30`, end: `${d(5)}T21:30`,
            status: "scheduled", note: "날씨에 따라 전날 17시까지 확정 공지" },
          e2: { id: "e2", type: "event", title: "과학 탐구 발표대회", start: `${d(10)}T14:00`, end: `${d(10)}T17:00`,
            status: "confirmed", note: "참가 시 이수시간 2시간" }
        },
        hours: {
          "20315": { sid: "20315", grade: 2, cls: 3, num: 15, total: 6,
            records: [{ id: "r1", date: d(-30), activity: "과학의 날 행사", hours: 2 }, { id: "r2", date: d(-10), activity: "천체관측", hours: 4 }] }
        }
      };
      save(data);
      return data;
    }
    let authed = sessionStorage.getItem("sci-demo-admin") === "1";
    const listeners = [];

    return {
      isDemo: true,
      async submitRequest(r) {
        const d = load(); const id = uid();
        d.requests[id] = { ...r, id, status: "pending", adminNote: "", createdAt: Date.now() };
        save(d); return id;
      },
      async getRequest(id) { return load().requests[id] || null; },
      async listRequests() {
        return Object.values(load().requests).sort((a, b) => b.createdAt - a.createdAt);
      },
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
      async getPurchase(id) { return load().purchases[id] || null; },
      async listPurchases() { return Object.values(load().purchases).sort((a, b) => b.createdAt - a.createdAt); },
      async decidePurchase(id, status, adminNote) {
        const d = load(); const p = d.purchases[id]; if (!p) throw new Error("신청을 찾을 수 없습니다");
        p.status = status; p.adminNote = adminNote || ""; save(d);
      },
      async listStatusByTeam(team) {
        const d = load(), key = teamKey(team);
        return [
          ...Object.values(d.requests).filter((r) => teamKey(r.team) === key).map((r) => ({ id: r.id, createdAt: r.createdAt, ...statusEntry("lab", r) })),
          ...Object.values(d.purchases).filter((r) => teamKey(r.team) === key).map((r) => ({ id: r.id, createdAt: r.createdAt, ...statusEntry("purchase", r) }))
        ].sort((a, b) => b.createdAt - a.createdAt);
      },
      async listEvents() { return Object.values(load().events); },
      async saveEvent(ev) {
        const d = load(); const id = ev.id || uid();
        d.events[id] = { ...ev, id }; save(d); return id;
      },
      async deleteEvent(id) { const d = load(); delete d.events[id]; save(d); },
      async getHours(sid) { return load().hours[sid] || null; },
      async addHours(sids, rec) {
        const d = load();
        for (const s of sids) {
          const p = parseSid(s); if (!p) continue;
          const h = d.hours[p.sid] || { ...p, total: 0, records: [] };
          h.records.push({ ...rec, id: uid() });
          h.total = +(h.total + rec.hours).toFixed(1);
          d.hours[p.sid] = h;
        }
        save(d);
      },
      async listHours() { return Object.values(load().hours).sort((a, b) => a.sid.localeCompare(b.sid)); },
      async login() { authed = true; sessionStorage.setItem("sci-demo-admin", "1"); listeners.forEach((f) => f(true)); },
      async logout() { authed = false; sessionStorage.removeItem("sci-demo-admin"); listeners.forEach((f) => f(false)); },
      onAuth(cb) { listeners.push(cb); cb(authed); }
    };
  }

  // ---------------- Firebase ----------------
  function firebaseStore() {
    firebase.initializeApp(window.FIREBASE_CONFIG);
    const db = firebase.firestore();
    const auth = firebase.auth();
    const FV = firebase.firestore.FieldValue;
    const withId = (doc) => ({ id: doc.id, ...doc.data() });
    const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);

    return {
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
        return q.docs.map(withId).map((r) => ({ ...r, createdAt: ms(r.createdAt) })).sort((a, b) => b.createdAt - a.createdAt);
      },
      async getRequest(id) {
        const s = await db.collection("labRequests").doc(id).get();
        return s.exists ? withId(s) : null;
      },
      async listRequests() {
        const q = await db.collection("labRequests").orderBy("createdAt", "desc").limit(300).get();
        return q.docs.map(withId).map((r) => ({ ...r, createdAt: ms(r.createdAt) }));
      },
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
      async getPurchase(id) {
        const s = await db.collection("purchaseRequests").doc(id).get();
        return s.exists ? withId(s) : null;
      },
      async listPurchases() {
        const q = await db.collection("purchaseRequests").orderBy("createdAt", "desc").limit(300).get();
        return q.docs.map(withId).map((r) => ({ ...r, createdAt: ms(r.createdAt) }));
      },
      async decidePurchase(id, status, adminNote) {
        const b = db.batch();
        b.update(db.collection("purchaseRequests").doc(id), { status, adminNote: adminNote || "", decidedAt: FV.serverTimestamp() });
        b.set(db.collection("statusBoard").doc(id), { status, adminNote: adminNote || "" }, { merge: true });
        await b.commit();
      },
      async listEvents() {
        const q = await db.collection("events").get();
        return q.docs.map(withId);
      },
      async saveEvent(ev) {
        const { id, ...data } = ev;
        if (id) { await db.collection("events").doc(id).set(data); return id; }
        const ref = await db.collection("events").add(data); return ref.id;
      },
      async deleteEvent(id) { await db.collection("events").doc(id).delete(); },
      async getHours(sid) {
        const s = await db.collection("hours").doc(sid).get();
        return s.exists ? s.data() : null;
      },
      async addHours(sids, rec) {
        const b = db.batch();
        for (const s of sids) {
          const p = parseSid(s); if (!p) continue;
          b.set(db.collection("hours").doc(p.sid), {
            ...p,
            total: FV.increment(rec.hours),
            records: FV.arrayUnion({ ...rec, id: uid() })
          }, { merge: true });
        }
        await b.commit();
      },
      async listHours() {
        const q = await db.collection("hours").orderBy("sid").get();
        return q.docs.map((d) => d.data());
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
  }

  window.Store = isDemo ? demoStore() : firebaseStore();
  window.parseSid = parseSid;
})();
