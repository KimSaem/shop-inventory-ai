const API_URL = "/api/inventory";
const LOCAL_KEY = "shop-inventory-ai-local";

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
  recordsCount: 0,
  lastRecordDate: null,
  online: true,
  hideZero: true,
  records: []
};

const $ = (id) => document.getElementById(id);

const elements = {
  inventory: $("inventory"),
  statusText: $("statusText"),
  recordsCount: $("recordsCount"),
  predictedCount: $("predictedCount"),
  lastRecord: $("lastRecord"),
  searchInput: $("searchInput"),
  toggleZeroBtn: $("toggleZeroBtn"),
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

function buildLocalPredictions() {
  const items = state.categories.flatMap((category) => category.items.map((item) => ({
    ...item,
    category: category.name
  })));

  return items.map((item) => {
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

async function loadData() {
  try {
    const data = await api();
    state.categories = data.categories;
    state.predictions = data.predictions;
    state.recordsCount = data.recordsCount;
    state.lastRecordDate = data.lastRecordDate;
    state.online = true;
    elements.statusText.textContent = "Cloudflare DB 연결됨";
  } catch (error) {
    const local = readLocalStore();
    state.categories = local.categories;
    state.records = local.records || [];
    state.predictions = buildLocalPredictions();
    state.recordsCount = state.records.length;
    state.lastRecordDate = local.lastRecordDate || null;
    state.online = false;
    elements.statusText.textContent = "로컬 모드: Cloudflare DB 연결 전";
  }

  render();
}

function getPrediction(itemId) {
  return state.predictions.find((prediction) => prediction.itemId === itemId);
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

function renderCategoryOptions() {
  elements.newItemCategory.innerHTML = "";
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    elements.newItemCategory.append(option);
  }
}

function renderMetrics() {
  const predicted = state.predictions.filter((prediction) => Number(prediction.qty) > 0);
  elements.recordsCount.textContent = String(state.recordsCount);
  elements.predictedCount.textContent = String(predicted.length);
  elements.lastRecord.textContent = state.lastRecordDate || "없음";
}

function render() {
  const query = elements.searchInput.value.trim().toLowerCase();
  elements.inventory.innerHTML = "";

  for (const category of state.categories) {
    const visibleItems = category.items.filter((item) => {
      const matchesSearch = !query || item.name.toLowerCase().includes(query);
      const matchesZero = !state.hideZero || Number(item.qty) > 0;
      return matchesSearch && matchesZero;
    });

    if (!visibleItems.length) continue;

    const section = document.createElement("section");
    section.className = "category";

    const title = document.createElement("div");
    title.className = "category-title";
    title.innerHTML = `<span></span><span class="category-count"></span>`;
    title.children[0].textContent = category.name;
    title.children[1].textContent = `${visibleItems.length}/${category.items.length}`;
    section.append(title);

    for (const item of visibleItems) {
      const row = document.createElement("div");
      row.className = "item-row";
      row.dataset.itemId = String(item.id);

      const name = document.createElement("div");
      name.className = "item-name";
      name.textContent = item.name;

      const prediction = getPrediction(item.id);
      const pill = document.createElement("div");
      pill.className = "prediction-pill";
      pill.textContent = prediction ? `AI ${prediction.qty}` : "AI -";
      pill.title = prediction ? prediction.reason : "예측 없음";

      const stepper = document.createElement("div");
      stepper.className = "stepper";
      stepper.innerHTML = `
        <button class="minus" type="button" data-action="minus">-</button>
        <input class="qty" type="number" min="0" inputmode="numeric" value="${item.qty}" data-action="qty" />
        <button class="plus" type="button" data-action="plus">+</button>
      `;

      row.append(name, pill, stepper);
      section.append(row);
    }

    elements.inventory.append(section);
  }

  renderCategoryOptions();
  renderMetrics();
  updatePreview();
}

function findItem(itemId) {
  for (const category of state.categories) {
    const item = category.items.find((entry) => entry.id === itemId);
    if (item) return item;
  }
  return null;
}

async function setQty(itemId, qty) {
  const item = findItem(itemId);
  if (!item) return;

  item.qty = Math.max(0, Number.parseInt(qty, 10) || 0);
  updatePreview();

  if (state.online) {
    await api("", {
      method: "PATCH",
      body: JSON.stringify({ id: item.id, qty: item.qty })
    });
  } else {
    writeLocalStore();
  }

  render();
}

function currentSnapshot() {
  return state.categories.flatMap((category) => category.items.map((item) => ({
    id: item.id,
    category: category.name,
    name: item.name,
    qty: Number(item.qty) || 0
  })));
}

async function saveRecord() {
  const now = new Date();
  const date = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const payload = {
    date,
    weekday: now.getDay(),
    items: currentSnapshot()
  };

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
}

async function applyPrediction() {
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
}

async function addItem() {
  const name = elements.newItemName.value.trim();
  const categoryId = Number(elements.newItemCategory.value);
  if (!name) {
    showToast("품목 이름을 입력하세요");
    return;
  }

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
  const items = currentSnapshot();
  for (const item of items) {
    await setQty(item.id, 0);
  }
  showToast("전체 수량을 0으로 바꿨습니다");
}

async function restoreDefaults() {
  if (!confirm("기본 리스트로 복구할까요? 현재 수량과 추가 품목이 사라집니다.")) return;
  state.categories = cloneDefaultData();
  state.records = [];
  state.predictions = buildLocalPredictions();
  state.recordsCount = 0;
  state.lastRecordDate = null;
  state.online = false;
  writeLocalStore();
  render();
  elements.statusText.textContent = "로컬 기본 리스트로 복구됨";
  showToast("기본 리스트로 복구했습니다");
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

  elements.searchInput.addEventListener("input", render);
  elements.newItemName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addItem().catch((error) => showToast(error.message));
  });

  elements.toggleZeroBtn.addEventListener("click", () => {
    state.hideZero = !state.hideZero;
    elements.toggleZeroBtn.textContent = state.hideZero ? "0개 숨김" : "0개 표시";
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
