# تنظيم المجلد

المشاريع المعتمدة فقط:

- `trading-dashboard`: متابعة السوق والتحليل والرادار المدمج .
- `ATLASFLOW`: التحليل البصري والمساعد التعليمي.
- `data_pipeline`: تجميع حزم بيانات سوق لعدة أزواج.

```text
crypto-market-lab/
├── trading-dashboard/
├── ATLASFLOW/
├── data_pipeline/
├── shared/               # المصدر المشترك ومصدر الرادار
├── scripts/              # التوليد والتحقق
├── docs/                 # توثيق المعمارية
├── .github/              # فحوص GitHub Actions
├── index.html            # روابط المشاريع الثلاثة
├── package.json
├── package-lock.json
├── requirements-dev.txt
├── README.md
└── README_ORGANISATION.md
```

`trading-dashboard/radar` ملفات تشغيل ضرورية للرادار داخل اللوحة، وليس مشروعاً رابعاً. لا يُحذف هذا المجلد دون تعطيل وظيفة تجميع البيانات داخل اللوحة.

`shared` و`scripts` و`docs` وفحوص التطوير أجزاء مساندة للمشاريع. التقارير المولدة في `_Reports` خارج Git. `.git` يحتفظ بسجل الإصدارات. لا تُنشأ مجلدات نسخ احتياطية أو أرشيفات ضمن مساحة العمل.

للتشغيل: `npm start` ثم فتح <http://127.0.0.1:8000/>. لتثبيت أدوات الاختبار: `python -m pip install -r requirements-dev.txt`.
