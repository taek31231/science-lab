// ===== 학교 시약 대장 + 요약 MSDS =====
// 학생: 실험실 신청서에서 학교가 가진 시약을 검색 → 요약 MSDS를 끝까지 읽어야 '담기' → 시약·시액 조사서가 자동으로 채워짐
// 과학실 운영: 시약 대장(물질명·요약 MSDS·보관 위치·보유 수량) 관리, 엑셀로 한꺼번에 올리기·내려받기,
//              승인 화면에서 요청 시약의 보관 위치·보유 수량 확인
//
// 저장 구조
//   reagents/{id}      물질명·CAS·요약 MSDS (누구나 읽기, 과학실 운영만 쓰기)
//   reagentStock/{id}  보관 위치·보유 수량 (과학실 운영만)
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const keyOf = (s) => String(s || "").toLowerCase().replace(/[\s·.,\-_()（）\[\]]/g, "");
  async function busy(btn, fn) {
    const t = btn.textContent; btn.disabled = true; btn.textContent = "처리 중…";
    try { await fn(); } catch (e) { console.error(e); alert("문제가 발생했습니다: " + e.message); }
    finally { btn.disabled = false; btn.textContent = t; }
  }

  // 요약 MSDS 항목 (앞쪽 10개 중 조사서 칸과 같은 것은 '담기' 때 조사서에 그대로 들어감)
  const MSDS = [
    ["signal", "신호어"], ["pictos", "그림문자"], ["hazard", "유해·위험 문구"],
    ["eye", "눈에 들어갔을 때"], ["skin", "피부에 접촉했을 때"], ["inhale", "흡입했을 때"], ["swallow", "먹었을 때"],
    ["smell", "냄새"], ["melt", "녹는점"], ["boil", "끓는점"], ["flash", "인화점"],
    ["stability", "안정성 및 반응성"], ["fire", "폭발·화재 시 대처"], ["handling", "취급·보관 주의"]
  ];
  const BASE = [["name", "물질명"], ["aliases", "다른 이름"], ["cas", "CAS 번호"], ["pdf", "MSDS 요약 PDF 주소"]];
  const STOCK = [["location", "보관 위치"], ["qty", "보유 수량"]];
  const PUB_KEYS = [...BASE, ...MSDS].map(([k]) => k);
  // 조사서(신청서) 칸 ← 요약 MSDS
  const TO_SHEET = ["hazard", "eye", "skin", "smell", "melt", "boil", "flash", "stability", "fire"];
  // 엑셀 머리글 → 항목 (띄어쓰기 무시, 앞에서부터 먼저 맞는 것)
  const HEAD = [
    ["name", /^(물질명|시약명|시약|품명|화학물질명|이름)$/], ["aliases", /(다른이름|별칭|영문명|이명|화학식)/], ["cas", /cas/],
    ["pdf", /(pdf|요약정보|msds주소|msds링크|링크|url)/],
    ["location", /(보관|위치|장소)/], ["qty", /(수량|재고|보유)/],
    ["signal", /신호어/], ["pictos", /그림문자|픽토/], ["hazard", /(유해|위험문구|위험성)/],
    ["eye", /눈/], ["skin", /피부/], ["inhale", /흡입/], ["swallow", /(먹었|삼켰|섭취)/],
    ["smell", /냄새|외관/], ["melt", /녹는점|융점/], ["boil", /끓는점|비점/], ["flash", /인화점/],
    ["stability", /안정성|반응성/], ["fire", /화재|폭발|소화/], ["handling", /취급|저장/]
  ];
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, String(o[k] ?? "").trim()]));

  // ---------------- 저장소 ----------------
  let RS = null;
  const store = () => (RS ||= window.Store.isDemo ? demoStore() : firebaseStore());

  function demoStore() {
    const K = "sci-reagents-demo-v1";
    const seed = () => ({
      pub: {
        hcl: { id: "hcl", name: "염산", aliases: "염화수소산, Hydrochloric acid", cas: "7647-01-0", signal: "위험", pictos: "부식성, 감탄부호",
          hazard: "금속을 부식시킬 수 있음\n피부에 심한 화상과 눈 손상을 일으킴\n호흡기 자극을 일으킬 수 있음",
          eye: "즉시 다량의 물로 15분 이상 씻고 의사의 진료를 받는다.", skin: "오염된 옷을 벗고 다량의 물로 씻는다. 화상이 있으면 진료를 받는다.",
          inhale: "신선한 공기가 있는 곳으로 옮기고 편히 쉬게 한다.", swallow: "입을 헹군다. 억지로 토하게 하지 않는다.",
          smell: "자극적인 냄새", melt: "농도에 따라 다름", boil: "농도에 따라 다름", flash: "해당 없음 (불연성)",
          stability: "금속과 반응해 수소 기체 발생. 염기·산화제와 격렬히 반응.", fire: "불연성. 주변 화재에 맞는 소화제 사용. 가열하면 염화수소 기체 발생.",
          handling: "후드 안에서 사용. 산 전용 캐비닛에 보관." },
        naoh: { id: "naoh", name: "수산화 나트륨", aliases: "가성소다, Sodium hydroxide", cas: "1310-73-2", signal: "위험", pictos: "부식성",
          hazard: "금속을 부식시킬 수 있음\n피부에 심한 화상과 눈 손상을 일으킴",
          eye: "즉시 다량의 물로 15분 이상 씻고 의사의 진료를 받는다.", skin: "오염된 옷을 벗고 다량의 물로 씻는다.",
          inhale: "신선한 공기가 있는 곳으로 옮긴다.", swallow: "입을 헹군다. 억지로 토하게 하지 않는다.",
          smell: "냄새 없음 (흰색 고체)", melt: "318 ℃", boil: "1388 ℃", flash: "해당 없음 (불연성)",
          stability: "공기 중 수분·이산화탄소를 흡수함. 물에 녹을 때 열 발생. 산·알루미늄 등 금속과 반응.", fire: "불연성. 주변 화재에 맞는 소화제 사용.",
          handling: "보안경·장갑 착용. 뚜껑을 꼭 닫아 보관." },
        etoh: { id: "etoh", name: "에탄올", aliases: "에틸 알코올, Ethanol", cas: "64-17-5", signal: "위험", pictos: "인화성, 감탄부호",
          hazard: "고인화성 액체 및 증기\n눈에 심한 자극을 일으킴",
          eye: "물로 몇 분간 조심해서 씻는다. 자극이 계속되면 진료를 받는다.", skin: "물로 씻는다.",
          inhale: "신선한 공기가 있는 곳으로 옮긴다.", swallow: "입을 헹구고 진료를 받는다.",
          smell: "특유의 알코올 냄새", melt: "-114 ℃", boil: "78 ℃", flash: "13 ℃",
          stability: "산화제와 격렬히 반응. 증기는 공기와 폭발성 혼합물을 만들 수 있음.", fire: "알코올용 포, 이산화탄소, 분말 소화기 사용. 물 분무로 용기를 식힘.",
          handling: "불꽃·열원에서 멀리. 인화성 물질 캐비닛에 보관." },
        kmno4: { id: "kmno4", name: "과망가니즈산 칼륨", aliases: "과망간산칼륨, Potassium permanganate", cas: "7722-64-7", signal: "위험", pictos: "산화성, 감탄부호, 환경",
          hazard: "화재를 강렬하게 함 (산화제)\n삼키면 유해함\n장기적 영향에 의해 수생생물에 매우 유독함",
          eye: "다량의 물로 15분 이상 씻고 진료를 받는다.", skin: "다량의 물로 씻는다.",
          inhale: "신선한 공기가 있는 곳으로 옮긴다.", swallow: "입을 헹구고 즉시 진료를 받는다.",
          smell: "냄새 없음 (짙은 자주색 결정)", melt: "240 ℃ (분해)", boil: "해당 없음", flash: "해당 없음",
          stability: "가연물·환원제·진한 황산과 격렬히 반응.", fire: "다량의 물 사용. 가연물과 떨어뜨려 둠.",
          handling: "가연물과 따로 보관. 폐액은 하수구에 버리지 않음." }
      },
      stock: { hcl: { location: "준비실 산 캐비닛 1칸", qty: "500mL × 2병" }, naoh: { location: "준비실 염기 선반", qty: "500g × 1통" },
        etoh: { location: "인화성 물질 캐비닛", qty: "1L × 3병" }, kmno4: { location: "준비실 산화제 칸", qty: "100g × 1통" } }
    });
    const load = () => { try { return JSON.parse(localStorage.getItem(K)) || seed(); } catch { return seed(); } };
    const save = (d) => { try { localStorage.setItem(K, JSON.stringify(d)); } catch {} };
    const nid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    return {
      async list() { return Object.values(load().pub); },
      async listStock() { return load().stock; },
      async saveMany(items) {
        const d = load();
        for (const it of items) {
          const id = it.id || nid();
          d.pub[id] = { id, ...pick(it, PUB_KEYS) };
          d.stock[id] = pick(it, ["location", "qty"]);
        }
        save(d);
      },
      async remove(id) { const d = load(); delete d.pub[id]; delete d.stock[id]; save(d); }
    };
  }

  function firebaseStore() {
    const db = firebase.firestore();
    return {
      async list() { return (await db.collection("reagents").get()).docs.map((x) => ({ id: x.id, ...x.data() })); },
      async listStock() { return Object.fromEntries((await db.collection("reagentStock").get()).docs.map((x) => [x.id, x.data()])); },
      async saveMany(items) {
        for (let i = 0; i < items.length; i += 200) {
          const b = db.batch();
          for (const it of items.slice(i, i + 200)) {
            const ref = it.id ? db.collection("reagents").doc(it.id) : db.collection("reagents").doc();
            b.set(ref, pick(it, PUB_KEYS));
            b.set(db.collection("reagentStock").doc(ref.id), pick(it, ["location", "qty"]));
          }
          await b.commit();
        }
      },
      async remove(id) {
        const b = db.batch();
        b.delete(db.collection("reagents").doc(id)); b.delete(db.collection("reagentStock").doc(id));
        await b.commit();
      }
    };
  }

  // 시약 목록은 한 번 불러와 두고 씀 (바꾸면 다시 불러옴)
  let cache = null;
  const list = async (fresh) => (cache && !fresh ? cache : (cache = (await store().list()).sort((a, b) => a.name.localeCompare(b.name, "ko"))));
  const find = (all, name) => { const k = keyOf(name); return k ? all.find((r) => keyOf(r.name) === k || String(r.aliases || "").split(",").some((a) => keyOf(a) === k)) : null; };
  function search(all, q) {
    const k = keyOf(q); if (!k) return [];
    return all.filter((r) => [r.name, r.aliases, r.cas].some((v) => keyOf(v).includes(k))).slice(0, 12);
  }

  // ---------------- 요약 MSDS 창 ----------------
  // opts.take: '담기' 버튼 글자 (있으면 끝까지 읽어야 눌림) → true/false로 끝남
  function showMsds(r, opts = {}) {
    return new Promise((done) => {
      const back = document.createElement("div");
      back.className = "sigpad-back";
      const rows = MSDS.filter(([k]) => r[k]).map(([k, t]) => `<tr><th>${t}</th><td>${esc(r[k])}</td></tr>`).join("");
      back.innerHTML = `
        <div class="sigpad msds-modal" role="dialog" aria-label="${esc(r.name)} 요약 MSDS">
          <div class="actions" style="justify-content:space-between;align-items:flex-start">
            <div><b style="font-size:18px">🧪 ${esc(r.name)}</b> ${r.signal ? `<span class="badge ${r.signal === "위험" ? "rejected" : "pending"}">${esc(r.signal)}</span>` : ""}
              <div class="muted small">${[r.aliases, r.cas && "CAS " + r.cas].filter(Boolean).map(esc).join(" · ")}</div></div>
            <button type="button" class="btn ghost sm" data-x>닫기</button></div>
          <div class="msds-body">${rows ? `<table class="msds-tbl">${rows}</table>` : r.pdf ? "" : '<p class="muted">등록된 요약 MSDS가 없습니다. 안전보건공단 MSDS를 확인하세요.</p>'}
            ${opts.stock ? `<p class="small" style="margin:10px 0 0">📍 <b>보관 위치</b> ${esc(opts.stock.location || "-")} · <b>보유 수량</b> ${esc(opts.stock.qty || "-")}</p>` : ""}
            ${/^https?:\/\//i.test(r.pdf || "") ? `<p style="margin:10px 0 0"><a class="btn sm" data-pdf href="${esc(r.pdf)}" target="_blank" rel="noopener noreferrer">📄 MSDS 요약정보 PDF 열기</a></p>` : ""}
            <p class="muted small" style="margin:10px 0 0">요약본입니다. 자세한 내용은 <a href="https://msds.kosha.or.kr/MSDSInfo/" target="_blank" rel="noopener noreferrer">안전보건공단 MSDS</a>에서 확인하세요.</p></div>
          ${opts.take ? `<div class="actions" style="justify-content:flex-end;margin-top:10px">
            <span class="muted small" data-hint>${r.pdf ? "PDF를 열거나 " : ""}끝까지 읽으면 버튼이 눌립니다 ↓</span>
            <button type="button" class="btn" data-ok disabled>${esc(opts.take)}</button></div>` : ""}
        </div>`;
      document.body.appendChild(back);
      const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); done(v); };
      const onKey = (e) => { if (e.key === "Escape") close(false); };
      document.addEventListener("keydown", onKey);
      back.addEventListener("click", (e) => { if (e.target === back) close(false); });
      back.querySelector("[data-x]").onclick = () => close(false);
      const ok = back.querySelector("[data-ok]");
      if (ok) {
        const body = back.querySelector(".msds-body");
        const unlock = () => { ok.disabled = false; const h = back.querySelector("[data-hint]"); if (h) h.textContent = "✅ 다 읽었습니다"; };
        const check = () => { if (body.scrollTop + body.clientHeight >= body.scrollHeight - 8) unlock(); };
        body.addEventListener("scroll", check);
        // 한 화면에 다 보이면 잠깐 읽을 시간 뒤에 열림
        setTimeout(() => { if (body.scrollHeight <= body.clientHeight + 8) setTimeout(unlock, 2500); else check(); }, 50);
        const pdf = back.querySelector("[data-pdf]");
        if (pdf) pdf.addEventListener("click", unlock); // PDF를 열어 봤으면 확인 가능
        ok.onclick = () => close(true);
      }
    });
  }

  // 신호어·그림문자 작은 표시 (◇ 부식성 · ◇ 위험)
  const chips = (r) => [...String(r.pictos || "").split(/[,·\/]/).map((x) => x.trim()).filter(Boolean), r.signal]
    .filter(Boolean).map((t) => `<span class="hz">◇ ${esc(t)}</span>`).join("");

  // ---------------- 검색 칸 ----------------
  // 시약 목록: 검색 + 시약마다 [MSDS 확인] → '확인함' → [+ 담기] (확인해야 담김)
  // opts: onTake(r) 담기, isSeen(name)/markSeen(name) 확인 기록, isTaken(name) 이미 담았는지
  async function picker(el, opts = {}) {
    let all = [];
    try { all = await list(); } catch (e) { console.warn("시약 목록을 불러오지 못함", e); }
    const seen = opts.isSeen || (() => false), taken = opts.isTaken || (() => false);
    el.innerHTML = all.length ? `
      <input data-q placeholder="시약 이름·다른 이름·CAS 번호 검색 (예: 염산)" autocomplete="off" style="width:100%">
      <div class="rg-list" data-res></div>`
      : '<p class="muted small" style="margin:0">아직 학교 시약 목록이 없습니다. 쓰는 시약은 아래 조사서에 직접 적어 주세요.</p>';
    if (!all.length) return { all, redraw() {} };
    const res = $("[data-res]", el), q = $("[data-q]", el);
    const draw = () => {
      const hits = q.value.trim() ? search(all, q.value) : all;
      res.innerHTML = hits.map((r, i) => {
        const ok = seen(r.name), got = taken(r.name);
        return `<div class="rg-item">
          <div class="rg-main"><b>${esc(r.name)}</b> <span class="muted small">${esc(r.aliases || "")}</span>
            ${r.cas ? `<div class="muted small">CAS ${esc(r.cas)}</div>` : ""}
            <div class="rg-chips">${chips(r)}</div>
            <div class="actions" style="gap:8px;margin-top:4px"><button type="button" class="btn ghost sm" data-m="${i}">MSDS 확인</button>
              <span class="small ${ok ? "ok-t" : "muted"}">${ok ? "☑ MSDS 확인함" : "☐ 아직 확인 안 함"}</span></div></div>
          ${opts.onTake ? `<button type="button" class="btn ${got ? "ghost" : ""} sm" data-t="${i}" ${ok && !got ? "" : "disabled"}
            title="${ok ? "" : "MSDS를 먼저 확인하세요"}">${got ? "담김 ✓" : "+ 담기"}</button>` : ""}
        </div>`;
      }).join("") || '<p class="muted small" style="margin:8px 0">학교 시약 목록에 없는 이름입니다. 아래 조사서에 직접 적어 주세요.</p>';
      res.querySelectorAll("[data-m]").forEach((b) => (b.onclick = async () => {
        const r = hits[+b.dataset.m];
        if (await showMsds(r, opts.markSeen ? { take: "확인했습니다" } : {}) && opts.markSeen) { opts.markSeen(r.name); draw(); }
      }));
      res.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { opts.onTake(hits[+b.dataset.t]); draw(); }));
    };
    q.addEventListener("input", draw);
    draw();
    return { all, redraw: draw };
  }

  // 요약 MSDS → 조사서 한 장 (물질명 + 같은 칸)
  const toSheet = (r) => ({ name: r.name, ...Object.fromEntries(TO_SHEET.map((k) => [k, r[k] || ""])),
    etc: [r.signal && `신호어: ${r.signal}`, r.inhale && `흡입: ${r.inhale}`, r.swallow && `먹었을 때: ${r.swallow}`, r.handling && `취급·보관: ${r.handling}`].filter(Boolean).join("\n") });

  // ---------------- 관리자: 시약 대장 (과학실 운영) ----------------
  async function admin(body) {
    body.innerHTML = '<p class="muted">불러오는 중…</p>';
    const [all, stock] = await Promise.all([list(true), store().listStock()]);
    const filled = (r) => MSDS.filter(([k]) => r[k]).length;
    body.innerHTML = `
      <div class="card">
        <div class="actions" style="justify-content:space-between">
          <h2 style="margin:0">학교 시약 대장 (${all.length}종)</h2>
          <div class="actions">
            <button class="btn ghost sm" id="rgTpl">엑셀 양식 받기</button>
            <label class="btn ghost sm">엑셀 올리기<input type="file" accept=".xlsx" hidden id="rgUp"></label>
            <button class="btn ghost sm" id="rgOut" ${all.length ? "" : "disabled"}>지금 대장 엑셀로 받기</button>
            <button class="btn sm" id="rgNew">＋ 시약 추가</button>
          </div></div>
        <p class="muted small">학생은 신청서에서 이 목록을 검색해 <b>요약 MSDS를 끝까지 읽어야</b> 시약을 담을 수 있고, 담으면 시약·시액 조사서가 자동으로 채워집니다.
          물질명·CAS·요약 MSDS는 학생에게 보이고, <b>보관 위치·보유 수량은 과학실 운영 담당만</b> 봅니다.</p>
        <div id="rgPreview"></div>
        <div class="actions" style="margin:8px 0"><input id="rgFind" placeholder="대장 안에서 찾기" style="flex:1;min-width:200px"></div>
        <div class="table-wrap"><table>
          <tr><th>물질명</th><th>CAS</th><th>신호어</th><th>보관 위치</th><th>보유 수량</th><th>요약 MSDS</th><th></th></tr>
          ${all.map((r) => `<tr data-row="${esc(keyOf([r.name, r.aliases, r.cas].join(" ")))}">
            <td><b>${esc(r.name)}</b>${r.aliases ? `<br><span class="muted small">${esc(r.aliases)}</span>` : ""}</td><td>${esc(r.cas)}</td><td>${esc(r.signal)}</td>
            <td>${esc(stock[r.id]?.location || "")}</td><td>${esc(stock[r.id]?.qty || "")}</td>
            <td>${filled(r)}/${MSDS.length} 항목${r.pdf ? " · PDF" : ""} <button class="btn ghost sm" data-view="${esc(r.id)}">보기</button></td>
            <td><div class="actions"><button class="btn ghost sm" data-edit="${esc(r.id)}">수정</button><button class="btn bad sm" data-del="${esc(r.id)}">삭제</button></div></td></tr>`).join("")
            || '<tr><td colspan="7" class="muted">아직 등록된 시약이 없습니다. [엑셀 양식 받기]로 채워 올리거나 [＋ 시약 추가]를 누르세요.</td></tr>'}
        </table></div>
      </div>
      <form class="card" id="rgForm" hidden></form>`;
    const byId = Object.fromEntries(all.map((r) => [r.id, r]));
    const again = () => admin(body);
    $("#rgFind").addEventListener("input", (e) => {
      const k = keyOf(e.target.value);
      body.querySelectorAll("[data-row]").forEach((tr) => (tr.hidden = k && !tr.dataset.row.includes(k)));
    });
    body.querySelectorAll("[data-view]").forEach((b) => (b.onclick = () => showMsds(byId[b.dataset.view], { stock: stock[b.dataset.view] })));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => {
      const r = byId[b.dataset.del];
      if (!confirm(`'${r.name}'을(를) 시약 대장에서 지울까요?`)) return;
      busy(b, async () => { await store().remove(r.id); again(); });
    }));
    const form = $("#rgForm");
    const openForm = (r = {}) => {
      const st = stock[r.id] || {};
      const field = ([k, t]) => {
        const v = r[k] ?? st[k] ?? "";
        const long = ["hazard", "eye", "skin", "inhale", "swallow", "stability", "fire", "handling"].includes(k);
        return `<label>${t}${long ? `<textarea name="${k}" style="height:60px">${esc(v)}</textarea>` : `<input name="${k}" value="${esc(v)}" ${k === "name" ? "required" : ""}>`}</label>`;
      };
      form.hidden = false;
      form.innerHTML = `<h2>${r.id ? `시약 수정: ${esc(r.name)}` : "시약 추가"}</h2>
        <div class="row">${[...BASE, ...STOCK].map(field).join("")}</div>
        <p class="muted small" style="margin:4px 0">요약 MSDS (안전보건공단 'MSDS 요약정보'를 옮겨 적으세요)</p>
        <div class="row">${MSDS.map(field).join("")}</div>
        <div class="actions"><button class="btn">저장</button><button type="button" class="btn ghost" data-cancel>닫기</button></div>`;
      form.querySelector("[data-cancel]").onclick = () => { form.hidden = true; };
      form.onsubmit = (e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(form));
        const dup = find(all, d.name);
        if (dup && dup.id !== r.id) return alert(`'${dup.name}'이(가) 이미 있습니다. 그 줄의 [수정]을 쓰세요.`);
        busy(form.querySelector("button.btn:not(.ghost)"), async () => { await store().saveMany([{ ...d, id: r.id }]); again(); });
      };
      form.scrollIntoView({ behavior: "smooth" });
    };
    $("#rgNew").onclick = () => openForm();
    body.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => openForm(byId[b.dataset.edit])));

    // 엑셀
    const COLS = [...BASE, ...STOCK, ...MSDS];
    $("#rgTpl").onclick = (e) => busy(e.target, () => writeXlsx([{ name: "예) 염산", aliases: "염화수소산", cas: "7647-01-0", location: "준비실 산 캐비닛 1칸", qty: "500mL × 2병",
      signal: "위험", pictos: "부식성, 감탄부호", hazard: "피부에 심한 화상과 눈 손상을 일으킴", eye: "물로 15분 이상 씻고 진료", skin: "오염된 옷을 벗고 물로 씻기",
      smell: "자극적", flash: "해당 없음" }], "시약대장_양식.xlsx", true));
    $("#rgOut").onclick = (e) => busy(e.target, () => writeXlsx(all.map((r) => ({ ...r, ...(stock[r.id] || {}) })), `시약대장_${window.localDate()}.xlsx`));
    async function writeXlsx(rows, file, help) {
      await window.Forms.loadExcel();
      const wb = new window.ExcelJS.Workbook();
      const ws = wb.addWorksheet("시약 대장", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
      ws.columns = COLS.map(([k]) => ({ width: ["hazard", "eye", "skin", "inhale", "swallow", "stability", "fire", "handling"].includes(k) ? 36 : 16 }));
      ws.addRow(COLS.map(([, t]) => t));
      rows.forEach((r) => ws.addRow(COLS.map(([k]) => r[k] || "")));
      ws.getRow(1).eachCell((c) => { c.font = { name: "맑은 고딕", bold: true }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } }; });
      ws.eachRow((row, n) => { if (n > 1) row.eachCell((c) => (c.alignment = { wrapText: true, vertical: "top" })); });
      if (help) {
        const h = wb.addWorksheet("작성 방법"); h.getColumn(1).width = 110;
        ["시약 대장 엑셀 작성 방법", "· 한 줄에 시약 하나. '물질명'만 꼭 적고 나머지는 아는 만큼 적습니다. 2번째 줄 예) 는 지우거나 두면 건너뜁니다.",
          "· 요약 MSDS는 안전보건공단(msds.kosha.or.kr) → 물질 검색 → 'MSDS 요약정보'에서 옮겨 적습니다.",
          "· 이미 있는 물질명(또는 다른 이름)과 같으면 그 시약을 새 내용으로 바꿉니다. 엑셀에 없는 열은 그대로 두고, 열은 있는데 칸이 비어 있으면 그 칸은 지워집니다.",
          "· 다른 곳에서 쓰던 시약 엑셀도 첫 줄 머리글이 '시약명·보관 장소·수량·CAS·유해·위험 문구' 같은 이름이면 그대로 올릴 수 있습니다.",
          "· 보관 위치·보유 수량은 과학실 운영 담당만 보고, 나머지는 학생 신청 화면에 보입니다."]
          .forEach((t, i) => { const c = h.getCell(i + 1, 1); c.value = t; c.font = { name: "맑은 고딕", size: 11, bold: i === 0 }; });
      }
      await window.Forms.saveWorkbook(wb, file);
    }
    $("#rgUp").onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = ""; if (!file) return;
      const out = $("#rgPreview");
      out.innerHTML = '<p class="muted">읽는 중…</p>';
      try {
        await window.Forms.loadExcel();
        const wb = new window.ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        const T = window.Forms.cellText;
        const head = [];
        ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = keyOf(T(c.value)); });
        const map = {}; // 열 번호 → 항목
        head.forEach((h, i) => { if (!h) return; const m = HEAD.find(([k, re]) => !Object.values(map).includes(k) && re.test(h)); if (m) map[i] = m[0]; });
        if (!Object.values(map).includes("name")) throw new Error("첫 줄에 '물질명'(또는 '시약명') 머리글이 없습니다. [엑셀 양식 받기]의 양식을 써 주세요.");
        const items = [];
        ws.eachRow((row, n) => {
          if (n === 1) return;
          const it = {};
          for (const [i, k] of Object.entries(map)) it[k] = T(row.getCell(+i).value);
          if (!it.name || /^예\)/.test(it.name)) return;
          items.push(it);
        });
        const seen = new Set();
        const rows = items.filter((it) => { const k = keyOf(it.name); if (seen.has(k)) return false; seen.add(k); return true; })
          .map((it) => { const old = find(all, it.name); return old ? { ...old, ...(stock[old.id] || {}), ...it, name: old.name, id: old.id, isNew: false } : { ...it, isNew: true }; });
        const nNew = rows.filter((r) => r.isNew).length;
        const used = [...new Set(Object.values(map))].map((k) => COLS.find(([c]) => c === k)?.[1]).filter(Boolean);
        out.innerHTML = `<div class="notice" style="display:block"><b>${esc(file.name)}</b>: 시약 ${rows.length}종 (새로 추가 ${nNew} · 기존 시약 바꿈 ${rows.length - nNew})
          <div class="muted small">읽은 칸: ${esc(used.join(", "))}</div>
          <div class="actions" style="margin-top:8px"><button class="btn sm" data-go ${rows.length ? "" : "disabled"}>${rows.length}종 저장</button><button class="btn ghost sm" data-no>취소</button></div></div>`;
        out.querySelector("[data-no]").onclick = () => (out.innerHTML = "");
        out.querySelector("[data-go]").onclick = (ev) => busy(ev.target, async () => {
          await store().saveMany(rows.map(({ isNew, ...r }) => r));
          alert(`${rows.length}종을 저장했습니다.`); again();
        });
      } catch (err) { out.innerHTML = `<p class="warn">${esc(err.message)}</p>`; }
    };
  }

  window.Reagents = { list, listStock: () => store().listStock(), find, search, showMsds, picker, toSheet, admin, keyOf };
})();
