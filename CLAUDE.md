# CLAUDE.md — قواعد العمل على مشروع GSMPro

مرجع دائم يُتّبع في كل عمل على هذا المشروع (Backend: NestJS + TypeORM + PostgreSQL،
Frontend: Angular standalone components). عند التعارض بين هذه القواعد وتعليمة ظرفية من
المستخدم في نفس الجلسة، تُطبَّق تعليمة المستخدم لتلك المهمة فقط، وتبقى هذه القواعد
هي الافتراضي لما بعدها.

## 1. قبل أي ميزة
اشرح الخطة والملفات التي ستتغير، وانتظر الموافقة قبل الكتابة (استخدم وضع التخطيط
عند الحاجة). لا تبدأ التنفيذ الفعلي (كتابة كود، migration، تعديل ملفات) قبل الموافقة.

## 2. البنية المعمارية
- **Backend**: module لكل domain في `backend/src/<feature>/` — `*.entity.ts` +
  `*.service.ts` + `*.controller.ts` + `*.module.ts`. الـ controllers تستقبل الطلب
  وتُفوّض فورًا لـ service؛ **لا منطق عمل (business logic) داخل controller**.
- **Frontend**: كل صفحة لها `*.component.ts/.html/.css` مستقل، واستدعاءات HTTP تمر
  حصرًا عبر service مخصص في `frontend/src/app/services/` — **لا `HttpClient` مباشر
  داخل component، ولا منطق عمل ثقيل داخل template**.

## 3. فصل بيانات المحل (Store scoping) — نظام Multi-Magasin
**الوضع الحالي (قيد التنفيذ على مراحل، Phase 1-3 مكتملة):** التطبيق أصبح متعدد
المحلات فعليًا. `id_magasin` موجود في الـ JWT (`StoreContextService`، مبني على
`nestjs-cls`، يُملأ مرة واحدة في `JwtAuthGuard` بعد التحقق من التوكن) ومُستخرج منه
حصرًا — **أبدًا من جسم الطلب القادم من الواجهة** (كل `create`/`update` يُسقط
`id_magasin` من الـ DTO الوارد قبل استخدامه). كل جدول بيانات محل (`client`, `article`,
`vente`, `charge`, `reparation`, `reparation_item`, `fournisseur`, `facture_achat`,
`mouvement_achat`, `stock`, `caisse_session`, `caisse_mouvement`,
`paiement_fournisseur`, `client_solde_usage`, `retour_fournisseur`, `sav_accessoire`)
يحمل عمود `id_magasin` ومفلتَر به في كل service (ORM أو SQL خام). دفاع ثانٍ مستقل:
`StoreOwnershipGuard` (عبر decorator `@ScopedByStore(table, pkColumn)`) يتحقق من
`id_magasin` الصف مباشرة من القاعدة على أي route فيه `:id`، بمعزل عمّا يفعله الـ
service. `role: 'super_admin'` يتجاوز كل هذا (`id_magasin` له `null`)، ويُدار عبر
`MagasinsModule` (`backend/src/magasins/`) المحمي بفحص الدور داخل الـ service (نفس
نمط `proprietaireRequis` في قسم الموظفين). المرجع الكامل للبنية والقرارات المعمارية:
`StoreContextService`, `store-ownership.guard.ts`, `scoped-by-store.decorator.ts`.

**المتبقي (لم يُنفَّذ بعد):** Phase 4 — `MagasinModulesService` (تفعيل/تعطيل قسم لكل
محل) لم تُدمَج بعد في `PermissionsGuard`، فتعطيل قسم من لوحة Super Admin لا يمنعه
فعليًا في الـ Backend بعد. Phase 5-6 — الواجهة (Frontend) لا تزال بمنطق المحل الواحد:
`AuthService` لا يخزّن `id_magasin`/`modules`، ولا يوجد توجيه بعد الدخول حسب الدور، ولا
لوحة Super Admin (`/super-admin/*`). Phase 7 — لا نطاق `SUPER_ADMIN` في ملفات الترجمة
بعد. **أي عمل على هذه النقاط المتبقية يُعامَل كميزة جديدة عادية (خطة + موافقة حسب
القاعدة رقم 1)، لا كأمر واقع.**

## 4. الصلاحيات
التحقق من الصلاحية يكون **دائمًا** في الـ Backend (عبر `@RequirePermission()` +
`PermissionsGuard`، على غرار قسم الموظفين). إخفاء الأزرار في الواجهة (`*ngIf`) طبقة
تجميلية إضافية فقط — لا تُغني أبدًا عن التحقق في الخادم.

## 5. التحقق من المدخلات
كل body جديد يُتحقق منه عبر DTO + `class-validator`. **ملاحظة معمارية قائمة:** لا
يوجد `ValidationPipe` مفعّل عالميًا حاليًا في `main.ts`، ومعظم الكود الحالي يتحقق يدويًا
داخل الـ service (رسائل `BadRequestException` بالفرنسية). عند إضافة DTO جديد بهذه
القاعدة، فعّل التحقق منه فعليًا (عبر `ValidationPipe` محلي على ذلك الـ controller، أو
استدعاء يدوي لـ `validate()`) — DTO بدون تفعيل فعلي عديم الفائدة.

## 6. عدم تكرار الكود
أي منطق (عمل أو عرض) يتكرر في مكانين أو أكثر يُنقل لخدمة مشتركة (`*.service.ts` في
الـ backend، أو service/utility مشترك في الـ frontend) بدل النسخ واللصق.

## 7. الترجمة
كل نص جديد في الواجهة يمر عبر `frontend/src/assets/i18n/{fr,en,ar}.json` (مفتاح مطابق
في الثلاث لغات، تحقق من تطابق المفاتيح قبل الإنهاء). لا نص عربي/فرنسي/إنجليزي ثابت
(hardcoded) داخل template.

## 8. الاختبارات
اكتب اختبارات لكل ميزة تمس المال، الصلاحيات، أو الفصل بين المحلات (عند تفعيله).
**إطار الاختبار:** Jest مُعدّ في الـ backend (`backend/package.json`, `npm test`) — أول
اختبار مرجعي: `backend/src/permissions/permissions.service.spec.ts`. أي service جديدة
بهذا الطابع (مال/صلاحيات/فصل بيانات) تحصل على `*.spec.ts` مجاورة لها بنفس النمط
(mock عبر `@nestjs/testing` + `getRepositoryToken`). لا يوجد إطار اختبار frontend
مُفعَّل فعليًا بعد (`ng test` موجود افتراضيًا لكن غير مُستخدم) — التحقق اليدوي
(Puppeteer/سكربتات مؤقتة تُحذف بعد الاستخدام) يبقى الوسيلة حتى يُقرَّر إعداد إطار دائم.

## 9. قاعدة البيانات
أي تغيير في الـ schema (عمود، جدول، فهرس) يُضاف كسطر `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS` أو `CREATE TABLE IF NOT EXISTS` داخل دالة `migrer()` في
`backend/src/bootstrap-db.ts` (idempotent، تُطبَّق تلقائيًا عند كل إقلاع). **لا تُعدَّل
`backend/db/schema.sql` يدويًا** — هذا الملف مولَّد آليًا (`npm run db:schema`) ولقواعد
بيانات فارغة جديدة فقط.

## 10. بعد كل ميزة
شغّل الـ build (`npm run build` في كل من backend/ و frontend/) والاختبارات
(`npm test` في backend/) قبل اعتبار الميزة منتهية. **بعدها اقترح رسالة commit فقط —
لا تُنفّذ `git commit`/`git push` من تلقائك.** طبّق ما يقترحه المستخدم بعد موافقته
الصريحة على الرسالة أو تعديله لها.
