import clientPromise from "@/lib/mongodb";
import { SYSTEM_ROLE_DEFAULTS } from "@/lib/rbacCatalog";

const COLLECTION = "roles";

function getDbName() {
  return process.env.MONGODB_DB_NAME || "ad_buzz";
}

export async function getRolesCollection() {
  const client = await clientPromise;
  return client.db(getDbName()).collection(COLLECTION);
}

// Insert any missing system roles without touching customised ones.
// Safe to call on every read — uses $setOnInsert semantics via bulk upsert.
export async function ensureSystemRoles() {
  const col = await getRolesCollection();
  const now = new Date();
  const ops = SYSTEM_ROLE_DEFAULTS.map((def) => ({
    updateOne: {
      filter: { key: def.key },
      update: {
        $setOnInsert: {
          key: def.key,
          name: def.name,
          label: def.label,
          description: def.description,
          permissions: def.permissions,
          level2Routes: def.level2Routes,
          isSystem: def.isSystem,
          createdAt: now,
          updatedAt: now,
        },
      },
      upsert: true,
    },
  }));
  if (ops.length) await col.bulkWrite(ops);
  try {
    await col.createIndex({ key: 1 }, { unique: true });
  } catch {
    // index already exists — ignore
  }
  return col;
}

export async function getAllRoles() {
  const col = await ensureSystemRoles();
  return col.find({}).sort({ isSystem: -1, name: 1 }).toArray();
}

// Roles with assigned-user counts + a small sample of users per role
// (used for the "Users" pills column on the Manage Roles table).
export async function getRolesWithUserStats(sampleSize = 4) {
  const col = await ensureSystemRoles();
  const client = await clientPromise;
  const db = client.db(getDbName());

  const [roles, stats] = await Promise.all([
    col.find({}).sort({ isSystem: -1, name: 1 }).toArray(),
    db
      .collection("users")
      .aggregate([
        {
          $group: {
            _id: { $ifNull: ["$role", "customer"] },
            count: { $sum: 1 },
            sample: {
              $push: {
                displayName: "$displayName",
                email: "$email",
                customId: "$customId",
              },
            },
          },
        },
      ])
      .toArray(),
  ]);

  const byRole = new Map(stats.map((s) => [s._id, s]));
  return roles.map((role) => {
    const stat = byRole.get(role.key) || { count: 0, sample: [] };
    return {
      ...role,
      userCount: stat.count,
      users: (stat.sample || []).slice(0, sampleSize),
      permissionCount: Array.isArray(role.permissions) ? role.permissions.length : 0,
    };
  });
}

export async function getRoleByKey(key) {
  const col = await ensureSystemRoles();
  return col.findOne({ key });
}

export async function getEffectivePermissions(roleKey) {
  const role = await getRoleByKey(roleKey);
  if (role && Array.isArray(role.permissions)) return role.permissions;
  const fallback = SYSTEM_ROLE_DEFAULTS.find((r) => r.key === roleKey);
  return fallback ? fallback.permissions : [];
}

export async function getEffectiveLevel2Routes(roleKey) {
  const role = await getRoleByKey(roleKey);
  if (role && (Array.isArray(role.level2Routes) || role.level2Routes === null)) {
    return role.level2Routes;
  }
  const fallback = SYSTEM_ROLE_DEFAULTS.find((r) => r.key === roleKey);
  return fallback ? fallback.level2Routes : null;
}

export async function createRole({ key, name, label, description, permissions, level2Routes }) {
  const col = await ensureSystemRoles();
  const now = new Date();
  const doc = {
    key,
    name: name || key,
    label: label || name || key,
    description: description || "",
    permissions: permissions || [],
    level2Routes: level2Routes === undefined ? null : level2Routes,
    isSystem: false,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return doc;
}

export async function updateRoleByKey(key, updates) {
  const col = await ensureSystemRoles();
  const allowed = {};
  if (typeof updates.name === "string") allowed.name = updates.name;
  if (typeof updates.label === "string") allowed.label = updates.label;
  if (typeof updates.description === "string") allowed.description = updates.description;
  if (Array.isArray(updates.permissions)) allowed.permissions = updates.permissions;
  if (Array.isArray(updates.level2Routes) || updates.level2Routes === null) {
    allowed.level2Routes = updates.level2Routes;
  }
  allowed.updatedAt = new Date();
  const res = await col.updateOne({ key }, { $set: allowed });
  return res.matchedCount > 0;
}

export async function deleteRoleByKey(key) {
  const col = await ensureSystemRoles();
  const existing = await col.findOne({ key });
  if (!existing) return { ok: false, reason: "not_found" };
  if (existing.isSystem) return { ok: false, reason: "system" };
  const client = await clientPromise;
  const db = client.db(getDbName());
  const assigned = await db.collection("users").countDocuments({ role: key });
  if (assigned > 0) return { ok: false, reason: "assigned", count: assigned };
  await col.deleteOne({ key });
  return { ok: true };
}
