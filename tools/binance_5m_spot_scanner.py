#!/usr/bin/env python3
"""
Binance Spot 5m momentum scanner.

What it does:
- Fetches active SPOT USDT pairs from Binance
- Filters liquid pairs by 24h quote volume
- Filters wide spreads using bookTicker
- Pulls recent 5m klines
- Detects strong bullish candles based on:
  * 5m candle % change
  * close near high
  * body/range quality
  * volume ratio vs previous candles
  * breakout above recent highs

No API key is required because it uses public market-data endpoints.
Default base URL is https://data-api.binance.vision

Usage:
    python binance_5m_spot_scanner.py

Optional environment variables:
    BINANCE_BASE_URL=https://data-api.binance.vision
    BINANCE_RUN_FOREVER=true
    BINANCE_SCAN_EVERY_SECONDS=60
    BINANCE_TOP_N=30
    BINANCE_ONLY_NEW_CANDLES=true
    BINANCE_POST_CLOSE_BUFFER_SECONDS=2
"""

from __future__ import annotations

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from statistics import mean
from threading import local
from typing import Any

import requests
from requests.adapters import HTTPAdapter


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return float(value)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    base_url: str
    interval: str
    quote_asset: str
    exclude_leveraged_tokens: bool
    leveraged_suffixes: tuple[str, ...]
    min_24h_quote_volume: float
    max_spread_pct: float
    candle_change_pct_min: float
    range_pct_min: float
    volume_lookback: int
    volume_ratio_min: float
    breakout_lookback: int
    max_close_from_high_pct: float
    min_body_to_range_ratio: float
    max_workers: int
    request_timeout: int
    retries: int
    run_forever: bool
    scan_every_seconds: int
    top_n: int
    only_new_candles: bool
    post_close_buffer_seconds: int


@dataclass(frozen=True)
class Signal:
    symbol: str
    price: float
    candle_change_pct: float
    range_pct: float
    volume_ratio: float
    spread_pct: float
    close_from_high_pct: float
    breakout: bool
    entry: float
    stop: float
    take_profit_1r: float
    take_profit_2r: float
    candle_open_time_ms: int


@dataclass(frozen=True)
class ScanReport:
    total_symbols: int
    liquid_symbols: int
    tradable_symbols: int
    signals: list[Signal]
    elapsed_seconds: float
    candle_open_time_ms: int | None


class ScanError(RuntimeError):
    pass


def load_settings() -> Settings:
    return Settings(
        base_url=os.getenv("BINANCE_BASE_URL", "https://data-api.binance.vision").rstrip("/"),
        interval=os.getenv("BINANCE_INTERVAL", "5m"),
        quote_asset=os.getenv("BINANCE_QUOTE_ASSET", "USDT"),
        exclude_leveraged_tokens=env_bool("BINANCE_EXCLUDE_LEVERAGED_TOKENS", True),
        leveraged_suffixes=("UP", "DOWN", "BULL", "BEAR"),
        min_24h_quote_volume=env_float("BINANCE_MIN_24H_QUOTE_VOLUME", 500_000.0),
        max_spread_pct=env_float("BINANCE_MAX_SPREAD_PCT", 1.00),
        candle_change_pct_min=env_float("BINANCE_CANDLE_CHANGE_PCT_MIN", 0.6),
        range_pct_min=env_float("BINANCE_RANGE_PCT_MIN", 0.8),
        volume_lookback=max(env_int("BINANCE_VOLUME_LOOKBACK", 10), 2),
        volume_ratio_min=env_float("BINANCE_VOLUME_RATIO_MIN", 1.1),
        breakout_lookback=max(env_int("BINANCE_BREAKOUT_LOOKBACK", 5), 2),
        max_close_from_high_pct=env_float("BINANCE_MAX_CLOSE_FROM_HIGH_PCT", 1.5),
        min_body_to_range_ratio=env_float("BINANCE_MIN_BODY_TO_RANGE_RATIO", 0.20),
        max_workers=max(env_int("BINANCE_MAX_WORKERS", 8), 1),
        request_timeout=max(env_int("BINANCE_REQUEST_TIMEOUT", 12), 1),
        retries=max(env_int("BINANCE_RETRIES", 3), 1),
        run_forever=env_bool("BINANCE_RUN_FOREVER", True),
        scan_every_seconds=max(env_int("BINANCE_SCAN_EVERY_SECONDS", 60), 1),
        top_n=max(env_int("BINANCE_TOP_N", 30), 1),
        only_new_candles=env_bool("BINANCE_ONLY_NEW_CANDLES", True),
        post_close_buffer_seconds=max(env_int("BINANCE_POST_CLOSE_BUFFER_SECONDS", 2), 0),
    )


SETTINGS = load_settings()

_THREAD_LOCAL = local()


def build_session(settings: Settings) -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": "binance-spot-5m-scanner/1.3"})

    adapter = HTTPAdapter(
        pool_connections=settings.max_workers,
        pool_maxsize=max(settings.max_workers * 2, 8),
        max_retries=0,
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


def get_session(settings: Settings) -> requests.Session:
    session_cache = getattr(_THREAD_LOCAL, "session_cache", None)
    if session_cache is None:
        session_cache = {}
        _THREAD_LOCAL.session_cache = session_cache

    session = session_cache.get(settings)
    if session is None:
        session = build_session(settings)
        session_cache[settings] = session
    return session


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def interval_to_seconds(interval: str) -> int | None:
    if len(interval) < 2:
        return None

    unit = interval[-1].lower()
    value_text = interval[:-1]
    if not value_text.isdigit():
        return None

    value = int(value_text)
    multipliers = {
        "s": 1,
        "m": 60,
        "h": 3600,
        "d": 86400,
        "w": 604800,
    }
    multiplier = multipliers.get(unit)
    if multiplier is None:
        return None
    return value * multiplier


def required_kline_limit(settings: Settings) -> int:
    return max(settings.volume_lookback + 2, settings.breakout_lookback + 2, 25)


def infer_latest_closed_candle_open_time_ms(settings: Settings) -> int | None:
    interval_seconds = interval_to_seconds(settings.interval)
    if not interval_seconds:
        return None

    now_seconds = int(time.time())
    candle_index = (now_seconds // interval_seconds) - 1
    if candle_index < 0:
        return None
    return candle_index * interval_seconds * 1000


def format_timestamp_ms(timestamp_ms: int | None) -> str:
    if timestamp_ms is None:
        return "unknown"
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp_ms / 1000))


def fetch_json(path: str, params: dict[str, Any] | None = None, *, settings: Settings = SETTINGS) -> Any:
    url = f"{settings.base_url}{path}"
    last_error: Exception | None = None
    session = get_session(settings)

    for attempt in range(1, settings.retries + 1):
        try:
            response = session.get(url, params=params, timeout=settings.request_timeout)

            if response.status_code == 429:
                retry_after = safe_float(response.headers.get("Retry-After"), default=0.0)
                sleep_for = retry_after if retry_after > 0 else 2.0 * attempt
                time.sleep(sleep_for)
                continue

            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt < settings.retries:
                time.sleep(1.2 * attempt)
                continue
            raise ScanError(f"GET {url} failed: {exc}") from exc

    raise ScanError(f"GET {url} failed: {last_error}")


def is_leveraged_symbol(base_asset: str, *, settings: Settings = SETTINGS) -> bool:
    return settings.exclude_leveraged_tokens and base_asset.endswith(settings.leveraged_suffixes)


def get_symbol_map(
    path: str,
    symbols: list[str],
    params: dict[str, Any] | None = None,
    *,
    settings: Settings = SETTINGS,
) -> dict[str, dict[str, Any]]:
    requested = set(symbols)
    data = fetch_json(path, params=params, settings=settings)

    if isinstance(data, dict):
        data = [data]

    return {
        item["symbol"]: item
        for item in data
        if item.get("symbol") in requested
    }


def get_spot_quote_symbols(settings: Settings = SETTINGS) -> list[str]:
    data = fetch_json(
        "/api/v3/exchangeInfo",
        params={
            "permissions": "SPOT",
            "symbolStatus": "TRADING",
            "showPermissionSets": "false",
        },
        settings=settings,
    )

    symbols: list[str] = []
    for symbol_info in data.get("symbols", []):
        if symbol_info.get("quoteAsset") != settings.quote_asset:
            continue
        if symbol_info.get("status") != "TRADING":
            continue
        if not symbol_info.get("isSpotTradingAllowed", False):
            continue
        if is_leveraged_symbol(symbol_info.get("baseAsset", ""), settings=settings):
            continue
        symbols.append(symbol_info["symbol"])

    return sorted(symbols)


def get_24h_stats(symbols: list[str], *, settings: Settings = SETTINGS) -> dict[str, dict[str, Any]]:
    return get_symbol_map(
        "/api/v3/ticker/24hr",
        symbols,
        params={"symbolStatus": "TRADING"},
        settings=settings,
    )


def get_book_tickers(symbols: list[str], *, settings: Settings = SETTINGS) -> dict[str, dict[str, Any]]:
    return get_symbol_map(
        "/api/v3/ticker/bookTicker",
        symbols,
        params={"symbolStatus": "TRADING"},
        settings=settings,
    )


def filter_liquid_symbols(
    symbols: list[str],
    stats_24h: dict[str, dict[str, Any]],
    *,
    settings: Settings = SETTINGS,
) -> list[str]:
    liquid_symbols: list[str] = []
    for symbol in symbols:
        stat = stats_24h.get(symbol)
        if not stat:
            continue
        if safe_float(stat.get("quoteVolume")) >= settings.min_24h_quote_volume:
            liquid_symbols.append(symbol)
    return liquid_symbols


def filter_tradable_symbols(
    symbols: list[str],
    book_tickers: dict[str, dict[str, Any]],
    *,
    settings: Settings = SETTINGS,
) -> tuple[list[str], dict[str, float]]:
    tradable_symbols: list[str] = []
    spreads: dict[str, float] = {}

    for symbol in symbols:
        item = book_tickers.get(symbol)
        if not item:
            continue

        bid = safe_float(item.get("bidPrice"))
        ask = safe_float(item.get("askPrice"))
        if bid <= 0 or ask <= 0 or ask <= bid:
            continue

        spread_pct = ((ask - bid) / ask) * 100.0
        if spread_pct <= settings.max_spread_pct:
            tradable_symbols.append(symbol)
            spreads[symbol] = spread_pct

    return tradable_symbols, spreads


def compute_signal(symbol: str, spread_pct: float, *, settings: Settings = SETTINGS) -> Signal | None:
    klines = fetch_json(
        "/api/v3/klines",
        params={
            "symbol": symbol,
            "interval": settings.interval,
            "limit": required_kline_limit(settings),
        },
        settings=settings,
    )

    min_required = max(settings.volume_lookback + 2, settings.breakout_lookback + 2)
    if len(klines) < min_required:
        return None

    closed_klines = klines[:-1]
    signal_candle = closed_klines[-1]
    previous_for_volume = closed_klines[-(settings.volume_lookback + 1) : -1]
    previous_for_breakout = closed_klines[-(settings.breakout_lookback + 1) : -1]

    if len(previous_for_volume) < settings.volume_lookback:
        return None
    if len(previous_for_breakout) < settings.breakout_lookback:
        return None

    candle_open_time_ms = int(signal_candle[0])
    open_price = safe_float(signal_candle[1])
    high_price = safe_float(signal_candle[2])
    low_price = safe_float(signal_candle[3])
    close_price = safe_float(signal_candle[4])
    volume = safe_float(signal_candle[5])

    if min(open_price, high_price, low_price, close_price) <= 0:
        return None
    if close_price <= open_price:
        return None

    candle_change_pct = ((close_price - open_price) / open_price) * 100.0
    range_pct = ((high_price - low_price) / low_price) * 100.0 if low_price > 0 else 0.0
    close_from_high_pct = ((high_price - close_price) / high_price) * 100.0 if high_price > 0 else 999.0
    body_to_range_ratio = abs(close_price - open_price) / max(high_price - low_price, 1e-12)

    previous_volumes = [safe_float(item[5]) for item in previous_for_volume]
    average_previous_volume = mean(previous_volumes) if previous_volumes else 0.0
    if average_previous_volume <= 0:
        return None

    volume_ratio = volume / average_previous_volume
    previous_highs = [safe_float(item[2]) for item in previous_for_breakout]
    breakout_level = max(previous_highs) if previous_highs else 0.0
    breakout = close_price > breakout_level

    if candle_change_pct < settings.candle_change_pct_min:
        return None
    if range_pct < settings.range_pct_min:
        return None
    if volume_ratio < settings.volume_ratio_min:
        return None
    if close_from_high_pct > settings.max_close_from_high_pct:
        return None
    if body_to_range_ratio < settings.min_body_to_range_ratio:
        return None
    if not breakout:
        return None

    entry = high_price * 1.001
    stop = low_price * 0.999
    risk = entry - stop
    if risk <= 0:
        return None

    return Signal(
        symbol=symbol,
        price=close_price,
        candle_change_pct=candle_change_pct,
        range_pct=range_pct,
        volume_ratio=volume_ratio,
        spread_pct=spread_pct,
        close_from_high_pct=close_from_high_pct,
        breakout=breakout,
        entry=entry,
        stop=stop,
        take_profit_1r=entry + risk,
        take_profit_2r=entry + (2 * risk),
        candle_open_time_ms=candle_open_time_ms,
    )


def rank_signals(signals: list[Signal]) -> list[Signal]:
    return sorted(
        signals,
        key=lambda signal: (
            signal.candle_change_pct,
            signal.volume_ratio,
            -signal.spread_pct,
        ),
        reverse=True,
    )


def resolve_report_candle_time(signals: list[Signal], settings: Settings) -> int | None:
    if signals:
        return max(signal.candle_open_time_ms for signal in signals)
    return infer_latest_closed_candle_open_time_ms(settings)


def scan_once(settings: Settings = SETTINGS) -> ScanReport:
    started_at = time.perf_counter()
    symbols = get_spot_quote_symbols(settings)
    if not symbols:
        return ScanReport(0, 0, 0, [], time.perf_counter() - started_at, infer_latest_closed_candle_open_time_ms(settings))

    stats_24h = get_24h_stats(symbols, settings=settings)
    liquid_symbols = filter_liquid_symbols(symbols, stats_24h, settings=settings)
    if not liquid_symbols:
        return ScanReport(
            len(symbols),
            0,
            0,
            [],
            time.perf_counter() - started_at,
            infer_latest_closed_candle_open_time_ms(settings),
        )

    book_tickers = get_book_tickers(liquid_symbols, settings=settings)
    tradable_symbols, spreads = filter_tradable_symbols(liquid_symbols, book_tickers, settings=settings)

    signals: list[Signal] = []
    with ThreadPoolExecutor(max_workers=settings.max_workers) as pool:
        futures = {
            pool.submit(compute_signal, symbol, spreads[symbol], settings=settings): symbol
            for symbol in tradable_symbols
        }
        for future in as_completed(futures):
            symbol = futures[future]
            try:
                signal = future.result()
            except Exception as exc:
                print(f"[warn] {symbol}: {exc}", file=sys.stderr)
                continue
            if signal is not None:
                signals.append(signal)

    ranked_signals = rank_signals(signals)
    return ScanReport(
        total_symbols=len(symbols),
        liquid_symbols=len(liquid_symbols),
        tradable_symbols=len(tradable_symbols),
        signals=ranked_signals,
        elapsed_seconds=time.perf_counter() - started_at,
        candle_open_time_ms=resolve_report_candle_time(ranked_signals, settings),
    )


def format_price(value: float) -> str:
    abs_value = abs(value)
    if abs_value >= 1000:
        precision = 2
    elif abs_value >= 100:
        precision = 3
    elif abs_value >= 1:
        precision = 4
    elif abs_value >= 0.01:
        precision = 6
    else:
        precision = 8
    return f"{value:.{precision}f}"


def print_signals(report: ScanReport, *, settings: Settings = SETTINGS) -> None:
    print(
        "Universe: "
        f"{report.total_symbols} symbols | "
        f"{report.liquid_symbols} liquid | "
        f"{report.tradable_symbols} tradable | "
        f"{len(report.signals)} signals | "
        f"{report.elapsed_seconds:.2f}s | "
        f"candle {format_timestamp_ms(report.candle_open_time_ms)}"
    )

    if not report.signals:
        print("No matching symbols right now.")
        return

    header = (
        f"{'Symbol':<14} {'Price':>12} {'5m%':>7} {'Range%':>8} {'Vol x':>7} "
        f"{'Spread%':>8} {'NearHigh%':>10} {'Entry':>12} {'Stop':>12} {'TP2R':>12}"
    )
    print(header)
    print("-" * len(header))

    for signal in report.signals[: settings.top_n]:
        print(
            f"{signal.symbol:<14} "
            f"{format_price(signal.price):>12} "
            f"{signal.candle_change_pct:>7.2f} "
            f"{signal.range_pct:>8.2f} "
            f"{signal.volume_ratio:>7.2f} "
            f"{signal.spread_pct:>8.3f} "
            f"{signal.close_from_high_pct:>10.3f} "
            f"{format_price(signal.entry):>12} "
            f"{format_price(signal.stop):>12} "
            f"{format_price(signal.take_profit_2r):>12}"
        )


def print_duplicate_cycle_notice(report: ScanReport, *, settings: Settings = SETTINGS) -> None:
    print(
        f"Universe: {report.total_symbols} symbols | "
        f"{report.liquid_symbols} liquid | "
        f"{report.tradable_symbols} tradable | "
        f"scan {report.elapsed_seconds:.2f}s"
    )
    print(
        f"Closed candle {format_timestamp_ms(report.candle_open_time_ms)} already shown; "
        f"waiting for the next {settings.interval} candle."
    )


def sleep_until_next_cycle(started_at: float, settings: Settings = SETTINGS) -> None:
    interval_seconds = interval_to_seconds(settings.interval)
    if interval_seconds:
        now_seconds = time.time()
        next_boundary_seconds = ((int(now_seconds) // interval_seconds) + 1) * interval_seconds
        wake_up_at = next_boundary_seconds + settings.post_close_buffer_seconds
        remaining_seconds = max(wake_up_at - now_seconds, 0.0)
    else:
        elapsed_seconds = time.time() - started_at
        remaining_seconds = max(settings.scan_every_seconds - elapsed_seconds, 0.0)

    if remaining_seconds > 0:
        time.sleep(remaining_seconds)


def print_banner(settings: Settings = SETTINGS) -> None:
    print(f"Base URL: {settings.base_url}")
    if interval_to_seconds(settings.interval):
        print(
            f"Scanning Binance Spot {settings.quote_asset} pairs on closed {settings.interval} candles..."
        )
        print(
            f"Next scans are aligned to candle closes with a {settings.post_close_buffer_seconds}s buffer.\n"
        )
    else:
        print(
            f"Scanning Binance Spot {settings.quote_asset} pairs on {settings.interval} "
            f"every {settings.scan_every_seconds}s...\n"
        )


def main(settings: Settings = SETTINGS) -> None:
    print_banner(settings)

    if not settings.run_forever:
        print_signals(scan_once(settings), settings=settings)
        return

    last_printed_candle_open_time_ms: int | None = None

    while True:
        cycle_started_at = time.time()
        print(time.strftime("[%Y-%m-%d %H:%M:%S]"), flush=True)
        try:
            report = scan_once(settings)
            is_new_candle = report.candle_open_time_ms != last_printed_candle_open_time_ms
            if not settings.only_new_candles or is_new_candle:
                print_signals(report, settings=settings)
                last_printed_candle_open_time_ms = report.candle_open_time_ms
            else:
                print_duplicate_cycle_notice(report, settings=settings)
        except Exception as exc:
            print(f"[error] scan failed: {exc}", file=sys.stderr)
        print()
        sleep_until_next_cycle(cycle_started_at, settings)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped by user.")

