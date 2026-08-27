"use strict";

const api = typeof browser !== "undefined" ? browser : chrome;

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
  [STORAGE_KEYS.fetchGenresFromDetail]: false,
};

const form = document.getElementById("options-form");
const circlesInput = document.getElementById("hiddenCircles");
const worksInput = document.getElementById("hiddenWorks");
const genresInput = document.getElementById("hiddenGenres");
const fetchGenresFromDetailInput = document.getElementById("fetchGenresFromDetail");
const statusEl = document.getElementById("status");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFileInput = document.getElementById("importFileInput");
const clearCacheBtn = document.getElementById("clearCacheBtn");

const importModal = document.getElementById("importModal");
const btnMerge = document.getElementById("btnMerge");
const btnOverwrite = document.getElementById("btnOverwrite");
const btnCancel = document.getElementById("btnCancel");

let pendingImportData = null;

async function loadOptions() {
  try {
    const data = await api.storage.local.get(DEFAULTS);
    circlesInput.value = data[STORAGE_KEYS.circles];
    worksInput.value = data[STORAGE_KEYS.works];
    genresInput.value = data[STORAGE_KEYS.genres];
    fetchGenresFromDetailInput.checked = data[STORAGE_KEYS.fetchGenresFromDetail] === true;
  } catch (err) {
    console.error("設定の読み込み失敗:", err);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const updateObj = {
    [STORAGE_KEYS.circles]: circlesInput.value,
    [STORAGE_KEYS.works]: worksInput.value,
    [STORAGE_KEYS.genres]: genresInput.value,
    [STORAGE_KEYS.fetchGenresFromDetail]: fetchGenresFromDetailInput.checked,
  };

  try {
    await api.storage.local.set(updateObj);
    statusEl.textContent = "保存しました！";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  } catch (err) {
    console.error("設定の保存失敗:", err);
    statusEl.textContent = "保存に失敗しました。";
  }
});

exportBtn.addEventListener("click", async () => {
  try {
    const data = await api.storage.local.get(DEFAULTS);

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      hiddenCircles: data[STORAGE_KEYS.circles].split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      hiddenWorks: data[STORAGE_KEYS.works].split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      hiddenGenres: data[STORAGE_KEYS.genres].split(/\r?\n/).map(s => s.trim()).filter(Boolean),
      fetchGenresFromDetail: data[STORAGE_KEYS.fetchGenresFromDetail] === true,
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `dlsite_filter_settings_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("エクスポートエラー:", error);
    alert("設定のエクスポートに失敗しました。");
  }
});

importBtn.addEventListener("click", () => {
  importFileInput.click();
});

importFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const importedData = JSON.parse(e.target.result);

      if (
        !importedData.hiddenCircles &&
        !importedData.hiddenWorks &&
        !importedData.hiddenGenres &&
        typeof importedData.fetchGenresFromDetail !== "boolean"
      ) {
        alert("無効な設定ファイルです。正しいJSONファイルを選択してください。");
        return;
      }

      pendingImportData = importedData;
      importModal.classList.add("active");
    } catch (err) {
      console.error("インポートエラー:", err);
      alert("JSONファイルの読み込みに失敗しました。ファイルが破損していないか確認してください。");
    } finally {
      // 同じファイルを連続で再選択可能にするため値をリセットする
      event.target.value = "";
    }
  };

  reader.readAsText(file);
});

function closeModal() {
  importModal.classList.remove("active");
  pendingImportData = null;
}

async function executeImport(isOverwrite) {
  if (!pendingImportData) return;

  try {
    let currentData = {
      [STORAGE_KEYS.circles]: "",
      [STORAGE_KEYS.works]: "",
      [STORAGE_KEYS.genres]: "",
      [STORAGE_KEYS.fetchGenresFromDetail]: false,
    };
    if (!isOverwrite) {
      currentData = await api.storage.local.get(DEFAULTS);
    }

    const parseTextToList = (text) => String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const listToText = (list) => Array.from(new Set(list)).join("\n");

    const newCircles = isOverwrite
      ? (pendingImportData.hiddenCircles || [])
      : [...parseTextToList(currentData[STORAGE_KEYS.circles]), ...(pendingImportData.hiddenCircles || [])];

    const newWorks = isOverwrite
      ? (pendingImportData.hiddenWorks || [])
      : [...parseTextToList(currentData[STORAGE_KEYS.works]), ...(pendingImportData.hiddenWorks || [])];

    const newGenres = isOverwrite
      ? (pendingImportData.hiddenGenres || [])
      : [...parseTextToList(currentData[STORAGE_KEYS.genres]), ...(pendingImportData.hiddenGenres || [])];

    const importedFetch =
      typeof pendingImportData.fetchGenresFromDetail === "boolean"
        ? pendingImportData.fetchGenresFromDetail
        : isOverwrite
          ? false
          : currentData[STORAGE_KEYS.fetchGenresFromDetail] === true;

    const updateObj = {
      [STORAGE_KEYS.circles]: listToText(newCircles),
      [STORAGE_KEYS.works]: listToText(newWorks),
      [STORAGE_KEYS.genres]: listToText(newGenres),
      [STORAGE_KEYS.fetchGenresFromDetail]: importedFetch,
    };

    await api.storage.local.set(updateObj);

    circlesInput.value = updateObj[STORAGE_KEYS.circles];
    worksInput.value = updateObj[STORAGE_KEYS.works];
    genresInput.value = updateObj[STORAGE_KEYS.genres];
    fetchGenresFromDetailInput.checked = updateObj[STORAGE_KEYS.fetchGenresFromDetail];

    closeModal();
    alert("設定を正常にインポートしました。");
  } catch (err) {
    console.error("インポート適用エラー:", err);
    alert("設定の保存に失敗しました。");
    closeModal();
  }
}

btnMerge.addEventListener("click", () => executeImport(false));
btnOverwrite.addEventListener("click", () => executeImport(true));
btnCancel.addEventListener("click", closeModal);

clearCacheBtn.addEventListener("click", async () => {
  const confirmed = confirm(
    "保存されているジャンルキャッシュをすべて削除しますか？\n" +
    "（削除後、詳細ページからの取得がオンの場合は、ジャンル判定時に再度バックグラウンド取得が行われます）"
  );

  if (!confirmed) return;

  try {
    await api.storage.local.remove(STORAGE_KEYS.genreCache);
    alert("ジャンルキャッシュを削除しました。");
  } catch (err) {
    console.error("キャッシュ削除エラー:", err);
    alert("キャッシュの削除に失敗しました。");
  }
});

document.addEventListener("DOMContentLoaded", loadOptions);