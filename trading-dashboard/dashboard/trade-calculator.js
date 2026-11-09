/**
 * Spot trade position calculator.
 * Pure function, no side effects.
 * Ported from 1__radar_crepto/js/trade-calculator.mjs
 */
export function parseNumericInput(value) {
  const raw = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[\u2019']/g, '');
  if (!raw) return null;

  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');
  let normalized = raw;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (hasComma) {
    const usGrouping = /^\d{1,3}(,\d{3})+$/.test(raw);
    normalized = usGrouping ? raw.replace(/,/g, '') : raw.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toN(v) {
  return parseNumericInput(v);
}

export function calculateSpotTrade({
  amount,
  feePct = 0.1,
  buyFeePct = feePct,
  sellFeePct = feePct,
  entry,
  stop,
  target,
}) {
  const tradeAmount = toN(amount);
  const entryPrice = toN(entry);
  const stopPrice = toN(stop);
  const targetPrice = toN(target);
  const buyFeePctNum = toN(buyFeePct);
  const sellFeePctNum = toN(sellFeePct);
  const buyFeeRate = buyFeePctNum / 100;
  const sellFeeRate = sellFeePctNum / 100;

  if (
    !Number.isFinite(tradeAmount) || tradeAmount <= 0
    || !Number.isFinite(entryPrice) || entryPrice <= 0
    || !Number.isFinite(buyFeePctNum) || buyFeePctNum < 0 || buyFeePctNum > 100
    || !Number.isFinite(sellFeePctNum) || sellFeePctNum < 0 || sellFeePctNum > 100
    || !Number.isFinite(buyFeeRate) || buyFeeRate < 0 || buyFeeRate > 1
    || !Number.isFinite(sellFeeRate) || sellFeeRate < 0 || sellFeeRate >= 1
  ) return null;

  const qty = tradeAmount / entryPrice;
  const buyFeeQty = qty * buyFeeRate;
  const qtyAfterBuy = qty - buyFeeQty;
  if (!Number.isFinite(qtyAfterBuy) || qtyAfterBuy <= 0) return null;

  const buyFeeAmount = buyFeeQty * entryPrice;
  const breakeven = qtyAfterBuy > 0
    ? tradeAmount / (qtyAfterBuy * (1 - sellFeeRate))
    : null;

  const targetGross = Number.isFinite(targetPrice) && targetPrice > 0 ? qtyAfterBuy * targetPrice : null;
  const targetSellFee = Number.isFinite(targetGross) ? targetGross * sellFeeRate : null;
  const targetNet = Number.isFinite(targetGross) ? targetGross - targetSellFee : null;
  const rewardAmount = Number.isFinite(targetNet) ? targetNet - tradeAmount : null;

  const stopGross = Number.isFinite(stopPrice) && stopPrice > 0 ? qtyAfterBuy * stopPrice : null;
  const stopSellFee = Number.isFinite(stopGross) ? stopGross * sellFeeRate : null;
  const stopNet = Number.isFinite(stopGross) ? stopGross - stopSellFee : null;
  const riskAmount = Number.isFinite(stopNet) ? tradeAmount - stopNet : null;

  const riskReward =
    Number.isFinite(riskAmount) && riskAmount > 0
    && Number.isFinite(rewardAmount) && rewardAmount > 0
      ? rewardAmount / riskAmount
      : null;

  return {
    qty,
    buyFeeAmount,
    qtyAfterBuy,
    breakeven,
    targetGross,
    targetSellFee,
    targetNet,
    rewardAmount,
    stopGross,
    stopSellFee,
    stopNet,
    riskAmount,
    riskReward,
  };
}
