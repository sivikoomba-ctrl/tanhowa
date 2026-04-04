-- Food Ordering System - Database Schema
-- Run in Supabase SQL Editor

-- Vendors table
CREATE TABLE IF NOT EXISTS food_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Menu items table
CREATE TABLE IF NOT EXISTS food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID REFERENCES food_vendors(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  category TEXT DEFAULT 'General',
  available BOOLEAN DEFAULT true,
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Orders table
CREATE TABLE IF NOT EXISTS food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
  delivery_note TEXT DEFAULT '',
  delivery_date DATE,
  remarks TEXT DEFAULT '',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Order line items
CREATE TABLE IF NOT EXISTS food_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES food_orders(id) ON DELETE CASCADE,
  item_id UUID REFERENCES food_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  vendor_id UUID REFERENCES food_vendors(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_food_orders_user ON food_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_food_orders_status ON food_orders(status);
CREATE INDEX IF NOT EXISTS idx_food_order_items_order ON food_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_food_items_vendor ON food_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_food_items_category ON food_items(category);

-- Enable RLS (no permissive policies - service role key handles all access)
ALTER TABLE food_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_order_items ENABLE ROW LEVEL SECURITY;
