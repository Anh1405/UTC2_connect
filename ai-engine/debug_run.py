import torch, numpy as np
from transformers import AutoTokenizer, AutoModelForSequenceClassification

texts = [
 "Ba mẹ bạn khi sinh ra quên gắn não cho bạn.",
 "Mày là đồ ngu súc vật",
 "Địt mẹ mày",
 "Chào buổi sáng",
 "Code viết rác như thế này thì thà tắt máy",
 "Tao mà gặp mày ở ngoài là tao đánh cho"
]

def inspect_model(path, name):
    print("===", name, "===", path)
    tok = AutoTokenizer.from_pretrained("vinai/phobert-base")
    model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)
    sd = torch.load(path, map_location="cpu")
    # try common wrappers
    if isinstance(sd, dict) and ("state_dict" in sd or "model_state_dict" in sd):
        if "state_dict" in sd:
            sd = sd["state_dict"]
        else:
            sd = sd["model_state_dict"]
    new_sd = {}
    for k,v in sd.items():
        nk = k[len("module."):] if k.startswith("module.") else k
        new_sd[nk] = v
    missing, unexpected = model.load_state_dict(new_sd, strict=False)
    print("missing keys:", missing)
    print("unexpected keys:", unexpected)
    model.eval()
    with torch.no_grad():
        for t in texts:
            enc = tok(t, return_tensors="pt", truncation=True, padding="max_length", max_length=128)
            out = model(**enc)
            logits = out.logits.numpy().flatten()
            probs = torch.softmax(out.logits, dim=1).numpy().flatten()
            print(f"text: {t[:60]:60} | logits: {logits} | probs: {probs}")
    # Check a few param statistics
    total = 0
    s = 0.0
    for n,p in model.named_parameters():
        if p is not None:
            total += p.numel()
            s += p.detach().cpu().abs().sum().item()
    print("param count:", total, "sum abs params:", s)
    return model

m4 = inspect_model("toxic_model_v4.pth", "v4")
m5 = inspect_model("toxic_model_v5.pth", "v5")

# Compare few parameter tensors (classifier)
def print_param_diff(m_old, m_new, name_contains="classifier"):
    for (n1,p1), (n2,p2) in zip(list(m_old.named_parameters()), list(m_new.named_parameters())):
        if name_contains in n1:
            d = (p1.detach().cpu() - p2.detach().cpu()).abs().mean().item()
            print("param:", n1, "mean abs diff:", d)
            break

print_param_diff(m4, m5)