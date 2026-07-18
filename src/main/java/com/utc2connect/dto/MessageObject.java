package com.utc2connect.dto;

public class MessageObject {
    private String roomID;
    private String content;

    // Getter và Setter
    public String getRoomID() {
        return roomID;
    }
    public void setRoomID(String roomID) {
        this.roomID = roomID;
    }
    public String getContent() {
        return content;
    }
    public void setContent(String content) {
        this.content = content;
    }
}