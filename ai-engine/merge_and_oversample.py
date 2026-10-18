import argparse
import pandas as pd
from sklearn.utils import shuffle

def load_seed(seed_path):
    df = pd.read_csv(seed_path, encoding='utf-8')
    if 'label_confirmed' in df.columns:
        df = df[df['label_confirmed'] == 1]
    elif 'label' in df.columns:
        df = df[df['label'] == 1]
    df = df[['text']].copy()
    df['label'] = 1
    return df

def load_base(base_path):
    df = pd.read_csv(base_path, encoding='utf-8')
    if 'text' not in df.columns or 'label' not in df.columns:
        raise ValueError("Base CSV cần có cột 'text' và 'label'")
    return df[['text','label']].copy()

def main(seed_path, base_path, out_path, oversample, seed_rand, sample_size):
    base = load_base(base_path)
    seed = load_seed(seed_path)
    print(f"Base size: {len(base)}, Seed size: {len(seed)}")

    # Oversample câu ẩn ý (mặc định x4 lên ~1.268 câu)
    seed_os = pd.concat([seed] * oversample, ignore_index=True) if oversample > 1 else seed

    combined = pd.concat([base, seed_os], ignore_index=True)
    combined = shuffle(combined, random_state=seed_rand).reset_index(drop=True)

    if sample_size and len(combined) > sample_size:
        combined = combined.sample(n=sample_size, random_state=seed_rand).reset_index(drop=True)

    combined.to_csv(out_path, index=False, encoding='utf-8')
    print(f"Saved combined dataset to {out_path} (Total rows: {len(combined)})")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", default="indirect_insults_seed.csv")
    parser.add_argument("--base", default="vihate_dataset_v2.csv")
    parser.add_argument("--out", default="combined_V2.csv")
    parser.add_argument("--oversample", type=int, default=4)
    parser.add_argument("--sample_size", type=int, default=None)
    parser.add_argument("--seedrand", type=int, default=42)
    args = parser.parse_args()
    main(args.seed, args.base, args.out, args.oversample, args.seedrand, args.sample_size)