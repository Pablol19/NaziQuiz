const STORAGE_KEY_BASE = "gts_profile_v4";
const DAILY_QUESTIONS = 10;
const QUIZ_CONFIGS = {
  classic: {
    label: "Trump vs Hitler vs Ye",
    file: "question-bank.json"
  },
  tye: {
    label: "Trump vs Elon vs Ye",
    file: "question-bank-trump-elon-ye.json"
  }
};
const DEFAULT_QUIZ_ID = "classic";
const STREAK_MILESTONES = [3, 7, 14, 30];
const MYSTERY_REWARDS = ["Fire Badge", "Neon Crown", "Iron Mind", "Night Owl", "Gold Pulse"];
const FRIEND_NAMES = ["Ari", "Noa", "Sergi", "Luna", "Mia", "Diego", "Vera", "Iris", "Nico", "Alex"];
const SESSION_KEY = `${STORAGE_KEY_BASE}:session_state`;

const dataNode = document.querySelector("#quiz-data");
const dailyDateNode = document.querySelector("#daily-date");
const dailyStatusNode = document.querySelector("#daily-status");
const dailyGameNode = document.querySelector("#daily-game");
const leaderboardBody = document.querySelector("#leaderboard-body");
const historyList = document.querySelector("#history-list");
const resetTimerNode = document.querySelector("#reset-timer");
const playersTodayNode = document.querySelector("#players-today");
const quizSelectorNode = document.querySelector("#quiz-selector");

const goalCardNode = document.querySelector("#goal-card");
const streakCardNode = document.querySelector("#streak-card");
const nextRewardNode = document.querySelector("#next-reward");
const missionCardNode = document.querySelector("#mission-card");
const heatmapNode = document.querySelector("#consistency-heatmap");
const achievementsNode = document.querySelector("#achievements");
const percentileChipNode = document.querySelector("#percentile-chip");
const comebackPromptNode = document.querySelector("#comeback-prompt");
const returnPromptNode = document.querySelector("#return-prompt");
const trendChartNode = document.querySelector("#score-trend-chart");
const rankingModeNode = document.querySelector("#ranking-mode");
const roomCodeNode = document.querySelector("#room-code");
const applyRoomNode = document.querySelector("#apply-room");
const weeklySummaryNode = document.querySelector("#weekly-summary");
const personalRecordsNode = document.querySelector("#personal-records");
const uxSummaryNode = document.querySelector("#ux-summary");
const profileNameInput = document.querySelector("#profile-name-input");
const profileSaveButton = document.querySelector("#profile-save");

const statStreak = document.querySelector("#stat-streak");
const statBestStreak = document.querySelector("#stat-best-streak");
const statAccuracy = document.querySelector("#stat-accuracy");
const statRank = document.querySelector("#stat-rank");
const statPercentile = document.querySelector("#stat-percentile");
const statShield = document.querySelector("#stat-shield");
const statLevel = document.querySelector("#stat-level");
const statXp = document.querySelector("#stat-xp");
const statRankDelta = document.querySelector("#stat-rank-delta");
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
  dailyMission: null,
  rankingMode: "global",
  roomCode: "",
  practiceMode: false
};

function getSelectedQuizId() {
  const params = new URLSearchParams(window.location.search);
  const paramQuiz = params.get("quiz");
  if (paramQuiz && QUIZ_CONFIGS[paramQuiz]) return paramQuiz;

  const localQuiz = localStorage.getItem("gts_selected_quiz");
  if (localQuiz && QUIZ_CONFIGS[localQuiz]) return localQuiz;

  return DEFAULT_QUIZ_ID;
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
      }
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
  statStreak.textContent = String(appState.profile.streakCurrent);
  statBestStreak.textContent = String(appState.profile.streakBest);
  statAccuracy.textContent = `${getAccuracy()}%`;
  statRank.textContent = playerRank ? `#${playerRank}` : "--";
  if (statPercentile) statPercentile.textContent = appState.percentile ? `Top ${appState.percentile}%` : "--";
  if (statShield) statShield.textContent = appState.shieldAvailable ? "Disponible" : "Usado";
  if (statLevel || statXp) {
    const lv = getLevelInfo(appState.profile.xp);
    if (statLevel) statLevel.textContent = `Lv.${lv.level}`;
    if (statXp) statXp.textContent = `${lv.xpInLevel}/100 XP`;
    setXpBarProgress(lv.xpInLevel, false);
  }
  if (statRankDelta) {
    statRankDelta.classList.remove("delta-up", "delta-down");
    if (appState.rankDelta === null) {
      statRankDelta.textContent = "--";
    } else if (appState.rankDelta > 0) {
      statRankDelta.textContent = `+${appState.rankDelta}`;
      statRankDelta.classList.add("delta-up");
    } else if (appState.rankDelta < 0) {
      statRankDelta.textContent = `${appState.rankDelta}`;
      statRankDelta.classList.add("delta-down");
    } else {
      statRankDelta.textContent = "0";
    }
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

  if (returnPromptNode) {
    const rankHint = appState.percentile ? `Ventana de subida abierta: puedes mejorar tu top ${appState.percentile}%.` : "Ventana de subida abierta: hoy puedes escalar el ranking.";
    returnPromptNode.textContent = rankHint;
  }

  if (comebackPromptNode) {
    const recent = appState.profile.history.slice(0, 3);
    const drop = recent.length === 3 && recent[0].score < recent[1].score && recent[1].score < recent[2].score;
    comebackPromptNode.textContent = drop ? "Mini reto comeback: intenta superar tu ultimo puntaje por 2+ aciertos." : "";
  }
}

function renderDailyStatus() {
  const total = appState.dailyQuestions.length;

  if (appState.inProgress) {
    dailyStatusNode.innerHTML = `<p>${appState.practiceMode ? "Revancha en curso" : "Partida en curso"}. <strong>${appState.questionIndex + 1}/${total}</strong></p>`;
    return;
  }

  if (appState.todayResult) {
    dailyStatusNode.innerHTML = `
      <p>Partida completada hoy.</p>
      <p><strong>${appState.todayResult.score}/${appState.todayResult.total}</strong> (${appState.todayResult.percent}%)</p>
    `;
    return;
  }

  dailyStatusNode.innerHTML = `
    <p>Una partida oficial al dia.</p>
  `;
}

function renderIdleState() {
  dailyGameNode.innerHTML = `
    <div class="daily-idle">
      <h4>Daily Match preparado</h4>
      <p>Responde ${appState.dailyQuestions.length} citas para registrar tu resultado oficial de hoy.</p>
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
      <h4>Ya jugaste la partida de hoy</h4>
      <p>Resultado: <strong>${appState.todayResult.score}/${appState.todayResult.total}</strong> (${appState.todayResult.percent}%).</p>
      <p>Tu siguiente intento oficial se desbloquea en <strong>${remaining}</strong>.</p>
      <p><a class="btn btn-outline" href="#ranking">Ver ranking</a> <a class="btn btn-outline" href="#history">Ver historial</a></p>
      <div class="practice-banner">
        <span class="practice-note">Puedes seguir practicando sin afectar la partida oficial.</span>
        <button id="practice-start" class="btn btn-outline" type="button">Revancha no oficial</button>
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

  dailyGameNode.querySelectorAll(".daily-option").forEach((button) => {
    button.addEventListener("click", () => onAnswer(button));
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

  if (picked.isCorrect) appState.score += 1;

  dailyGameNode.querySelectorAll(".daily-option").forEach((optionButton, index) => {
    const option = question.options[index];
    optionButton.disabled = true;
    optionButton.classList.add(option.isCorrect ? "is-correct" : "is-wrong");
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
  }, 850);
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

  renderDailyStatus();
  renderQuestion();
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

  dailyGameNode.innerHTML = `
    <div class="daily-finish">
      <h4>Partida terminada</h4>
      <p>Hoy hiciste <strong>${result.score}/${result.total}</strong> (${result.percent}%).</p>
      <p>Tiempo: <strong>${result.durationSec}s</strong>. Vuelve manana para mantener tu ventaja.</p>
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

  renderProfileStats(ranking.myRank);
  renderDailyStatus();
  renderInsights();
  renderHistory();
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
  const namesPool = appState.rankingMode === "friends" ? FRIEND_NAMES : names;
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
  const total = appState.dailyQuestions.length;
  const rows = buildLeaderboardData();
  let myRank = null;

  rows.forEach((row, index) => {
    if (row.isMe) myRank = index + 1;
  });

  const topRows = rows.slice(0, 10);
  const htmlRows = topRows
    .map((row, index) => {
      const label = row.isMe ? "You" : row.name;
      const rowClass = row.isMe ? ' class="me"' : "";
      return `<tr${rowClass}><td>${index + 1}</td><td>${label}</td><td>${row.score}/${total}</td><td>${formatSeconds(row.durationSec)}</td></tr>`;
    })
    .join("");

  let myRow = "";
  if (myRank && myRank > 10) {
    const me = rows[myRank - 1];
    myRow = `<tr><td colspan="4">...</td></tr><tr class="me"><td>${myRank}</td><td>You</td><td>${me.score}/${total}</td><td>${formatSeconds(me.durationSec)}</td></tr>`;
  }

  leaderboardBody.innerHTML = htmlRows + myRow;

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
    .map((p, idx) => `<circle class="trend-dot" cx="${p.x}" cy="${p.y}" r="3"></circle>${
      idx === coords.length - 1 ? `<text class="trend-label" x="${p.x - 12}" y="${p.y - 10}">${p.score}</text>` : ""
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
  if (!appState.profile.history.length) {
    historyList.innerHTML = '<li><span>No hay partidas aun.</span><span class="date">Hoy puede ser la primera.</span></li>';
    renderWeeklySummary();
    renderUxSummary();
    renderConsistencyHeatmap();
    renderAchievements();
    renderTrendChart();
    renderPersonalRecords();
    return;
  }

  historyList.innerHTML = appState.profile.history
    .slice(0, 12)
    .map((entry) => `<li><span><strong>${entry.score}/${entry.total}</strong> (${entry.percent}%)</span><span class="date">${formatDate(entry.date)}</span></li>`)
    .join("");

  renderWeeklySummary();
  renderUxSummary();
  renderConsistencyHeatmap();
  renderAchievements();
  renderTrendChart();
  renderPersonalRecords();
}

function initQuizSelector() {
  if (!quizSelectorNode) return;
  const tabs = [...quizSelectorNode.querySelectorAll(".quiz-tab")];

  tabs.forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.quiz === appState.quizId);
    tab.addEventListener("click", () => {
      const selected = tab.dataset.quiz;
      if (!selected || selected === appState.quizId) return;
      const params = new URLSearchParams(window.location.search);
      params.set("quiz", selected);
      window.location.href = `${window.location.pathname}?${params.toString()}`;
    });
  });
}

function rerenderCompetitiveViews() {
  const ranking = renderLeaderboard();
  appState.rankDelta = computeRankDelta(ranking.myRank);
  renderProfileStats(ranking.myRank);
  renderInsights();
}

function initRankingControls() {
  const prefRaw = localStorage.getItem(getRankingPrefKey());
  if (prefRaw) {
    try {
      const pref = JSON.parse(prefRaw);
      if (pref && (pref.mode === "global" || pref.mode === "friends")) appState.rankingMode = pref.mode;
      if (pref && typeof pref.roomCode === "string") appState.roomCode = pref.roomCode;
    } catch (error) {
      // ignore
    }
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
        localStorage.setItem(getRankingPrefKey(), JSON.stringify({ mode: appState.rankingMode, roomCode: appState.roomCode }));
        rerenderCompetitiveViews();
      });
    });
  }

  if (roomCodeNode) roomCodeNode.value = appState.roomCode || "";
  if (applyRoomNode) {
    applyRoomNode.addEventListener("click", () => {
      appState.roomCode = (roomCodeNode ? roomCodeNode.value : "").trim().toUpperCase();
      localStorage.setItem(getRankingPrefKey(), JSON.stringify({ mode: appState.rankingMode, roomCode: appState.roomCode }));
      rerenderCompetitiveViews();
    });
  }
}

function initProfileControls() {
  if (!profileNameInput || !profileSaveButton) return;
  profileNameInput.value = appState.profile.displayName || "You";
  profileSaveButton.addEventListener("click", () => {
    const next = (profileNameInput.value || "").trim().slice(0, 18);
    appState.profile.displayName = next || "You";
    saveProfile();
    rerenderCompetitiveViews();
    profileSaveButton.textContent = "Guardado";
    setTimeout(() => {
      profileSaveButton.textContent = "Guardar";
    }, 900);
  });
}

async function init() {
  if (window.location.hash) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  appState.quizId = getSelectedQuizId();
  localStorage.setItem("gts_selected_quiz", appState.quizId);

  appState.quizData = await loadQuizData(appState.quizId);
  if (!appState.quizData || !Array.isArray(appState.quizData.questions) || !appState.quizData.questions.length) {
    dailyGameNode.textContent = "No se pudo cargar la partida diaria.";
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
  initQuizSelector();
  initRankingControls();
  initProfileControls();

  const quizLabel = QUIZ_CONFIGS[appState.quizId]?.label || "";
  const dailyTitle = document.querySelector("#daily-title");
  if (dailyTitle && quizLabel) dailyTitle.textContent = `Daily Match · ${quizLabel}`;
  if (dailyDateNode) dailyDateNode.textContent = `Fecha: ${formatDate(appState.todayKey)}`;
  if (playersTodayNode) playersTodayNode.textContent = appState.playerCount.toLocaleString("en-US");

  renderDailyStatus();
  if (appState.todayResult) {
    renderLockedState();
  } else {
    renderIdleState();
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

  updateCountdown();
  setInterval(updateCountdown, 1000);

  window.addEventListener("beforeunload", () => {
    if (appState.inProgress) {
      persistSessionState();
    } else {
      clearSessionState();
    }
  });
}

init();
