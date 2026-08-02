def federated_averaging(global_model, client_weights_list):
    global_dict = global_model.state_dict()
    
    # Lấy trung bình cộng từng tham số của các Client
    for key in global_dict.keys():
        global_dict[key] = torch.stack(
            [client_weights[key] for client_weights in client_weights_list], dim=0
        ).mean(dim=0)
        
    global_model.load_state_dict(global_dict)
    return global_model