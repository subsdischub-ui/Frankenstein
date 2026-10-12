const checks = [
  ["Spot exchange", "https://data-api.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT"],
  ["Spot ticker", "https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT"],
  ["Spot M15", "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=3"],
  ["Spot H4", "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=3"],
  ["Spot BTC 1m", "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=3"],
  ["Spot carnet", "https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5"],
  ["Futures premium", "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"],
  ["Futures OI", "https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=3"],
];
let failed = false;
for (const [label, url] of checks) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data || (Array.isArray(data) && data.length === 0) || data.code < 0) throw new Error("JSON vide ou erreur Binance.");
    if (label === "Futures OI" && (data.length !== 3 || Date.now() - data.at(-1).timestamp > 7200000))
      throw new Error("OI insuffisant ou périmé.");
    console.log(`${label} : OK`);
  } catch (e) { failed = true; console.error(`${label} : ÉCHEC ${e.message}`); }
}
if (failed) console.error("Ne pas activer le paper avant diagnostic. Aucun contournement ni ordre émis.");
process.exitCode = failed ? 1 : 0;
