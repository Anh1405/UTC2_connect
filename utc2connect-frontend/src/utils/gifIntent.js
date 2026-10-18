/**
 * gifIntent.js — "bộ não" gợi ý GIF cho Chat All (Trà chanh tán gẫu)
 *
 * Chạy 100% trên trình duyệt, không gọi API ngoài, không tốn token.
 * Pipeline xử lý (giống một NLU nhỏ gọn):
 *
 *   1. Chuẩn hoá  : bỏ dấu câu, co chữ kéo dài ("buồnnnn"), giải teencode ("ko", "dc", "zui"...)
 *   2. Nhận diện  : khớp cụm từ có dấu → không dấu → gõ sai chính tả (Levenshtein)
 *   3. Phân xử    : cụm dài thắng cụm ngắn ("ăn vặt" > "ăn"), ưu tiên vế cuối câu
 *   4. Phủ định   : "không buồn" → vui, "chưa ngủ" → thức khuya, "đừng khóc" → ôm
 *   5. Cường độ   : "quá/vãi/VIẾT HOA/!!!/kéo dài chữ" → chọn GIF mạnh hơn
 *   6. Bối cảnh   : trả lời cụt ("ừ", "thật á") → đồng cảm theo tin nhắn trước
 *   7. Cảm xúc    : không có từ khoá → đoán tích cực/tiêu cực → dấu câu → GIF chung
 *   8. Cá nhân hoá: nhớ GIF bạn hay gửi theo từng tâm trạng, tránh lặp GIF vừa dùng
 */

/* ============================================================
 * 1. TỪ ĐIỂN CHỦ ĐỀ  (giữ nguyên bản gốc + mở rộng)
 * ============================================================ */
const BASE_TOPICS = [
  ['good night', ['ngủ ngon', 'chúc ngủ ngon', 'good night']],
  ['good morning', ['chào buổi sáng', 'good morning']],
  ['oh no', ['toang', 'thôi xong', 'xong phim', 'tiêu rồi', 'xong rồi']],
  ['shocked', ['sốc', 'trời ơi', 'trời đất', 'hết hồn', 'giật mình', 'xỉu']],
  ['awkward', ['ngại', 'xấu hổ', 'quê', 'quê quá', 'ngại ngùng']],
  ['scared', ['sợ', 'run', 'hồi hộp', 'lo quá']],
  ['sulking', ['dỗi', 'giận dỗi', 'hờn']],
  ['jealous', ['ghen', 'ghen tị']],
  ['bored', ['chán quá', 'rảnh', 'nhàm']],
  ['happy', ['vui', 'vui quá', 'hạnh phúc', 'mừng', 'sướng']],
  ['cool', ['ngầu', 'chill', 'xịn', 'hay quá']],
  ['party', ['đi chơi', 'đi nhậu', 'tiệc', 'party', 'đi quẩy']],
  ['rain', ['mưa', 'trời mưa']],
  ['hot weather', ['nóng', 'nắng', 'nóng quá']],
  ['cold weather', ['lạnh', 'rét', 'lạnh quá']],
  ['snack', ['ăn vặt', 'bánh tráng']],
  ['lonely', ['cô đơn', 'ế', 'một mình']],
  ['present here', ['điểm danh', 'có mặt']],
  ['deadline panic', ['deadline', 'dealine', 'nộp bài', 'sắp deadline']],
  ['exam stress', ['thi', 'kiểm tra', 'thi cử', 'giữa kỳ', 'cuối kỳ', 'ôn thi']],
  ['celebrate', ['đậu', 'qua môn', 'điểm cao', '10 điểm']],
  ['failed', ['trượt', 'rớt môn', 'rớt', 'điểm thấp']],
  ['studying', ['học bài', 'đi học', 'cày bài', 'ôn bài']],
  ['broke no money', ['hết tiền', 'nghèo', 'cuối tháng']],
  ['miss you', ['nhớ', 'nhớ quá', 'nhớ bạn']],
  ['blushing', ['crush', 'thầm thương', 'ngại quá']],
  ['thank you', ['cảm ơn', 'cám ơn', 'thanks', 'thank you']],
  ['congratulations', ['chúc mừng', 'tuyệt vời', 'giỏi quá', 'tung hoa']],
  ['hello', ['chào', 'xin chào', 'hi', 'hello', 'alo', 'helo', 'hé lô']],
  ['laughing', ['haha', 'hihi', 'hehe', 'kaka', 'kkk', 'lmao', 'cười', 'mắc cười', 'buồn cười', 'hài', 'hài vậy', 'hai vay', 'bựa', 'lầy', 'troll', 'cười xỉu']],
  ['crying', ['khóc', 'mít ướt', 'nước mắt']],
  ['sad', ['buồn', 'chán', 'tủi thân', 'huhu']],
  ['angry', ['tức', 'giận', 'cáu', 'bực', 'quạu']],
  ['love', ['yêu', 'thương', 'thả tim', 'iu', 'yêu quá', 'mãi yêu']],
  ['tired', ['mệt', 'mệt quá', 'kiệt sức']],
  ['sleepy', ['ngủ', 'buồn ngủ', 'ngáp', 'khò']],
  ['hungry', ['đói', 'đói quá', 'thèm ăn']],
  ['eating', ['ăn', 'măm', 'ăn cơm', 'ăn trưa']],
  ['coffee', ['cà phê', 'cafe', 'trà chanh', 'trà sữa']],
  ['bus', ['xe buýt', 'xe bus']],
  ['ok', ['ok', 'oke', 'okie', 'duyệt', 'nhất trí']],
  ['facepalm', ['bó tay', 'cạn lời', 'bất lực', 'chịu thua']],
  ['wow', ['wow', 'đỉnh', 'xuất sắc', 'ghê', 'ngạc nhiên', 'đỉnh quá']],
  ['sorry', ['xin lỗi', 'sorry', 'xl', 'tội lỗi']],
  ['bye', ['tạm biệt', 'bye', 'bai', 'pp']],
  ['confused', ['hả', 'ủa', 'là sao', 'what']],
  ['no', ['không', 'éo', 'đừng', 'no']],
  ['yes', ['dạ', 'vâng', 'yes', 'chuẩn', 'đúng rồi']],
  ['dancing', ['quẩy', 'nhảy', 'phiêu', 'lên luôn']],
];

/** Từ khoá bổ sung (teen, tiếng Anh, đời sống sinh viên Sài Gòn...) */
const EXTRA_WORDS = {
  laughing: ['ha ha', 'lol', 'rofl', 'cười ngất', 'hài quá', 'xỉu ngang', 'cười muốn xỉu'],
  sad: ['sad', 'đau lòng', 'tan nát', 'thất tình', 'chia tay', 'buồn quá', 'chạnh lòng', 'buồn thiu', 'tâm trạng'],
  crying: ['cry', 'khóc thét', 'hix', 'hức', 'khóc quá'],
  happy: ['happy', 'yay', 'phấn khởi', 'zui', 'vui vẻ', 'tuyệt cú mèo'],
  angry: ['angry', 'điên tiết', 'bực mình', 'cay', 'cay cú', 'phát điên', 'ức chế', 'tức điên'],
  love: ['love', 'love you', 'thương quá', 'iu quá', 'yêu em', 'yêu anh', 'thả thính', 'crush'],
  tired: ['mệt mỏi', 'đuối', 'đuối quá', 'hết pin', 'kiệt quệ', 'tired', 'exhausted', 'rã rời'],
  sleepy: ['buồn ngủ quá', 'đi ngủ', 'sleepy', 'díp mắt', 'ngủ gật', 'thèm ngủ'],
  hungry: ['hungry', 'cồn cào', 'sôi bụng', 'đói bụng'],
  eating: ['đi ăn', 'ăn tối', 'ăn sáng', 'ăn gì', 'ăn chưa', 'măm măm'],
  coffee: ['cf', 'caffeine', 'trà đào', 'bạc xỉu', 'cà phê muối'],
  bored: ['bored', 'chán đời', 'nhàm chán', 'rảnh rỗi', 'không có gì làm'],
  shocked: ['không thể tin', 'không tin nổi', 'thật á', 'thật hả', 'có thật không', 'omg', 'trời đất ơi', 'má ơi', 'mẹ ơi', 'shock', 'wtf', 'trời má'],
  'oh no': ['oh no', 'xong đời', 'chết rồi', 'toang rồi', 'hỏng rồi', 'sập nguồn', 'chết toang'],
  facepalm: ['hết nói nổi', 'không nói nên lời', 'facepalm', 'vô tri'],
  wow: ['đỉnh của chóp', 'đỉnh cao', 'quá đỉnh', 'awesome', 'amazing', 'pro quá', 'sương sương', 'đỉnh nóc'],
  congratulations: ['congrats', 'good job', 'làm tốt lắm', 'chúc mừng bạn', 'đỉnh quá bạn ơi'],
  celebrate: ['sinh nhật', 'happy birthday', 'đỗ', 'có học bổng', 'học bổng', 'được điểm cao', 'qua môn rồi'],
  'thank you': ['cảm ơn nhiều', 'biết ơn', 'thank', 'tks', 'cảm ơn bạn'],
  sorry: ['xin lỗi nhé', 'sry', 'có lỗi', 'xin lỗi bạn'],
  hello: ['yo', 'hey', 'hế lô', 'chào mọi người', 'mọi người ơi', 'xin chào mọi người', 'alo alo'],
  bye: ['bye bye', 'đi đây', 'chào nhé', 'hẹn gặp lại', 'gặp sau', 'off đây', 'tạm biệt nhé'],
  yes: ['đúng', 'chính xác', 'ừ', 'uh huh', 'đồng ý', 'chuẩn rồi', 'đúng vậy'],
  no: ['nope', 'không đời nào', 'không bao giờ', 'nói không'],
  ok: ['không sao', 'okê', 'okela', 'được rồi', 'ổn', 'ổn áp', 'chốt', 'được thôi', 'bình thường'],
  confused: ['huh', 'không hiểu', 'không biết', 'sao vậy', 'sao thế', 'gì vậy', 'gì thế', 'hông hiểu'],
  dancing: ['dance', 'lắc lư', 'nhảy nhót', 'bay lắc'],
  party: ['nhậu', 'đi bar', 'karaoke', 'đi picnic', 'cuối tuần', 'weekend', 'đi phượt'],
  rain: ['mưa to', 'mưa quá', 'ngập nước', 'ngập', 'ướt như chuột lột', 'rain'],
  'deadline panic': ['đồ án', 'báo cáo', 'tiểu luận', 'bài tập nhóm', 'làm nhóm', 'nộp gấp', 'trễ deadline'],
  'exam stress': ['exam', 'phòng thi', 'ôn bài thi', 'sắp thi', 'thi lại', 'học lại'],
  failed: ['fail', 'thi rớt', 'rớt rồi', 'trượt rồi', 'bị điểm kém', 'nợ môn'],
  studying: ['học nhóm', 'làm bài', 'học đi', 'học thôi', 'thức học'],
  'broke no money': ['hết tiền rồi', 'cháy túi', 'cạn túi', 'ví rỗng', 'sạch túi', 'ăn mì tôm'],
  'miss you': ['nhớ nhà', 'nhớ quá trời', 'miss you', 'nhớ lắm'],
  lonely: ['lonely', 'alone', 'ế ẩm', 'không ai chơi'],
  cool: ['cool', 'chất', 'ngầu lòi', 'xịn xò', 'đẹp trai', 'sang chảnh'],
  scared: ['scared', 'kinh dị', 'sợ quá', 'run quá', 'hú hồn'],
  awkward: ['awkward', 'quê độ', 'quê xệ', 'ngại chết'],
  sulking: ['dỗi rồi', 'giận rồi', 'không thèm nói'],
  jealous: ['jealous', 'ghen tỵ', 'thèm muốn'],
  'good night': ['gn', 'ngủ ngon nhé', 'chúc ngủ ngon nha'],
  'good morning': ['chào ngày mới', 'buổi sáng vui vẻ', 'dậy rồi', 'sáng rồi'],
  /* chủ đề mới (đời sống sinh viên) */
  'traffic jam': ['kẹt xe', 'tắc đường', 'kẹt đường', 'ùn tắc', 'tắc xe'],
  late: ['trễ giờ', 'đi trễ', 'muộn học', 'trễ học', 'trễ rồi', 'muộn rồi', 'sắp trễ', 'late'],
  lag: ['mất mạng', 'wifi yếu', 'lag', 'đơ máy', 'rớt mạng', 'mạng chậm', 'wifi lag', 'mạng lag'],
  'skip class': ['trốn học', 'cúp tiết', 'cúp học', 'nghỉ học', 'trốn tiết', 'bùng tiết'],
  workout: ['tập gym', 'gym', 'chạy bộ', 'tập thể dục', 'workout', 'đi gym'],
  'money rain': ['có lương', 'tiền về', 'được lương', 'trúng số', 'giàu rồi', 'có tiền', 'lì xì'],
  aww: ['xinh', 'xinh quá', 'đáng yêu', 'dễ thương', 'cute', 'dễ thương quá', 'đẹp quá', 'iu ghê'],
};

const TOPIC_WEIGHT = { hello: 0.85, yes: 0.7, no: 0.6, confused: 0.75, ok: 0.8, eating: 0.85, cool: 0.9, studying: 0.9, sad: 0.95 };

/** id → [nhãn hiển thị ("bạn đang ..."), emoji, truy vấn GIF khi cảm xúc MẠNH] */
const META = {
  'good night': ['chúc ngủ ngon', '🌙', 'good night sweet dreams'],
  'good morning': ['chào buổi sáng', '🌅', 'good morning energetic'],
  'oh no': ['gặp chuyện toang', '😱', 'oh no panic'],
  shocked: ['bị sốc', '😲', 'shocked omg'],
  awkward: ['ngại ngùng', '😅', 'awkward cringe'],
  scared: ['hơi sợ', '😨', 'scared terrified'],
  sulking: ['dỗi', '😤', 'sulking pouting'],
  jealous: ['ghen tị', '😒', 'jealous envy'],
  bored: ['chán chường', '🥱', 'so bored'],
  happy: ['vui vẻ', '😄', 'happy dance'],
  cool: ['thấy ngầu', '😎', 'cool sunglasses'],
  party: ['muốn đi quẩy', '🎉', 'party time'],
  rain: ['gặp trời mưa', '🌧️', 'heavy rain'],
  'hot weather': ['than nóng', '🥵', 'so hot sweating'],
  'cold weather': ['than lạnh', '🥶', 'freezing cold'],
  snack: ['thèm ăn vặt', '🍿', 'snack time'],
  lonely: ['hơi cô đơn', '🫥', 'lonely alone'],
  'present here': ['điểm danh', '🙋', 'present here roll call'],
  'deadline panic': ['chạy deadline', '⏰', 'deadline panic typing fast'],
  'exam stress': ['căng thẳng vì thi cử', '📝', 'exam stress panic'],
  celebrate: ['ăn mừng', '🥳', 'celebrate victory'],
  failed: ['gặp chuyện không may', '😵', 'epic fail'],
  studying: ['cày bài', '📚', 'studying hard'],
  'broke no money': ['cạn túi', '💸', 'broke no money'],
  'miss you': ['nhớ ai đó', '🥺', 'miss you so much'],
  blushing: ['đang đỏ mặt', '😳', 'blushing crush'],
  'thank you': ['cảm ơn', '🙏', 'thank you so much'],
  congratulations: ['chúc mừng', '👏', 'congratulations applause'],
  hello: ['chào hỏi', '👋', 'hello waving'],
  laughing: ['cười xỉu', '😂', 'laughing hysterically'],
  crying: ['rơi nước mắt', '😭', 'crying a lot'],
  sad: ['buồn', '😢', 'sad heartbroken'],
  angry: ['bực bội', '😠', 'angry furious'],
  love: ['thả thính', '🥰', 'love hearts'],
  tired: ['mệt', '😮‍💨', 'exhausted tired'],
  sleepy: ['buồn ngủ', '😴', 'so sleepy yawn'],
  hungry: ['đói', '🍜', 'starving hungry'],
  eating: ['ăn uống', '😋', 'eating yummy'],
  coffee: ['nạp caffeine', '☕', 'coffee addict'],
  bus: ['đi xe buýt', '🚌', 'bus ride'],
  ok: ['đồng ý', '👌', 'okay thumbs up'],
  facepalm: ['cạn lời', '🤦', 'facepalm'],
  wow: ['thán phục', '🤩', 'wow amazed'],
  sorry: ['xin lỗi', '🙇', 'so sorry apologize'],
  bye: ['tạm biệt', '👋', 'bye goodbye wave'],
  confused: ['khó hiểu', '🤔', 'confused what'],
  no: ['từ chối', '🙅', 'no way'],
  yes: ['đồng tình', '✅', 'yes absolutely'],
  dancing: ['muốn nhảy', '💃', 'dancing party'],
  /* chủ đề mới */
  'traffic jam': ['kẹt xe', '🚗', 'traffic jam stuck'],
  late: ['trễ giờ', '🏃', 'running late'],
  lag: ['mất kết nối', '📶', 'slow internet lag'],
  'skip class': ['định trốn tiết', '🏃', 'sneaking away'],
  workout: ['tập thể dục', '💪', 'workout gym'],
  'money rain': ['có tiền', '🤑', 'money rain rich'],
  aww: ['thấy đáng yêu', '🥹', 'aww cute'],
  /* chủ đề tổng hợp (do suy luận) */
  hug: ['cần một cái ôm', '🫂', 'warm hug'],
  'good luck': ['cần cổ vũ', '🍀', 'good luck fighting'],
  welcome: ['khách sáo', '😊', 'you are welcome'],
  'no worries': ['trấn an', '🤗', 'no worries its ok'],
  full: ['no bụng', '😌', 'full stomach'],
  energetic: ['tràn năng lượng', '⚡', 'energetic pumped'],
  awake: ['thức khuya', '🦉', 'cant sleep awake'],
  calm: ['bình tĩnh', '😌', 'calm down chill'],
  brave: ['dũng cảm', '🦁', 'brave fearless'],
  excited: ['hào hứng', '🤩', 'so excited'],
  reaction: ['phản ứng', '✨', 'reaction'],
};

/** Phủ định: "không buồn" → vui ... */
const OPPOSITE = {
  happy: 'sad', sad: 'happy', hungry: 'full', eating: 'hungry', tired: 'energetic', sleepy: 'awake',
  angry: 'calm', scared: 'brave', bored: 'excited', lonely: 'happy', failed: 'celebrate',
  'broke no money': 'money rain', crying: 'happy', 'oh no': 'calm', awkward: 'cool', cool: 'sad',
};
const GENERIC = new Set(['yes', 'ok', 'no', 'confused', 'hello']);
const COMFORT_TOPICS = new Set(['sad', 'crying', 'angry', 'scared', 'tired', 'lonely', 'failed', 'deadline panic', 'exam stress', 'bored', 'broke no money', 'miss you']);

/** Đồng cảm theo tin nhắn trước đó khi người dùng chỉ trả lời cụt */
const EMPATHY = {
  sad: 'hug', crying: 'hug', failed: 'hug', tired: 'hug', lonely: 'hug', 'broke no money': 'hug', 'miss you': 'hug', 'oh no': 'hug', scared: 'hug',
  'deadline panic': 'good luck', 'exam stress': 'good luck', studying: 'good luck',
  celebrate: 'congratulations', congratulations: 'congratulations', happy: 'happy', laughing: 'laughing',
  shocked: 'wow', wow: 'wow', love: 'aww', aww: 'aww', 'thank you': 'welcome', sorry: 'no worries',
  hungry: 'eating', party: 'party', bye: 'bye', hello: 'hello', 'good night': 'good night', 'good morning': 'good morning',
  angry: 'calm', 'money rain': 'wow', blushing: 'aww',
};

const EMOJI_HINTS = [
  [/[😂🤣😹]/gu, 'laughing'], [/[😭😢🥲]/gu, 'crying'], [/[😡🤬😠]/gu, 'angry'], [/[😴💤🥱]/gu, 'sleepy'],
  [/[❤️💕😍🥰😘💖]/gu, 'love'], [/[😱😨]/gu, 'shocked'], [/[🥺]/gu, 'aww'], [/[🔥💯]/gu, 'wow'],
  [/[🎉🥳🎊]/gu, 'celebrate'], [/[🙏]/gu, 'thank you'], [/[🤦]/gu, 'facepalm'], [/[🥵]/gu, 'hot weather'],
  [/[🥶]/gu, 'cold weather'], [/[🍜🍕🍔🍗]/gu, 'eating'], [/[☕🧋]/gu, 'coffee'], [/[👋]/gu, 'hello'],
  [/[🤔]/gu, 'confused'], [/[😎]/gu, 'cool'], [/[💸]/gu, 'broke no money'],
];

/* ============================================================
 * 2. CHUẨN HOÁ VĂN BẢN
 * ============================================================ */
const VI_MARKS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
export const hasVietnamese = (t) => VI_MARKS.test(t);
export const stripVi = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

const LAUGH_RE = /^(ha|hi|he|ho|hê|ka|kk|hj|ah){2,}h?$|^k{3,}$|^(lol|lmao|rofl|kaka)+$/i;
const NEG = new Set(['không', 'chưa', 'đừng', 'chẳng', 'chả', 'hổng', 'đếch']);
const INTENSE_WORDS = new Set(['quá', 'lắm', 'vãi', 'vl', 'vcl', 'vkl', 'cực', 'siêu', 'xỉu', 'điên', 'khủng', 'kinh', 'trời', 'thật', 'sự']);
const POS_WORDS = new Set(['tốt', 'thích', 'ngon', 'tuyệt', 'xịn', 'mê', 'hay', 'thú', 'đẹp', 'xinh', 'nice', 'good', 'great', 'được']);
const NEG_WORDS = new Set(['tệ', 'dở', 'ghét', 'khổ', 'phiền', 'đau', 'lo', 'xấu', 'bad', 'mệt', 'nản', 'thất', 'oải', 'căng', 'khó']);

/** Teencode → tiếng Việt chuẩn (chỉ ánh xạ 1 từ → 1 từ để giữ vị trí token) */
const TEEN = {
  ko: 'không', k: 'không', hok: 'không', hem: 'không', hông: 'không', khum: 'không', khong: 'không', kh: 'không',
  dc: 'được', đc: 'được', dk: 'được', j: 'gì', vs: 'với', mik: 'mình', mk: 'mình', ns: 'nói', r: 'rồi', ròi: 'rồi', roi: 'rồi',
  thik: 'thích', thix: 'thích', mún: 'muốn', wá: 'quá', wa: 'quá', qá: 'quá', zui: 'vui', dzui: 'vui', bùn: 'buồn',
  zậy: 'vậy', dzậy: 'vậy', hnay: 'nay', ny: 'yêu', bt: 'bthg', cx: 'cũng', nx: 'nữa', trc: 'trước',
};

const tokenize = (text) => {
  const cleaned = text.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.split(' ') : [];
};
const squeeze = (w) => w.replace(/(\p{L})\1{2,}/gu, '$1'); // "buồnnnn" → "buồn"

/* ---------- khoảng cách chỉnh sửa (chịu lỗi gõ sai) ---------- */
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/* ============================================================
 * 3. BIÊN DỊCH CHỈ MỤC TỪ KHOÁ (chạy 1 lần khi nạp module)
 * ============================================================ */
const MERGED = {};
BASE_TOPICS.forEach(([id, words]) => { MERGED[id] = [...words]; });
Object.entries(EXTRA_WORDS).forEach(([id, words]) => { MERGED[id] = [...(MERGED[id] || []), ...words]; });

/** Giữ lại để tương thích code cũ */
export const GIF_TOPICS = Object.entries(MERGED);

const INDEX = [];
Object.entries(MERGED).forEach(([id, words]) => {
  const seen = new Set();
  words.forEach((w) => {
    const toks = tokenize(w);
    const key = toks.join(' ');
    if (!toks.length || seen.has(key)) return;
    seen.add(key);
    INDEX.push({ id, toks, plain: toks.map(stripVi), n: toks.length, shortOnly: toks.length === 1 && toks[0].length <= 2 });
  });
});

/** Từ không dấu dễ trùng nghĩa khác: không cho khớp "gõ không dấu" */
const PLAIN_BLOCK = new Set(['ngu', 'nho', 'dang', 'ban', 'ngay', 'thuong', 'ghe', 'nong', 'nang']);

function tokenSim(tok, plain, phTok, phPlain, unaccentedMsg, single) {
  if (tok === phTok) return 1;
  const typedPlain = tok === plain; // người dùng gõ không dấu
  if (typedPlain && plain === phPlain && !(single && PLAIN_BLOCK.has(phPlain)) && phPlain.length >= (unaccentedMsg ? 3 : 4)) return 0.85;
  if (phPlain.length >= 5 && tok.length >= 4) {
    const max = phPlain.length >= 8 ? 2 : 1;
    const d = typedPlain ? lev(plain, phPlain, max) : lev(tok, phTok, max);
    if (d <= max) return d === 1 ? 0.72 : 0.6;
  }
  return 0;
}

function findMatches(toks, plains, unaccentedMsg) {
  const out = [];
  const L = toks.length;
  for (const ph of INDEX) {
    if (ph.n > L) continue;
    for (let i = 0; i + ph.n <= L; i += 1) {
      let sum = 0;
      let ok = true;
      for (let k = 0; k < ph.n; k += 1) {
        const s = tokenSim(toks[i + k], plains[i + k], ph.toks[k], ph.plain[k], unaccentedMsg, ph.n === 1);
        if (!s) { ok = false; break; }
        sum += s;
      }
      if (!ok) continue;
      const base = (sum / ph.n) * (1 + 0.35 * (ph.n - 1)) * (ph.shortOnly ? 0.6 : 1) * (TOPIC_WEIGHT[ph.id] || 1);
      out.push({ id: ph.id, s: i, e: i + ph.n, score: base });
    }
  }
  return out;
}

/* ============================================================
 * 4. CÁ NHÂN HOÁ (học từ GIF người dùng đã gửi)
 * ============================================================ */
const PREF_KEY = 'tc_gif_prefs_v1';
const sessionSent = new Set();
const readPrefs = () => {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch { return {}; }
};

/** Gọi khi người dùng bấm gửi một GIF được gợi ý → hệ thống "nhớ" gu của họ */
export function learnGif(topic, gif) {
  if (!gif?.id) return;
  sessionSent.add(gif.id);
  if (!topic) return;
  try {
    const prefs = readPrefs();
    const cur = prefs[topic] || { n: 0, ids: [] };
    cur.n += 1;
    cur.ids = [gif.id, ...cur.ids.filter((x) => x !== gif.id)].slice(0, 8);
    prefs[topic] = cur;
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch { /* localStorage bị chặn: bỏ qua */ }
}

/** Sắp xếp lại: GIF hay dùng lên đầu, GIF vừa gửi trong phiên này xuống cuối */
export function personalizeGifs(topic, items) {
  if (!Array.isArray(items) || !items.length) return items;
  const fav = new Set(topic ? readPrefs()[topic]?.ids || [] : []);
  const rank = (g) => (sessionSent.has(g.id) ? 2 : fav.has(g.id) ? 0 : 1);
  return items
    .map((g, i) => ({ g, i, r: rank(g) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(({ g, r }) => (r === 0 ? { ...g, fav: true } : g));
}

const topicPrior = (id) => {
  const n = readPrefs()[id]?.n || 0;
  return 1 + Math.min(0.15, n / 60);
};

/* ============================================================
 * 5. PHÂN TÍCH Ý ĐỊNH
 * ============================================================ */
const cache = new Map();

const pickQuery = (id, intensity, toks, hour) => {
  if (id === 'hello' && toks.length <= 3 && hour >= 5 && hour < 11) return { q: 'good morning', label: 'chào buổi sáng', emoji: '🌅' };
  const [label, emoji, intense] = META[id] || [id, '✨', id];
  return { q: intensity >= 0.5 && intense ? intense : id, label, emoji };
};

const headline = (conf, label, emoji, negated) => {
  if (negated) return `Mình hiểu ý bạn rồi — ${label} ${emoji}`;
  return conf >= 0.6 ? `Mình đoán bạn đang ${label} ${emoji}` : `Có vẻ bạn đang ${label} ${emoji}`;
};

function scoreIntensity(raw, toks, elongated, laughLen, emojiRepeat) {
  let v = 0;
  v += Math.min(0.6, toks.filter((w) => INTENSE_WORDS.has(w)).length * 0.3);
  if (elongated) v += 0.25;
  if ((raw.match(/!/g) || []).length >= 2) v += 0.2;
  const letters = raw.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) v += 0.3;
  if (laughLen >= 6) v += 0.3;
  if (emojiRepeat) v += 0.2;
  return Math.min(1, v);
}

/**
 * @param {string} text
 * @param {{context?: string[], hour?: number, noFallback?: boolean, debug?: boolean}} [opts]
 * @returns {null | {topic,query,baseQuery,label,emoji,headline,confidence,intensity,negated,source,matches?}}
 */
export function analyzeGifIntent(text, opts = {}) {
  const raw = String(text ?? '').trim();
  if (!raw || raw.length > 140 || /^[/@]/.test(raw) || /https?:\/\//i.test(raw)) return null;
  const hour = opts.hour ?? new Date().getHours();
  const ctx = (opts.context || []).slice(-3);
  const key = `${raw}|${ctx.join('¦')}|${hour >= 5 && hour < 11 ? 'm' : 'x'}|${opts.noFallback ? 1 : 0}`;
  if (!opts.debug && cache.has(key)) return cache.get(key);

  const result = run(raw, ctx, hour, opts);
  if (cache.size > 300) cache.clear();
  if (!opts.debug) cache.set(key, result);
  return result;
}

function run(raw, ctx, hour, opts) {
  /* --- tách từ, giải teencode, nhận diện tiếng cười --- */
  const toks = [];
  const laughAt = [];
  let elongated = false;
  let laughLen = 0;
  tokenize(raw).forEach((w) => {
    if (LAUGH_RE.test(w)) { laughAt.push(toks.length); laughLen = Math.max(laughLen, w.length); toks.push('·'); return; }
    const sq = squeeze(w);
    if (sq !== w) elongated = true;
    toks.push(TEEN[sq] || sq);
  });
  const plains = toks.map(stripVi);
  const unaccentedMsg = !hasVietnamese(raw);
  const L = Math.max(1, toks.length);

  /* --- khớp từ khoá + tiếng cười --- */
  let matches = findMatches(toks, plains, unaccentedMsg);
  laughAt.forEach((i) => matches.push({ id: 'laughing', s: i, e: i + 1, score: 1.3 }));

  /* "đi không?", "có ai ở đây không?" → 'không' cuối câu chỉ là từ để hỏi */
  if (toks.length > 1) matches = matches.filter((m) => !(m.id === 'no' && m.e - m.s === 1 && m.s === toks.length - 1 && toks[m.s] === 'không'));

  /* --- phân xử chồng lấn: điểm cao (cụm dài) thắng --- */
  matches.sort((a, b) => b.score - a.score || (b.e - b.s) - (a.e - a.s));
  const taken = new Array(toks.length).fill(false);
  matches = matches.filter((m) => {
    for (let i = m.s; i < m.e; i += 1) if (taken[i]) return false;
    for (let i = m.s; i < m.e; i += 1) taken[i] = true;
    return true;
  });

  /* --- phủ định --- */
  let negated = false;
  const dropNo = new Set();
  matches.forEach((m) => {
    if (m.id === 'no' || m.id === 'confused' || m.id === 'ok') return;
    for (const j of [m.s - 1, m.s - 2]) {
      if (j < 0 || !NEG.has(toks[j])) continue;
      const opposite = toks[j] === 'đừng' && COMFORT_TOPICS.has(m.id) ? 'hug' : OPPOSITE[m.id];
      dropNo.add(j);
      if (opposite) { m.id = opposite; negated = true; } else { m.score *= 0.3; }
      break;
    }
  });
  matches = matches.filter((m) => !(m.id === 'no' && m.e - m.s === 1 && dropNo.has(m.s)));

  /* --- tổng hợp điểm theo chủ đề (vế cuối câu nặng hơn) --- */
  const scores = {};
  matches.forEach((m) => {
    const pos = 0.8 + 0.2 * (m.e / L);
    scores[m.id] = (scores[m.id] || 0) + m.score * pos;
  });
  let emojiRepeat = false;
  EMOJI_HINTS.forEach(([re, id]) => {
    const hits = raw.match(re);
    if (hits) { scores[id] = (scores[id] || 0) + 1.1; if (hits.length >= 2) emojiRepeat = true; }
  });
  Object.keys(scores).forEach((id) => { scores[id] *= topicPrior(id); });

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const intensity = scoreIntensity(raw, toks, elongated, laughLen, emojiRepeat);
  const dbg = opts.debug ? { matches: matches.map((m) => ({ ...m, phrase: toks.slice(m.s, m.e).join(' ') })), scores, intensity } : {};

  const build = (id, source, confidence, head) => {
    const { q, label, emoji } = pickQuery(id, intensity, toks, hour);
    return {
      topic: id, query: q, baseQuery: id, label, emoji, confidence, intensity, negated, source,
      headline: head || headline(confidence, label, emoji, negated), ...dbg,
    };
  };

  if (ranked.length) {
    const [topId, top] = ranked[0];
    const second = ranked[1]?.[1] || 0;
    const confidence = Math.max(0.15, Math.min(1, (top / (top + 0.55)) * (1 - 0.25 * (second / top))));
    const source = laughAt.length && topId === 'laughing' ? 'keyword' : emojiRepeat || !matches.length ? 'emoji' : 'keyword';
    const weakGeneric = GENERIC.has(topId) && confidence < 0.75 && toks.length <= 4;
    if (weakGeneric && ctx.length) {
      const prev = analyzeGifIntent(ctx[ctx.length - 1], { noFallback: true, hour });
      const target = prev && EMPATHY[prev.topic];
      if (target) return build(target, 'context', 0.55, `Đồng cảm với tin nhắn vừa rồi ${META[target][1]}`);
    }
    if (confidence >= 0.4 || opts.noFallback) return build(topId, source, confidence);
  }
  if (opts.noFallback) return null;
  if (raw.length < 2) return null;

  /* --- bối cảnh: trả lời cụt → đồng cảm với tin nhắn trước --- */
  if (ctx.length && toks.length <= 4) {
    const prev = analyzeGifIntent(ctx[ctx.length - 1], { noFallback: true, hour });
    const target = prev && EMPATHY[prev.topic];
    if (target) return build(target, 'context', 0.55, `Đồng cảm với tin nhắn vừa rồi ${META[target][1]}`);
  }

  /* --- tiếng Anh/ký tự lạ: dùng chính câu gõ làm từ khoá --- */
  if (!hasVietnamese(raw) && !/\b(ko|k|dc|vs|mik|zui|hok|khong|buon|doi|met|ngu)\b/i.test(raw)) {
    const tail = raw.split(/\s+/).slice(-4).join(' ').slice(0, 40);
    if (tail.length < 3) return null;
    return { topic: null, query: tail, baseQuery: tail, label: tail, emoji: '🔎', confidence: 0.3, intensity, negated: false, source: 'raw', headline: `Tìm GIF cho "${tail}" 🔎`, ...dbg };
  }
  if (raw.length < 3) return null;

  /* --- cảm xúc chung: tích cực / tiêu cực --- */
  const pos = toks.filter((w) => POS_WORDS.has(w)).length;
  const neg = toks.filter((w) => NEG_WORDS.has(w)).length;
  if (pos > neg) return build('happy', 'sentiment', 0.4, 'Mình thấy tâm trạng bạn khá tích cực 😊');
  if (neg > pos) return build('hug', 'sentiment', 0.4, 'Nghe có vẻ hơi mệt mỏi, gửi bạn cái ôm 🫂');

  /* --- dấu câu --- */
  if (/\?\s*$/.test(raw)) return build('confused', 'punctuation', 0.35, 'Bạn đang thắc mắc điều gì đó 🤔');
  if (/!\s*$/.test(raw)) return build('excited', 'punctuation', 0.35, 'Nghe có vẻ hào hứng đó 🤩');
  return build('reaction', 'fallback', 0.2, 'GIF phản ứng hợp với câu này ✨');
}

/* ============================================================
 * 6. API TƯƠNG THÍCH CODE CŨ
 * ============================================================ */
/** Từ khoá Giphy cho ô tìm GIF thủ công ("buồn" → "sad"); null nếu không hiểu */
export const topicOf = (text) => {
  const r = analyzeGifIntent(text, { noFallback: true });
  return r ? r.baseQuery : null;
};

/** Từ khoá gợi ý khi đang gõ; '' = không gợi ý */
export const buildSuggestQuery = (text, opts) => {
  const t = String(text ?? '').trim();
  if (t.length < 2) return '';
  return analyzeGifIntent(t, opts)?.query || '';
};
