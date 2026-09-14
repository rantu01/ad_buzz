import { NextResponse } from "next/server";
import {
  getRolesWithUserStats,
  getRoleByKey,
  createRole,
  updateRoleByKey,
  deleteRoleByKey,
} from "@/lib/roleModel";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import {
  PERMISSION_GROUPS,
  LEVEL2_ROUTE_GROUPS,
  LEVEL2_ROUTES,
  isValidPermission,
  isValidLevel2Route,
} from "@/lib/rbacCatalog";

const KEY_RE = /^[a-z0-9_]{2,40}$/;

// Central RBAC authority. Level 2 (adsbuzz-ui-next) reads the same `roles`
// collection from the shared `ad_buzz` database, so every change saved here
// is enforced on Level 2 immediately (next session/profile refresh).

export async function GET() {
  try {
    const roles = await getRolesWithUserStats();
    return NextResponse.json({
      success: true,
      roles,
      catalog: {
        permissionGroups: PERMISSION_GROUPS,
        level2RouteGroups: LEVEL2_ROUTE_GROUPS,
        level2Routes: LEVEL2_ROUTES,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch roles." },
      { status: 500 }
    );
  }
}

async function requireRoleManager(callerUid) {
  if (!callerUid) return { ok: false, message: "callerUid is required.", status: 400 };
  const caller = await getUserByUid(callerUid);
  if (!caller) return { ok: false, message: "Caller not found.", status: 403 };
  const callerRole = caller.role || "customer";
  if (callerRole === ROLES.ADMIN) return { ok: true, caller };
  const { getEffectivePermissions } = await import("@/lib/roleModel");
  const perms = await getEffectivePermissions(callerRole);
  if (perms.includes("manage_roles")) return { ok: true, caller };
  return { ok: false, message: "You do not have permission to manage roles.", status: 403 };
}

function sanitisePermissions(permissions) {
  if (!Array.isArray(permissions)) return null;
  const clean = [...new Set(permissions.filter((p) => typeof p === "string" && isValidPermission(p)))];
  return clean;
}

function sanitiseRoutes(level2Routes) {
  if (level2Routes === null) return null;
  if (!Array.isArray(level2Routes)) return undefined;
  return [...new Set(level2Routes.filter((p) => typeof p === "string" && isValidLevel2Route(p)))];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { callerUid, key, name, label, description, permissions, level2Routes } = body;

    const auth = await requireRoleManager(callerUid);
    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }

    const slug = String(key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!KEY_RE.test(slug)) {
      return NextResponse.json(
        { success: false, message: "Role key must be 2-40 chars: lowercase letters, numbers, underscores." },
        { status: 400 }
      );
    }
    if (Object.values(ROLES).includes(slug)) {
      return NextResponse.json(
        { success: false, message: "That key is reserved. Pick a different role key." },
        { status: 400 }
      );
    }
    const existing = await getRoleByKey(slug);
    if (existing) {
      return NextResponse.json({ success: false, message: "A role with this key already exists." }, { status: 409 });
    }

    const cleanPerms = sanitisePermissions(permissions) || [];
    const cleanRoutes = sanitiseRoutes(level2Routes);
    const role = await createRole({
      key: slug,
      name: String(name || slug).trim(),
      label: String(label || name || slug).trim(),
      description: String(description || "").trim(),
      permissions: cleanPerms,
      level2Routes: cleanRoutes === undefined ? [] : cleanRoutes,
    });
    return NextResponse.json({ success: true, message: "Role created.", role });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create role." },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { callerUid, key, name, label, description, permissions, level2Routes } = body;

    const auth = await requireRoleManager(callerUid);
    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }
    if (!key) {
      return NextResponse.json({ success: false, message: "key is required." }, { status: 400 });
    }
    const existing = await getRoleByKey(key);
    if (!existing) {
      return NextResponse.json({ success: false, message: "Role not found." }, { status: 404 });
    }

    const updates = {};
    if (permissions !== undefined) {
      const clean = sanitisePermissions(permissions);
      if (clean === null) {
        return NextResponse.json({ success: false, message: "permissions must be an array." }, { status: 400 });
      }
      // Safety rail: never allow locking every admin out of role management.
      if (key === ROLES.ADMIN && !clean.includes("manage_roles")) {
        return NextResponse.json(
          { success: false, message: "The Admin role must keep the Manage Roles permission." },
          { status: 400 }
        );
      }
      updates.permissions = clean;
    }
    if (level2Routes !== undefined) {
      const clean = sanitiseRoutes(level2Routes);
      if (clean === undefined) {
        return NextResponse.json({ success: false, message: "level2Routes must be an array or null." }, { status: 400 });
      }
      updates.level2Routes = clean;
    }
    // System roles keep their canonical name/label; custom roles are renameable.
    if (!existing.isSystem) {
      if (typeof name === "string") updates.name = name.trim();
      if (typeof label === "string") updates.label = label.trim();
    }
    if (typeof description === "string") updates.description = description.trim();

    const ok = await updateRoleByKey(key, updates);
    if (!ok) {
      return NextResponse.json({ success: false, message: "Role not found." }, { status: 404 });
    }
    const role = await getRoleByKey(key);
    return NextResponse.json({ success: true, message: "Role updated. Changes apply to Level 2 immediately.", role });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update role." },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const { callerUid, key } = body;

    const auth = await requireRoleManager(callerUid);
    if (!auth.ok) {
      return NextResponse.json({ success: false, message: auth.message }, { status: auth.status });
    }
    if (!key) {
      return NextResponse.json({ success: false, message: "key is required." }, { status: 400 });
    }
    const result = await deleteRoleByKey(key);
    if (!result.ok && result.reason === "system") {
      return NextResponse.json({ success: false, message: "System roles cannot be deleted." }, { status: 400 });
    }
    if (!result.ok && result.reason === "assigned") {
      return NextResponse.json(
        { success: false, message: `Cannot delete: ${result.count} user(s) still have this role. Reassign them first.` },
        { status: 400 }
      );
    }
    if (!result.ok) {
      return NextResponse.json({ success: false, message: "Role not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: "Role deleted." });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete role." },
      { status: 500 }
    );
  }
}
