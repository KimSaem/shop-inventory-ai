const DEFAULT_DATA = [
  ["튀김 / 냉동", ["만두", 1], ["탬프라", 2], ["스프링롤", 0], ["타코야끼", 0], ["새우", 6], ["포크 돈까스", 1], ["프론 트위스트", 0], ["프론 슈마이", 1], ["피쉬", 0], ["핫도그", 0], ["손가락치킨", 1], ["크랩볼", 0], ["오징어", 1], ["스시 튀김", 0], ["라이스볼", 0]],
  ["스시 / 생선", ["연어 싸는거", 1], ["연어 니기리", 0], ["연어 파이어", 0], ["장어", 0], ["튜나 니기리", 0], ["씨위드", 0], ["수루미", 0], ["오뎅", 0], ["단새우", 0], ["유부", 0], ["차에 물고기 간장", 0]],
  ["소스 / 반찬", ["테리야끼", 1], ["달걀말이", 0]],
  ["야채 / 과일", ["오이", 2], ["피망", 0], ["상추", 0], ["양배추", 0], ["바나나", 0], ["바나나 스프링", 0], ["아보카도", 5]],
  ["치킨 / 돈부리", ["치킨 돈부리", 1], ["코리안 치킨", 0], ["치킨 윙", 1]],
  ["포장 / 기타", ["브라운 컨테이너", 0]],
  ["비드푸드", ["새우꼬지", 1], ["바오번", 0], ["크림치즈", 0], ["딤섬", 1], ["치킨케밥", 0], ["치킨 슈마이", 0], ["BBQ SAUCE", 0], ["Sweet Chilli Sauce", 0], ["Thousand SAUCE (SEAFOOD SAUCE)", 0], ["ETA FREE MAYO", 0], ["KIWI MAYO", 0], ["FILTER Fat Cone 11 inch", 0], ["Scale Paper Waxed", 0], ["Chocolate Buttons Compound Milk", 0], ["Drink Creaming Soda Bottle (Bundaberg)", 0], ["Drink Dekopon Mandarin (Bundaberg)", 0], ["Drink Ginger Beer Diet (Bundaberg)", 0], ["Sauce Oyster KUM CHUN", 0], ["Chip 13mm ure crisp (Mc Cain)", 0], ["Drink Guava", 0], ["Drink Lemonade", 0], ["Drink Passionfurit", 0], ["Drink Peach", 0], ["Drink Pineapple Coconut", 0], ["Drink Tropical Mango", 0], ["Egg Grade 7 Cage Free Barn", 0]],
  ["음료수", ["콜라", 0], ["콜라 제로", 0], ["스프라이트", 0], ["환타", 0], ["물", 0], ["주스", 0], ["아이스티", 0], ["캔음료", 0], ["병음료", 0]]
];

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  }
});

const todayKey = () => new Date().toISOString().slice(0, 10);

async function ensureSchema(db) {
  const statements = [
    "ALTER TABLE items ADD COLUMN supplier TEXT",
    "ALTER TABLE items ADD COLUMN product_code TEXT",
    "ALTER TABLE items ADD COLUMN unit TEXT",
    "ALTER TABLE items ADD COLUMN min_qty INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE items ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0"
  ];

  for (const statement of statements) {
    try {
      await db.prepare(statement).run();
    } catch (error) {
      if (!String(error.message || "").includes("duplicate column name")) throw error;
    }
  }
}

async function ensureSeeded(db) {
  for (let categoryIndex = 0; categoryIndex < DEFAULT_DATA.length; categoryIndex += 1) {
    const [categoryName, ...items] = DEFAULT_DATA[categoryIndex];
    await db.prepare("INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)")
      .bind(categoryName, categoryIndex)
      .run();

    const category = await db.prepare("SELECT id FROM categories WHERE name = ?")
      .bind(categoryName)
      .first();

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const [itemName, qty] = items[itemIndex];
      await db.prepare(`
        INSERT INTO items (category_id, name, current_qty, sort_order)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(category_id, name) DO UPDATE SET active = 1
      `).bind(category.id, itemName, qty, itemIndex).run();
    }
  }
}

async function getCategories(db) {
  const rows = await db.prepare(`
    SELECT
      c.id AS category_id,
      c.name AS category_name,
      c.sort_order AS category_sort,
      i.id AS item_id,
      i.name AS item_name,
      i.current_qty,
      i.supplier,
      i.product_code,
      i.unit,
      i.min_qty,
      i.pinned,
      i.sort_order AS item_sort
    FROM categories c
    LEFT JOIN items i ON i.category_id = c.id AND i.active = 1
    ORDER BY c.sort_order, i.sort_order, i.name
  `).all();

  const categories = [];
  const byId = new Map();

  for (const row of rows.results || []) {
    if (!byId.has(row.category_id)) {
      const category = {
        id: row.category_id,
        name: row.category_name,
        items: []
      };
      byId.set(row.category_id, category);
      categories.push(category);
    }

    if (row.item_id) {
      byId.get(row.category_id).items.push({
        id: row.item_id,
        name: row.item_name,
        qty: Number(row.current_qty) || 0,
        supplier: row.supplier || row.category_name,
        productCode: row.product_code || "",
        unit: row.unit || "",
        minQty: Number(row.min_qty) || 0,
        pinned: Boolean(row.pinned)
      });
    }
  }

  return categories;
}

async function getRecords(db) {
  const rows = await db.prepare(`
    SELECT
      r.id AS record_id,
      r.record_date,
      r.weekday,
      ri.item_id,
      ri.qty
    FROM inventory_records r
    LEFT JOIN inventory_record_items ri ON ri.record_id = r.id
    ORDER BY r.record_date ASC
  `).all();

  const records = [];
  const byId = new Map();

  for (const row of rows.results || []) {
    if (!byId.has(row.record_id)) {
      const record = {
        id: row.record_id,
        date: row.record_date,
        weekday: row.weekday,
        items: []
      };
      byId.set(row.record_id, record);
      records.push(record);
    }

    if (row.item_id) {
      byId.get(row.record_id).items.push({
        itemId: row.item_id,
        qty: Number(row.qty) || 0
      });
    }
  }

  return records;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function predictForItem(item, records) {
  const values = records
    .map((record) => {
      const match = record.items.find((entry) => entry.itemId === item.id);
      return {
        date: record.date,
        weekday: record.weekday,
        qty: match ? Number(match.qty) || 0 : 0
      };
    });

  if (!values.length) {
    return { itemId: item.id, qty: item.qty, confidence: "start", reason: "기록 없음" };
  }

  const weekday = new Date().getDay();
  const recent = values.slice(-5).map((entry) => entry.qty);
  const weekdayValues = values.filter((entry) => entry.weekday === weekday).slice(-8).map((entry) => entry.qty);
  const last = values[values.length - 1].qty;
  const lastThree = values.slice(-3).map((entry) => entry.qty);
  const priorThree = values.slice(-6, -3).map((entry) => entry.qty);
  const trend = priorThree.length ? (average(lastThree) - average(priorThree)) * 0.35 : 0;
  const weekdayAverage = weekdayValues.length ? average(weekdayValues) : average(recent);
  const raw = average(recent) * 0.55 + weekdayAverage * 0.25 + last * 0.2 + trend;
  const qty = Math.max(0, Math.round(raw));

  return {
    itemId: item.id,
    qty,
    confidence: values.length >= 14 ? "high" : values.length >= 5 ? "medium" : "low",
    reason: values.length >= 5 ? "최근 기록 + 요일 + 추세" : "최근 기록 중심"
  };
}

function buildPredictions(categories, records) {
  const items = categories.flatMap((category) => category.items.map((item) => ({
    ...item,
    category: category.name
  })));

  return items.map((item) => ({
    ...predictForItem(item, records),
    name: item.name,
    category: item.category
  }));
}

async function saveRecord(db, body) {
  const date = body.date || todayKey();
  const weekday = Number.isInteger(body.weekday) ? body.weekday : new Date(`${date}T12:00:00Z`).getUTCDay();
  const items = Array.isArray(body.items) ? body.items : [];

  await db.prepare(`
    INSERT INTO inventory_records (record_date, weekday, note)
    VALUES (?, ?, ?)
    ON CONFLICT(record_date) DO UPDATE SET weekday = excluded.weekday, note = excluded.note
  `).bind(date, weekday, body.note || null).run();

  const record = await db.prepare("SELECT id FROM inventory_records WHERE record_date = ?").bind(date).first();
  await db.prepare("DELETE FROM inventory_record_items WHERE record_id = ?").bind(record.id).run();

  for (const item of items) {
    await db.prepare(`
      INSERT INTO inventory_record_items (record_id, item_id, qty)
      VALUES (?, ?, ?)
    `).bind(record.id, item.id, Math.max(0, Number(item.qty) || 0)).run();
  }
}

async function updateQuantity(db, body) {
  const id = Number(body.id);
  const qty = Math.max(0, Number(body.qty) || 0);
  if (!id) throw new Error("Missing item id");

  await db.prepare(`
    UPDATE items
    SET current_qty = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(qty, id).run();
}

async function applyPredictions(db, predictions) {
  for (const prediction of predictions) {
    await db.prepare(`
      UPDATE items
      SET current_qty = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(prediction.qty, prediction.itemId).run();
  }
}

async function addItem(db, body) {
  const categoryId = Number(body.categoryId);
  const name = String(body.name || "").trim();
  if (!categoryId || !name) throw new Error("Category and name are required");

  const last = await db.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM items WHERE category_id = ?")
    .bind(categoryId)
    .first();

  await db.prepare(`
    INSERT INTO items (category_id, name, current_qty, sort_order)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(category_id, name) DO UPDATE SET active = 1
  `).bind(categoryId, name, Math.max(0, Number(body.qty) || 0), last.next_order).run();
}

async function updateItem(db, body) {
  const id = Number(body.id);
  const categoryId = Number(body.categoryId);
  const name = String(body.name || "").trim();
  if (!id || !categoryId || !name) throw new Error("Item id, category, and name are required");

  await db.prepare(`
    UPDATE items
    SET
      category_id = ?,
      name = ?,
      supplier = ?,
      product_code = ?,
      unit = ?,
      min_qty = ?,
      pinned = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    categoryId,
    name,
    String(body.supplier || "").trim() || null,
    String(body.productCode || "").trim() || null,
    String(body.unit || "").trim() || null,
    Math.max(0, Number(body.minQty) || 0),
    body.pinned ? 1 : 0,
    id
  ).run();
}

async function hideItem(db, body) {
  const id = Number(body.id);
  if (!id) throw new Error("Missing item id");

  await db.prepare(`
    UPDATE items
    SET active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();
}

export async function onRequest({ request, env }) {
  if (!env.DB) {
    return json({ error: "Cloudflare D1 binding DB is not configured." }, 500);
  }

  try {
    await ensureSchema(env.DB);
    await ensureSeeded(env.DB);

    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "GET") {
      const categories = await getCategories(env.DB);
      const records = await getRecords(env.DB);
      const predictions = buildPredictions(categories, records);
      return json({
        categories,
        predictions,
        recordsCount: records.length,
        lastRecordDate: records.length ? records[records.length - 1].date : null
      });
    }

    const body = await request.json().catch(() => ({}));

    if (method === "POST" && url.searchParams.get("action") === "record") {
      await saveRecord(env.DB, body);
      return json({ ok: true });
    }

    if (method === "POST" && url.searchParams.get("action") === "add-item") {
      await addItem(env.DB, body);
      return json({ ok: true });
    }

    if (method === "POST" && url.searchParams.get("action") === "update-item") {
      await updateItem(env.DB, body);
      return json({ ok: true });
    }

    if (method === "POST" && url.searchParams.get("action") === "hide-item") {
      await hideItem(env.DB, body);
      return json({ ok: true });
    }

    if (method === "POST" && url.searchParams.get("action") === "apply-predictions") {
      const categories = await getCategories(env.DB);
      const records = await getRecords(env.DB);
      const predictions = buildPredictions(categories, records);
      await applyPredictions(env.DB, predictions);
      return json({ ok: true });
    }

    if (method === "PATCH") {
      await updateQuantity(env.DB, body);
      return json({ ok: true });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    return json({ error: error.message || "Unknown error" }, 500);
  }
}
