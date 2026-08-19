/**
 * GradWorkbench 剪藏扩展 —— 弹窗
 * ==================================================================
 * 流程：
 *   1. 探测工作台连通性（顶部状态条）
 *   2. 在当前标签页执行抽取（content script 已注入则复用，否则临时注入）
 *   3. 单篇 → 可编辑表单；Scholar 多条 → 勾选列表
 *   4. 提交给 background 入库
 */

const $ = (id) => document.getElementById(id);

const el = {
  status: $("status"),
  statusText: $("status-text"),
  loading: $("loading"),
  nodata: $("nodata"),
  form: $("form"),
  list: $("list"),
  listItems: $("list-items"),
  listCount: $("list-count"),
  btnSave: $("btn-save"),
  btnOptions: $("btn-options"),
  btnManual: $("btn-manual"),
  btnSelectAll: $("btn-selectall"),
  ftHint: $("ft-hint"),
  adapterBadge: $("adapter-badge"),
  dupBadge: $("dup-badge"),
};

const fields = {
  title: $("f-title"),
  authors: $("f-authors"),
  journal: $("f-journal"),
  year: $("f-year"),
  doi: $("f-doi"),
  volume: $("f-volume"),
  issue: $("f-issue"),
  pages: $("f-pages"),
  keywords: $("f-keywords"),
  abstract: $("f-abstract"),
};

let mode = "single"; // single | list
let listData = [];

/* ------------------------------------------------------------------ */
/* 通信                                                                */
/* ------------------------------------------------------------------ */

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(resp || { ok: false, error: "无响应" });
    });
  });
}

/* ------------------------------------------------------------------ */
/* 1. 连通性                                                            */
/* ------------------------------------------------------------------ */

async function checkService() {
  const result = await send({ type: "PING" });

  if (result.ok) {
    el.status.className = "status status--ok";
    el.statusText.textContent = `已连接 · 文献库 ${result.paperCount ?? 0} 篇`;
    return true;
  }

  el.status.className = "status status--err";
  el.statusText.textContent = result.error || "无法连接工作台";
  return false;
}

/* ------------------------------------------------------------------ */
/* 2. 抽取                                                              */
/* ------------------------------------------------------------------ */

async function extractFromPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;

  // 优先复用已注入的 content script
  try {
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT" });
    if (resp?.ok) return resp;
  } catch (e) {
    /* content script 未注入，走下面的临时注入 */
  }

  // 临时注入（依赖 activeTab 权限，用户点击图标即授权）
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/extractor.js"],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const E = window.GWBExtractor;
        if (!E) return null;
        return {
          ok: true,
          data: E.extract(),
          list: E.extractList().map((i) => i.data),
        };
      },
    });
    return result;
  } catch (e) {
    console.warn("[GWB] 注入失败:", e);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 3. 渲染                                                              */
/* ------------------------------------------------------------------ */

function showSingle(data) {
  mode = "single";
  el.loading.classList.add("hidden");
  el.nodata.classList.add("hidden");
  el.list.classList.add("hidden");
  el.form.classList.remove("hidden");

  fields.title.value = data.title || "";
  fields.authors.value = (data.authors || []).join(", ");
  fields.journal.value = data.journal || "";
  fields.year.value = data.year || "";
  fields.doi.value = data.doi || "";
  fields.volume.value = data.volume || "";
  fields.issue.value = data.issue || "";
  fields.pages.value = data.pages || "";
  fields.keywords.value = (data.keywords || []).join(", ");
  fields.abstract.value = data.abstract || "";

  el.adapterBadge.textContent = data.adapterName || "通用解析";
  el.btnSave.disabled = !data.title;

  if (!data.doi) {
    el.ftHint.textContent = "未找到 DOI，将按标题去重";
  } else {
    el.ftHint.textContent = "";
  }

  // 异步查重
  send({ type: "CHECK", doi: data.doi, title: data.title }).then((resp) => {
    if (resp?.exists) {
      el.dupBadge.classList.remove("hidden");
      el.btnSave.textContent = "补全并更新";
      el.ftHint.textContent = "库中已有，保存将补全空字段";
    }
  });
}

function showList(items) {
  mode = "list";
  listData = items;
  el.loading.classList.add("hidden");
  el.form.classList.add("hidden");
  el.nodata.classList.add("hidden");
  el.list.classList.remove("hidden");

  el.listCount.textContent = `检测到 ${items.length} 条结果`;
  el.listItems.innerHTML = "";

  items.forEach((data, idx) => {
    const label = document.createElement("label");
    label.className = "item";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.idx = String(idx);

    const body = document.createElement("div");
    body.className = "item__body";

    const t = document.createElement("div");
    t.className = "item__title";
    t.textContent = data.title;

    const m = document.createElement("div");
    m.className = "item__meta";
    m.textContent =
      [(data.authors || []).slice(0, 3).join(", "), data.journal, data.year]
        .filter(Boolean)
        .join(" · ") || "—";

    body.appendChild(t);
    body.appendChild(m);
    label.appendChild(cb);
    label.appendChild(body);

    cb.addEventListener("change", () => {
      label.classList.toggle("item--checked", cb.checked);
      updateListFooter();
    });

    el.listItems.appendChild(label);
  });

  updateListFooter();
}

function selectedIndexes() {
  return Array.from(
    el.listItems.querySelectorAll("input[type=checkbox]:checked")
  ).map((cb) => parseInt(cb.dataset.idx, 10));
}

function updateListFooter() {
  const n = selectedIndexes().length;
  el.btnSave.disabled = n === 0;
  el.btnSave.textContent = n > 0 ? `存入 ${n} 篇` : "存入文献库";
  el.ftHint.textContent = n > 0 ? "" : "勾选要保存的条目";
}

function showNoData() {
  el.loading.classList.add("hidden");
  el.form.classList.add("hidden");
  el.list.classList.add("hidden");
  el.nodata.classList.remove("hidden");
  el.btnSave.disabled = true;
}

/* ------------------------------------------------------------------ */
/* 4. 保存                                                              */
/* ------------------------------------------------------------------ */

function collectForm() {
  const split = (v) =>
    String(v || "")
      .split(/\s*[,，;；]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    title: fields.title.value.trim(),
    authors: split(fields.authors.value),
    journal: fields.journal.value.trim() || null,
    year: fields.year.value.trim() || null,
    doi: fields.doi.value.trim() || null,
    volume: fields.volume.value.trim() || null,
    issue: fields.issue.value.trim() || null,
    pages: fields.pages.value.trim() || null,
    keywords: split(fields.keywords.value),
    abstract: fields.abstract.value.trim() || null,
    url: window.__gwbPageUrl || null,
  };
}

async function saveSingle() {
  const payload = collectForm();
  if (!payload.title) {
    setHint("请填写标题", "err");
    return;
  }

  el.btnSave.disabled = true;
  el.btnSave.textContent = "保存中…";

  const result = await send({ type: "CLIP", payload, notify: false });

  if (!result.ok) {
    setHint(result.error || "保存失败", "err");
    el.btnSave.disabled = false;
    el.btnSave.textContent = "存入文献库";
    return;
  }

  const label =
    result.status === "created"
      ? "已存入文献库"
      : result.status === "updated"
      ? `已补全 ${(result.updatedFields || []).length} 个字段`
      : "库中已有该文献";

  setHint(label, "ok");
  el.btnSave.textContent = "✓ 完成";

  setTimeout(() => window.close(), 1100);
}

async function saveList() {
  const idxs = selectedIndexes();
  if (!idxs.length) return;

  el.btnSave.disabled = true;

  let created = 0;
  let dup = 0;
  let failed = 0;

  for (let i = 0; i < idxs.length; i++) {
    el.btnSave.textContent = `保存中 ${i + 1}/${idxs.length}`;
    const result = await send({
      type: "CLIP",
      payload: listData[idxs[i]],
      notify: false,
    });

    if (!result.ok) failed++;
    else if (result.status === "created") created++;
    else dup++;

    // 标记已处理的条目
    const cb = el.listItems.querySelector(`input[data-idx="${idxs[i]}"]`);
    if (cb) {
      cb.checked = false;
      cb.disabled = true;
      cb.closest(".item").classList.remove("item--checked");
      cb.closest(".item").style.opacity = result.ok ? "0.5" : "1";
    }
  }

  const parts = [];
  if (created) parts.push(`新增 ${created} 篇`);
  if (dup) parts.push(`已存在 ${dup} 篇`);
  if (failed) parts.push(`失败 ${failed} 篇`);

  setHint(parts.join("，"), failed ? "err" : "ok");
  el.btnSave.textContent = "存入文献库";
  updateListFooter();
}

function setHint(text, kind) {
  el.ftHint.textContent = text;
  el.ftHint.className =
    "ft__hint" + (kind ? ` ft__hint--${kind}` : "");
}

/* ------------------------------------------------------------------ */
/* 事件 & 启动                                                          */
/* ------------------------------------------------------------------ */

el.btnSave.addEventListener("click", () => {
  if (mode === "list") saveList();
  else saveSingle();
});

el.btnOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

el.btnManual.addEventListener("click", () => {
  showSingle({ title: "", authors: [], adapterName: "手动录入" });
  el.btnSave.disabled = false;
  fields.title.focus();
});

Object.values(fields).forEach((f) =>
  f.addEventListener("input", () => {
    if (mode === "single") el.btnSave.disabled = !fields.title.value.trim();
  })
);

el.btnSelectAll.addEventListener("click", () => {
  const boxes = Array.from(
    el.listItems.querySelectorAll("input[type=checkbox]:not(:disabled)")
  );
  const allChecked = boxes.every((b) => b.checked);
  boxes.forEach((b) => {
    b.checked = !allChecked;
    b.closest(".item").classList.toggle("item--checked", b.checked);
  });
  updateListFooter();
});

(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  window.__gwbPageUrl = tab?.url || null;

  // 并行：探测服务 + 解析页面
  const [, extracted] = await Promise.all([checkService(), extractFromPage()]);

  if (!extracted || !extracted.data) {
    showNoData();
    return;
  }

  // Scholar 这类列表页且条目 >1 时进入列表模式
  if (Array.isArray(extracted.list) && extracted.list.length > 1) {
    showList(extracted.list);
    return;
  }

  if (!extracted.data.title) {
    showNoData();
    return;
  }

  showSingle(extracted.data);
})();
