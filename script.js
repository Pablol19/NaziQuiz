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
const heatmapNode = document.querySelector("#consistency-heatmap");
const achievementsNode = document.querySelector("#achievements");
const percentileChipNode = document.querySelector("#percentile-chip");
const comebackPromptNode = document.querySelector("#comeback-prompt");
const returnPromptNode = document.querySelector("#return-prompt");

const statStreak = document.querySelector("#stat-streak");
const statBestStreak = document.querySelector("#stat-best-streak");
const statAccuracy = document.querySelector("#stat-accuracy");
const statRank = document.querySelector("#stat-rank");
const statPercentile = document.querySelector("#stat-percentile");
const statShield = document.querySelector("#stat-shield");

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
  bestScoreToday: 0
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
      consistencyMap: parsed.consistencyMap || {}
    };
  } catch (error) {
    return createDefaultProfile();
  }
}

function saveProfile() {
  localStorage.setItem(getStorageKey(), JSON.stringify(appState.profile));
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

function renderProfileStats(playerRank) {
  statStreak.textContent = String(appState.profile.streakCurrent);
  statBestStreak.textContent = String(appState.profile.streakBest);
  statAccuracy.textContent = `${getAccuracy()}%`;
  statRank.textContent = playerRank ? `#${playerRank}` : "--";
  if (statPercentile) statPercentile.textContent = appState.percentile ? `Top ${appState.percentile}%` : "--";
  if (statShield) statShield.textContent = appState.shieldAvailable ? "Disponible" : "Usado";
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
      <p>Hoy estas a <strong>${needed}</strong> acierto(s) de superar tu mejor marca (${best}/${total}).</p>
    `;
  }

  if (streakCardNode) {
    const streakText = appState.todayResult
      ? "Racha protegida hoy."
      : appState.streakAtRisk
        ? "Racha en riesgo: quedan pocas horas."
        : "Racha activa, manten el ritmo.";
    streakCardNode.innerHTML = `
      <h4>Streak Card</h4>
      <p>${streakText} Escudo mensual: <strong>${appState.shieldAvailable ? "Disponible" : "Usado"}</strong>.</p>
    `;
  }

  const nextMilestone = STREAK_MILESTONES.find((item) => item > appState.profile.streakCurrent) || null;
  if (nextRewardNode) {
    nextRewardNode.innerHTML = `
      <h4>Next Reward</h4>
      <p>${nextMilestone ? `Te faltan ${nextMilestone - appState.profile.streakCurrent} dia(s) para hito ${nextMilestone}.` : "Todos los hitos principales desbloqueados."}</p>
      <p>Meta semanal: <strong>${appState.weeklyProgress}/5</strong>.</p>
    `;
  }

  if (returnPromptNode) {
    const rankHint = appState.percentile ? `Hoy puedes mejorar tu top ${appState.percentile}%.` : "Hoy puedes subir posiciones en el ranking.";
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
    dailyStatusNode.innerHTML = `<p>Partida en curso. <strong>${appState.questionIndex + 1}/${total}</strong></p>`;
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
    <button id="daily-start" class="btn btn-primary" type="button">Jugar ahora</button>
  `;

  const startButton = document.querySelector("#daily-start");
  if (startButton) startButton.addEventListener("click", startDailyMatch);
}

function renderIdleState() {
  dailyGameNode.innerHTML = `
    <div class="daily-idle">
      <h4>Daily Match preparado</h4>
      <p>Responde ${appState.dailyQuestions.length} citas para registrar tu resultado oficial de hoy.</p>
    </div>
  `;
}

function renderLockedState() {
  const remaining = resetTimerNode ? resetTimerNode.textContent : "--:--:--";
  dailyGameNode.innerHTML = `
    <div class="daily-locked">
      <h4>Ya jugaste la partida de hoy</h4>
      <p>Resultado: <strong>${appState.todayResult.score}/${appState.todayResult.total}</strong> (${appState.todayResult.percent}%).</p>
      <p>Tu siguiente intento oficial se desbloquea en <strong>${remaining}</strong>.</p>
      <p><a class="btn btn-outline" href="#ranking">Ver ranking</a> <a class="btn btn-outline" href="#history">Ver historial</a></p>
    </div>
  `;
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

  if (appState.questionIndex >= appState.dailyQuestions.length) {
    finishDailyMatch();
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
  saveProfile();

  appState.inProgress = false;
  appState.todayResult = getTodayResult();
  updateDerivedState();

  const ranking = renderLeaderboard();
  appState.nearMiss = Boolean(ranking.myRank && ranking.myRank === ranking.top10Cut + 1);

  dailyGameNode.innerHTML = `
    <div class="daily-finish">
      <h4>Partida terminada</h4>
      <p>Hoy hiciste <strong>${result.score}/${result.total}</strong> (${result.percent}%).</p>
      <p>Tiempo: <strong>${result.durationSec}s</strong>. Vuelve manana para mantener tu ventaja.</p>
      ${appState.nearMiss ? `<p><strong>Near miss:</strong> te falto 1 puesto para entrar en el top 10%.</p>` : ""}
      <p>Mystery bonus desbloqueado: <strong>${result.reward}</strong>.</p>
      <button id="share-result" class="btn btn-outline" type="button">Compartir resultado</button>
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

  appState.inProgress = true;
  appState.locked = false;
  appState.questionIndex = 0;
  appState.score = 0;
  appState.startedAt = Date.now();

  renderDailyStatus();
  renderQuestion();
}

function formatSeconds(value) {
  const minutes = Math.floor(value / 60);
  const seconds = String(value % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
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
  const random = mulberry32(hashString(`${appState.todayKey}:${appState.quizId}:leaderboard`));
  const rows = [];

  for (let i = 0; i < 36; i += 1) {
    const score = Math.max(1, Math.round(total * (0.45 + random() * 0.55)));
    const durationSec = 35 + Math.floor(random() * 210);
    rows.push({
      name: names[Math.floor(random() * names.length)] + Math.floor(10 + random() * 90),
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
    achievementsNode.innerHTML = '<span class="achievement-badge">Sin logros todavia</span>';
    return;
  }

  achievementsNode.innerHTML = appState.profile.achievements
    .slice(0, 10)
    .map((item) => `<span class="achievement-badge">${item}</span>`)
    .join("");
}

function renderHistory() {
  if (!appState.profile.history.length) {
    historyList.innerHTML = '<li><span>No hay partidas aun.</span><span class="date">Hoy puede ser la primera.</span></li>';
    renderConsistencyHeatmap();
    renderAchievements();
    return;
  }

  historyList.innerHTML = appState.profile.history
    .slice(0, 12)
    .map((entry) => `<li><span><strong>${entry.score}/${entry.total}</strong> (${entry.percent}%)</span><span class="date">${formatDate(entry.date)}</span></li>`)
    .join("");

  renderConsistencyHeatmap();
  renderAchievements();
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
      window.location.search = params.toString();
    });
  });
}

async function init() {
  appState.quizId = getSelectedQuizId();
  localStorage.setItem("gts_selected_quiz", appState.quizId);

  appState.quizData = await loadQuizData(appState.quizId);
  if (!appState.quizData || !Array.isArray(appState.quizData.questions) || !appState.quizData.questions.length) {
    dailyGameNode.textContent = "No se pudo cargar la partida diaria.";
    return;
  }

  appState.todayKey = toDateKey(new Date());
  appState.profile = loadProfile();
  appState.dailyQuestions = buildDailyQuestionSet();
  appState.todayResult = getTodayResult();
  appState.playerCount = randomPlayersCount();

  updateDerivedState();
  initQuizSelector();

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
  renderProfileStats(ranking.myRank);
  renderInsights();
  renderHistory();

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

init();
