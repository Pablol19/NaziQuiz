const STORAGE_KEY_BASE = "gts_profile_v4";
const DAILY_QUESTIONS = 10;
const ANSWER_TRANSITION_MS = 1800;
const HOME_SWAP_MS = 260;

/* ── Quiz Catalog (categories + quizzes) ── */
const QUIZ_CATALOG = {
  categories: [
    {
      id: "politics",
      name: "🏛️ Política & Poder",
      quizzes: [
        { id: "classic", label: "Trump vs Hitler vs Ye", file: "question-bank.json", free: true },
        { id: "tye", label: "Trump vs Elon vs Ye", file: "question-bank-trump-elon-ye.json", free: true }
      ]
    },
    {
      id: "tech",
      name: "💻 Tech Titans",
      quizzes: [
        { id: "ejz", label: "Elon vs Jobs vs Zuck", file: "question-bank-elon-jobs-zuck.json", free: true }
      ]
    }
  ]
};

// Derived flat lookup for backward compatibility
const QUIZ_CONFIGS = {};
QUIZ_CATALOG.categories.forEach(cat => {
  cat.quizzes.forEach(q => {
    QUIZ_CONFIGS[q.id] = { label: q.label, file: q.file };
  });
});

const ALL_QUIZ_IDS = Object.keys(QUIZ_CONFIGS);
const DEFAULT_QUIZ_ID = ALL_QUIZ_IDS[0] || "classic";
const STREAK_MILESTONES = [3, 7, 14, 30];
const MYSTERY_REWARDS = ["Fire Badge", "Neon Crown", "Iron Mind", "Night Owl", "Gold Pulse"];
const FRIEND_NAMES = ["Ari", "Noa", "Sergi", "Luna", "Mia", "Diego", "Vera", "Iris", "Nico", "Alex"];
const SESSION_KEY = `${STORAGE_KEY_BASE}:session_state`;
const THEME_KEY = `${STORAGE_KEY_BASE}:theme`;
const THEME_OPTIONS = [
  { id: "light", label: "Claro" },
  { id: "soft-night", label: "Suave" },
  { id: "sunset", label: "Atardecer" },
  { id: "mint", label: "Menta" },
  { id: "midnight", label: "Noche" }
];
const THEME_IDS = new Set(THEME_OPTIONS.map((option) => option.id));

function getSavedTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return THEME_IDS.has(stored) ? stored : "light";
}

function applyTheme(themeId) {
  const next = THEME_IDS.has(themeId) ? themeId : "light";
  if (document.body) document.body.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

/* ── Subtle SFX Engine (Web Audio API) ── */
const SFX = (() => {
  let ctx = null;
  let enabled = localStorage.getItem("gts_sfx") !== "off";

  function getCtx() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function play(fn) {
    if (!enabled) return;
    const c = getCtx();
    if (!c) return;
    try { fn(c); } catch (e) { /* silent */ }
  }

  return {
    get on() { return enabled; },
    toggle() {
      enabled = !enabled;
      localStorage.setItem("gts_sfx", enabled ? "on" : "off");
      return enabled;
    },
    pop() {
      play(c => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(600, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(900, c.currentTime + 0.06);
        g.gain.setValueAtTime(0.12, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime); o.stop(c.currentTime + 0.1);
      });
    },
    correct() {
      play(c => {
        [523, 659, 784].forEach((freq, i) => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = "sine"; o.frequency.value = freq;
          const t = c.currentTime + i * 0.08;
          g.gain.setValueAtTime(0.1, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.connect(g); g.connect(c.destination);
          o.start(t); o.stop(t + 0.18);
        });
      });
    },
    wrong() {
      play(c => {
        const o = c.createOscillator();
        const g = c.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(220, c.currentTime);
        o.frequency.exponentialRampToValueAtTime(140, c.currentTime + 0.15);
        g.gain.setValueAtTime(0.12, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.2);
        o.connect(g); g.connect(c.destination);
        o.start(c.currentTime); o.stop(c.currentTime + 0.2);
      });
    },
    fanfare() {
      play(c => {
        [523, 659, 784, 1047].forEach((freq, i) => {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = "sine"; o.frequency.value = freq;
          const t = c.currentTime + i * 0.12;
          g.gain.setValueAtTime(0.08, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          o.connect(g); g.connect(c.destination);
          o.start(t); o.stop(t + 0.35);
        });
      });
    }
  };
})();

const dataNode = document.querySelector("#quiz-data");
const dailyDateNode = document.querySelector("#daily-date");
const dailyStatusNode = document.querySelector("#daily-status");
const dailyGameNode = document.querySelector("#daily-game");
const dailySectionNode = document.querySelector("#daily");
const rankingSectionNode = document.querySelector("#ranking");
const leaderboardBody = document.querySelector("#leaderboard-body");
const historyList = document.querySelector("#history-list");
const resetTimerNode = document.querySelector("#reset-timer");
const playersTodayNode = document.querySelector("#players-today");
// quiz-selector removed — daily quiz auto-rotates

const goalCardNode = document.querySelector("#goal-card");
const streakCardNode = document.querySelector("#streak-card");
const nextRewardNode = document.querySelector("#next-reward");
const missionCardNode = document.querySelector("#mission-card");
const heatmapNode = document.querySelector("#consistency-heatmap");
const historyRadarNode = document.querySelector("#history-radar");
const achievementsNode = document.querySelector("#achievements");
const nextAchievementNode = document.querySelector("#next-achievement");
const percentileChipNode = document.querySelector("#percentile-chip");
const comebackPromptNode = document.querySelector("#comeback-prompt");
const trendChartNode = document.querySelector("#score-trend-chart");
const rankingViewNode = document.querySelector("#ranking-view-mode");
const rankingModeNode = document.querySelector("#ranking-mode");
const rankingDailyViewNode = document.querySelector("#ranking-daily-view");
const weeklyLeagueNode = document.querySelector("#weekly-league");
const rankingViewHintNode = document.querySelector("#ranking-view-hint");
const roomCodeNode = document.querySelector("#room-code");
const applyRoomNode = document.querySelector("#apply-room");
const rankingSearchInput = document.querySelector("#ranking-search-input");
const rankingSearchButton = document.querySelector("#ranking-search-btn");
const rankingSearchResultNode = document.querySelector("#ranking-search-result");
const weeklyLeagueSummaryNode = document.querySelector("#weekly-league-summary");
const weeklyLeagueTableNode = document.querySelector("#weekly-league-table");
const weeklySummaryNode = document.querySelector("#weekly-summary");
const personalRecordsNode = document.querySelector("#personal-records");
const uxSummaryNode = document.querySelector("#ux-summary");
const profileNameInput = document.querySelector("#profile-name-input");
const profileSaveButton = document.querySelector("#profile-save");
const profileNameChip = document.querySelector("#pd-name");
const socialToggleButton = document.querySelector("#social-toggle");
const socialCloseButton = document.querySelector("#social-close");
const socialDrawer = document.querySelector("#social-drawer");
const socialBackdrop = document.querySelector("#social-backdrop");
const friendNameInput = document.querySelector("#friend-name-input");
const friendAddButton = document.querySelector("#friend-add");
const friendsListNode = document.querySelector("#friends-list");
const topThemeSelect = document.querySelector("#top-theme-select");

const statStreak = document.querySelector("#stat-streak");
const statBestStreak = document.querySelector("#stat-best-streak");
const statAccuracy = document.querySelector("#stat-accuracy");
const statPercentile = document.querySelector("#stat-percentile");
const statShield = document.querySelector("#stat-shield");
const statLevel = document.querySelector("#stat-level");
const statXp = document.querySelector("#stat-xp");
const streakFireNode = document.querySelector("#streak-fire");
const streakStatCardNode = document.querySelector("#streak-stat-card");
const xpBarNode = document.querySelector("#xp-bar");

const appState = {
  quizId: DEFAULT_QUIZ_ID,
  speakers: [],
  quizData: null,
  todayKey: "",
  dailyQuestions: [],
  inProgress: false,
  locked: false,
  questionIndex: 0,
  score: 0,
  startedAt: 0,
  todayResult: null,
  profile: null,
  playerCount: 0,
  percentile: null,
  streakAtRisk: false,
  shieldAvailable: true,
  weeklyProgress: 0,
  nearMiss: false,
  lastReward: "",
  leaderboardSize: 0,
  bestScoreToday: 0,
  rankDelta: null,
  leaderboardRows: [],
  dailyMission: null,
  rankingView: "daily",
  rankingMode: "global",
  roomCode: "",
  practiceMode: false,
  consecutiveCorrect: 0
};

applyTheme(getSavedTheme());

function getDailyQuizId(dateKey) {
  const hash = hashString(`daily-quiz-rotation:${dateKey}`);
  return ALL_QUIZ_IDS[hash % ALL_QUIZ_IDS.length];
}

function isQuizUnlocked(quizEntry, playerLevel) {
  if (quizEntry.free) return true;
  return playerLevel >= (quizEntry.unlockLevel || 999);
}

function getSelectedQuizId() {
  // For official daily matches, always use the rotation
  return getDailyQuizId(toDateKey(new Date()));
}

function getStorageKey() {
  return `${STORAGE_KEY_BASE}:${appState.quizId}`;
}

function getRankingPrefKey() {
  return `${STORAGE_KEY_BASE}:ranking_pref`;
}

function getSpeakerList(questions) {
  const speakers = new Set();
  questions.forEach((question) => {
    if (question && question.speaker) speakers.add(question.speaker);
  });
  return [...speakers];
}

function getMonthKey(dateKey) {
  return dateKey.slice(0, 7);
}

function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getWeekKey(dateKey) {
  const date = parseDateKey(dateKey);
  const temp = new Date(date.getTime());
  temp.setHours(0, 0, 0, 0);
  temp.setDate(temp.getDate() + 4 - (temp.getDay() || 7));
  const yearStart = new Date(temp.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((temp - yearStart) / 86400000 + 1) / 7);
  return `${temp.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function daysBetween(fromKey, toKey) {
  const a = parseDateKey(fromKey);
  const b = parseDateKey(toKey);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / 86400000);
}

function createDefaultProfile() {
  return {
    displayName: "You",
    streakCurrent: 0,
    streakBest: 0,
    totalMatches: 0,
    totalCorrect: 0,
    totalAnswers: 0,
    lastPlayedDate: "",
    shieldUsesMonth: {},
    weeklyCompletions: {},
    achievements: [],
    lastRewardDate: "",
    lastReward: "",
    xp: 0,
    uxMetrics: {
      ctaClicks: 0,
      startsOfficial: 0,
      practiceStarts: 0,
      completedOfficial: 0,
      abandonByQuestion: {}
    },
    friends: [],
    consistencyMap: {},
    history: []
  };
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getYesterdayKey(todayKey) {
  const parts = todayKey.split("-").map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

function getStartOfWeek(dateKey) {
  const date = parseDateKey(dateKey);
  const weekdayMonFirst = (date.getDay() + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - weekdayMonFirst);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithRandom(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function inferTheme(quote) {
  const text = (quote || "").toLowerCase();
  if (/god|chosen|destiny|providence|heaven/.test(text)) return "A. God complex / Messiah / Destiny";
  if (/unfair|blame|fault|victim|persecut/.test(text)) return "B. Paranoia / Persecution / Victimhood";
  if (/media|press|news|propaganda|truth|lie/.test(text)) return "C. Media hostility / Fake News / Propaganda";
  if (/genius|greatest|best|smart|brain|number one|i\s+am/.test(text)) return "D. Extreme narcissism / self-aggrandizement";
  if (/win|winner|loser|fight|force|strength|victor|brutal|defeat/.test(text)) {
    return "E. Social Darwinism / winning at all costs / retaliation";
  }
  if (/dream|sleep|magnet|future|present|volcanic/.test(text)) return "F. Surreal metaphors / stream of consciousness";
  if (/intellectual|school|book|education|professor|intelligence/.test(text)) {
    return "G. Anti-intellectualism / instinct over academics";
  }
  return "H. Loyalty, purity, and mass manipulation";
}

function themeHint(theme) {
  if (theme.startsWith("A")) return "messianic self-image";
  if (theme.startsWith("B")) return "persecution framing";
  if (theme.startsWith("C")) return "anti-media rhetoric";
  if (theme.startsWith("D")) return "ego-heavy language";
  if (theme.startsWith("E")) return "aggressive winner-take-all logic";
  if (theme.startsWith("F")) return "surreal phrasing";
  if (theme.startsWith("G")) return "anti-intellectual tone";
  return "mass-influence language";
}

function makeDistractorRationale(optionName, actualSpeaker, theme) {
  return `This can sound like ${optionName} because of ${themeHint(theme)}, but the documented source points to ${actualSpeaker}.`;
}

function parseInlineData() {
  if (!dataNode) return null;
  try {
    return JSON.parse(dataNode.textContent);
  } catch (error) {
    return null;
  }
}

function normalizeQuestion(rawQuestion, index) {
  const quote = String(rawQuestion.quote || "").trim();
  if (!quote) return null;

  const theme = rawQuestion.theme || inferTheme(quote);

  if (Array.isArray(rawQuestion.options) && rawQuestion.options.length) {
    const options = rawQuestion.options.map((option) => ({
      name: option.name,
      isCorrect: Boolean(option.isCorrect),
      rationale: option.rationale || ""
    }));

    const correct = options.find((option) => option.isCorrect);
    const speaker = rawQuestion.speaker || (correct ? correct.name : "Unknown");
    const context = rawQuestion.context || (correct ? correct.rationale : "");

    return {
      id: rawQuestion.id || index + 1,
      quote,
      theme,
      speaker,
      context,
      options
    };
  }

  const speaker = rawQuestion.speaker || rawQuestion.answer || "Unknown";
  const context = rawQuestion.context || "Source listed in the question bank.";
  const speakers = appState.speakers.length ? appState.speakers : getSpeakerList([rawQuestion]);
  const optionSeed = mulberry32(hashString(`options:${index}:${quote}`));

  const options = shuffleWithRandom(
    speakers.map((name) => ({
      name,
      isCorrect: name === speaker,
      rationale: name === speaker ? `Correct. ${context}` : makeDistractorRationale(name, speaker, theme)
    })),
    optionSeed
  );

  return {
    id: rawQuestion.id || index + 1,
    quote,
    theme,
    speaker,
    context,
    options
  };
}

function normalizeQuizData(rawData) {
  if (!rawData || !Array.isArray(rawData.questions)) return null;
  appState.speakers = getSpeakerList(rawData.questions);

  const questions = rawData.questions
    .map((question, index) => normalizeQuestion(question, index))
    .filter(Boolean);

  return {
    title: rawData.title || "Who said it?",
    language: rawData.language || "English",
    questions
  };
}

async function loadQuizData(quizId) {
  const quizConfig = QUIZ_CONFIGS[quizId] || QUIZ_CONFIGS[DEFAULT_QUIZ_ID];
  try {
    const response = await fetch(quizConfig.file, { cache: "no-store" });
    if (response.ok) {
      const remoteData = await response.json();
      const normalizedRemote = normalizeQuizData(remoteData);
      if (normalizedRemote && normalizedRemote.questions.length) return normalizedRemote;
    }
  } catch (error) {
    // Fallback to inline data for classic set.
  }

  if (quizId === DEFAULT_QUIZ_ID) {
    const inlineData = parseInlineData();
    return normalizeQuizData(inlineData);
  }

  return null;
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultProfile(),
      ...parsed,
      history: Array.isArray(parsed.history) ? parsed.history : [],
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
      shieldUsesMonth: parsed.shieldUsesMonth || {},
      weeklyCompletions: parsed.weeklyCompletions || {},
      consistencyMap: parsed.consistencyMap || {},
      uxMetrics: {
        ...createDefaultProfile().uxMetrics,
        ...(parsed.uxMetrics || {}),
        abandonByQuestion: (parsed.uxMetrics && parsed.uxMetrics.abandonByQuestion) || {}
      },
      friends: Array.isArray(parsed.friends) ? parsed.friends : []
    };
  } catch (error) {
    return createDefaultProfile();
  }
}

function saveProfile() {
  localStorage.setItem(getStorageKey(), JSON.stringify(appState.profile));
}

function ensureUxMetrics() {
  if (!appState.profile.uxMetrics) appState.profile.uxMetrics = createDefaultProfile().uxMetrics;
  if (!appState.profile.uxMetrics.abandonByQuestion) appState.profile.uxMetrics.abandonByQuestion = {};
}

function trackMetric(key, amount = 1) {
  ensureUxMetrics();
  appState.profile.uxMetrics[key] = (appState.profile.uxMetrics[key] || 0) + amount;
}

function trackAbandon(questionNumber) {
  ensureUxMetrics();
  const key = String(questionNumber);
  appState.profile.uxMetrics.abandonByQuestion[key] = (appState.profile.uxMetrics.abandonByQuestion[key] || 0) + 1;
}

function persistSessionState() {
  const payload = {
    inProgress: appState.inProgress,
    practiceMode: appState.practiceMode,
    date: appState.todayKey,
    questionIndex: appState.questionIndex + 1,
    completedToday: Boolean(appState.todayResult)
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

function clearSessionState() {
  localStorage.removeItem(SESSION_KEY);
}

function recoverAbandonIfNeeded() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return;
  try {
    const prev = JSON.parse(raw);
    const sameDay = prev && prev.date === appState.todayKey;
    if (sameDay && prev.inProgress && !prev.practiceMode && !appState.todayResult) {
      trackAbandon(prev.questionIndex || 1);
      saveProfile();
    }
  } catch (error) {
    // ignore parse error
  }
  clearSessionState();
}

function getLevelInfo(xpValue) {
  const xp = Math.max(0, Number(xpValue) || 0);
  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;
  return { level, xpInLevel, xpToNext: 100 - xpInLevel };
}

function getLeagueTier(level) {
  if (level >= 20) return { id: "diamond", name: "Diamante", icon: "💎" };
  if (level >= 12) return { id: "platinum", name: "Platino", icon: "⚜️" };
  if (level >= 7) return { id: "gold", name: "Oro", icon: "🥇" };
  if (level >= 3) return { id: "silver", name: "Plata", icon: "🥈" };
  return { id: "bronze", name: "Bronce", icon: "🥉" };
}

function setXpBarProgress(percent, withTransition = false) {
  if (!xpBarNode) return;
  if (!withTransition) xpBarNode.style.transition = "none";
  xpBarNode.style.width = `${Math.max(0, Math.min(100, percent))}%`;
  if (!withTransition) {
    requestAnimationFrame(() => {
      xpBarNode.style.transition = "width 900ms ease";
    });
  }
}

function animateXpGain(prevXp, nextXp) {
  if (!xpBarNode) return;
  const meter = xpBarNode.parentElement;
  const prevLevel = Math.floor(prevXp / 100);
  const nextLevel = Math.floor(nextXp / 100);
  const prevPct = prevXp % 100;
  const nextPct = nextXp % 100;

  if (nextLevel === prevLevel) {
    setXpBarProgress(prevPct, false);
    requestAnimationFrame(() => setXpBarProgress(nextPct, true));
    return;
  }

  setXpBarProgress(prevPct, false);
  requestAnimationFrame(() => setXpBarProgress(100, true));

  setTimeout(() => {
    if (meter) {
      meter.classList.remove("is-levelup");
      void meter.offsetWidth;
      meter.classList.add("is-levelup");
    }
  }, 920);

  setTimeout(() => {
    setXpBarProgress(0, false);
    requestAnimationFrame(() => setXpBarProgress(nextPct, true));
  }, 1180);
}

function getDailyMission(dateKey) {
  const random = mulberry32(hashString(`${dateKey}:${appState.quizId}:mission`));
  const target = 6 + Math.floor(random() * 4);
  return {
    id: `${dateKey}:${appState.quizId}`,
    target,
    text: `Consigue ${target}/10 o mas en la partida oficial.`
  };
}

function isMissionCompleted(result, mission) {
  if (!result || !mission) return false;
  return result.score >= mission.target;
}

function getWeeklyThemeChallenge(weekKey) {
  const options = [
    {
      id: "accuracy",
      title: "Tema: Precision sostenida",
      description: "Logra promedio semanal >= 70% en al menos 3 partidas.",
      evaluate: (history) => {
        if (history.length < 3) return { done: false, progress: `${history.length}/3 partidas` };
        const avg = Math.round(history.reduce((acc, item) => acc + item.percent, 0) / history.length);
        return { done: avg >= 70, progress: `Promedio ${avg}%` };
      }
    },
    {
      id: "consistency",
      title: "Tema: Consistencia elite",
      description: "Completa 5 partidas esta semana.",
      evaluate: (history) => ({ done: history.length >= 5, progress: `${history.length}/5 partidas` })
    },
    {
      id: "highscore",
      title: "Tema: Golpe de autoridad",
      description: "Consigue 2 dias de 8/10 o mas.",
      evaluate: (history) => {
        const strong = history.filter((item) => item.score >= 8).length;
        return { done: strong >= 2, progress: `${strong}/2 dias fuertes` };
      }
    }
  ];
  const random = mulberry32(hashString(`${weekKey}:${appState.quizId}:weekly-theme`));
  return options[Math.floor(random() * options.length)];
}

function getThisWeekHistory() {
  const weekKey = getWeekKey(appState.todayKey);
  return appState.profile.history.filter((entry) => getWeekKey(entry.date) === weekKey).slice(0, 7);
}

function computeRankDelta(currentRank) {
  if (!currentRank) return null;
  const previous = appState.profile.history.find(
    (entry) => entry.date !== appState.todayKey && typeof entry.rank === "number"
  );
  if (!previous) return null;
  return previous.rank - currentRank;
}

function hasShieldAvailable(dateKey) {
  const monthKey = getMonthKey(dateKey);
  return !appState.profile.shieldUsesMonth[monthKey];
}

function grantAchievement(label) {
  if (!label) return;
  if (!appState.profile.achievements.includes(label)) {
    appState.profile.achievements.unshift(label);
    appState.profile.achievements = appState.profile.achievements.slice(0, 18);
  }
}

function assignDailyReward(dateKey) {
  if (appState.profile.lastRewardDate === dateKey) return appState.profile.lastReward;
  const random = mulberry32(hashString(`${dateKey}:${appState.quizId}:reward`));
  const reward = MYSTERY_REWARDS[Math.floor(random() * MYSTERY_REWARDS.length)];
  appState.profile.lastRewardDate = dateKey;
  appState.profile.lastReward = reward;
  grantAchievement(`Mystery bonus: ${reward}`);
  return reward;
}

function buildBalancedDailyPool(pool, count, speakers) {
  const groups = new Map();
  speakers.forEach((speaker) => groups.set(speaker, []));

  pool.forEach((question) => {
    if (!groups.has(question.speaker)) groups.set(question.speaker, []);
    groups.get(question.speaker).push(question);
  });

  groups.forEach((questions, speaker) => {
    const random = mulberry32(hashString(`${appState.todayKey}:${speaker}:group`));
    groups.set(speaker, shuffleWithRandom(questions, random));
  });

  const target = Math.min(count, pool.length);
  const base = Math.floor(target / speakers.length);
  const remainder = target % speakers.length;
  const extraOrder = shuffleWithRandom([...speakers], mulberry32(hashString(`${appState.todayKey}:speaker-order`)));

  const picks = [];
  speakers.forEach((speaker) => {
    const take = base + (extraOrder.indexOf(speaker) < remainder ? 1 : 0);
    const bucket = groups.get(speaker) || [];
    picks.push(...bucket.slice(0, take));
    groups.set(speaker, bucket.slice(take));
  });

  if (picks.length < target) {
    const leftovers = [];
    groups.forEach((items) => leftovers.push(...items));
    const random = mulberry32(hashString(`${appState.todayKey}:leftovers`));
    picks.push(...shuffleWithRandom(leftovers, random).slice(0, target - picks.length));
  }

  return picks.slice(0, target);
}

function buildDailyQuestionSet() {
  const pool = appState.quizData.questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }));

  const target = Math.min(DAILY_QUESTIONS, pool.length);
  const hasSpeakers = pool.every((question) => question.speaker) && appState.speakers.length;

  let selected;
  if (hasSpeakers) {
    selected = buildBalancedDailyPool(pool, target, appState.speakers);
  } else {
    const random = mulberry32(hashString(`${appState.todayKey}:questions`));
    selected = shuffleWithRandom(pool, random).slice(0, target);
  }

  const orderRandom = mulberry32(hashString(`${appState.todayKey}:daily-order`));
  const ordered = shuffleWithRandom(selected, orderRandom);

  return ordered.map((question) => {
    const optionRandom = mulberry32(hashString(`${appState.todayKey}:${question.id}:options`));
    return { ...question, options: shuffleWithRandom(question.options, optionRandom) };
  });
}

function buildPracticeQuestionSet() {
  const pool = appState.quizData.questions.map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option }))
  }));
  const random = mulberry32(hashString(`${Date.now()}:${Math.random()}:practice`));
  const picked = shuffleWithRandom(pool, random).slice(0, Math.min(DAILY_QUESTIONS, pool.length));

  return picked.map((question) => ({
    ...question,
    options: shuffleWithRandom(question.options, mulberry32(hashString(`${question.id}:${Math.random()}`)))
  }));
}

function getTodayResult() {
  return appState.profile.history.find((entry) => entry.date === appState.todayKey) || null;
}

function getAccuracy() {
  if (!appState.profile.totalAnswers) return 0;
  return Math.round((appState.profile.totalCorrect / appState.profile.totalAnswers) * 100);
}

function randomPlayersCount() {
  const random = mulberry32(hashString(`${appState.todayKey}:players`));
  return 6800 + Math.floor(random() * 14000);
}

function secondsUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

function updateCountdown() {
  const totalSeconds = secondsUntilMidnight();
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  if (resetTimerNode) resetTimerNode.textContent = `${hours}:${minutes}:${seconds}`;

  const liveDate = toDateKey(new Date());
  if (liveDate !== appState.todayKey) location.reload();
}

function updateDerivedState() {
  appState.shieldAvailable = hasShieldAvailable(appState.todayKey);
  const weekKey = getWeekKey(appState.todayKey);
  appState.weeklyProgress = appState.profile.weeklyCompletions[weekKey] || 0;
  appState.streakAtRisk = !appState.todayResult && secondsUntilMidnight() < 6 * 3600;
  appState.lastReward = appState.profile.lastReward || "Pending";
}

function getStreakFireState(streak) {
  if (streak <= 1) return { flames: 0, tone: "cold", label: "Sin fuego" };

  const flames = Math.min(8, streak - 1);
  if (streak >= 14) return { flames, tone: "onfire", label: `ON FIRE ${"🔥".repeat(flames)}` };
  if (streak >= 7) return { flames, tone: "hot", label: `${"🔥".repeat(flames)} Racha caliente` };
  return { flames, tone: "warm", label: `${"🔥".repeat(flames)} Calentando motor` };
}

function renderProfileStats(playerRank) {
  if (statStreak) statStreak.textContent = String(appState.profile.streakCurrent);
  if (statBestStreak) statBestStreak.textContent = String(appState.profile.streakBest);
  if (statAccuracy) statAccuracy.textContent = `${getAccuracy()}%`;
  if (statPercentile) statPercentile.textContent = appState.percentile ? `Top ${appState.percentile}%` : "--";
  if (statShield) statShield.textContent = appState.shieldAvailable ? "Disponible" : "Usado";

  const lv = getLevelInfo(appState.profile.xp);
  const tier = getLeagueTier(lv.level);

  if (statLevel || statXp) {
    if (statLevel) statLevel.textContent = `Lv.${lv.level}`;
    if (statXp) statXp.textContent = `${lv.xpInLevel}/100 XP`;
    setXpBarProgress(lv.xpInLevel, false);
  }

  // Apply league tier to stat-level card
  const levelCard = statLevel ? statLevel.closest(".stat-card") : null;
  if (levelCard) {
    levelCard.classList.remove("tier-bronze", "tier-silver", "tier-gold", "tier-platinum", "tier-diamond");
    levelCard.classList.add(`tier-${tier.id}`);
  }

  // Apply league tier to profile chip in topbar
  const chipNode = document.querySelector(".profile-chip");
  if (chipNode) {
    chipNode.classList.remove("tier-bronze", "tier-silver", "tier-gold", "tier-platinum", "tier-diamond");
    chipNode.classList.add(`tier-${tier.id}`);
    // Insert or update league badge
    let badge = chipNode.querySelector(".league-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "league-badge";
      chipNode.prepend(badge);
    }
    badge.className = `league-badge tier-${tier.id}`;
    badge.textContent = tier.icon;
    badge.title = `Liga ${tier.name}`;
  }

  const fire = getStreakFireState(appState.profile.streakCurrent);
  if (streakFireNode) streakFireNode.textContent = fire.label;
  if (streakStatCardNode) {
    streakStatCardNode.classList.remove("is-warm", "is-hot", "is-onfire");
    if (fire.tone === "warm") streakStatCardNode.classList.add("is-warm");
    if (fire.tone === "hot") streakStatCardNode.classList.add("is-hot");
    if (fire.tone === "onfire") streakStatCardNode.classList.add("is-onfire");
  }
}

function renderInsights() {
  const total = appState.dailyQuestions.length || DAILY_QUESTIONS;
  const best = appState.profile.history.length
    ? Math.max(...appState.profile.history.map((entry) => entry.score))
    : 0;
  const needed = Math.max(1, Math.min(total, best + 1) - (appState.todayResult ? appState.todayResult.score : 0));

  if (goalCardNode) {
    goalCardNode.innerHTML = `
      <h4>Goal Card</h4>
      <p>Objetivo del dia: te faltan <strong>${needed}</strong> acierto(s) para romper tu mejor marca (${best}/${total}).</p>
    `;
  }

  if (streakCardNode) {
    const streakText = appState.todayResult
      ? "Racha protegida hoy."
      : appState.streakAtRisk
        ? "Racha en riesgo: quedan pocas horas para salvarla."
        : "Racha activa: mantienes ventaja competitiva.";
    const fire = getStreakFireState(appState.profile.streakCurrent);
    streakCardNode.innerHTML = `
      <h4>Streak Card</h4>
      <p>${streakText} Escudo mensual: <strong>${appState.shieldAvailable ? "Disponible" : "Usado"}</strong>.</p>
      <p><strong>Intensidad:</strong> ${fire.label}</p>
    `;
  }

  const nextMilestone = STREAK_MILESTONES.find((item) => item > appState.profile.streakCurrent) || null;
  if (nextRewardNode) {
    nextRewardNode.innerHTML = `
      <h4>Next Reward</h4>
      <p>${nextMilestone ? `Te faltan ${nextMilestone - appState.profile.streakCurrent} dia(s) para desbloquear el hito ${nextMilestone}.` : "Todos los hitos principales desbloqueados."}</p>
      <p>Meta semanal premium: <strong>${appState.weeklyProgress}/5</strong>.</p>
    `;
  }

  if (missionCardNode) {
    const mission = appState.dailyMission || getDailyMission(appState.todayKey);
    const done = isMissionCompleted(appState.todayResult, mission);
    missionCardNode.innerHTML = `
      <h4>Mision diaria</h4>
      <p>${mission.text}</p>
      <p><strong>${done ? "Completada" : "Pendiente"}</strong>${done && appState.todayResult ? ` · +${appState.todayResult.missionXp || 0} XP` : ""}</p>
    `;
  }

  if (comebackPromptNode) {
    const recent = appState.profile.history.slice(0, 3);
    const drop = recent.length === 3 && recent[0].score < recent[1].score && recent[1].score < recent[2].score;
    comebackPromptNode.textContent = drop ? "Mini reto comeback: intenta superar tu ultimo puntaje por 2+ aciertos." : "";
  }
}

function renderDailyStatus() {
  if (!dailyStatusNode) return;
  const total = appState.dailyQuestions.length;

  if (appState.inProgress) {
    dailyStatusNode.innerHTML = `<p>${appState.practiceMode ? "Revancha en curso" : "Partida en curso"}. <strong>${appState.questionIndex + 1}/${total}</strong></p>`;
    return;
  }

  if (appState.todayResult) {
    dailyStatusNode.innerHTML = `
      <p><strong>${appState.todayResult.score}/${appState.todayResult.total}</strong> (${appState.todayResult.percent}%)</p>
    `;
    return;
  }

  dailyStatusNode.innerHTML = "";
}

function renderHomePrimarySection(animate = false) {
  if (!dailySectionNode || !rankingSectionNode) return;
  const hasPlayedToday = Boolean(appState.todayResult);
  const showNode = hasPlayedToday ? rankingSectionNode : dailySectionNode;
  const hideNode = hasPlayedToday ? dailySectionNode : rankingSectionNode;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shouldAnimate = animate && !reducedMotion && !hideNode.classList.contains("is-hidden");

  if (!shouldAnimate) {
    dailySectionNode.classList.toggle("is-hidden", hasPlayedToday);
    rankingSectionNode.classList.toggle("is-hidden", !hasPlayedToday);
    dailySectionNode.classList.remove("panel-swap-enter", "panel-swap-enter-active", "panel-swap-exit");
    rankingSectionNode.classList.remove("panel-swap-enter", "panel-swap-enter-active", "panel-swap-exit");
    return;
  }

  showNode.classList.remove("is-hidden", "panel-swap-exit");
  showNode.classList.add("panel-swap-enter");
  requestAnimationFrame(() => showNode.classList.add("panel-swap-enter-active"));

  hideNode.classList.remove("panel-swap-enter", "panel-swap-enter-active");
  hideNode.classList.add("panel-swap-exit");
  window.setTimeout(() => {
    hideNode.classList.add("is-hidden");
    hideNode.classList.remove("panel-swap-exit");
    showNode.classList.remove("panel-swap-enter", "panel-swap-enter-active");
  }, HOME_SWAP_MS);
}

function renderIdleState() {
  dailyGameNode.innerHTML = `
    <div class="daily-idle">
      <button id="daily-start-main" class="btn btn-primary btn-play-main" type="button">Jugar ahora</button>
    </div>
  `;
  const startButton = document.querySelector("#daily-start-main");
  if (startButton) startButton.addEventListener("click", startDailyMatch);
}

function renderLockedState() {
  const remaining = resetTimerNode ? resetTimerNode.textContent : "--:--:--";
  dailyGameNode.innerHTML = `
    <div class="daily-locked">
      <h4>Vuelve mañana</h4>
      <p>Resultado: <strong>${appState.todayResult.score}/${appState.todayResult.total}</strong> (${appState.todayResult.percent}%)</p>
      <div style="margin-top: 16px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
        <a class="btn btn-outline" href="#ranking">Ranking</a>
        <button id="practice-start" class="btn btn-outline" type="button">Practicar</button>
      </div>
    </div>
  `;
  const practiceButton = document.querySelector("#practice-start");
  if (practiceButton) practiceButton.addEventListener("click", startPracticeMatch);
}

function renderQuestion() {
  const question = appState.dailyQuestions[appState.questionIndex];
  const total = appState.dailyQuestions.length;
  const progress = Math.round(((appState.questionIndex + 1) / total) * 100);

  dailyGameNode.innerHTML = `
    <div class="daily-head">
      <p>Pregunta ${appState.questionIndex + 1}/${total}</p>
      <p>Puntaje actual: ${appState.score}</p>
    </div>
    <div class="progress-wrap"><div class="progress-bar" style="width:${progress}%"></div></div>
    <p class="daily-theme">${question.theme}</p>
    <blockquote class="daily-quote">"${question.quote}"</blockquote>
    <div class="daily-options">
      ${question.options
      .map((option, index) => `<button class="daily-option" data-index="${index}" type="button">${option.name}</button>`)
      .join("")}
    </div>
    <div id="daily-feedback" class="daily-feedback"></div>
    <button id="daily-next" class="btn btn-outline daily-next" type="button" disabled>Siguiente</button>
  `;

  // Apply in-game tension based on consecutive correct streak
  dailyGameNode.classList.remove("tension-10", "tension-20");
  if (appState.consecutiveCorrect >= 20) {
    dailyGameNode.classList.add("tension-20");
  } else if (appState.consecutiveCorrect >= 10) {
    dailyGameNode.classList.add("tension-10");
  }

  dailyGameNode.querySelectorAll(".daily-option").forEach((button) => {
    button.addEventListener("click", () => {
      SFX.pop();
      onAnswer(button);
    });
  });

  const nextBtn = dailyGameNode.querySelector("#daily-next");
  if (nextBtn) nextBtn.addEventListener("click", onNextQuestion);
}

function onAnswer(button) {
  if (appState.locked) return;
  appState.locked = true;

  const currentIndex = appState.questionIndex;
  const question = appState.dailyQuestions[currentIndex];
  const picked = question.options[Number(button.dataset.index)];
  const correct = question.options.find((option) => option.isCorrect);

  if (picked.isCorrect) {
    appState.score += 1;
    appState.consecutiveCorrect += 1;
    SFX.correct();
  } else {
    appState.consecutiveCorrect = 0;
    SFX.wrong();
  }

  // Flash the game container green or red
  dailyGameNode.classList.remove("flash-correct", "flash-wrong");
  void dailyGameNode.offsetWidth;
  dailyGameNode.classList.add(picked.isCorrect ? "flash-correct" : "flash-wrong");
  setTimeout(() => dailyGameNode.classList.remove("flash-correct", "flash-wrong"), 650);

  dailyGameNode.querySelectorAll(".daily-option").forEach((optionButton, index) => {
    const option = question.options[index];
    optionButton.disabled = true;
    if (option.isCorrect) {
      optionButton.classList.add("is-correct");
    } else if (optionButton === button && !picked.isCorrect) {
      optionButton.classList.add("is-wrong");
    } else {
      // Dim non-selected, non-correct options
      optionButton.classList.add("is-dimmed");
    }
  });

  const feedback = dailyGameNode.querySelector("#daily-feedback");
  if (feedback) {
    feedback.innerHTML = `
      <p class="daily-result ${picked.isCorrect ? "ok" : "bad"}">${picked.isCorrect ? "Correcto" : "Incorrecto"}.</p>
      <p><strong>Respuesta:</strong> ${correct.name}. ${correct.rationale}</p>
      ${picked.isCorrect ? "" : `<p><strong>Tu eleccion:</strong> ${picked.rationale}</p>`}
    `;
  }

  const nextBtn = dailyGameNode.querySelector("#daily-next");
  if (nextBtn) nextBtn.disabled = false;

  setTimeout(() => {
    if (appState.inProgress && appState.locked && appState.questionIndex === currentIndex) {
      onNextQuestion();
    }
  }, ANSWER_TRANSITION_MS);
}

function onNextQuestion() {
  if (!appState.inProgress) return;
  appState.questionIndex += 1;
  appState.locked = false;
  persistSessionState();

  if (appState.questionIndex >= appState.dailyQuestions.length) {
    if (appState.practiceMode) {
      finishPracticeMatch();
    } else {
      finishDailyMatch();
    }
    return;
  }

  // Smooth transition: fade out → render → slide in
  dailyGameNode.classList.add("is-transitioning");
  setTimeout(() => {
    renderDailyStatus();
    renderQuestion();
    dailyGameNode.classList.remove("is-transitioning");
    dailyGameNode.classList.add("is-entering");
    setTimeout(() => dailyGameNode.classList.remove("is-entering"), 280);
  }, 200);
}

function saveTodayResult(result) {
  const profile = appState.profile;
  const existing = profile.history.find((entry) => entry.date === result.date);
  if (existing) return;

  let usedShield = false;
  const yesterday = getYesterdayKey(result.date);

  if (!profile.lastPlayedDate) {
    profile.streakCurrent = 1;
  } else if (profile.lastPlayedDate === yesterday) {
    profile.streakCurrent += 1;
  } else if (profile.lastPlayedDate === result.date) {
    return;
  } else {
    const missedDays = Math.max(1, daysBetween(profile.lastPlayedDate, result.date) - 1);
    if (profile.streakCurrent > 0 && missedDays >= 1 && hasShieldAvailable(result.date)) {
      profile.streakCurrent += 1;
      profile.shieldUsesMonth[getMonthKey(result.date)] = 1;
      usedShield = true;
      grantAchievement("Streak Shield activado");
    } else {
      profile.streakCurrent = 1;
    }
  }

  STREAK_MILESTONES.forEach((milestone) => {
    if (profile.streakCurrent >= milestone) grantAchievement(`Hito de racha ${milestone}`);
  });

  const weekKey = getWeekKey(result.date);
  profile.weeklyCompletions[weekKey] = (profile.weeklyCompletions[weekKey] || 0) + 1;
  if (profile.weeklyCompletions[weekKey] >= 5) grantAchievement("Meta semanal 5/7");

  if (result.score === result.total) grantAchievement("Perfect run");

  profile.consistencyMap[result.date] = 1;

  profile.streakBest = Math.max(profile.streakBest, profile.streakCurrent);
  profile.lastPlayedDate = result.date;
  profile.totalMatches += 1;
  profile.totalCorrect += result.score;
  profile.totalAnswers += result.total;

  const reward = assignDailyReward(result.date);
  result.reward = reward;
  result.usedShield = usedShield;

  profile.history.unshift(result);
  profile.history.sort((a, b) => b.date.localeCompare(a.date));
  profile.history = profile.history.slice(0, 40);
}

function finishDailyMatch() {
  const total = appState.dailyQuestions.length;
  const percent = Math.round((appState.score / total) * 100);
  const duration = Math.max(1, Math.round((Date.now() - appState.startedAt) / 1000));

  const result = {
    date: appState.todayKey,
    score: appState.score,
    total,
    percent,
    durationSec: duration
  };

  saveTodayResult(result);

  appState.inProgress = false;
  appState.todayResult = getTodayResult();
  updateDerivedState();

  const ranking = renderLeaderboard();
  const mission = appState.dailyMission || getDailyMission(appState.todayKey);
  const missionDone = isMissionCompleted(result, mission);
  const baseXp = 20 + result.score * 8;
  const streakXp = Math.min(20, appState.profile.streakCurrent * 2);
  const missionXp = missionDone ? 25 : 0;
  const xpGain = baseXp + streakXp + missionXp;

  const prevXp = appState.profile.xp || 0;
  appState.profile.xp = (appState.profile.xp || 0) + xpGain;
  result.xpGained = xpGain;
  result.missionXp = missionXp;
  result.rank = ranking.myRank || null;

  const todayEntry = appState.profile.history.find((entry) => entry.date === appState.todayKey);
  if (todayEntry) {
    todayEntry.xpGained = result.xpGained;
    todayEntry.missionXp = result.missionXp;
    todayEntry.rank = result.rank;
  }

  appState.rankDelta = computeRankDelta(ranking.myRank);
  trackMetric("completedOfficial", 1);
  saveProfile();
  animateXpGain(prevXp, appState.profile.xp);
  clearSessionState();

  appState.nearMiss = Boolean(ranking.myRank && ranking.myRank === ranking.top10Cut + 1);
  const rankDeltaText =
    appState.rankDelta === null || appState.rankDelta === 0
      ? "Sin cambio de posicion"
      : appState.rankDelta > 0
        ? `Subiste ${appState.rankDelta} puesto(s)`
        : `Bajaste ${Math.abs(appState.rankDelta)} puesto(s)`;
  const yesterdayDelta = getYesterdayDeltaPercent(result.percent);
  const yesterdayDeltaClass = yesterdayDelta === null ? "" : yesterdayDelta > 0 ? "delta-up" : yesterdayDelta < 0 ? "delta-down" : "";
  const yesterdayDeltaText =
    yesterdayDelta === null
      ? "Sin referencia de ayer"
      : `${yesterdayDelta > 0 ? "+" : ""}${yesterdayDelta}%`;

  dailyGameNode.innerHTML = `
    <div class="daily-finish">
      <h4>Partida terminada</h4>
      <p>Hoy hiciste <strong>${result.score}/${result.total}</strong> (${result.percent}%).</p>
      <p>Tiempo: <strong>${result.durationSec}s</strong>. Vuelve manana para mantener tu ventaja.</p>
      <p>Posicion: <strong>${result.rank ? `#${result.rank}` : "--"}</strong></p>
      <p>Ranking: <strong>${rankDeltaText}</strong></p>
      <p>Racha actual: <strong>${appState.profile.streakCurrent}</strong> dia(s)</p>
      <p>Vs ayer: <strong class="${yesterdayDeltaClass}">${yesterdayDeltaText}</strong></p>
      <div class="finish-mini-summary">
        <div class="mini-item">
          <span>Precision total</span>
          <strong>${getAccuracy()}%</strong>
        </div>
        <div class="mini-item">
          <span>Nivel</span>
          <strong>Lv.${getLevelInfo(appState.profile.xp).level}</strong>
          <div class="mini-xp"><span style="width:${getLevelInfo(appState.profile.xp).xpInLevel}%"></span></div>
        </div>
      </div>
      <div class="finish-streak-meter">
        <div class="finish-streak-bar is-cold"><span id="finish-streak-fill" style="width:0%"></span></div>
      </div>
      <p>XP ganado: <strong>+${xpGain}</strong>${missionDone ? " (incluye bonus de mision)" : ""}.</p>
      ${appState.nearMiss ? `<p><strong>Near miss:</strong> te falto 1 puesto para entrar en el top 10%.</p>` : ""}
      <p>Mystery bonus desbloqueado: <strong>${result.reward}</strong>.</p>
      <button id="share-result" class="btn btn-outline" type="button">Copiar texto</button>
      <button id="share-visual" class="btn btn-outline" type="button">Compartir visual</button>
    </div>
  `;

  const shareButton = document.querySelector("#share-result");
  if (shareButton) {
    shareButton.addEventListener("click", async () => {
      const text = `GuessTheSpeaker ${QUIZ_CONFIGS[appState.quizId].label}: ${result.score}/${result.total} (${result.percent}%) · Racha ${appState.profile.streakCurrent}`;
      try {
        await navigator.clipboard.writeText(text);
        shareButton.textContent = "Copiado";
      } catch (error) {
        shareButton.textContent = "No se pudo copiar";
      }
    });
  }
  const shareVisualButton = document.querySelector("#share-visual");
  if (shareVisualButton) {
    shareVisualButton.addEventListener("click", async () => {
      const blob = await createResultVisualCard(result);
      if (!blob) {
        shareVisualButton.textContent = "No disponible";
        return;
      }
      const file = new File([blob], "gts-result.png", { type: "image/png" });
      try {
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "GuessTheSpeaker Result",
            text: `${result.score}/${result.total} (${result.percent}%)`,
            files: [file]
          });
          shareVisualButton.textContent = "Compartido";
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "gts-result.png";
          a.click();
          URL.revokeObjectURL(url);
          shareVisualButton.textContent = "Descargado";
        }
      } catch (error) {
        shareVisualButton.textContent = "Cancelado";
      }
    });
  }
  animateFinishStreakBar(appState.profile.streakCurrent);
  const finishSummary = dailyGameNode.querySelector(".finish-mini-summary");
  if (finishSummary) {
    requestAnimationFrame(() => finishSummary.classList.add("is-visible"));
  }

  renderProfileStats(ranking.myRank);
  renderDailyStatus();
  renderInsights();
  renderHistory();
  renderWeeklyLeague();
  setTimeout(() => renderHomePrimarySection(true), 1400);
}

function startDailyMatch() {
  if (appState.todayResult) {
    renderDailyStatus();
    renderLockedState();
    return;
  }

  trackMetric("ctaClicks", 1);
  trackMetric("startsOfficial", 1);
  saveProfile();

  appState.inProgress = true;
  appState.practiceMode = false;
  appState.locked = false;
  appState.questionIndex = 0;
  appState.score = 0;
  appState.startedAt = Date.now();
  persistSessionState();

  renderDailyStatus();
  renderQuestion();
}

function startPracticeMatch() {
  trackMetric("practiceStarts", 1);
  saveProfile();

  appState.inProgress = true;
  appState.practiceMode = true;
  appState.locked = false;
  appState.questionIndex = 0;
  appState.score = 0;
  appState.startedAt = Date.now();
  appState.dailyQuestions = buildPracticeQuestionSet();
  persistSessionState();

  renderDailyStatus();
  renderQuestion();
}

function finishPracticeMatch() {
  const total = appState.dailyQuestions.length;
  const percent = Math.round((appState.score / total) * 100);
  const duration = Math.max(1, Math.round((Date.now() - appState.startedAt) / 1000));

  appState.inProgress = false;
  appState.practiceMode = false;
  appState.dailyQuestions = buildDailyQuestionSet();
  clearSessionState();

  dailyGameNode.innerHTML = `
    <div class="daily-finish">
      <h4>Revancha terminada</h4>
      <p>Resultado de practica: <strong>${appState.score}/${total}</strong> (${percent}%).</p>
      <p>Tiempo: <strong>${duration}s</strong>. No afecta tu ranking oficial.</p>
      <button id="practice-retry" class="btn btn-outline" type="button">Otra revancha</button>
    </div>
  `;

  const retry = document.querySelector("#practice-retry");
  if (retry) retry.addEventListener("click", startPracticeMatch);

  renderDailyStatus();
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = String(value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function createResultVisualCard(result) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, "#0f172a");
    gradient.addColorStop(1, "#1e3a8a");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 630);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(60, 60, 1080, 510);

    ctx.fillStyle = "#ffffff";
    ctx.font = "700 56px 'Space Grotesk', sans-serif";
    ctx.fillText("GuessTheSpeaker", 100, 170);

    ctx.font = "600 42px 'Space Grotesk', sans-serif";
    ctx.fillText(`${QUIZ_CONFIGS[appState.quizId].label}`, 100, 250);

    ctx.font = "700 92px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#bbf7d0";
    ctx.fillText(`${result.score}/${result.total}`, 100, 390);

    ctx.font = "500 36px 'Space Grotesk', sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`${result.percent}% · Racha ${appState.profile.streakCurrent} · Lv.${getLevelInfo(appState.profile.xp).level}`, 100, 460);
    ctx.fillText(`Fecha ${formatDate(result.date)}`, 100, 520);

    return await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  } catch (error) {
    return null;
  }
}

function buildLeaderboardData() {
  const names = [
    "NovaFox",
    "AtlasMind",
    "RavenIQ",
    "EchoPulse",
    "SignalShift",
    "OrbitNode",
    "PixelJudge",
    "DeltaVox",
    "NeonTrace",
    "MeritLoop",
    "LogicLynx",
    "RapidCore",
    "ZenCipher",
    "PrimeGauge",
    "CobaltLine"
  ];

  const total = appState.dailyQuestions.length;
  const seed = `${appState.todayKey}:${appState.quizId}:leaderboard:${appState.rankingMode}:${appState.roomCode || "public"}`;
  const random = mulberry32(hashString(seed));
  const rows = [];

  const baseCount = appState.rankingMode === "friends" ? 12 : 36;
  const friendPool =
    Array.isArray(appState.profile.friends) && appState.profile.friends.length
      ? appState.profile.friends
      : FRIEND_NAMES;
  const namesPool = appState.rankingMode === "friends" ? friendPool : names;
  for (let i = 0; i < baseCount; i += 1) {
    const score = Math.max(1, Math.round(total * (0.45 + random() * 0.55)));
    const durationSec = 35 + Math.floor(random() * 210);
    rows.push({
      name:
        namesPool[Math.floor(random() * namesPool.length)] +
        (appState.rankingMode === "friends" ? "" : Math.floor(10 + random() * 90)),
      score,
      durationSec,
      isMe: false
    });
  }

  if (appState.todayResult) {
    rows.push({
      name: appState.profile.displayName,
      score: appState.todayResult.score,
      durationSec: appState.todayResult.durationSec,
      isMe: true
    });
  }

  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.durationSec - b.durationSec;
  });

  return rows;
}

function renderLeaderboard() {
  if (!leaderboardBody) {
    appState.leaderboardRows = [];
    appState.leaderboardSize = 0;
    appState.bestScoreToday = 0;
    appState.percentile = null;
    if (percentileChipNode) percentileChipNode.textContent = "Percentil: --";
    return { myRank: null, top10Cut: 0 };
  }

  const total = appState.dailyQuestions.length;
  const rows = buildLeaderboardData();
  appState.leaderboardRows = rows;
  let myRank = null;

  rows.forEach((row, index) => {
    if (row.isMe) myRank = index + 1;
  });

  const topRows = rows.slice(0, 5);
  const htmlRows = topRows
    .map((row, index) => {
      const label = row.isMe ? "You" : row.name;
      const rowClass = row.isMe ? ' class="me"' : "";
      return `<tr${rowClass}><td>${index + 1}</td><td>${label}</td><td>${row.score}/${total}</td><td>${formatSeconds(row.durationSec)}</td></tr>`;
    })
    .join("");

  leaderboardBody.innerHTML = htmlRows;

  appState.leaderboardSize = rows.length;
  appState.bestScoreToday = rows[0] ? rows[0].score : 0;

  if (myRank) {
    appState.percentile = Math.max(1, Math.round((myRank / rows.length) * 100));
  } else {
    appState.percentile = null;
  }

  if (percentileChipNode) {
    percentileChipNode.textContent = appState.percentile ? `Percentil: Top ${appState.percentile}%` : "Percentil: --";
  }

  const top10Cut = Math.ceil(rows.length * 0.1);
  return { myRank, top10Cut };
}

function runRankingSearch() {
  if (!rankingSearchResultNode) return;
  const query = (rankingSearchInput ? rankingSearchInput.value : "").trim().toLowerCase();
  const modeLabel = appState.rankingMode === "friends" ? "Amigos" : "Global";

  if (!query) {
    rankingSearchResultNode.textContent = `Busca un jugador para ver su posicion en ${modeLabel}.`;
    return;
  }

  const rows = appState.leaderboardRows || [];
  let foundRank = -1;
  let foundRow = null;

  for (let i = 0; i < rows.length; i += 1) {
    const name = String(rows[i].name || "").toLowerCase();
    if (name === query) {
      foundRank = i + 1;
      foundRow = rows[i];
      break;
    }
  }

  if (!foundRow) {
    for (let i = 0; i < rows.length; i += 1) {
      const name = String(rows[i].name || "").toLowerCase();
      if (name.includes(query)) {
        foundRank = i + 1;
        foundRow = rows[i];
        break;
      }
    }
  }

  if (!foundRow) {
    rankingSearchResultNode.textContent = `No encontrado en ${modeLabel}.`;
    return;
  }

  const label = foundRow.isMe ? "You" : foundRow.name;
  rankingSearchResultNode.textContent = `${label}: puesto #${foundRank} en ${modeLabel} (${foundRow.score}/${appState.dailyQuestions.length}).`;
}

function getYesterdayDeltaPercent(todayPercent) {
  const yesterdayKey = getYesterdayKey(appState.todayKey);
  const yesterday = appState.profile.history.find((entry) => entry.date === yesterdayKey);
  if (!yesterday) return null;
  return todayPercent - yesterday.percent;
}

function getFinishStreakVisual(streak) {
  if (streak >= 30) return { pct: 100, tone: "onfire" };
  if (streak >= 14) {
    const pct = Math.round(((streak - 14) / (30 - 14)) * 100);
    return { pct: Math.max(8, Math.min(100, pct)), tone: "onfire" };
  }
  if (streak >= 7) {
    const pct = Math.round(((streak - 7) / (14 - 7)) * 100);
    return { pct: Math.max(8, Math.min(100, pct)), tone: "hot" };
  }
  if (streak >= 3) {
    const pct = Math.round(((streak - 3) / (7 - 3)) * 100);
    return { pct: Math.max(8, Math.min(100, pct)), tone: "warm" };
  }
  const pct = Math.round((Math.max(0, streak) / 3) * 100);
  return { pct: Math.max(8, Math.min(100, pct)), tone: "cold" };
}

function animateFinishStreakBar(streak) {
  const bar = document.querySelector("#finish-streak-fill");
  if (!bar) return;
  const meter = bar.parentElement;
  const meterWrap = meter ? meter.parentElement : null;
  const visual = getFinishStreakVisual(streak);
  if (meter) {
    meter.classList.remove("is-cold", "is-warm", "is-hot", "is-onfire");
    meter.classList.add(`is-${visual.tone}`);
  }
  bar.style.width = "0%";
  requestAnimationFrame(() => {
    setTimeout(() => {
      bar.style.width = `${visual.pct}%`;
    }, 120);
  });

  // Particle burst on hot/onfire after fill animation completes
  if (meterWrap && (visual.tone === "hot" || visual.tone === "onfire") && visual.pct >= 50) {
    setTimeout(() => {
      meterWrap.classList.add("streak-burst", visual.tone === "onfire" ? "is-fire-burst" : "is-hot-burst");
      if (visual.tone === "onfire") SFX.fanfare();
      setTimeout(() => meterWrap.classList.remove("streak-burst", "is-fire-burst", "is-hot-burst"), 900);
    }, 1100);
  }
}

function renderWeeklyLeague() {
  if (!weeklyLeagueTableNode || !weeklyLeagueSummaryNode) return;
  const start = getStartOfWeek(appState.todayKey);
  const labels = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
  const byDate = new Map((appState.profile.history || []).map((entry) => [entry.date, entry]));
  const rows = [];
  let cumulative = 0;
  let best = null;

  for (let i = 0; i < 7; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const key = toDateKey(day);
    const entry = byDate.get(key);
    const points = entry ? entry.score * 10 + (entry.score === entry.total ? 20 : 0) : 0;
    cumulative += points;
    if (!best || points > best.points) best = { points, key, label: labels[i] };
    rows.push({ label: labels[i], key, points, cumulative });
  }

  weeklyLeagueTableNode.innerHTML = rows
    .map((row) => `<tr><td>${row.label} · ${row.key.slice(8, 10)}/${row.key.slice(5, 7)}</td><td>${row.points}</td><td>${row.cumulative}</td></tr>`)
    .join("");

  const total = rows.reduce((acc, row) => acc + row.points, 0);
  const bestText = best && best.points > 0 ? `${best.label} (${best.points} pts)` : "--";
  weeklyLeagueSummaryNode.innerHTML = `
    <span>Total semana: <strong>${total}</strong></span>
    <span>Mejor dia: <strong>${bestText}</strong></span>
    <span>Objetivo sugerido: <strong>500</strong></span>
  `;
}

function renderConsistencyHeatmap() {
  if (!heatmapNode) return;
  const cells = [];
  const today = parseDateKey(appState.todayKey);

  for (let i = 13; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = toDateKey(date);
    const on = Boolean(appState.profile.consistencyMap[key]);
    cells.push(`<div class="heat-cell ${on ? "is-on" : ""}" title="${formatDate(key)}"></div>`);
  }

  heatmapNode.innerHTML = cells.join("");
}

function renderHistoryRadar() {
  if (!historyRadarNode) return;
  const history = appState.profile.history || [];
  if (!history.length) {
    historyRadarNode.innerHTML = `
      <p><strong>Partidas totales:</strong> 0</p>
      <p><strong>Media ultima semana:</strong> --</p>
      <p><strong>Mejor score:</strong> --</p>
      <p><strong>Mejor tiempo:</strong> --</p>
    `;
    return;
  }

  const totalMatches = appState.profile.totalMatches || history.length;
  const last7 = history.slice(0, 7);
  const avg7 = Math.round(last7.reduce((acc, item) => acc + item.percent, 0) / last7.length);
  const bestScore = history.reduce((acc, item) => (item.score > acc.score ? item : acc), history[0]);
  const bestTime = history.reduce((acc, item) => (item.durationSec < acc.durationSec ? item : acc), history[0]);
  const rankedEntries = history.filter((item) => typeof item.rank === "number");
  const bestRank = rankedEntries.length ? Math.min(...rankedEntries.map((item) => item.rank)) : null;

  historyRadarNode.innerHTML = `
    <p><strong>Partidas totales:</strong> ${totalMatches}</p>
    <p><strong>Media ultima semana:</strong> ${avg7}%</p>
    <p><strong>Mejor score:</strong> ${bestScore.score}/${bestScore.total}</p>
    <p><strong>Mejor tiempo:</strong> ${formatSeconds(bestTime.durationSec)}</p>
    <p><strong>Mejor ranking:</strong> ${bestRank ? `#${bestRank}` : "--"}</p>
  `;
}

function renderAchievements() {
  if (!achievementsNode) return;
  if (!appState.profile.achievements.length) {
    achievementsNode.innerHTML = '<span class="achievement-badge common">Sin logros todavia</span>';
    return;
  }

  const rarityClass = (text) => {
    if (/30|Perfect|Shield|ON FIRE|epic/i.test(text)) return "epic";
    if (/14|7|Meta semanal|Mystery/i.test(text)) return "rare";
    return "common";
  };

  achievementsNode.innerHTML = appState.profile.achievements
    .slice(0, 10)
    .map((item) => `<span class="achievement-badge ${rarityClass(item)}">${item}</span>`)
    .join("");
}

function renderNextAchievementCard() {
  if (!nextAchievementNode) return;
  const streak = appState.profile.streakCurrent || 0;
  let target = null;

  if (streak <= 2) target = 3;
  else if (streak <= 6) target = 7;
  else if (streak <= 13) target = 14;
  else if (streak <= 29) target = 30;

  if (!target) {
    nextAchievementNode.innerHTML = `
      <p>Todos los hitos principales completados.</p>
      <p><span class="next-achievement-rare epico">epico</span></p>
      <div class="next-achievement-progress"><span style="width:100%"></span></div>
      <p class="next-achievement-meta">Racha actual: <strong>${streak}</strong> dias</p>
    `;
    return;
  }

  const rarity = target >= 30 ? "epico" : target >= 7 ? "raro" : "comun";
  const progressPct = Math.max(8, Math.min(100, Math.round((streak / target) * 100)));
  const remaining = Math.max(0, target - streak);

  nextAchievementNode.innerHTML = `
    <p>Objetivo: desbloquear hito de <strong>${target}</strong> dias.</p>
    <p><span class="next-achievement-rare ${rarity}">${rarity}</span></p>
    <div class="next-achievement-progress"><span style="width:${progressPct}%"></span></div>
    <p class="next-achievement-meta">Progreso: <strong>${streak}/${target}</strong> · Te faltan <strong>${remaining}</strong> dia(s)</p>
  `;
}

function renderWeeklySummary() {
  if (!weeklySummaryNode) return;
  const last7 = appState.profile.history.slice(0, 7);
  const weekKey = getWeekKey(appState.todayKey);
  const weekHistory = getThisWeekHistory();
  const challenge = getWeeklyThemeChallenge(weekKey);
  const challengeState = challenge.evaluate(weekHistory);
  if (challengeState.done) {
    grantAchievement(`Reto semanal: ${challenge.title}`);
  }

  if (!last7.length) {
    weeklySummaryNode.innerHTML = `
      <strong>Resumen semanal:</strong> completa partidas para activar el reporte automatico.<br/>
      <strong>${challenge.title}</strong>: ${challenge.description}
    `;
    return;
  }

  const avg = Math.round(last7.reduce((acc, item) => acc + item.percent, 0) / last7.length);
  const best = last7.reduce((acc, item) => (item.score > acc.score ? item : acc), last7[0]);
  const xpSum = last7.reduce((acc, item) => acc + (item.xpGained || 0), 0);
  weeklySummaryNode.innerHTML = `
    <strong>Resumen semanal:</strong>
    Precision media <strong>${avg}%</strong> · Mejor dia <strong>${best.score}/${best.total}</strong> · XP semanal <strong>+${xpSum}</strong><br/>
    <strong>${challenge.title}</strong> · ${challenge.description}<br/>
    Estado: <strong>${challengeState.done ? "Completado" : "En progreso"}</strong> (${challengeState.progress})
  `;
}

function loadProfileForQuiz(quizId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_BASE}:${quizId}`);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw);
    return { ...createDefaultProfile(), ...parsed, history: Array.isArray(parsed.history) ? parsed.history : [] };
  } catch (error) {
    return createDefaultProfile();
  }
}

function renderPersonalRecords() {
  if (!personalRecordsNode) return;
  const rows = Object.entries(QUIZ_CONFIGS).map(([quizId, config]) => {
    const profile = loadProfileForQuiz(quizId);
    const history = profile.history || [];
    if (!history.length) {
      return `<tr><td>${config.label}</td><td>--</td><td>--</td><td>${profile.streakBest || 0}</td></tr>`;
    }
    const bestScore = history.reduce((acc, item) => (item.score > acc.score ? item : acc), history[0]);
    const bestTime = history.reduce((acc, item) => (item.durationSec < acc.durationSec ? item : acc), history[0]);
    return `<tr><td>${config.label}</td><td>${bestScore.score}/${bestScore.total}</td><td>${formatSeconds(bestTime.durationSec)}</td><td>${profile.streakBest || 0}</td></tr>`;
  });
  personalRecordsNode.innerHTML = rows.join("");
}

function renderUxSummary() {
  if (!uxSummaryNode) return;
  ensureUxMetrics();
  const ux = appState.profile.uxMetrics;
  const abandonPairs = Object.entries(ux.abandonByQuestion || {});
  const topAbandon = abandonPairs.sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  uxSummaryNode.innerHTML = `
    <strong>Feedback UX local:</strong>
    CTA clicks <strong>${ux.ctaClicks || 0}</strong> · Inicios oficiales <strong>${ux.startsOfficial || 0}</strong> · Completadas <strong>${ux.completedOfficial || 0}</strong> · Practicas <strong>${ux.practiceStarts || 0}</strong><br/>
    ${topAbandon ? `Mayor abandono en pregunta <strong>${topAbandon[0]}</strong> (${topAbandon[1]} veces)` : "Sin datos de abandono todavia"}
  `;
}

function renderTrendChart() {
  if (!trendChartNode) return;
  const points = appState.profile.history.slice(0, 10).reverse();
  if (points.length < 2) {
    trendChartNode.innerHTML = `
      <line class="trend-grid-line" x1="24" y1="140" x2="576" y2="140"></line>
      <text class="trend-label" x="24" y="95">Juega mas dias para ver la tendencia</text>
    `;
    return;
  }

  const width = 600;
  const height = 180;
  const left = 24;
  const right = width - 24;
  const top = 20;
  const bottom = 140;
  const total = points[0].total || 10;

  const buildPoint = (entry, index) => {
    const x = left + (index / (points.length - 1)) * (right - left);
    const ratio = Math.max(0, Math.min(1, entry.score / total));
    const y = bottom - ratio * (bottom - top);
    return { x, y, score: entry.score };
  };

  const coords = points.map(buildPoint);
  const polyline = coords.map((p) => `${p.x},${p.y}`).join(" ");

  const dots = coords
    .map((p, idx) => `<circle class="trend-dot" cx="${p.x}" cy="${p.y}" r="3"></circle>${idx === coords.length - 1 ? `<text class="trend-label" x="${p.x - 12}" y="${p.y - 10}">${p.score}</text>` : ""
      }`)
    .join("");

  trendChartNode.innerHTML = `
    <line class="trend-grid-line" x1="${left}" y1="${top}" x2="${right}" y2="${top}"></line>
    <line class="trend-grid-line" x1="${left}" y1="${(top + bottom) / 2}" x2="${right}" y2="${(top + bottom) / 2}"></line>
    <line class="trend-grid-line" x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}"></line>
    <polyline class="trend-line" points="${polyline}"></polyline>
    ${dots}
  `;
}

function renderHistory() {
  if (!historyList) return;
  if (!appState.profile.history.length) {
    historyList.innerHTML = '<li><span>No hay partidas aun.</span><span class="date">Hoy puede ser la primera.</span></li>';
    renderWeeklySummary();
    renderUxSummary();
    renderConsistencyHeatmap();
    renderHistoryRadar();
    renderAchievements();
    renderNextAchievementCard();
    renderTrendChart();
    renderPersonalRecords();
    renderWeeklyLeague();
    return;
  }

  historyList.innerHTML = appState.profile.history
    .slice(0, 12)
    .map((entry) => `<li><span><strong>${entry.score}/${entry.total}</strong> (${entry.percent}%)</span><span class="date">${formatDate(entry.date)}</span></li>`)
    .join("");

  renderWeeklySummary();
  renderUxSummary();
  renderConsistencyHeatmap();
  renderHistoryRadar();
  renderAchievements();
  renderNextAchievementCard();
  renderTrendChart();
  renderPersonalRecords();
  renderWeeklyLeague();
}

function renderExplorePanel() {
  const exploreGrid = document.querySelector("#explore-grid");
  if (!exploreGrid) return;

  const playerLevel = getLevelInfo(appState.profile.xp).level;

  exploreGrid.innerHTML = QUIZ_CATALOG.categories.map(cat => {
    const cards = cat.quizzes.map(q => {
      const unlocked = isQuizUnlocked(q, playerLevel);
      const isDaily = q.id === appState.quizId;
      const lockTag = q.free ? 'GRATIS' : (unlocked ? 'DESBLOQUEADO' : `\uD83D\uDD12 Lv.${q.unlockLevel || '?'}`);
      const tagClass = q.free ? 'tag-free' : (unlocked ? 'tag-unlocked' : 'tag-locked');
      return `
        <button class="explore-card${unlocked ? '' : ' is-locked'}${isDaily ? ' is-daily' : ''}" 
                data-quiz="${q.id}" ${unlocked ? '' : 'disabled'} type="button">
          <span class="card-tag ${tagClass}">${lockTag}</span>
          ${isDaily ? '<span class="card-daily-badge">HOY</span>' : ''}
          <span class="card-label">${q.label}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="explore-category">
        <h3 class="explore-cat-title">${cat.name}</h3>
        <div class="explore-row">${cards}</div>
      </div>
    `;
  }).join('');

  exploreGrid.querySelectorAll('.explore-card:not(.is-locked)').forEach(card => {
    card.addEventListener('click', () => {
      const quizId = card.dataset.quiz;
      if (quizId) startExploreMatch(quizId);
    });
  });
}

async function startExploreMatch(quizId) {
  const quizConfig = QUIZ_CONFIGS[quizId];
  if (!quizConfig) return;

  const quizData = await loadQuizData(quizId);
  if (!quizData || !quizData.questions.length) return;

  // Switch to the daily panel to show the game
  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('is-active'));
  const dailyPanel = document.querySelector('#daily');
  const explorePanel = document.querySelector('#explore');
  if (dailyPanel) dailyPanel.style.display = '';
  if (explorePanel) explorePanel.style.display = 'none';
  window.location.hash = 'daily';

  // Set up practice match with the selected quiz
  appState.quizData = quizData;
  appState.speakers = getSpeakerList(quizData.questions);
  appState.practiceMode = true;
  appState.inProgress = true;
  appState.locked = false;
  appState.questionIndex = 0;
  appState.score = 0;
  appState.consecutiveCorrect = 0;
  appState.startedAt = Date.now();

  const pool = quizData.questions.map(q => ({ ...q, options: q.options.map(o => ({ ...o })) }));
  const random = mulberry32(hashString(`${Date.now()}:${Math.random()}:explore`));
  appState.dailyQuestions = shuffleWithRandom(pool, random).slice(0, Math.min(DAILY_QUESTIONS, pool.length)).map(q => ({
    ...q, options: shuffleWithRandom(q.options, mulberry32(hashString(`${q.id}:${Math.random()}`)))
  }));

  const dailyTitle = document.querySelector('#daily-title');
  if (dailyTitle) dailyTitle.textContent = `Pr\u00e1ctica \u00b7 ${quizConfig.label}`;

  trackMetric('practiceStarts', 1);
  renderDailyStatus();
  renderQuestion();
}

function rerenderCompetitiveViews() {
  const ranking = renderLeaderboard();
  appState.rankDelta = computeRankDelta(ranking.myRank);
  renderProfileStats(ranking.myRank);
  renderInsights();
  if (appState.rankingView === "daily") runRankingSearch();
}

function saveRankingPref() {
  localStorage.setItem(
    getRankingPrefKey(),
    JSON.stringify({ mode: appState.rankingMode, roomCode: appState.roomCode, view: appState.rankingView })
  );
}

function renderRankingViewMode() {
  if (rankingDailyViewNode) rankingDailyViewNode.classList.toggle("is-hidden", appState.rankingView !== "daily");
  if (weeklyLeagueNode) weeklyLeagueNode.classList.toggle("is-hidden", appState.rankingView !== "weekly");
  if (rankingViewHintNode) {
    rankingViewHintNode.textContent =
      appState.rankingView === "daily"
        ? "Top 5 del dia en Global o Amigos."
        : "Progreso acumulado de esta semana.";
  }
}

function initRankingControls() {
  const prefRaw = localStorage.getItem(getRankingPrefKey());
  if (prefRaw) {
    try {
      const pref = JSON.parse(prefRaw);
      if (pref && (pref.mode === "global" || pref.mode === "friends")) appState.rankingMode = pref.mode;
      if (pref && typeof pref.roomCode === "string") appState.roomCode = pref.roomCode;
      if (pref && (pref.view === "daily" || pref.view === "weekly")) appState.rankingView = pref.view;
    } catch (error) {
      // ignore
    }
  }

  if (rankingViewNode) {
    const tabs = [...rankingViewNode.querySelectorAll(".quiz-tab")];
    tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.view === appState.rankingView);
      tab.addEventListener("click", () => {
        const view = tab.dataset.view;
        if (!view || view === appState.rankingView) return;
        appState.rankingView = view;
        tabs.forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
        saveRankingPref();
        renderRankingViewMode();
      });
    });
  }

  if (rankingModeNode) {
    const tabs = [...rankingModeNode.querySelectorAll(".quiz-tab")];
    tabs.forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.mode === appState.rankingMode);
      tab.addEventListener("click", () => {
        const mode = tab.dataset.mode;
        if (!mode || mode === appState.rankingMode) return;
        appState.rankingMode = mode;
        tabs.forEach((item) => item.classList.toggle("is-active", item.dataset.mode === mode));
        saveRankingPref();
        rerenderCompetitiveViews();
        if (appState.rankingView === "daily") runRankingSearch();
      });
    });
  }

  if (roomCodeNode) roomCodeNode.value = appState.roomCode || "";
  if (applyRoomNode) {
    applyRoomNode.addEventListener("click", () => {
      appState.roomCode = (roomCodeNode ? roomCodeNode.value : "").trim().toUpperCase();
      saveRankingPref();
      rerenderCompetitiveViews();
      if (appState.rankingView === "daily") runRankingSearch();
    });
  }

  if (rankingSearchButton) rankingSearchButton.addEventListener("click", runRankingSearch);
  if (rankingSearchInput) {
    rankingSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runRankingSearch();
    });
  }

  renderRankingViewMode();
}

function initProfileControls() {
  if (!profileNameInput || !profileSaveButton) return;
  profileNameInput.value = appState.profile.displayName || "You";
  profileSaveButton.addEventListener("click", () => {
    const next = (profileNameInput.value || "").trim().slice(0, 18);
    appState.profile.displayName = next || "You";
    saveProfile();
    renderProfileChip();
    rerenderCompetitiveViews();
    profileSaveButton.textContent = "Guardado";
    setTimeout(() => {
      profileSaveButton.textContent = "Guardar";
    }, 900);
  });
}

function renderProfileChip() {
  const name = appState.profile.displayName || "You";
  if (profileNameChip) profileNameChip.textContent = name;

  // Update dropdown level
  const pdLevel = document.querySelector("#pd-level");
  if (pdLevel) {
    const li = getLevelInfo(appState.profile.xp);
    pdLevel.textContent = `Lv. ${li.level}`;
  }

  // League tier border on avatar button
  const avatarBtn = document.querySelector("#profile-avatar-btn");
  if (avatarBtn) {
    const li = getLevelInfo(appState.profile.xp);
    const tier = getLeagueTier(li.level);
    avatarBtn.classList.remove("tier-bronze", "tier-silver", "tier-gold", "tier-platinum", "tier-diamond");
    if (tier && tier.cssClass) {
      avatarBtn.classList.add(tier.cssClass.replace('tier-', 'tier-'));
    }
  }
}

function initProfileDropdown() {
  // Test/Dev button to reset daily game
  const devResetBtn = document.querySelector("#dev-reset-btn");
  if (devResetBtn) {
    devResetBtn.addEventListener("click", () => {
      if (confirm("¿Reiniciar partida diaria para probar de nuevo?")) {
        // Remove today's history entry if it exists
        if (appState.profile.history && appState.profile.history.length > 0) {
          appState.profile.history = appState.profile.history.filter(
            entry => entry.date !== appState.todayKey
          );
        }
        appState.todayResult = null;
        appState.inProgress = false;
        appState.questionIndex = 0;
        appState.score = 0;
        appState.startTime = null;
        clearSessionState();
        saveProfile();
        window.location.reload();
      }
    });
  }

  const avatarBtn = document.querySelector("#profile-avatar-btn");
  const dropdown = document.querySelector("#profile-dropdown");
  if (!avatarBtn || !dropdown) return;

  avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.classList.toggle("is-open");
    avatarBtn.setAttribute("aria-expanded", String(isOpen));
    dropdown.setAttribute("aria-hidden", String(!isOpen));
  });

  // Close on click outside
  document.addEventListener("click", (e) => {
    if (!dropdown.contains(e.target) && e.target !== avatarBtn) {
      dropdown.classList.remove("is-open");
      avatarBtn.setAttribute("aria-expanded", "false");
      dropdown.setAttribute("aria-hidden", "true");
    }
  });

  // Social from dropdown
  const pdSocial = document.querySelector("#pd-social-btn");
  if (pdSocial) {
    pdSocial.addEventListener("click", () => {
      dropdown.classList.remove("is-open");
      avatarBtn.setAttribute("aria-expanded", "false");
      openSocialDrawer();
    });
  }
}

function initTopThemeControl() {
  if (!topThemeSelect) return;
  topThemeSelect.innerHTML = THEME_OPTIONS
    .map((option) => `<option value="${option.id}">${option.label}</option>`)
    .join("");
  topThemeSelect.value = getSavedTheme();
  topThemeSelect.addEventListener("change", () => {
    applyTheme(topThemeSelect.value);
  });
}

function renderFriendsList() {
  if (!friendsListNode) return;
  const friends = Array.isArray(appState.profile.friends) ? appState.profile.friends : [];
  if (!friends.length) {
    friendsListNode.innerHTML = '<li><span>Sin amigos aun.</span><span class="date">Agrega para ranking social.</span></li>';
    return;
  }

  friendsListNode.innerHTML = friends
    .map(
      (name, index) =>
        `<li><span>${name}</span><button class="btn btn-outline" data-remove-friend="${index}" type="button">Quitar</button></li>`
    )
    .join("");

  friendsListNode.querySelectorAll("[data-remove-friend]").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.getAttribute("data-remove-friend"));
      if (Number.isNaN(idx)) return;
      appState.profile.friends.splice(idx, 1);
      saveProfile();
      renderFriendsList();
      rerenderCompetitiveViews();
    });
  });
}

function openSocialDrawer() {
  if (!socialDrawer) return;
  socialDrawer.classList.add("is-open");
  socialDrawer.setAttribute("aria-hidden", "false");
  if (socialBackdrop) socialBackdrop.hidden = false;
}

function closeSocialDrawer() {
  if (!socialDrawer) return;
  socialDrawer.classList.remove("is-open");
  socialDrawer.setAttribute("aria-hidden", "true");
  if (socialBackdrop) socialBackdrop.hidden = true;
}

function initSocialPanel() {
  renderFriendsList();

  // Inject sound toggle into the social drawer
  if (socialDrawer) {
    const toggleRow = document.createElement("div");
    toggleRow.className = "sound-toggle-row";
    const onClass = SFX.on ? " is-on" : "";
    toggleRow.innerHTML = '<span>\ud83d\udd0a Sonidos</span><button class="sound-toggle' + onClass + '" type="button" id="sfx-toggle" aria-label="Toggle sound"></button>';
    socialDrawer.appendChild(toggleRow);
    const sfxBtn = document.querySelector("#sfx-toggle");
    if (sfxBtn) {
      sfxBtn.addEventListener("click", () => {
        const on = SFX.toggle();
        sfxBtn.classList.toggle("is-on", on);
        if (on) SFX.pop();
      });
    }
  }

  if (socialToggleButton) socialToggleButton.addEventListener("click", openSocialDrawer);
  if (socialCloseButton) socialCloseButton.addEventListener("click", closeSocialDrawer);
  if (socialBackdrop) socialBackdrop.addEventListener("click", closeSocialDrawer);

  if (friendAddButton) {
    friendAddButton.addEventListener("click", () => {
      const value = (friendNameInput ? friendNameInput.value : "").trim().slice(0, 18);
      if (!value) return;
      if (!Array.isArray(appState.profile.friends)) appState.profile.friends = [];
      if (!appState.profile.friends.includes(value)) appState.profile.friends.push(value);
      if (friendNameInput) friendNameInput.value = "";
      saveProfile();
      renderFriendsList();
      rerenderCompetitiveViews();
    });
  }
}

async function init() {
  if (window.location.hash) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search} `);
  }

  appState.quizId = getSelectedQuizId();
  localStorage.setItem("gts_selected_quiz", appState.quizId);

  appState.quizData = await loadQuizData(appState.quizId);
  if (!appState.quizData || !Array.isArray(appState.quizData.questions) || !appState.quizData.questions.length) {
    if (dailyGameNode) dailyGameNode.textContent = "No se pudo cargar la partida diaria.";
    return;
  }

  appState.todayKey = toDateKey(new Date());
  appState.profile = loadProfile();
  recoverAbandonIfNeeded();
  appState.dailyQuestions = buildDailyQuestionSet();
  appState.todayResult = getTodayResult();
  appState.dailyMission = getDailyMission(appState.todayKey);
  appState.playerCount = randomPlayersCount();

  updateDerivedState();
  initRankingControls();
  initProfileControls();
  initTopThemeControl();
  initProfileDropdown();
  renderProfileChip();
  initSocialPanel();

  const dailyTitle = document.querySelector("#daily-title");
  if (dailyTitle) dailyTitle.textContent = `Daily Match · ${DAILY_QUESTIONS} preguntas`;
  if (dailyDateNode) dailyDateNode.textContent = `Fecha: ${formatDate(appState.todayKey)} `;
  if (playersTodayNode) playersTodayNode.textContent = appState.playerCount.toLocaleString("en-US");

  if (dailyGameNode) {
    renderDailyStatus();
    if (appState.todayResult) {
      renderLockedState();
    } else {
      renderIdleState();
    }
  }

  const ranking = renderLeaderboard();
  if (appState.todayResult && typeof appState.todayResult.rank !== "number" && ranking.myRank) {
    appState.todayResult.rank = ranking.myRank;
    const todayEntry = appState.profile.history.find((entry) => entry.date === appState.todayKey);
    if (todayEntry) todayEntry.rank = ranking.myRank;
    saveProfile();
  }
  appState.rankDelta = computeRankDelta(ranking.myRank);
  renderProfileStats(ranking.myRank);
  renderInsights();
  renderHistory();
  renderWeeklyLeague();
  renderHomePrimarySection(false);

  updateCountdown();
  setInterval(updateCountdown, 1000);

  window.addEventListener("beforeunload", () => {
    if (appState.inProgress) {
      persistSessionState();
    } else {
      clearSessionState();
    }
  });

  // Auto-start practice match if arriving from explore page
  const params = new URLSearchParams(window.location.search);
  const practiceQuizId = params.get("practice");
  if (practiceQuizId && QUIZ_CONFIGS[practiceQuizId]) {
    history.replaceState(null, "", window.location.pathname);
    startExploreMatch(practiceQuizId);
  }
}

init();
