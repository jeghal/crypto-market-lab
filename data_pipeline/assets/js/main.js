
// =========================
// التنفيذ الرئيسي
// =========================

// العملات الافتراضية
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const SYMBOL_PROGRESS_STEPS = 5;
let baseProgressSteps = 0;
let symbolProgressSteps = {};
let totalProgressSteps = 0;

function resetProgressTracking(symbols) {
  baseProgressSteps = 0;
  symbolProgressSteps = Object.fromEntries(symbols.map((symbol) => [symbol, 0]));
}

function refreshProgress() {
  const symbolStepsDone = Object.values(symbolProgressSteps)
    .reduce((sum, steps) => sum + steps, 0);
  if (totalProgressSteps > 0) {
    progressWrap.style.display = "block";
  }
  updateProgress(baseProgressSteps + symbolStepsDone, totalProgressSteps);
}

function advanceBaseProgress(steps = 1) {
  baseProgressSteps += steps;
  refreshProgress();
}

function setSymbolProgress(symbol, steps) {
  const nextSteps = Math.max(0, Math.min(SYMBOL_PROGRESS_STEPS, steps));
  symbolProgressSteps[symbol] = nextSteps;
  refreshProgress();
}

function advanceSymbolProgress(symbol, steps = 1) {
  setSymbolProgress(symbol, (symbolProgressSteps[symbol] || 0) + steps);
}

function completeSymbolProgress(symbol) {
  setSymbolProgress(symbol, SYMBOL_PROGRESS_STEPS);
}

async function buildMarketBundle() {
  buildBtn.disabled = true;
  clearSummary();

  const symbolsInput = document.getElementById("symbolsInput");
  const SYMBOLS = symbolsInput ? symbolsInput.value.split(",").map(s => s.trim().toUpperCase()).filter(s => s !== "") : DEFAULT_SYMBOLS;

  if (SYMBOLS.length === 0) {
    appendStatus("⚠️ يرجى إدخال رمز عملة واحد على الأقل.");
    buildBtn.disabled = false;
    return;
  }

  // تهيئة شريط التقدم: خطوتان عامتان + خمس خطوات لكل رمز
  totalProgressSteps = 2 + (SYMBOLS.length * SYMBOL_PROGRESS_STEPS);
  resetProgressTracking(SYMBOLS);
  refreshProgress();

  appendStatus("بدء إنشاء الحزمة...");

  try {
    const zip = new JSZip();
    const symbolResults = [];
    const allBundleFiles = [];
    const symbolArtifacts = {};

    appendStatus("جلب وقت خادم Binance...");
    try {
      const serverTimeMs = await fetchServerTime();
      globalTimeOffset = serverTimeMs - Date.now();
    } catch (err) {
      appendStatus("⚠️ فشل جلب وقت الخادم، سيتم استخدام التوقيت المحلي.");
      globalTimeOffset = 0;
    }
    const overallStart = nowIso();

    // 0) جلب بيانات التنفيذ لكل العملات
    appendStatus("جلب قواعد التنفيذ (Exchange Info)...");
    const exchangeInfoMap = await fetchExchangeInfo(SYMBOLS);
    advanceBaseProgress();

    // 1) جمع دفتر الأوامر أولاً بشكل متزامن قدر الإمكان بين العملات
    const orderbookBySymbol = await collectAllOrderbookSnapshots(SYMBOLS);
    advanceBaseProgress();

    // 2) اشتقاق نافذة زمنية موحدة لـ recent trades من آخر لقطة orderbook
    const commonRecentTradesWindow = getCommonRecentTradesWindowFromOrderbooks(orderbookBySymbol);

    appendStatus(
      `نافذة recent trades المشتركة: ` +
      `${new Date(commonRecentTradesWindow.startTime).toISOString()} -> ` +
      `${new Date(commonRecentTradesWindow.endTime).toISOString()}`
    );

    // 3) جمع ملفات كل عملة بالتوازي
    const symbolTasks = SYMBOLS.map(async (symbol) => {
      const symbolStart = nowIso();
      appendStatus(`بدء جمع بيانات ${symbol}...`);

      const filesCreated = [];
      const notes = [];
      const counts = {};

      try {
        // الشموع
        const klineData = await collectAllKlines(zip, symbol);
        filesCreated.push(...klineData.fileNames);
        Object.assign(counts, klineData.rowCounts);
        advanceSymbolProgress(symbol);

        // ticker
        const tickerInfo = await collectTicker(zip, symbol);
        filesCreated.push(tickerInfo.fileName);
        counts["ticker_24h"] = tickerInfo.rowCount;
        advanceSymbolProgress(symbol);

        // bookTicker (السعر اللحظي)
        const bookTickerInfo = await collectBookTicker(zip, symbol);
        filesCreated.push(bookTickerInfo.fileName);
        counts["book_ticker"] = bookTickerInfo.rowCount;
        advanceSymbolProgress(symbol);

        // recent trades
        const tradesInfo = await collectRecentTrades(
          zip, symbol,
          commonRecentTradesWindow.startTime,
          commonRecentTradesWindow.endTime
        );
        filesCreated.push(tradesInfo.fileName);
        counts["recent_trades"] = tradesInfo.rowCount;
        advanceSymbolProgress(symbol);

        // orderbook
        appendStatus(`${symbol}: حفظ لقطات سياق دفتر الأوامر...`);
        const obCsv = orderbookSnapshotsToCSV(symbol, orderbookBySymbol[symbol] || []);
        const obFileName = `${symbol}/orderbook_snapshots.csv`;
        zip.file(obFileName, obCsv);
        filesCreated.push(obFileName);
        counts["orderbook_snapshots"] = countCsvRows(obCsv);

        const topBid = Number(bookTickerInfo.data.bidPrice);
        const topAsk = Number(bookTickerInfo.data.askPrice);
        const spread = Number((topAsk - topBid).toFixed(8));
        const latestPrice = (topBid + topAsk) / 2;

        const derivedMetrics = buildDerivedMetrics(
          symbol,
          nowIso(),
          klineData.rowsByInterval,
          latestPrice,
          bookTickerInfo.data,
          tickerInfo.data,
          tradesInfo.largeTradeStats
        );
        const derivedMetricsFileName = `${symbol}/derived_metrics.json`;
        zip.file(derivedMetricsFileName, safeJsonStringify(derivedMetrics));
        filesCreated.push(derivedMetricsFileName);
        counts["derived_metrics"] = 1;

        const executionCheck = buildExecutionCheck(
          symbol,
          nowIso(),
          latestPrice,
          exchangeInfoMap[symbol] || {}
        );
        const executionCheckFileName = `${symbol}/execution_check.json`;
        zip.file(executionCheckFileName, safeJsonStringify(executionCheck));
        filesCreated.push(executionCheckFileName);
        counts["execution_check"] = 1;

        const symbolSummary = {
          latest_price: latestPrice,
          last_closed_1d_close: klineData.candlesStatus["1d"]?.last_closed_close,
          last_closed_4h_close: klineData.candlesStatus["4h"]?.last_closed_close,
          last_closed_1h_close: klineData.candlesStatus["1h"]?.last_closed_close,
          last_closed_15m_close: klineData.candlesStatus["15m"]?.last_closed_close,
          recent_trade_count: tradesInfo.keptTrades,
          orderbook_last_snapshot_time: new Date(orderbookBySymbol[symbol]?.[orderbookBySymbol[symbol].length - 1]?.snapshotTime || getServerTime()).toISOString(),
          top_bid: topBid,
          top_ask: topAsk,
          spread: spread
        };

        // metadata الخاص بالعملة
        const symbolFinish = nowIso();
        const metadata = buildSymbolMetadata(symbol, symbolStart, symbolFinish, {
          files: [...filesCreated, `${symbol}/metadata.json`],
          counts,
          execution_rules: exchangeInfoMap[symbol] || {},
          candles_status: klineData.candlesStatus,
          large_trade_activity: tradesInfo.largeTradeStats,
          derived_metrics_overview: {
            bias_1d: derivedMetrics.trend_snapshot?.bias_1d || "unknown",
            bias_4h: derivedMetrics.trend_snapshot?.bias_4h || "unknown",
            bias_1h: derivedMetrics.trend_snapshot?.bias_1h || "unknown",
            bias_15m: derivedMetrics.trend_snapshot?.bias_15m || "unknown",
            execution_window_status: derivedMetrics.execution_window?.status || "unknown",
            nearest_support: derivedMetrics.execution_window?.reference_support || null,
            nearest_resistance: derivedMetrics.execution_window?.reference_resistance || null
          },
          execution_check: {
            status: executionCheck.status,
            rounded_quantity: executionCheck.rounded_quantity,
            estimated_notional: executionCheck.estimated_notional
          },
          summary: symbolSummary,
          notes: [{
            type: "recent_trades_window",
            source_endpoint: tradesInfo.endpoint,
            is_aggregated: tradesInfo.isAggregated,
            kept_trades: tradesInfo.keptTrades,
            raw_trades_fetched: tradesInfo.rawTradesFetched,
            window_start_iso: tradesInfo.windowStartIso,
            window_end_iso: tradesInfo.windowEndIso,
            slice_ms: tradesInfo.sliceMs,
            truncated_slices: tradesInfo.truncatedSlices
          }]
        });

        const metadataFileName = `${symbol}/metadata.json`;
        zip.file(metadataFileName, safeJsonStringify(metadata));
        filesCreated.push(metadataFileName);


        // Sanity checks
        const hasBookTicker = filesCreated.includes(`${symbol}/book_ticker.json`);
        const hasMetadata = filesCreated.includes(`${symbol}/metadata.json`);
        const hasDerivedMetrics = filesCreated.includes(`${symbol}/derived_metrics.json`);
        const hasExecutionCheck = filesCreated.includes(`${symbol}/execution_check.json`);
        const noEmptyFiles = Object.values(counts).every(c => c > 0);
        
        const sanityChecksPassed = hasBookTicker && hasMetadata && hasDerivedMetrics && hasExecutionCheck && noEmptyFiles;

        allBundleFiles.push(...filesCreated);

        symbolResults.push({
          symbol,
          status: sanityChecksPassed ? "success" : "warning",
          started_at: symbolStart,
          finished_at: symbolFinish,
          files_created: filesCreated,
          counts,
          sanity_checks: {
            has_book_ticker: hasBookTicker,
            has_metadata: hasMetadata,
            has_derived_metrics: hasDerivedMetrics,
            has_execution_check: hasExecutionCheck,
            no_empty_files: noEmptyFiles
          }
        });

        symbolArtifacts[symbol] = {
          filesCreated,
          counts,
          metadata,
          tickerCollectedAt: tickerInfo.collectedAt,
          bookTickerCollectedAt: bookTickerInfo.collectedAt
        };

        if (!sanityChecksPassed) {
          appendStatus(`⚠️ ${symbol}: تحذير، بعض فحوصات السلامة لم تجتز.`);
        }


        appendStatus(`${symbol}: تم بنجاح.`);
        advanceSymbolProgress(symbol);

      } catch (symbolErr) {
        const symbolFinish = nowIso();
        symbolResults.push({
          symbol,
          status: "error",
          started_at: symbolStart,
          finished_at: symbolFinish,
          error: String(symbolErr && symbolErr.message ? symbolErr.message : symbolErr)
        });
        appendStatus(`${symbol}: حدث خطأ - ${symbolErr.message || symbolErr}`);
        completeSymbolProgress(symbol);
      }
    });

    await Promise.all(symbolTasks);

    // ترتيب النتائج بنفس ترتيب SYMBOLS
    symbolResults.sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));

    // 4) لقطة سوق ختامية موحدة قرب إغلاق الحزمة
    appendStatus("جمع لقطة سوق ختامية موحدة...");
    const finalMarketSnapshotCapturedAt = nowIso();
    const finalSnapshotTasks = SYMBOLS.map(async (symbol) => {
      const [finalBookTicker, finalTicker24h] = await Promise.all([
        fetchBookTicker(symbol),
        fetchTicker24h(symbol)
      ]);

      const snapshotPayload = buildFinalMarketSnapshot(
        symbol,
        finalMarketSnapshotCapturedAt,
        finalBookTicker,
        finalTicker24h,
        {
          book_ticker_collected_at: symbolArtifacts[symbol]?.bookTickerCollectedAt || null,
          ticker_24h_collected_at: symbolArtifacts[symbol]?.tickerCollectedAt || null
        }
      );

      const snapshotFileName = `${symbol}/final_market_snapshot.json`;
      zip.file(snapshotFileName, safeJsonStringify(snapshotPayload));

      const artifact = symbolArtifacts[symbol];
      if (artifact) {
        artifact.filesCreated.push(snapshotFileName);
        artifact.counts["final_market_snapshot"] = 1;
        artifact.metadata.final_market_snapshot = {
          captured_at: finalMarketSnapshotCapturedAt,
          latest_price: snapshotPayload.summary.latest_price,
          book_ticker_staleness_ms: snapshotPayload.staleness_vs_initial_collection_ms.book_ticker,
          ticker_24h_staleness_ms: snapshotPayload.staleness_vs_initial_collection_ms.ticker_24h
        };

        const metadataFileName = `${symbol}/metadata.json`;
        zip.file(metadataFileName, safeJsonStringify(artifact.metadata));

        const symbolResult = symbolResults.find((item) => item.symbol === symbol);
        if (symbolResult) {
          symbolResult.files_created = [...artifact.filesCreated];
          symbolResult.counts = { ...artifact.counts };
        }
      }
    });
    await Promise.all(finalSnapshotTasks);

    // 5) manifest العام
    const manifestFinish = nowIso();
    const manifestFileName = "manifest.json";
    const filesIncluded = [
      ...new Set([
        ...allBundleFiles,
        ...SYMBOLS.flatMap((symbol) => symbolArtifacts[symbol]?.filesCreated || []),
        manifestFileName
      ])
    ];
    const manifest = buildManifest(
      overallStart,
      manifestFinish,
      getServerTime(),
      SYMBOLS,
      symbolResults,
      commonRecentTradesWindow,
      filesIncluded,
      {
        included: true,
        captured_at: finalMarketSnapshotCapturedAt
      }
    );
    zip.file(manifestFileName, safeJsonStringify(manifest));
    allBundleFiles.push(manifestFileName);

    // 6) إنشاء ZIP
    appendStatus("جاري إنشاء ملف ZIP...");
    const blob = await zip.generateAsync({ type: "blob" });

    const bundleFileName = `market_bundle_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = bundleFileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const successCount = symbolResults.filter(x => x.status === "success").length;
    const errorCount = symbolResults.filter(x => x.status === "error").length;

    appendStatus("تم إنشاء الحزمة وتنزيلها بنجاح.");
    updateProgress(totalProgressSteps, totalProgressSteps); // Force 100%

    setSummaryOk(`
      <strong>تم إنشاء الحزمة.</strong><br>
      اسم الملف: <code class="inline">${bundleFileName}</code><br>
      العملات الناجحة: ${successCount} / ${SYMBOLS.length}<br>
      العملات التي حدث فيها خطأ: ${errorCount}<br>
      وقت البدء: ${overallStart}<br>
      وقت الانتهاء: ${nowIso()}
    `);
  } catch (err) {
    appendStatus(`فشل إنشاء الحزمة: ${err.message || err}`);
    setSummaryErr(`
      <strong>فشل إنشاء الحزمة.</strong><br>
      السبب: ${String(err && err.message ? err.message : err)}
    `);
  } finally {
    buildBtn.disabled = false;
  }
}

// =========================
// ربط الأزرار
// =========================
buildBtn.addEventListener("click", buildMarketBundle);

clearBtn.addEventListener("click", () => {
  logLines.length = 0;
  statusLog.innerHTML = "جاهز.";
  clearSummary();
  resetProgress();
});

async function copyPromptFile(filePath, button, successLabel, statusMessage) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error(`فشل تحميل الملف: ${filePath}`);
    }
    const text = await response.text();
    await navigator.clipboard.writeText(text);
    
    const originalText = button.textContent;
    const originalBackground = button.style.background;
    button.textContent = successLabel;
    button.style.background = "#059669";
    
    setTimeout(() => {
      button.textContent = originalText;
      button.style.background = originalBackground;
    }, 2000);
    
    appendStatus(statusMessage);
  } catch (err) {
    appendStatus(`فشل النسخ: ${err.message || err}`);
    alert("فشل نسخ الملف: " + (err.message || err));
  }
}

copyPromptBtn.addEventListener("click", async () => {
  await copyPromptFile(
    "Prompt Master Spot.txt",
    copyPromptBtn,
    "تم النسخ!",
    "تم نسخ البرومبت الرئيسي (Master Spot) إلى الحافظة."
  );
});

copyFastPromptBtn.addEventListener("click", async () => {
  await copyPromptFile(
    "Prompt Fast Scan.txt",
    copyFastPromptBtn,
    "تم النسخ!",
    "تم نسخ البرومبت السريع (Fast Scan) إلى الحافظة."
  );
});

copyPrompt2Btn.addEventListener("click", async () => {
  await copyPromptFile(
    "Prompt Strict Backup.txt",
    copyPrompt2Btn,
    "تم النسخ!",
    "تم نسخ البرومبت الاحتياطي (Strict Backup) إلى الحافظة."
  );
});

const copyOtocoBtn = document.getElementById("copyOtocoBtn");
copyOtocoBtn.addEventListener("click", async () => {
  await copyPromptFile(
    "otoco_prompt.md",
    copyOtocoBtn,
    "تم النسخ!",
    "تم نسخ برومبت OTOCO إلى الحافظة."
  );
});

