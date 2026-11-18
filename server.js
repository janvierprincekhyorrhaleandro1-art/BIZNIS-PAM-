require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ORIGIN || "*").split(",").map(v => v.trim());
app.use(cors({ origin: (origin, cb) => !origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error("Origin not allowed")) }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const metaReady = Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PHONE_NUMBER_ID);
const aiReady = Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);

app.get("/api/health", (_req, res) => res.json({
  ok: true, app: "BIZNIS PAM", databaseConfigured: Boolean(supabase),
  whatsappConfigured: metaReady, aiConfigured: aiReady, timestamp: new Date().toISOString()
}));

async function dbList(table, merchantId) {
  if (!supabase) return { data: [], error: "Database is not configured yet." };
  let q = supabase.from(table).select("*").order("created_at", { ascending: false }).limit(100);
  if (merchantId) q = q.eq("merchant_id", merchantId);
  const { data, error } = await q;
  return { data: data || [], error: error?.message || null };
}
app.get("/api/:resource", async (req, res, next) => {
  const allowed = ["products", "categories", "orders", "customers", "conversations"];
  if (!allowed.includes(req.params.resource)) return next();
  const result = await dbList(req.params.resource, req.query.merchant_id);
  if (result.error && !supabase) return res.status(503).json({ error: result.error, data: [] });
  if (result.error) return res.status(500).json({ error: result.error });
  res.json({ data: result.data });
});

app.post("/api/products", async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Configure Supabase before saving products." });
  const { name, description = "", price, currency = "HTG", stock = 0, category_id = null, merchant_id } = req.body || {};
  if (!name || !merchant_id || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: "name, merchant_id and a valid price are required." });
  const { data, error } = await supabase.from("products").insert({ name, description, price: Number(price), currency, stock: Number(stock) || 0, category_id, merchant_id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json({ data });
});

async function sendWhatsApp(to, body) {
  if (!metaReady) throw new Error("WhatsApp Cloud API is not configured.");
  const response = await fetch(`https://graph.facebook.com/v21.0/${process.env.META_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "WhatsApp message failed.");
  return json;
}
async function findProducts(message) {
  if (!supabase) return [];
  const { data } = await supabase.from("products").select("name,description,price,currency,stock").eq("is_active", true).limit(100);
  const terms = String(message).toLocaleLowerCase().split(/\W+/).filter(w => w.length > 2);
  return (data || []).filter(p => terms.some(t => p.name.toLocaleLowerCase().includes(t) || (p.description || "").toLocaleLowerCase().includes(t))).slice(0, 8);
}
async function draftReply(message, products) {
  if (!aiReady) return null;
  const productFacts = products.map(p => `${p.name}: price ${p.price} ${p.currency}; stock ${p.stock}; description ${p.description || "not provided"}`).join("\n") || "No matching product facts found.";
  const response = await fetch(process.env.AI_BASE_URL || "https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.AI_MODEL, temperature: 0.2, messages: [
      { role: "system", content: "You are the customer service and sales assistant for a merchant in Haiti. Reply in the customer's language (Haitian Creole, French, or English). Use ONLY the product facts supplied below. Never invent prices, discounts, availability, delivery promises, or policies. If facts are missing, say a human teammate will confirm. Be concise, polite, and helpful. If the customer asks for a person, has a complaint, payment issue, or the request is unclear, recommend human handoff. Product facts:\n" + productFacts },
      { role: "user", content: String(message).slice(0, 3000) }
    ] })
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error?.message || "AI provider request failed.");
  return json.choices?.[0]?.message?.content?.trim() || null;
}
async function processIncomingWhatsApp(value) {
  const messages = value?.messages || [];
  for (const message of messages) {
    if (message.type !== "text" || !message.from) continue;
    const text = message.text?.body || "";
    const products = await findProducts(text);
    let reply = null;
    try { reply = await draftReply(text, products); } catch (e) { console.error("AI reply error:", e.message); }
    if (!reply) reply = "Mèsi paske ou kontakte nou. Nou resevwa mesaj ou a; yon manm ekip nou an ap ede w byento. / Merci, nous avons reçu votre message. Un membre de notre équipe vous répondra bientôt.";
    try {
      await sendWhatsApp(message.from, reply);
      if (supabase) await supabase.from("conversations").insert({
        customer_phone: message.from, channel: "whatsapp", customer_message: text,
        assistant_reply: reply, status: aiReady ? "replied" : "human_handoff"
      });
    } catch (e) { console.error("WhatsApp processing error:", e.message); }
  }
}

app.get("/webhooks/whatsapp", (req, res) => {
  const valid = req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.META_VERIFY_TOKEN;
  if (valid) return res.status(200).send(req.query["hub.challenge"]);
  res.sendStatus(403);
});
app.post("/webhooks/whatsapp", (req, res) => {
  res.sendStatus(200);
  if (req.body?.object === "whatsapp_business_account") {
    for (const entry of req.body.entry || []) for (const change of entry.changes || []) processIncomingWhatsApp(change.value).catch(e => console.error(e));
  }
});

app.use(express.static(path.join(__dirname, "public")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: "Internal server error" }); });
app.listen(PORT, () => console.log(`BIZNIS PAM API listening on ${PORT}`));
