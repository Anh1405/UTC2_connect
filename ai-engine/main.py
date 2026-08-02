import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from opacus import PrivacyEngine
import copy
import warnings
warnings.filterwarnings("ignore") # Ẩn các cảnh báo râu ria của PyTorch cho dễ nhìn log

# ==========================================
# 1. KHỞI TẠO MÔ HÌNH NLP (Lõi AI)
# ==========================================
class TextClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim, num_classes):
        super(TextClassifier, self).__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.fc = nn.Linear(embed_dim, num_classes)

    def forward(self, text_indices):
        # Biến đổi các từ thành vector toán học và lấy trung bình
        embedded = self.embedding(text_indices).mean(dim=1) 
        output = self.fc(embedded)
        return output

# Hàm tạo dữ liệu giả (Mô phỏng tin nhắn sinh viên đã được mã hóa thành các con số)
def get_dummy_dataloader(num_samples=100, vocab_size=5000, seq_len=10):
    X = torch.randint(0, vocab_size, (num_samples, seq_len)) # random chữ
    y = torch.randint(0, 2, (num_samples,))                  # random nhãn 0 (an toàn) hoặc 1 (độc hại)
    dataset = TensorDataset(X, y)
    return DataLoader(dataset, batch_size=16)

# ==========================================
# 2. KHU VỰC CLIENT (Sinh viên tự train + Bơm nhiễu Opacus)
# ==========================================
def train_client_with_privacy(model, train_loader, optimizer, epochs=1):
    model.train()
    criterion = nn.CrossEntropyLoss()
    
    # 🛡️ Bật khiên bảo mật Differential Privacy của Meta
    privacy_engine = PrivacyEngine()
    model, optimizer, train_loader = privacy_engine.make_private(
        module=model,
        optimizer=optimizer,
        data_loader=train_loader,
        noise_multiplier=1.2, # Độ nhiễu (Càng cao càng khó dịch ngược tin nhắn)
        max_grad_norm=1.0,    # Ngưỡng cắt xén (Clipping)
    )

    for epoch in range(epochs):
        for inputs, targets in train_loader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            
    # Tính toán mức độ rò rỉ quyền riêng tư (Epsilon)
    epsilon = privacy_engine.get_epsilon(delta=1e-5)
    
    # Trả về trọng số (weights) đã được bảo mật để gửi lên Server
    return model._module.state_dict(), epsilon

# ==========================================
# 3. KHU VỰC SERVER (Tổng hợp bằng FedAvg)
# ==========================================
def federated_averaging(global_model, client_weights_list):
    global_dict = global_model.state_dict()
    
    # Tính trung bình cộng toán học các tham số từ nhiều Client gửi lên
    for key in global_dict.keys():
        global_dict[key] = torch.stack(
            [client_weights[key] for client_weights in client_weights_list], dim=0
        ).mean(dim=0)
        
    global_model.load_state_dict(global_dict)
    return global_model

# ==========================================
# 4. KỊCH BẢN GIẢ LẬP HỆ THỐNG
# ==========================================
def simulate():
    print("🚀 BẮT ĐẦU MÔ PHỎNG: FEDERATED LEARNING + DIFFERENTIAL PRIVACY\n")
    
    # Khởi tạo mô hình tại Server (Chưa biết gì)
    vocab_size, embed_dim, num_classes = 5000, 128, 2
    global_model = TextClassifier(vocab_size, embed_dim, num_classes)
    
    num_rounds = 3   # Số vòng giao tiếp giữa Server và Client
    num_clients = 2  # Số lượng máy sinh viên tham gia
    
    for round_num in range(num_rounds):
        print(f"--- Vòng huấn luyện {round_num + 1}/{num_rounds} ---")
        client_weights_list = []
        
        for client_id in range(num_clients):
            print(f"  [Client {client_id}] Nhận model từ Server. Đang tải dữ liệu cục bộ và huấn luyện...")
            # Copy model từ server về máy cục bộ
            client_model = copy.deepcopy(global_model)
            optimizer = torch.optim.SGD(client_model.parameters(), lr=0.01)
            
            # Load tập tin nhắn riêng tư của sinh viên (giả lập)
            client_loader = get_dummy_dataloader(num_samples=80)
            
            # Train model và áp dụng nhiễu
            weights, eps = train_client_with_privacy(client_model, client_loader, optimizer)
            client_weights_list.append(weights)
            
            print(f"  [Client {client_id}] ✅ Hoàn tất! Model đã được bơm nhiễu (Chi phí Epsilon: {eps:.2f})")
            
        print("  [Server] Đã nhận được model mã hóa từ các Client. Đang chạy FedAvg...")
        global_model = federated_averaging(global_model, client_weights_list)
        print("  [Server] ✅ Nâng cấp Global Model thành công!\n")
        
    print("🎉 KẾT THÚC! HỆ THỐNG ĐÃ SẴN SÀNG.")

if __name__ == "__main__":
    simulate()