"""Point-in-time CSI 300/500 research pipeline with survivorship controls.

This is an evaluation utility, not a trading system. Download and evaluation
are separate so the raw provider snapshot remains immutable and auditable.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "evidence" / "cn-market-data"
REPORT = ROOT / "evidence" / "cn-universe-evaluation.json"
FIELDS = "date,code,open,high,low,close,preclose,volume,amount,adjustflag,tradestatus,pctChg,isST"


def quarter_ends(start: str, end: str, trading_days: list[str]) -> list[str]:
    open_days = pd.to_datetime(trading_days)
    snapshots: list[str] = []
    for value in pd.date_range(start, end, freq="QE"):
        eligible = open_days[open_days <= value]
        if len(eligible):
            snapshots.append(eligible[-1].strftime("%Y-%m-%d"))
    return sorted(set(snapshots))


def fetch_rows(result) -> list[list[str]]:
    rows: list[list[str]] = []
    if result.error_code != "0":
        raise RuntimeError(f"provider query failed: {result.error_code} {result.error_msg}")
    while result.next():
        rows.append(result.get_row_data())
    return rows


def download(start: str, end: str, limit: int | None) -> None:
    try:
        import baostock as bs
    except ImportError as exc:
        raise SystemExit("Install requirements-market.txt before downloading.") from exc
    DATA.mkdir(parents=True, exist_ok=True)
    login = bs.login()
    if login.error_code != "0":
        raise SystemExit(f"DATA_DOWNLOAD_BLOCKED: BaoStock login failed ({login.error_code}). No market-data files were written.")
    try:
        calendar_result = bs.query_trade_dates(start_date=start, end_date=end)
        calendar_rows = fetch_rows(calendar_result)
        calendar = pd.DataFrame(calendar_rows, columns=calendar_result.fields)
        trading_days = calendar.loc[calendar["is_trading_day"] == "1", "calendar_date"].tolist()
        memberships: list[dict[str, str]] = []
        for snapshot in quarter_ends(start, end, trading_days):
            for index_name, query in (("CSI300", bs.query_hs300_stocks), ("CSI500", bs.query_zz500_stocks)):
                result = query(snapshot)
                for row in fetch_rows(result):
                    record = dict(zip(result.fields, row))
                    memberships.append({"snapshotDate": snapshot, "index": index_name, "code": record["code"], "codeName": record.get("code_name", "")})
        membership = pd.DataFrame(memberships).drop_duplicates()
        codes = sorted(membership["code"].unique())
        if limit is not None:
            codes = codes[:limit]
            membership = membership[membership["code"].isin(codes)]
        basics: list[dict[str, str]] = []
        prices: list[pd.DataFrame] = []
        for code in codes:
            basic_result = bs.query_stock_basic(code=code)
            basic_rows = fetch_rows(basic_result)
            if basic_rows:
                basics.append(dict(zip(basic_result.fields, basic_rows[0])))
            price_result = bs.query_history_k_data_plus(code, FIELDS, start_date=start, end_date=end, frequency="d", adjustflag="2")
            rows = fetch_rows(price_result)
            if rows:
                prices.append(pd.DataFrame(rows, columns=price_result.fields))
        benchmark_result = bs.query_history_k_data_plus("sh.000300", "date,code,close,preclose,pctChg", start_date=start, end_date=end, frequency="d", adjustflag="3")
        benchmark = pd.DataFrame(fetch_rows(benchmark_result), columns=benchmark_result.fields)
        membership.to_csv(DATA / "membership-history.csv", index=False, encoding="utf-8")
        pd.DataFrame(basics).to_csv(DATA / "security-master.csv", index=False, encoding="utf-8")
        pd.concat(prices, ignore_index=True).to_csv(DATA / "prices-forward-adjusted.csv", index=False, encoding="utf-8")
        benchmark.to_csv(DATA / "csi300-benchmark.csv", index=False, encoding="utf-8")
        manifest = {"provider": "BaoStock 0.8.9", "downloadedAt": pd.Timestamp.utcnow().isoformat(), "start": start, "end": end,
                    "adjustment": "forward adjusted (adjustflag=2); benchmark unadjusted", "membershipSnapshots": len(membership["snapshotDate"].unique()),
                    "securities": len(codes), "limitedPilot": limit is not None,
                    "important": "Historical quarterly membership union is retained; removed and delisted securities are not filtered out."}
        (DATA / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(manifest, ensure_ascii=False, indent=2))
    finally:
        bs.logout()


def limit_threshold(code: str, is_st: bool, day: pd.Timestamp) -> float:
    if is_st:
        return 4.8
    digits = code.split(".")[-1]
    if digits.startswith("688") or (digits.startswith("300") and day >= pd.Timestamp("2020-08-24")):
        return 19.8
    return 9.8


def max_drawdown(returns: pd.Series) -> float:
    equity = (1 + returns.fillna(0)).cumprod()
    return float((1 - equity / equity.cummax()).max())


def sharpe(returns: pd.Series) -> float:
    std = float(returns.std(ddof=0))
    return float(returns.mean() * 252 / (std * math.sqrt(252))) if std else 0.0


def bootstrap_sharpe_difference(strategy: pd.Series, benchmark: pd.Series, samples: int = 2000, block: int = 20) -> tuple[float, float]:
    paired = pd.concat([strategy, benchmark], axis=1).dropna().to_numpy()
    if len(paired) < block * 2:
        raise ValueError("not enough paired observations for block bootstrap")
    rng = np.random.default_rng(20260920)
    diffs: list[float] = []
    starts = np.arange(0, len(paired) - block + 1)
    blocks_needed = math.ceil(len(paired) / block)
    for _ in range(samples):
        chosen = rng.choice(starts, size=blocks_needed, replace=True)
        sample = np.concatenate([paired[start:start + block] for start in chosen], axis=0)[: len(paired)]
        diffs.append(sharpe(pd.Series(sample[:, 0])) - sharpe(pd.Series(sample[:, 1])))
    return tuple(float(value) for value in np.quantile(diffs, [0.025, 0.975]))


def evaluate() -> None:
    required = [DATA / name for name in ("membership-history.csv", "security-master.csv", "prices-forward-adjusted.csv", "csi300-benchmark.csv", "manifest.json")]
    missing = [path.name for path in required if not path.exists()]
    if missing:
        raise SystemExit("EVALUATION_BLOCKED: missing immutable input files: " + ", ".join(missing))
    membership = pd.read_csv(required[0], dtype=str)
    securities = pd.read_csv(required[1], dtype=str).fillna("")
    prices = pd.read_csv(required[2], dtype={"code": str})
    benchmark = pd.read_csv(required[3])
    manifest = json.loads(required[4].read_text(encoding="utf-8"))
    if manifest.get("limitedPilot"):
        raise SystemExit("EVALUATION_BLOCKED: limited pilot data cannot support a portfolio result.")
    for column in ("close", "preclose", "pctChg"):
        prices[column] = pd.to_numeric(prices[column], errors="coerce")
    prices["date"] = pd.to_datetime(prices["date"])
    prices["tradestatus"] = pd.to_numeric(prices["tradestatus"], errors="coerce").fillna(0).astype(int)
    prices["isST"] = pd.to_numeric(prices["isST"], errors="coerce").fillna(0).astype(int)
    prices = prices.sort_values(["code", "date"])
    prices["ret1"] = prices.groupby("code")["close"].pct_change()
    prices["momentum126"] = prices.groupby("code")["close"].pct_change(126)
    prices["vol20"] = prices.groupby("code")["ret1"].rolling(20).std().reset_index(level=0, drop=True)
    prices["forward20"] = prices.groupby("code")["close"].shift(-20) / prices["close"] - 1
    snapshots = sorted(pd.to_datetime(membership["snapshotDate"].unique()))
    strategy_returns: list[pd.Series] = []
    ic_rows: list[dict[str, float | str]] = []
    for snapshot in snapshots:
        eligible_codes = set(membership.loc[pd.to_datetime(membership["snapshotDate"]) == snapshot, "code"])
        cross = prices[(prices["date"] <= snapshot) & prices["code"].isin(eligible_codes)].groupby("code").tail(1).dropna(subset=["momentum126", "vol20", "forward20"])
        if len(cross) < 100:
            continue
        cross = cross.assign(score=cross["momentum126"].rank(pct=True) - cross["vol20"].rank(pct=True))
        ic_rows.append({"date": snapshot.strftime("%Y-%m-%d"), "n": len(cross), "IC": float(cross["score"].corr(cross["forward20"])),
                        "RankIC": float(cross["score"].rank().corr(cross["forward20"].rank()))})
        chosen = cross.nlargest(max(10, len(cross) // 5), "score")
        for _, row in chosen.iterrows():
            series = prices[(prices["code"] == row["code"]) & (prices["date"] > snapshot)].head(27).copy()
            if len(series) < 21:
                continue
            entry = series.iloc[0]
            blocked_entry = entry["tradestatus"] != 1 or entry["pctChg"] >= limit_threshold(row["code"], bool(entry["isST"]), entry["date"])
            if blocked_entry:
                continue
            # Enter at the next trading close (T+1 from signal); never sell on the entry day.
            desired_exit = 20
            actual_exit = desired_exit
            while actual_exit + 1 < len(series):
                exit_row = series.iloc[actual_exit]
                threshold = limit_threshold(row["code"], bool(exit_row["isST"]), exit_row["date"])
                if exit_row["tradestatus"] == 1 and exit_row["pctChg"] > -threshold:
                    break
                actual_exit += 1
            strategy_returns.append(series.set_index("date")["ret1"].iloc[1:actual_exit + 1].rename(row["code"]))
    if not strategy_returns or not ic_rows:
        raise SystemExit("EVALUATION_BLOCKED: the downloaded panel does not contain enough valid cross-sections.")
    strategy = pd.concat(strategy_returns, axis=1).mean(axis=1).sort_index()
    benchmark["date"] = pd.to_datetime(benchmark["date"])
    benchmark["return"] = pd.to_numeric(benchmark["pctChg"], errors="coerce") / 100
    bench = benchmark.set_index("date")["return"].reindex(strategy.index)
    low, high = bootstrap_sharpe_difference(strategy, bench)
    status = securities["status"] if "status" in securities else pd.Series("", index=securities.index)
    out_date = securities["outDate"] if "outDate" in securities else pd.Series("", index=securities.index)
    delisted = int(((status == "0") | (out_date != "")).sum())
    report = {"schemaVersion": 1, "generatedAt": pd.Timestamp.utcnow().isoformat(), "dataManifest": manifest,
              "universe": {"membershipRows": len(membership), "uniqueSecurities": int(membership["code"].nunique()), "delistedOrExitedSecurities": delisted},
              "executionAssumptions": {"signalToEntry": "next trading close (T+1)", "adjustment": "forward-adjusted prices", "limitRules": "block buys at upper limit; defer exits at lower limit; 5% ST, 10% main board, 20% STAR/ChiNext after reform; conservative 0.2pp buffer", "fees": "not yet modelled"},
              "factorEvaluation": {"crossSections": len(ic_rows), "meanIC": float(pd.DataFrame(ic_rows)["IC"].mean()), "meanRankIC": float(pd.DataFrame(ic_rows)["RankIC"].mean()), "rows": ic_rows},
              "performance": {"observations": int(len(strategy)), "strategySharpe": sharpe(strategy), "benchmarkSharpe": sharpe(bench), "sharpeDifference": sharpe(strategy) - sharpe(bench),
                              "sharpeDifferenceBootstrap95": [low, high], "strategyMaxDrawdown": max_drawdown(strategy), "benchmarkMaxDrawdown": max_drawdown(bench)},
              "limitations": ["Research prototype; not investment advice or live trading.", "Quarter-end membership snapshots approximate point-in-time membership between snapshots.", "Fees, slippage and partial fills are not yet modelled.", "Price-limit handling is rule-based and must be checked against instrument-specific exchange history."]}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(REPORT), "universe": report["universe"], "factorEvaluation": {k: v for k, v in report["factorEvaluation"].items() if k != "rows"}, "performance": report["performance"]}, ensure_ascii=False, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    get = sub.add_parser("download")
    get.add_argument("--start", default="2020-01-01")
    get.add_argument("--end", default="2024-12-31")
    get.add_argument("--limit", type=int)
    sub.add_parser("evaluate")
    args = parser.parse_args()
    if args.command == "download":
        download(args.start, args.end, args.limit)
    else:
        evaluate()


if __name__ == "__main__":
    main()
