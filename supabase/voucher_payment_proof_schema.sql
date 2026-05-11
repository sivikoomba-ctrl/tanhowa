-- Voucher payment-proof fields
-- Adds 5 optional columns to expense_vouchers so the voucher form can capture
-- the payment screenshot alongside the bill/invoice. Either is optional; the
-- bill scan and the payment-proof scan write to separate field groups so they
-- don't overwrite each other.

ALTER TABLE expense_vouchers
  ADD COLUMN IF NOT EXISTS payment_proof_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS payment_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_date DATE,
  ADD COLUMN IF NOT EXISTS paid_to TEXT;
