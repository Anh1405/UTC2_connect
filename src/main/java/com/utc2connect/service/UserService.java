package com.utc2connect.service;

import com.utc2connect.entity.User;
import com.utc2connect.repository.userRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class UserService {
    @Autowired
private userRepository userRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
public String registerUser(String email,String password,String username){
if(!email.endsWith("@st.utc2.edu.vn")) {
    return "Invalid email";
}
    Optional<User> existingUser = userRepository.findByEmail(email);
    if(existingUser.isPresent())
    {  return "Email already in use";
    }
    User user = new User();
    user.setEmail(email);
    user.setPassword(password);
    user.setUsername(username);
    user.setPassword(passwordEncoder.encode(password));
    userRepository.save(user);
    return "User registered successfully";
}
}

