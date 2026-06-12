-- Expense Event field on vouchers (e.g. "Annual District Meeting 2026")
ALTER TABLE expense_vouchers ADD COLUMN IF NOT EXISTS expense_event TEXT;
