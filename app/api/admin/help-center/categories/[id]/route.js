import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { updateCategory, deleteCategory } from "@/lib/helpCenterModel";

async function requireAdmin(request, body) {
  const callerUid = request.headers.get("x-user-id") || body?.callerUid;
  if (!callerUid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  const user = await getUserByUid(callerUid);
  if (user?.role !== ROLES.ADMIN) return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const auth = await requireAdmin(request, body);
    if (auth.error) return auth.error;
    const { id } = await params;
    const cat = await updateCategory(id, body);
    if (!cat) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, category: cat });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const auth = await requireAdmin(request, body);
    if (auth.error) return auth.error;
    const { id } = await params;
    const res = await deleteCategory(id);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.reason === "has_articles" ? `Category has ${res.count} articles` : "Failed" }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
