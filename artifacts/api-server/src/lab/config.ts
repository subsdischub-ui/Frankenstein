export const VERSION = "frankenstein-baseline-1";
export const INITIAL_CAPITAL = 10000;
export const M15 = 900000;
export const H4 = 14400000;
export const RISK = Object.freeze({
  riskPerTrade: 0.005, maxOpenRisk: 0.015, maxPositions: 3,
  maxExposure: 0.6, maxAssetExposure: 0.2, dailyLossLimit: 0.02,
  drawdownLimit: 0.08, feeRate: 0.001, slippageRate: 0.0005,
  rewardRisk: 3, maxHoldingHours: 24,
});
export const PARAMS = Object.freeze({ volumeRatio: 3, rsiMax: 40, expiryBars: 32 });
export const FEATURE_ORDER = ["volumeRatio", "relativeStrength", "compression", "rsi", "vwapGap", "deltaOi", "fundingRate", "cvd", "btcShock"];