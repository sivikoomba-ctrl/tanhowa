-- Manual finance ledger entries (debits) — first type: cheque_issued.
-- The ledger was previously derived only from paid subscriptions (credits).
CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL DEFAULT 'cheque_issued',
  amount NUMERIC NOT NULL CHECK (amount > 0),
  cheque_no TEXT,
  payee TEXT NOT NULL,
  voucher_id UUID REFERENCES expense_vouchers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'issued',  -- issued | cleared | cancelled | bounced
  remarks TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(entry_date);
