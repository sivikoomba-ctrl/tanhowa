-- Add OTP purpose separation for login vs Telegram linking

ALTER TABLE otp_codes
ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'login';

UPDATE otp_codes
SET purpose = 'login'
WHERE purpose IS NULL OR purpose = '';

CREATE INDEX IF NOT EXISTS idx_otp_email_purpose ON otp_codes(email, purpose);
