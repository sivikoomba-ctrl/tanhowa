import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { getSession, isSuperAdmin } from "@/lib/auth";
import { logError } from "@/lib/error-logger";

// GET: List menu items + user's orders
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const supabase = getServiceClient();
    const view = req.nextUrl.searchParams.get("view"); // "menu" | "orders" | "all-orders"

    if (view === "menu") {
      // Active menu items grouped by vendor
      const { data: vendors } = await supabase
        .from("food_vendors")
        .select("*")
        .eq("active", true)
        .order("name");

      const { data: items } = await supabase
        .from("food_items")
        .select("*")
        .eq("available", true)
        .order("category, name");

      return NextResponse.json({ vendors: vendors || [], items: items || [] });
    }

    if (view === "all-orders") {
      // Admin: all orders
      const admin = true; // super_admin already verified above
      if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

      const { data: orders } = await supabase
        .from("food_orders")
        .select("*, food_order_items(*)")
        .order("created_at", { ascending: false });

      // Fetch user names for orders
      const userIds = [...new Set((orders || []).map((o: { user_id: string }) => o.user_id))];
      const { data: users } = await supabase
        .from("users")
        .select("id, name, phone, posting_details")
        .in("id", userIds.length > 0 ? userIds : ["none"]);

      const userMap: Record<string, { name: string; phone: string; district: string }> = {};
      (users || []).forEach((u: { id: string; name: string; phone: string; posting_details: { regular_district?: string } }) => {
        userMap[u.id] = { name: u.name, phone: u.phone, district: u.posting_details?.regular_district || "" };
      });

      return NextResponse.json({ orders: orders || [], users: userMap });
    }

    // Default: my orders
    const { data: orders } = await supabase
      .from("food_orders")
      .select("*, food_order_items(*)")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });

    return NextResponse.json({ orders: orders || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/food-orders", method: "GET", status_code: 500 });
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// POST: Place an order
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { items, delivery_note, delivery_date } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "No items in order" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Calculate total from actual item prices
    const itemIds = items.map((i: { item_id: string }) => i.item_id);
    const { data: menuItems } = await supabase
      .from("food_items")
      .select("id, name, price, vendor_id")
      .in("id", itemIds);

    if (!menuItems || menuItems.length === 0) {
      return NextResponse.json({ error: "Invalid items" }, { status: 400 });
    }

    const priceMap: Record<string, { name: string; price: number; vendor_id: string }> = {};
    menuItems.forEach((mi) => { priceMap[mi.id] = { name: mi.name, price: mi.price, vendor_id: mi.vendor_id }; });

    let total = 0;
    const orderItems = items.map((i: { item_id: string; quantity: number }) => {
      const menu = priceMap[i.item_id];
      if (!menu) return null;
      const subtotal = menu.price * (i.quantity || 1);
      total += subtotal;
      return {
        item_id: i.item_id,
        item_name: menu.name,
        vendor_id: menu.vendor_id,
        quantity: i.quantity || 1,
        unit_price: menu.price,
        subtotal,
      };
    }).filter(Boolean);

    // Create order
    const { data: order, error: orderErr } = await supabase
      .from("food_orders")
      .insert({
        user_id: session.userId,
        total_amount: total,
        status: "pending",
        delivery_note: delivery_note || "",
        delivery_date: delivery_date || null,
      })
      .select()
      .single();

    if (orderErr) {
      await logError({ type: "api", message: orderErr.message, path: "/api/food-orders", method: "POST", status_code: 500 });
      return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
    }

    // Insert order items
    const itemsWithOrderId = orderItems.map((i) => ({ ...i, order_id: order.id }));
    await supabase.from("food_order_items").insert(itemsWithOrderId);

    return NextResponse.json({ order, message: "Order placed successfully" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/food-orders", method: "POST", status_code: 500 });
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }
}

// PUT: Update order status (admin) or cancel own order (member)
export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isSuperAdmin(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { order_id, status, remarks } = body;

    if (!order_id) return NextResponse.json({ error: "order_id required" }, { status: 400 });

    const supabase = getServiceClient();

    // Check if admin action or member cancel
    const admin = true; // super_admin already verified above

    if (!admin) {
      // Member can only cancel their own pending orders
      if (status !== "cancelled") {
        return NextResponse.json({ error: "Members can only cancel orders" }, { status: 403 });
      }
      const { data: existing } = await supabase
        .from("food_orders")
        .select("user_id, status")
        .eq("id", order_id)
        .single();

      if (!existing || existing.user_id !== session.userId) {
        return NextResponse.json({ error: "Order not found" }, { status: 404 });
      }
      if (existing.status !== "pending") {
        return NextResponse.json({ error: "Can only cancel pending orders" }, { status: 400 });
      }
    }

    const updateData: Record<string, unknown> = { status };
    if (remarks) updateData.remarks = remarks;
    if (status === "delivered") updateData.delivered_at = new Date().toISOString();

    const { error } = await supabase
      .from("food_orders")
      .update(updateData)
      .eq("id", order_id);

    if (error) {
      await logError({ type: "api", message: error.message, path: "/api/food-orders", method: "PUT", status_code: 500 });
      return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await logError({ type: "api", message: msg, path: "/api/food-orders", method: "PUT", status_code: 500 });
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }
}
