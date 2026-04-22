import { decryptBlob } from "./crypto.js";

// ---- Branding (no SSI reference) -----------------------------------------

const SITE_TITLE = "Sake Study";
const SITE_SUBTITLE = "日本酒知識練習";

// ---- Crypto / data loading -----------------------------------------------

const PW_KEY = "sakestudy_pw_v1";

/** @type {any[] | null} */
let questions = null;

async function fetchBlob() {
    const res = await fetch(`${import.meta.env.BASE_URL}data.enc`, {
        cache: "no-cache",
    });
    if (!res.ok) throw new Error("載入題庫檔失敗");
    return await res.arrayBuffer();
}

async function tryUnlock(password, blob) {
    const data = await decryptBlob(blob, password);
    if (!Array.isArray(data) || !data.length)
        throw new Error("題庫格式異常");
    questions = data;
    sessionStorage.setItem(PW_KEY, password);
}

// ---- Progress storage -----------------------------------------------------

const STORAGE_KEY = "sakestudy_progress_v1";

/** @type {Record<string, {c:number,w:number,last:"ok"|"ng"|null}>} */
let progress = loadProgress();

function loadProgress() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}
function saveProgress() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
function keyOf(q) {
    return `${q.chapter}-${q.no}`;
}
function recordAnswer(q, picked) {
    const k = keyOf(q);
    const cur = progress[k] ?? { c: 0, w: 0, last: null };
    if (picked === q.ans) {
        cur.c += 1;
        cur.last = "ok";
    } else {
        cur.w += 1;
        cur.last = "ng";
    }
    progress[k] = cur;
    saveProgress();
}

// ---- Chapter titles (neutral) --------------------------------------------

const CHAPTER_TITLES = {
    1: "第一章 基礎概念",
    2: "第二章 商品特性",
    3: "第三章 原料",
    4: "第四章 製造工程",
    5: "第五章 法規與標示",
    6: "第六章 歷史與文化",
    7: "第七章 四大類型",
    8: "第八章 品鑑",
    9: "第九章 侍酒服務",
};

function questionsOf(chapter) {
    if (chapter === "all") return questions;
    if (chapter === "wrong") {
        return questions.filter((q) => progress[keyOf(q)]?.last === "ng");
    }
    return questions.filter((q) => q.chapter === chapter);
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---- Router ---------------------------------------------------------------

const root = document.getElementById("app");

/** @type {any} */
let state = { view: "home" };

function render() {
    root.innerHTML = "";
    root.appendChild(renderHeader());
    if (!questions) {
        root.appendChild(renderLogin());
        return;
    }
    if (state.view === "home") root.appendChild(renderHome());
    else if (state.view === "quiz") root.appendChild(renderQuiz());
    else if (state.view === "stats") root.appendChild(renderStats());
}

// ---- Header ---------------------------------------------------------------

function renderHeader() {
    const h = el("header");
    const qCount = questions ? questions.length : "—";
    h.innerHTML = `
    <h1>${SITE_TITLE}</h1>
    <p>${SITE_SUBTITLE} · ${qCount} 題 · 進度保存於本機</p>
  `;
    return h;
}

// ---- Login ----------------------------------------------------------------

function renderLogin() {
    const wrap = el("div", "panel login");
    wrap.innerHTML = `
    <h2 style="margin-top:0">🔒 請輸入通行密碼</h2>
    <p style="color:var(--muted);font-size:13px;margin:0 0 12px">
      本站題庫經加密保護，僅供同學內部複習使用。
    </p>
    <form id="loginForm">
      <input
        type="password"
        id="pwInput"
        placeholder="password"
        autocomplete="current-password"
        autofocus
      />
      <button type="submit" class="btn-primary">解鎖</button>
    </form>
    <div id="loginMsg" class="feedback ng" style="display:none;margin-top:12px"></div>
  `;
    const form = wrap.querySelector("#loginForm");
    const input = wrap.querySelector("#pwInput");
    const msg = wrap.querySelector("#loginMsg");
    const submit = wrap.querySelector("button[type=submit]");
    form.onsubmit = async (e) => {
        e.preventDefault();
        const pw = input.value;
        if (!pw) return;
        submit.disabled = true;
        submit.textContent = "解密中…";
        msg.style.display = "none";
        try {
            const blob = state._blob ?? (state._blob = await fetchBlob());
            await tryUnlock(pw, blob);
            render();
        } catch (err) {
            msg.style.display = "";
            msg.textContent = err?.message ?? "解鎖失敗";
            submit.disabled = false;
            submit.textContent = "解鎖";
            input.select();
        }
    };
    return wrap;
}

// ---- Home -----------------------------------------------------------------

function renderHome() {
    const wrap = el("div");

    const actionPanel = el("div", "panel");
    actionPanel.innerHTML = `<h2 style="margin-top:0">快速開始</h2>`;
    const row = el("div", "row");
    row.appendChild(
        makeBtn(
            "🎲 從全部題庫隨機 50 題",
            () => startQuiz("all", "random", 50),
            "btn-primary"
        )
    );
    row.appendChild(
        makeBtn("📊 查看統計", () => {
            state = { view: "stats" };
            render();
        })
    );
    const wrongCount = questions.filter(
        (q) => progress[keyOf(q)]?.last === "ng"
    ).length;
    if (wrongCount > 0) {
        row.appendChild(
            makeBtn(`❌ 錯題複習 (${wrongCount})`, () =>
                startQuiz("wrong", "random")
            )
        );
    }
    actionPanel.appendChild(row);
    wrap.appendChild(actionPanel);

    const chPanel = el("div", "panel");
    chPanel.innerHTML = `<h2 style="margin-top:0">選擇章節</h2>`;
    const grid = el("div", "chapter-grid");
    for (const ch of Object.keys(CHAPTER_TITLES).map(Number)) {
        grid.appendChild(renderChapterBtn(ch));
    }
    chPanel.appendChild(grid);
    const hint = el("p");
    hint.style.color = "var(--muted)";
    hint.style.fontSize = "12px";
    hint.style.marginTop = "12px";
    hint.textContent = "點擊章節 → 選擇「順序練習」或「隨機測驗」。";
    chPanel.appendChild(hint);
    wrap.appendChild(chPanel);

    const resetPanel = el("div", "panel");
    const resetRow = el("div", "row");
    resetRow.appendChild(
        makeBtn(
            "🗑 清除答題記錄",
            () => {
                if (confirm("確定清除所有答題記錄？")) {
                    progress = {};
                    saveProgress();
                    render();
                }
            },
            "btn-ghost"
        )
    );
    resetRow.appendChild(
        makeBtn(
            "🔒 登出",
            () => {
                sessionStorage.removeItem(PW_KEY);
                questions = null;
                state = { view: "home" };
                render();
            },
            "btn-ghost"
        )
    );
    resetPanel.appendChild(resetRow);
    wrap.appendChild(resetPanel);

    const foot = el("p", "foot");
    foot.textContent = "個人學習工具，非官方認證教材。題目僅供內部交流練習。";
    wrap.appendChild(foot);

    return wrap;
}

function renderChapterBtn(ch) {
    const qs = questions.filter((q) => q.chapter === ch);
    const answered = qs.filter((q) => progress[keyOf(q)]).length;
    const correct = qs.filter((q) => progress[keyOf(q)]?.last === "ok").length;
    const btn = el("button", "chapter-btn");
    btn.innerHTML = `
    <span class="cn">第 ${ch} 章</span>
    <span class="cmeta">${CHAPTER_TITLES[ch]} · ${qs.length} 題</span>
    <span class="cprog">已作答 ${answered}/${qs.length} · 答對 ${correct}</span>
  `;
    btn.onclick = () => openChapter(ch);
    return btn;
}

function openChapter(ch) {
    const dlg = document.createElement("div");
    dlg.innerHTML = `
    <div class="panel">
      <h2 style="margin-top:0">第 ${ch} 章 — ${CHAPTER_TITLES[ch]}</h2>
      <div class="row" style="margin-top:8px">
        <button class="btn-primary" data-mode="seq">順序練習</button>
        <button data-mode="rand">隨機測驗</button>
        <button class="btn-ghost" data-mode="cancel">取消</button>
      </div>
    </div>
  `;
    dlg.querySelectorAll("button").forEach((b) => {
        b.onclick = () => {
            const m = b.dataset.mode;
            if (m === "seq") startQuiz(ch, "seq");
            else if (m === "rand") startQuiz(ch, "random");
            else render();
        };
    });
    root.innerHTML = "";
    root.appendChild(renderHeader());
    root.appendChild(dlg);
}

// ---- Quiz -----------------------------------------------------------------

function startQuiz(chapter, mode, limit) {
    let pool = questionsOf(chapter);
    if (!pool.length) {
        alert("沒有符合條件的題目");
        return;
    }
    if (mode === "random") pool = shuffle(pool);
    if (limit) pool = pool.slice(0, limit);
    state = {
        view: "quiz",
        pool,
        idx: 0,
        mode,
        chapter,
        picked: null,
        correctCount: 0,
        answeredCount: 0,
    };
    render();
}

function renderQuiz() {
    const wrap = el("div");
    const q = state.pool[state.idx];
    const total = state.pool.length;
    const chLabel =
        state.chapter === "all"
            ? "全題庫"
            : state.chapter === "wrong"
                ? "錯題複習"
                : `第 ${state.chapter} 章`;

    const top = el("div", "quiz-top");
    top.innerHTML = `
    <span>${chLabel} · 題目 ${state.idx + 1} / ${total}</span>
    <span class="progress">答對 ${state.correctCount} / 已作答 ${state.answeredCount}</span>
  `;
    wrap.appendChild(top);

    const panel = el("div", "panel");
    const meta = el("div", "qmeta");
    meta.textContent = `第 ${q.chapter} 章 · 第 ${q.no} 題`;
    panel.appendChild(meta);

    const qText = el("div", "question");
    qText.textContent = q.q;
    panel.appendChild(qText);

    const opts = el("div", "options");
    for (const letter of ["A", "B", "C", "D"]) {
        const btn = el("button", "option");
        btn.innerHTML = `<span class="letter">${letter}</span><span class="text"></span>`;
        btn.querySelector(".text").textContent = q.options[letter];
        btn.onclick = () => selectAnswer(letter, opts, panel);
        opts.appendChild(btn);
    }
    panel.appendChild(opts);

    if (state.picked) {
        revealAnswer(opts, q);
        const fb = el("div", "feedback " + (state.picked === q.ans ? "ok" : "ng"));
        fb.textContent =
            state.picked === q.ans
                ? "✅ 答對了！"
                : `❌ 答錯了，正解：${q.ans}. ${q.options[q.ans]}`;
        panel.appendChild(fb);
    }

    wrap.appendChild(panel);

    const actions = el("div", "actions");
    const backBtn = makeBtn(
        "← 返回首頁",
        () => {
            state = { view: "home" };
            render();
        },
        "btn-ghost"
    );
    actions.appendChild(backBtn);

    const nextBtn = makeBtn(
        state.idx + 1 >= total ? "完成" : "下一題 →",
        () => nextQuestion(),
        "btn-primary"
    );
    nextBtn.disabled = !state.picked;
    actions.appendChild(nextBtn);
    wrap.appendChild(actions);

    return wrap;
}

function selectAnswer(letter, optsEl, panelEl) {
    if (state.picked) return;
    const q = state.pool[state.idx];
    state.picked = letter;
    state.answeredCount += 1;
    if (letter === q.ans) state.correctCount += 1;
    recordAnswer(q, letter);
    revealAnswer(optsEl, q);

    const fb = el("div", "feedback " + (letter === q.ans ? "ok" : "ng"));
    fb.textContent =
        letter === q.ans
            ? "✅ 答對了！"
            : `❌ 答錯了，正解：${q.ans}. ${q.options[q.ans]}`;
    panelEl.appendChild(fb);

    const nextBtn = root.querySelector(".actions .btn-primary");
    if (nextBtn) nextBtn.disabled = false;
}

function revealAnswer(optsEl, q) {
    const buttons = optsEl.querySelectorAll(".option");
    const letters = ["A", "B", "C", "D"];
    buttons.forEach((b, i) => {
        const letter = letters[i];
        b.classList.add("revealed");
        if (letter === q.ans) b.classList.add("correct");
        else if (letter === state.picked) b.classList.add("wrong");
    });
}

function nextQuestion() {
    if (state.idx + 1 >= state.pool.length) {
        alert(`完成！答對 ${state.correctCount} / ${state.pool.length}`);
        state = { view: "home" };
        render();
        return;
    }
    state.idx += 1;
    state.picked = null;
    render();
}

// ---- Stats ----------------------------------------------------------------

function renderStats() {
    const wrap = el("div");
    const backBtn = makeBtn(
        "← 返回",
        () => {
            state = { view: "home" };
            render();
        },
        "btn-ghost"
    );
    wrap.appendChild(backBtn);

    const overall = el("div", "panel");
    overall.innerHTML = `<h2 style="margin-top:0">整體統計</h2>`;
    const answered = Object.keys(progress).length;
    const totalC = Object.values(progress).reduce((s, v) => s + v.c, 0);
    const totalW = Object.values(progress).reduce((s, v) => s + v.w, 0);
    const lastOk = Object.values(progress).filter((v) => v.last === "ok").length;
    const grid = el("div", "stat-grid");
    grid.innerHTML = `
    <div class="stat-card"><div class="label">題目總數</div><div class="value">${questions.length}</div></div>
    <div class="stat-card"><div class="label">已作答</div><div class="value">${answered}</div></div>
    <div class="stat-card"><div class="label">最近答對</div><div class="value">${lastOk}</div></div>
    <div class="stat-card"><div class="label">累計答對</div><div class="value">${totalC}</div></div>
    <div class="stat-card"><div class="label">累計答錯</div><div class="value">${totalW}</div></div>
  `;
    overall.appendChild(grid);
    wrap.appendChild(overall);

    const byCh = el("div", "panel");
    byCh.innerHTML = `<h2 style="margin-top:0">各章節進度</h2>`;
    const chGrid = el("div", "stat-grid");
    for (const ch of Object.keys(CHAPTER_TITLES).map(Number)) {
        const qs = questions.filter((q) => q.chapter === ch);
        const ans = qs.filter((q) => progress[keyOf(q)]).length;
        const ok = qs.filter((q) => progress[keyOf(q)]?.last === "ok").length;
        const pct = qs.length ? Math.round((ok / qs.length) * 100) : 0;
        const card = el("div", "stat-card");
        card.innerHTML = `
      <div class="label">第 ${ch} 章</div>
      <div class="value">${pct}%</div>
      <div class="label" style="margin-top:4px">${ok}/${qs.length} 正確 · ${ans} 已答</div>
    `;
        chGrid.appendChild(card);
    }
    byCh.appendChild(chGrid);
    wrap.appendChild(byCh);

    return wrap;
}

// ---- helpers --------------------------------------------------------------

function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
}
function makeBtn(label, onClick, cls) {
    const b = el("button", cls);
    b.textContent = label;
    b.onclick = onClick;
    return b;
}

// ---- Boot -----------------------------------------------------------------

async function boot() {
    render(); // show login immediately
    const savedPw = sessionStorage.getItem(PW_KEY);
    if (savedPw) {
        try {
            const blob = await fetchBlob();
            state._blob = blob;
            await tryUnlock(savedPw, blob);
            render();
        } catch {
            sessionStorage.removeItem(PW_KEY);
        }
    }
}
boot();
