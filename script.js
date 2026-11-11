
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQo9-LQTWxfQvpt4QITgwTjoMKStkh9agevkpOx5cyI9UZY56QBdEKEVlyZ5DhgBr3ACX2xHdVy30cg/pub?output=csv";

// スプレッドシートの列名
const COL = {
  categoryA: "項目A",
  categoryB: "項目B",
  rarity: "レアリティ",
  korean: "韓国語名",
  japanese: "日本語名",
  image: "画像ファイル名"
};

// 並び順の優先順位
const ORDER_A = ["武器", "防具"];
const ORDER_B = ["胴", "頭", "腕", "装具", "足"];
const ORDER_RARITY = ["紫", "金", "赤"];

// DOM
const filterA = document.getElementById("filterA");
const filterB = document.getElementById("filterB");
const filterRarity = document.getElementById("filterRarity");
const searchInput = document.getElementById("searchInput");
const resetFilters = document.getElementById("resetFilters");

const itemList = document.getElementById("itemList");
const selectedList = document.getElementById("selectedList");
const gridPreview = document.getElementById("gridPreview");

const resultCount = document.getElementById("resultCount");
const selectedCount = document.getElementById("selectedCount");
const dataStatus = document.getElementById("dataStatus");

const columnCount = document.getElementById("columnCount");
const scaleInput = document.getElementById("scaleInput");
const exportButton = document.getElementById("exportButton");

let allItems = [];
let selectedItems = [];

// 画像倍率を取得
function getScale() {
  return Math.max(
    10,
    Math.min(300, Number(scaleInput.value) || 100)
  ) / 100;
}

// 列数を取得
function getColumns() {
  return Math.max(
    1,
    Math.min(20, Number(columnCount.value) || 6)
  );
}

// CSVを読み込む
async function loadCSV() {
  try {
    const response = await fetch(CSV_URL);

    if (!response.ok) {
      throw new Error("CSVの読み込みに失敗しました");
    }

    const text = (await response.text()).replace(/^\uFEFF/, "");
    const rows = parseCSV(text);

    if (rows.length < 2) {
      throw new Error("スプレッドシートにデータがありません");
    }

    const headers = rows[0].map(value => value.trim());

    const index = {};

    for (const [key, name] of Object.entries(COL)) {
      index[key] = headers.indexOf(name);

      if (index[key] === -1) {
        throw new Error(`列「${name}」が見つかりません`);
      }
    }

    allItems = rows.slice(1)
      .filter(row => row.some(value => value.trim() !== ""))
      .map((row, i) => {
        const get = key => (row[index[key]] || "").trim();

        return {
          id: i,
          categoryA: get("categoryA"),
          categoryB: get("categoryB"),
          rarity: get("rarity"),
          korean: get("korean"),
          japanese: get("japanese"),
          image: get("image")
        };
      })
      .filter(item => item.image && (item.korean || item.japanese));

    setupFilters();
    renderAll();

    dataStatus.textContent = `${allItems.length}件のデータを読み込みました`;

  } catch (error) {
    console.error(error);

    dataStatus.textContent = "読み込みエラー";

    itemList.innerHTML = `
      <p class="empty-message">
        データを読み込めませんでした。<br>
        CSVの公開設定と列名を確認してください。<br>
        ${escapeHTML(error.message)}
      </p>
    `;
  }
}

// CSVパーサー（カンマ・引用符・改行に対応）
function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;

      row.push(value);
      rows.push(row);

      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows;
}

// 選択肢を作成
function fillSelect(select, values) {
  const current = select.value;

  select.innerHTML = '<option value="">すべて</option>';

  values.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (values.includes(current)) {
    select.value = current;
  }
}

// 絞り込み選択肢の初期設定
function setupFilters() {
  fillSelect(
    filterA,
    unique(allItems.map(item => item.categoryA))
  );

  fillSelect(
    filterB,
    unique(allItems.map(item => item.categoryB))
  );

  fillSelect(
    filterRarity,
    ORDER_RARITY.filter(rarity =>
      allItems.some(item => item.rarity === rarity)
    )
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

// 並び順用の順位を取得
function getRank(value, order) {
  const normalized = normalizeCategory(value);

  const index = order.findIndex(name => normalized === name);

  return index === -1 ? 999 : index;
}

// 表記ゆれをある程度吸収
function normalizeCategory(value) {
  return value
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "");
}

function getCategoryBRank(value) {
  const normalized = normalizeCategory(value);

  if (normalized.includes("胴")) return 0;
  if (normalized.includes("頭")) return 1;

  if (
    normalized.includes("腕") ||
    normalized.includes("装具")
  ) return 2;

  if (normalized.includes("足")) return 3;

  return 999;
}

// ソート
function sortItems(items) {
  return [...items].sort((a, b) => {
    // 項目A：武器 → 防具
    const aRank = getRank(a.categoryA, ORDER_A);
    const bRank = getRank(b.categoryA, ORDER_A);

    if (aRank !== bRank) {
      return aRank - bRank;
    }

    // 項目B：防具のみ 胴 → 頭 → 腕・装具 → 足
    if (normalizeCategory(a.categoryA) === "防具") {
      const aBRank = getCategoryBRank(a.categoryB);
      const bBRank = getCategoryBRank(b.categoryB);

      if (aBRank !== bBRank) {
        return aBRank - bBRank;
      }
    }

    // レアリティ：紫 → 金 → 赤
    const aRarity = getRank(a.rarity, ORDER_RARITY);
    const bRarity = getRank(b.rarity, ORDER_RARITY);

    if (aRarity !== bRarity) {
      return aRarity - bRarity;
    }

    // 韓国語：가나다順
    return a.korean.localeCompare(b.korean, "ko");
  });
}

// 絞り込み
function getFilteredItems() {
  const a = filterA.value;
  const b = filterB.value;
  const rarity = filterRarity.value;
  const search = searchInput.value.trim().toLowerCase();

  const filtered = allItems.filter(item => {
    if (a && item.categoryA !== a) return false;
    if (b && item.categoryB !== b) return false;
    if (rarity && item.rarity !== rarity) return false;

    if (search) {
      const names = `${item.japanese} ${item.korean}`.toLowerCase();

      if (!names.includes(search)) return false;
    }

    return true;
  });

  return sortItems(filtered);
}

// 画像パス
function getImagePath(filename) {
  return "images/" + filename
    .split("/")
    .map(part => encodeURIComponent(part))
    .join("/");
}

// HTMLエスケープ
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// 一覧描画
function renderItemList() {
  const items = getFilteredItems();

  resultCount.textContent = `${items.length}件`;

  if (items.length === 0) {
    itemList.innerHTML =
      '<p class="empty-message">該当するアイテムがありません。</p>';
    return;
  }

  itemList.innerHTML = "";

  items.forEach(item => {
    const isSelected = selectedItems.some(
      selected => selected.id === item.id
    );

    const card = document.createElement("button");
    card.type = "button";
    card.className = `item-card ${isSelected ? "selected" : ""}`;

    const img = document.createElement("img");
    img.src = getImagePath(item.image);
    img.alt = item.japanese;
    img.loading = "lazy";

    img.onerror = () => {
      img.style.display = "none";
    };

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.japanese;

    card.append(img, name);

    card.addEventListener("click", () => {
      toggleItem(item);
    });

    itemList.appendChild(card);
  });
}

// アイテムの追加・解除
function toggleItem(item) {
  const index = selectedItems.findIndex(
    selected => selected.id === item.id
  );

  if (index !== -1) {
    selectedItems.splice(index, 1);
  } else {
    selectedItems.push(item);
  }

  renderAll();
}

// 選択中一覧
function renderSelectedList() {
  selectedCount.textContent = `${selectedItems.length}個選択中`;
  selectedList.innerHTML = "";

  if (selectedItems.length === 0) {
    selectedList.innerHTML =
      '<p class="empty-message">アイテムを選択してください。</p>';
    return;
  }

  selectedItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "selected-item";

    const img = document.createElement("img");
    img.src = getImagePath(item.image);
    img.alt = "";

    img.onerror = () => {
      img.style.visibility = "hidden";
    };

    const name = document.createElement("span");
    name.className = "selected-name";
    name.textContent = item.japanese;

    const controls = document.createElement("div");
    controls.className = "selected-controls";

    const up = document.createElement("button");
    up.type = "button";
    up.textContent = "▲";
    up.title = "上へ";
    up.disabled = index === 0;
    up.addEventListener("click", () => moveItem(index, -1));

    const down = document.createElement("button");
    down.type = "button";
    down.textContent = "▼";
    down.title = "下へ";
    down.disabled = index === selectedItems.length - 1;
    down.addEventListener("click", () => moveItem(index, 1));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.title = "選択解除";

    remove.addEventListener("click", () => {
      selectedItems.splice(index, 1);
      renderAll();
    });

    controls.append(up, down, remove);
    row.append(img, name, controls);

    selectedList.appendChild(row);
  });
}

// 選択順の変更
function moveItem(index, direction) {
  const target = index + direction;

  if (target < 0 || target >= selectedItems.length) return;

  [selectedItems[index], selectedItems[target]] =
    [selectedItems[target], selectedItems[index]];

  renderAll();
}

// プレビュー
function renderPreview() {
  const columns = getColumns();
  const scale = getScale();

  gridPreview.innerHTML = "";

  if (selectedItems.length === 0) {
    gridPreview.innerHTML =
      '<p class="empty-message">アイテムを選択するとプレビューが表示されます。</p>';
    return;
  }

  gridPreview.style.gridTemplateColumns =
    `repeat(${columns}, max-content)`;

  gridPreview.style.alignItems = "end";

  selectedItems.forEach(item => {
    const cell = document.createElement("div");
    cell.className = "preview-item";

    const img = document.createElement("img");
    img.src = getImagePath(item.image);
    img.alt = item.japanese;

    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    img.style.objectFit = "contain";
    img.style.display = "block";

    img.onload = () => {
      const width = img.naturalWidth * scale;
      const height = img.naturalHeight * scale;

      img.style.width = `${width}px`;
      img.style.height = `${height}px`;

      cell.style.width = `${width}px`;
      cell.style.height = `${height}px`;
    };

    img.onerror = () => {
      cell.title = `画像が見つかりません: ${item.image}`;
      cell.style.border = "1px dashed #d99aab";
    };

    cell.appendChild(img);
    gridPreview.appendChild(cell);
  });
}

// すべて再描画
function renderAll() {
  renderItemList();
  renderSelectedList();
  renderPreview();
}

// PNG出力用の画像読み込み
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => {
      reject(new Error(`画像を読み込めません: ${src}`));
    };

    img.src = src;
  });
}

// PNG出力
async function exportPNG() {
  if (selectedItems.length === 0) {
    alert("アイテムを選択してください。");
    return;
  }

  exportButton.disabled = true;
  exportButton.textContent = "画像を作成中...";

  try {
    const columns = getColumns();
    const scale = getScale();
    const gap = 0;

    // 画像をすべて読み込む
    const loadedItems = await Promise.all(
      selectedItems.map(async item => {
        const img = await loadImage(getImagePath(item.image));

        // 元画像の実寸 × 倍率
        const width = img.naturalWidth * scale;
        const height = img.naturalHeight * scale;

        return {
          item,
          img,
          width,
          height
        };
      })
    );

    // 行数
    const rows = Math.ceil(loadedItems.length / columns);

    // 列ごとの最大幅
    const columnWidths = [];

    for (let col = 0; col < columns; col++) {
      const colItems = loadedItems.filter(
        (item, index) => index % columns === col
      );

      columnWidths.push(
        colItems.length
          ? Math.max(...colItems.map(item => item.width))
          : 0
      );
    }

    // 行ごとの最大高さ
    const rowHeights = [];

    for (let row = 0; row < rows; row++) {
      const rowItems = loadedItems.slice(
        row * columns,
        (row + 1) * columns
      );

      rowHeights.push(
        Math.max(...rowItems.map(item => item.height))
      );
    }

    // 列の開始位置
    const columnOffsets = [];
    let totalWidth = 0;

    columnWidths.forEach((width, index) => {
      columnOffsets.push(totalWidth);
      totalWidth += width;

      if (index < columns - 1) {
        totalWidth += gap;
      }
    });

    // 行の開始位置
    const rowOffsets = [];
    let totalHeight = 0;

    rowHeights.forEach((height, index) => {
      rowOffsets.push(totalHeight);
      totalHeight += height;

      if (index < rows - 1) {
        totalHeight += gap;
      }
    });

    // Canvas作成
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.ceil(totalWidth));
    canvas.height = Math.max(1, Math.ceil(totalHeight));

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvasを作成できませんでした");
    }

    // 透過背景
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // アイテム描画
    loadedItems.forEach((entry, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);

      // 列の中央に配置
      const x =
        columnOffsets[col] +
        (columnWidths[col] - entry.width) / 2;

      // 行の下端に揃える
      const y =
        rowOffsets[row] +
        rowHeights[row] -
        entry.height;

      ctx.drawImage(
        entry.img,
        x,
        y,
        entry.width,
        entry.height
      );
    });

    // PNG変換
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("PNG画像の作成に失敗しました"));
        }
      }, "image/png");
    });

    const url = URL.createObjectURL(blob);

    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
      const newTab = window.open(url, "_blank");

      if (!newTab) {
        location.href = url;
      }

      setTimeout(() => URL.revokeObjectURL(url), 60000);

    } else {
      const link = document.createElement("a");

      link.href = url;
      link.download = "eternal-return-item-grid.png";

      document.body.appendChild(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    exportButton.textContent = isMobile
      ? "画像を開きました"
      : "PNG画像を保存しました";

    setTimeout(() => {
      exportButton.textContent = "PNG画像を保存";
    }, 2500);

  } catch (error) {
    console.error(error);

    alert(`画像の作成に失敗しました。\n${error.message}`);

  } finally {
    exportButton.disabled = false;

    if (exportButton.textContent === "画像を作成中...") {
      exportButton.textContent = "PNG画像を保存";
    }
  }
}

// イベント
[filterA, filterB, filterRarity].forEach(select => {
  select.addEventListener("change", renderItemList);
});

searchInput.addEventListener("input", renderItemList);

resetFilters.addEventListener("click", () => {
  filterA.value = "";
  filterB.value = "";
  filterRarity.value = "";
  searchInput.value = "";

  renderItemList();
});

columnCount.addEventListener("input", renderPreview);
scaleInput.addEventListener("input", renderPreview);

exportButton.addEventListener("click", exportPNG);

// 起動
loadCSV();
