const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));

const immersiveNode = document.querySelector("#quiz-data");
const appNode = document.querySelector("#quiz-app");

let quizData = null;
let questionIndex = 0;
let score = 0;
let locked = false;

function getCorrectOption(question) {
  return question.options.find((option) => option.isCorrect);
}

function renderQuestion() {
  const question = quizData.questions[questionIndex];
  const progress = `${questionIndex + 1}/${quizData.questions.length}`;

  appNode.innerHTML = `
    <div class="quiz-top">
      <p class="quiz-progress">Question ${progress}</p>
      <p class="quiz-score">Score: ${score}</p>
    </div>
    <p class="quiz-theme">${question.theme}</p>
    <blockquote class="quiz-quote">"${question.quote}"</blockquote>
    <div class="quiz-options">
      ${question.options
        .map(
          (option, idx) =>
            `<button class="quiz-option" data-index="${idx}" type="button">${option.name}</button>`
        )
        .join("")}
    </div>
    <div id="quiz-feedback" class="quiz-feedback"></div>
    <button id="quiz-next" class="btn btn-outline quiz-next" type="button" disabled>Next</button>
  `;

  appNode.querySelectorAll(".quiz-option").forEach((button) => {
    button.addEventListener("click", () => onAnswer(button));
  });
  appNode.querySelector("#quiz-next").addEventListener("click", onNext);
}

function onAnswer(button) {
  if (locked) return;
  locked = true;

  const question = quizData.questions[questionIndex];
  const pickedIndex = Number(button.dataset.index);
  const pickedOption = question.options[pickedIndex];
  const correctOption = getCorrectOption(question);
  const feedbackNode = appNode.querySelector("#quiz-feedback");

  if (pickedOption.isCorrect) {
    score += 1;
  }

  appNode.querySelectorAll(".quiz-option").forEach((optionButton, idx) => {
    const option = question.options[idx];
    optionButton.disabled = true;
    optionButton.classList.add(option.isCorrect ? "is-correct" : "is-wrong");
  });

  feedbackNode.innerHTML = `
    <p class="quiz-result ${pickedOption.isCorrect ? "ok" : "bad"}">
      ${pickedOption.isCorrect ? "Correct" : "Wrong"}.
    </p>
    <p class="quiz-rationale"><strong>Right answer:</strong> ${correctOption.name}. ${correctOption.rationale}</p>
    ${
      pickedOption.isCorrect
        ? ""
        : `<p class="quiz-rationale"><strong>Your pick:</strong> ${pickedOption.rationale}</p>`
    }
  `;

  appNode.querySelector("#quiz-next").disabled = false;
}

function onNext() {
  questionIndex += 1;
  locked = false;

  if (questionIndex >= quizData.questions.length) {
    const percent = Math.round((score / quizData.questions.length) * 100);
    appNode.innerHTML = `
      <div class="quiz-finish">
        <h3>Final score</h3>
        <p>You got <strong>${score}/${quizData.questions.length}</strong> (${percent}%).</p>
        <button id="quiz-restart" class="btn btn-primary" type="button">Play again</button>
      </div>
    `;
    appNode.querySelector("#quiz-restart").addEventListener("click", () => {
      questionIndex = 0;
      score = 0;
      locked = false;
      renderQuestion();
    });
    return;
  }

  renderQuestion();
}

function initQuiz() {
  if (!immersiveNode || !appNode) return;
  try {
    quizData = JSON.parse(immersiveNode.textContent);
  } catch (error) {
    appNode.textContent = "Quiz data could not be loaded.";
    return;
  }

  renderQuestion();
}

initQuiz();
