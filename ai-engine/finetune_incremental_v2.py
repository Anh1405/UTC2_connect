"""
Fine-tune TIẾP TỤC từ checkpoint hiện có — bản này bám sát đúng kiến trúc
của train.py (giữ nguyên freeze layer, FocalLoss, oversample, Opacus DP),
CHỈ khác 2 chỗ:
  1. Load trọng số từ CHECKPOINT_TO_LOAD thay vì khởi tạo random từ
     vinai/phobert-base.
  2. Gộp thêm NEW_EXAMPLES (câu mỉa mai/châm biếm mới) vào dataset gốc
     trước khi oversample, thay vì chỉ train trên đúng vihate_dataset_v2.csv.

Mọi cấu hình khác (freeze layer 11 + classifier, FocalLoss alpha/gamma,
noise_multiplier, max_grad_norm, ghost clipping...) giữ NGUYÊN như train.py
để không phá vỡ hành vi DP / chống overfit đã được cấu hình cho hệ thống.

Cách dùng:
1. Đặt CHECKPOINT_TO_LOAD trỏ đúng checkpoint đang chạy trong api.py
   (vd: "toxic_model_V3_epoch_3.pth").
2. Bổ sung câu mới vào NEW_EXAMPLES bên dưới (càng nhiều pattern càng tốt,
   nên có cả câu safe để model không học lệch).
3. Giữ nguyên DATASET_PATH trỏ về vihate_dataset_v2.csv — data cũ vẫn được
   nạp đầy đủ, NEW_EXAMPLES chỉ được CỘNG THÊM vào, không thay thế.
4. Chạy: python finetune_incremental_v2.py
   → ra toxic_model_v4_epoch_{1,2,3}.pth và toxic_model_v4.pth (không đụng
     tới các checkpoint v3 cũ).
5. Chạy test_all_checkpoints.py với checkpoint mới để so sánh trước khi
   thay vào api.py.
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from opacus import PrivacyEngine
from opacus.validators import ModuleValidator
from opacus.utils.batch_memory_manager import BatchMemoryManager
import pandas as pd
import os
import random
import warnings
warnings.filterwarnings("ignore")

# ====================== CẤU HÌNH ======================
DATASET_PATH = "vihate_dataset_v2.csv"
CHECKPOINT_TO_LOAD = "toxic_model_V3_epoch_3.pth"   # <-- checkpoint đang chạy thật, SỬA cho đúng
OUTPUT_PREFIX = "toxic_model_v4"                     # lưu ra tên mới, không ghi đè bản v3
SKIP_ROWS = 0
SAMPLE_SIZE = 1000000
OVERSAMPLE_FACTOR = 6
TOKENIZE_CHUNK_SIZE = 50000
MAX_LENGTH = 64
LOGICAL_BATCH_SIZE = 256
MAX_PHYSICAL_BATCH_SIZE = 16
EPOCHS = 2                      # continue training thường cần ít epoch hơn train từ đầu
LEARNING_RATE = 2e-5            # giữ nguyên như train.py — layer đã bị freeze gần hết nên rủi ro quên đã thấp sẵn
NOISE_MULTIPLIER = 0.4
MAX_GRAD_NORM = 2.0
DELTA = 1e-5
# ==============================================================

# --- CÂU MỚI CẦN DẠY THÊM (mỉa mai / châm biếm gián tiếp) ---
# label: 1 = toxic, 0 = safe. Bổ sung càng nhiều pattern khác nhau càng tốt,
# đừng chỉ đổi vài từ trong 1 câu gốc — model cần thấy đa dạng để tổng quát hóa.
NEW_EXAMPLES = [
    ("Cái não của bạn chắc chỉ để trang trí cho vui chứ không biết tư duy à?", 1),
    ("Nói chuyện với cái đầu gối còn tiếp thu nhanh hơn nói chuyện với bạn.", 1),
    ("Chắc lúc sinh ra bác sĩ lỡ tay vứt nhầm não của bạn đi rồi hả?", 1),
    ("Code viết rác như thế này thì thà tắt máy đi ngủ còn hơn.", 1),
    ("Không biết bạn dùng cái gì để suy nghĩ nữa, chắc không phải não.", 1),
    ("Giỏi thật đấy, làm gì cũng hỏng, đúng là tài năng hiếm có.", 1),
    ("Chậm như bạn chắc rùa nó cũng phải gọi bằng thầy.", 1),
    ("Đúng là nhân tài, cái gì cũng làm sai được.", 1),
    ("Bạn mà cũng đòi làm được việc này á? Nghe hài quá.", 1),
    ("Não bạn chắc để ở nhà rồi, hôm nay quên mang theo à?", 1),
    # câu safe để model không học lệch thành "chê code = toxic"
    ("Code này còn vài chỗ chưa ổn, để mình xem lại giúp bạn nhé.", 0),
    ("Bạn làm chậm quá, mình phụ một tay cho kịp deadline nha.", 0),
    ("Lần này hơi trục trặc thôi, cố lên là được mà.", 0),
    ("Bạn thử suy nghĩ lại hướng giải quyết xem có ổn hơn không.", 0),
    ("Đợt này mình cũng hay quên nữa, chắc do stress deadline.", 0),
]

if len(NEW_EXAMPLES) < 20:
    print(f"⚠️  Cảnh báo: mới có {len(NEW_EXAMPLES)} câu mới (<20). "
          f"Với sarcasm/mỉa mai, càng nhiều pattern khác nhau càng dễ tổng quát hóa — "
          f"cân nhắc bổ sung thêm trước khi train.")


# --- ĐỊNH NGHĨA FOCAL LOSS (giữ nguyên như train.py) ---
class FocalLoss(nn.Module):
    def __init__(self, alpha=0.8, gamma=2.0):
        super(FocalLoss, self).__init__()
        self.alpha = alpha
        self.gamma = gamma
        self.ce = nn.CrossEntropyLoss(reduction='none')

    def forward(self, inputs, targets):
        ce_loss = self.ce(inputs, targets)
        pt = torch.exp(-ce_loss)
        alpha_t = torch.where(targets == 1, self.alpha, 1 - self.alpha)
        focal_loss = (alpha_t * (1 - pt) ** self.gamma * ce_loss).mean()
        return focal_loss


def load_real_dataset(file_path=DATASET_PATH, sample_size=SAMPLE_SIZE, skip_rows=SKIP_ROWS):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"❌ Không tìm thấy file {file_path}!")

    print(f"⏳ Đang đọc dữ liệu từ {file_path}...")
    df = pd.read_csv(file_path)

    df = df.dropna(subset=['text', 'label'])
    df['text'] = df['text'].astype(str)
    df['label'] = df['label'].astype(int)

    if skip_rows:
        df = df.iloc[skip_rows:]
        print(f"⏭️  Đã bỏ qua {skip_rows} dòng đầu")

    if sample_size and len(df) > sample_size:
        df = df.head(sample_size)

    print(f"✅ Đã lấy {len(df)} dòng gốc từ {file_path}")

    texts = df['text'].tolist()
    labels = df['label'].tolist()

    # --- GỘP THÊM NEW_EXAMPLES VÀO DATASET GỐC (khác với train.py) ---
    if NEW_EXAMPLES:
        new_texts = [t for t, _ in NEW_EXAMPLES]
        new_labels = [l for _, l in NEW_EXAMPLES]
        texts = texts + new_texts
        labels = labels + new_labels
        print(f"➕ Đã gộp thêm {len(NEW_EXAMPLES)} câu mới vào dataset "
              f"(tổng {len(texts)} dòng trước oversample)")

    if OVERSAMPLE_FACTOR > 1:
        toxic_texts = [t for t, l in zip(texts, labels) if l == 1]
        toxic_labels = [l for l in labels if l == 1]

        texts = texts + toxic_texts * (OVERSAMPLE_FACTOR - 1)
        labels = labels + toxic_labels * (OVERSAMPLE_FACTOR - 1)

        combined = list(zip(texts, labels))
        random.shuffle(combined)
        texts, labels = zip(*combined)
        texts, labels = list(texts), list(labels)

    return texts, labels


def train_model():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"\n💻 HỆ THỐNG ĐANG SỬ DỤNG THIẾT BỊ: {device.type.upper()}\n")

    texts, labels = load_real_dataset()

    print("⏳ Đang tải PhoBERT Tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base")

    print("⏳ Đang mã hóa từ vựng (Tokenization)...")
    input_ids_list = []
    attention_mask_list = []
    for start in range(0, len(texts), TOKENIZE_CHUNK_SIZE):
        chunk = texts[start:start + TOKENIZE_CHUNK_SIZE]
        encoded_chunk = tokenizer(
            chunk,
            padding='max_length',
            max_length=MAX_LENGTH,
            truncation=True,
            return_tensors='pt'
        )
        input_ids_list.append(encoded_chunk['input_ids'])
        attention_mask_list.append(encoded_chunk['attention_mask'])
        print(f"   ⏳ Đã tokenize {min(start + TOKENIZE_CHUNK_SIZE, len(texts))}/{len(texts)} dòng", end='\r')

    print()
    X_train = torch.cat(input_ids_list, dim=0)
    A_train = torch.cat(attention_mask_list, dim=0)
    y_train = torch.tensor(labels, dtype=torch.long)
    del input_ids_list, attention_mask_list

    dataset = TensorDataset(X_train, A_train, y_train)
    train_loader = DataLoader(dataset, batch_size=LOGICAL_BATCH_SIZE, shuffle=True)

    print("⏳ Đang tải bộ não PhoBERT...")
    model = AutoModelForSequenceClassification.from_pretrained("vinai/phobert-base", num_labels=2)

    # --- LOAD CHECKPOINT HIỆN CÓ (khác với train.py, vốn luôn None) ---
    if CHECKPOINT_TO_LOAD:
        if not os.path.exists(CHECKPOINT_TO_LOAD):
            raise FileNotFoundError(f"❌ Không tìm thấy checkpoint {CHECKPOINT_TO_LOAD}!")
        print(f"⏳ Đang nạp trọng số từ checkpoint có sẵn: {CHECKPOINT_TO_LOAD}...")
        model.load_state_dict(
            torch.load(CHECKPOINT_TO_LOAD, weights_only=True, map_location='cpu'),
            strict=False
        )
        print("✅ Đã nạp checkpoint — train tiếp từ đây, KHÔNG train lại từ đầu.")
    else:
        print("⚠️  CHECKPOINT_TO_LOAD = None → sẽ train từ vinai/phobert-base gốc (random init).")

    # Freeze layer giống hệt train.py: chỉ mở classifier + layer cuối
    for name, param in model.named_parameters():
        if "classifier" not in name and "roberta.encoder.layer.11" not in name:
            param.requires_grad = False

    model = ModuleValidator.fix(model)
    model.to(device)

    optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LEARNING_RATE)
    criterion = FocalLoss(alpha=0.8, gamma=2.0)

    model.train()
    privacy_engine = PrivacyEngine()
    model, optimizer, criterion, train_loader = privacy_engine.make_private(
        module=model,
        optimizer=optimizer,
        criterion=criterion,
        data_loader=train_loader,
        noise_multiplier=NOISE_MULTIPLIER,
        max_grad_norm=MAX_GRAD_NORM,
        grad_sample_mode="ghost",
    )

    print("\n🔥 Bắt đầu Fine-tune tiếp tục với Focal Loss + Ghost Clipping...")

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        num_batches = 0

        with BatchMemoryManager(
            data_loader=train_loader,
            max_physical_batch_size=MAX_PHYSICAL_BATCH_SIZE,
            optimizer=optimizer
        ) as memory_safe_loader:

            for i, (inputs, masks, targets) in enumerate(memory_safe_loader):
                inputs = inputs.to(device)
                masks = masks.to(device)
                targets = targets.to(device)

                optimizer.zero_grad()
                outputs = model(input_ids=inputs, attention_mask=masks)
                loss = criterion(outputs.logits, targets)

                loss.backward()
                optimizer.step()

                total_loss += loss.item()
                num_batches += 1

                if (i + 1) % 10 == 0:
                    print(f"   ⏳ Epoch {epoch+1} | Batch {i+1} | Loss: {loss.item():.4f}", end='\r')

        epsilon = privacy_engine.get_epsilon(delta=DELTA)
        avg_loss = total_loss / max(num_batches, 1)

        print(f"\n   ✅ [Epoch {epoch+1}/{EPOCHS}] Loss: {avg_loss:.4f} | Epsilon: {epsilon:.2f}")
        torch.save(model._module.state_dict(), f"{OUTPUT_PREFIX}_epoch_{epoch+1}.pth")

    torch.save(model._module.state_dict(), f"{OUTPUT_PREFIX}.pth")
    print(f"\n🎉 FINE-TUNE TIẾP TỤC HOÀN TẤT! Checkpoint mới: {OUTPUT_PREFIX}.pth")
    print(f"👉 Checkpoint cũ ({CHECKPOINT_TO_LOAD}) KHÔNG bị ghi đè.")

if __name__ == "__main__":
    train_model()
