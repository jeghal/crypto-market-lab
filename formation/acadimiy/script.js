      // ─── TAB SYSTEM ───
      function switchTab(group, panel, el) {
        document
          .querySelectorAll(`#${group} .tab`)
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(`#${group} .tab-panel`)
          .forEach((p) => p.classList.remove("active"));
        document.getElementById(`${group}-${panel}`).classList.add("active");
        el.classList.add("active");
      }

      // ─── HERO CANDLE CHART ───
      (function () {
        const canvas = document.getElementById("heroCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        function resize() {
          canvas.width = canvas.offsetWidth;
          canvas.height = canvas.offsetHeight;
          drawChart();
        }

        function drawChart() {
          const W = canvas.width,
            H = canvas.height;
          ctx.clearRect(0, 0, W, H);

          // Grid
          ctx.strokeStyle = "rgba(0,212,168,0.06)";
          ctx.lineWidth = 1;
          for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(0, (H * i) / 4);
            ctx.lineTo(W, (H * i) / 4);
            ctx.stroke();
          }

          const candles = [
            { o: 0.5, c: 0.62, h: 0.65, l: 0.44 },
            { o: 0.62, c: 0.58, h: 0.67, l: 0.54 },
            { o: 0.58, c: 0.72, h: 0.75, l: 0.55 },
            { o: 0.72, c: 0.68, h: 0.76, l: 0.63 },
            { o: 0.68, c: 0.8, h: 0.83, l: 0.65 },
            { o: 0.8, c: 0.74, h: 0.87, l: 0.7 },
            { o: 0.74, c: 0.85, h: 0.88, l: 0.72 },
            { o: 0.85, c: 0.78, h: 0.9, l: 0.75 },
            { o: 0.78, c: 0.88, h: 0.92, l: 0.76 },
            { o: 0.88, c: 0.93, h: 0.96, l: 0.85 },
            { o: 0.93, c: 0.86, h: 0.97, l: 0.83 },
            { o: 0.86, c: 0.9, h: 0.94, l: 0.82 },
            { o: 0.9, c: 0.96, h: 0.99, l: 0.87 },
            { o: 0.96, c: 0.88, h: 1.0, l: 0.84 },
            { o: 0.88, c: 0.76, h: 0.91, l: 0.72 },
          ];

          const pad = 20,
            cW = (W - pad * 2) / candles.length;
          const yScale = (v) => H - pad - v * (H - pad * 2) * 0.85;

          candles.forEach((c, i) => {
            const x = pad + i * cW + cW / 2;
            const bull = c.c >= c.o;
            const col = bull ? "#2ecc71" : "#ff4d6a";

            ctx.strokeStyle = col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, yScale(c.h));
            ctx.lineTo(x, yScale(c.l));
            ctx.stroke();

            const by = yScale(Math.max(c.o, c.c));
            const bh = Math.max(2, Math.abs(yScale(c.o) - yScale(c.c)));
            ctx.fillStyle = col;
            ctx.fillRect(x - cW * 0.3, by, cW * 0.6, bh);
          });

          // EMA line
          ctx.strokeStyle = "rgba(74,158,255,0.6)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const emaVals = candles.map((c) => ((c.h + c.l) / 2) * 0.95);
          emaVals.forEach((v, i) => {
            const x = pad + i * cW + cW / 2;
            i === 0 ? ctx.moveTo(x, yScale(v)) : ctx.lineTo(x, yScale(v));
          });
          ctx.stroke();
        }

        window.addEventListener("resize", resize);

        // Animate candles drawing in progressively on first load
        let animFrame = 0;
        const totalCandles = 15;
        function animateIn() {
          animFrame++;
          if (animFrame <= totalCandles) {
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            // Grid
            ctx.strokeStyle = "rgba(0,212,168,0.06)";
            ctx.lineWidth = 1;
            for (let i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.moveTo(0, (H * i) / 4);
              ctx.lineTo(W, (H * i) / 4);
              ctx.stroke();
            }
            const candles = [
              { o: 0.5, c: 0.62, h: 0.65, l: 0.44 },
              { o: 0.62, c: 0.58, h: 0.67, l: 0.54 },
              { o: 0.58, c: 0.72, h: 0.75, l: 0.55 },
              { o: 0.72, c: 0.68, h: 0.76, l: 0.63 },
              { o: 0.68, c: 0.8, h: 0.83, l: 0.65 },
              { o: 0.8, c: 0.74, h: 0.87, l: 0.7 },
              { o: 0.74, c: 0.85, h: 0.88, l: 0.72 },
              { o: 0.85, c: 0.78, h: 0.9, l: 0.75 },
              { o: 0.78, c: 0.88, h: 0.92, l: 0.76 },
              { o: 0.88, c: 0.93, h: 0.96, l: 0.85 },
              { o: 0.93, c: 0.86, h: 0.97, l: 0.83 },
              { o: 0.86, c: 0.9, h: 0.94, l: 0.82 },
              { o: 0.9, c: 0.96, h: 0.99, l: 0.87 },
              { o: 0.96, c: 0.88, h: 1.0, l: 0.84 },
              { o: 0.88, c: 0.76, h: 0.91, l: 0.72 },
            ];
            const pad = 20, cW = (W - pad * 2) / candles.length;
            const yScale = (v) => H - pad - v * (H - pad * 2) * 0.85;
            const visible = candles.slice(0, animFrame);
            visible.forEach((c, i) => {
              const x = pad + i * cW + cW / 2;
              const bull = c.c >= c.o;
              const col = bull ? "#2ecc71" : "#ff4d6a";
              ctx.strokeStyle = col;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.moveTo(x, yScale(c.h));
              ctx.lineTo(x, yScale(c.l));
              ctx.stroke();
              const by = yScale(Math.max(c.o, c.c));
              const bh = Math.max(2, Math.abs(yScale(c.o) - yScale(c.c)));
              ctx.fillStyle = col;
              ctx.fillRect(x - cW * 0.3, by, cW * 0.6, bh);
            });
            requestAnimationFrame(animateIn);
          } else {
            drawChart();
          }
        }
        setTimeout(() => { resize(); requestAnimationFrame(animateIn); }, 120);

        // Live price is updated by the market widgets further below.`n
      })();

      // ─── SR CHART ───
      (function () {
        const canvas = document.getElementById("srCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = 500,
          H = 220;

        ctx.clearRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(0, (H * i) / 4);
          ctx.lineTo(W, (H * i) / 4);
          ctx.stroke();
        }

        const priceData = [
          120, 130, 125, 140, 135, 142, 138, 150, 145, 148, 155, 160, 155, 162,
          158, 170, 165, 168, 175, 165, 155, 150, 158, 145, 140, 148, 142, 150,
          145, 152,
        ];
        const min = 115,
          max = 185;
        const yS = (v) => H - 20 - ((v - min) / (max - min)) * (H - 40);
        const xS = (i) => 20 + (i * (W - 40)) / (priceData.length - 1);

        // Resistance line
        const res = 170;
        ctx.strokeStyle = "rgba(255,77,106,0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yS(res));
        ctx.lineTo(W, yS(res));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#ff4d6a";
        ctx.font = "bold 11px monospace";
        ctx.fillText("مقاومة $170", W - 90, yS(res) - 6);

        // Support line
        const sup = 140;
        ctx.strokeStyle = "rgba(46,204,113,0.6)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, yS(sup));
        ctx.lineTo(W, yS(sup));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#2ecc71";
        ctx.fillText("دعم $140", W - 80, yS(sup) + 16);

        // Price line
        ctx.strokeStyle = "#00d4a8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        priceData.forEach((v, i) =>
          i === 0 ? ctx.moveTo(xS(i), yS(v)) : ctx.lineTo(xS(i), yS(v)),
        );
        ctx.stroke();

        // Breakout marker
        const boIdx = 17;
        ctx.fillStyle = "rgba(245,200,66,0.2)";
        ctx.fillRect(xS(boIdx) - 5, yS(res) - 5, 40, 20);
        ctx.fillStyle = "#f5c842";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("اختراق!", xS(boIdx), yS(res) + 5);
      })();

      // ─── RSI SLIDER ───
      const rsiSlider = document.getElementById("rsiSlider");
      if (rsiSlider) {
        function updateRSI(val) {
          document.getElementById("rsiValue").textContent = val;
          rsiSlider.setAttribute("aria-valuenow", val);
          const zi = document.getElementById("rsiZoneInfo");
          const zt = document.getElementById("rsiZoneTitle");
          const zd = document.getElementById("rsiZoneDesc");
          const rv = document.getElementById("rsiValue");
          if (val >= 70) {
            zi.style.background = "rgba(255,77,106,0.08)";
            zi.style.borderColor = "rgba(255,77,106,0.3)";
            zt.style.color = "#ff4d6a";
            zt.textContent = "تشبع شراء ⚠️";
            zd.textContent = "السعر ارتفع بشكل مبالغ فيه. احتمال كبير للتصحيح والهبوط. فكر في أخذ الأرباح أو الانتظار.";
            rv.style.color = "#ff4d6a";
          } else if (val <= 30) {
            zi.style.background = "rgba(46,204,113,0.08)";
            zi.style.borderColor = "rgba(46,204,113,0.3)";
            zt.style.color = "#2ecc71";
            zt.textContent = "تشبع بيع ✅ فرصة محتملة";
            zd.textContent = "السعر هبط بشكل مبالغ فيه. قد تكون فرصة شراء جيدة — انتظر تأكيد نمط شمعة أو ارتداد.";
            rv.style.color = "#2ecc71";
          } else if (val >= 50) {
            zi.style.background = "rgba(0,212,168,0.08)";
            zi.style.borderColor = "rgba(0,212,168,0.3)";
            zt.style.color = "#00d4a8";
            zt.textContent = "قوة صعودية 📈";
            zd.textContent = "الزخم في صالح المشترين. ابحث عن فرص شراء مع الاتجاه عند مستويات الدعم.";
            rv.style.color = "#00d4a8";
          } else {
            zi.style.background = "rgba(107,127,168,0.08)";
            zi.style.borderColor = "rgba(107,127,168,0.3)";
            zt.style.color = "#6b7fa8";
            zt.textContent = "منطقة تردد ↔️";
            zd.textContent = "السوق في حالة تردد. انتظر وضوحاً أكبر في الاتجاه. لا إشارة قوية حالياً.";
            rv.style.color = "#6b7fa8";
          }
        }
        rsiSlider.addEventListener("input", function () {
          updateRSI(parseInt(this.value));
        });
        // Sync initial display with slider default value (65)
        updateRSI(parseInt(rsiSlider.value));
      }

      // ─── QUIZ ───
      const quizData = [
        {
          q: "ما هو مؤشر RSI؟",
          opts: [
            "مؤشر حجم التداول",
            "مؤشر القوة النسبية يقيس سرعة وحجم تغيرات السعر",
            "مؤشر تقارب المتوسطات المتحركة",
            "مستوى الدعم والمقاومة",
          ],
          a: 1,
          exp: "RSI (Relative Strength Index) يقيس زخم السعر ويتراوح بين 0-100. فوق 70 = تشبع شراء، تحت 30 = تشبع بيع.",
        },
        {
          q: "ظهرت شمعة 'مطرقة' عند مستوى دعم قوي. ماذا يعني هذا؟",
          opts: [
            "إشارة هبوط قوية",
            "إشارة صعود محتملة — المشترون رفضوا الأسعار المنخفضة",
            "لا إشارة واضحة",
            "إشارة استمرار الاتجاه الحالي",
          ],
          a: 1,
          exp: "المطرقة عند الدعم من أقوى إشارات الانعكاس الصعودي. الفتيل السفلي الطويل يدل على أن البائعين فشلوا.",
        },
        {
          q: "ما هو Golden Cross في المتوسطات المتحركة؟",
          opts: [
            "تقاطع EMA50 تحت EMA200",
            "تقاطع EMA200 فوق EMA50",
            "تقاطع EMA50 فوق EMA200 — إشارة شراء",
            "تقاطع EMA9 مع EMA21",
          ],
          a: 2,
          exp: "Golden Cross = EMA50 يتقاطع فوق EMA200. يُعتبر من أقوى إشارات الشراء طويلة المدى. BTC 2020 Golden Cross → +1000%!",
        },
        {
          q: "ماذا يحدث عادةً عندما تكسر المقاومة بشكل مؤكد؟",
          opts: [
            "يستمر الهبوط",
            "تتحول المقاومة المكسورة إلى دعم جديد",
            "لا يتغير شيء",
            "السعر يعود فوراً أسفل المقاومة",
          ],
          a: 1,
          exp: "قاعدة أساسية: المقاومة المكسورة تتحول إلى دعم، والعكس صحيح. هذا يسمى 'Role Reversal'.",
        },
        {
          q: "ما الفرق بين Scalping وSwing Trading؟",
          opts: [
            "لا فرق بينهما",
            "Scalping = صفقات دقائق/ساعات، Swing = أيام/أسابيع",
            "Scalping = أطول مدة، Swing = أقصر",
            "Scalping لأسواق العملات فقط",
          ],
          a: 1,
          exp: "Scalping = صفقات سريعة جداً (دقائق-ساعات). Swing Trading = الاحتفاظ بالصفقة أياماً أو أسابيع.",
        },
        {
          q: "نمط 'الرأس والكتفان' يشير إلى؟",
          opts: [
            "استمرار صعودي",
            "انعكاس من صعود لهبوط",
            "انعكاس من هبوط لصعود",
            "استمرار هبوطي",
          ],
          a: 1,
          exp: "Head & Shoulders = ثلاث قمم (الوسطى أعلى). كسر خط الرقبة = هبوط بهدف يساوي ارتفاع الرأس. نمط انعكاس هبوطي قوي.",
        },
        {
          q: "ما هي نسبة المخاطرة للمكافأة (R:R) الموصى بها كحد أدنى؟",
          opts: ["1:1", "1:2 أو أكثر", "2:1", "3:1 على الأقل"],
          a: 1,
          exp: "الحد الأدنى الموصى به هو 1:2 — تخاطر بـ10$ لتكسب 20$. هذا يعني أنك تستطيع تحقيق ربح حتى لو فزت في 34% فقط من صفقاتك!",
        },
        {
          q: "ما معنى RSI Divergence الإيجابي؟",
          opts: [
            "السعر يرتفع وRSI يرتفع",
            "السعر يصنع قاع جديد لكن RSI يصنع قاعاً أعلى من السابق",
            "السعر يهبط وRSI يهبط",
            "لا يوجد شيء اسمه Divergence",
          ],
          a: 1,
          exp: "Bullish Divergence = السعر يصنع قاعاً أدنى لكن RSI يصنع قاعاً أعلى. يدل على ضعف الزخم الهبوطي وانعكاس صعودي محتمل.",
        },
        {
          q: "ما هو مستوى فيبوناتشي الأكثر أهمية وموثوقية؟",
          opts: ["23.6%", "38.2%", "61.8%", "78.6%"],
          a: 2,
          exp: "مستوى 61.8% يسمى النسبة الذهبية (Golden Ratio) وهو أقوى مستويات فيبوناتشي. معظم التصحيحات الصحية تتوقف عنده ثم تستأنف الاتجاه.",
        },
        {
          q: "ماذا يعني Bollinger Bands Squeeze؟",
          opts: [
            "السعر خارج النطاق العلوي",
            "النطاقات تضيق جداً مما يدل على تراكم طاقة وحركة كبيرة وشيكة",
            "المؤشر معطل",
            "السوق هابط بشكل مؤكد",
          ],
          a: 1,
          exp: "عندما تضيق نطاقات بولينجر بشكل حاد، يعني ذلك انخفاض التقلبات وتراكم طاقة. عادةً تتبع هذا الضيق حركة سعرية عنيفة في أي اتجاه.",
        },
        {
          q: "ما هو الإطار الزمني الأفضل لرسم مستويات الدعم والمقاومة الرئيسية؟",
          opts: ["دقيقة واحدة", "15 دقيقة", "يومي أو أسبوعي", "ساعة واحدة"],
          a: 2,
          exp: "الإطار اليومي والأسبوعي يظهران المستويات الرئيسية التي يراها كل المتداولين. هذه المستويات أقوى وأكثر موثوقية من مستويات الإطارات الصغيرة.",
        },
        {
          q: "ما الفرق بين SMA و EMA؟",
          opts: [
            "لا فرق بينهما",
            "SMA يعطي وزناً أكبر للأسعار القديمة بينما EMA يعطيه للحديثة",
            "EMA أبطأ في الاستجابة من SMA",
            "SMA يُستخدم فقط في الفوركس",
          ],
          a: 1,
          exp: "EMA (أسي) يعطي أهمية أكبر للأسعار الحديثة فيستجيب أسرع للتغيرات. SMA (بسيط) يعطي وزناً متساوياً لكل الأسعار فيكون أبطأ وأكثر ثباتاً.",
        },
      ];

      let currentQ = 0,
        score = 0,
        answered = false;

      function renderQuiz() {
        const q = quizData[currentQ];
        document.getElementById("quizQ").textContent = q.q;
        document.getElementById("quizProgress").textContent =
          `سؤال ${currentQ + 1} / ${quizData.length}`;
        document.getElementById("quizProgressBar").style.width =
          `${((currentQ + 1) / quizData.length) * 100}%`;
        document.getElementById("quizFeedback").className = "quiz-feedback";
        document.getElementById("nextBtn").style.display = "none";
        answered = false;

        const opts = document.getElementById("quizOptions");
        opts.innerHTML = "";
        q.opts.forEach((opt, i) => {
          const btn = document.createElement("button");
          btn.className = "quiz-option";
          btn.textContent = opt;
          btn.onclick = () => answerQ(i);
          opts.appendChild(btn);
        });
      }

      function answerQ(idx) {
        if (answered) return;
        answered = true;
        const q = quizData[currentQ];
        const btns = document.querySelectorAll(".quiz-option");
        btns.forEach((b) => (b.disabled = true));

        const fb = document.getElementById("quizFeedback");
        if (idx === q.a) {
          score++;
          btns[idx].classList.add("correct");
          fb.textContent = "✅ صحيح! " + q.exp;
          fb.className = "quiz-feedback correct show";
        } else {
          btns[idx].classList.add("wrong");
          btns[q.a].classList.add("correct");
          fb.textContent = "❌ خطأ. " + q.exp;
          fb.className = "quiz-feedback wrong show";
        }
        document.getElementById("quizScore").textContent = `النتيجة: ${score}`;
        if (currentQ < quizData.length - 1)
          document.getElementById("nextBtn").style.display = "block";
        else {
          document.getElementById("nextBtn").style.display = "block";
          document.getElementById("nextBtn").textContent =
            "🏆 عرض النتيجة النهائية";
          document.getElementById("nextBtn").onclick = showFinalScore;
        }
      }

      function nextQuestion() {
        currentQ++;
        if (currentQ < quizData.length) renderQuiz();
      }

      // ─── QUIZ KEYBOARD SHORTCUTS ───
      document.addEventListener("keydown", (e) => {
        const quizSection = document.getElementById("quiz");
        if (!quizSection) return;
        const rect = quizSection.getBoundingClientRect();
        const inView = rect.top < window.innerHeight && rect.bottom > 0;
        if (!inView) return;

        const key = e.key;
        if (["1", "2", "3", "4"].includes(key)) {
          const idx = parseInt(key) - 1;
          const btns = document.querySelectorAll(".quiz-option");
          if (btns[idx] && !btns[idx].disabled) btns[idx].click();
        }
        if ((key === "Enter" || key === " ") && answered) {
          e.preventDefault();
          const nb = document.getElementById("nextBtn");
          if (nb && nb.style.display !== "none") nb.click();
        }
      });

      function launchConfetti() {
        const colors = ["#00d4a8","#4a9eff","#f5c842","#2ecc71","#a855f7","#ff4d6a"];
        for (let i = 0; i < 80; i++) {
          setTimeout(() => {
            const el = document.createElement("div");
            el.className = "confetti-piece";
            el.style.left = Math.random() * 100 + "vw";
            el.style.top = "-10px";
            el.style.background = colors[Math.floor(Math.random() * colors.length)];
            el.style.width = (8 + Math.random() * 8) + "px";
            el.style.height = (8 + Math.random() * 8) + "px";
            el.style.animationDuration = (1.5 + Math.random() * 2) + "s";
            el.style.animationDelay = "0s";
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 4000);
          }, i * 30);
        }
      }

      function showFinalScore() {
        const card = document.querySelector(".quiz-card");
        const pct = Math.round((score / quizData.length) * 100);
        const grade =
          pct >= 87
            ? "🏆 ممتاز!"
            : pct >= 62
              ? "⭐ جيد جداً"
              : pct >= 50
                ? "📚 جيد"
                : "💪 استمر في التعلم";
        card.innerHTML = `
    <div style="text-align:center;padding:2rem;">
      <div style="font-size:4rem;margin-bottom:1rem;">${pct >= 75 ? "🏆" : pct >= 50 ? "⭐" : "📚"}</div>
      <div style="font-size:2.5rem;font-weight:900;color:var(--teal);font-family:var(--mono);">${score}/${quizData.length}</div>
      <div style="font-size:1.5rem;font-weight:700;margin:0.5rem 0;">${grade}</div>
      <div style="color:var(--gray);margin-bottom:2rem;">${pct}% نسبة النجاح</div>
      <button class="btn-primary" onclick="restartQuiz()">أعد الاختبار</button>
    </div>`;
        if (pct >= 75) launchConfetti();
      }

      function restartQuiz() {
        currentQ = 0;
        score = 0;
        const firstPct = Math.round((1 / quizData.length) * 100);
        document.querySelector(".quiz-card").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
      <span class="quiz-progress-text" id="quizProgress">سؤال 1 / ${quizData.length}</span>
      <span class="quiz-score" id="quizScore">النتيجة: 0</span>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar" id="quizProgressBar" style="width:${firstPct}%"></div></div>
    <div class="quiz-question" id="quizQ"></div>
    <div class="quiz-options" id="quizOptions"></div>
    <div class="quiz-feedback" id="quizFeedback"></div>
    <div class="quiz-nav">
      <button type="button" class="btn-outline" id="nextBtn" onclick="nextQuestion()" style="display:none;padding:10px 20px;font-size:0.9rem;">السؤال التالي ←</button>
      <div></div>
    </div>`;
        renderQuiz();
      }

      renderQuiz();

      // ─── CHECKLIST ───
      const checks = [
        {
          t: "ما هو الاتجاه العام؟",
          d: "تداول مع الاتجاه دائماً. فوق EMA200 = صعودي، تحته = هبوطي",
        },
        {
          t: "هل السعر عند دعم أو مقاومة مهمة؟",
          d: "الدخول عند المستويات يعطيك R:R أفضل بكثير",
        },
        {
          t: "هل يوجد نمط شمعة يؤكد الإشارة؟",
          d: "مطرقة / ابتلاع / نجمة = تأكيد قوي للدخول",
        },
        {
          t: "ما هو مستوى RSI؟ هل يوجد Divergence؟",
          d: "RSI < 30 عند دعم = فرصة ذهبية نادرة",
        },
        {
          t: "ماذا يقول مؤشر MACD؟",
          d: "تقاطع صعودي مع RSI = إشارة قوية جداً",
        },
        {
          t: "هل حددت نقطة الدخول بدقة؟",
          d: "انتظر إغلاق الشمعة لتأكيد النمط قبل الدخول",
        },
        {
          t: "أين Stop Loss؟ (واجب قبل الدخول)",
          d: "تحت الدعم بـ2-5%. لا تتنازل عنه أبداً!",
        },
        {
          t: "ما هي أهداف الربح TP1 و TP2؟",
          d: "TP1 = R:R 1:2 محافظ | TP2 = R:R 1:4 متفائل",
        },
      ];

      const cl = document.getElementById("checklistItems");
      const CHECKLIST_KEY = "ta_checklist";
      let checked = new Set(
        JSON.parse(localStorage.getItem(CHECKLIST_KEY) || "[]"),
      );

      function updateChecklistUI() {
        const pct = (checked.size / checks.length) * 100;
        document.getElementById("checklistBar").style.width = pct + "%";
        document.getElementById("checklistCount").textContent =
          `${checked.size} / ${checks.length}`;
      }

      checks.forEach((c, i) => {
        const div = document.createElement("div");
        div.className = "check-item";
        div.innerHTML = `
    <div class="check-box${checked.has(i) ? " checked" : ""}" id="cb${i}" onclick="toggleCheck(${i})"></div>
    <div class="check-text"><strong>${c.t}</strong><span>${c.d}</span></div>`;
        cl.appendChild(div);
      });

      updateChecklistUI();

      function toggleCheck(i) {
        const box = document.getElementById("cb" + i);
        checked.has(i) ? checked.delete(i) : checked.add(i);
        box.classList.toggle("checked", checked.has(i));
        localStorage.setItem(CHECKLIST_KEY, JSON.stringify([...checked]));
        updateChecklistUI();
      }

      function printChecklist() {
        const items = checks.map((c, i) =>
          `${checked.has(i) ? "✅" : "☐"} ${c.t}\n   ${c.d}`
        ).join("\n\n");
        const win = window.open("", "_blank", "width=600,height=700");
        win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar">
<head><meta charset="UTF-8"><title>قائمة التحقق — TA Academy</title>
<style>
  body { font-family: Arial, sans-serif; padding: 2rem; line-height: 1.8; direction: rtl; color: #111; }
  h2 { color: #009e7f; border-bottom: 2px solid #009e7f; padding-bottom: 0.5rem; }
  pre { white-space: pre-wrap; font-family: Arial; font-size: 14px; }
  footer { margin-top: 2rem; font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 1rem; }
</style></head>
<body onload="window.print(); window.close();">
  <h2>✅ قائمة التحقق قبل الصفقة — TA Academy</h2>
  <p style="color:#666; font-size:13px">التاريخ: ${new Date().toLocaleDateString("ar-SA", {year:"numeric",month:"long",day:"numeric"})}</p>
  <pre>${items}</pre>
  <footer>TA Academy © ${new Date().getFullYear()} — لأغراض تعليمية فقط</footer>
</body></html>`);
        win.document.close();
      }

      // ─── GLOSSARY ───
      const glossaryData = [
        {
          t: "Support",
          ar: "الدعم",
          d: "مستوى سعري يتوقف عنده الهبوط ويرتد السعر للأعلى — منطقة تراكم المشترين",
        },
        {
          t: "Resistance",
          ar: "المقاومة",
          d: "مستوى سعري يتوقف عنده الصعود ويرتد السعر للأسفل — منطقة تراكم البائعين",
        },
        {
          t: "Candlestick",
          ar: "الشمعة اليابانية",
          d: "تمثيل بصري لحركة السعر يظهر الافتتاح والإغلاق والأعلى والأدنى",
        },
        {
          t: "Bullish",
          ar: "صعودي",
          d: "مصطلح يصف اتجاهاً أو نمطاً يشير إلى ارتفاع السعر",
        },
        {
          t: "Bearish",
          ar: "هبوطي",
          d: "مصطلح يصف اتجاهاً أو نمطاً يشير إلى انخفاض السعر",
        },
        {
          t: "RSI",
          ar: "مؤشر القوة النسبية",
          d: "مؤشر زخم يتراوح بين 0-100. فوق 70 = تشبع شراء، تحت 30 = تشبع بيع",
        },
        {
          t: "MACD",
          ar: "مؤشر التقارب/التباعد",
          d: "مؤشر زخم يعتمد على الفرق بين متوسطين متحركين أسيين (12 و26)",
        },
        {
          t: "EMA",
          ar: "المتوسط المتحرك الأسي",
          d: "متوسط يعطي أهمية أكبر للأسعار الحديثة — أسرع استجابة من SMA",
        },
        {
          t: "Stop Loss",
          ar: "أمر وقف الخسارة",
          d: "أمر تلقائي يغلق الصفقة عند سعر محدد للحد من الخسائر",
        },
        {
          t: "Take Profit",
          ar: "هدف الربح",
          d: "السعر المستهدف لإغلاق الصفقة وأخذ الربح",
        },
        {
          t: "Divergence",
          ar: "الاختلاف/التباعد",
          d: "عندما يتحرك المؤشر (RSI/MACD) عكس اتجاه السعر — إشارة انعكاس قوية",
        },
        {
          t: "Golden Cross",
          ar: "التقاطع الذهبي",
          d: "EMA50 يتقاطع فوق EMA200 — إشارة شراء قوية طويلة المدى",
        },
        {
          t: "Death Cross",
          ar: "التقاطع المميت",
          d: "EMA50 يتقاطع تحت EMA200 — إشارة هبوط قوية طويلة المدى",
        },
        {
          t: "Breakout",
          ar: "الاختراق",
          d: "كسر السعر لمستوى مقاومة أو دعم بزخم وحجم تداول مرتفع",
        },
        {
          t: "R:R Ratio",
          ar: "نسبة المخاطرة/المكافأة",
          d: "نسبة الخسارة المحتملة إلى الربح المحتمل. 1:2 كحد أدنى موصى به",
        },
        {
          t: "Fibonacci",
          ar: "فيبوناتشي",
          d: "مستويات تصحيح رياضية (38.2%, 50%, 61.8%) تُستخدم لتحديد مناطق الدخول",
        },
        {
          t: "Trend",
          ar: "الاتجاه",
          d: "الحركة العامة للسعر: صعودي (Higher Highs) أو هبوطي (Lower Lows)",
        },
        {
          t: "Scalping",
          ar: "السكالبينج",
          d: "استراتيجية تداول سريعة جداً (دقائق) تستهدف أرباحاً صغيرة متكررة",
        },
        {
          t: "Swing Trading",
          ar: "تداول التأرجح",
          d: "الاحتفاظ بالصفقات لأيام أو أسابيع للاستفادة من تأرجحات السعر",
        },
        {
          t: "Volume",
          ar: "حجم التداول",
          d: "عدد الوحدات المتداولة في فترة زمنية محددة — يؤكد قوة الحركة",
        },
        {
          t: "Wick / Shadow",
          ar: "الفتيل",
          d: "الخط الرفيع فوق أو تحت جسم الشمعة يمثل أقصى نقاط السعر",
        },
        {
          t: "Consolidation",
          ar: "التوحيد / التراكم",
          d: "فترة حركة جانبية بين دعم ومقاومة قبل حركة كبيرة في أي اتجاه",
        },
      ];

      const gg = document.getElementById("glossaryGrid");
      function renderGlossary(filter = "") {
        gg.innerHTML = "";
        glossaryData
          .filter(
            (g) =>
              !filter ||
              g.t.toLowerCase().includes(filter.toLowerCase()) ||
              g.ar.includes(filter) ||
              g.d.includes(filter),
          )
          .forEach((g) => {
            const div = document.createElement("div");
            div.className = "glossary-item";
            div.innerHTML = `<div class="glossary-term">${g.t}</div><div class="glossary-ar">${g.ar}</div><div class="glossary-def">${g.d}</div>`;
            gg.appendChild(div);
          });
      }
      renderGlossary();
      function filterGlossary(v) {
        renderGlossary(v);
      }

      // ─── PATTERN SEARCH ───
      function filterPatterns(query) {
        const q = query.trim().toLowerCase();
        document.querySelectorAll(".pattern-card").forEach((card) => {
          const text = card.textContent.toLowerCase();
          card.style.display = !q || text.includes(q) ? "" : "none";
        });
        // Show all tab panels when searching
        if (q) {
          document.querySelectorAll("#patterns .tab-panel").forEach(p => {
            p.classList.add("active");
            p.style.display = "block";
          });
          document.querySelectorAll("#patterns .tab").forEach(t => t.classList.remove("active"));
        } else {
          // Restore first tab only
          document.querySelectorAll("#patterns .tab-panel").forEach((p, i) => {
            p.classList.toggle("active", i === 0);
            p.style.display = i === 0 ? "block" : "none";
          });
          document.querySelectorAll("#patterns .tab")[0]?.classList.add("active");
        }
      }

      // ─── STATS COUNTER ANIMATION ───
      function animateCounter(el, target, suffix) {
        const duration = 1400;
        const start = performance.now();
        const isSymbol = isNaN(parseInt(target));
        if (isSymbol) return; // skip ∞ and "20+"
        const end = parseInt(target);
        const hasSuffix = target.toString().includes("+");
        function step(now) {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = Math.round(eased * end) + (hasSuffix ? "+" : "");
          if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }

      // ─── SCROLL REVEAL ───
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("visible");
              // Animate stat numbers once
              const numEl = e.target.querySelector(".stat-number");
              if (numEl && !numEl.dataset.animated) {
                numEl.dataset.animated = "1";
                animateCounter(numEl, numEl.textContent.trim(), "");
              }
            }
          });
        },
        { threshold: 0.1 },
      );
      document
        .querySelectorAll(
          ".reveal, .pattern-card, .indicator-card, .glossary-item",
        )
        .forEach((el) => observer.observe(el));

      // ─── READ PROGRESS + BACK TO TOP + NAV ACTIVE ───
      const navAnchors = document.querySelectorAll(".nav-links a[href^='#']");
      const sections = ["candles", "patterns", "indicators", "sr", "marketPulse", "quiz", "calculator", "journal", "glossary"].map(
        (id) => document.getElementById(id),
      );
      const backToTopBtn = document.getElementById("backToTop");

      window.addEventListener("scroll", () => {
        const scrollY = window.scrollY;

        // Read progress
        const pct = (scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
        document.getElementById("readProgress").style.width = pct + "%";

        // Back to top visibility
        backToTopBtn.classList.toggle("visible", scrollY > 400);

        // Nav active link
        let currentSection = "";
        sections.forEach((sec) => {
          if (sec && scrollY >= sec.offsetTop - 120) currentSection = sec.id;
        });
        navAnchors.forEach((a) => {
          a.classList.toggle("active", a.getAttribute("href") === `#${currentSection}`);
        });
      });

      // ─── POSITION CALCULATOR ───
      function calcPosition() {
        const capital = parseFloat(document.getElementById("calcCapital").value) || 0;
        const riskPct = parseFloat(document.getElementById("calcRisk").value) || 2;
        const entry   = parseFloat(document.getElementById("calcEntry").value) || 0;
        const sl      = parseFloat(document.getElementById("calcSL").value) || 0;
        const tp      = parseFloat(document.getElementById("calcTP").value) || 0;

        if (!capital || !entry || !sl || entry === sl) return;

        const riskAmount = (capital * riskPct) / 100;
        const slDist     = Math.abs(entry - sl);
        const tpDist     = Math.abs(tp - entry);
        const posSize    = riskAmount / slDist;
        const posValue   = posSize * entry;
        const profit     = posSize * tpDist;
        const rr         = tpDist / slDist;

        document.getElementById("riskAmount").textContent  = "$" + riskAmount.toFixed(2);
        document.getElementById("posSize").textContent     = posSize.toFixed(4) + " units";
        document.getElementById("posValue").textContent    = "$" + posValue.toFixed(0);
        document.getElementById("profitAmount").textContent = "$" + profit.toFixed(2);
        document.getElementById("rrRatio").textContent     = "1:" + rr.toFixed(1);

        // R:R alert
        const rrAlertEl = document.getElementById("rrAlert");
        if (rr >= 2) {
          rrAlertEl.style.background = "rgba(46,204,113,0.1)";
          rrAlertEl.style.borderColor = "rgba(46,204,113,0.3)";
          rrAlertEl.style.color = "var(--green)";
          rrAlertEl.textContent = "✅ نسبة R:R ممتازة (" + rr.toFixed(1) + ":1) — صفقة احترافية";
        } else if (rr >= 1) {
          rrAlertEl.style.background = "rgba(245,200,66,0.1)";
          rrAlertEl.style.borderColor = "rgba(245,200,66,0.3)";
          rrAlertEl.style.color = "var(--gold)";
          rrAlertEl.textContent = "⚠️ R:R مقبولة (" + rr.toFixed(1) + ":1) — يمكن التحسين";
        } else {
          rrAlertEl.style.background = "rgba(255,77,106,0.1)";
          rrAlertEl.style.borderColor = "rgba(255,77,106,0.3)";
          rrAlertEl.style.color = "var(--red)";
          rrAlertEl.textContent = "❌ R:R ضعيفة (" + rr.toFixed(1) + ":1) — لا تدخل هذه الصفقة!";
        }

        // Price bar visualization
        const mn = Math.min(sl, entry, tp), mx = Math.max(sl, entry, tp);
        const range = mx - mn || 1;
        const pct = (v) => ((v - mn) / range * 100).toFixed(1) + "%";
        const isLong = entry > sl;
        document.getElementById("priceBar").innerHTML = `
          <div style="position:absolute;left:${pct(isLong ? sl : tp)};width:${pct(isLong ? tp : sl).replace('%','') - pct(isLong ? sl : tp).replace('%','') + '%'};height:100%;background:linear-gradient(90deg,rgba(255,77,106,0.15),rgba(46,204,113,0.15))"></div>
          <div style="position:absolute;right:calc(100% - ${pct(sl)});width:3px;height:100%;background:var(--red);top:0"></div>
          <div style="position:absolute;right:calc(100% - ${pct(entry)});width:3px;height:100%;background:var(--teal);top:0"></div>
          <div style="position:absolute;right:calc(100% - ${pct(tp)});width:3px;height:100%;background:var(--green);top:0"></div>`;
        document.getElementById("slLabel").textContent = "SL $" + sl.toLocaleString();
        document.getElementById("entryLabel").textContent = "Entry $" + entry.toLocaleString();
        document.getElementById("tpLabel").textContent = "TP $" + tp.toLocaleString();

        // Signal generator
        const signalBox = document.getElementById("signalBox");
        const signalText = document.getElementById("signalText");
        const direction = entry > sl ? "شراء 📈 LONG" : "بيع 📉 SHORT";
        const now = new Date().toLocaleDateString("ar-SA", { day:"numeric", month:"long", year:"numeric" });
        signalText.textContent =
`📊 إشارة تداول — TA Academy
━━━━━━━━━━━━━━━━━━━━━━━━━
📅 التاريخ     : ${now}
📌 الاتجاه     : ${direction}
━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 الدخول      : $${entry.toLocaleString()}
🛑 Stop Loss   : $${sl.toLocaleString()} (${((Math.abs(entry-sl)/entry)*100).toFixed(2)}%)
💰 Take Profit : $${tp.toLocaleString()} (${((Math.abs(tp-entry)/entry)*100).toFixed(2)}%)
━━━━━━━━━━━━━━━━━━━━━━━━━
💼 حجم الصفقة  : ${posSize.toFixed(4)} units
⚠️ المخاطرة    : $${riskAmount.toFixed(2)} (${riskPct}%)
📈 الربح المتوقع: $${profit.toFixed(2)}
⚖️ R:R Ratio   : 1:${rr.toFixed(1)}
━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ تعليمي فقط — ليس نصيحة استثمارية`;
        signalBox.style.display = "block";
      }

      function copySignal() {
        const text = document.getElementById("signalText").textContent;
        navigator.clipboard.writeText(text).then(() => {
          const btn = document.getElementById("copySignalBtn");
          const orig = btn.textContent;
          btn.textContent = "تم ✓";
          btn.style.background = "var(--green)";
          setTimeout(() => { btn.textContent = orig; btn.style.background = "var(--teal)"; }, 2000);
        });
      }

      // ─── BOLLINGER BANDS CANVAS ───
      (function () {
        const canvas = document.getElementById("bbCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const W = canvas.width, H = canvas.height;

        const prices = [50,52,54,53,56,58,55,57,60,62,65,63,68,70,67,65,63,60,58,62,65,68,72,75,73,70,68,65,70,72];
        const period = 10;

        function sma(data, i) {
          let s = 0; for (let j = i - period + 1; j <= i; j++) s += data[j]; return s / period;
        }
        function stdDev(data, i, mean) {
          let s = 0; for (let j = i - period + 1; j <= i; j++) s += Math.pow(data[j] - mean, 2); return Math.sqrt(s / period);
        }

        const mn = 40, mx = 90;
        const yS = (v) => H - 10 - ((v - mn) / (mx - mn)) * (H - 20);
        const xS = (i) => 10 + (i * (W - 20)) / (prices.length - 1);

        ctx.clearRect(0, 0, W, H);

        // Compute bands
        const upper = [], lower = [], mid = [];
        for (let i = period - 1; i < prices.length; i++) {
          const m = sma(prices, i);
          const sd = stdDev(prices, i, m);
          mid.push({ i, v: m });
          upper.push({ i, v: m + 2 * sd });
          lower.push({ i, v: m - 2 * sd });
        }

        // Fill band
        ctx.beginPath();
        upper.forEach(p => ctx.lineTo(xS(p.i), yS(p.v)));
        lower.slice().reverse().forEach(p => ctx.lineTo(xS(p.i), yS(p.v)));
        ctx.closePath();
        ctx.fillStyle = "rgba(74,158,255,0.07)";
        ctx.fill();

        // Upper band
        ctx.strokeStyle = "rgba(74,158,255,0.7)"; ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
        ctx.beginPath(); upper.forEach((p,i) => i===0 ? ctx.moveTo(xS(p.i),yS(p.v)) : ctx.lineTo(xS(p.i),yS(p.v))); ctx.stroke();

        // Lower band
        ctx.strokeStyle = "rgba(46,204,113,0.7)";
        ctx.beginPath(); lower.forEach((p,i) => i===0 ? ctx.moveTo(xS(p.i),yS(p.v)) : ctx.lineTo(xS(p.i),yS(p.v))); ctx.stroke();

        // Mid SMA
        ctx.strokeStyle = "rgba(245,200,66,0.8)"; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.beginPath(); mid.forEach((p,i) => i===0 ? ctx.moveTo(xS(p.i),yS(p.v)) : ctx.lineTo(xS(p.i),yS(p.v))); ctx.stroke();

        // Price line
        ctx.strokeStyle = "#00d4a8"; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); prices.forEach((v,i) => i===0 ? ctx.moveTo(xS(i),yS(v)) : ctx.lineTo(xS(i),yS(v))); ctx.stroke();

        // Squeeze indicator (where bands are close)
        const sqIdx = 18;
        ctx.fillStyle = "rgba(168,85,247,0.2)";
        ctx.fillRect(xS(sqIdx)-10, 0, 30, H);
        ctx.fillStyle = "var(--purple)"; ctx.font = "bold 9px sans-serif";
        ctx.fillText("Squeeze", xS(sqIdx)-12, 16);
      })();

      // ─── THEME TOGGLE ───
      const themeBtn = document.getElementById("themeToggle");
      const savedTheme = localStorage.getItem("ta_theme") || "dark";
      if (savedTheme === "light") {
        document.body.classList.add("light");
        themeBtn.textContent = "☀️";
      }
      themeBtn.addEventListener("click", () => {
        const isLight = document.body.classList.toggle("light");
        themeBtn.textContent = isLight ? "☀️" : "🌙";
        localStorage.setItem("ta_theme", isLight ? "light" : "dark");
      });

      // ─── HAMBURGER MENU ───
      const hamburger = document.getElementById("navHamburger");
      const mobileMenu = document.getElementById("navMobileMenu");

      hamburger.addEventListener("click", () => {
        const isOpen = mobileMenu.classList.toggle("open");
        hamburger.classList.toggle("open", isOpen);
        hamburger.setAttribute("aria-expanded", isOpen);
      });

      function closeMobileMenu() {
        mobileMenu.classList.remove("open");
        hamburger.classList.remove("open");
        hamburger.setAttribute("aria-expanded", "false");
      }

      // Close on outside click
      document.addEventListener("click", (e) => {
        if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
          closeMobileMenu();
        }
      });


      // ─── EXTENDED FEATURES V2 ───
      const extraQuizData = [
        {
          q: "أي من التالي يجعل إشارة الاختراق أكثر موثوقية؟",
          opts: [
            "الاختراق بدون حجم تداول",
            "الاختراق مع إعادة اختبار ناجحة وحجم تداول مرتفع",
            "الاختراق داخل سوق جانبي ضيق فقط",
            "الاختراق على إطار الدقيقة فقط",
          ],
          a: 1,
          exp: "الاختراق يصبح أقوى عندما يترافق مع حجم تداول واضح ثم إعادة اختبار ناجحة للمستوى المكسور.",
        },
        {
          q: "متى يكون استخدام Stochastic مناسباً أكثر؟",
          opts: [
            "عند سوق متذبذب وقريب من مستويات الدعم والمقاومة",
            "في كل حالة وبمعزل عن السياق",
            "فقط بعد الأخبار الكبرى",
            "فقط على الفريم الشهري",
          ],
          a: 0,
          exp: "الستوكاستيك يلمع خصوصاً داخل الأسواق المتذبذبة أو عند حدود النطاق، وليس كأداة معزولة دائماً.",
        },
        {
          q: "إذا كانت الصفقة LONG، فأين يجب أن يكون Take Profit منطقياً؟",
          opts: [
            "أسفل سعر الدخول",
            "مساوياً تماماً لوقف الخسارة",
            "أعلى سعر الدخول وفي اتجاه الصفقة",
            "لا أهمية لمكانه",
          ],
          a: 2,
          exp: "في صفقة LONG يجب أن يكون هدف الربح فوق الدخول، وإلا فخطة الصفقة نفسها غير منطقية.",
        },
        {
          q: "ما الذي يعنيه ارتفاع Fear & Greed إلى منطقة greed الشديدة؟",
          opts: [
            "ضمان صعود دائم",
            "السوق بلا مخاطرة",
            "تفاؤل مفرط قد يسبق جني أرباح أو تقلباً حاداً",
            "إشارة شراء وحيدة كافية",
          ],
          a: 2,
          exp: "ارتفاع المؤشر إلى greed الشديدة لا يعني البيع فوراً، لكنه يحذر من الثقة الزائدة واحتمال تقلب قوي أو جني أرباح.",
        },
        {
          q: "أي جملة أدق بخصوص المؤشرات الفنية؟",
          opts: [
            "المؤشر يتفوق دائماً على حركة السعر",
            "المؤشر أداة تأكيد ويجب قراءته مع السياق السعري",
            "كل المؤشرات تعطي نفس الإشارات",
            "المؤشرات تغني عن وقف الخسارة",
          ],
          a: 1,
          exp: "المؤشرات أدوات مساعدة، لكنها لا تعوّض قراءة البنية السعرية أو إدارة المخاطر.",
        },
        {
          q: "عندما تكون نسبة R:R أقل من 1:1 فهذا يعني غالباً:؟",
          opts: [
            "الصفقة احترافية جداً",
            "الربح المحتمل أقل من الخسارة المحتملة",
            "أن نسبة الفوز مضمونة",
            "أن الستوب قريب جداً دائماً",
          ],
          a: 1,
          exp: "إذا كانت R:R أقل من 1:1 فأنت تخاطر بأكثر مما قد تكسبه، وهذا عادةً غير جذاب إحصائياً.",
        },
        {
          q: "ما فائدة تدوين Journal de trading بعد الصفقة؟",
          opts: [
            "لا فائدة حقيقية منه",
            "فقط لتذكر الأسعار",
            "لكشف الأخطاء المتكررة وتحسين الانضباط والنتائج",
            "لاستخدامه بدلاً من الرسم البياني",
          ],
          a: 2,
          exp: "السجل يساعدك على اكتشاف السلوكيات المتكررة: دخول متأخر، تحريك الستوب، الاندفاع، أو سوء اختيار الإعدادات.",
        },
        {
          q: "إذا قطع %K خط %D صعوداً من منطقة أقل من 20، فهذا يوحي غالباً بـ:؟",
          opts: [
            "إشارة صعود مبكرة تحتاج تأكيداً",
            "انهيار سعري مؤكد",
            "سوق بلا اتجاه نهائياً",
            "ضرورة تجاهل الستوكاستيك",
          ],
          a: 0,
          exp: "هذا من أشهر إشارات الستوكاستيك الصعودية، خاصةً إذا ظهر قرب دعم مهم أو مع شمعة انعكاسية.",
        },
      ];

      if (quizData.length < 20) {
        quizData.push(...extraQuizData);
      }

      const QUIZ_BEST_KEY = "ta_quiz_best";
      const QUIZ_ATTEMPTS_KEY = "ta_quiz_attempts";

      function getStoredQuizBest() {
        try {
          const parsed = JSON.parse(localStorage.getItem(QUIZ_BEST_KEY) || "null");
          if (parsed && typeof parsed.score === "number") return parsed;
        } catch (error) {}
        return { score: 0, total: quizData.length, pct: 0 };
      }

      function updateQuizMeta() {
        const best = getStoredQuizBest();
        const attempts = parseInt(localStorage.getItem(QUIZ_ATTEMPTS_KEY) || "0", 10) || 0;
        const bestEl = document.getElementById("quizBestScore");
        const attemptsEl = document.getElementById("quizAttempts");
        if (bestEl) bestEl.textContent = `أفضل نتيجة: ${best.score}/${quizData.length}`;
        if (attemptsEl) attemptsEl.textContent = `المحاولات: ${attempts}`;
      }

      function showFinalScore() {
        const card = document.querySelector(".quiz-card");
        if (!card) return;

        const pct = Math.round((score / quizData.length) * 100);
        const attempts = (parseInt(localStorage.getItem(QUIZ_ATTEMPTS_KEY) || "0", 10) || 0) + 1;
        localStorage.setItem(QUIZ_ATTEMPTS_KEY, String(attempts));

        const currentBest = getStoredQuizBest();
        const nextBest =
          score > currentBest.score || (score === currentBest.score && pct >= (currentBest.pct || 0))
            ? { score, total: quizData.length, pct }
            : currentBest;
        localStorage.setItem(QUIZ_BEST_KEY, JSON.stringify(nextBest));
        updateQuizMeta();

        const grade =
          pct >= 90
            ? "🏆 ممتاز جداً"
            : pct >= 75
              ? "⭐ قوي جداً"
              : pct >= 60
                ? "📚 جيد"
                : "💪 تحتاج مراجعة إضافية";

        card.innerHTML = `
    <div style="text-align:center;padding:2rem;">
      <div style="font-size:4rem;margin-bottom:1rem;">${pct >= 75 ? "🏆" : pct >= 60 ? "⭐" : "📚"}</div>
      <div style="font-size:2.5rem;font-weight:900;color:var(--teal);font-family:var(--mono);">${score}/${quizData.length}</div>
      <div style="font-size:1.5rem;font-weight:700;margin:0.5rem 0;">${grade}</div>
      <div style="color:var(--gray);margin-bottom:0.75rem;">${pct}% نسبة النجاح</div>
      <div style="color:var(--lgray);font-size:0.9rem;margin-bottom:1.5rem;">أفضل نتيجة محفوظة: ${nextBest.score}/${quizData.length}</div>
      <button class="btn-primary" onclick="restartQuiz()">أعد الاختبار</button>
    </div>`;

        if (pct >= 75) launchConfetti();
      }

      function restartQuiz() {
        currentQ = 0;
        score = 0;
        answered = false;
        const firstPct = Math.round((1 / quizData.length) * 1000) / 10;
        const card = document.querySelector(".quiz-card");
        if (!card) return;
        card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
      <span class="quiz-progress-text" id="quizProgress">سؤال 1 / ${quizData.length}</span>
      <span class="quiz-score" id="quizScore">النتيجة: 0</span>
    </div>
    <div class="progress-bar-wrap"><div class="progress-bar" id="quizProgressBar" style="width:${firstPct}%"></div></div>
    <div class="quiz-question" id="quizQ"></div>
    <div class="quiz-options" id="quizOptions"></div>
    <div class="quiz-feedback" id="quizFeedback"></div>
    <div class="quiz-nav">
      <button type="button" class="btn-outline" id="nextBtn" onclick="nextQuestion()" style="display:none;padding:10px 20px;font-size:0.9rem;">السؤال التالي ←</button>
      <div></div>
    </div>`;
        updateQuizMeta();
        renderQuiz();
      }

      const extraGlossary = [
        { t: "Liquidity", ar: "السيولة", d: "قدرة السوق على تنفيذ الأوامر بسرعة وبفارق سعري منخفض دون انزلاق كبير" },
        { t: "Volatility", ar: "التقلب", d: "درجة سرعة واتساع تحرك السعر صعوداً وهبوطاً خلال فترة زمنية" },
        { t: "Order Block", ar: "منطقة أوامر", d: "منطقة سعرية يُعتقد أن المؤسسات وضعت فيها أوامر كبيرة وقد يعود السعر للتفاعل معها" },
        { t: "Fair Value Gap", ar: "فجوة القيمة العادلة", d: "فجوة سريعة في الحركة السعرية تشير إلى اختلال مؤقت بين العرض والطلب" },
        { t: "Market Structure", ar: "بنية السوق", d: "ترتيب القمم والقيعان الذي يحدد ما إذا كان الاتجاه صاعداً أو هابطاً أو جانبياً" },
        { t: "Higher High", ar: "قمة أعلى", d: "قمة جديدة أعلى من القمة السابقة، وتُستخدم لتأكيد استمرار الاتجاه الصاعد" },
        { t: "Lower Low", ar: "قاع أدنى", d: "قاع جديد أدنى من القاع السابق، ويؤكد الضغط البيعي في الاتجاه الهابط" },
        { t: "Risk Management", ar: "إدارة المخاطر", d: "مجموعة القواعد التي تحدد حجم الصفقة والستوب والحد الأقصى للخسارة المسموحة" },
        { t: "Confirmation", ar: "التأكيد", d: "دليل إضافي يدعم فكرة الدخول مثل حجم تداول، شمعة واضحة، أو تقاطع مؤشر" },
        { t: "Retest", ar: "إعادة الاختبار", d: "عودة السعر إلى المستوى الذي كسره سابقاً للتأكد من تحوله إلى دعم أو مقاومة" },
      ];

      if (!glossaryData.some((item) => item.t === "Liquidity")) {
        glossaryData.push(...extraGlossary);
        renderGlossary(document.getElementById("glossarySearch")?.value || "");
      }

      updateQuizMeta();
      restartQuiz();

      function formatUsd(value) {
        if (!Number.isFinite(value)) return "--";
        const digits = value >= 1000 ? 0 : value >= 1 ? 2 : 4;
        return `$${value.toLocaleString("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })}`;
      }

      function formatCompactUsd(value) {
        if (!Number.isFinite(value)) return "--";
        return `$${new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: 2,
        }).format(value)}`;
      }

      function setTickerState(priceElId, changeElId, price, change) {
        const priceEl = document.getElementById(priceElId);
        const changeEl = document.getElementById(changeElId);
        if (priceEl) priceEl.textContent = formatUsd(price);
        if (changeEl) {
          changeEl.className = "ticker-change";
          if (Number.isFinite(change)) {
            changeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}% / 24h`;
            changeEl.classList.add(change > 0 ? "positive" : change < 0 ? "negative" : "neutral");
          } else {
            changeEl.textContent = "--";
            changeEl.classList.add("neutral");
          }
        }
      }

      function updateChartBias(change) {
        const biasEl = document.getElementById("chartBiasBadge");
        if (!biasEl) return;
        biasEl.className = "chart-bias";
        if (!Number.isFinite(change) || Math.abs(change) < 0.35) {
          biasEl.textContent = "Neutral";
          biasEl.classList.add("neutral");
          return;
        }
        if (change > 0) {
          biasEl.textContent = "Bullish";
          biasEl.classList.add("bullish");
          return;
        }
        biasEl.textContent = "Bearish";
        biasEl.classList.add("bearish");
      }

      function renderFearGreed(entry) {
        const value = Number(entry?.value || 0);
        const label = entry?.value_classification || "محايد";
        const valueEl = document.getElementById("fearGreedValue");
        const labelEl = document.getElementById("fearGreedLabel");
        const badgeEl = document.getElementById("fearGreedBadge");
        const barEl = document.getElementById("fearGreedBar");
        const noteEl = document.getElementById("fearGreedNote");

        let tone = "var(--gray)";
        let bg = "rgba(107,127,168,0.14)";
        let border = "rgba(107,127,168,0.3)";
        let note = "استخدم المؤشر كمرآة نفسية للسوق، وليس كزر شراء أو بيع فوري.";

        if (value <= 24) {
          tone = "var(--red)";
          bg = "rgba(255,77,106,0.12)";
          border = "rgba(255,77,106,0.28)";
          note = "الخوف الشديد قد يصنع فرص ارتداد، لكن فقط إذا دعمه السعر عند دعم قوي أو إشارة تأكيد واضحة.";
        } else if (value <= 49) {
          tone = "var(--gold)";
          bg = "rgba(245,200,66,0.12)";
          border = "rgba(245,200,66,0.28)";
          note = "الخوف المعتدل يعني أن السوق متحفظ. راقب الاختبارات الفنية أكثر من مطاردة الحركة.";
        } else if (value <= 74) {
          tone = "var(--teal)";
          bg = "rgba(0,212,168,0.12)";
          border = "rgba(0,212,168,0.28)";
          note = "الشهية للمخاطرة موجودة، لكن لا تزال إدارة المخاطر أهم من التفاؤل العام.";
        } else {
          tone = "var(--green)";
          bg = "rgba(46,204,113,0.12)";
          border = "rgba(46,204,113,0.28)";
          note = "الطمع المرتفع قد يسبق تقلبات قوية أو جني أرباح. لا تجعل حماس السوق يفسد انضباطك.";
        }

        if (valueEl) {
          valueEl.textContent = String(value || 0);
          valueEl.style.color = tone;
        }
        if (labelEl) {
          labelEl.textContent = label;
          labelEl.style.color = tone;
        }
        if (badgeEl) {
          badgeEl.textContent = label;
          badgeEl.style.color = tone;
          badgeEl.style.background = bg;
          badgeEl.style.borderColor = border;
        }
        if (barEl) barEl.style.width = `${Math.max(0, Math.min(value, 100))}%`;
        if (noteEl) noteEl.textContent = note;
      }

      async function refreshMarketData(manual = false) {
        const marketUpdatedAt = document.getElementById("marketUpdatedAt");
        const fearGreedUpdatedAt = document.getElementById("fearGreedUpdatedAt");
        const livePriceEl = document.getElementById("livePrice");
        const livePriceChangeEl = document.getElementById("livePriceChange");
        const liveHighEl = document.getElementById("liveHigh");
        const liveLowEl = document.getElementById("liveLow");
        const liveVolumeEl = document.getElementById("liveVolume");

        if (manual && marketUpdatedAt) marketUpdatedAt.textContent = "جاري تحديث الأسعار...";
        if (manual && fearGreedUpdatedAt) fearGreedUpdatedAt.textContent = "جاري تحديث المؤشر...";

        const priceUrl = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum,binancecoin&price_change_percentage=24h";
        const fearGreedUrl = "https://api.alternative.me/fng/?limit=1";
        const [pricesResult, fearResult] = await Promise.allSettled([
          fetch(priceUrl, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("CoinGecko request failed");
            return response.json();
          }),
          fetch(fearGreedUrl, { cache: "no-store" }).then((response) => {
            if (!response.ok) throw new Error("Fear & Greed request failed");
            return response.json();
          }),
        ]);

        const nowText = new Date().toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

        if (pricesResult.status === "fulfilled") {
          const prices = pricesResult.value;
          const btc = prices.find((item) => item.id === "bitcoin");
          const eth = prices.find((item) => item.id === "ethereum");
          const bnb = prices.find((item) => item.id === "binancecoin");
          setTickerState("btcPrice", "btcChange", btc?.current_price, btc?.price_change_percentage_24h);
          setTickerState("ethPrice", "ethChange", eth?.current_price, eth?.price_change_percentage_24h);
          setTickerState("bnbPrice", "bnbChange", bnb?.current_price, bnb?.price_change_percentage_24h);
          if (marketUpdatedAt) marketUpdatedAt.textContent = `آخر تحديث: ${nowText}`;
          if (livePriceEl && Number.isFinite(btc?.current_price)) {
            livePriceEl.textContent = formatUsd(btc.current_price);
            livePriceEl.style.color = btc?.price_change_percentage_24h >= 0 ? "var(--green)" : "var(--red)";
          }
          if (livePriceChangeEl) {
            const change = btc?.price_change_percentage_24h;
            livePriceChangeEl.className = "chart-change";
            if (Number.isFinite(change)) {
              livePriceChangeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}% / 24h`;
              livePriceChangeEl.classList.add(change > 0 ? "positive" : change < 0 ? "negative" : "neutral");
            } else {
              livePriceChangeEl.textContent = "Variation indisponible";
              livePriceChangeEl.classList.add("neutral");
            }
          }
          if (liveHighEl) liveHighEl.textContent = formatUsd(btc?.high_24h);
          if (liveLowEl) liveLowEl.textContent = formatUsd(btc?.low_24h);
          if (liveVolumeEl) liveVolumeEl.textContent = formatCompactUsd(btc?.total_volume);
          updateChartBias(btc?.price_change_percentage_24h);
        } else if (marketUpdatedAt) {
          marketUpdatedAt.textContent = "تعذر تحميل الأسعار الآن";
          if (livePriceChangeEl) {
            livePriceChangeEl.textContent = "Données indisponibles";
            livePriceChangeEl.className = "chart-change neutral";
          }
          if (liveHighEl) liveHighEl.textContent = "--";
          if (liveLowEl) liveLowEl.textContent = "--";
          if (liveVolumeEl) liveVolumeEl.textContent = "--";
          updateChartBias(NaN);
        }

        if (fearResult.status === "fulfilled") {
          renderFearGreed(fearResult.value?.data?.[0]);
          if (fearGreedUpdatedAt) fearGreedUpdatedAt.textContent = `آخر تحديث: ${nowText}`;
        } else if (fearGreedUpdatedAt) {
          fearGreedUpdatedAt.textContent = "تعذر تحميل المؤشر الآن";
        }
      }

      window.refreshMarketData = refreshMarketData;
      if (document.getElementById("marketPulse")) {
        refreshMarketData();
        setInterval(refreshMarketData, 60000);
      }

      const chartTimeButtons = document.querySelectorAll(".chart-time-btn");
      const chartTimeframeLabel = document.getElementById("chartTimeframeLabel");
      chartTimeButtons.forEach((button) => {
        button.addEventListener("click", () => {
          chartTimeButtons.forEach((item) => {
            item.classList.toggle("active", item === button);
            item.setAttribute("aria-pressed", item === button ? "true" : "false");
          });
          if (chartTimeframeLabel) {
            chartTimeframeLabel.textContent = button.dataset.timeframe || "1D";
          }
        });
      });

      const stochKSlider = document.getElementById("stochKSlider");
      const stochDSlider = document.getElementById("stochDSlider");
      if (stochKSlider && stochDSlider) {
        function updateStochastic() {
          const k = parseInt(stochKSlider.value, 10);
          const d = parseInt(stochDSlider.value, 10);
          document.getElementById("stochKValue").textContent = String(k);
          document.getElementById("stochDValue").textContent = String(d);
          document.getElementById("stochKLine").style.top = `calc(${100 - k}% - 2px)`;
          document.getElementById("stochDLine").style.top = `calc(${100 - d}% - 2px)`;

          const signalBox = document.getElementById("stochSignalBox");
          const signalTitle = document.getElementById("stochSignalTitle");
          const signalDesc = document.getElementById("stochSignalDesc");
          let title = "حالة محايدة";
          let desc = "انتظر أن يتضح اتجاه %K و%D قرب منطقة مهمة أو مع تأكيد سعري واضح.";
          let border = "rgba(74,158,255,0.24)";
          let bg = "rgba(74,158,255,0.08)";
          let tone = "var(--blue)";

          if (k <= 20 && d <= 20 && k > d) {
            title = "إشارة صعود مبكرة";
            desc = "%K صعد فوق %D من منطقة التشبع البيعي. راقب شمعة ارتداد أو دعماً واضحاً لتأكيد الفكرة.";
            border = "rgba(46,204,113,0.26)";
            bg = "rgba(46,204,113,0.08)";
            tone = "var(--green)";
          } else if (k >= 80 && d >= 80 && k < d) {
            title = "تحذير هبوطي من منطقة تشبع شراء";
            desc = "%K هبط تحت %D قرب القمة. هذا ليس أمراً للبيع وحده، لكنه تحذير قوي من ضعف الزخم.";
            border = "rgba(255,77,106,0.26)";
            bg = "rgba(255,77,106,0.08)";
            tone = "var(--red)";
          } else if (k > d) {
            title = "الزخم يميل للصعود";
            desc = "%K أعلى من %D، ما يعني أن الضغط الشرائي أقوى حالياً. الأفضل دائماً دمج ذلك مع الاتجاه العام.";
            border = "rgba(0,212,168,0.26)";
            bg = "rgba(0,212,168,0.08)";
            tone = "var(--teal)";
          } else if (k < d) {
            title = "الزخم يميل للهبوط";
            desc = "%K أسفل %D، ما يشير إلى ضعف نسبي في الارتداد أو بداية ضغط بيعي قصير المدى.";
            border = "rgba(245,200,66,0.26)";
            bg = "rgba(245,200,66,0.08)";
            tone = "var(--gold)";
          }

          signalBox.style.borderColor = border;
          signalBox.style.background = bg;
          signalTitle.textContent = title;
          signalTitle.style.color = tone;
          signalDesc.textContent = desc;
        }

        stochKSlider.addEventListener("input", updateStochastic);
        stochDSlider.addEventListener("input", updateStochastic);
        updateStochastic();
      }

      const CALC_STORAGE_KEY = "ta_calc_state_v2";

      function setCalcValidation(message, state = "success") {
        const el = document.getElementById("calcValidation");
        if (!el) return;
        el.hidden = false;
        el.dataset.state = state;
        el.textContent = message;
      }

      function resetCalcOutputs(message) {
        document.getElementById("riskAmount").textContent = "--";
        document.getElementById("posSize").textContent = "--";
        document.getElementById("posValue").textContent = "--";
        document.getElementById("profitAmount").textContent = "--";
        document.getElementById("rrRatio").textContent = "--";
        document.getElementById("priceBar").innerHTML = "";
        document.getElementById("slLabel").textContent = "SL";
        document.getElementById("entryLabel").textContent = "Entry";
        document.getElementById("tpLabel").textContent = "TP";
        document.getElementById("signalBox").style.display = "none";
        const rrAlertEl = document.getElementById("rrAlert");
        rrAlertEl.style.background = "rgba(107,127,168,0.12)";
        rrAlertEl.style.borderColor = "rgba(107,127,168,0.26)";
        rrAlertEl.style.color = "var(--lgray)";
        rrAlertEl.textContent = message;
        setCalcValidation(message, "warning");
      }

      function loadCalculatorState() {
        try {
          const raw = JSON.parse(localStorage.getItem(CALC_STORAGE_KEY) || "null");
          if (!raw) return;
          if (raw.capital) document.getElementById("calcCapital").value = raw.capital;
          if (raw.risk) document.getElementById("calcRisk").value = raw.risk;
          if (raw.entry) document.getElementById("calcEntry").value = raw.entry;
          if (raw.sl) document.getElementById("calcSL").value = raw.sl;
          if (raw.tp) document.getElementById("calcTP").value = raw.tp;
          document.getElementById("calcRiskVal").textContent = `${document.getElementById("calcRisk").value}%`;
        } catch (error) {}
      }

      function persistCalculatorState(state) {
        localStorage.setItem(CALC_STORAGE_KEY, JSON.stringify(state));
      }

      function calcPosition() {
        const capital = parseFloat(document.getElementById("calcCapital").value) || 0;
        const riskPct = parseFloat(document.getElementById("calcRisk").value) || 0;
        const entry = parseFloat(document.getElementById("calcEntry").value) || 0;
        const sl = parseFloat(document.getElementById("calcSL").value) || 0;
        const tp = parseFloat(document.getElementById("calcTP").value) || 0;

        document.getElementById("calcRiskVal").textContent = `${riskPct}%`;
        persistCalculatorState({ capital, risk: riskPct, entry, sl, tp });

        if (!capital || !riskPct || !entry || !sl || !tp) {
          resetCalcOutputs("أدخل كل القيم أولاً ليتم حساب الصفقة.");
          return;
        }
        if (entry === sl) {
          resetCalcOutputs("لا يمكن أن يكون سعر الدخول مساوياً لوقف الخسارة.");
          return;
        }

        const isLong = entry > sl;
        if ((isLong && tp <= entry) || (!isLong && tp >= entry)) {
          resetCalcOutputs("يجب أن يكون هدف الربح في اتجاه الصفقة، وليس عكسه.");
          return;
        }

        const riskAmount = (capital * riskPct) / 100;
        const slDist = Math.abs(entry - sl);
        const tpDist = Math.abs(tp - entry);
        const posSize = riskAmount / slDist;
        const posValue = posSize * entry;
        const profit = posSize * tpDist;
        const rr = tpDist / slDist;

        document.getElementById("riskAmount").textContent = `$${riskAmount.toFixed(2)}`;
        document.getElementById("posSize").textContent = `${posSize.toFixed(4)} units`;
        document.getElementById("posValue").textContent = `$${posValue.toFixed(2)}`;
        document.getElementById("profitAmount").textContent = `$${profit.toFixed(2)}`;
        document.getElementById("rrRatio").textContent = `1:${rr.toFixed(1)}`;

        const rrAlertEl = document.getElementById("rrAlert");
        if (rr >= 2) {
          rrAlertEl.style.background = "rgba(46,204,113,0.1)";
          rrAlertEl.style.borderColor = "rgba(46,204,113,0.3)";
          rrAlertEl.style.color = "var(--green)";
          rrAlertEl.textContent = `✅ نسبة R:R ممتازة (${rr.toFixed(1)}:1) — صفقة منضبطة`;
        } else if (rr >= 1) {
          rrAlertEl.style.background = "rgba(245,200,66,0.1)";
          rrAlertEl.style.borderColor = "rgba(245,200,66,0.3)";
          rrAlertEl.style.color = "var(--gold)";
          rrAlertEl.textContent = `⚠️ نسبة R:R متوسطة (${rr.toFixed(1)}:1) — يمكن تحسينها`;
        } else {
          rrAlertEl.style.background = "rgba(255,77,106,0.1)";
          rrAlertEl.style.borderColor = "rgba(255,77,106,0.3)";
          rrAlertEl.style.color = "var(--red)";
          rrAlertEl.textContent = `❌ نسبة R:R ضعيفة (${rr.toFixed(1)}:1) — أعد تقييم الصفقة`;
        }

        const mn = Math.min(sl, entry, tp);
        const mx = Math.max(sl, entry, tp);
        const range = mx - mn || 1;
        const pct = (value) => ((value - mn) / range) * 100;
        const barStart = isLong ? pct(sl) : pct(tp);
        const barEnd = isLong ? pct(tp) : pct(sl);
        document.getElementById("priceBar").innerHTML = `
          <div style="position:absolute;right:${100 - barEnd}%;width:${barEnd - barStart}%;height:100%;background:linear-gradient(90deg,rgba(255,77,106,0.15),rgba(46,204,113,0.15))"></div>
          <div style="position:absolute;right:${100 - pct(sl)}%;width:3px;height:100%;background:var(--red);top:0"></div>
          <div style="position:absolute;right:${100 - pct(entry)}%;width:3px;height:100%;background:var(--teal);top:0"></div>
          <div style="position:absolute;right:${100 - pct(tp)}%;width:3px;height:100%;background:var(--green);top:0"></div>`;
        document.getElementById("slLabel").textContent = `SL $${sl.toLocaleString()}`;
        document.getElementById("entryLabel").textContent = `Entry $${entry.toLocaleString()}`;
        document.getElementById("tpLabel").textContent = `TP $${tp.toLocaleString()}`;

        const signalText = document.getElementById("signalText");
        const signalBox = document.getElementById("signalBox");
        const direction = isLong ? "شراء LONG" : "بيع SHORT";
        const now = new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
        signalText.textContent =
`📊 إشارة تداول — TA Academy
━━━━━━━━━━━━━━━━━━━━━━━━━
📅 التاريخ     : ${now}
📌 الاتجاه     : ${direction}
━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 الدخول      : $${entry.toLocaleString()}
🛑 Stop Loss   : $${sl.toLocaleString()} (${((Math.abs(entry - sl) / entry) * 100).toFixed(2)}%)
💰 Take Profit : $${tp.toLocaleString()} (${((Math.abs(tp - entry) / entry) * 100).toFixed(2)}%)
━━━━━━━━━━━━━━━━━━━━━━━━━
💼 حجم الصفقة  : ${posSize.toFixed(4)} units
⚠️ المخاطرة    : $${riskAmount.toFixed(2)} (${riskPct}%)
📈 الربح المتوقع: $${profit.toFixed(2)}
⚖️ R:R Ratio   : 1:${rr.toFixed(1)}
━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ تعليمي فقط — ليس نصيحة استثمارية`;
        signalBox.style.display = "block";
        setCalcValidation("تم تحديث النتائج وحفظ آخر القيم تلقائياً على هذا الجهاز.", "success");
      }

      function copySignal() {
        const text = document.getElementById("signalText")?.textContent || "";
        const btn = document.getElementById("copySignalBtn");
        if (!text || !btn) return;
        const markCopied = () => {
          const original = btn.textContent;
          btn.textContent = "تم ✓";
          btn.style.background = "var(--green)";
          setTimeout(() => {
            btn.textContent = original;
            btn.style.background = "var(--teal)";
          }, 2000);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(text).then(markCopied);
          return;
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
        markCopied();
      }

      loadCalculatorState();
      calcPosition();

      const JOURNAL_KEY = "ta_trade_journal";
      const tradeForm = document.getElementById("tradeJournalForm");
      let tradeJournal = [];
      let journalSearchTerm = "";
      let journalStatusFilter = "all";
      try {
        const storedJournal = JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]");
        if (Array.isArray(storedJournal)) tradeJournal = storedJournal;
      } catch (error) {
        tradeJournal = [];
      }

      function escapeHtml(value = "") {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function getDefaultTradeDate() {
        return new Date().toISOString().slice(0, 10);
      }

      function resetTradeForm() {
        if (!tradeForm) return;
        tradeForm.reset();
        document.getElementById("tradeDate").value = getDefaultTradeDate();
        document.getElementById("tradeDirection").value = "long";
        document.getElementById("tradeMood").value = "calm";
      }

      function getTradeMetrics(trade) {
        const entry = Number(trade.entry);
        const stop = Number(trade.stop);
        const exit = trade.exit === "" || trade.exit == null ? null : Number(trade.exit);
        const risk = Math.abs(entry - stop);
        const rr = exit != null && risk ? Math.abs(exit - entry) / risk : null;
        const pnlPct =
          exit == null
            ? null
            : trade.direction === "long"
              ? ((exit - entry) / entry) * 100
              : ((entry - exit) / entry) * 100;
        const status = exit == null ? "open" : pnlPct >= 0 ? "win" : "loss";
        return { rr, pnlPct, status };
      }

      function persistTradeJournal() {
        localStorage.setItem(JOURNAL_KEY, JSON.stringify(tradeJournal));
      }

      function getFilteredTrades() {
        const query = journalSearchTerm.trim().toLowerCase();
        return tradeJournal.filter((trade) => {
          const metrics = getTradeMetrics(trade);
          const matchesStatus = journalStatusFilter === "all" || metrics.status === journalStatusFilter;
          if (!matchesStatus) return false;
          if (!query) return true;
          const haystack = [
            trade.asset,
            trade.setup,
            trade.notes,
            trade.date,
            trade.direction,
            trade.mood,
          ]
            .join(" ")
            .toLowerCase();
          return haystack.includes(query);
        });
      }

      function syncJournalFilters() {
        document.querySelectorAll(".journal-filter").forEach((button) => {
          const isActive = button.dataset.filter === journalStatusFilter;
          button.classList.toggle("active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
      }

      function renderTradeJournal() {
        const listEl = document.getElementById("journalList");
        const emptyEl = document.getElementById("journalEmptyState");
        const storageHintEl = document.getElementById("journalStorageHint");
        if (!listEl || !emptyEl) return;

        const closedTrades = tradeJournal.filter((trade) => getTradeMetrics(trade).status !== "open");
        const winningTrades = closedTrades.filter((trade) => getTradeMetrics(trade).status === "win");
        const rrValues = tradeJournal.map((trade) => getTradeMetrics(trade).rr).filter((value) => Number.isFinite(value));
        const filteredTrades = getFilteredTrades();

        document.getElementById("journalTradeCount").textContent = String(tradeJournal.length);
        document.getElementById("journalWinRate").textContent = closedTrades.length ? `${Math.round((winningTrades.length / closedTrades.length) * 100)}%` : "0%";
        document.getElementById("journalAvgRR").textContent = rrValues.length ? (rrValues.reduce((sum, value) => sum + value, 0) / rrValues.length).toFixed(1) : "0.0";

        syncJournalFilters();
        if (storageHintEl) {
          storageHintEl.textContent = tradeJournal.length
            ? `محفوظ محلياً · ${filteredTrades.length}/${tradeJournal.length} نتيجة`
            : "محفوظ محلياً";
        }
        emptyEl.textContent = tradeJournal.length
          ? "لا توجد نتائج مطابقة للبحث أو الفلتر الحالي."
          : "لا توجد صفقات محفوظة بعد. أضف أول صفقة لتبدأ أرشيفك الشخصي.";
        emptyEl.style.display = filteredTrades.length ? "none" : "block";
        listEl.innerHTML = filteredTrades.map((trade) => {
          const metrics = getTradeMetrics(trade);
          const moodMap = { calm: "هادئ", focused: "مركز", hesitant: "متردد", impulsive: "مندفع" };
          const statusLabel = metrics.status === "open" ? "مفتوحة" : metrics.status === "win" ? "رابحة" : "خاسرة";
          return `
            <article class="journal-item">
              <div class="journal-item-head">
                <div class="journal-item-title">
                  <strong>${escapeHtml(trade.asset)}</strong>
                  <span class="journal-pill ${trade.direction}">${trade.direction.toUpperCase()}</span>
                  <span class="journal-pill ${metrics.status === "win" ? "win" : metrics.status === "loss" ? "loss" : trade.direction}">${statusLabel}</span>
                </div>
                <button type="button" class="journal-item-remove" onclick="removeTrade(${trade.id})">حذف</button>
              </div>
              <div class="journal-item-meta">
                <div><span>الدخول / الخروج</span><strong>${Number(trade.entry).toLocaleString()}${trade.exit !== "" ? ` → ${Number(trade.exit).toLocaleString()}` : ""}</strong></div>
                <div><span>R:R / الأداء</span><strong>${metrics.rr != null ? metrics.rr.toFixed(1) : "--"}${metrics.pnlPct != null ? ` / ${metrics.pnlPct >= 0 ? "+" : ""}${metrics.pnlPct.toFixed(2)}%` : ""}</strong></div>
                <div><span>التاريخ / الحالة</span><strong>${escapeHtml(trade.date)} / ${moodMap[trade.mood] || trade.mood}</strong></div>
              </div>
              <div class="journal-notes">${escapeHtml(trade.setup || "بدون سيناريو محدد")}\n${escapeHtml(trade.notes || "لا توجد ملاحظات إضافية")}</div>
            </article>`;
        }).join("");
      }

      function escapeCsv(value) {
        const stringValue = String(value ?? "");
        return `"${stringValue.replaceAll('"', '""')}"`;
      }

      function exportTradingJournal() {
        if (!tradeJournal.length) return;
        const header = ["date", "asset", "direction", "status", "entry", "stop", "exit", "rr", "pnl_pct", "mood", "setup", "notes"];
        const rows = tradeJournal.map((trade) => {
          const metrics = getTradeMetrics(trade);
          return [
            trade.date,
            trade.asset,
            trade.direction,
            metrics.status,
            trade.entry,
            trade.stop,
            trade.exit,
            metrics.rr != null ? metrics.rr.toFixed(2) : "",
            metrics.pnlPct != null ? metrics.pnlPct.toFixed(2) : "",
            trade.mood,
            trade.setup,
            trade.notes,
          ];
        });
        const csv = [header.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `ta-journal-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }

      function removeTrade(id) {
        tradeJournal = tradeJournal.filter((trade) => trade.id !== id);
        persistTradeJournal();
        renderTradeJournal();
      }

      function clearTradingJournal() {
        if (!tradeJournal.length || confirm("هل تريد حذف كل سجل الصفقات المحفوظ؟")) {
          tradeJournal = [];
          persistTradeJournal();
          renderTradeJournal();
          resetTradeForm();
        }
      }

      window.resetTradeForm = resetTradeForm;
      window.clearTradingJournal = clearTradingJournal;
      window.removeTrade = removeTrade;
      window.exportTradingJournal = exportTradingJournal;

      document.getElementById("journalSearch")?.addEventListener("input", (event) => {
        journalSearchTerm = event.target.value || "";
        renderTradeJournal();
      });

      document.querySelectorAll(".journal-filter").forEach((button) => {
        button.addEventListener("click", () => {
          journalStatusFilter = button.dataset.filter || "all";
          renderTradeJournal();
        });
      });

      if (tradeForm) {
        tradeForm.addEventListener("submit", (event) => {
          event.preventDefault();
          const trade = {
            id: Date.now(),
            date: document.getElementById("tradeDate").value || getDefaultTradeDate(),
            asset: document.getElementById("tradeAsset").value.trim().toUpperCase(),
            direction: document.getElementById("tradeDirection").value,
            setup: document.getElementById("tradeSetup").value.trim(),
            entry: document.getElementById("tradeEntry").value,
            stop: document.getElementById("tradeStop").value,
            exit: document.getElementById("tradeExit").value,
            mood: document.getElementById("tradeMood").value,
            notes: document.getElementById("tradeNotes").value.trim(),
          };
          tradeJournal.unshift(trade);
          persistTradeJournal();
          renderTradeJournal();
          resetTradeForm();
        });
        resetTradeForm();
        renderTradeJournal();
      }

      const shortcutOverlay = document.getElementById("shortcutOverlay");
      const shortcutHelpBtn = document.getElementById("shortcutHelpBtn");

      function toggleShortcutOverlay(forceState) {
        if (!shortcutOverlay) return;
        const shouldOpen = typeof forceState === "boolean" ? forceState : shortcutOverlay.hasAttribute("hidden");
        if (shouldOpen) shortcutOverlay.removeAttribute("hidden");
        else shortcutOverlay.setAttribute("hidden", "true");
      }

      window.toggleShortcutOverlay = toggleShortcutOverlay;
      shortcutHelpBtn?.addEventListener("click", () => toggleShortcutOverlay());
      shortcutOverlay?.addEventListener("click", (event) => {
        if (event.target === shortcutOverlay) toggleShortcutOverlay(false);
      });

      function isTypingTarget(target) {
        return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);
      }

      document.addEventListener("keydown", (event) => {
        const key = event.key;
        if ((key === "?" || (key === "/" && event.shiftKey)) && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          toggleShortcutOverlay();
          return;
        }
        if (key === "Escape") {
          toggleShortcutOverlay(false);
          closeMobileMenu();
          return;
        }
        if (isTypingTarget(event.target)) return;
        if (shortcutOverlay && !shortcutOverlay.hasAttribute("hidden")) return;
        if (key.toLowerCase() === "t") {
          event.preventDefault();
          themeBtn.click();
        }
        if (key.toLowerCase() === "g") {
          event.preventDefault();
          document.getElementById("glossary")?.scrollIntoView({ behavior: "smooth" });
          setTimeout(() => document.getElementById("glossarySearch")?.focus(), 250);
        }
        if (key.toLowerCase() === "j") {
          event.preventDefault();
          document.getElementById("journal")?.scrollIntoView({ behavior: "smooth" });
          setTimeout(() => document.getElementById("tradeAsset")?.focus(), 250);
        }
      });

      const extendedNavAnchors = document.querySelectorAll(".nav-links a[href^='#'], .nav-mobile-menu a[href^='#']");
      const extendedSections = ["candles", "patterns", "indicators", "sr", "marketPulse", "quiz", "calculator", "journal", "glossary"]
        .map((id) => document.getElementById(id))
        .filter(Boolean);

      function syncExtendedNavState() {
        const scrollY = window.scrollY;
        let currentSection = "";
        extendedSections.forEach((section) => {
          if (scrollY >= section.offsetTop - 120) currentSection = section.id;
        });
        extendedNavAnchors.forEach((anchor) => {
          anchor.classList.toggle("active", anchor.getAttribute("href") === `#${currentSection}`);
        });
      }

      window.addEventListener("scroll", syncExtendedNavState);
      syncExtendedNavState();
