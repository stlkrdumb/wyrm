#!/usr/bin/env python3
"""
CLI wrapper for technical analysis — called from Node.js.

Usage:
  python cli.py '{"symbol":"BTCUSDT","ohlcvs":[[1700000000,50000,51000,49500,50800,100]]}'
"""
import json
import sys
import os

# Add this script's directory to the path so imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kline_indicator_utils import IndicatorManager


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python cli.py '<json_with_ohlcvs>'"}))
        sys.exit(1)

    try:
        input_data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    ohlcvs = input_data.get("ohlcvs")
    if not ohlcvs:
        print(json.dumps({"error": "Missing 'ohlcvs' array. Expected: {'symbol':'BTCUSDT', 'ohlcvs': [[timestamp, open, high, low, close, volume], ...]}"}))
        sys.exit(1)

    # Build DataFrame — accept 6 or 8 cols dynamically
    import pandas as pd
    if len(ohlcvs[0]) >= 8:
        df = pd.DataFrame(ohlcvs, columns=["timestamp", "open", "high", "low", "close", "volume", "quoteVol", "amount"])
    else:
        df = pd.DataFrame(ohlcvs, columns=["timestamp", "open", "high", "low", "close", "volume"])
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = df[col].astype(float)

    # Default indicators if none specified
    config = input_data.get("indicators", {
        "MACD": {"fast": 12, "slow": 26, "signal": 9},
        "RSI": {"period": 14},
        "BOLL": {"period": 20, "std_dev": 2},
    })

    try:
        manager = IndicatorManager(show_indicators=False)
        output = manager.calculate_and_export(config, df, tail=50)
        if input_data.get("symbol"):
            output["symbol"] = input_data["symbol"]
        print(json.dumps(output, indent=2))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
