PRAGMA foreign_keys = ON;

-- Email OTP sign-in has been replaced by Telegram Mini App authentication.
DROP TABLE IF EXISTS otp_challenges;
DROP TABLE IF EXISTS otp_codes;
DELETE FROM rate_limits WHERE scope LIKE 'otp_%';
