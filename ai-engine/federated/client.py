def train_client_with_privacy(model, train_loader, optimizer, epochs, epsilon, delta):
    model.train()
    criterion = nn.CrossEntropyLoss()
    
    # 🛡️ Gắn khiên bảo vệ Opacus vào quá trình huấn luyện
    privacy_engine = PrivacyEngine()
    model, optimizer, train_loader = privacy_engine.make_private(
        module=model,
        optimizer=optimizer,
        data_loader=train_loader,
        noise_multiplier=1.0, # Độ nhiễu bơm vào (càng cao càng bảo mật)
        max_grad_norm=1.0,    # Cắt xén (clipping) gradient
    )

    for epoch in range(epochs):
        for inputs, targets in train_loader:
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()
            
    # Trả về trọng số (weights) đã được bảo mật để gửi lên Server
    return model.state_dict()