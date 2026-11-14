# ابدأ من هنا — تسليم مشروع CERI-SC إلى Claude

**الغرض:** تسليم نسخة كاملة من الكود والبيانات المنشورة والاختبارات والصور والإعدادات والبرومبت لتطوير المنصة الحالية بالتعاون بين GPT وClaude، دون إعادة بناء عشوائية أو ادعاء نتائج ملاحية أو بيئية غير معتمدة.

## طريقة التشغيل في Claude
1. حمّل ملف ZIP الكامل من GitHub، ثم افتحه أو ارفع ZIP إلى مشروع Claude إذا كان مسموحًا بالحجم.
2. ابدأ من الملف `CLAUDE_HANDOFF/CLAUDE_MASTER_PROMPT.md` وانسخ نصه كاملًا إلى Claude مع طلب قراءة جميع ملفات المستودع، ثم ملف `STATE_AND_BLOCKERS.md` و`DATA_SOURCES.md` و`ACCEPTANCE_CRITERIA.md`.
3. اطلب منه إنشاء **فرع تطوير جديد** وتقديم مراجعة مستقلة وإصلاحات قابلة للاختبار، لا تغيير المحرك الأصلي مباشرة.
4. بعد الانتهاء شارك معي رابط PR واختبارات GitHub ليتم تدقيق التعديل من جانب GPT قبل دمجه.

## ما تحتويه الحزمة
الملفات الأساسية الحالية `index.html`، و`decision-room.html`، و`voyage-evidence.html`، و`official-statistics.html`، و`ais-lab/`، و`src/`، و`sca-stats/`، و`data/`، و`tests/`، و`.github/workflows/`، و`next/` والصور، وجميع ملفات توثيق التسليم.

البيانات المنشورة داخل المستودع **ليست قاعدة عبور يومية رسمية محدثة مباشرة ولا AIS مرخصًا كامل التغطية**. هناك ملفات اصطناعية للاختبارات فقط. يهدف العمل التالي لتوفير بيانات مؤسسية موثقة وعينات AIS ذات تغطية مثبتة ومراجعة الانبعاثات للرحلة الواحدة.

## روابط التشغيل والمصدر
- المستودع: https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal
- المصدر الكامل ZIP: https://github.com/rasheadsca-star/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/archive/refs/heads/main.zip
- غرفة القرار: https://rasheadsca-star.github.io/Indicative-Carbon-Emission-Reduction-Index-Suez-Canal/decision-room.html
- فحص ملفات ZIP في GitHub Actions: `.github/workflows/claude-handoff-package.yml`

## مهم جدًا
يجب ألا يدّعي Claude أن النتائج الفعلية للانبعاثات تم توثيقها قبل مراجعة بيانات السفن، الاستهلاك، العبور، المسارات والمعاملات. **نجاح حساب السيناريو لا يعني نجاح القياس الفعلي.**
