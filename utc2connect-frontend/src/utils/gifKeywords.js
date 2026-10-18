// Đổi từ khoá tiếng Việt sang từ khoá tiếng Anh để tìm GIF trên Giphy
const DICTIONARY = {
  hello: ['chào', 'xin chào', 'hi', 'alo', 'helo', 'hé lô'],
  laugh: ['cười', 'haha', 'hihi', 'hehe', 'lmao', 'kaka', 'mắc cười', 'kkk'],
  sad: ['buồn', 'chán', 'khóc', 'tủi thân', 'rớt nước mắt', 'huhu'],
  angry: ['tức', 'giận', 'cáu', 'điên', 'quạu', 'bực', 'ghét'],
  love: ['yêu', 'thích', 'thả tim', 'iu', 'mãi yêu', 'yêu quá'],
  sleep: ['ngủ', 'buồn ngủ', 'ngáp', 'khò'],
  eat: ['ăn', 'đói', 'măm', 'thèm ăn'],
  ok: ['ok', 'oke', 'được', 'duyệt', 'nhất trí', 'triển'],
  facepalm: ['bó tay', 'cạn lời', 'chịu', 'bất lực', 'chán nản', 'bó chiếu'],
  wow: ['wow', 'đỉnh', 'xuất sắc', 'ghê', 'đỉnh quá', 'ngạc nhiên'],
  congratulations: ['chúc mừng', 'tuyệt vời', 'tung hoa', 'giỏi'],
  sorry: ['xin lỗi', 'sorry', 'sory', 'xl', 'tội lỗi'],
  bye: ['tạm biệt', 'bye', 'bai', 'pp', 'đi ngủ đây'],
  what: ['cái gì', 'hả', 'ủa', 'what', 'sao', 'là sao'],
  no: ['không', 'đéo', 'éo', 'no', 'chê', 'đừng'],
  yes: ['có', 'dạ', 'vâng', 'yes', 'chuẩn'],
  dance: ['quẩy', 'nhảy', 'lên luôn', 'phiêu'],
  cry: ['khóc', 'huhu', 'mít ướt', 'nước mắt'],
};

export const mapVietnameseToGiphy = (text) => {
  const lowerText = text.toLowerCase().trim();
  for (const [enWord, vnWords] of Object.entries(DICTIONARY)) {
    if (vnWords.some((vw) => lowerText.includes(vw))) {
      return enWord;
    }
  }
  return lowerText;
};
