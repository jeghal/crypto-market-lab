# تنظيم مجلد Binance

آخر تنظيم: 9 نوفمبر 2026.

## المشاريع الأساسية

| المجلد | المحتوى |
| --- | --- |
| `trading-dashboard/` | لوحة التداول الأساسية، وبداخلها الرادار المدمج `radar/` |
| `ATLASFLOW/` | واجهة التحليل والمساعد الفني |
| `data_pipeline/` | أداة مستقلة لتجميع حزم بيانات السوق |
| `formation/` | مواد وصفحات التكوين |

## الأدوات والملفات المساندة

```text
6__binance/
├── trading-dashboard/
├── ATLASFLOW/
├── data_pipeline/
├── formation/
├── shared/               # المصدر المشترك للحسابات والاتصال والتحويلات
├── scripts/              # التوليد والفحوص المشتركة
├── docs/                 # حدود المشاريع وافتراضات التقييم
├── tools/
│   ├── binance_5m_spot_scanner.py
│   ├── scanner.html
│   └── binance_replay.html
├── archives/
│   └── crypto-alert-bot.zip
├── maintenance/
│   └── inject.py
├── index.html            # مدخل المشاريع المستقلة
├── package.json          # أوامر التشغيل والتوليد والفحص
├── requirements.txt
├── requirements-dev.txt
├── README.md
└── README_ORGANISATION.md
```

`crypto-alert-bot.zip` مشروع مستقل محفوظ، وليس نسخة مطابقة للمشاريع الحالية.

`maintenance/inject.py` سكربت صيانة قديم يضيف iframe إلى لوحة التداول. يُحتفظ به كمرجع ولا يُشغّل عند بدء المشاريع؛ قد يؤدي تكرار تشغيله إلى إدراج العنصر مرة أخرى.

## التشغيل من هذا المجلد

شغّل خادماً محلياً:

```powershell
python -m http.server 8000
```

- لوحة التداول: <http://localhost:8000/trading-dashboard/>
- ATLASFLOW: <http://localhost:8000/ATLASFLOW/>
- تجميع البيانات: <http://localhost:8000/data_pipeline/>
- الماسح: <http://localhost:8000/tools/scanner.html>
- إعادة التشغيل: <http://localhost:8000/tools/binance_replay.html>

لتشغيل ماسح Python، يلزم تثبيت مكتبة `requests` في بيئة Python المستخدمة:

```powershell
python tools/binance_5m_spot_scanner.py
```

## قواعد التنظيم

- تبقى ملفات كل مشروع وموارده داخله للحفاظ على الروابط النسبية.
- توضع الأدوات المستقلة في `tools/`، والأرشيفات في `archives/`، وسكربتات الصيانة في `maintenance/`.
- توضع مخرجات الاختبارات والتقارير داخل `_Reports/` في المشروع المعني عند الحاجة.
- `__pycache__/` ملفات مؤقتة يمكن أن يعيد Python إنشاءها.
- أُزيلت النسخ الخمس المسماة `trading-dashboard - Copie` وأرشيفات ATLASFLOW وdata_pipeline القديمة إلى سلة المحذوفات.
