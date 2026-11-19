import { NextResponse } from "next/server";
import { getUserByUid } from "@/lib/userModel";
import { ROLES } from "@/lib/permissions";
import { getArticleById, updateArticle, deleteArticle } from "@/lib/helpCenterModel";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

async function requireAdmin(request, body) {
  const callerUid = request.headers.get("x-user-id") || body?.callerUid;
  if (!callerUid) return { error: NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 }) };
  const user = await getUserByUid(callerUid);
  if (user?.role !== ROLES.ADMIN) return { error: NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 }) };
  return { user };
}

export async function GET(request, { params }) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;
    const { id } = await params;
    const article = await getArticleById(id);
    if (!article) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, article });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const body = await request.json();
    const auth = await requireAdmin(request, body);
    if (auth.error) return auth.error;
    const { id } = await params;

    const payload = { ...body };
    if (payload.content !== undefined) payload.content = sanitizeHtml(payload.content);
    // remove callerUid from update
    delete payload.callerUid;

    const article = await updateArticle(id, payload);
    if (!article) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, article });
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
    const ok = await deleteArticle(id);
    if (!ok) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
