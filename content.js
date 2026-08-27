"use strict";

const HIDDEN_CLASS = "dlsite-addon-hidden";

const STORAGE_KEYS = {
  circles: "hiddenCircles",
  works: "hiddenWorks",
  genres: "hiddenGenres",
  genreCache: "genreCacheData",
  fetchGenresFromDetail: "fetchGenresFromDetail",
};

const DEFAULTS = {
  [STORAGE_KEYS.circles]: "",
  [STORAGE_KEYS.works]: "",
  [STORAGE_KEYS.genres]: "",
  [STORAGE_KEYS.genreCache]: {},
  [STORAGE_KEYS.fetchGenresFromDetail]: false,
};

const CACHE_CONFIG = {
  MAX_ITEMS: 5000,
  TTL_MS: 90 * 24 * 60 * 60 * 1000,
};

const api = typeof browser !== "undefined" ? browser : chrome;

let filters = { circles: [], works: [], genres: [] };
let fetchGenresFromDetail = false;
let observer = null;
let scheduled = false;

const genreCache = new Map();
let cacheDirty = false;
let saveCacheTimer = null;
const fetchingIds = new Set();

function parseLines(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalize(text) {
  return String(text ?? "")
    .replace(/^[\s\r\n\t]+|[\s\r\n\t]+$/g, "")
    .replace(/^([サークル名|作者|ブランド|サークル]+[\s:\：]+)/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function stripQuotes(str) {
  return str.replace(/^["”『「]+|["”』」]+$/g, "").trim();
}

function isMatch(target, keywords) {
  const haystack = normalize(target);
  if (!haystack || keywords.length === 0) {
    return false;
  }

  return keywords.some((keyword) => {
    let raw = keyword.trim();
    if (!raw) return false;

    const isExact = /^["”『「].+["”』」]$/.test(raw);
    const cleanKeyword = normalize(stripQuotes(raw));

    if (!cleanKeyword) return false;

    if (isExact) {
      return haystack === cleanKeyword;
    } else {
      return haystack.includes(cleanKeyword);
    }
  });
}

function firstText(root, selector) {
  const node = root.querySelector(selector);
  if (!node) {
    return "";
  }
  const titled = node.getAttribute("title");
  if (titled && titled.trim()) {
    return titled.trim();
  }
  return (node.textContent || "").trim();
}

function collectTexts(root, selector) {
  return Array.from(root.querySelectorAll(selector))
    .map((node) => (node.textContent || "").trim())
    .filter(Boolean);
}

function extractProductId(item) {
  const ga4El = item.querySelector("[data-product_id]");
  if (ga4El) {
    const pId = ga4El.getAttribute("data-product_id");
    if (pId) return pId.toUpperCase();
  }

  const dataId = item.getAttribute("data-list_item_product_id") || item.getAttribute("data-product_id") || item.getAttribute("data-prod");
  if (dataId) return dataId.toUpperCase();

  const links = item.querySelectorAll("a[href]");
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    const match = href.match(/(RJ|VJ|BJ|RE)\d{6,8}/i);
    if (match) {
      return match[0].toUpperCase();
    }
  }

  const matchId = (item.id || "").match(/(RJ|VJ|BJ|RE)\d{6,8}/i);
  if (matchId) return matchId[0].toUpperCase();

  return null;
}

function checkIsAnnounce(item) {
  if (window.location.pathname.includes("/announce/")) {
    return true;
  }
  const links = item.querySelectorAll("a[href]");
  for (const a of links) {
    const href = a.getAttribute("href") || "";
    if (href.includes("/announce/")) {
      return true;
    }
  }
  return false;
}

function getWorkItems(root = document) {
  const nodes = Array.from(root.querySelectorAll(SELECTORS.workItem));
  if (root instanceof Element && root.matches(SELECTORS.workItem)) {
    nodes.unshift(root);
  }

  return nodes.filter((el) => {
    // スライダー内のダミーやリンク切れ要素を除外するため
    if (el.classList.contains("slider_item") && !el.querySelector("a[href*='/product_id/']")) {
      return false;
    }
    // 親要素がWorkItemの場合は重複処理を防止するため外側のみ対象とする
    const parent = el.parentElement;
    return !parent || !parent.closest(SELECTORS.workItem);
  });
}

function loadGenreCache(rawCache) {
  genreCache.clear();
  const now = Date.now();
  let hasInvalidOrExpired = false;

  if (rawCache && typeof rawCache === "object") {
    for (const [id, entry] of Object.entries(rawCache)) {
      if (
        entry &&
        Array.isArray(entry.genres) &&
        entry.genres.length > 0 &&
        typeof entry.updatedAt === "number" &&
        now - entry.updatedAt < CACHE_CONFIG.TTL_MS
      ) {
        genreCache.set(id, entry);
      } else {
        hasInvalidOrExpired = true;
      }
    }
  }

  if (hasInvalidOrExpired) {
    scheduleSaveCache();
  }
}

function scheduleSaveCache() {
  cacheDirty = true;
  if (saveCacheTimer) clearTimeout(saveCacheTimer);

  // 短時間の連続書き込みによるストレージ負荷を軽減するためデバウンスを行う
  saveCacheTimer = setTimeout(() => {
    if (!cacheDirty) return;

    if (genreCache.size > CACHE_CONFIG.MAX_ITEMS) {
      const sortedEntries = Array.from(genreCache.entries()).sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt
      );
      const itemsToRemove = genreCache.size - CACHE_CONFIG.MAX_ITEMS;
      for (let i = 0; i < itemsToRemove; i++) {
        genreCache.delete(sortedEntries[i][0]);
      }
    }

    const obj = {};
    for (const [id, entry] of genreCache.entries()) {
      obj[id] = entry;
    }

    api.storage.local.set({ [STORAGE_KEYS.genreCache]: obj }).then(() => {
      cacheDirty = false;
    }).catch(err => {
      console.error("[DLsite 作品フィルタ] キャッシュ保存失敗", err);
    });
  }, 1000);
}

function extractWorkInfo(item) {
  const productId = extractProductId(item);
  let genres = collectTexts(item, SELECTORS.genre);

  if (productId && genreCache.has(productId)) {
    const cacheEntry = genreCache.get(productId);
    cacheEntry.updatedAt = Date.now();
    genres = Array.from(new Set([...genres, ...cacheEntry.genres]));
    scheduleSaveCache();
  }

  const ga4El = item.querySelector("[data-work_name]");
  let title = firstText(item, SELECTORS.workTitle);
  if (!title && ga4El) {
    title = ga4El.getAttribute("data-work_name") || "";
  }

  // 作者名（.author）の混在による誤判定を防ぐため、サークル専用リンク（maker_id）のテキスト取得を優先する
  let circleNode = item.querySelector("a[href*='/maker_id/'], a[href*='/circle/profile/']");
  let circle = circleNode ? (circleNode.getAttribute("title") || circleNode.textContent || "").trim() : "";

  if (!circle) {
    circle = firstText(item, SELECTORS.circleName);
  }

  return {
    productId,
    title,
    circle,
    genres,
    fullText: item.textContent || ""
  };
}

function shouldHide(info) {
  if (info.circle) {
    if (isMatch(info.circle, filters.circles)) return true;
  } else {
    // 要素構造からサークル名が取得できない場合でも、カード全体のテキストからフォールバック判定を行うため
    const partialCircleRules = filters.circles.filter(c => !/^["”『「].+["”』」]$/.test(c.trim()));
    if (partialCircleRules.some(c => isMatch(info.fullText, [c]))) return true;
  }

  if (info.title) {
    if (isMatch(info.title, filters.works)) return true;
  } else {
    const partialWorkRules = filters.works.filter(w => !/^["”『「].+["”』」]$/.test(w.trim()));
    if (partialWorkRules.some(w => isMatch(info.fullText, [w]))) return true;
  }

  return info.genres.some((genre) => isMatch(genre, filters.genres));
}

async function fetchAndApplyGenres(item, productId) {
  if (!productId || genreCache.has(productId) || fetchingIds.has(productId)) return;

  fetchingIds.add(productId);

  const pathParts = window.location.pathname.split("/").filter(Boolean);
  const siteCategory = (pathParts.length > 0 && pathParts[0] !== "fsr") ? pathParts[0] : "maniax";
  
  const isAnnounce = checkIsAnnounce(item);
  const primaryPath = isAnnounce ? "announce" : "work";
  const secondaryPath = isAnnounce ? "work" : "announce";

  // DLsite側のURL設計差異（work/announce）やカテゴリ誤判定による404を防止するためのフォールバック定義
  const urlsToTry = [
    `https://www.dlsite.com/${siteCategory}/${primaryPath}/=/product_id/${productId}.html`,
    `https://www.dlsite.com/${siteCategory}/${secondaryPath}/=/product_id/${productId}.html`
  ];

  for (const workUrl of urlsToTry) {
    try {
      const res = await fetch(workUrl);
      if (!res.ok) continue;

      const htmlText = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, "text/html");

      const genreNodes = doc.querySelectorAll("#work_genre a, .main_genre a, .search_tag a, dd.work_genre a");
      const extractedGenres = Array.from(genreNodes)
        .map(node => node.textContent.trim())
        .filter(Boolean);

      if (extractedGenres.length > 0) {
        genreCache.set(productId, {
          genres: Array.from(new Set(extractedGenres)),
          updatedAt: Date.now()
        });
        scheduleSaveCache();
        applyToItem(item);
        break;
      }
    } catch (e) {
      console.error("[DLsite 作品フィルタ] HTML取得失敗:", productId, e);
    }
  }

  fetchingIds.delete(productId);
}

function applyToItem(item) {
  const info = extractWorkInfo(item);
  const hide = shouldHide(info);

  item.classList.toggle(HIDDEN_CLASS, hide);

  if (
    fetchGenresFromDetail &&
    !hide &&
    filters.genres.length > 0 &&
    info.productId &&
    !genreCache.has(info.productId)
  ) {
    fetchAndApplyGenres(item, info.productId);
  }
}

function filterAll() {
  getWorkItems(document).forEach(applyToItem);
}

function scheduleFilter() {
  if (scheduled) return;
  scheduled = true;
  // 無限スクロールや連続DOM変更時の負荷（描画チラつき）を抑えるため
  requestAnimationFrame(() => {
    scheduled = false;
    filterAll();
  });
}

function startObserver() {
  if (observer) observer.disconnect();

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        scheduleFilter();
        return;
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

function applySettings(data) {
  filters = {
    circles: parseLines(data[STORAGE_KEYS.circles]),
    works: parseLines(data[STORAGE_KEYS.works]),
    genres: parseLines(data[STORAGE_KEYS.genres]),
  };
  fetchGenresFromDetail = data[STORAGE_KEYS.fetchGenresFromDetail] === true;
  filterAll();
}

async function init() {
  const data = await api.storage.local.get(DEFAULTS);
  loadGenreCache(data[STORAGE_KEYS.genreCache]);
  applySettings(data);
  startObserver();
}

api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  const watched = [
    STORAGE_KEYS.circles,
    STORAGE_KEYS.works,
    STORAGE_KEYS.genres,
    STORAGE_KEYS.fetchGenresFromDetail,
  ];
  if (watched.some((key) => Object.prototype.hasOwnProperty.call(changes, key))) {
    api.storage.local.get(DEFAULTS).then(applySettings).catch((error) => {
      console.error("[DLsite 作品フィルタ] 設定の再読み込みに失敗しました", error);
    });
  }
});

init().catch((error) => {
  console.error("[DLsite 作品フィルタ] 初期化に失敗しました", error);
});