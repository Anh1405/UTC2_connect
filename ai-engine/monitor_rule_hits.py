import csv
from collections import Counter
import argparse
import pandas as pd
from pathlib import Path

CSV_IN = "rule_hits.csv"
OUT_CSV = "rule_hits_for_annotation.csv"

def dedupe_and_aggregate(input_csv=CSV_IN, out_csv=OUT_CSV, top_n=None):
    path = Path(input_csv)
    if not path.exists():
        print("No rule_hits.csv found.")
        return

    df = pd.read_csv(input_csv, header=None, names=["timestamp","rule_id","score_before","score_after","text"], encoding="utf-8")
    # Drop duplicates by text
    df_unique = df.drop_duplicates(subset=["text"]).copy()
    # Count frequency in original file
    counts = df["text"].value_counts().to_dict()
    df_unique["count"] = df_unique["text"].map(counts.get)
    # Sort by count desc then recent timestamp
    df_unique = df_unique.sort_values(by=["count","timestamp"], ascending=[False, False])

    if top_n:
        df_out = df_unique.head(top_n)
    else:
        df_out = df_unique

    df_out.to_csv(out_csv, index=False, encoding="utf-8")
    print(f"Saved {len(df_out)} unique hits to {out_csv}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=None, help="Top N examples to export")
    args = parser.parse_args()
    dedupe_and_aggregate(top_n=args.top)