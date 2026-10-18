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

# ====================== CẤU HÌNH TỐI ƯU ======================
DATASET_PATH = "vihate_dataset_v2.csv"
SKIP_ROWS = 0                   # BẮT BUỘC bắt đầu từ 0
SAMPLE_SIZE = 1000000           
CHECKPOINT_TO_LOAD = None       # BẮT BUỘC bỏ qua checkpoint cũ
OVERSAMPLE_FACTOR = 6           
TOKENIZE_CHUNK_SIZE = 50000     
MAX_LENGTH = 64
LOGICAL_BATCH_SIZE = 256        # Tăng mạnh để chứa đủ câu toxic trong 1 batch
MAX_PHYSICAL_BATCH_SIZE = 16    
EPOCHS = 3
LEARNING_RATE = 2e-5
NOISE_MULTIPLIER = 0.4
MAX_GRAD_NORM = 2.0             
DELTA = 1e-5
# ==============================================================

# --- ĐỊNH NGHĨA FOCAL LOSS ---
class FocalLoss(nn.Module):
    def __init__(self, alpha=0.8, gamma=2.0):
        super(FocalLoss, self).__init__()
        self.alpha = alpha # Trọng số cho lớp Toxic (1)
        self.gamma = gamma # Độ phạt cho các mẫu dễ phân loại
        self.ce = nn.CrossEntropyLoss(reduction='none')

    def forward(self, inputs, targets):
        ce_loss = self.ce(inputs, targets)
        pt = torch.exp(-ce_loss)
        # Gán alpha=0.8 cho câu toxic, 0.2 cho câu safe
        alpha_t = torch.where(targets == 1, self.alpha, 1 - self.alpha)
        focal_loss = (alpha_t * (1 - pt) ** self.gamma * ce_loss).mean()
        return focal_loss

def load_real_dataset(file_path=DATASET_PATH, sample_size=SAMPLE_SIZE, skip_rows=SKIP_ROWS):
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"❌ Không tìm thấy file {file_path}!")

    print(f"⏳ Đang đọc dữ liệu từ {file_path}...")
    df = pd.read_csv(file_path)
    total_rows = len(df)

    df = df.dropna(subset=['text', 'label'])
    df['text'] = df['text'].astype(str)
    df['label'] = df['label'].astype(int)

    if skip_rows:
        df = df.iloc[skip_rows:]
        print(f"⏭️  Đã bỏ qua {skip_rows} dòng đầu")

    if sample_size and len(df) > sample_size:
        df = df.head(sample_size)

    print(f"✅ Đã lấy {len(df)} dòng để train")

    texts = df['text'].tolist()
    labels = df['label'].tolist()

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

    for name, param in model.named_parameters():
        if "classifier" not in name and "roberta.encoder.layer.11" not in name:
            param.requires_grad = False

    model = ModuleValidator.fix(model)
    model.to(device)

    optimizer = torch.optim.AdamW(filter(lambda p: p.requires_grad, model.parameters()), lr=LEARNING_RATE)
    
    # SỬ DỤNG FOCAL LOSS THAY CHO CROSS ENTROPY
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

    print("\n🔥 Bắt đầu Training với Focal Loss + Ghost Clipping...")
    
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
        torch.save(model._module.state_dict(), f"toxic_model_v3_epoch_{epoch+1}.pth")

    torch.save(model._module.state_dict(), "toxic_model.pth")
    print("\n🎉 HUẤN LUYỆN HOÀN TẤT VỚI FOCAL LOSS!")

if __name__ == "__main__":
    train_model()