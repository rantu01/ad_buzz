import clientPromise from "./mongodb";
import { ObjectId } from "mongodb";
import { initializeIndexes } from "./indexes";

const DB_NAME = process.env.MONGODB_DB_NAME || "ad_buzz";

async function db() {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

async function categoriesCol() {
  await initializeIndexes();
  const d = await db();
  return d.collection("helpCenterCategories");
}

async function articlesCol() {
  await initializeIndexes();
  const d = await db();
  return d.collection("helpCenterArticles");
}

async function feedbackCol() {
  await initializeIndexes();
  const d = await db();
  return d.collection("helpCenterFeedback");
}

export function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function calculateReadingTime(content) {
  const text = String(content || "").replace(/<[^>]*>/g, " ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  return minutes;
}

const DEFAULT_CATEGORIES = [
  "Getting Started",
  "Business & Verification",
  "Payment Setup & Banks",
  "Ad Accounts",
  "Wallet & Deposits",
  "Top-ups",
  "Refunds & Reserve",
  "Team & CRM",
];

export async function seedDefaultCategories() {
  const col = await categoriesCol();
  const count = await col.countDocuments();
  if (count > 0) return;
  const docs = DEFAULT_CATEGORIES.map((name, i) => ({
    name,
    slug: slugify(name),
    description: "",
    displayOrder: i,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  await col.insertMany(docs);
}

export async function listCategories({ activeOnly = false } = {}) {
  await seedDefaultCategories();
  const col = await categoriesCol();
  const filter = activeOnly ? { isActive: true } : {};
  return col.find(filter).sort({ displayOrder: 1, name: 1 }).toArray();
}

export async function getCategoryById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await categoriesCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function getCategoryBySlug(slug) {
  const col = await categoriesCol();
  return col.findOne({ slug });
}

export async function createCategory(data) {
  const col = await categoriesCol();
  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  let finalSlug = slug;
  let i = 1;
  while (await col.findOne({ slug: finalSlug })) {
    finalSlug = `${slug}-${i++}`;
  }
  const doc = {
    name: String(data.name || "").trim(),
    slug: finalSlug,
    description: String(data.description || "").trim(),
    displayOrder: Number.isFinite(Number(data.displayOrder)) ? Number(data.displayOrder) : 0,
    isActive: data.isActive !== false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function updateCategory(id, data) {
  if (!ObjectId.isValid(id)) return null;
  const col = await categoriesCol();
  const update = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.slug !== undefined) update.slug = slugify(data.slug);
  if (data.description !== undefined) update.description = String(data.description).trim();
  if (data.displayOrder !== undefined) update.displayOrder = Number(data.displayOrder) || 0;
  if (data.isActive !== undefined) update.isActive = !!data.isActive;
  update.updatedAt = new Date();
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );
  return res.value || res;
}

export async function deleteCategory(id) {
  if (!ObjectId.isValid(id)) return { ok: false, reason: "invalid" };
  const col = await categoriesCol();
  const aCol = await articlesCol();
  const count = await aCol.countDocuments({ categoryId: new ObjectId(id) });
  if (count > 0) {
    return { ok: false, reason: "has_articles", count };
  }
  await col.deleteOne({ _id: new ObjectId(id) });
  return { ok: true };
}

export async function listArticles({ status = null, categoryId = null, search = null, page = 1, limit = 20, summaryOnly = true } = {}) {
  const col = await articlesCol();
  const filter = {};
  if (status) filter.status = status;
  if (categoryId) {
    try { filter.categoryId = new ObjectId(categoryId); } catch { filter.categoryId = categoryId; }
  }
  if (search && String(search).trim()) {
    const q = String(search).trim();
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { title: rx },
      { description: rx },
      { content: rx },
    ];
  }
  const skip = (Math.max(1, Number(page) || 1) - 1) * (Number(limit) || 20);
  const lim = Number(limit) || 20;
  const projection = summaryOnly ? { content: 0 } : {};
  const [items, total] = await Promise.all([
    col.find(filter, { projection }).sort({ createdAt: -1 }).skip(skip).limit(lim).toArray(),
    col.countDocuments(filter),
  ]);
  return { items, total, page: Number(page) || 1, limit: lim };
}

export async function getArticleById(id) {
  if (!ObjectId.isValid(id)) return null;
  const col = await articlesCol();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function getArticleBySlug(slug) {
  const col = await articlesCol();
  return col.findOne({ slug });
}

export async function createArticle(data) {
  const col = await articlesCol();
  const baseSlug = data.slug ? slugify(data.slug) : slugify(data.title);
  let finalSlug = baseSlug || `article-${Date.now()}`;
  let i = 1;
  while (await col.findOne({ slug: finalSlug })) {
    finalSlug = `${baseSlug}-${i++}`;
  }
  const readingTime = data.readingTime ? Number(data.readingTime) : calculateReadingTime(data.content);
  const doc = {
    title: String(data.title || "").trim(),
    slug: finalSlug,
    categoryId: data.categoryId && ObjectId.isValid(data.categoryId) ? new ObjectId(data.categoryId) : null,
    contentType: data.contentType || "Guide",
    description: String(data.description || "").trim(),
    content: String(data.content || ""),
    featuredImage: data.featuredImage || null,
    readingTime: readingTime || 1,
    status: data.status || "draft",
    authorId: data.authorId || null,
    authorName: data.authorName || null,
    publishedAt: data.status === "published" ? new Date() : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const res = await col.insertOne(doc);
  return { ...doc, _id: res.insertedId };
}

export async function updateArticle(id, data) {
  if (!ObjectId.isValid(id)) return null;
  const col = await articlesCol();
  const update = {};
  if (data.title !== undefined) update.title = String(data.title).trim();
  if (data.slug !== undefined) {
    const s = slugify(data.slug);
    let final = s;
    let i = 1;
    while (await col.findOne({ slug: final, _id: { $ne: new ObjectId(id) } })) {
      final = `${s}-${i++}`;
    }
    update.slug = final;
  }
  if (data.categoryId !== undefined) {
    update.categoryId = data.categoryId && ObjectId.isValid(data.categoryId) ? new ObjectId(data.categoryId) : null;
  }
  if (data.contentType !== undefined) update.contentType = data.contentType;
  if (data.description !== undefined) update.description = String(data.description).trim();
  if (data.content !== undefined) {
    update.content = String(data.content);
    update.readingTime = calculateReadingTime(data.content);
  }
  if (data.featuredImage !== undefined) update.featuredImage = data.featuredImage || null;
  if (data.readingTime !== undefined) update.readingTime = Number(data.readingTime) || 1;
  if (data.status !== undefined) {
    update.status = data.status;
    if (data.status === "published") {
      const existing = await col.findOne({ _id: new ObjectId(id) }, { projection: { publishedAt: 1 } });
      if (!existing?.publishedAt) update.publishedAt = new Date();
    } else {
      update.publishedAt = null;
    }
  }
  update.updatedAt = new Date();
  const res = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: "after" }
  );
  return res.value || res;
}

export async function deleteArticle(id) {
  if (!ObjectId.isValid(id)) return false;
  const col = await articlesCol();
  const fCol = await feedbackCol();
  await fCol.deleteMany({ articleId: new ObjectId(id) });
  const res = await col.deleteOne({ _id: new ObjectId(id) });
  return res.deletedCount > 0;
}

export async function countPublishedByCategory(categoryId) {
  const col = await articlesCol();
  const filter = { status: "published" };
  if (categoryId) {
    try { filter.categoryId = new ObjectId(categoryId); } catch { filter.categoryId = categoryId; }
  }
  return col.countDocuments(filter);
}

export async function submitFeedback({ articleId, userId, helpful }) {
  if (!ObjectId.isValid(articleId)) return { ok: false, reason: "invalid_article" };
  const col = await feedbackCol();
  const aId = new ObjectId(articleId);
  const existing = await col.findOne({ articleId: aId, userId: userId || null });
  if (existing) {
    await col.updateOne(
      { _id: existing._id },
      { $set: { helpful: !!helpful, updatedAt: new Date() } }
    );
    return { ok: true, updated: true };
  }
  await col.insertOne({
    articleId: aId,
    userId: userId || null,
    helpful: !!helpful,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ok: true, updated: false };
}

export async function getFeedbackStats({ articleId = null } = {}) {
  const col = await feedbackCol();
  const match = articleId && ObjectId.isValid(articleId) ? { articleId: new ObjectId(articleId) } : {};
  const pipeline = [
    { $match: match },
    {
      $group: {
        _id: "$articleId",
        yes: { $sum: { $cond: ["$helpful", 1, 0] } },
        no: { $sum: { $cond: ["$helpful", 0, 1] } },
        total: { $sum: 1 },
      },
    },
  ];
  const rows = await col.aggregate(pipeline).toArray();
  return rows;
}

export async function getFeedbackForArticle(articleId) {
  if (!ObjectId.isValid(articleId)) return { yes: 0, no: 0, total: 0 };
  const col = await feedbackCol();
  const aId = new ObjectId(articleId);
  const yes = await col.countDocuments({ articleId: aId, helpful: true });
  const no = await col.countDocuments({ articleId: aId, helpful: false });
  return { yes, no, total: yes + no };
}
