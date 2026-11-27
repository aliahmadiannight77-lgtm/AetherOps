# AetherOps

یک فضای کار فارسی و راست‌چین برای چت با مدل‌های Cloudflare Workers AI، مدیریت گفت‌وگوها، دیدن مصرف روزانه، ساخت توکن API و اتصال ربات تلگرام.

## امکانات

- ورود بدون ایمیل از طریق دادهٔ امضاشدهٔ Telegram Mini App؛ عضویت کانال سمت سرور بررسی می‌شود.
- چت پایدار در D1 و حذف گفت‌وگو از پنل.
- انتخاب بین مدل‌های فعلی Workers AI: Gemma 4 و Qwen 3.8.
- شمارش تخمینی ورودی/خروجی و سقف محافظ داخلی روزانه.
- پشتیبانی از ۲۰ زبان قابل انتخاب؛ پاسخ چت وب و تلگرام به زبان پیام کاربر تولید می‌شود.
- ساخت و لغو API token؛ مقدار کامل فقط هنگام ساخت نشان داده می‌شود و فقط hash آن ذخیره می‌شود.
- ربات تلگرام روی Cloudflare Worker؛ ابتدا عضویت کانال را بررسی می‌کند و سپس دکمهٔ Mini App و لینک وب می‌دهد.
- اجزای رایگان Kibo UI و Aceternity UI، در کنار React, Vite, Tailwind و Lucide.
- پرونده‌های مستقل امنیتی در `security/`، مستندات ربات در `bot/` و `docs/`.

## زبان‌ها

زبان‌های قابل انتخاب رابط و کد locale آن‌ها:

فارسی (`fa`)، English (`en`)، العربية (`ar`)، Türkçe (`tr`)، Français (`fr`)، Español (`es`)، Deutsch (`de`)، Русский (`ru`)، 简体中文 (`zh-CN`)، 日本語 (`ja`)، 한국어 (`ko`)، हिन्दी (`hi`)، اردو (`ur`)، Português (`pt-BR`)، Italiano (`it`)، Bahasa Indonesia (`id`)، বাংলা (`bn`)، Nederlands (`nl`)، Svenska (`sv`) و Polski (`pl`).

## معماری

- `src/`: وب‌اپ React.
- `worker/src/`: API، احراز هویت، Workers AI، داده‌های کاربر و webhook تلگرام.
- `worker/migrations/`: schema پایگاه داده D1.
- `security/`: مدل تهدید، کنترل سوءاستفاده، نگهداری کلیدها و پاسخ به رخداد.
- `bot/`: قرارداد و ملاحظات امنیتی ربات تلگرام.

## اجرای محلی

برای اجرای کامل پروژه Node.js نسخهٔ 22.12 یا بالاتر لازم است.

```sh
npm install
npm run dev
```

این دستور فقط وب‌اپ را نمایش می‌دهد؛ برای ورود و API محلی باید Worker و D1 هم اجرا شوند. دستورات تنظیم و استقرار در [security/SECRETS_AND_DEPLOYMENT.md](security/SECRETS_AND_DEPLOYMENT.md) آمده است.

## هزینه و محدودیت نسخهٔ رایگان

- Workers AI سهمیهٔ رایگان روزانهٔ حساب Cloudflare دارد؛ سقف فعلی ۱۰٬۰۰۰ neuron در روز است و بعد از مصرف سهمیه، درخواست مدل تا ریست روزانه شکست می‌خورد.
- D1 و Workers هم محدودیت پلن رایگان دارند.
- ورود به سایت فقط از Mini App تلگرام انجام می‌شود؛ بازکردن لینک وب در مرورگر عادی کاربر را به ربات هدایت می‌کند.
- شمارندهٔ داخلی AetherOps، تعداد token را تخمین می‌زند و سهمیهٔ neuron را جایگزین نمی‌کند.

## کلیدها و راه‌اندازی

هیچ راز واقعی نباید وارد Git یا کد سمت مرورگر شود. از فایل نمونهٔ `worker/.dev.vars.example` فقط برای ساخت فایل محلی `worker/.dev.vars` استفاده کن؛ فایل واقعی در `.gitignore` است. در محیط Cloudflare از Worker Secrets استفاده کن.

مراحل ساخت D1، اضافه‌کردن رازها، تنظیم ربات و دسترسی کانال، استقرار Worker و ثبت webhook در [راهنمای استقرار امن](security/SECRETS_AND_DEPLOYMENT.md) و [راهنمای ربات](docs/telegram-bot.md) است.

## منابع رابط کاربری

- [Kibo UI](https://www.kibo-ui.com/docs) — جدول داده، اجزای رایگان MIT.
- [Aceternity UI](https://ui.aceternity.com/pricing) — Spotlight رایگان.
- [مجوز اجزای Arc UI](https://uiarc.dev/license) — MIT برای اجزای رایگان؛ فعلاً در build استفاده نشده است.
