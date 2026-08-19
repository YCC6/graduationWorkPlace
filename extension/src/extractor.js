/**
 * GradWorkbench 文献元数据抽取器
 * ==================================================================
 * 单一数据源：浏览器扩展的 content script 与小书签共用此文件。
 * 修改这里，`npm run build:bookmarklet` 会自动同步到小书签。
 *
 * 抽取优先级：
 *   站点专用适配器  →  Highwire meta  →  Dublin Core  →  JSON-LD  →  兜底
 * 任何一层拿不到的字段，都会由下一层补齐（而不是整层放弃）。
 */
(function (global) {
  "use strict";

  var VERSION = "1.0.0";

  /* ================================================================ */
  /* 基础工具                                                          */
  /* ================================================================ */

  function $(sel, root) {
    try {
      return (root || document).querySelector(sel);
    } catch (e) {
      return null;
    }
  }

  function $$(sel, root) {
    try {
      return Array.prototype.slice.call(
        (root || document).querySelectorAll(sel)
      );
    } catch (e) {
      return [];
    }
  }

  /** 取第一个非空选择器的文本 */
  function textOf(selectors, root) {
    var list = [].concat(selectors);
    for (var i = 0; i < list.length; i++) {
      var el = $(list[i], root);
      if (el) {
        var t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t) return t;
      }
    }
    return "";
  }

  /** 取所有匹配元素的文本数组 */
  function textsOf(selectors, root) {
    var list = [].concat(selectors);
    for (var i = 0; i < list.length; i++) {
      var els = $$(list[i], root);
      if (els.length) {
        var out = els
          .map(function (el) {
            return (el.textContent || "").replace(/\s+/g, " ").trim();
          })
          .filter(Boolean);
        if (out.length) return out;
      }
    }
    return [];
  }

  /** 读取 <meta name|property=...> 的第一个值 */
  function meta(names) {
    var list = [].concat(names);
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var el =
        $('meta[name="' + n + '"]') ||
        $('meta[property="' + n + '"]') ||
        $('meta[name="' + n.toLowerCase() + '"]');
      if (el) {
        var c = (el.getAttribute("content") || "").trim();
        if (c) return c;
      }
    }
    return "";
  }

  /** 读取同名 meta 的全部值（作者常常是多条同名 meta） */
  function metaAll(names) {
    var list = [].concat(names);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var els = $$(
        'meta[name="' + list[i] + '"], meta[property="' + list[i] + '"]'
      );
      els.forEach(function (el) {
        var c = (el.getAttribute("content") || "").trim();
        if (c) out.push(c);
      });
      if (out.length) break;
    }
    // 单条 meta 里用分号/逗号塞了多个作者的情况
    if (out.length === 1 && /[;]/.test(out[0])) {
      out = out[0].split(/\s*;\s*/).filter(Boolean);
    }
    return out;
  }

  function extractDoi(text) {
    if (!text) return "";
    var stripped = String(text).replace(
      /https?:\/\/(dx\.)?doi\.org\//gi,
      ""
    );
    var m = stripped.match(/10\.\d{4,9}\/[^\s"'<>）)]+/);
    if (m) return m[0].replace(/[.;,)\]}>]+$/, "");
    var m2 = stripped.match(/(?:doi|DOI)\s*[:：]\s*(\S+)/);
    if (m2) return m2[1].replace(/[.;,)\]}>]+$/, "");
    return "";
  }

  function parseYear(v) {
    if (!v) return null;
    var m = String(v).match(/(1[5-9]\d{2}|20\d{2}|21\d{2})/);
    return m ? parseInt(m[1], 10) : null;
  }

  function clean(s) {
    return String(s || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** 空元数据骨架 */
  function blank() {
    return {
      title: "",
      authors: [],
      journal: "",
      year: null,
      volume: "",
      issue: "",
      pages: "",
      doi: "",
      abstract: "",
      keywords: [],
      url: location.href,
      pmid: "",
      site: "",
    };
  }

  /** 用 b 补全 a 的空字段（a 优先） */
  function fill(a, b) {
    if (!b) return a;
    Object.keys(b).forEach(function (k) {
      var av = a[k];
      var bv = b[k];
      var aEmpty =
        av === null ||
        av === undefined ||
        av === "" ||
        (Array.isArray(av) && av.length === 0);
      var bEmpty =
        bv === null ||
        bv === undefined ||
        bv === "" ||
        (Array.isArray(bv) && bv.length === 0);
      if (aEmpty && !bEmpty) a[k] = bv;
    });
    return a;
  }

  /* ================================================================ */
  /* 通用层 1：Highwire Press meta（绝大多数出版社都支持）              */
  /* ================================================================ */

  function fromHighwire() {
    var d = blank();
    d.title = clean(meta(["citation_title"]));
    d.authors = metaAll(["citation_author"]);
    d.journal = clean(
      meta([
        "citation_journal_title",
        "citation_conference_title",
        "citation_inbook_title",
      ])
    );
    d.year = parseYear(
      meta([
        "citation_publication_date",
        "citation_date",
        "citation_online_date",
        "citation_year",
      ])
    );
    d.volume = clean(meta(["citation_volume"]));
    d.issue = clean(meta(["citation_issue"]));

    var fp = clean(meta(["citation_firstpage"]));
    var lp = clean(meta(["citation_lastpage"]));
    d.pages = fp && lp ? fp + "-" + lp : fp || "";

    d.doi = extractDoi(meta(["citation_doi", "DOI", "dc.identifier"]));
    d.abstract = clean(meta(["citation_abstract", "description"]));
    d.pmid = clean(meta(["citation_pmid"]));

    var kw = meta(["citation_keywords", "keywords"]);
    if (kw) d.keywords = kw.split(/\s*[;,，、]\s*/).filter(Boolean);

    d.site = "highwire";
    return d;
  }

  /* ================================================================ */
  /* 通用层 2：Dublin Core                                             */
  /* ================================================================ */

  function fromDublinCore() {
    var d = blank();
    d.title = clean(meta(["DC.title", "dc.title", "DCTERMS.title"]));
    d.authors = metaAll(["DC.creator", "dc.creator", "DC.Creator"]);
    d.journal = clean(meta(["DC.source", "dc.source", "prism.publicationName"]));
    d.year = parseYear(
      meta(["DC.date", "dc.date", "DCTERMS.issued", "prism.publicationDate"])
    );
    d.volume = clean(meta(["prism.volume"]));
    d.issue = clean(meta(["prism.number"]));
    d.doi = extractDoi(meta(["DC.identifier", "dc.identifier", "prism.doi"]));
    d.abstract = clean(meta(["DC.description", "dc.description"]));
    d.site = "dublincore";
    return d;
  }

  /* ================================================================ */
  /* 通用层 3：JSON-LD（schema.org ScholarlyArticle）                  */
  /* ================================================================ */

  function fromJsonLd() {
    var d = blank();
    var nodes = $$('script[type="application/ld+json"]');

    for (var i = 0; i < nodes.length; i++) {
      var data;
      try {
        data = JSON.parse(nodes[i].textContent);
      } catch (e) {
        continue;
      }

      var items = Array.isArray(data) ? data : [data];
      if (data && data["@graph"]) items = data["@graph"];

      for (var j = 0; j < items.length; j++) {
        var it = items[j];
        if (!it || typeof it !== "object") continue;
        var type = String(it["@type"] || "");
        if (!/Article|Publication|Book|Thesis|Dataset/i.test(type)) continue;

        d.title = clean(it.headline || it.name || "");

        var au = it.author || it.creator;
        if (au) {
          var arr = Array.isArray(au) ? au : [au];
          d.authors = arr
            .map(function (a) {
              return typeof a === "string" ? a : clean(a.name || "");
            })
            .filter(Boolean);
        }

        if (it.isPartOf) {
          d.journal = clean(it.isPartOf.name || "");
        } else if (it.publisher) {
          d.journal = clean(it.publisher.name || it.publisher || "");
        }

        d.year = parseYear(it.datePublished || it.dateCreated);
        d.abstract = clean(it.abstract || it.description || "");
        d.doi = extractDoi(it.identifier || it.sameAs || "");
        d.site = "jsonld";
        return d;
      }
    }
    return d;
  }

  /* ================================================================ */
  /* 站点适配器                                                        */
  /* ================================================================ */

  var adapters = [];

  /* ---------------- 中国知网 CNKI ---------------- */
  adapters.push({
    id: "cnki",
    name: "中国知网",
    match: function () {
      return /(^|\.)cnki\.net$/.test(location.hostname);
    },
    extract: function () {
      var d = blank();
      d.site = "cnki";

      // 标题：知网详情页有多套模板
      d.title = textOf([
        ".wx-tit h1",
        ".brief h1",
        "h1.title",
        ".title-text",
        ".doc-top h1",
      ]);
      // 去掉标题里混进来的"网络首发"等角标
      d.title = d.title
        .replace(/网络首发|优先出版|OA|CSSCI|北大核心|EI|SCI/g, "")
        .trim();

      // 作者
      d.authors = textsOf([
        ".wx-tit .author a",
        "#authorpart span a",
        ".author span a",
        ".authorpart a",
        ".brief .author a",
      ]).map(function (a) {
        // 知网作者常带上标数字（机构编号）
        return a.replace(/[\d,，;；\s]+$/, "").trim();
      });

      // 期刊名
      d.journal = textOf([
        ".top-tip a.journal",
        ".top-tip a[href*='navi']",
        ".brief .journal a",
        "a.journalTitle",
        ".top-space a",
      ]);

      // 摘要
      d.abstract = textOf([
        "#ChDivSummary",
        ".abstract-text",
        "#abstract .abstract-text",
        ".wx-tit + .abstract",
      ]);

      // 关键词
      d.keywords = textsOf([
        "#ChDivKeyWord a",
        ".keywords a",
        "p.keywords a",
      ]).map(function (k) {
        return k.replace(/[;；]\s*$/, "").trim();
      });

      // DOI / 年份 / 卷期：知网把这些放在 .rowtit / .row 的键值对里
      var rows = $$(".row, .top-space, .brief .row, .doc-info li");
      rows.forEach(function (row) {
        var t = clean(row.textContent);
        if (/DOI/i.test(t) && !d.doi) {
          d.doi = extractDoi(t);
        }
      });
      if (!d.doi) d.doi = extractDoi(document.body.innerText.slice(0, 6000));

      // 年份：优先从"期刊 年,卷(期)"里取
      var pubInfo = textOf([".top-tip", ".brief .date", ".doc-top .date"]);
      d.year = parseYear(pubInfo);
      var vi = pubInfo.match(/(\d{4})\s*[,，]\s*(\d+)\s*[（(](\d+)[)）]/);
      if (vi) {
        d.year = parseInt(vi[1], 10);
        d.volume = vi[2];
        d.issue = vi[3];
      }

      if (!d.year) {
        // 兜底：从整页文本找 "2023年" 之类
        var ym = document.body.innerText.match(/(20\d{2}|19\d{2})\s*年/);
        if (ym) d.year = parseInt(ym[1], 10);
      }

      return d;
    },
  });

  /* ---------------- 万方数据 ---------------- */
  adapters.push({
    id: "wanfang",
    name: "万方数据",
    match: function () {
      return /wanfangdata\.com\.cn$/.test(location.hostname);
    },
    extract: function () {
      var d = blank();
      d.site = "wanfang";
      d.title = textOf([".detailTitle", ".title span", "h1.detail-title"]);
      d.authors = textsOf([".author a", ".detailAuthor a", ".authors a"]);
      d.journal = textOf([".periodical a", ".detailPeriodical a"]);
      d.abstract = textOf([".summary .text", ".abstract .text", "#abstract"]);
      d.keywords = textsOf([".keyword a", ".keywords a"]);
      d.doi = extractDoi(document.body.innerText.slice(0, 6000));
      d.year = parseYear(textOf([".periodical", ".detailPeriodical"]));
      return d;
    },
  });

  /* ---------------- PubMed ---------------- */
  adapters.push({
    id: "pubmed",
    name: "PubMed",
    match: function () {
      return /pubmed\.ncbi\.nlm\.nih\.gov$/.test(location.hostname);
    },
    extract: function () {
      // PubMed 的 Highwire meta 很完整，先取它再补摘要
      var d = fromHighwire();
      d.site = "pubmed";

      if (!d.title) d.title = textOf(["h1.heading-title", ".heading-title"]);

      if (!d.abstract) {
        d.abstract = textOf([
          "#abstract .abstract-content",
          "#eng-abstract",
          ".abstract-content",
        ]);
      }

      if (!d.authors.length) {
        d.authors = textsOf([
          ".authors-list .full-name",
          ".authors-list-item .full-name",
        ]);
      }

      if (!d.pmid) {
        var pm = location.pathname.match(/\/(\d{6,9})\/?/);
        if (pm) d.pmid = pm[1];
        if (!d.pmid) d.pmid = textOf(["strong.current-id"]);
      }

      if (!d.doi) {
        d.doi = extractDoi(textOf([".identifier.doi", ".doi", ".citation-doi"]));
      }

      if (!d.keywords.length) {
        var kwBlock = $$("#abstract p").filter(function (p) {
          return /^\s*Keywords\s*:/i.test(p.textContent || "");
        })[0];
        if (kwBlock) {
          d.keywords = kwBlock.textContent
            .replace(/^\s*Keywords\s*:/i, "")
            .split(/\s*[;,]\s*/)
            .map(clean)
            .filter(Boolean);
        }
      }

      return d;
    },
  });

  /* ---------------- Google Scholar ---------------- */
  adapters.push({
    id: "scholar",
    name: "Google Scholar",
    match: function () {
      return /scholar\.google\./.test(location.hostname);
    },
    /** Scholar 是列表页，单条抽取取第一条结果 */
    extract: function () {
      var list = scholarItems();
      var d = list.length ? list[0].data : blank();
      d.site = "scholar";
      return d;
    },
    /** 列表模式：返回页面上所有条目 */
    list: function () {
      return scholarItems();
    },
  });

  /**
   * 解析 Google Scholar 结果条目。
   * .gs_a 的格式通常是： "作者1, 作者2 - 期刊名, 年份 - 出版商"
   */
  function scholarItems() {
    var rows = $$(".gs_r.gs_or.gs_scl, #gs_res_ccl_mid .gs_r");
    return rows
      .map(function (row, idx) {
        var d = blank();
        d.site = "scholar";

        var titleEl = $(".gs_rt a", row);
        var titleRaw = titleEl
          ? titleEl.textContent
          : textOf([".gs_rt"], row);
        // 去掉 [PDF] [HTML] [引用] [B] 之类前缀
        d.title = clean(String(titleRaw).replace(/^\s*\[[^\]]{1,8}\]\s*/, ""));
        d.url = titleEl ? titleEl.href : location.href;

        var line = textOf([".gs_a"], row);
        if (line) {
          var parts = line.split(" - ");
          if (parts[0]) {
            d.authors = parts[0]
              .split(/\s*,\s*/)
              .map(clean)
              .filter(function (a) {
                return a && a !== "…" && a !== "...";
              });
          }
          if (parts[1]) {
            var mid = parts[1];
            d.year = parseYear(mid);
            d.journal = clean(mid.replace(/,?\s*(19|20)\d{2}\s*$/, ""));
          }
        }

        d.abstract = textOf([".gs_rs"], row).replace(/^…\s*/, "");

        // Scholar 页面上没有 DOI，但链接里有时带着
        d.doi = extractDoi(d.url) || extractDoi(row.innerHTML);

        return {
          index: idx,
          element: row,
          data: d,
        };
      })
      .filter(function (item) {
        return item.data.title;
      });
  }

  /* ---------------- arXiv ---------------- */
  adapters.push({
    id: "arxiv",
    name: "arXiv",
    match: function () {
      return /arxiv\.org$/.test(location.hostname);
    },
    extract: function () {
      var d = fromHighwire();
      d.site = "arxiv";
      if (!d.title) {
        d.title = textOf(["h1.title"]).replace(/^Title:\s*/i, "");
      }
      if (!d.authors.length) {
        d.authors = textsOf([".authors a"]);
      }
      if (!d.abstract) {
        d.abstract = textOf(["blockquote.abstract"]).replace(
          /^Abstract:\s*/i,
          ""
        );
      }
      if (!d.journal) d.journal = "arXiv preprint";
      var am = location.pathname.match(/(\d{4}\.\d{4,5})/);
      if (am && !d.doi) d.doi = "10.48550/arXiv." + am[1];
      return d;
    },
  });

  /* ---------------- Semantic Scholar ---------------- */
  adapters.push({
    id: "semanticscholar",
    name: "Semantic Scholar",
    match: function () {
      return /semanticscholar\.org$/.test(location.hostname);
    },
    extract: function () {
      var d = fromHighwire();
      d.site = "semanticscholar";
      if (!d.title) d.title = textOf(["h1[data-test-id='paper-detail-title']"]);
      if (!d.abstract) d.abstract = textOf([".abstract__text", "[data-test-id='abstract-text']"]);
      return d;
    },
  });

  /* ---------------- ScienceDirect（Highwire 不全，需补） ---------------- */
  adapters.push({
    id: "sciencedirect",
    name: "ScienceDirect",
    match: function () {
      return /sciencedirect\.com$/.test(location.hostname);
    },
    extract: function () {
      var d = fromHighwire();
      d.site = "sciencedirect";
      if (!d.title) d.title = textOf([".title-text", "h1 .title-text"]);
      if (!d.abstract) {
        d.abstract = textOf([
          ".abstract.author div",
          "#abstracts .abstract div",
        ]);
      }
      if (!d.authors.length) {
        d.authors = textsOf(["#author-group .content .text"]).map(clean);
      }
      if (!d.keywords.length) {
        d.keywords = textsOf([".keywords-section .keyword span"]);
      }
      return d;
    },
  });

  /* ================================================================ */
  /* 主入口                                                            */
  /* ================================================================ */

  function currentAdapter() {
    for (var i = 0; i < adapters.length; i++) {
      try {
        if (adapters[i].match()) return adapters[i];
      } catch (e) {
        /* 忽略单个适配器的匹配异常 */
      }
    }
    return null;
  }

  /**
   * 抽取当前页面的论文元数据。
   * 返回对象一定包含所有字段（可能为空字符串/空数组）。
   */
  function extract() {
    var result = blank();
    var adapter = currentAdapter();

    // 1. 站点专用
    if (adapter) {
      try {
        result = fill(adapter.extract(), result);
      } catch (e) {
        console.warn("[GWB] 适配器 " + adapter.id + " 抽取失败:", e);
      }
    }

    // 2~4. 通用层逐级补空
    try {
      result = fill(result, fromHighwire());
    } catch (e) {}
    try {
      result = fill(result, fromDublinCore());
    } catch (e) {}
    try {
      result = fill(result, fromJsonLd());
    } catch (e) {}

    // 5. 最后兜底
    if (!result.title) {
      result.title = clean(
        meta(["og:title", "twitter:title"]) || document.title
      );
      // 去掉站点名后缀，如 "论文标题 - ScienceDirect"
      result.title = result.title
        .replace(/\s*[-|–—]\s*[^-|–—]{2,30}$/, "")
        .trim();
    }
    if (!result.abstract) {
      result.abstract = clean(meta(["og:description", "description"]));
    }
    if (!result.doi) {
      // 从可见文本里找（限制长度避免大页面卡顿）
      result.doi = extractDoi(
        (document.body.innerText || "").slice(0, 8000)
      );
    }
    if (!result.url) result.url = location.href;

    // 清理：作者去重去空
    var seen = {};
    result.authors = (result.authors || [])
      .map(clean)
      .filter(function (a) {
        if (!a || a.length > 60) return false;
        var k = a.toLowerCase();
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      });

    result.keywords = (result.keywords || []).map(clean).filter(Boolean);
    result.adapter = adapter ? adapter.id : "generic";
    result.adapterName = adapter ? adapter.name : "通用解析";

    return result;
  }

  /**
   * 列表模式：用于 Google Scholar 这类搜索结果页，
   * 返回 [{ index, element, data }]，没有列表能力时返回 []。
   */
  function extractList() {
    var adapter = currentAdapter();
    if (adapter && typeof adapter.list === "function") {
      try {
        return adapter.list();
      } catch (e) {
        return [];
      }
    }
    return [];
  }

  /** 当前页面是否像一个论文详情页（决定要不要显示悬浮按钮） */
  function looksLikePaper() {
    if (currentAdapter()) return true;
    if (meta(["citation_title"])) return true;
    if (meta(["DC.title"]) && meta(["DC.creator"])) return true;
    return Boolean(extractDoi((document.body.innerText || "").slice(0, 4000)));
  }

  global.GWBExtractor = {
    version: VERSION,
    extract: extract,
    extractList: extractList,
    looksLikePaper: looksLikePaper,
    currentAdapter: currentAdapter,
    _utils: { extractDoi: extractDoi, parseYear: parseYear, meta: meta },
  };
})(typeof window !== "undefined" ? window : this);
