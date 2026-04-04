"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import {
  UtensilsCrossed,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Clock,
  Package,
  X,
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
  total_amount: number;
  status: string;
  delivery_note: string;
  delivery_date: string | null;
  remarks: string;
  created_at: string;
  delivered_at: string | null;
  food_order_items: OrderItem[];
}

interface CartItem {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  vendor_name: string;
}

export default function FoodOrdersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCart, setShowCart] = useState(false);
  const [deliveryNote, setDeliveryNote] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [placing, setPlacing] = useState(false);
  const [activeTab, setActiveTab] = useState("menu");

  const loadMenu = useCallback(() => {
    fetch("/api/food-orders?view=menu")
      .then((r) => r.json())
      .then((d) => {
        setVendors(d.vendors || []);
        setMenuItems(d.items || []);
      })
      .catch(() => toast.error("Failed to load menu"));
  }, []);

  const loadOrders = useCallback(() => {
    fetch("/api/food-orders")
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => toast.error("Failed to load orders"));
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/food-orders?view=menu").then((r) => r.json()),
      fetch("/api/food-orders").then((r) => r.json()),
    ])
      .then(([menuData, orderData]) => {
        setVendors(menuData.vendors || []);
        setMenuItems(menuData.items || []);
        setOrders(orderData.orders || []);
      })
      .catch(() => toast.error("Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const existing = prev.find((c) => c.item_id === item.id);
      if (existing) {
        return prev.map((c) => c.item_id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      const vendor = vendors.find((v) => v.id === item.vendor_id);
      return [...prev, { item_id: item.id, name: item.name, price: item.price, quantity: 1, vendor_name: vendor?.name || "General" }];
    });
    toast.success(`${item.name} added to cart`);
  }

  function updateQty(itemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((c) => c.item_id === itemId ? { ...c, quantity: c.quantity + delta } : c)
        .filter((c) => c.quantity > 0)
    );
  }

  function removeFromCart(itemId: string) {
    setCart((prev) => prev.filter((c) => c.item_id !== itemId));
  }

  const cartTotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);

  async function placeOrder() {
    if (cart.length === 0) return;
    setPlacing(true);
    try {
      const res = await fetch("/api/food-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart.map((c) => ({ item_id: c.item_id, quantity: c.quantity })),
          delivery_note: deliveryNote,
          delivery_date: deliveryDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Order placed successfully!");
      setCart([]);
      setDeliveryNote("");
      setDeliveryDate("");
      setShowCart(false);
      setActiveTab("orders");
      loadOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setPlacing(false);
    }
  }

  async function cancelOrder(orderId: string) {
    try {
      const res = await fetch("/api/food-orders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status: "cancelled" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error);
      }
      toast.success("Order cancelled");
      loadOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  // Group menu items by category
  const categories = [...new Set(menuItems.map((i) => i.category))].sort();

  if (loading) {
    return (
      <div className="space-y-6 p-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />
            Food Orders
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Browse menu items and place your food orders
          </p>
        </div>
        {cart.length > 0 && (
          <Button onClick={() => setShowCart(true)} className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Cart ({cartCount})
            <Badge variant="secondary" className="ml-1">
              Rs.{cartTotal.toLocaleString()}
            </Badge>
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="menu" className="gap-1">
            <UtensilsCrossed className="h-4 w-4" /> Menu
          </TabsTrigger>
          <TabsTrigger value="orders" className="gap-1">
            <Package className="h-4 w-4" /> My Orders
            {orders.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{orders.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* MENU TAB */}
        <TabsContent value="menu" className="mt-4">
          {menuItems.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-8">
              {/* Vendor cards */}
              {vendors.length > 0 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {vendors.map((v) => (
                    <Card key={v.id} className="min-w-[200px] border-primary/20">
                      <CardContent className="p-4">
                        <p className="font-semibold text-primary">{v.name}</p>
                        {v.description && <p className="text-xs text-muted-foreground mt-1">{v.description}</p>}
                        {v.phone && <p className="text-xs text-muted-foreground mt-1">{v.phone}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Items by category */}
              {categories.map((cat) => (
                <div key={cat}>
                  <h2 className="text-lg font-semibold mb-3 text-primary">{cat}</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {menuItems
                      .filter((i) => i.category === cat)
                      .map((item) => {
                        const inCart = cart.find((c) => c.item_id === item.id);
                        return (
                          <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                            {item.image_url && (
                              <div className="h-32 bg-muted overflow-hidden">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                              </div>
                            )}
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-semibold">{item.name}</p>
                                  {item.description && (
                                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                                  )}
                                </div>
                                <span className="font-bold text-primary whitespace-nowrap">
                                  Rs.{item.price.toLocaleString()}
                                </span>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                {inCart ? (
                                  <div className="flex items-center gap-2">
                                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.id, -1)}>
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="font-semibold w-6 text-center">{inCart.quantity}</span>
                                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(item.id, 1)}>
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeFromCart(item.id)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="outline" onClick={() => addToCart(item)} className="gap-1">
                                    <Plus className="h-3 w-3" /> Add
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ORDERS TAB */}
        <TabsContent value="orders" className="mt-4">
          {orders.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              {orders.map((order) => (
                <Card key={order.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-base">
                          Order #{order.id.slice(0, 8)}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <Clock className="h-3 w-3" />
                          {new Date(order.created_at).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={order.status} />
                        <span className="font-bold text-primary">Rs.{order.total_amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {order.food_order_items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <span>{item.item_name} x{item.quantity}</span>
                          <span className="text-muted-foreground">Rs.{item.subtotal.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    {order.delivery_note && (
                      <p className="text-xs text-muted-foreground mt-2 italic">Note: {order.delivery_note}</p>
                    )}
                    {order.remarks && (
                      <p className="text-xs text-muted-foreground mt-1">Admin: {order.remarks}</p>
                    )}
                    {order.status === "pending" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="mt-3"
                        onClick={() => cancelOrder(order.id)}
                      >
                        <X className="h-3 w-3 mr-1" /> Cancel Order
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* CART DIALOG */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> Your Cart
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {cart.map((item) => (
              <div key={item.item_id} className="flex justify-between items-center">
                <div>
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.vendor_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.item_id, -1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-5 text-center text-sm">{item.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.item_id, 1)}>
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="text-sm font-semibold w-16 text-right">
                    Rs.{(item.price * item.quantity).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {cart.length > 0 && (
            <>
              <div className="border-t pt-3 flex justify-between font-bold">
                <span>Total</span>
                <span className="text-primary">Rs.{cartTotal.toLocaleString()}</span>
              </div>
              <div className="space-y-3 mt-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Delivery Date (optional)</label>
                  <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Delivery Note (optional)</label>
                  <Textarea
                    rows={2}
                    placeholder="Special instructions, location, timing..."
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={placing} onClick={placeOrder}>
                  {placing ? "Placing Order..." : `Place Order - Rs.${cartTotal.toLocaleString()}`}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
