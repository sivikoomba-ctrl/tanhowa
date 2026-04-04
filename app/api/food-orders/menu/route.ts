import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// POST: Add/update menu item (super_admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { action } = body;

    const supabase = getServiceClient();

    if (action === "add-vendor") {
      const { name, description, phone, active } = body;
      if (!name?.trim()) return NextResponse.json({ error: "Vendor name required" }, { status: 400 });
      const { data, error } = await supabase
        .from("food_vendors")
        .insert({ name: name.trim(), description: description || "", phone: phone || "", active: active !== false })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ vendor: data });
    }

    if (action === "update-vendor") {
      const { id, name, description, phone, active } = body;
      if (!id) return NextResponse.json({ error: "Vendor ID required" }, { status: 400 });
      const { error } = await supabase
        .from("food_vendors")
        .update({ name, description, phone, active })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "add-item") {
      const { vendor_id, name, description, price, category, available, image_url } = body;
      if (!name?.trim() || !price) return NextResponse.json({ error: "Name and price required" }, { status: 400 });
      const { data, error } = await supabase
        .from("food_items")
        .insert({
          vendor_id: vendor_id || null,
          name: name.trim(),
          description: description || "",
          price: parseFloat(price),
          category: category || "General",
          available: available !== false,
          image_url: image_url || "",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ item: data });
    }

    if (action === "update-item") {
      const { id, ...fields } = body;
      if (!id) return NextResponse.json({ error: "Item ID required" }, { status: 400 });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { action: _, ...updateFields } = fields;
      if (updateFields.price) updateFields.price = parseFloat(updateFields.price);
      const { error } = await supabase.from("food_items").update(updateFields).eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete-item") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "Item ID required" }, { status: 400 });
      const { error } = await supabase.from("food_items").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/food-orders/menu", method: "POST", status_code: 500 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
