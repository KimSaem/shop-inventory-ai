import { AuthError, json, requireUser } from "../_shared/auth.js";

const ROLL_PRODUCTS = [
  "Salmon Avocado CreamCheese",
  "Salmon Avocado",
  "Cook Salmon",
  "Spicy Chicken",
  "Crispy Chicken",
  "Crispy Chicken CreamCheese",
  "Teriyaki Chicken",
  "Teriyaki Chicken CreamCheese",
  "Egg Teriyaki Chicken",
  "Crispy Pork",
  "Spicy Pork",
  "Crumb Prawn",
  "Spicy Prawn",
  "Tuna Mayo",
  "Pineapple Cream Cheese",
  "Avocado",
  "Surumi",
  "Seaweed",
  "mini"
];

const DEFAULT_PRODUCTS = [
  ...ROLL_PRODUCTS.map((name, index) => ({ category: "Sushi Roll", name, price: 1.8, sort_order: index })),
  { category: "Nigiri / Inari", name: "Salmon Nigiri", price: 2.7, sort_order: 100 },
  { category: "Nigiri / Inari", name: "Premium Salmon Nigiri", price: 3.2, sort_order: 101 },
  { category: "Nigiri / Inari", name: "Inari", price: 2.5, sort_order: 102 },
  { category: "Nigiri / Inari", name: "Egg Nigiri", price: 2.5, sort_order: 103 },
  { category: "Nigiri / Inari", name: "Prawn Nigiri", price: 2.5, sort_order: 104 },
  { category: "Nigiri / Inari", name: "Tuna Nigiri", price: 2.5, sort_order: 105 },
  { category: "Fried", name: "Fried $1.8", price: 1.8, sort_order: 200 },
  { category: "Fried", name: "Fried $2.0", price: 2.0, sort_order: 201 },
  { category: "Fried", name: "Fried $4.2", price: 4.2, sort_order: 202 },
  { category: "Fried", name: "Fried $4.5", price: 4.5, sort_order: 203 },
  { category: "Fried", name: "Fried $4.7", price: 4.7, sort_order: 204 }
];

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pos_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pos_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sold_at TEXT NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pos_sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      line_total REAL NOT NULL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES pos_sales(id)
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS pos_product_recipes (
      product_id INTEGER NOT NULL,
      inventory_item_id INTEGER NOT NULL,
      units REAL NOT NULL DEFAULT 1,
      unit_name TEXT,
      PRIMARY KEY (product_id, inventory_item_id)
    )
  `).run();

  try {
    await db.prepare("ALTER TABLE pos_sales ADD COLUMN discount REAL NOT NULL DEFAULT 0").run();
  } catch (error) {
    if (!String(error.message || "").includes("duplicate column name")) throw error;
  }
}

async function ensureSeeded(db) {
  for (const product of DEFAULT_PRODUCTS) {
    await db.prepare(`
      INSERT INTO pos_products (category, name, price, sort_order)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(name) DO NOTHING
    `).bind(product.category, product.name, product.price, product.sort_order).run();
  }
}

async function getProducts(db) {
  const result = await db.prepare(`
    SELECT id, category, name, price, active, sort_order
    FROM pos_products
    WHERE active = 1
    ORDER BY sort_order, category, name
  `).all();
  return result.results || [];
}

async function getTodayReport(db) {
  const today = new Date().toISOString().slice(0, 10);
  const summary = await db.prepare(`
    SELECT COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS revenue
    FROM pos_sales
    WHERE substr(sold_at, 1, 10) = ?
  `).bind(today).first();

  const items = await db.prepare(`
    SELECT name, category, SUM(qty) AS qty, SUM(line_total) AS total
    FROM pos_sale_items
    WHERE sale_id IN (SELECT id FROM pos_sales WHERE substr(sold_at, 1, 10) = ?)
    GROUP BY name, category
    ORDER BY qty DESC, total DESC
    LIMIT 8
  `).bind(today).all();

  const payments = await db.prepare(`
    SELECT payment_method, COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS total
    FROM pos_sales
    WHERE substr(sold_at, 1, 10) = ?
    GROUP BY payment_method
    ORDER BY total DESC
  `).bind(today).all();

  const hourly = await db.prepare(`
    SELECT substr(sold_at, 12, 2) AS hour, COUNT(*) AS transactions, COALESCE(SUM(total), 0) AS total
    FROM pos_sales
    WHERE substr(sold_at, 1, 10) = ?
    GROUP BY hour
    ORDER BY hour
  `).bind(today).all();

  return {
    date: today,
    transactions: Number(summary?.transactions || 0),
    revenue: Number(summary?.revenue || 0),
    averageTicket: Number(summary?.transactions || 0) ? Number((Number(summary.revenue || 0) / Number(summary.transactions || 1)).toFixed(2)) : 0,
    soldItems: (items.results || []).map((item) => ({
      ...item,
      qty: Number(item.qty || 0),
      total: Number(item.total || 0)
    })),
    paymentMix: (payments.results || []).map((item) => ({
      method: item.payment_method,
      transactions: Number(item.transactions || 0),
      total: Number(item.total || 0)
    })),
    hourly: (hourly.results || []).map((item) => ({
      hour: item.hour,
      transactions: Number(item.transactions || 0),
      total: Number(item.total || 0)
    }))
  };
}

async function getRecentSales(db) {
  const sales = await db.prepare(`
    SELECT id, sold_at, subtotal, discount, total, payment_method
    FROM pos_sales
    ORDER BY sold_at DESC, id DESC
    LIMIT 10
  `).all();

  const rows = sales.results || [];
  if (!rows.length) return [];

  const ids = rows.map((sale) => sale.id);
  const placeholders = ids.map(() => "?").join(",");
  const items = await db.prepare(`
    SELECT sale_id, name, qty, line_total
    FROM pos_sale_items
    WHERE sale_id IN (${placeholders})
    ORDER BY id
  `).bind(...ids).all();

  const grouped = new Map();
  for (const item of items.results || []) {
    if (!grouped.has(item.sale_id)) grouped.set(item.sale_id, []);
    grouped.get(item.sale_id).push(item);
  }

  return rows.map((sale) => ({
    ...sale,
    subtotal: Number(sale.subtotal || sale.total || 0),
    discount: Number(sale.discount || 0),
    total: Number(sale.total || 0),
    items: grouped.get(sale.id) || []
  }));
}

async function getForecast(db) {
  const rows = await db.prepare(`
    SELECT substr(sold_at, 1, 10) AS day, SUM(total) AS revenue, COUNT(*) AS transactions
    FROM pos_sales
    GROUP BY day
    ORDER BY day DESC
    LIMIT 14
  `).all();

  const days = rows.results || [];
  const revenue = days.map((day) => Number(day.revenue || 0));
  const transactions = days.reduce((sum, day) => sum + Number(day.transactions || 0), 0);
  const averageRevenue = revenue.length ? revenue.reduce((sum, value) => sum + value, 0) / revenue.length : 0;

  return {
    projectedRevenue: Number(averageRevenue.toFixed(2)),
    confidence: transactions >= 80 ? "높음" : transactions >= 25 ? "보통" : transactions > 0 ? "낮음" : "시작",
    daysLearned: days.length,
    transactions
  };
}

async function getIngredientUsage(db) {
  const rows = await db.prepare(`
    SELECT category, name, SUM(qty) AS qty
    FROM pos_sale_items
    WHERE sale_id IN (
      SELECT id FROM pos_sales
      WHERE sold_at >= datetime('now', '-7 days')
    )
    GROUP BY category, name
    ORDER BY qty DESC
    LIMIT 12
  `).all();

  return (rows.results || []).map((row) => ({
    label: row.name,
    category: row.category,
    qty: Number(row.qty || 0),
    hint: buildIngredientHint(row.name, row.category, Number(row.qty || 0))
  }));
}

function buildIngredientHint(name, category, qty) {
  const lower = String(name).toLowerCase();
  if (lower.includes("salmon")) return `연어 사용 기준 ${qty}개 판매`;
  if (lower.includes("chicken")) return `치킨 사용 기준 ${qty}개 판매`;
  if (lower.includes("prawn")) return `새우 사용 기준 ${qty}개 판매`;
  if (lower.includes("cream")) return `크림치즈 포함 ${qty}개 판매`;
  if (category === "Fried") return `튀김류 ${qty}개 판매`;
  return `${category} ${qty}개 판매`;
}

async function getDashboard(db) {
  return {
    products: await getProducts(db),
    today: await getTodayReport(db),
    forecast: await getForecast(db),
    ingredientUsage: await getIngredientUsage(db),
    recentSales: await getRecentSales(db)
  };
}

async function recordSale(db, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new Error("Cart is empty.");

  const products = await getProducts(db);
  const productMap = new Map(products.map((product) => [Number(product.id), product]));
  const lines = items.map((item) => {
    const product = productMap.get(Number(item.productId));
    if (!product) throw new Error("Product not found.");
    const qty = Math.max(1, Number.parseInt(item.qty, 10) || 1);
    const unitPrice = Number(product.price || 0);
    return {
      productId: product.id,
      name: product.name,
      category: product.category,
      qty,
      unitPrice,
      lineTotal: Number((qty * unitPrice).toFixed(2))
    };
  });

  const total = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
  const discount = Math.max(0, Math.min(total, Number(body.discount || 0)));
  const finalTotal = Number((total - discount).toFixed(2));
  const paymentMethod = String(body.paymentMethod || "cash").slice(0, 40);
  const soldAt = new Date().toISOString();

  const sale = await db.prepare(`
    INSERT INTO pos_sales (sold_at, subtotal, discount, total, payment_method, note)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(soldAt, total, discount, finalTotal, paymentMethod, body.note || null).run();

  const saleId = sale.meta.last_row_id;
  for (const line of lines) {
    await db.prepare(`
      INSERT INTO pos_sale_items (sale_id, product_id, name, category, qty, unit_price, line_total)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(saleId, line.productId, line.name, line.category, line.qty, line.unitPrice, line.lineTotal).run();
  }

  return { saleId, subtotal: total, discount, total: finalTotal, lines };
}

async function updateProduct(db, body) {
  const id = Number(body.id);
  const price = Number(body.price);
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  if (!id || !name || !category || Number.isNaN(price) || price < 0) {
    throw new Error("Invalid product details.");
  }

  await db.prepare(`
    UPDATE pos_products
    SET name = ?, category = ?, price = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(name, category, price, id).run();
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "Cloudflare D1 binding DB is not configured." }, 500);

  try {
    await ensureSchema(env.DB);
    await ensureSeeded(env.DB);
    await requireUser(env.DB, request);

    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const action = url.searchParams.get("action");

    if (method === "GET") return json(await getDashboard(env.DB));

    const body = await request.json().catch(() => ({}));

    if (method === "POST" && action === "sale") {
      const sale = await recordSale(env.DB, body);
      return json({ ok: true, sale, dashboard: await getDashboard(env.DB) });
    }

    if (method === "POST" && action === "update-product") {
      await requireUser(env.DB, request, ["admin"]);
      await updateProduct(env.DB, body);
      return json({ ok: true, dashboard: await getDashboard(env.DB) });
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    return json({ error: error.message || "POS error" }, 500);
  }
}
