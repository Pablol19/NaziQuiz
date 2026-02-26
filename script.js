const STORAGE_KEY = "gts_profile_v2";
const DAILY_QUESTIONS = 10;
const SPEAKERS = ["Donald Trump", "Adolf Hitler", "Ye"];

const dataNode = document.querySelector("#quiz-data");
const dailyDateNode = document.querySelector("#daily-date");
const dailyStatusNode = document.querySelector("#daily-status");
const dailyGameNode = document.querySelector("#daily-game");
const leaderboardBody = document.querySelector("#leaderboard-body");
const historyList = document.querySelector("#history-list");
const resetTimerNode = document.querySelector("#reset-timer");
const playersTodayNode = document.querySelector("#players-today");

const statStreak = document.querySelector("#stat-streak");
const statBestStreak = document.querySelector("#stat-best-streak");
const statAccuracy = document.querySelector("#stat-accuracy");
const statRank = document.querySelector("#stat-rank");

const appState = {
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
  playerCount: 0
};

function createDefaultProfile() {
  return {
    displayName: "You",
    streakCurrent: 0,
    streakBest: 0,
    totalMatches: 0,
    totalCorrect: 0,
    totalAnswers: 0,
    lastPlayedDate: "",
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
  if (/god|chosen|destiny|providence|heaven/.test(text)) {
    return "A. God complex / Messiah / Destiny";
  }
  if (/unfair|blame|fault|victim|persecut/.test(text)) {
    return "B. Paranoia / Persecution / Victimhood";
  }
  if (/media|press|news|propaganda|truth|lie/.test(text)) {
    return "C. Media hostility / Fake News / Propaganda";
  }
  if (/genius|greatest|best|smart|brain|number one|i\s+am/.test(text)) {
    return "D. Extreme narcissism / self-aggrandizement";
  }
  if (/win|winner|loser|fight|force|strength|victor|brutal|defeat/.test(text)) {
    return "E. Social Darwinism / winning at all costs / retaliation";
  }
  if (/dream|sleep|magnet|future|present|volcanic/.test(text)) {
    return "F. Surreal metaphors / stream of consciousness";
  }
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
  const optionSeed = mulberry32(hashString(`options:${index}:${quote}`));

  const options = shuffleWithRandom(
    SPEAKERS.map((name) => ({
      name,
      isCorrect: name === speaker,
      rationale:
        name === speaker
          ? `Correct. ${context}`
          : makeDistractorRationale(name, speaker, theme)
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

  const questions = rawData.questions
    .map((question, index) => normalizeQuestion(question, index))
    .filter(Boolean);

  return {
    title: rawData.title || "Who said it? Trump, Hitler, or Ye",
    language: rawData.language || "English",
    questions
  };
}

async function loadQuizData() {
  try {
    const response = await fetch("question-bank.json", { cache: "no-store" });
    if (response.ok) {
      const remoteData = await response.json();
      const normalizedRemote = normalizeQuizData(remoteData);
      if (normalizedRemote && normalizedRemote.questions.length) {
        return normalizedRemote;
      }
    }
  } catch (error) {
    // Fallback to inline data if remote file is not available.
  }

  const inlineData = parseInlineData();
  return normalizeQuizData(inlineData);
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw);
    return {
      ...createDefaultProfile(),
      ...parsed,
      history: Array.isArray(parsed.history) ? parsed.history : []
    };
  } catch (error) {
    return createDefaultProfile();
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.profile));
}

function buildBalancedDailyPool(pool, count) {
  const groups = new Map();
  SPEAKERS.forEach((speaker) => groups.set(speaker, []));

  pool.forEach((question) => {
    if (!groups.has(question.speaker)) groups.set(question.speaker, []);
    groups.get(question.speaker).push(question);
  });

  groups.forEach((questions, speaker) => {
    const random = mulberry32(hashString(`${appState.todayKey}:${speaker}:group`));
    groups.set(speaker, shuffleWithRandom(questions, random));
  });

  const target = Math.min(count, pool.length);
  const base = Math.floor(target / SPEAKERS.length);
  const remainder = target % SPEAKERS.length;
  const extraOrder = shuffleWithRandom(
    [...SPEAKERS],
    mulberry32(hashString(`${appState.todayKey}:speaker-order`))
  );

  const picks = [];
  SPEAKERS.forEach((speaker) => {
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
  const hasSpeakers = pool.every((question) => question.speaker);

  let selected;
  if (hasSpeakers) {
    selected = buildBalancedDailyPool(pool, target);
  } else {
    const random = mulberry32(hashString(`${appState.todayKey}:questions`));
    selected = shuffleWithRandom(pool, random).slice(0, target);
  }

  const orderRandom = mulberry32(hashString(`${appState.todayKey}:daily-order`));
  const ordered = shuffleWithRandom(selected, orderRandom);

  return ordered.map((question) => {
    const optionRandom = mulberry32(hashString(`${appState.todayKey}:${question.id}:options`));
    return {
      ...question,
      options: shuffleWithRandom(question.options, optionRandom)
    };
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
  return 4200 + Math.floor(random() * 8600);
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();

  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");

  if (resetTimerNode) resetTimerNode.textContent = `${hours}:${minutes}:${seconds}`;

  const liveDate = toDateKey(new Date());
  if (liveDate !== appState.todayKey) {
    location.reload();
  }
}

function renderProfileStats(playerRank) {
  statStreak.textContent = String(appState.profile.streakCurrent);
  statBestStreak.textContent = String(appState.profile.streakBest);
  statAccuracy.textContent = `${getAccuracy()}%`;
  statRank.textContent = playerRank ? `#${playerRank}` : "--";
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
    <button id="daily-start" class="btn btn-primary" type="button">Empezar partida</button>
  `;

  const startButton = document.querySelector("#daily-start");
  startButton.addEventListener("click", startDailyMatch);
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
    </div>
  `;
}

function renderQuestion() {
  const question = appState.dailyQuestions[appState.questionIndex];
  const total = appState.dailyQuestions.length;

  dailyGameNode.innerHTML = `
    <div class="daily-head">
      <p>Pregunta ${appState.questionIndex + 1}/${total}</p>
      <p>Puntaje actual: ${appState.score}</p>
    </div>
    <p class="daily-theme">${question.theme}</p>
    <blockquote class="daily-quote">"${question.quote}"</blockquote>
    <div class="daily-options">
      ${question.options
        .map(
          (option, index) =>
            `<button class="daily-option" data-index="${index}" type="button">${option.name}</button>`
        )
        .join("")}
    </div>
    <div id="daily-feedback" class="daily-feedback"></div>
    <button id="daily-next" class="btn btn-outline daily-next" type="button" disabled>Siguiente</button>
  `;

  dailyGameNode.querySelectorAll(".daily-option").forEach((button) => {
    button.addEventListener("click", () => onAnswer(button));
  });

  dailyGameNode.querySelector("#daily-next").addEventListener("click", onNextQuestion);
}

function onAnswer(button) {
  if (appState.locked) return;
  appState.locked = true;

  const question = appState.dailyQuestions[appState.questionIndex];
  const picked = question.options[Number(button.dataset.index)];
  const correct = question.options.find((option) => option.isCorrect);

  if (picked.isCorrect) appState.score += 1;

  dailyGameNode.querySelectorAll(".daily-option").forEach((optionButton, index) => {
    const option = question.options[index];
    optionButton.disabled = true;
    optionButton.classList.add(option.isCorrect ? "is-correct" : "is-wrong");
  });

  const feedback = dailyGameNode.querySelector("#daily-feedback");
  feedback.innerHTML = `
    <p class="daily-result ${picked.isCorrect ? "ok" : "bad"}">${picked.isCorrect ? "Correcto" : "Incorrecto"}.</p>
    <p><strong>Respuesta:</strong> ${correct.name}. ${correct.rationale}</p>
    ${picked.isCorrect ? "" : `<p><strong>Tu eleccion:</strong> ${picked.rationale}</p>`}
  `;

  dailyGameNode.querySelector("#daily-next").disabled = false;
}

function onNextQuestion() {
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

  const yesterday = getYesterdayKey(result.date);
  if (!profile.lastPlayedDate) {
    profile.streakCurrent = 1;
  } else if (profile.lastPlayedDate === yesterday) {
    profile.streakCurrent += 1;
  } else if (profile.lastPlayedDate === result.date) {
    return;
  } else {
    profile.streakCurrent = 1;
  }

  profile.streakBest = Math.max(profile.streakBest, profile.streakCurrent);
  profile.lastPlayedDate = result.date;
  profile.totalMatches += 1;
  profile.totalCorrect += result.score;
  profile.totalAnswers += result.total;
  profile.history.unshift(result);
  profile.history.sort((a, b) => b.date.localeCompare(a.date));
  profile.history = profile.history.slice(0, 30);
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

  dailyGameNode.innerHTML = `
    <div class="daily-finish">
      <h4>Partida terminada</h4>
      <p>Hoy hiciste <strong>${result.score}/${result.total}</strong> (${result.percent}%).</p>
      <p>Tiempo: <strong>${result.durationSec}s</strong>. Vuelve manana para extender tu racha.</p>
    </div>
  `;

  const rank = renderLeaderboard();
  renderProfileStats(rank);
  renderDailyStatus();
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
  const random = mulberry32(hashString(`${appState.todayKey}:leaderboard`));
  const rows = [];

  for (let i = 0; i < 24; i += 1) {
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
  return myRank;
}

function renderHistory() {
  if (!appState.profile.history.length) {
    historyList.innerHTML =
      '<li><span>No hay partidas aun.</span><span class="date">Hoy puede ser la primera.</span></li>';
    return;
  }

  historyList.innerHTML = appState.profile.history
    .slice(0, 12)
    .map(
      (entry) =>
        `<li><span><strong>${entry.score}/${entry.total}</strong> (${entry.percent}%)</span><span class="date">${formatDate(entry.date)}</span></li>`
    )
    .join("");
}

async function init() {
  appState.quizData = await loadQuizData();
  if (!appState.quizData || !Array.isArray(appState.quizData.questions) || !appState.quizData.questions.length) {
    dailyGameNode.textContent = "No se pudo cargar la partida diaria.";
    return;
  }

  appState.todayKey = toDateKey(new Date());
  appState.profile = loadProfile();
  appState.dailyQuestions = buildDailyQuestionSet();
  appState.todayResult = getTodayResult();
  appState.playerCount = randomPlayersCount();

  if (dailyDateNode) dailyDateNode.textContent = `Fecha: ${formatDate(appState.todayKey)}`;
  if (playersTodayNode) playersTodayNode.textContent = appState.playerCount.toLocaleString("en-US");

  renderDailyStatus();
  if (appState.todayResult) {
    renderLockedState();
  } else {
    renderIdleState();
  }

  const rank = renderLeaderboard();
  renderProfileStats(rank);
  renderHistory();

  updateCountdown();
  setInterval(updateCountdown, 1000);
}

init();
