import torch
import torch.nn as nn
from opacus import PrivacyEngine
import copy

# Mô hình NLP cơ bản phân loại tin nhắn (Độc hại / An toàn)
class TextClassifier(nn.Module):
    def __init__(self, vocab_size, embed_dim, num_classes):
        super(TextClassifier, self).__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        self.fc = nn.Linear(embed_dim, num_classes)

    def forward(self, text_indices):
        # Lấy trung bình embedding của các từ trong câu
        embedded = self.embedding(text_indices).mean(dim=1) 
        output = self.fc(embedded)
        return output