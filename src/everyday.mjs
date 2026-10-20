// Everyday AI advice for anyone (writers, students, designers, marketers…), used by the website.
// Plain ES module with no Node imports, so the browser can load it as is.

/** Kinds of task, checked in order; the first whose words match wins. `needs` are app abilities, most important first. */
export const KINDS = [
  { id: "coding", label: { en: "Code", hi: "कोड" }, words: /\b(code|coding|program|python|javascript|java|html|css|sql|api|bug|app banana|website banana|github)\b/i, needs: ["coding", "coding-agent"] },
  { id: "music", label: { en: "Music & songs", hi: "संगीत और गाने" }, words: /\b(song|songs|music|gaana|gana|jingle|beat|lyrics)\b/i, needs: ["music", "songs"] },
  { id: "voice", label: { en: "Voice & voiceover", hi: "आवाज़ और वॉइसओवर" }, words: /\b(voiceover|voice over|voice|narrat\w*|podcast|awaaz|text to speech|dubbing)\b/i, needs: ["voice", "voiceover"] },
  { id: "video", label: { en: "Video", hi: "वीडियो" }, words: /\b(video|reel|reels|youtube|shorts|clip|vlog)\b/i, needs: ["video"] },
  { id: "presentations", label: { en: "Presentations", hi: "प्रेज़ेंटेशन" }, words: /\b(presentation|slides|slide|ppt|deck|pitch)\b/i, needs: ["presentations"] },
  { id: "design", label: { en: "Design & social posts", hi: "डिज़ाइन और सोशल पोस्ट" }, words: /\b(design|instagram|insta|social media|post design|thumbnail|flyer|brochure|invitation|card|banner)\b/i, needs: ["design", "social-posts", "images"] },
  { id: "images", label: { en: "Images", hi: "तस्वीरें" }, words: /\b(image|images|photo|picture|logo|illustration|poster|art|drawing|painting|wallpaper|tasveer|avatar)\b/i, needs: ["images", "art"] },
  { id: "study", label: { en: "Study from your notes", hi: "अपने नोट्स से पढ़ाई" }, words: /\b(study|notes|exam|revision|revise|chapter|textbook|padhai|syllabus|lecture|quiz)\b/i, needs: ["study", "long-documents", "sources"] },
  { id: "data", label: { en: "Data & spreadsheets", hi: "डेटा और स्प्रेडशीट" }, words: /\b(excel|spreadsheet|csv|sheet|data|chart|graph|analy[sz]e|analysis|dashboard)\b/i, needs: ["data", "files"] },
  { id: "research", label: { en: "Research", hi: "रिसर्च" }, words: /\b(research|latest|news|compare|comparison|find|sources|review|reviews|best \w+ (?:for|under)|kaunsa|kya hai|today|price|prices)\b/i, needs: ["web-search", "sources"] },
  { id: "translation", label: { en: "Translation", hi: "अनुवाद" }, words: /\b(translate|translation|anuvad|to hindi|to english|in hindi|in english)\b/i, needs: ["translation"] },
  { id: "math", label: { en: "Maths", hi: "गणित" }, words: /\b(math|maths|equation|solve|calculate|calculation|algebra|sawal|sawaal)\b/i, needs: ["math"] },
  { id: "email", label: { en: "Emails, letters & resumes", hi: "ईमेल, पत्र और रिज़्यूमे" }, words: /\b(email|mail|letter|application|resume|cv|cover letter|proofread|grammar)\b/i, needs: ["writing", "grammar"] },
  { id: "writing", label: { en: "Writing", hi: "लेखन" }, words: /\b(write|writing|essay|blog|story|caption|poem|article|script|likh\w*|speech)\b/i, needs: ["writing"] },
];

const CHAT = { id: "chat", label: { en: "General help", hi: "सामान्य मदद" }, needs: ["chat"] };

const ABILITY = {
  writing: "writes and edits text",
  chat: "answers questions in a chat",
  images: "makes images from a description",
  art: "is known for artistic images",
  "web-search": "searches the web",
  sources: "shows its sources",
  files: "reads files you upload",
  "long-documents": "reads long documents",
  study: "answers only from your own notes",
  "audio-summary": "turns your notes into a podcast-style summary",
  data: "analyses spreadsheets and makes charts",
  voice: "speaks and listens",
  voiceover: "creates natural voiceovers",
  "translation-audio": "translates spoken audio",
  video: "makes or edits video",
  design: "has ready-made design templates",
  presentations: "builds slides for you",
  "social-posts": "makes social media posts",
  documents: "makes documents",
  websites: "makes simple web pages",
  music: "makes music",
  songs: "makes full songs with vocals",
  grammar: "fixes grammar and tone",
  coding: "writes and fixes code",
  "coding-agent": "can work inside your project",
  "inline-code": "suggests code as you type",
  translation: "translates between languages",
  math: "solves problems step by step",
  "google-apps": "works inside Gmail and Docs",
  "office-apps": "works inside Word and Excel",
};

const PROMPTS = {
  writing: "Write: {task}. First ask me up to 3 short questions about who it is for, the tone and the length. Then give a draft with a clear title and short paragraphs.",
  email: "Write: {task}. Keep it polite and clear, under 150 words, with a subject line. Then list anything I should fill in.",
  research: "Research: {task}. Use recent, reliable sources and link each one. End with a short summary and anything that is still uncertain.",
  study: "I will upload my notes. Using only them, help me with: {task}. Give a short summary, the 10 key points, and 5 quiz questions with answers.",
  images: "Create an image: {task}. Style: [photo / illustration / 3D]. Mood: [...]. Colours: [...]. Size: [square / wide]. No text in the image unless I ask.",
  design: "Design: {task}. Audience: [...]. Include a headline, short supporting text and one call to action. Give me 3 layout options.",
  presentations: "Make a presentation about: {task}. 8 to 10 slides, one idea per slide, short bullet points, speaker notes and a closing summary slide.",
  video: "Plan a short video: {task}. Give a hook for the first 3 seconds, a scene-by-scene script with timings, on-screen text and a call to action.",
  music: "Make a song: {task}. Genre: [...]. Mood: [...]. Language: [...]. About 2 minutes long, with a catchy chorus.",
  voice: "Turn this into a natural voiceover: {task}. Speaking style: [calm / energetic]. Language: [...]. Medium pace.",
  data: "I will upload a spreadsheet. {task}. First describe the columns you see, then answer with a table and one simple chart, and explain the result in plain words.",
  coding: "Help me with: {task}. Ask about my language and setup first, explain your plan before writing code, and tell me how to test it.",
  translation: "Translate into [language], keeping the meaning and tone natural, not word for word: {task}",
  math: "Solve step by step and explain each step simply: {task}. Check the answer at the end.",
  chat: "Help me with: {task}. Ask me any question you need first, then give a clear, short answer.",
};

const MAX_BEST = 3;

export function taskKind(text) {
  return KINDS.find((kind) => kind.words.test(String(text))) ?? CHAT;
}

function why(app, needs) {
  const matched = needs.filter((need) => app.can.includes(need));
  return [...matched, app.free ? "free-plan" : null]
    .filter(Boolean)
    .slice(0, 3)
    .map((tag) => (tag === "free-plan" ? "has a free plan" : ABILITY[tag]))
    .join(", ");
}

/** Best apps for an everyday task: by abilities the task needs (the first counts double), then list order. */
export function everydayAdvice(task, apps) {
  const clean = String(task ?? "").trim();
  if (!clean) return null;
  const kind = taskKind(clean);
  const score = (app) => kind.needs.reduce((sum, need, i) => sum + (app.can.includes(need) ? (i === 0 ? 2 : 1) : 0), 0);
  const ranked = apps
    .map((app, order) => ({ app, order, score: score(app) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ app }) => ({ ...app, why: why(app, kind.needs) }));
  const best = ranked.slice(0, MAX_BEST);
  const free = ranked.find((app) => app.free) ?? null;
  const prompt = PROMPTS[kind.id].replace("{task}", clean.replace(/[.\s]+$/, ""));
  const hint = kind.id === "coding" ? "Coding in a project on your laptop? Run npx which-ai-to-use there for advice based on the AI tools you have installed." : null;
  return { kind, best, free, prompt, hint };
}
