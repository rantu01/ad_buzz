import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/lib/helpCenterModel";

async function requireAdmin(request, body) {
  const callerUid = request.headers.get("x-user-id") || body?.callerUid;
  if (!callerUid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  const user = await getUserByUid(callerUid);
  if (user?.role !== ROLES.ADMIN) return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(request) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const cats = await listCategories();
    return NextResponse.json({ success: true, categories: cats });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const auth = await requireAdmin(request, body);
    if (auth.error) return auth.error;
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ success: false, message: "Name required" }, { status: 400 });
    }
    const cat = await createCategory(body);
    return NextResponse.json({ success: true, category: cat });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
