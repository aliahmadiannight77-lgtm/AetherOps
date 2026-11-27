# AetherOps

یک فضای کار فارسی و راست‌چین برای چت با مدل‌های Cloudflare Workers AI، مدیریت گفت‌وگوها، دیدن مصرف روزانه، ساخت توکن API و اتصال ربات تلگرام.

## امکانات

- ورود با ایمیل و کد یک‌بارمصرف ۸ رقمی.
- چت پایدار در D1 و حذف گفت‌وگو از پنل.
- انتخاب بین مدل‌های فعلی Workers AI: Gemma 4 و Qwen 3.8.
- شمارش تخمینی ورودی/خروجی و سقف محافظ داخلی روزانه.
- ساخت و لغو API token؛ مقدار کامل فقط هنگام ساخت نشان داده می‌شود و فقط hash آن ذخیره می‌شود.
- ربات تلگرام روی Cloudflare Worker با اتصال یک‌بارمصرف، webhook امن و همان سهمیهٔ چت.
- اجزای رایگان Kibo UI و Aceternity UI، در کنار React, Vite, Tailwind و Lucide.
- پرونده‌های مستقل امنیتی در `security/`، مستندات ربات در `bot/` و `docs/`.

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
- D1، Workers و ایمیل هم محدودیت پلن رایگان دارند.
- ارسال ایمیل Cloudflare در پلن رایگان فقط به مقصدهایی ممکن است که در حساب Cloudflare تأیید شده‌اند.
- برای فرستادن ایمیل، Email Service به دامنهٔ ارسال onboard‌شده در DNS Cloudflare نیاز دارد. اگر دامنهٔ قابل‌استفاده نداری، هزینهٔ ثبت دامنه ممکن است تنها هزینهٔ لازم برای ورود ایمیلی باشد.
- شمارندهٔ داخلی AetherOps، تعداد token را تخمین می‌زند و سهمیهٔ neuron را جایگزین نمی‌کند.

## کلیدها و راه‌اندازی

هیچ راز واقعی نباید وارد Git یا کد سمت مرورگر شود. از فایل نمونهٔ `worker/.dev.vars.example` فقط برای ساخت فایل محلی `worker/.dev.vars` استفاده کن؛ فایل واقعی در `.gitignore` است. در محیط Cloudflare از Worker Secrets استفاده کن.

مراحل ساخت D1، اضافه‌کردن رازها، استقرار Worker و ثبت webhook در [راهنمای استقرار امن](security/SECRETS_AND_DEPLOYMENT.md) و [راهنمای ربات](docs/telegram-bot.md) است.

## منابع رابط کاربری

- [Kibo UI](https://www.kibo-ui.com/docs) — جدول داده، اجزای رایگان MIT.
- [Aceternity UI](https://ui.aceternity.com/pricing) — Spotlight رایگان.
- [مجوز اجزای Arc UI](https://uiarc.dev/license) — MIT برای اجزای رایگان؛ فعلاً در build استفاده نشده است.
