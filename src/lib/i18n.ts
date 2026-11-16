export type Lang = "en" | "hi";

const en = {
  allSubjects: "All subjects",
  section: "Section",
  all: "All",
  previous: "Previous",
  markReview: "Mark for review",
  clear: "Clear response",
  saveNext: "Save & Next",
  submit: "Submit test",
  palette: "Question palette",
  attempted: "Attempted",
  notAttempted: "Not attempted",
  marked: "Marked",
  markedAnswered: "Answered & marked",
  timeLeft: "Time Left",
  screenSwitches: "Screen switches",
  fullscreenTitle: "Full screen required",
  fullscreenBody:
    "This NEET CBT must run in full screen. Leaving full screen, switching tabs/windows, or pressing Esc is tracked. Progress is checkpointed on the server.",
  startFullscreen: "Start exam in full screen",
  attemptSlots: "Attempt slots",
  language: "Language",
  paperLangNote:
    "Question text follows the English paper extract. Hindi UI labels are available; full Hindi stems require the bilingual booklet OCR (see gaps).",
  figureMissing: "Figure not available in this digital extract",
  figureSchematic: "Schematic figure (PDF crop unavailable)",
  syncOffline: "Network issue — answers queued locally, timer uses server clock",
  retrySync: "Retry sync now",
};

const hi: typeof en = {
  allSubjects: "सभी विषय",
  section: "खंड",
  all: "सभी",
  previous: "पिछला",
  markReview: "समीक्षा के लिए चिह्नित",
  clear: "उत्तर साफ़ करें",
  saveNext: "सेव एवं अगला",
  submit: "टेस्ट जमा करें",
  palette: "प्रश्न पैलेट",
  attempted: "उत्तर दिया",
  notAttempted: "उत्तर नहीं दिया",
  marked: "चिह्नित",
  markedAnswered: "उत्तर दिया और चिह्नित",
  timeLeft: "शेष समय",
  screenSwitches: "स्क्रीन स्विच",
  fullscreenTitle: "पूर्ण स्क्रीन आवश्यक",
  fullscreenBody:
    "यह NEET CBT पूर्ण स्क्रीन में चलना चाहिए। स्क्रीन छोड़ना / टैब बदलना / Esc ट्रैक होता है। प्रगति सर्वर पर सेव होती है।",
  startFullscreen: "पूर्ण स्क्रीन में परीक्षा शुरू करें",
  attemptSlots: "प्रयास सीमा",
  language: "भाषा",
  paperLangNote:
    "प्रश्न पाठ अंग्रेज़ी पेपर एक्सट्रैक्ट से हैं। हिंदी UI उपलब्ध है; पूर्ण हिंदी स्टेम के लिए द्विभाषी बुकलेट OCR आवश्यक (gaps देखें)।",
  figureMissing: "इस डिजिटल एक्सट्रैक्ट में आकृति उपलब्ध नहीं",
  figureSchematic: "योजनाबद्ध आकृति (PDF क्रॉप अनुपलब्ध)",
  syncOffline: "नेटवर्क समस्या — उत्तर स्थानीय कतार में, टाइमर सर्वर घड़ी से",
  retrySync: "अभी सिंक पुनः प्रयास",
};

export const messages: Record<Lang, typeof en> = { en, hi };

export function t(lang: Lang) {
  return messages[lang] ?? messages.en;
}
