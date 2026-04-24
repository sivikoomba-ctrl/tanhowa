"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionTabs, SectionTabsContent } from "@/components/section-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  UtensilsCrossed,
  Plus,
  Store,
  Package,
  Clock,
  Check,
  X,
  Truck,
  Edit,
  Trash2,
  Phone,
} from "lucide-react";
import { toast } from "sonner";

interface Vendor {
  id: string;
  name: string;
  description: string;
  phone: string;
  active: boolean;
}

interface MenuItem {
  id: string;
  vendor_id: string | null;
  name: string;
  description: string;
  price: number;
  category: string;
  available: boolean;
  image_url: string;
}

interface OrderItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Order {
  id: string;
  user_id: string;
  total_amount: number;
  status: string;
  delivery_note: string;
  delivery_date: string | null;
  remarks: string;
  created_at: string;
  delivered_at: string | null;
  food_order_items: OrderItem[];
}

type UserInfo = { name: string; phone: string; district: string };

const ORDER_STATUSES = ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
const CATEGORIES = ["Breakfast", "Lunch", "Dinner", "Snacks", "Beverages", "Special", "General"];

export default function AdminFoodOrdersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("orders");

  // Dialogs
  const [showVendorDialog, setShowVendorDialog] = useState(false);
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editVendor, setEditVendor] = useState<Vendor | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  // Form state
  const [vendorForm, setVendorForm] = useState({ name: "", description: "", phone: "" });
  const [itemForm, setItemForm] = useState({ vendor_id: "", name: "", description: "", price: "", category: "General", image_url: "" });
  const [statusFilter, setStatusFilter] = useState("all");

  const loadAll = useCallback(async () => {
    try {
      const [menuRes, ordersRes] = await Promise.all([
        fetch("/api/food-orders?view=menu").then((r) => r.json()),
        fetch("/api/food-orders?view=all-orders").then((r) => r.json()),
      ]);
      setVendors(menuRes.vendors || []);
      setMenuItems(menuRes.items || []);
      setOrders(ordersRes.orders || []);
      setUsers(ordersRes.users || {});
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveVendor() {
    const action = editVendor ? "update-vendor" : "add-vendor";
    const payload = editVendor
      ? { action, id: editVendor.id, ...vendorForm, active: true }
      : { action, ...vendorForm };
    try {
      const res = await fetch("/api/food-orders/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(editVendor ? "Vendor updated" : "Vendor added");
      setShowVendorDialog(false);
      setEditVendor(null);
      setVendorForm({ name: "", description: "", phone: "" });
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function saveItem() {
    const action = editItem ? "update-item" : "add-item";
    const payload = editItem
      ? { action, id: editItem.id, ...itemForm, available: true }
      : { action, ...itemForm };
    try {
      const res = await fetch("/api/food-orders/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      toast.success(editItem ? "Item updated" : "Item added");
      setShowItemDialog(false);
      setEditItem(null);
      setItemForm({ vendor_id: "", name: "", description: "", price: "", category: "General", image_url: "" });
      loadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function deleteItem(id: string) {
    try {
      const res = await fetch("/api/food-orders/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-item", id }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Item deleted");
      loadAll();
    } catch {
      toast.error("Failed to delete");
    }
  }

  async function updateOrderStatus(orderId: string, status: string, remarks?: string) {
    try {
      const res = await fetch("/api/food-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status, remarks }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Order ${status}`);
      loadAll();
    } catch {
      toast.error("Failed to update order");
    }
  }

  const filteredOrders = statusFilter === "all" ? orders : orders.filter((o) => o.status === statusFilter);

  // Stats
  const pendingCount = orders.filter((o) => o.status === "pending").length;
  const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString()).length;
  const todayRevenue = orders
    .filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString() && o.status !== "cancelled")
    .reduce((s, o) => s + o.total_amount, 0);

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-muted rounded-2xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Food Orders Management
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage menu, vendors, and member orders</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending Orders</p>
            <p className="text-2xl font-bold">{pendingCount}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Today&apos;s Orders</p>
            <p className="text-2xl font-bold">{todayOrders}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-600">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Today&apos;s Revenue</p>
            <p className="text-2xl font-bold">Rs.{todayRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <SectionTabs
        value={activeTab}
        onValueChange={setActiveTab}
        aria-label="Food orders admin sections"
        tabs={[
          { value: "orders", label: "Orders", icon: Package, count: pendingCount },
          { value: "menu", label: "Menu Items", icon: UtensilsCrossed },
          { value: "vendors", label: "Vendors", icon: Store },
        ]}
      >
        {/* ORDERS TAB */}
        <SectionTabsContent value="orders" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Filter status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {ORDER_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filteredOrders.length === 0 ? <EmptyState /> : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const user = users[order.user_id];
                return (
                  <Card key={order.id}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start flex-wrap gap-2">
                        <div>
                          <CardTitle className="text-base">{user?.name || "Unknown Member"}</CardTitle>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                            {user?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{user.phone}</span>}
                            {user?.district && <span>{user.district}</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={order.status} />
                          <span className="font-bold text-primary">Rs.{order.total_amount.toLocaleString()}</span>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1 mb-3">
                        {order.food_order_items?.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{item.item_name} x{item.quantity}</span>
                            <span className="text-muted-foreground">Rs.{item.subtotal.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                      {order.delivery_note && <p className="text-xs italic text-muted-foreground mb-2">Note: {order.delivery_note}</p>}
                      {order.delivery_date && <p className="text-xs text-muted-foreground mb-2">Delivery: {new Date(order.delivery_date).toLocaleDateString("en-IN")}</p>}

                      {/* Action buttons */}
                      {order.status !== "delivered" && order.status !== "cancelled" && (
                        <div className="flex gap-2 flex-wrap mt-2">
                          {order.status === "pending" && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => updateOrderStatus(order.id, "confirmed")}>
                              <Check className="h-3 w-3" /> Confirm
                            </Button>
                          )}
                          {order.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => updateOrderStatus(order.id, "preparing")}>
                              <UtensilsCrossed className="h-3 w-3" /> Preparing
                            </Button>
                          )}
                          {order.status === "preparing" && (
                            <Button size="sm" variant="outline" className="gap-1" onClick={() => updateOrderStatus(order.id, "ready")}>
                              <Package className="h-3 w-3" /> Ready
                            </Button>
                          )}
                          {order.status === "ready" && (
                            <Button size="sm" className="gap-1" onClick={() => updateOrderStatus(order.id, "delivered")}>
                              <Truck className="h-3 w-3" /> Delivered
                            </Button>
                          )}
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => updateOrderStatus(order.id, "cancelled")}>
                            <X className="h-3 w-3" /> Cancel
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionTabsContent>

        {/* MENU ITEMS TAB */}
        <SectionTabsContent value="menu" className="mt-4 space-y-4">
          <Button onClick={() => { setEditItem(null); setItemForm({ vendor_id: "", name: "", description: "", price: "", category: "General", image_url: "" }); setShowItemDialog(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> Add Menu Item
          </Button>

          {menuItems.length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {menuItems.map((item) => {
                const vendor = vendors.find((v) => v.id === item.vendor_id);
                return (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.category} {vendor ? `| ${vendor.name}` : ""}</p>
                          {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                        </div>
                        <span className="font-bold text-primary">Rs.{item.price}</span>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Badge variant={item.available ? "default" : "secondary"}>
                          {item.available ? "Available" : "Unavailable"}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                          setEditItem(item);
                          setItemForm({ vendor_id: item.vendor_id || "", name: item.name, description: item.description, price: String(item.price), category: item.category, image_url: item.image_url || "" });
                          setShowItemDialog(true);
                        }}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </SectionTabsContent>

        {/* VENDORS TAB */}
        <SectionTabsContent value="vendors" className="mt-4 space-y-4">
          <Button onClick={() => { setEditVendor(null); setVendorForm({ name: "", description: "", phone: "" }); setShowVendorDialog(true); }} className="gap-1">
            <Plus className="h-4 w-4" /> Add Vendor
          </Button>

          {vendors.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              <Store className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No vendors yet</p>
              <p className="text-sm">Add vendors to organize your menu items</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map((v) => (
                <Card key={v.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{v.name}</p>
                        {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                        {v.phone && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Phone className="h-3 w-3" />{v.phone}</p>}
                      </div>
                      <Badge variant={v.active ? "default" : "secondary"}>{v.active ? "Active" : "Inactive"}</Badge>
                    </div>
                    <Button size="sm" variant="ghost" className="mt-2 gap-1" onClick={() => {
                      setEditVendor(v);
                      setVendorForm({ name: v.name, description: v.description, phone: v.phone });
                      setShowVendorDialog(true);
                    }}>
                      <Edit className="h-3 w-3" /> Edit
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </SectionTabsContent>
      </SectionTabs>

      {/* VENDOR DIALOG */}
      <Dialog open={showVendorDialog} onOpenChange={setShowVendorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editVendor ? "Edit Vendor" : "Add Vendor"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Vendor Name" value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
            <Input placeholder="Phone" value={vendorForm.phone} onChange={(e) => setVendorForm({ ...vendorForm, phone: e.target.value })} />
            <Textarea placeholder="Description (optional)" rows={2} value={vendorForm.description} onChange={(e) => setVendorForm({ ...vendorForm, description: e.target.value })} />
            <Button className="w-full" onClick={saveVendor} disabled={!vendorForm.name.trim()}>
              {editVendor ? "Update" : "Add"} Vendor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MENU ITEM DIALOG */}
      <Dialog open={showItemDialog} onOpenChange={setShowItemDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Item Name" value={itemForm.name} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} />
            <Input type="number" placeholder="Price (Rs.)" value={itemForm.price} onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })} />
            <Select value={itemForm.category} onValueChange={(v) => setItemForm({ ...itemForm, category: v })}>
              <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={itemForm.vendor_id || "none"} onValueChange={(v) => setItemForm({ ...itemForm, vendor_id: v === "none" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="Vendor (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Vendor</SelectItem>
                {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Description (optional)" rows={2} value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} />
            <Input placeholder="Image URL (optional)" value={itemForm.image_url} onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })} />
            <Button className="w-full" onClick={saveItem} disabled={!itemForm.name.trim() || !itemForm.price}>
              {editItem ? "Update" : "Add"} Item
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
