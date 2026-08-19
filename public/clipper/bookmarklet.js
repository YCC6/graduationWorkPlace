/**
 * GradWorkbench 文献剪藏 —— 小书签（Bookmarklet）
 * ==================================================================
 * 把这个文件的 URL 拖到书签栏即可使用。
 * 在知网 / PubMed / Google Scholar 等页面点击书签，弹出面板预览并保存。
 *
 * 与扩展的区别：
 *  - 无需安装，任何浏览器都能用
 *  - 走页面上下文发请求，依赖服务端 CORS 头
 *  - 功能稍简：无后台通知、无快捷键、无 Scholar 列表模式
 */

(function () {
  "use strict";

  if (window.__GWB_CLIPPER_BM_LOADED__) {
    var existing = document.querySelector(".gwb-bm-panel");
    if (existing) existing.remove();
    window.__GWB_CLIPPER_BM_LOADED__ = false;
    return;
  }
  window.__GWB_CLIPPER_BM_LOADED__ = true;

  /* ================================================================ */
  /* 配置（可编辑）                                                    */
  /* ================================================================ */

  var CONFIG = {
    serverUrl: "http://localhost:3000",
    apiKey: "",
  };

  // 尝试从 localStorage 读用户之前保存的配置
  try {
    var saved = JSON.parse(localStorage.getItem("gwb_clipper_cfg") || "{}");
    if (saved.serverUrl) CONFIG.serverUrl = saved.serverUrl;
    if (saved.apiKey) CONFIG.apiKey = saved.apiKey;
  } catch (e) {}

  /* ================================================================ */
  /* 抽取器（内联版）—— 与 extension/src/extractor.js 同源               */
  /* ================================================================ */

  function $(sel, root) {
    try { return (root || document).querySelector(sel); } catch (e) { return null; }
  }

  function $$(sel, root) {
    try { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  }

  function textOf(selectors, root) {
    var list = [].concat(selectors);
    for (var i = 0; i < list.length; i++) {
      var el = $(list[i], root);
      if (el) { var t = (el.textContent || "").replace(/\s+/g, " ").trim(); if (t) return t; }
    }
    return "";
  }

  function textsOf(selectors, root) {
    var list = [].concat(selectors);
    for (var i = 0; i < list.length; i++) {
      var els = $$(list[i], root);
      if (els.length) {
        var out = els.map(function(el){return (el.textContent||"").replace(/\s+/g," ").trim();}).filter(Boolean);
        if(out.length)return out;
      }
    }
    return [];
  }

  function meta(names){
    var list=[].concat(names);
    for(var i=0;i<list.length;i++){
      var n=list[i];
      var el=$('meta[name="'+n+'"]')||$('meta[property="'+n+'"]')||$('meta[name="'+n.toLowerCase()+'"]');
      if(el){var c=(el.getAttribute("content")||"").trim();if(c)return c;}
    }
    return "";
  }

  function metaAll(names){
    var list=[].concat(names),out=[];
    for(var i=0;i<list.length;i++){
      var els=$$('meta[name="'+list[i]+'"],meta[property="'+list[i]+'"]');
      els.forEach(function(el){var c=(el.getAttribute("content")||"").trim();if(c)out.push(c);});
      if(out.length)break;
    }
    if(out.length===1&&/[;]/.test(out[0]))out=out[0].split(/\s*;\s*/).filter(Boolean);
    return out;
  }

  function extractDoi(text){
    if(!text)return"";
    var s=String(text).replace(/https?:\/\/(dx\.)?doi\.org\//gi,"");
    var m=s.match(/10\.\d{4,9}\/[^\s"'<>）)]+/);if(m)return m[0].replace(/[.;,)\]}>]+$/,"");
    var m2=s.match(/(?:doi|DOI)\s*[:：]\s*(\S+)/);if(m2)return m2[1].replace(/[.;,)\]}>]+$/,"");
    return"";
  }

  function parseYear(v){if(!v)return null;var m=String(v).match(/(1[5-9]\d{2}|20\d{2}|21\d{2})/);return m?parseInt(m[1],10):null;}
  function clean(s){return String(s||"").replace(/\s+/g," ").trim();}
  function blank(){return{title:"",authors:[],journal:"",year:null,volume:"",issue:"",pages:"",doi:"",abstract:"",keywords:[],url:location.href,pmid:"",site:""};}
  function fill(a,b){if(!b)return a;Object.keys(b).forEach(function(k){var av=a[k],bv=b[k];var ae=av===null||av===undefined||av===""||(Array.isArray(av)&&av.length===0);var be=bv===null||bv===undefined||bv===""||(Array.isArray(bv)&&bv.length===0);if(ae&&!be)a[k]=bv;});return a;}

  function fromHighwire(){
    var d=blank();
    d.title=clean(meta(["citation_title"]));
    d.authors=metaAll(["citation_author"]);
    d.journal=clean(meta(["citation_journal_title","citation_conference_title","citation_inbook_title"]));
    d.year=parseYear(meta(["citation_publication_date","citation_date","citation_online_date","citation_year"]));
    d.volume=clean(meta(["citation_volume"]));d.issue=clean(meta(["issue"]));
    var fp=clean(meta(["citation_firstpage"])),lp=clean(meta(["citation_lastpage"]));d.pages=fp&&lp?fp+"-"+lp:fp||"";
    d.doi=extractDoi(meta(["citation_doi","DOI","dc.identifier"]));
    d.abstract=clean(meta(["citation_abstract","description"]));d.pmid=clean(meta(["citation_pmid"]));
    var kw=meta(["citation_keywords","keywords"]);if(kw)d.keywords=kw.split(/\s*[;,，、]\s*/).filter(Boolean);
    d.site="highwire";return d;
  }

  function fromDublinCore(){
    var d=blank();
    d.title=clean(meta(["DC.title","dc.title","DCTERMS.title"]));
    d.authors=metaAll(["DC.creator","dc.creator","DC.Creator"]);
    d.journal=clean(meta(["DC.source","dc.source","prism.publicationName"]));
    d.year=parseYear(meta(["DC.date","dc.date","DCTERMS.issued","prism.publicationDate"]));
    d.doi=extractDoi(meta(["DC.identifier","dc.identifier","prism.doi"]));
    d.abstract=clean(meta(["DC.description","dc.description"]));d.site="dublincore";return d;
  }

  function fromJsonLd(){
    var d=blank();
    var nodes=$$('script[type="application/ld+json"]');
    for(var i=0;i<nodes.length;i++){var data;try{data=JSON.parse(nodes[i].textContent);}catch(e){continue;}
      var items=Array.isArray(data)?data:[data];if(data&&data["@graph"])items=data["@graph"];
      for(var j=0;j<items.length;j++){var it=items[j];if(!it||typeof it!=="object")continue;
        var type=String(it["@type"]||"");if(!/Article|Publication|Book|Thesis|Dataset/i.test(type))continue;
        d.title=clean(it.headline||it.name||"");var au=it.author||it.creator;if(au){var arr=Array.isArray(au)?au:[au];d.authors=arr.map(function(a){return typeof a==="string"?a:clean(a.name||"");}).filter(Boolean);}
        if(it.isPartOf)d.journal=clean(it.isPartOf.name||"");else if(it.publisher)d.journal=clean(it.publisher.name||it.publisher||"");
        d.year=parseYear(it.datePublished||it.dateCreated);d.abstract=clean(it.abstract||it.description||"");
        d.doi=extractDoi(it.identifier||it.sameAs||"");d.site="jsonld";return d;
      }
    }
    return d;
  }

  /* CNKI */
  function extractCnki(){
    var d=blank();d.site="cnki";
    d.title=textOf([".wx-tit h1",".brief h1","h1.title",".title-text",".doc-top h1"]);
    d.title=d.title.replace(/网络首发|优先出版|OA|CSSCI|北大核心|EI|SCI/g,"").trim();
    d.authors=textsOf([".wx-tit .author a","#authorpart span a",".author span a",".authorpart a",".brief .author a"]).map(function(a){return a.replace(/[\d,，;；\s]+$/,"").trim();});
    d.journal=textOf([".top-tip a.journal",".top-tip a[href*='navi']",".brief .journal a","a.journalTitle",".top-space a"]);
    d.abstract=textOf(["#ChDivSummary",".abstract-text","#abstract .abstract-text",".wx-tit + .abstract"]);
    d.keywords=textsOf(["#ChDivKeyWord a",".keywords a","p.keywords a"]).map(function(k){return k.replace(/[;；]\s*$/,"").trim();});
    d.doi=extractDoi(document.body.innerText.slice(0,6000));
    var pubInfo=textOf([".top-tip",".brief .date",".doc-top .date"]);d.year=parseYear(pubInfo);
    var vi=pubInfo.match(/(\d{4})\s*[,，]\s*(\d+)\s*[（(](\d+)[)）]/);
    if(vi){d.year=parseInt(vi[1],10);d.volume=vi[2];d.issue=vi[3];}
    if(!d.year){var ym=document.body.innerText.match(/(20\d{2}|19\d{2})\s*年/);if(ym)d.year=parseInt(ym[1],10);}
    return d;
  }

  /* PubMed */
  function extractPubmed(){
    var d=fromHighwire();d.site="pubmed";
    if(!d.title)d.title=textOf(["h1.heading-title",".heading-title"]);
    if(!d.abstract)d.abstract=textOf(["#abstract .abstract-content","#eng-abstract",".abstract-content"]);
    if(!d.authors.length)d.authors=textsOf([".authors-list .full-name",".authors-list-item .full-name"]);
    if(!d.pmid){var pm=location.pathname.match(/\/(\d{6,9})\/?/);if(pm)d.pmid=pm[1];if(!d.pmid)d.pmid=textOf(["strong.current-id"]);}
    if(!d.doi)d.doi=extractDoi(textOf([".identifier.doi",".doi",".citation-doi"]));
    return d;
  }

  /* arXiv */
  function extractArxiv(){
    var d=fromHighwire();d.site="arxiv";
    if(!d.title)d.title=textOf(["h1.title"]).replace(/^Title:\s*/i,"");
    if(!d.authors.length)d.authors=textsOf([".authors a"]);
    if(!d.abstract)d.abstract=textOf(["blockquote.abstract"]).replace(/^Abstract:\s*/i,"");
    if(!d.journal)d.journal="arXiv preprint";
    var am=location.pathname.match(/(\d{4}\.\d{4,5})/);if(am&&!d.doi)d.doi="10.48550/arXiv."+am[1];
    return d;
  }

  /* 主抽取函数 */
  function extract(){
    var result=blank();
    var host=location.hostname.toLowerCase();

    if(host.indexOf("cnki.net")>-1){try{result=fill(extractCnki(),result);}catch(e){}}
    else if(host.indexOf("pubmed.ncbi.nlm.nih.gov")>-1){try{result=fill(extractPubmed(),result);}catch(e){}}
    else if(host.indexOf("arxiv.org")>-1){try{result=fill(extractArxiv(),result);}catch(e){}}

    try{result=fill(result,fromHighwire());}catch(e){}
    try{result=fill(result,fromDublinCore());}catch(e){}
    try{result=fill(result,fromJsonLd());}catch(e){}

    if(!result.title){result.title=clean(meta(["og:title","twitter:title"])||document.title).replace(/\s*[-|–—]\s*[^-|–—]{2,30}$/,"").trim();}
    if(!result.abstract)result.abstract=clean(meta(["og:description","description"]));
    if(!result.doi)result.doi=extractDoi((document.body.innerText||"").slice(0,8000));
    if(!result.url)result.url=location.href;

    var seen={};
    result.authors=(result.authors||[]).map(clean).filter(function(a){if(!a||a.length>60)return false;var k=a.toLowerCase();if(seen[k])return false;seen[k]=1;return true;});
    result.keywords=(result.keywords||[]).map(clean).filter(Boolean);

    result.adapter=result.site||"generic";
    return result;
  }

  /* ================================================================ */
  /* 面板 UI                                                            */
  /* ================================================================ */

  var CSS =
    ".gwb-bm-overlay{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center;padding:20px}" +
    ".gwb-bm-panel{width:420px;max-height:80vh;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.22);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;line-height:1.5;color:#0f172a;display:flex;flex-direction:column;overflow:hidden}" +
    ".gwb-bm-hd{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #e2e8f0;flex-shrink:0}" +
    ".gwb-bm-hd__title{font-size:15px;font-weight:600;color:#2563eb;margin:0;display:flex;align-items:center;gap:8px}" +
    ".gwb-bm-close{border:none;background:none;color:#64748b;font-size:20px;cursor:pointer;padding:2px;border-radius:4px;line-height:1}" +
    ".gwb-bm-close:hover{color:#ef4444;background:#f1f5f9}" +
    ".gwb-bm-body{flex:1;overflow-y:auto;padding:16px 18px}" +
    ".gwb-bm-field{margin-bottom:12px}.gwb-bm-field label{display:block;font-size:11px;font-weight:500;color:#64748b;margin-bottom:3px}.gwb-bm-field input,.gwb-bm-field textarea{width:100%;padding:7px 10px;border:1px solid #e2e8f0;border-radius:7px;font-family:inherit;font-size:12.5px;color:#0f172a;resize:vertical}.gwb-bm-field input:focus,.gwb-bm-field textarea:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 2px rgba(37,99,235,.12)}" +
    ".gwb-bm-row{display:flex;gap:8px}.gwb-bm-row .gwb-bm-field{flex:1}" +
    ".gwb-bm-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 18px;border-top:1px solid #e2e8f0;background:#f8fafc;flex-shrink:0}" +
    ".gwb-bm-ft__hint{font-size:11.5px;color:#64748b;flex:1;min-width:0}" +
    ".gwb-bm-btn{padding:8px 18px;border:1px solid transparent;border-radius:7px;font-family:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background .15s ease}" +
    ".gwb-bm-btn--primary{background:#2563eb;color:#fff}.gwb-bm-btn--primary:hover:not(:disabled){background:#1d4ed8}.gwb-bm-btn--primary:disabled{opacity:.5;cursor:not-allowed}" +
    ".gwb-bm-btn--ghost{background:#fff;border-color:#e2e8f0;color:#0f172a}.gwb-bm-btn--ghost:hover{border-color:#2563eb;color:#2563eb}" +
    ".gwb-bm-status{display:flex;align-items:center;gap:6px;padding:8px 18px;font-size:12px;border-bottom:1px solid #e2e8f0;flex-shrink:0}" +
    ".gwb-bm-status--ok{background:#f0fdf4;color:#166534}.gwb-bm-status--err{background:#fef2f2;color:#991b1b}.gwb-bm-status--checking{background:#fffbeb;color:#92400e}" +
    ".gwb-bm-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}" +
    ".gwb-bm-more{margin-top:4px;border-top:1px dashed #e2e8f0;padding-top:8px}.gwb-bm-more summary{cursor:pointer;font-size:12px;color:#64748b;padding:2px 0;user-select:none}.gwb-bm-more summary:hover{color:#2563eb}";

  var overlay, panel;

  function buildPanel(data) {
    overlay = document.createElement("div");
    overlay.className = "gwb-bm-overlay";
    overlay.innerHTML =
      '<div class="gwb-bm-panel">' +
      '  <div class="gwb-bm-hd"><h2 class="gwb-bm-hd__title">📖 文献剪藏</h2><button class="gwb-bm-close" type="button">&times;</button></div>' +
      '  <div id="gwb-bm-status" class="gwb-bm-status gwb-bm-status--checking"><span class="gwb-bm-dot"></span><span>正在连接…</span></div>' +
      '  <div class="gwb-bm-body">' +
      '    <div class="gwb-bm-field"><label>标题 *</label><textarea id="gwb-bm-t" rows="2"></textarea></div>' +
      '    <div class="gwb-bm-field"><label>作者</label><input id="gwb-bm-a" type="text" placeholder="多位作者用逗号分隔"/></div>' +
      '    <div class="gwb-bm-row"><div class="gwb-bm-field"><label>期刊</label><input id="gwb-bm-j" type="text"/></div><div class="gwb-bm-field"><label>年份</label><input id="gwb-bm-y" type="text" inputmode="numeric"/></div></div>' +
      '    <div class="gwb-bm-field"><label>DOI</label><input id="gwb-bm-d" type="text" placeholder="10.xxxx/xxxxx"/></div>' +
      '    <div class="gwb-bm-more"><summary>更多字段</summary>' +
      '      <div class="gwb-bm-row"><div class="gwb-bm-field"><label>卷</label><input id="gwb-bm-v" type="text"/><label>期</label><input id="gwb-bm-i" type="text"/><label>页码</label><input id="gwb-bm-p" type="text"/></div></div>' +
      '      <div class="gwb-bm-field"><label>关键词</label><input id="gwb-bm-k" type="text"/></div>' +
      '      <div class="gwb-bm-field"><label>摘要</label><textarea id="gwb-bm-ab" rows="4"></textarea></div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="gwb-bm-ft"><span id="gwb-bm-hint" class="gwb-bm-ft__hint"></span><button id="gwb-bm-save" class="gwb-bm-btn gwb-bm-btn--primary" disabled>存入文献库</button></div>' +
      "</div>";

    var style = document.createElement("style");
    style.textContent = CSS;
    overlay.appendChild(style);
    document.body.appendChild(overlay);

    // 填充数据
    var f = {
      t: overlay.querySelector("#gwb-bm-t"),
      a: overlay.querySelector("#gwb-bm-a"),
      j: overlay.querySelector("#gwb-bm-j"),
      y: overlay.querySelector("#gwb-bm-y"),
      d: overlay.querySelector("#gwb-bm-d"),
      v: overlay.querySelector("#gwb-bm-v"),
      i: overlay.querySelector("#gwb-bm-i"),
      p: overlay.querySelector("#gwb-bm-p"),
      k: overlay.querySelector("#gwb-bm-k"),
      ab: overlay.querySelector("#gwb-bm-ab"),
    };

    f.t.value = data.title || "";
    f.a.value = (data.authors || []).join(", ");
    f.j.value = data.journal || "";
    f.y.value = data.year || "";
    f.d.value = data.doi || "";
    f.v.value = data.volume || "";
    f.i.value = data.issue || "";
    f.p.value = data.pages || "";
    f.k.value = (data.keywords || []).join(", ");
    f.ab.value = data.abstract || "";

    var saveBtn = overlay.querySelector("#gwb-bm-save");

    Object.values(f).forEach(function(inp){
      inp.addEventListener("input",function(){saveBtn.disabled=!f.t.value.trim();});
    });

    saveBtn.addEventListener("click", function () {
      doSave(f, saveBtn);
    });

    overlay.querySelector(".gwb-bm-close").addEventListener("click", closePanel);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closePanel();
    });

    // 测试连接
    testConnection();
  }

  function setStatus(text, kind) {
    var el = document.getElementById("gwb-bm-status");
    if (!el) return;
    el.className = "gwb-bm-status gwb-bm-status--" + (kind || "checking");
    el.innerHTML = '<span class="gwb-bm-dot"></span><span>' + text + "</span>";
  }

  function setHint(text, kind) {
    var el = document.getElementById("gwb-bm-hint");
    if (!el) return;
    el.textContent = text;
    el.className = "gwb-bm-ft__hint" + (kind ? " gwb-bm-ft__hint--" + kind : "");
  }

  function closePanel() {
    if (overlay) { overlay.remove(); overlay = null; }
    window.__GWB_CLIPPER_BM_LOADED__ = false;
  }

  /* ================================================================ */
  /* API 调用                                                           */
  /* ================================================================ */

  function apiUrl(path) {
    return CONFIG.serverUrl.replace(/\/+$/, "") + "/api/papers" + path;
  }

  function headers() {
    var h = { "Content-Type": "application/json" };
    if (CONFIG.apiKey) h["X-Api-Key"] = CONFIG.apiKey;
    return h;
  }

  async function testConnection() {
    try {
      var res = await fetch(apiUrl("/clip"), { headers: headers() });
      if (res.status === 401) { setStatus("密钥不正确", "err"); return; }
      if (!res.ok) { setStatus("连接失败 (" + res.status + ")", "err"); return; }
      var data = await res.json();
      setStatus("已连接 · 文献库 " + (data.paperCount || 0) + " 篇", "ok");
    } catch (e) {
      setStatus("无法连接工作台", "err");
    }
  }

  async function doSave(f, btn) {
    var payload = {
      title: f.t.value.trim(),
      authors: String(f.a.value)
        .split(/\s*[,，;；]\s*/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean),
      journal: f.j.value.trim() || null,
      year: f.y.value.trim() || null,
      doi: f.d.value.trim() || null,
      volume: f.v.value.trim() || null,
      issue: f.i.value.trim() || null,
      pages: f.p.value.trim() || null,
      keywords: String(f.k.value)
        .split(/\s*[,，;；]\s*/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean),
      abstract: f.ab.value.trim() || null,
      url: location.href,
    };

    if (!payload.title) { setHint("请填写标题", "err"); return; }

    btn.disabled = true;
    btn.textContent = "保存中…";

    try {
      var res = await fetch(apiUrl("/clip"), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload),
      });

      var data = await res.json().catch(function () { return {}; });

      if (!res.ok) {
        setHint(data.error || "保存失败", "err");
        btn.disabled = false;
        btn.textContent = "存入文献库";
        return;
      }

      var msg =
        data.status === "created"
          ? "已存入文献库"
          : data.status === "updated"
          ? "已补全元数据"
          : "库中已有该文献";
      setHint(msg, "ok");
      btn.textContent = "✓ 完成";
      setTimeout(closePanel, 1200);
    } catch (e) {
      setHint("无法连接工作台", "err");
      btn.disabled = false;
      btn.textContent = "存入文献库";
    }
  }

  /* ================================================================ */
  /* 启动                                                              */
  /* ================================================================ */

  var data = extract();
  if (!data.title && !data.doi) {
    alert(
      "GradWorkbench 剪藏\n\n未能识别当前页面的论文信息。\n\n请在论文详情页使用（如知网详情、PubMed、arXiv 等），或手动填写标题与 DOI。"
    );
    window.__GWB_CLIPPER_BM_LOADED__ = false;
    return;
  }

  buildPanel(data);
})();
