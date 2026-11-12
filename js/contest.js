// ===== 과학행사 (발명품·과학토론·과학추론·창의적 문제해결 한마당) =====
// 수강신청의 행사 종류 중 하나. 학생: 수강신청 로그인 → 신청(개인 / 2인 짝 / 무작위 팀) → 선발 결과·팀 확인 → 구글 폼으로 산출물 제출
// 관리자: 선발, 무작위 팀 만들기, 구글 폼 응답으로 제출 확인, 발명품 실물 접수, 명단 인쇄·엑셀, 출석 → 이수시간
//
// 저장 구조
//   programs/{ID}           행사 (kind: invent|debate|reason|solve, team: solo|pair|random, eventDate, hours, formUrl …)
//   entries/{행사ID_학생열쇠}  신청 1건 (학번·이름·상태·짝·팀). 관리자와 본인(짝은 서로)만 읽기
//     status: applied(신청) · selected(선발) · rejected(미선발)
//     role: solo | lead(짝 신청한 대표) | mate(짝)   pair: wait(짝 수락 대기) · ok · no(거절)
//     team: { no, members:[{sid,name}] }  submitted(구글 폼 제출) · received(발명품 실물 접수) · attend(출석)
(function () {
  const C = () => window.Course._;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TEAM = { solo: "개인", pair: "2인 1조 (원하는 친구와)", random: "무작위 팀 (3~4인)" };
  const DEFAULTS = {
    invent: { team: "solo", submitLabel: "발명품 설명 자료", received: true, hours: 4 },
    debate: { team: "pair", submitLabel: "토론 주장 영상", hours: 4 },
    reason: { team: "solo", submitLabel: "", hours: 3 },
    solve: { team: "random", submitLabel: "", hours: 4 }
  };
  const ST = { applied: "신청 완료", selected: "선발", rejected: "미선발" };
  const stBadge = (s) => `<span class="badge ${s === "selected" ? "approved" : s === "rejected" ? "rejected" : "pending"}">${ST[s] || s}</span>`;
  const who = (m) => `${esc(m.sid)} ${esc(m.name)}`;

  // ---------------- 저장소 ----------------
  let ES = null;
  const store = () => (ES ||= window.Store.isDemo ? demoStore() : firebaseStore());

  function demoStore() {
    const K = "sci-contest-demo-v1";
    const load = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
    const save = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
    const me = () => C().store().current();
    const open = (p) => C().phase(p) === "open";
    return {
      async listEntries(pid) { return Object.values(load()).filter((e) => e.programId === pid); },
      async myEntry(pid) { const m = await me(); return m ? load()[`${pid}_${m.key}`] || null : null; },
      async get(id) { return load()[id] || null; },
      async invites(pid) { const m = await me(); return m ? Object.values(load()).filter((e) => e.programId === pid && e.role === "lead" && e.partnerSid === m.sid) : []; },
      async apply(p, v) {
        const m = await me(); if (!m) C().fail("먼저 로그인하세요.");
        if (!open(p)) C().fail("지금은 신청 기간이 아닙니다.");
        const d = load(), id = `${p.id}_${m.key}`;
        if (d[id]) C().fail("이미 신청했습니다.");
        d[id] = { id, programId: p.id, year: p.year, key: m.key, sid: m.sid, name: m.name, at: Date.now(), status: "applied", ...v };
        save(d);
      },
      async accept(p, lead) {
        const m = await me(), d = load(), id = `${p.id}_${m.key}`;
        if (!open(p)) C().fail("신청 기간이 끝났습니다.");
        if (d[id]) C().fail("이미 이 행사에 신청했습니다. 먼저 내 신청을 취소하세요.");
        d[id] = { id, programId: p.id, year: p.year, key: m.key, sid: m.sid, name: m.name, at: Date.now(), status: "applied",
          role: "mate", leader: lead.id, partnerSid: lead.sid, partnerName: lead.name, pair: "ok" };
        d[lead.id].pair = "ok"; save(d);
      },
      async decline(p, lead) { const d = load(); d[lead.id].pair = "no"; save(d); },
      async cancel(p, e) {
        const d = load(); delete d[e.id];
        if (e.role === "mate" && d[e.leader]) d[e.leader].pair = "no";
        save(d);
      },
      async setTitle(e, title) { const d = load(); d[e.id].title = title; save(d); },
      async update(list) { const d = load(); for (const { id, ...v } of list) if (d[id]) Object.assign(d[id], v); save(d); },
      async deleteAll(pid) { const d = load(); for (const k of Object.keys(d)) if (d[k].programId === pid) delete d[k]; save(d); }
    };
  }

  function firebaseStore() {
    const db = firebase.firestore(), FV = firebase.firestore.FieldValue;
    const ms = (t) => (t && t.toMillis ? t.toMillis() : t || 0);
    const rows = (snap) => snap.docs.map((x) => ({ id: x.id, ...x.data(), at: ms(x.data().at) }));
    const col = () => db.collection("entries");
    const me = () => C().store().current();
    const denied = (e) => { if (e.code === "permission-denied") C().fail("처리할 수 없습니다. 신청 기간·대상 학년을 확인하거나 새로고침 후 다시 시도하세요."); throw e; };
    return {
      async listEntries(pid) { return rows(await col().where("programId", "==", pid).get()); },
      async myEntry(pid) { const m = await me(); if (!m) return null; const x = await col().doc(`${pid}_${m.key}`).get(); return x.exists ? { id: x.id, ...x.data(), at: ms(x.data().at) } : null; },
      async get(id) { const x = await col().doc(id).get().catch(() => null); return x && x.exists ? { id: x.id, ...x.data() } : null; },
      async invites(pid) { const m = await me(); return m ? rows(await col().where("programId", "==", pid).where("partnerSid", "==", m.sid).get()).filter((e) => e.role === "lead") : []; },
      async apply(p, v) {
        const m = await me(); if (!m) C().fail("먼저 로그인하세요.");
        const ref = col().doc(`${p.id}_${m.key}`);
        if ((await ref.get()).exists) C().fail("이미 신청했습니다.");
        await ref.set({ programId: p.id, year: p.year, key: m.key, sid: m.sid, name: m.name, at: FV.serverTimestamp(), status: "applied", ...v }).catch(denied);
      },
      async accept(p, lead) {
        const m = await me(), ref = col().doc(`${p.id}_${m.key}`);
        if ((await ref.get()).exists) C().fail("이미 이 행사에 신청했습니다. 먼저 내 신청을 취소하세요.");
        const b = db.batch();
        b.set(ref, { programId: p.id, year: p.year, key: m.key, sid: m.sid, name: m.name, at: FV.serverTimestamp(), status: "applied",
          role: "mate", leader: lead.id, partnerSid: lead.sid, partnerName: lead.name, pair: "ok" });
        b.update(col().doc(lead.id), { pair: "ok" });
        await b.commit().catch(denied);
      },
      async decline(p, lead) { await col().doc(lead.id).update({ pair: "no" }).catch(denied); },
      async cancel(p, e) {
        const b = db.batch();
        b.delete(col().doc(e.id));
        if (e.role === "mate" && (await this.get(e.leader))) b.update(col().doc(e.leader), { pair: "no" });
        await b.commit().catch(denied);
      },
      async setTitle(e, title) { await col().doc(e.id).update({ title }).catch(denied); },
      async update(list) {
        for (let i = 0; i < list.length; i += 400) {
          const b = db.batch();
          list.slice(i, i + 400).forEach(({ id, ...v }) => b.update(col().doc(id), v));
          await b.commit();
        }
      },
      async deleteAll() {} // course.js deleteProgram이 entries까지 지움
    };
  }

  // ---------------- 팀 묶기 ----------------
  // 짝 신청: 대표(lead) + 수락한 짝(mate)이 한 팀. 무작위 팀: 관리자가 배정한 team.no
  function teamsOf(p, entries) {
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    const out = [], used = new Set();
    if (p.team === "pair") {
      for (const e of entries.filter((x) => x.role === "lead").sort((a, b) => a.at - b.at)) {
        const mate = entries.find((x) => x.role === "mate" && x.leader === e.id);
        out.push({ key: e.id, members: mate ? [e, mate] : [e], ok: !!mate, wait: e.pair === "wait" });
        used.add(e.id); if (mate) used.add(mate.id);
      }
      // 대표가 취소한 짝, 짝 없이 개인 신청한 경우
      for (const e of entries.filter((x) => !used.has(x.id)).sort((a, b) => a.at - b.at)) out.push({ key: e.id, members: [e], ok: false, orphan: e.role === "mate" && !byId[e.leader] });
      return out;
    }
    if (p.team === "random") {
      const g = {};
      for (const e of entries) if (e.team && e.team.no) (g[e.team.no] ||= []).push(e);
      for (const [no, ms] of Object.entries(g).sort((a, b) => a[0] - b[0])) { out.push({ key: "t" + no, no: +no, members: ms, ok: true }); ms.forEach((m) => used.add(m.id)); }
      for (const e of entries.filter((x) => !used.has(x.id)).sort((a, b) => a.at - b.at)) out.push({ key: e.id, members: [e], ok: false, unassigned: true });
      return out;
    }
    return entries.slice().sort((a, b) => a.at - b.at).map((e) => ({ key: e.id, members: [e], ok: true }));
  }
  const teamText = (p, e) => {
    if (p.team === "pair") return e.role === "solo" || !e.partnerSid ? ""
      : e.role === "mate" ? `${e.partnerSid} ${e.partnerName} · ${e.sid} ${e.name}` : `${e.sid} ${e.name} · ${e.partnerSid} ${e.partnerName}`; // 대표 · 짝 순서
    if (p.team === "random") return e.team && e.team.no ? `${e.team.no}팀` : "";
    return "";
  };

  // 구글 폼 '사전 입력된 링크'의 표시 글자(학번·이름·팀)를 학생 값으로 바꿈
  function formLink(p, e) {
    if (!/^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//.test(p.formUrl || "")) return "";
    try {
      const u = new URL(p.formUrl);
      const val = { SID: e.sid, 학번: e.sid, NAME: e.name, 이름: e.name, TEAM: teamText(p, e) || e.title || "", 팀: teamText(p, e) || e.title || "" };
      for (const [k, v] of [...u.searchParams]) if (v.trim() in val) u.searchParams.set(k, val[v.trim()]);
      return u.toString();
    } catch { return p.formUrl; }
  }

  // ---------------- 행사 만들기 칸 (course.js 행사 대화상자 안) ----------------
  function dialogFields(p) {
    const d = DEFAULTS[p.kind] || DEFAULTS.invent;
    return `
      <div class="row"><label>팀 구성<select name="c_team">${Object.entries(TEAM).map(([k, v]) => `<option value="${k}" ${(p.team || d.team) === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>대회일<input type="date" name="c_eventDate" value="${esc(p.eventDate || "")}"></label>
        <label>인정 시간<input type="number" name="c_hours" step="0.5" min="0.5" value="${esc(p.hours || d.hours)}"></label></div>
      <div class="row"><label>시간·장소 (선택)<input name="c_place" value="${esc(p.place || "")}" placeholder="예) 14:00~17:00 융합과학실"></label></div>
      <div class="row"><label>산출물 이름 (구글 폼으로 받을 것, 없으면 비움)<input name="c_submitLabel" value="${esc(p.submitLabel ?? d.submitLabel)}" placeholder="예) 토론 주장 영상"></label>
        <label>제출 마감 (선택)<input type="datetime-local" name="c_submitDue" value="${esc(p.submitDue ? C().toLocalInput(p.submitDue) : "")}"></label></div>
      <div class="row"><label>구글 폼 사전 입력 링크 <span class="muted small">(폼 ⋮ → '사전 입력된 링크 가져오기'에서 학번 칸에 <b>학번</b>, 이름 칸에 <b>이름</b>, 팀 칸에 <b>팀</b>이라고 적고 만든 링크)</span>
        <input name="c_formUrl" value="${esc(p.formUrl || "")}" placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry.…=학번…"></label></div>
      <label class="inline-check small"><input type="checkbox" name="c_received" ${(p.received ?? d.received) ? "checked" : ""}> 실물 작품 접수 확인 칸 쓰기 (발명품)</label>
      <label class="inline-check small"><input type="checkbox" name="c_select" ${p.select === false ? "" : "checked"}> 선발 단계 쓰기 (끄면 신청자 모두 참가)</label>`;
  }
  function kindDefaults(f, kind) {
    const d = DEFAULTS[kind];
    f.elements.c_team.value = d.team; f.elements.c_hours.value = d.hours;
    f.elements.c_submitLabel.value = d.submitLabel; f.elements.c_received.checked = !!d.received;
  }
  function readDialog(d) {
    const formUrl = (d.c_formUrl || "").trim();
    if (formUrl && !/^https:\/\/(docs\.google\.com\/forms|forms\.gle)\//.test(formUrl)) return { error: "구글 폼 링크는 https://docs.google.com/forms/… 형식이어야 합니다." };
    if (!(+d.c_hours > 0)) return { error: "인정 시간을 적어 주세요." };
    return { team: d.c_team, eventDate: d.c_eventDate || "", hours: +d.c_hours, place: (d.c_place || "").trim(), submitLabel: (d.c_submitLabel || "").trim(),
      submitDue: d.c_submitDue ? new Date(d.c_submitDue).getTime() : 0, formUrl, received: !!d.c_received, select: !!d.c_select };
  }

  // 대회일을 일정 캘린더에 (course.js와 같은 일정 ID 규칙 → 행사를 지우면 함께 지워짐)
  async function syncCalendar(p) {
    try {
      const pre = C().calPrefix(p.id);
      const existing = (await window.Store.listEvents(window.yearRange(p.year))).filter((e) => String(e.id).startsWith(pre));
      if (p.eventDate) {
        const m = String(p.place || "").match(/(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/);
        const t = (h, mi) => `${String(h).padStart(2, "0")}:${mi}`;
        const old = existing.find((e) => e.id === pre + p.eventDate);
        await window.Store.saveEvent({ id: pre + p.eventDate, type: "event", title: p.title,
          start: m ? `${p.eventDate}T${t(m[1], m[2])}` : p.eventDate, end: m ? `${p.eventDate}T${t(m[3], m[4])}` : "",
          status: old && old.status ? old.status : "scheduled", note: `${p.place ? p.place + " · " : ""}신청은 '수강신청' 메뉴에서` });
      }
      for (const e of existing) if (e.id !== pre + p.eventDate) await window.Store.deleteEvent(e.id);
    } catch (e) { console.warn("캘린더 연동 실패", e); }
  }

  // =====================================================================
  //  학생 화면
  // =====================================================================
  async function drawStudent(box, p, me, grade, redraw) {
    const { phase, PHASE, fmtDT, busy, fail } = C();
    const [mine, invites] = await Promise.all([store().myEntry(p.id), store().invites(p.id)]);
    const ph = phase(p), canGrade = (p.grades || "123").includes(grade), open = ph === "open" && canGrade;
    const leader = mine && mine.role === "mate" ? await store().get(mine.leader) : null;
    const waitInv = invites.filter((x) => x.pair === "wait" && (!mine || mine.id !== x.id));
    const st = mine ? mine.status : "";
    const dueOk = !p.submitDue || Date.now() <= p.submitDue;
    // 2인 1조는 팀이 된 뒤에만 제출 (짝 수락 전·대표 취소 뒤에는 숨김)
    const teamReady = !mine || p.team !== "pair" || (mine.role === "lead" ? mine.pair === "ok" : mine.role === "mate" ? !!leader : true);
    const link = mine && p.submitLabel && st !== "rejected" && teamReady ? formLink(p, mine) : "";
    let myBox = "";
    if (mine) {
      const pairLine = p.team === "pair" ? (mine.role === "lead"
          ? (mine.pair === "ok" ? `짝: <b>${who({ sid: mine.partnerSid, name: mine.partnerName })}</b> ✓` : mine.pair === "no" ? `<span class="warn">짝 ${who({ sid: mine.partnerSid, name: mine.partnerName })} 학생이 거절했습니다. 신청을 취소하고 다른 짝과 다시 신청하세요.</span>` : `짝 <b>${who({ sid: mine.partnerSid, name: mine.partnerName })}</b>의 수락을 기다리는 중 (짝이 로그인해 [수락]을 눌러야 팀이 됩니다)`)
          : mine.role === "mate" ? (leader ? `대표: <b>${who(leader)}</b> ✓` : '<span class="warn">대표 학생이 신청을 취소했습니다. 내 신청도 취소한 뒤 다시 신청하세요.</span>') : "")
        : p.team === "random" ? (mine.team && mine.team.no ? `<b>${mine.team.no}팀</b>: ${mine.team.members.map(who).join(", ")}` : "팀은 신청 마감 뒤 무작위로 배정됩니다.") : "";
      myBox = `<div class="my-list"><b>내 신청</b> ${stBadge(st)} <span class="muted small">${fmtDT(mine.at)}</span>
        ${pairLine ? `<div style="margin-top:6px">${pairLine}</div>` : ""}
        ${mine.title ? `<div class="small">작품·주제: ${esc(mine.title)}</div>` : ""}
        ${p.submitLabel ? `<div style="margin-top:6px">${mine.submitted ? `<span class="badge approved">${esc(p.submitLabel)} 제출 확인됨</span> ` : ""}
          ${link && dueOk ? `<a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener noreferrer">📤 ${esc(p.submitLabel)} 제출 (구글 폼)</a>` : ""}
          ${p.submitDue ? `<span class="muted small">제출 마감 ${fmtDT(p.submitDue)}</span>` : ""}
          ${!p.formUrl ? '<span class="muted small">제출 방법은 담당 선생님이 안내합니다.</span>' : !teamReady ? '<span class="muted small">짝이 수락하면 제출 버튼이 나옵니다.</span>' : ""}</div>` : ""}
        ${p.received ? `<div class="small" style="margin-top:4px">발명품 실물: ${mine.received ? '<b class="ok-t">접수됨</b>' : "아직 접수 전 (담당 선생님께 직접 제출)"}</div>` : ""}
        ${open && st === "applied" ? `<div style="margin-top:8px"><button class="btn ghost sm" data-cancel>신청 취소</button></div>` : ""}</div>`;
    }
    box.innerHTML = `
      <div class="actions" style="justify-content:space-between"><h2 style="margin:0">${esc(p.title)} <span class="badge ${ph === "open" ? "approved" : ph === "before" ? "pending" : "done"}">${PHASE[ph]}</span></h2>
        <button class="btn ghost sm" data-refresh>새로고침</button></div>
      <p class="muted small">${esc(C().KIND[p.kind])} · ${TEAM[p.team] || ""} · 신청 ${fmtDT(p.openAt)} ~ ${fmtDT(p.closeAt)} · 대상 ${[...(p.grades || "")].map((g) => g + "학년").join(", ")}
        ${p.eventDate ? `<br>대회: ${esc(C().dayLabel(p.eventDate))} ${esc(p.place || "")} · 참가하면 이수시간 ${p.hours}시간` : ""}${p.note ? `<br>${esc(p.note)}` : ""}</p>
      ${!canGrade ? '<p class="warn">대상 학년이 아니라 신청할 수 없습니다.</p>' : ""}
      ${ph === "before" ? `<p class="warn">⏰ ${fmtDT(p.openAt)}에 신청이 열립니다.</p>` : ""}
      ${waitInv.map((x) => `<div class="notice" style="display:block"><b>${who(x)}</b> 학생이 2인 1조로 함께 하자고 신청했습니다.
        ${open && !mine ? `<div class="actions" style="margin-top:6px"><button class="btn sm" data-accept="${esc(x.id)}">수락</button><button class="btn ghost sm" data-decline="${esc(x.id)}">거절</button></div>`
          : mine ? '<div class="muted small">이미 이 행사에 신청해서 수락할 수 없습니다.</div>' : ""}</div>`).join("")}
      ${myBox}
      ${!mine && open ? `<form class="contest-apply" data-apply>
        ${p.team === "pair" ? `<p class="small" style="margin:0 0 6px"><b>짝 정보</b> — 신청하면 짝이 자기 계정으로 로그인해 [수락]해야 팀이 됩니다. 짝이 먼저 나에게 신청했다면 위에서 [수락]을 누르세요.</p>
          <div class="row"><label>짝 학번<input name="psid" inputmode="numeric" maxlength="5" required></label><label>짝 이름<input name="pname" required maxlength="20"></label></div>` : ""}
        ${p.kind === "invent" ? `<div class="row"><label>발명품 이름 (선택)<input name="title" maxlength="60"></label></div>` : ""}
        ${p.kind === "debate" ? `<div class="row"><label>팀 이름 (선택)<input name="title" maxlength="60"></label></div>` : ""}
        <button class="btn">${p.team === "pair" ? "짝과 함께 신청" : "신청하기"}</button>
        ${p.team === "random" ? '<span class="muted small"> 신청 마감 뒤 3~4명씩 무작위로 팀이 배정됩니다.</span>' : ""}</form>` : ""}`;
    box.querySelector("[data-refresh]").onclick = (ev) => busy(ev.target, redraw);
    const f = box.querySelector("[data-apply]");
    if (f) f.onsubmit = (ev) => {
      ev.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      busy(f.querySelector("button"), async () => {
        const v = { role: p.team === "pair" ? "lead" : "solo" };
        if (d.title && d.title.trim()) v.title = d.title.trim();
        if (p.team === "pair") {
          const psid = String(d.psid || "").trim(), pname = C().normName(d.pname);
          if (!window.parseSid(psid)) fail("짝의 학번 5자리를 적어 주세요.");
          if (psid === me.sid) fail("자기 자신은 짝이 될 수 없습니다.");
          if (!(p.grades || "123").includes(psid[0])) fail("짝도 대상 학년이어야 합니다.");
          Object.assign(v, { partnerSid: psid, partnerName: pname, pair: "wait" });
        }
        await store().apply(p, v);
        await redraw();
      });
    };
    box.querySelectorAll("[data-accept]").forEach((b) => (b.onclick = () => busy(b, async () => {
      const x = waitInv.find((y) => y.id === b.dataset.accept);
      if (C().normName(x.partnerName) !== C().normName(me.name) && !confirm(`대표가 적은 짝 이름(${x.partnerName})이 내 이름과 다릅니다. 그래도 수락할까요?`)) return;
      await store().accept(p, x); await redraw();
    })));
    box.querySelectorAll("[data-decline]").forEach((b) => (b.onclick = () => busy(b, async () => {
      if (!confirm("거절할까요?")) return;
      await store().decline(p, waitInv.find((y) => y.id === b.dataset.decline)); await redraw();
    })));
    const cb = box.querySelector("[data-cancel]");
    if (cb) cb.onclick = () => busy(cb, async () => {
      if (!confirm(mine.role === "lead" && mine.pair === "ok" ? "신청을 취소할까요? 짝의 신청도 함께 무효가 됩니다(짝도 취소해야 함)." : "신청을 취소할까요?")) return;
      await store().cancel(p, mine); await redraw();
    });
  }

  // =====================================================================
  //  관리자
  // =====================================================================
  // 행사·강좌 개설 → 과학행사 하나를 열었을 때
  function adminSetup(el, p) {
    const { fmtDT } = C();
    el.innerHTML = `<div class="card">
      <h2>과학행사 설정</h2>
      <table style="max-width:640px">
        <tr><th>팀 구성</th><td>${TEAM[p.team] || "-"}</td></tr>
        <tr><th>대회일</th><td>${p.eventDate ? esc(C().dayLabel(p.eventDate)) : "미정"} ${esc(p.place || "")} <span class="muted small">(일정 캘린더에 자동 등록)</span></td></tr>
        <tr><th>이수시간</th><td>'${esc(p.activity)}' ${p.hours}시간</td></tr>
        <tr><th>선발</th><td>${p.select === false ? "선발 없이 신청자 모두 참가" : "관리자가 선발"}</td></tr>
        <tr><th>산출물</th><td>${p.submitLabel ? `${esc(p.submitLabel)} · ${p.formUrl ? `<a href="${esc(formLink(p, { sid: "10101", name: "홍길동", title: "", team: { no: 1 }, partnerSid: "10102", partnerName: "김철수", role: "lead" }))}" target="_blank" rel="noopener noreferrer">구글 폼 미리 열어 보기(예시 학생)</a>` : '<span class="warn">구글 폼 링크 없음</span>'}${p.submitDue ? ` · 마감 ${fmtDT(p.submitDue)}` : ""}` : "없음"}</td></tr>
        ${p.received ? "<tr><th>실물 접수</th><td>발명품 실물 접수 확인 칸 사용</td></tr>" : ""}
      </table>
      <p class="muted small">바꾸려면 위 [행사 수정]을 누르세요. 신청자 관리·선발·팀 배정·제출 확인은 <b>신청 현황·명단</b> 탭, 출석과 이수시간은 <b>출석 → 이수시간</b> 탭에서 합니다.</p>
      <details class="small"><summary>구글 폼 사전 입력 링크 만드는 법</summary>
        <ol style="line-height:1.9;margin:6px 0 0">
          <li>구글 폼에 '학번', '이름'(토론·문제해결은 '팀'도) 단답형 질문과 파일 업로드 질문을 만듭니다. 파일 업로드는 학교 구글 계정 로그인이 필요합니다.</li>
          <li>폼 편집 화면 오른쪽 위 ⋮ → <b>사전 입력된 링크 가져오기</b>.</li>
          <li>학번 칸에 <b>학번</b>, 이름 칸에 <b>이름</b>, 팀 칸에 <b>팀</b>이라고 그대로 적고 [링크 가져오기] → [링크 복사].</li>
          <li>[행사 수정]의 '구글 폼 사전 입력 링크'에 붙여넣으면, 학생마다 자기 학번·이름·팀이 채워진 폼이 열립니다.</li>
          <li>응답은 폼의 [응답] → 스프레드시트 → 파일 → 다운로드 → CSV로 받아 '신청 현황·명단'의 [구글 폼 응답 CSV 올리기]에 넣으면 제출 여부가 표시됩니다.</li>
        </ol></details></div>`;
  }

  // 무작위 팀: 같은 반끼리 덜 모이게 섞어 4명씩, 모자라면 3명 팀
  function randomTeams(list) {
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const n = list.length;
    if (n < 3) return null;
    let T = Math.ceil(n / 4);
    while (T > 1 && n / T < 3) T--;
    const byClass = {};
    for (const e of shuffle(list.slice())) (byClass[e.sid.slice(0, 3)] ||= []).push(e);
    const order = shuffle(Object.values(byClass)).sort((a, b) => b.length - a.length).flat(); // 큰 반부터 돌아가며 나눔
    const teams = Array.from({ length: T }, () => []);
    order.forEach((e, i) => teams[i % T].push(e));
    return shuffle(teams);
  }

  async function adminStatus(el, p, again) {
    const { busy, fmtDT } = C();
    const entries = await store().listEntries(p.id);
    const teams = teamsOf(p, entries);
    const sel = p.select !== false;
    const cnt = (s) => entries.filter((e) => e.status === s).length;
    const subCol = !!p.submitLabel, recCol = !!p.received;
    const flag = (e, k, label) => `<label class="inline-check small"><input type="checkbox" data-flag="${k}" data-id="${esc(e.id)}" ${e[k] ? "checked" : ""}> ${label}</label>`;
    el.innerHTML = `
      <div class="card">
        <div class="actions" style="justify-content:space-between">
          <div><b>${esc(p.title)}</b> · ${esc(C().PHASE[C().phase(p)])} · 신청 <b>${entries.length}</b>명 (${p.team === "pair" ? `팀 ${teams.filter((t) => t.ok).length}개` : p.team === "random" ? `배정된 팀 ${teams.filter((t) => t.ok).length}개` : "개인"})${sel ? ` · 선발 ${cnt("selected")} · 미선발 ${cnt("rejected")}` : ""}</div>
          <div class="actions"><button class="btn ghost sm" id="ctPrint">명단·출석부 인쇄</button><button class="btn ghost sm" id="ctXls">엑셀 내려받기</button></div></div>
        <div class="actions" style="margin-top:8px">
          ${sel ? `<button class="btn ok sm" data-bulk="selected">고른 학생(팀) 선발</button><button class="btn bad sm" data-bulk="rejected">미선발</button><button class="btn ghost sm" data-bulk="applied">선발 결과 되돌리기</button>` : ""}
          ${p.team === "random" ? '<button class="btn sm" id="ctRand">무작위 팀 만들기</button>' : ""}
          ${subCol ? '<label class="btn ghost sm">구글 폼 응답 CSV 올리기<input type="file" accept=".csv" hidden id="ctCsv"></label>' : ""}
        </div>
        <p class="muted small">${sel ? "왼쪽 칸을 체크하고 [선발]·[미선발]을 누르면 학생 화면에 바로 보입니다. 2인 1조는 팀 단위로 바뀝니다. " : ""}
          ${p.team === "random" ? `무작위 팀은 ${sel ? "선발된 학생" : "신청자 모두"}를 같은 반끼리 덜 모이게 섞어 4명씩(남으면 3명) 나눕니다. 팀 번호 칸을 고쳐 [팀 번호 저장]으로 옮길 수도 있습니다.` : ""}</p>
        <div id="ctPreview"></div>
        <div class="table-wrap"><table>
          <tr><th><input type="checkbox" id="ctAll"></th><th>${p.team === "random" ? "팀" : p.team === "pair" ? "팀(대표·짝)" : "학생"}</th><th>상태</th>${subCol ? `<th>${esc(p.submitLabel)}</th>` : ""}${recCol ? "<th>실물 접수</th>" : ""}<th>신청 시각</th><th></th></tr>
          ${teams.map((t) => `<tr data-team="${esc(t.key)}">
            <td><input type="checkbox" data-pick="${esc(t.key)}"></td>
            <td>${p.team === "random" ? `<input type="number" min="1" class="tno" style="width:56px" data-tno value="${t.no || ""}"> ` : ""}
              ${t.members.map((m) => `${who(m)}${m.title ? ` <span class="muted small">(${esc(m.title)})</span>` : ""}`).join("<br>")}
              ${p.team === "pair" && !t.ok ? `<br><span class="warn small">${t.orphan ? "대표가 취소함" : t.wait ? `짝 ${who({ sid: t.members[0].partnerSid, name: t.members[0].partnerName })} 수락 대기` : t.members[0].pair === "no" ? "짝이 거절함" : "짝 없음"}</span>` : ""}
              ${p.team === "random" && t.unassigned ? '<br><span class="muted small">팀 미배정</span>' : ""}</td>
            <td>${t.members.map((m) => stBadge(m.status)).join("<br>")}</td>
            ${subCol ? `<td>${t.members.map((m) => flag(m, "submitted", "제출")).join("<br>")}</td>` : ""}
            ${recCol ? `<td>${t.members.map((m) => flag(m, "received", "접수")).join("<br>")}</td>` : ""}
            <td class="small">${t.members.map((m) => fmtDT(m.at)).join("<br>")}</td>
            <td><button class="btn ghost sm del-t" data-del="${esc(t.key)}">신청 삭제</button></td></tr>`).join("")
            || `<tr><td colspan="7" class="muted">아직 신청자가 없습니다.</td></tr>`}
        </table></div>
        ${p.team === "random" && teams.length ? '<div class="actions" style="margin-top:8px"><button class="btn ghost sm" id="ctTnoSave">팀 번호 저장</button></div>' : ""}
      </div>`;
    const byKey = Object.fromEntries(teams.map((t) => [t.key, t]));
    const picked = () => [...el.querySelectorAll("[data-pick]:checked")].flatMap((c) => byKey[c.dataset.pick].members);
    $("#ctAll").onchange = (e) => el.querySelectorAll("[data-pick]").forEach((c) => (c.checked = e.target.checked));
    el.querySelectorAll("[data-bulk]").forEach((b) => (b.onclick = () => {
      const ms = picked(); if (!ms.length) return alert("왼쪽 칸에서 학생(팀)을 고르세요.");
      busy(b, async () => { await store().update(ms.map((m) => ({ id: m.id, status: b.dataset.bulk }))); again(); });
    }));
    el.querySelectorAll("[data-flag]").forEach((c) => (c.onchange = async () => {
      c.disabled = true;
      try { await store().update([{ id: c.dataset.id, [c.dataset.flag]: c.checked }]); } catch (err) { c.checked = !c.checked; alert("저장하지 못했습니다: " + err.message); }
      c.disabled = false;
    }));
    el.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      const t = byKey[b.dataset.del];
      if (!confirm(`${t.members.map((m) => `${m.sid} ${m.name}`).join(", ")} 신청을 삭제할까요?`)) return;
      busy(b, async () => { for (const m of t.members) await store().cancel(p, m); again(); });
    }));
    const rb = $("#ctRand");
    if (rb) rb.onclick = () => {
      const pool = entries.filter((e) => (sel ? e.status === "selected" : e.status !== "rejected"));
      const draw = () => {
        const ts = randomTeams(pool);
        if (!ts) return alert(sel ? "선발된 학생이 3명 이상이어야 합니다. 먼저 선발하세요." : "신청자가 3명 이상이어야 합니다.");
        $("#ctPreview").innerHTML = `<div class="notice" style="display:block"><b>무작위 팀 미리보기</b> (${pool.length}명 → ${ts.length}팀)
          <div class="team-grid">${ts.map((t, i) => `<div><b>${i + 1}팀</b> (${t.length}명)<br>${t.map(who).join("<br>")}</div>`).join("")}</div>
          <div class="actions" style="margin-top:8px"><button class="btn sm" data-save>이대로 저장</button><button class="btn ghost sm" data-again>다시 섞기</button><button class="btn ghost sm" data-no>닫기</button></div></div>`;
        const pv = $("#ctPreview");
        pv.querySelector("[data-again]").onclick = draw;
        pv.querySelector("[data-no]").onclick = () => (pv.innerHTML = "");
        pv.querySelector("[data-save]").onclick = (ev) => busy(ev.target, async () => {
          if (entries.some((e) => e.team && e.team.no) && !confirm("이미 배정된 팀을 새 팀으로 바꿀까요?")) return;
          const ups = ts.flatMap((t, i) => t.map((e) => ({ id: e.id, team: { no: i + 1, members: t.map((m) => ({ sid: m.sid, name: m.name })) } })));
          const left = entries.filter((e) => !pool.includes(e) && e.team).map((e) => ({ id: e.id, team: null }));
          await store().update([...ups, ...left]); again();
        });
      };
      draw();
    };
    const ts = $("#ctTnoSave");
    if (ts) ts.onclick = () => busy(ts, async () => {
      const no = {};
      el.querySelectorAll("[data-team]").forEach((tr) => { const v = +tr.querySelector("[data-tno]").value; for (const m of byKey[tr.dataset.team].members) no[m.id] = v > 0 ? v : 0; });
      const groups = {};
      for (const e of entries) if (no[e.id]) (groups[no[e.id]] ||= []).push(e);
      await store().update(entries.map((e) => ({ id: e.id, team: no[e.id] ? { no: no[e.id], members: groups[no[e.id]].map((m) => ({ sid: m.sid, name: m.name })) } : null })));
      again();
    });
    const csv = $("#ctCsv");
    if (csv) csv.onchange = async (ev) => {
      const file = ev.target.files[0]; ev.target.value = ""; if (!file) return;
      const rows = parseCsv(await file.text());
      const head = rows[0] || [];
      const iS = head.findIndex((h) => /학번/.test(h));
      if (iS < 0) return alert("응답 CSV 첫 줄에 '학번' 열이 없습니다. 구글 폼에 '학번' 질문이 있어야 합니다.");
      const sids = new Set(rows.slice(1).map((r) => String(r[iS] || "").replace(/\D/g, "")).filter((s) => window.parseSid(s)));
      // 팀 행사는 팀원 중 한 명이 내면 팀 모두 제출로 봄
      const hit = new Set();
      for (const t of teams) if (t.members.some((m) => sids.has(m.sid))) t.members.forEach((m) => hit.add(m.id));
      const ups = entries.filter((e) => hit.has(e.id) && !e.submitted).map((e) => ({ id: e.id, submitted: true }));
      const unknown = [...sids].filter((s) => !entries.some((e) => e.sid === s));
      if (!confirm(`응답 ${rows.length - 1}건 · 학번 ${sids.size}명\n새로 '제출'로 표시: ${ups.length}명${unknown.length ? `\n신청자 명단에 없는 학번: ${unknown.join(", ")}` : ""}\n저장할까요?`)) return;
      await store().update(ups); again();
    };
    $("#ctPrint").onclick = () => printList(p, teams);
    $("#ctXls").onclick = (e) => busy(e.target, () => exportXlsx(p, teams));
  }

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

  // 참가 대상: 선발 단계를 쓰면 선발된 학생, 아니면 미선발이 아닌 신청자 모두
  const participants = (p, teams) => teams.map((t) => ({ ...t, members: t.members.filter((m) => (p.select === false ? m.status !== "rejected" : m.status === "selected")) })).filter((t) => t.members.length);

  function printList(p, teams) {
    const list = participants(p, teams);
    if (!list.length) return alert(p.select === false ? "신청자가 없습니다." : "선발된 학생이 없습니다. 먼저 선발하세요.");
    let n = 0;
    const rows = list.map((t, ti) => t.members.map((m, i) => `<tr>${i === 0 ? `<td rowspan="${t.members.length}">${p.team === "random" ? (t.no ? t.no + "팀" : "-") : p.team === "pair" ? ti + 1 : ""}</td>` : ""}
      <td>${++n}</td><td>${esc(m.sid)}</td><td>${esc(m.name)}</td><td>${esc(m.title || "")}</td><td></td><td></td></tr>`).join("")).join("");
    C().printWindow(`${p.title} 명단`, [`<div class="page"><div class="ttl">${esc(p.title)} 참가자 명단 · 출석부</div>
      <div style="font-size:14px;margin-bottom:8px">${p.eventDate ? esc(C().dayLabel(p.eventDate)) : ""} ${esc(p.place || "")} · ${TEAM[p.team]} · ${n}명</div>
      <table class="att"><colgroup><col style="width:9%"><col style="width:8%"><col style="width:13%"><col style="width:15%"><col style="width:30%"><col style="width:12%"><col style="width:13%"></colgroup>
        <tr><th>${p.team === "solo" ? "" : "팀"}</th><th>연번</th><th>학번</th><th>이름</th><th>작품·주제</th><th>출석</th><th>비고</th></tr>${rows}</table></div>`]);
  }

  async function exportXlsx(p, teams) {
    await window.Forms.loadExcel();
    const wb = new window.ExcelJS.Workbook();
    const ws = wb.addWorksheet("신청 명단");
    ws.addRow(["팀", "학번", "이름", "작품·주제", "상태", p.submitLabel || "산출물", "실물 접수", "출석", "신청 시각"]);
    teams.forEach((t, i) => t.members.forEach((m) => ws.addRow([p.team === "random" ? (t.no ? `${t.no}팀` : "") : p.team === "pair" ? i + 1 : "", +m.sid, m.name, m.title || "", ST[m.status] || m.status,
      m.submitted ? "제출" : "", m.received ? "접수" : "", m.attend === true ? "출석" : m.attend === false ? "결석" : "", m.at ? new Date(m.at).toLocaleString("ko-KR") : ""])));
    // 기존 이수시간 매크로 '담당' 탭 형식
    const w2 = wb.addWorksheet("이수시간 매크로용");
    w2.addRow(["연번", "담당교사", "활동명", "기준 시간", "활동일", "학번", "이름", "출석", "인정 시간", "비고"]);
    let n = 0;
    for (const t of participants(p, teams)) for (const m of t.members) {
      const att = m.attend === false ? 0 : 1;
      w2.addRow([++n, "", p.activity, p.hours, p.eventDate ? new Date(p.eventDate + "T00:00") : "", +m.sid, m.name, att, att * p.hours, m.attend == null ? "출석 미확인" : ""]);
    }
    w2.getColumn(5).numFmt = "yyyy-mm-dd";
    [ws, w2].forEach((s) => { s.getRow(1).font = { bold: true }; s.columns.forEach((col) => (col.width = 14)); });
    await window.Forms.saveWorkbook(wb, `${p.title}_명단_${window.localDate()}.xlsx`);
  }

  async function adminAttend(el, p, again) {
    const { busy } = C();
    const entries = await store().listEntries(p.id);
    const list = participants(p, teamsOf(p, entries));
    const done = p.hoursDone, doneSet = new Set((done && done.sids) || []);
    const date = p.eventDate || window.localDate();
    el.innerHTML = `<div class="card">
      <h2>${esc(p.title)} · 출석 → 이수시간</h2>
      <p class="muted small">${p.select === false ? "신청자" : "선발된 학생"}이 나옵니다. <b>결석한 학생의 체크를 해제</b>하고 [이수시간 반영]을 누르면 체크된 학생에게 <b>'${esc(p.activity)}' ${p.hours}시간</b>(${esc(date)})이 이수시간 조회에 바로 들어갑니다.${p.eventDate ? "" : ' <span class="warn">대회일이 없어 오늘 날짜로 들어갑니다. [행사 수정]에서 대회일을 정하세요.</span>'}</p>
      <div class="table-wrap"><table><tr><th>출석</th><th>${p.team === "solo" ? "" : "팀"}</th><th>학번</th><th>이름</th><th></th></tr>
        ${list.map((t, ti) => t.members.map((m) => `<tr><td><input type="checkbox" data-att="${esc(m.id)}" ${m.attend !== false ? "checked" : ""} ${doneSet.has(m.sid) ? "disabled" : ""}></td>
          <td>${p.team === "random" ? (t.no ? t.no + "팀" : "-") : p.team === "pair" ? ti + 1 : ""}</td><td>${esc(m.sid)}</td><td>${esc(m.name)}</td>
          <td>${doneSet.has(m.sid) ? '<span class="badge approved">이수시간 반영됨</span>' : ""}</td></tr>`).join("")).join("")
          || `<tr><td colspan="5" class="muted">${p.select === false ? "신청자가 없습니다." : "선발된 학생이 없습니다. '신청 현황·명단'에서 선발하세요."}</td></tr>`}
      </table></div>
      <div class="actions" style="margin-top:10px"><button class="btn ghost" id="ctAttSave">출석 저장</button><button class="btn" id="ctHours">이수시간 반영</button>
        <span class="muted small">${done ? `${new Date(done.at).toLocaleString("ko-KR")}에 ${doneSet.size}명 반영함. 이후 추가로 체크한 학생만 더 반영됩니다.` : "아직 이수시간을 반영하지 않았습니다."}</span></div></div>`;
    const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
    const boxes = () => [...el.querySelectorAll("[data-att]")].filter((x) => !x.disabled);
    const saveAtt = async () => { const ups = boxes().map((x) => ({ id: x.dataset.att, attend: x.checked })); if (ups.length) await store().update(ups); };
    $("#ctAttSave").onclick = (e) => busy(e.target, async () => { await saveAtt(); alert("출석을 저장했습니다."); });
    $("#ctHours").onclick = (e) => busy(e.target, async () => {
      await saveAtt();
      const sids = boxes().filter((x) => x.checked).map((x) => byId[x.dataset.att].sid).filter((s) => !doneSet.has(s));
      if (!sids.length) return alert(done ? "새로 반영할 학생이 없습니다." : "출석으로 체크된 학생이 없습니다.");
      if (!confirm(`${sids.length}명에게 '${p.activity}' ${p.hours}시간(${date})을 이수시간으로 반영할까요?`)) return;
      await window.Store.addHours(sids, { activity: p.activity, date, hours: p.hours });
      const info = { at: Date.now(), sids: [...doneSet, ...sids] };
      await C().store().saveProgram({ ...p, hoursDone: info });
      alert(`${sids.length}명에게 반영했습니다.`);
      again();
    });
  }

  window.Contest = { store, drawStudent, adminSetup, adminStatus, adminAttend, dialogFields, kindDefaults, readDialog, syncCalendar, randomTeams, formLink };
})();
