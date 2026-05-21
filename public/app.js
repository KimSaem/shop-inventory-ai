const API_URL = "/api/inventory";
const LOCAL_KEY = "shop-inventory-ai-local-v2";
const ACTIVITY_KEY = "shop-inventory-ai-activity-v1";

const DEFAULT_CATEGORIES = [
  { id: 1, name: "튀김 / 냉동", items: [["만두", 1], ["탬프라", 2], ["스프링롤", 0], ["타코야끼", 0], ["새우", 6], ["포크 돈까스", 1], ["프론 트위스트", 0], ["프론 슈마이", 1], ["피쉬", 0], ["핫도그", 0], ["손가락치킨", 1], ["크랩볼", 0], ["오징어", 1], ["스시 튀김", 0], ["라이스볼", 0]] },
  { id: 2, name: "스시 / 생선", items: [["연어 싸는거", 1], ["연어 니기리", 0], ["연어 파이어", 0], ["장어", 0], ["튜나 니기리", 0], ["씨위드", 0], ["수루미", 0], ["오뎅", 0], ["단새우", 0], ["유부", 0], ["차에 물고기 간장", 0]] },
  { id: 3, name: "소스 / 반찬", items: [["테리야끼", 1], ["달걀말이", 0]] },
  { id: 4, name: "야채 / 과일", items: [["오이", 2], ["피망", 0], ["상추", 0], ["양배추", 0], ["바나나", 0], ["바나나 스프링", 0], ["아보카도", 5]] },
  { id: 5, name: "치킨 / 돈부리", items: [["치킨 돈부리", 1], ["코리안 치킨", 0], ["치킨 윙", 1]] },
  { id: 6, name: "포장 / 기타", items: [["브라운 컨테이너", 0]] },
  { id: 7, name: "비드푸드", items: [["새우꼬지", 1], ["바오번", 0], ["크림치즈", 0], ["딤섬", 1], ["치킨케밥", 0], ["치킨 슈마이", 0], ["BBQ SAUCE", 0], ["Sweet Chilli Sauce", 0], ["Thousand SAUCE (SEAFOOD SAUCE)", 0], ["ETA FREE MAYO", 0], ["KIWI MAYO", 0], ["FILTER Fat Cone 11 inch", 0], ["Scale Paper Waxed", 0], ["Chocolate Buttons Compound Milk", 0], ["Drink Creaming Soda Bottle (Bundaberg)", 0], ["Drink Dekopon Mandarin (Bundaberg)", 0], ["Drink Ginger Beer Diet (Bundaberg)", 0], ["Sauce Oyster KUM CHUN", 0], ["Chip 13mm ure crisp (Mc Cain)", 0], ["Drink Guava", 0], ["Drink Lemonade", 0], ["Drink Passionfurit", 0], ["Drink Peach", 0], ["Drink Pineapple Coconut", 0], ["Drink Tropical Mango", 0], ["Egg Grade 7 Cage Free Barn", 0]] },
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
  orderOnly: false,
  selectedCategory: "all",
  selectedOrderGroup: "all",
  activities: [],
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
  issueCount: $("issueCount"),
  bidfoodOrderCount: $("bidfoodOrderCount"),
  reviewList: $("reviewList"),
  activityList: $("activityList"),
  orderModal: $("orderModal"),
  orderSupplierTabs: $("orderSupplierTabs"),
  orderCenterContent: $("orderCenterContent"),
  orderCenterPreview: $("orderCenterPreview"),
  orderCenterSummary: $("orderCenterSummary"),
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
  orderOnlyBtn: $("orderOnlyBtn"),
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

function readActivities() {
  try {
    const data = JSON.parse(localStorage.getItem(ACTIVITY_KEY));
    return Array.isArray(data) ? data.slice(0, 12) : [];
  } catch (error) {
    localStorage.removeItem(ACTIVITY_KEY);
    return [];
  }
}

function writeActivities() {
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(state.activities.slice(0, 12)));
}

function logActivity(message) {
  const time = new Date().toLocaleTimeString("ko-NZ", { hour: "2-digit", minute: "2-digit" });
  state.activities.unshift({ time, message });
  state.activities = state.activities.slice(0, 12);
  writeActivities();
  renderActivity();
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

function getNextLocalItemId() {
  return Math.max(0, ...state.categories.flatMap((category) => category.items.map((item) => Number(item.id) || 0))) + 1;
}

function findCategory(categoryId) {
  return state.categories.find((category) => Number(category.id) === Number(categoryId));
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
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

function getTodayKey() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function buildReviewItems() {
  const summary = getOrderSummary();
  const bidfoodCount = getBidfoodItems().length;
  const today = getTodayKey();
  const items = [];

  items.push({
    status: summary.itemCount ? "good" : "warn",
    icon: summary.itemCount ? "✓" : "!",
    text: summary.itemCount ? `${summary.itemCount}개 품목, 총 ${summary.unitCount}개가 주문 리스트에 있습니다.` : "아직 주문할 품목이 없습니다."
  });

  items.push({
    status: state.lastRecordDate === today ? "good" : "warn",
    icon: state.lastRecordDate === today ? "✓" : "!",
    text: state.lastRecordDate === today ? "오늘 학습 기록이 저장되었습니다." : "아직 오늘 저장/학습을 누르지 않았습니다."
  });

  items.push({
    status: state.online ? "good" : "warn",
    icon: state.online ? "✓" : "!",
    text: state.online ? "Cloudflare DB에 연결되어 있습니다." : "현재 로컬 모드입니다. DB 연결 후에도 계속 사용할 수 있습니다."
  });

  items.push({
    status: bidfoodCount ? "good" : "warn",
    icon: bidfoodCount ? "✓" : "!",
    text: bidfoodCount ? `비드푸드 발주 품목 ${bidfoodCount}개가 준비되었습니다.` : "비드푸드 발주 품목은 아직 없습니다."
  });

  return items;
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

function getBidfoodItems() {
  const category = state.categories.find((entry) => entry.name === "비드푸드");
  if (!category) return [];

  return category.items
    .filter((item) => Number(item.qty) > 0)
    .map((item) => ({
      name: item.name,
      qty: Number(item.qty) || 0
    }));
}

function formatBidfoodOrder() {
  const lines = getBidfoodItems().map((item) => `${item.name} ${item.qty}`);
  return lines.length ? `[비드푸드 발주]\n${lines.join("\n")}` : "비드푸드 발주 품목 없음";
}

function getOrderGroups() {
  const groups = state.categories
    .map((category) => ({
      id: String(category.id),
      name: category.name,
      items: category.items
        .filter((item) => Number(item.qty) > 0)
        .map((item) => ({
          id: item.id,
          name: item.name,
          qty: Number(item.qty) || 0,
          category: category.name
        }))
    }))
    .filter((group) => group.items.length);

  const allItems = groups.flatMap((group) => group.items);
  return [
    { id: "all", name: "전체 발주", items: allItems },
    ...groups
  ];
}

function getSelectedOrderGroup() {
  const groups = getOrderGroups();
  return groups.find((group) => group.id === state.selectedOrderGroup) || groups[0] || { id: "all", name: "전체 발주", items: [] };
}

function formatOrderGroup(group = getSelectedOrderGroup()) {
  if (!group.items.length) return `${group.name}\n발주 품목 없음`;
  const sections = group.id === "all"
    ? state.categories
      .map((category) => {
        const lines = category.items
          .filter((item) => Number(item.qty) > 0)
          .map((item) => `${item.name} ${item.qty}`);
        return lines.length ? `[${category.name}]\n${lines.join("\n")}` : "";
      })
      .filter(Boolean)
    : [`[${group.name}]\n${group.items.map((item) => `${item.name} ${item.qty}`).join("\n")}`];

  return sections.join("\n\n");
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
  const reviewItems = buildReviewItems();
  const warningCount = reviewItems.filter((item) => item.status === "warn").length;

  elements.orderItemCount.textContent = String(summary.itemCount);
  elements.orderUnitCount.textContent = String(summary.unitCount);
  elements.recordsCount.textContent = String(state.recordsCount);
  elements.predictedCount.textContent = String(predicted.length);
  elements.issueCount.textContent = warningCount ? String(warningCount) : "OK";
  elements.bidfoodOrderCount.textContent = String(getBidfoodItems().length);
  elements.confidenceText.textContent = getConfidenceLabel();
  elements.lastRecord.textContent = state.lastRecordDate ? `마지막 학습 ${state.lastRecordDate}` : "마지막 학습 없음";
  elements.predictionSubtext.textContent = state.recordsCount
    ? `${state.recordsCount}회 기록 기준으로 추천합니다.`
    : "오늘 저장/학습을 누르면 추천이 시작됩니다.";
}

function renderReview() {
  elements.reviewList.innerHTML = "";
  for (const item of buildReviewItems()) {
    const row = document.createElement("div");
    row.className = `review-item ${item.status}`;
    const icon = document.createElement("strong");
    icon.textContent = item.icon;
    const text = document.createElement("span");
    text.textContent = item.text;
    row.append(icon, text);
    elements.reviewList.append(row);
  }
}

function renderActivity() {
  elements.activityList.innerHTML = "";

  if (!state.activities.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "아직 기록된 작업이 없습니다.";
    elements.activityList.append(empty);
    return;
  }

  for (const item of state.activities.slice(0, 8)) {
    const row = document.createElement("div");
    row.className = "activity-row";
    const time = document.createElement("strong");
    time.textContent = item.time;
    const message = document.createElement("span");
    message.textContent = item.message;
    row.append(time, message);
    elements.activityList.append(row);
  }
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

    const action = document.createElement("button");
    action.type = "button";
    action.className = "recommendation-action";
    action.dataset.applyPrediction = String(item.itemId);
    action.textContent = item.qty;
    action.title = `${item.name} ${item.qty}개 적용`;

    row.append(copy, action);
    elements.recommendationList.append(row);
  }
}

function renderOrderCenter() {
  const groups = getOrderGroups();
  const selected = getSelectedOrderGroup();
  const totalQty = selected.items.reduce((sum, item) => sum + item.qty, 0);

  elements.orderSupplierTabs.innerHTML = "";
  for (const group of groups.length ? groups : [{ id: "all", name: "전체 발주", items: [] }]) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `tab-btn${group.id === selected.id ? " active" : ""}`;
    tab.dataset.orderGroup = group.id;
    tab.textContent = `${group.name} ${group.items.length}`;
    elements.orderSupplierTabs.append(tab);
  }

  elements.orderCenterSummary.textContent = `${selected.name}: ${selected.items.length}개 품목, 총 ${totalQty}개`;
  elements.orderCenterContent.innerHTML = "";

  if (!selected.items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "발주할 품목이 없습니다. 재고 화면에서 수량을 먼저 입력하세요.";
    elements.orderCenterContent.append(empty);
  } else {
    for (const item of selected.items) {
      const row = document.createElement("div");
      row.className = "order-line";

      const copy = document.createElement("div");
      const name = document.createElement("div");
      name.className = "order-line-name";
      name.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "order-line-meta";
      meta.textContent = item.category;
      copy.append(name, meta);

      const qty = document.createElement("div");
      qty.className = "order-line-qty";
      qty.textContent = item.qty;

      row.append(copy, qty);
      elements.orderCenterContent.append(row);
    }
  }

  elements.orderCenterPreview.value = formatOrderGroup(selected);
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
      const matchesOrderOnly = !state.orderOnly || Number(item.qty) > 0;
      return matchesSearch && matchesZero && matchesOrderOnly;
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

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `prediction-pill${prediction && prediction.confidence === "low" ? " low" : ""}`;
      pill.dataset.action = "apply-one";
      pill.textContent = prediction ? `AI ${prediction.qty}` : "AI -";
      pill.disabled = !prediction;
      pill.title = prediction ? `${item.name} 예측 수량 적용` : "예측 대기";

      const stepper = document.createElement("div");
      stepper.className = "stepper";
      stepper.innerHTML = `
        <button class="zero" type="button" data-action="zero" aria-label="${item.name} 0으로">0</button>
        <button class="minus" type="button" data-action="minus" aria-label="${item.name} 줄이기">-</button>
        <input class="qty" type="number" min="0" inputmode="numeric" value="${item.qty}" data-action="qty" aria-label="${item.name} 수량" />
        <button class="plus" type="button" data-action="plus" aria-label="${item.name} 늘리기">+</button>
        <button class="plus-five" type="button" data-action="plus-five" aria-label="${item.name} 5개 늘리기">+5</button>
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
  renderReview();
  renderActivity();
  renderRecommendations();
  renderInventory();
  renderOrderCenter();
  updatePreview();
  elements.toggleZeroBtn.textContent = state.hideZero ? "0개 숨김" : "0개 표시";
  elements.orderOnlyBtn.textContent = state.orderOnly ? "전체 보기" : "발주만";
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
    if (!options.silent) logActivity(`${item.name} ${item.qty}개로 변경`);
  } catch (error) {
    setConnectionStatus(false);
    writeLocalStore();
    showToast("DB 저장 실패, 로컬에 저장했습니다");
  }
}

async function applySinglePrediction(itemId) {
  const prediction = getPrediction(itemId);
  const item = findItem(itemId);
  if (!prediction || !item) return;

  await setQty(itemId, prediction.qty);
  showToast(`${item.name} AI 수량을 적용했습니다`);
  logActivity(`${item.name} AI 추천 적용`);
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
    logActivity("오늘 재고 기록 저장/학습");
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
    logActivity("전체 AI 예측 적용");
  } finally {
    setSaving(false);
  }
}

async function addItem() {
  const name = normalizeName(elements.newItemName.value);
  const categoryId = Number(elements.newItemCategory.value);
  if (!name) {
    showToast("품목 이름을 입력하세요");
    return;
  }

  const category = findCategory(categoryId);
  if (!category) {
    showToast("카테고리를 선택하세요");
    return;
  }

  const duplicate = category.items.find((item) => normalizeName(item.name).toLowerCase() === name.toLowerCase());
  if (duplicate) {
    state.selectedCategory = String(categoryId);
    state.hideZero = false;
    elements.searchInput.value = name;
    render();
    showToast("이미 있는 품목을 보여드렸습니다");
    return;
  }

  pushHistory("품목 추가");
  const optimisticItem = { id: getNextLocalItemId(), name, qty: 1, pending: true };
  category.items.push(optimisticItem);
  state.selectedCategory = String(categoryId);
  state.hideZero = false;
  elements.searchInput.value = "";
  elements.newItemName.value = "";
  state.predictions = state.online ? state.predictions : buildLocalPredictions();
  render();
  showToast("품목을 바로 추가했습니다");
  logActivity(`${name} 품목 추가`);
  setSaving(true);

  try {
    if (state.online) {
      await api("?action=add-item", {
        method: "POST",
        body: JSON.stringify({ categoryId, name, qty: 1 })
      });
      await loadData();
    } else {
      optimisticItem.pending = false;
      writeLocalStore();
      render();
    }
  } catch (error) {
    setConnectionStatus(false);
    optimisticItem.pending = false;
    writeLocalStore();
    render();
    showToast("DB 연결 전이라 로컬에 먼저 저장했습니다");
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
  logActivity("전체 주문 리스트 복사");
}

async function copyBidfoodOrder() {
  const text = formatBidfoodOrder();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    elements.messageOutput.value = text;
    elements.messageOutput.select();
    document.execCommand("copy");
    updatePreview();
  }
  showToast("비드푸드 발주 내용을 복사했습니다");
  logActivity("비드푸드 발주 복사");
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

function downloadBidfoodCsv() {
  const rows = [["Item", "Quantity"], ...getBidfoodItems().map((item) => [item.name, item.qty])];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bidfood-order.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("비드푸드 CSV를 만들었습니다");
  logActivity("비드푸드 CSV 생성");
}

async function copyOrderCenter() {
  const text = formatOrderGroup();
  try {
    await navigator.clipboard.writeText(text);
  } catch (error) {
    elements.orderCenterPreview.select();
    document.execCommand("copy");
  }
  showToast("선택한 발주 내용을 복사했습니다");
  logActivity(`${getSelectedOrderGroup().name} 발주 복사`);
}

function downloadOrderCenterCsv() {
  const group = getSelectedOrderGroup();
  const rows = [["Supplier", "Item", "Quantity"], ...group.items.map((item) => [item.category, item.name, item.qty])];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${group.name.replaceAll(" ", "-")}-order.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("선택한 발주 CSV를 만들었습니다");
  logActivity(`${group.name} 발주 CSV 생성`);
}

async function completeOrder() {
  if (!getSelectedOrderGroup().items.length) {
    showToast("완료 기록할 발주 품목이 없습니다");
    return;
  }
  await saveRecord();
  showToast("발주 완료 기록을 저장했습니다");
  logActivity(`${getSelectedOrderGroup().name} 발주 완료 기록`);
}

function openOrderCenter() {
  state.selectedOrderGroup = "all";
  renderOrderCenter();
  elements.orderModal.classList.add("open");
  elements.orderModal.setAttribute("aria-hidden", "false");
}

function closeOrderCenter() {
  elements.orderModal.classList.remove("open");
  elements.orderModal.setAttribute("aria-hidden", "true");
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
  logActivity("전체 수량 0으로 변경");
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
  logActivity("기본 리스트 복구");
}

function undoLastChange() {
  const last = state.history.pop();
  if (!last) return;
  state.categories = last.categories;
  state.predictions = state.online ? state.predictions : buildLocalPredictions();
  writeLocalStore();
  render();
  showToast(`${last.label} 되돌림`);
  logActivity(`${last.label} 되돌림`);
}

function setSelectedCategory(value) {
  state.selectedCategory = value;
  render();
}

function showBidfoodOnly() {
  const category = state.categories.find((entry) => entry.name === "비드푸드");
  if (!category) {
    showToast("비드푸드 카테고리를 찾지 못했습니다");
    return;
  }
  state.selectedCategory = String(category.id);
  state.hideZero = false;
  elements.searchInput.value = "";
  render();
  showToast("비드푸드 전체 품목을 표시합니다");
}

function bindEvents() {
  $("refreshBtn").addEventListener("click", loadData);
  $("copyBtn").addEventListener("click", copyMessage);
  $("shareBtn").addEventListener("click", shareMessage);
  $("saveRecordBtn").addEventListener("click", () => saveRecord().catch((error) => showToast(error.message)));
  $("applyPredictBtn").addEventListener("click", () => applyPrediction().catch((error) => showToast(error.message)));
  $("addItemBtn").addEventListener("click", () => addItem().catch((error) => showToast(error.message)));
  $("downloadBtn").addEventListener("click", downloadBackup);
  $("copyBidfoodBtn").addEventListener("click", copyBidfoodOrder);
  $("downloadBidfoodBtn").addEventListener("click", downloadBidfoodCsv);
  $("showBidfoodBtn").addEventListener("click", showBidfoodOnly);
  $("openOrderCenterBtn").addEventListener("click", openOrderCenter);
  $("bottomOrderCenterBtn").addEventListener("click", openOrderCenter);
  $("closeOrderCenterBtn").addEventListener("click", closeOrderCenter);
  $("copyOrderCenterBtn").addEventListener("click", () => copyOrderCenter().catch((error) => showToast(error.message)));
  $("downloadOrderCenterBtn").addEventListener("click", downloadOrderCenterCsv);
  $("completeOrderBtn").addEventListener("click", () => completeOrder().catch((error) => showToast(error.message)));
  $("zeroAllBtn").addEventListener("click", () => zeroAll().catch((error) => showToast(error.message)));
  $("restoreBtn").addEventListener("click", restoreDefaults);
  $("undoBtn").addEventListener("click", undoLastChange);
  $("clearActivityBtn").addEventListener("click", () => {
    state.activities = [];
    writeActivities();
    renderActivity();
  });

  elements.searchInput.addEventListener("input", render);
  elements.categoryFilter.addEventListener("change", (event) => setSelectedCategory(event.target.value));
  elements.categoryTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-category]");
    if (tab) setSelectedCategory(tab.dataset.category);
  });

  elements.orderSupplierTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-order-group]");
    if (!tab) return;
    state.selectedOrderGroup = tab.dataset.orderGroup;
    renderOrderCenter();
  });

  elements.orderModal.addEventListener("click", (event) => {
    if (event.target === elements.orderModal) closeOrderCenter();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.orderModal.classList.contains("open")) {
      closeOrderCenter();
    }
  });

  elements.newItemName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addItem().catch((error) => showToast(error.message));
  });

  elements.toggleZeroBtn.addEventListener("click", () => {
    state.hideZero = !state.hideZero;
    render();
  });

  elements.orderOnlyBtn.addEventListener("click", () => {
    state.orderOnly = !state.orderOnly;
    if (state.orderOnly) state.hideZero = true;
    render();
  });

  elements.inventory.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const row = button.closest(".item-row");
    const itemId = Number(row.dataset.itemId);
    const item = findItem(itemId);
    if (!item) return;

    if (button.dataset.action === "apply-one") {
      applySinglePrediction(itemId).catch((error) => showToast(error.message));
      return;
    }

    const nextQty = button.dataset.action === "zero"
      ? 0
      : button.dataset.action === "plus-five"
      ? item.qty + 5
      : button.dataset.action === "plus"
        ? item.qty + 1
        : item.qty - 1;
    setQty(itemId, nextQty).catch((error) => showToast(error.message));
  });

  elements.recommendationList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-apply-prediction]");
    if (!button) return;
    applySinglePrediction(Number(button.dataset.applyPrediction)).catch((error) => showToast(error.message));
  });

  elements.inventory.addEventListener("change", (event) => {
    if (event.target.dataset.action !== "qty") return;
    const row = event.target.closest(".item-row");
    setQty(Number(row.dataset.itemId), event.target.value).catch((error) => showToast(error.message));
  });
}

bindEvents();
state.activities = readActivities();
loadData();
