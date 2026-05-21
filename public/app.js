const API_URL = "/api/inventory";
const LOCAL_KEY = "shop-inventory-ai-local-v2";

const DEFAULT_CATEGORIES = [
  { id: 1, name: "튀김 / 냉동", items: [["만두", 1], ["탬프라", 2], ["스프링롤", 0], ["타코야끼", 0], ["새우", 6], ["포크 돈까스", 1], ["프론 트위스트", 0], ["프론 슈마이", 1], ["피쉬", 0], ["핫도그", 0], ["손가락치킨", 1], ["크랩볼", 0], ["오징어", 1], ["스시 튀김", 0], ["라이스볼", 0]] },
  { id: 2, name: "스시 / 생선", items: [["연어 싸는거", 1], ["연어 니기리", 0], ["연어 파이어", 0], ["장어", 0], ["튜나 니기리", 0], ["씨위드", 0], ["수루미", 0], ["오뎅", 0], ["단새우", 0], ["유부", 0], ["차에 물고기 간장", 0]] },
  { id: 3, name: "소스 / 반찬", items: [["테리야끼", 1], ["달걀말이", 0]] },
  { id: 4, name: "야채 / 과일", items: [["오이", 2], ["피망", 0], ["상추", 0], ["양배추", 0], ["바나나", 0], ["바나나 스프링", 0], ["아보카도", 5]] },
  { id: 5, name: "치킨 / 돈부리", items: [["치킨 돈부리", 1], ["코리안 치킨", 0], ["치킨 윙", 1]] },
  { id: 6, name: "포장 / 기타", items: [["브라운 컨테이너", 0]] },
  { id: 7, name: "비드푸드", items: [["새우꼬지", 1], ["바오번", 0], ["크림치즈", 0], ["딤섬", 1], ["치킨케밥", 0], ["치킨 슈마이", 0]] },
  { id: 8, name: "음료수", items: [["콜라", 0], ["콜라 제로", 0], ["스프라이트", 0], ["환타", 0], ["물", 0], ["주스", 0], ["아이스티", 0], ["캔음료", 0], ["병음료", 0]] }
];

const state = {
  categories: [],
  predictions: [],
  records: [],
  recordsCount: 0,
  lastRecordDate: null,
  online: true,
  hideZero: true,
  selectedCategory: "all",
  history: [],
  saving: false
};

const $ = (id) => document.getElementById(id);

const elements = {
  inventory: $("inventory"),
  statusText: $("statusText"),
  connectionBadge: $("connectionBadge"),
  recordsCount: $("recordsCount"),
  predictedCount: $("predictedCount"),
  orderItemCount: $("orderItemCount"),
  orderUnitCount: $("orderUnitCount"),
  confidenceText: $("confidenceText"),
  lastRecord: $("lastRecord"),
  predictionSubtext: $("predictionSubtext"),
  recommendationList: $("recommendationList"),
  categoryTabs: $("categoryTabs"),
  categoryFilter: $("categoryFilter"),
  searchInput: $("searchInput"),
  toggleZeroBtn: $("toggleZeroBtn"),
  undoBtn: $("undoBtn"),
  newItemName: $("newItemName"),
  newItemCategory: $("newItemCategory"),
  messageOutput: $("messageOutput"),
  toast: $("toast")
};

function cloneDefaultData() {
  let itemId = 1;
  return DEFAULT_CATEGORIES.map((category) => ({
    id: category.id,
    name: category.name,
    items: category.items.map(([name, qty]) => ({ id: itemId++, name, qty }))
  }));
}

function cloneCategories(categories = state.categories) {
  return categories.map((category) => ({
    ...category,
    items: category.items.map((item) => ({ ...item }))
  }));
}

function readLocalStore() {
  try {
    const data = JSON.parse(localStorage.getItem(LOCAL_KEY));
    if (data && Array.isArray(data.categories)) return data;
  } catch (error) {
    localStorage.removeItem(LOCAL_KEY);
  }

  return {
    categories: cloneDefaultData(),
    records: [],
    lastRecordDate: null
  };
}

function writeLocalStore() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify({
    categories: state.categories,
    records: state.records,
    lastRecordDate: state.lastRecordDate
  }));
}

function setSaving(isSaving) {
  state.saving = isSaving;
  document.body.classList.toggle("is-saving", isSaving);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

async function api(path = "", options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "content-type": "application/json" },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "API error");
  }

  return response.json();
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function getAllItems() {
  return state.categories.flatMap((category) => category.items.map((item) => ({
    ...item,
    categoryId: category.id,
    category: category.name
  })));
}

function buildLocalPredictions() {
  return getAllItems().map((item) => {
    const values = state.records.map((record) => {
      const match = record.items.find((entry) => entry.id === item.id);
      return match ? Number(match.qty) || 0 : 0;
    });

    if (!values.length) {
      return { itemId: item.id, name: item.name, category: item.category, qty: item.qty, confidence: "start", reason: "기록 없음" };
    }

    const recent = values.slice(-5);
    const last = values[values.length - 1];
    const raw = average(recent) * 0.75 + last * 0.25;
    return {
      itemId: item.id,
      name: item.name,
      category: item.category,
      qty: Math.max(0, Math.round(raw)),
      confidence: values.length >= 10 ? "medium" : "low",
      reason: "로컬 최근 기록"
    };
  });
}

function setConnectionStatus(online) {
  state.online = online;
  elements.connectionBadge.classList.toggle("online", online);
  elements.connectionBadge.classList.toggle("offline", !online);
  elements.connectionBadge.textContent = online ? "Cloudflare DB" : "로컬 모드";
  elements.statusText.textContent = online ? "데이터베이스 연결됨" : "DB 연결 전에도 로컬 저장으로 사용할 수 있습니다.";
}

async function loadData() {
  setSaving(true);
  try {
    const data = await api();
    state.categories = data.categories;
    state.predictions = data.predictions;
    state.recordsCount = data.recordsCount;
    state.lastRecordDate = data.lastRecordDate;
    setConnectionStatus(true);
  } catch (error) {
    const local = readLocalStore();
    state.categories = local.categories;
    state.records = local.records || [];
    state.recordsCount = state.records.length;
    state.lastRecordDate = local.lastRecordDate || null;
    state.predictions = buildLocalPredictions();
    setConnectionStatus(false);
  } finally {
    setSaving(false);
    render();
  }
}

function getPrediction(itemId) {
  return state.predictions.find((prediction) => prediction.itemId === itemId);
}

function getConfidenceLabel() {
  if (state.recordsCount >= 14) return "높음";
  if (state.recordsCount >= 5) return "보통";
  if (state.recordsCount >= 1) return "낮음";
  return "시작";
}

function getOrderSummary() {
  const activeItems = getAllItems().filter((item) => Number(item.qty) > 0);
  return {
    itemCount: activeItems.length,
    unitCount: activeItems.reduce((sum, item) => sum + Number(item.qty), 0)
  };
}

function formatMessage() {
  const sections = [];

  for (const category of state.categories) {
    const lines = category.items
      .filter((item) => Number(item.qty) > 0)
      .map((item) => `${item.name} ${item.qty}`);

    if (lines.length) sections.push(`[${category.name}]\n${lines.join("\n")}`);
  }

  return sections.length ? sections.join("\n\n") : "주문할 품목 없음";
}

function updatePreview() {
  elements.messageOutput.value = formatMessage();
}

function renderCategoryControls() {
  const current = state.selectedCategory;
  elements.categoryFilter.innerHTML = "";
  elements.categoryTabs.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "전체 카테고리";
  elements.categoryFilter.append(allOption);

  const allTab = document.createElement("button");
  allTab.type = "button";
  allTab.className = `tab-btn${current === "all" ? " active" : ""}`;
  allTab.dataset.category = "all";
  allTab.textContent = "전체";
  elements.categoryTabs.append(allTab);

  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    elements.categoryFilter.append(option);

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-btn${String(category.id) === current ? " active" : ""}`;
    tab.dataset.category = String(category.id);
    tab.textContent = category.name;
    elements.categoryTabs.append(tab);
  }

  elements.categoryFilter.value = current;

  elements.newItemCategory.innerHTML = "";
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    elements.newItemCategory.append(option);
  }
}

function renderMetrics() {
  const summary = getOrderSummary();
  const predicted = state.predictions.filter((prediction) => Number(prediction.qty) > 0);

  elements.orderItemCount.textContent = String(summary.itemCount);
  elements.orderUnitCount.textContent = String(summary.unitCount);
  elements.recordsCount.textContent = String(state.recordsCount);
  elements.predictedCount.textContent = String(predicted.length);
  elements.confidenceText.textContent = getConfidenceLabel();
  elements.lastRecord.textContent = state.lastRecordDate ? `마지막 학습 ${state.lastRecordDate}` : "마지막 학습 없음";
  elements.predictionSubtext.textContent = state.recordsCount
    ? `${state.recordsCount}회 기록 기준으로 추천합니다.`
    : "오늘 저장/학습을 누르면 추천이 시작됩니다.";
}

function renderRecommendations() {
  elements.recommendationList.innerHTML = "";
  const recommended = state.predictions
    .filter((prediction) => Number(prediction.qty) > 0)
    .sort((a, b) => Number(b.qty) - Number(a.qty) || a.name.localeCompare(b.name, "ko"))
    .slice(0, 8);

  if (!recommended.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 추천할 주문 품목이 없습니다.";
    elements.recommendationList.append(empty);
    return;
  }

  for (const item of recommended) {
    const row = document.createElement("div");
    row.className = "recommendation-row";

    const copy = document.createElement("div");
    const name = document.createElement("div");
    name.className = "recommendation-name";
    name.textContent = item.name;
    const meta = document.createElement("div");
    meta.className = "recommendation-meta";
    meta.textContent = `${item.category} · ${item.reason || "AI 추천"}`;
    copy.append(name, meta);

    const qty = document.createElement("div");
    qty.className = "recommendation-qty";
    qty.textContent = item.qty;

    row.append(copy, qty);
    elements.recommendationList.append(row);
  }
}

function renderInventory() {
  const query = elements.searchInput.value.trim().toLowerCase();
  elements.inventory.innerHTML = "";

  let renderedCount = 0;

  for (const category of state.categories) {
    if (state.selectedCategory !== "all" && String(category.id) !== state.selectedCategory) continue;

    const visibleItems = category.items.filter((item) => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      const matchesZero = !state.hideZero || Number(item.qty) > 0;
      return matchesSearch && matchesZero;
    });

    if (!visibleItems.length) continue;
    renderedCount += visibleItems.length;

    const section = document.createElement("section");
    section.className = "category";

    const title = document.createElement("div");
    title.className = "category-title";
    const titleName = document.createElement("span");
    titleName.textContent = category.name;
    const count = document.createElement("span");
    count.className = "category-count";
    count.textContent = `${visibleItems.length}/${category.items.length}`;
    title.append(titleName, count);
    section.append(title);

    for (const item of visibleItems) {
      const prediction = getPrediction(item.id);
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.itemId = String(item.id);

      const main = document.createElement("div");
      main.className = "item-main";
      const name = document.createElement("div");
      name.className = "item-name";
      name.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = prediction ? prediction.reason : "예측 대기";
      main.append(name, meta);

      const pill = document.createElement("div");
      pill.className = `prediction-pill${prediction && prediction.confidence === "low" ? " low" : ""}`;
      pill.textContent = prediction ? `AI ${prediction.qty}` : "AI -";

      const stepper = document.createElement("div");
      stepper.className = "stepper";
      stepper.innerHTML = `
        <button class="minus" type="button" data-action="minus" aria-label="${item.name} 줄이기">-</button>
        <input class="qty" type="number" min="0" inputmode="numeric" value="${item.qty}" data-action="qty" aria-label="${item.name} 수량" />
        <button class="plus" type="button" data-action="plus" aria-label="${item.name} 늘리기">+</button>
      `;

      row.append(main, pill, stepper);
      section.append(row);
    }

    elements.inventory.append(section);
  }

  if (!renderedCount) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "표시할 품목이 없습니다. 검색어나 0개 숨김 설정을 확인하세요.";
    elements.inventory.append(empty);
  }
}

function render() {
  renderCategoryControls();
  renderMetrics();
  renderRecommendations();
  renderInventory();
  updatePreview();
  elements.toggleZeroBtn.textContent = state.hideZero ? "0개 숨김" : "0개 표시";
  elements.undoBtn.disabled = !state.history.length;
}

function findItem(itemId) {
  for (const category of state.categories) {
    const item = category.items.find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

function pushHistory(label) {
  state.history.push({ label, categories: cloneCategories() });
  if (state.history.length > 12) state.history.shift();
}

async function persistQty(item) {
  if (state.online) {
    await api("", {
      method: "PATCH",
      body: JSON.stringify({ id: item.id, qty: item.qty })
    });
  } else {
    writeLocalStore();
  }
}

async function setQty(itemId, qty, options = {}) {
  const item = findItem(itemId);
  if (!item) return;

  if (!options.skipHistory) pushHistory(`${item.name} 수량 변경`);
  item.qty = Math.max(0, Number.parseInt(qty, 10) || 0);
  render();

  try {
    await persistQty(item);
  } catch (error) {
    setConnectionStatus(false);
    writeLocalStore();
    showToast("DB 저장 실패, 로컬에 저장했습니다");
  }
}

function currentSnapshot() {
  return getAllItems().map((item) => ({
    id: item.id,
    category: item.category,
    name: item.name,
    qty: Number(item.qty) || 0
  }));
}

async function saveRecord() {
  setSaving(true);
  const now = new Date();
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const payload = {
    date,
    weekday: now.getDay(),
    items: currentSnapshot()
  };

  try {
    if (state.online) {
      await api("?action=record", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      await loadData();
    } else {
      state.records = state.records.filter((record) => record.date !== date);
      state.records.push(payload);
      state.lastRecordDate = date;
      state.recordsCount = state.records.length;
      state.predictions = buildLocalPredictions();
      writeLocalStore();
      render();
    }
    showToast("오늘 기록을 저장하고 학습했습니다");
  } finally {
    setSaving(false);
  }
}

async function applyPrediction() {
  if (!state.predictions.length) {
    showToast("먼저 오늘 저장/학습을 눌러주세요");
    return;
  }

  pushHistory("AI 예측 적용");
  setSaving(true);

  try {
    if (state.online) {
      await api("?action=apply-predictions", { method: "POST", body: "{}" });
      await loadData();
    } else {
      for (const prediction of state.predictions) {
        const item = findItem(prediction.itemId);
        if (item) item.qty = prediction.qty;
      }
      writeLocalStore();
      render();
    }
    showToast("AI 예측 수량을 적용했습니다");
  } finally {
    setSaving(false);
  }
}

async function addItem() {
  const name = elements.newItemName.value.trim();
  const categoryId = Number(elements.newItemCategory.value);
  if (!name) {
    showToast("품목 이름을 입력하세요");
    return;
  }

  pushHistory("품목 추가");
  setSaving(true);

  try {
    if (state.online) {
      await api("?action=add-item", {
        method: "POST",
        body: JSON.stringify({ categoryId, name, qty: 0 })
      });
      await loadData();
    } else {
      const category = state.categories.find((entry) => entry.id === categoryId);
      const maxId = Math.max(0, ...state.categories.flatMap((entry) => entry.items.map((item) => item.id)));
      category.items.push({ id: maxId + 1, name, qty: 0 });
      writeLocalStore();
      render();
    }
    elements.newItemName.value = "";
    showToast("품목을 추가했습니다");
  } finally {
    setSaving(false);
  }
}

async function copyMessage() {
  updatePreview();
  try {
    await navigator.clipboard.writeText(elements.messageOutput.value);
  } catch (error) {
    elements.messageOutput.select();
    document.execCommand("copy");
  }
  showToast("복사했습니다");
}

async function shareMessage() {
  const text = formatMessage();
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  await copyMessage();
}

function downloadBackup() {
  const backup = {
    exportedAt: new Date().toISOString(),
    online: state.online,
    categories: state.categories,
    records: state.records,
    predictions: state.predictions
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "shop-inventory-ai-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("백업 파일을 만들었습니다");
}

async function zeroAll() {
  if (!confirm("전체 수량을 0으로 바꿀까요?")) return;
  pushHistory("전체 0으로");
  const items = getAllItems();
  for (const item of items) item.qty = 0;
  render();

  if (state.online) {
    for (const item of items) {
      await persistQty(item);
    }
  } else {
    writeLocalStore();
  }

  showToast("전체 수량을 0으로 바꿨습니다");
}

function restoreDefaults() {
  if (!confirm("기본 리스트로 복구할까요? 현재 수량과 추가 품목이 사라집니다.")) return;
  pushHistory("기본 리스트 복구");
  state.categories = cloneDefaultData();
  state.records = [];
  state.predictions = buildLocalPredictions();
  state.recordsCount = 0;
  state.lastRecordDate = null;
  setConnectionStatus(false);
  writeLocalStore();
  render();
  showToast("기본 리스트로 복구했습니다");
}

function undoLastChange() {
  const last = state.history.pop();
  if (!last) return;
  state.categories = last.categories;
  state.predictions = state.online ? state.predictions : buildLocalPredictions();
  writeLocalStore();
  render();
  showToast(`${last.label} 되돌림`);
}

function setSelectedCategory(value) {
  state.selectedCategory = value;
  render();
}

function bindEvents() {
  $("refreshBtn").addEventListener("click", loadData);
  $("copyBtn").addEventListener("click", copyMessage);
  $("shareBtn").addEventListener("click", shareMessage);
  $("saveRecordBtn").addEventListener("click", () => saveRecord().catch((error) => showToast(error.message)));
  $("applyPredictBtn").addEventListener("click", () => applyPrediction().catch((error) => showToast(error.message)));
  $("addItemBtn").addEventListener("click", () => addItem().catch((error) => showToast(error.message)));
  $("downloadBtn").addEventListener("click", downloadBackup);
  $("zeroAllBtn").addEventListener("click", () => zeroAll().catch((error) => showToast(error.message)));
  $("restoreBtn").addEventListener("click", restoreDefaults);
  $("undoBtn").addEventListener("click", undoLastChange);

  elements.searchInput.addEventListener("input", render);
  elements.categoryFilter.addEventListener("change", (event) => setSelectedCategory(event.target.value));
  elements.categoryTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-category]");
    if (tab) setSelectedCategory(tab.dataset.category);
  });

  elements.newItemName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addItem().catch((error) => showToast(error.message));
  });

  elements.toggleZeroBtn.addEventListener("click", () => {
    state.hideZero = !state.hideZero;
    render();
  });

  elements.inventory.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const row = button.closest(".item-row");
    const itemId = Number(row.dataset.itemId);
    const item = findItem(itemId);
    if (!item) return;

    const nextQty = button.dataset.action === "plus" ? item.qty + 1 : item.qty - 1;
    setQty(itemId, nextQty).catch((error) => showToast(error.message));
  });

  elements.inventory.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "qty") return;
    const row = event.target.closest(".item-row");
    setQty(Number(row.dataset.itemId), event.target.value).catch((error) => showToast(error.message));
  });
}

bindEvents();
loadData();
