// ----------------------------- AUTH & STORAGE -----------------------------
let currentUser = null;
let userProgress = {};
let MASTER_QUIZ = [];

function loadMasterQuiz() {
  const stored = localStorage.getItem("ochem_master_quiz_v8");
  const defaultQuiz = window.quizData && Array.isArray(window.quizData) ? window.quizData : [];
  
  if (stored) {
    const parsed = JSON.parse(stored);
    // If stored has fewer than 100 questions but default has >200 → replace automatically
    if (parsed.length < 100 && defaultQuiz.length > 200) {
      if (confirm("⚠️ Your saved question bank appears to be incomplete (only " + parsed.length + " questions).\nLoad the full default bank (over 300 questions)? All current user answers will be reset.")) {
        MASTER_QUIZ = defaultQuiz.map((q, idx) => ({ ...q, id: idx + 1 }));
        saveMasterQuiz();
        // Reset all user answers
        const db = getUsersDB();
        for (let u in db) {
          db[u].answers = {};
          db[u].score = 0;
          db[u].attempts = db[u].attempts || [];
          db[u].scores = db[u].scores || {};
        }
        saveUsersDB(db);
        alert(`✅ Loaded ${MASTER_QUIZ.length} default questions.`);
      } else {
        MASTER_QUIZ = parsed;
      }
    } else {
      MASTER_QUIZ = parsed;
    }
  } else {
    if (defaultQuiz.length) {
      MASTER_QUIZ = defaultQuiz.map((q, idx) => ({ ...q, id: idx + 1 }));
      saveMasterQuiz();
    } else {
      console.error("quizData not found!");
      MASTER_QUIZ = [];
    }
  }
  refreshCategoryDropdowns();
}

function saveMasterQuiz() {
  localStorage.setItem("ochem_master_quiz_v8", JSON.stringify(MASTER_QUIZ));
}

// Reset to the original 300+ questions from data.js
function resetToDefaultQuestions() {
  if (!window.quizData || !Array.isArray(window.quizData)) {
    alert("No default questions found in data.js");
    return;
  }
  if (confirm("⚠️ RESET TO DEFAULT QUESTIONS: This will replace all existing MCQs with the original 300+ questions and erase ALL user progress (answers, attempts, scores).\nAre you absolutely sure?")) {
    MASTER_QUIZ = window.quizData.map((q, idx) => ({ ...q, id: idx + 1 }));
    saveMasterQuiz();
    // Reset all user data
    const db = getUsersDB();
    for (let u in db) {
      db[u].answers = {};
      db[u].score = 0;
      db[u].attempts = [];
      db[u].scores = {};
    }
    saveUsersDB(db);
    if (currentUser) {
      userProgress[currentUser] = db[currentUser];
      recomputeScoreAndSave();
      rebuildFiltered();
    }
    alert(`Reset complete! Now have ${MASTER_QUIZ.length} questions.`);
    if (manageModal.style.display === "flex") manageModal.style.display = "none";
    refreshCategoryDropdowns();
  }
}

function getUsersDB() {
  return JSON.parse(localStorage.getItem("ochem_users_db_v2") || "{}");
}

function saveUsersDB(db) {
  localStorage.setItem("ochem_users_db_v2", JSON.stringify(db));
}

function login(username, password) {
  const db = getUsersDB();
  if (!db[username]) {
    loginError.innerText = "❌ User not found. Create account first.";
    return false;
  }
  if (db[username].password !== password) {
    loginError.innerText = "❌ Incorrect password.";
    return false;
  }
  currentUser = username;
  userProgress[currentUser] = db[username];
  if (!userProgress[currentUser].answers) userProgress[currentUser].answers = {};
  if (!userProgress[currentUser].attempts) userProgress[currentUser].attempts = [];
  if (!userProgress[currentUser].scores) userProgress[currentUser].scores = {};
  recomputeScoreAndSave();
  initAfterLogin();
  return true;
}

function createAccount(username, password) {
  if (!username.trim()) {
    loginError.innerText = "Username required.";
    return false;
  }
  if (password.length < 3) {
    loginError.innerText = "Password must be at least 3 characters.";
    return false;
  }
  const db = getUsersDB();
  if (db[username]) {
    loginError.innerText = "Username already exists.";
    return false;
  }
  db[username] = { password: password, answers: {}, attempts: [], scores: {}, score: 0 };
  saveUsersDB(db);
  loginError.innerText = "✅ Account created! Please login.";
  updateUserDropdown();
  document.getElementById("loginUsername").value = username;
  document.getElementById("loginPassword").value = password;
  return true;
}

function recomputeScoreAndSave() {
  if (!currentUser) return;
  let correct = 0;
  const ans = userProgress[currentUser].answers;
  for (let q of MASTER_QUIZ) {
    if (ans[q.id] !== undefined && ans[q.id] === q.correct) correct++;
  }
  userProgress[currentUser].score = correct;
  const db = getUsersDB();
  if (db[currentUser]) db[currentUser] = userProgress[currentUser];
  saveUsersDB(db);
  updateScoreUI();
}

function updateScoreUI() {
  totalScoreSpan.innerText = `${userProgress[currentUser]?.score || 0}/${MASTER_QUIZ.length}`;
}

function updateUserDropdown() {
  const db = getUsersDB();
  const select = document.getElementById("existingUserSelect");
  select.innerHTML = '<option value="">-- Select Existing User --</option>';
  Object.keys(db).forEach(u => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    select.appendChild(opt);
  });
}

// ----------------------------- QUESTION MANAGEMENT -----------------------------
function isDuplicateQuestion(text, excludeId = -1) {
  const norm = text.trim().toLowerCase();
  return MASTER_QUIZ.some(q => q.text.trim().toLowerCase() === norm && q.id !== excludeId);
}

function addNewMCQ(qtext, opts, correct, cat, expl) {
  if (!qtext || opts.some(o => !o.trim())) return { success: false, reason: "All fields required" };
  if (isDuplicateQuestion(qtext)) return { success: false, reason: "duplicate" };
  const newId = MASTER_QUIZ.length > 0 ? Math.max(...MASTER_QUIZ.map(q => q.id)) + 1 : 1;
  MASTER_QUIZ.push({
    id: newId,
    text: qtext,
    options: [...opts],
    correct: correct,
    category: cat.trim() || "General",
    explanation: expl || "No explanation"
  });
  saveMasterQuiz();
  refreshCategoryDropdowns();
  return { success: true };
}

function updateMCQ(id, qtext, opts, correct, cat, expl) {
  if (!qtext || opts.some(o => !o.trim())) return { success: false, reason: "All fields required" };
  if (isDuplicateQuestion(qtext, id)) return { success: false, reason: "duplicate" };
  const idx = MASTER_QUIZ.findIndex(q => q.id === id);
  if (idx === -1) return { success: false, reason: "not found" };
  MASTER_QUIZ[idx] = { ...MASTER_QUIZ[idx], text: qtext, options: [...opts], correct, category: cat.trim() || "General", explanation: expl || "No explanation" };
  saveMasterQuiz();
  refreshCategoryDropdowns();
  return { success: true };
}

function deleteMCQ(id) {
  MASTER_QUIZ = MASTER_QUIZ.filter(q => q.id !== id);
  saveMasterQuiz();
  const db = getUsersDB();
  for (let user in db) {
    if (db[user].answers && db[user].answers[id] !== undefined) {
      delete db[user].answers[id];
      let newScore = 0;
      for (let q of MASTER_QUIZ) if (db[user].answers[q.id] === q.correct) newScore++;
      db[user].score = newScore;
    }
  }
  saveUsersDB(db);
  if (currentUser) {
    userProgress[currentUser] = db[currentUser];
    recomputeScoreAndSave();
    rebuildFiltered();
  }
  refreshCategoryDropdowns();
}

function deleteAllMCQs() {
  if (confirm("⚠️ DELETE ALL MCQs? This will erase everything. Are you sure?")) {
    MASTER_QUIZ = [];
    saveMasterQuiz();
    const db = getUsersDB();
    for (let u in db) {
      db[u].answers = {};
      db[u].score = 0;
    }
    saveUsersDB(db);
    if (currentUser) {
      userProgress[currentUser] = db[currentUser];
      recomputeScoreAndSave();
      rebuildFiltered();
    }
    alert("All MCQs deleted. You can add new ones.");
    if (manageModal.style.display === "flex") manageModal.style.display = "none";
    if (currentUser) rebuildFiltered();
    refreshCategoryDropdowns();
  }
}

// ----------------------------- SAVE QUIZ ATTEMPT (by category) -----------------------------
function saveCurrentAttempt() {
  if (!currentUser) return;
  const category = categoryFilter.value;
  if (category === "all") {
    alert("Please select a specific category to save an attempt.");
    return;
  }
  const filteredQs = MASTER_QUIZ.filter(q => q.category === category);
  if (filteredQs.length === 0) {
    alert("No questions in this category.");
    return;
  }
  let correctCount = 0;
  const answers = userProgress[currentUser].answers;
  for (let q of filteredQs) {
    if (answers[q.id] !== undefined && answers[q.id] === q.correct) correctCount++;
  }
  const percentage = (correctCount / filteredQs.length) * 100;
  const attempt = {
    date: new Date().toISOString(),
    category: category,
    score: correctCount,
    total: filteredQs.length,
    percentage: percentage,
    timerMode: examActive
  };
  userProgress[currentUser].attempts.push(attempt);
  const currentBest = userProgress[currentUser].scores[category] || 0;
  if (percentage > currentBest) {
    userProgress[currentUser].scores[category] = percentage;
  }
  const db = getUsersDB();
  db[currentUser] = userProgress[currentUser];
  saveUsersDB(db);
  alert(`Attempt saved! ${category}: ${correctCount}/${filteredQs.length} (${percentage.toFixed(1)}%)`);
  if (document.querySelector('.tab-btn[data-tab="analytics"]').classList.contains('active')) renderAnalytics();
}

// ----------------------------- BACKUP / RESTORE -----------------------------
function exportFullBackup() {
  const backup = {
    version: "v2",
    timestamp: new Date().toISOString(),
    masterQuiz: MASTER_QUIZ,
    usersDB: getUsersDB()
  };
  const dataStr = JSON.stringify(backup, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ochem_backup_${new Date().toISOString().slice(0, 19)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  alert("Backup exported.");
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const backup = JSON.parse(e.target.result);
      if (backup.masterQuiz && Array.isArray(backup.masterQuiz) && backup.usersDB) {
        MASTER_QUIZ = backup.masterQuiz;
        saveMasterQuiz();
        localStorage.setItem("ochem_users_db_v2", JSON.stringify(backup.usersDB));
        refreshCategoryDropdowns();
        alert("Restore successful! Reloading page...");
        location.reload();
      } else {
        alert("Invalid backup file format.");
      }
    } catch (err) {
      alert("Error parsing backup file.");
    }
  };
  reader.readAsText(file);
}

// ----------------------------- QUIZ LOGIC -----------------------------
let currentFilteredIds = [];
let currentIdx = 0;
let examActive = false;
let examTimer = null;
let examTimeLeft = 1800;
let answersLocked = false;
let examDurationMinutes = 30;
let categoryChartInstance = null;

function getFilteredQuestions() {
  const cat = categoryFilter.value;
  if (cat === "all") return MASTER_QUIZ;
  return MASTER_QUIZ.filter(q => q.category === cat);
}

function rebuildFiltered() {
  const filtered = getFilteredQuestions();
  currentFilteredIds = filtered.map(q => q.id);
  if (currentIdx >= currentFilteredIds.length) currentIdx = Math.max(0, currentFilteredIds.length - 1);
  updateProgressStats();
  renderQuestionList();
  loadCurrentQuestion();
}

function updateProgressStats() {
  const filtered = getFilteredQuestions();
  const total = filtered.length;
  totalFilteredSpan.innerText = total;
  filteredCountBadge.innerText = total;
  const userAns = userProgress[currentUser]?.answers || {};
  const answered = filtered.filter(q => userAns[q.id] !== undefined).length;
  answeredCounterSpan.innerText = answered;
  const percent = total === 0 ? 0 : (answered / total) * 100;
  progressFill.style.width = `${percent}%`;
  progressPercent.innerText = `${Math.round(percent)}%`;
}

function getCurrentQ() {
  if (currentFilteredIds.length === 0) return null;
  return MASTER_QUIZ.find(q => q.id === currentFilteredIds[currentIdx]);
}

function loadCurrentQuestion() {
  const q = getCurrentQ();
  if (!q) {
    questionTextDiv.innerText = "No questions in this category. Add some using 'Add' button.";
    optionsContainer.innerHTML = "";
    explanationBox.style.display = "none";
    return;
  }
  questionTextDiv.innerText = `${currentIdx + 1}. ${q.text}`;
  optionsContainer.innerHTML = "";
  const userAns = userProgress[currentUser].answers[q.id];
  const isAnswered = userAns !== undefined;
  q.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.innerHTML = `${String.fromCharCode(65 + idx)}. ${opt}`;
    if (isAnswered || answersLocked) btn.disabled = true;
    btn.onclick = () => {
      if (!answersLocked && !isAnswered) handleAnswer(q.id, idx);
    };
    if (isAnswered) {
      if (idx === q.correct) btn.classList.add("option-correct");
      else if (idx === userAns) btn.classList.add("option-wrong");
    }
    optionsContainer.appendChild(btn);
  });
  if (isAnswered) {
    explanationBox.style.display = "block";
    const correctText = userAns === q.correct ? "✅ Correct" : "❌ Incorrect";
    explanationBox.innerHTML = `<strong>📖 Explanation:</strong> ${q.explanation}<br><span>${correctText} (Answer: ${q.options[q.correct]})</span>`;
  } else {
    explanationBox.style.display = "none";
  }
  updateProgressStats();
  renderQuestionList();
}

function handleAnswer(qid, selected) {
  const q = MASTER_QUIZ.find(qq => qq.id === qid);
  if (!q) return;
  userProgress[currentUser].answers[qid] = selected;
  recomputeScoreAndSave();
  loadCurrentQuestion();
}

function renderQuestionList() {
  const filtered = getFilteredQuestions();
  if (!currentUser) return;
  const userAns = userProgress[currentUser].answers;
  const container = document.getElementById("questionListContainer");
  container.innerHTML = "";
  filtered.forEach((q, idx) => {
    const div = document.createElement("div");
    div.className = "q-list-item";
    const ans = userAns[q.id];
    if (ans !== undefined) div.classList.add(ans === q.correct ? "answered-correct" : "answered-wrong");
    if (currentFilteredIds.length && currentFilteredIds[currentIdx] === q.id) div.classList.add("current");
    div.innerHTML = `<span class="q-text">${idx + 1}. ${q.text.length > 50 ? q.text.slice(0, 47) + "..." : q.text}</span>
                     <span class="q-actions"><i class="fas fa-edit edit-q" data-id="${q.id}"></i><i class="fas fa-trash-alt delete-q" data-id="${q.id}"></i></span>`;
    div.querySelector(".edit-q")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(q.id);
    });
    div.querySelector(".delete-q")?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`Delete "${q.text}"?`)) deleteMCQ(q.id);
    });
    div.onclick = () => {
      const newIdx = currentFilteredIds.indexOf(q.id);
      if (newIdx !== -1) {
        currentIdx = newIdx;
        loadCurrentQuestion();
      }
    };
    container.appendChild(div);
  });
}

function nextQuestion() {
  if (currentIdx + 1 < currentFilteredIds.length) {
    currentIdx++;
    loadCurrentQuestion();
  }
}

function prevQuestion() {
  if (currentIdx > 0) {
    currentIdx--;
    loadCurrentQuestion();
  }
}

function resetProgress() {
  if (confirm(`Reset all answers for ${currentUser}?`)) {
    userProgress[currentUser].answers = {};
    userProgress[currentUser].score = 0;
    recomputeScoreAndSave();
    rebuildFiltered();
  }
}

// ----------------------------- EXAM TIMER MODE -----------------------------
function setExamDuration(minutes) {
  minutes = Math.min(120, Math.max(1, minutes));
  examDurationMinutes = minutes;
  document.getElementById("timerMinutesDisplay").innerText = minutes;
  if (!examActive) {
    timerDisplay.innerHTML = `⏲️ ${minutes.toString().padStart(2, "0")}:00`;
    examTimeLeft = minutes * 60;
  } else {
    alert("Turn OFF exam mode first.");
  }
}

function updateTimerDisplay() {
  if (!examActive) {
    timerDisplay.innerHTML = `⏲️ ${examDurationMinutes.toString().padStart(2, "0")}:00`;
  } else {
    const m = Math.floor(examTimeLeft / 60);
    const s = examTimeLeft % 60;
    timerDisplay.innerHTML = `⏲️ ${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
}

function startExamTimer() {
  if (examTimer) clearInterval(examTimer);
  examTimeLeft = examDurationMinutes * 60;
  updateTimerDisplay();
  examTimer = setInterval(() => {
    if (!examActive) return;
    if (examTimeLeft <= 1) {
      clearInterval(examTimer);
      examTimer = null;
      answersLocked = true;
      examActive = false;
      examModeBtn.innerText = "⏱️ Exam OFF";
      examModeBtn.classList.remove("exam-active");
      timerDisplay.innerHTML = "⏲️ EXPIRED";
      alert("Time's up! No more answers allowed.");
      loadCurrentQuestion();
    } else {
      examTimeLeft--;
      updateTimerDisplay();
    }
  }, 1000);
}

function toggleExam() {
  if (!currentUser) return;
  if (examActive) {
    examActive = false;
    answersLocked = false;
    if (examTimer) clearInterval(examTimer);
    examTimer = null;
    examModeBtn.innerText = "⏱️ Exam OFF";
    examModeBtn.classList.remove("exam-active");
    updateTimerDisplay();
    loadCurrentQuestion();
  } else {
    examActive = true;
    answersLocked = false;
    examModeBtn.innerText = "⏱️ Exam ON";
    examModeBtn.classList.add("exam-active");
    startExamTimer();
    loadCurrentQuestion();
  }
}

// ----------------------------- ANALYTICS & LEADERBOARD -----------------------------
function renderAnalytics() {
  const userData = userProgress[currentUser];
  const attempts = userData.attempts || [];
  const scoresByCat = userData.scores || {};
  const summaryDiv = document.getElementById("analyticsSummary");
  let totalQuizzes = attempts.length;
  let avgPercent = 0;
  if (totalQuizzes > 0) {
    const sum = attempts.reduce((acc, a) => acc + a.percentage, 0);
    avgPercent = sum / totalQuizzes;
  }
  summaryDiv.innerHTML = `
    <p><strong>Total Quizzes Taken:</strong> ${totalQuizzes}</p>
    <p><strong>Average Score:</strong> ${avgPercent.toFixed(1)}%</p>
    <p><strong>Category Best Scores:</strong></p>
    <ul>${Object.entries(scoresByCat).map(([cat, score]) => `<li>${cat}: ${score.toFixed(1)}%</li>`).join("")}</ul>
  `;
  const ctx = document.getElementById("categoryChart").getContext("2d");
  if (categoryChartInstance) categoryChartInstance.destroy();
  const categories = Object.keys(scoresByCat);
  const scores = categories.map(c => scoresByCat[c]);
  categoryChartInstance = new Chart(ctx, {
    type: "bar",
    data: { labels: categories, datasets: [{ label: "Best Score (%)", data: scores, backgroundColor: "#3b82f6" }] },
    options: { responsive: true, maintainAspectRatio: true }
  });
  const recentDiv = document.getElementById("recentAttempts");
  recentDiv.innerHTML = "<h4>Recent Attempts</h4>" + attempts.slice(-5).reverse().map(a => `
    <div class="attempt-item">${new Date(a.date).toLocaleString()} - ${a.category}: ${a.score}/${a.total} (${a.percentage.toFixed(1)}%) ${a.timerMode ? "⏱" : ""}</div>
  `).join("");
}

function renderLeaderboard() {
  const category = document.getElementById("leaderboardCategorySelect").value;
  const users = getUsersDB();
  const entries = [];
  for (let user in users) {
    const bestScore = users[user].scores?.[category] || 0;
    entries.push({ username: user, score: bestScore });
  }
  entries.sort((a, b) => b.score - a.score);
  const container = document.getElementById("leaderboardList");
  container.innerHTML = entries.map((entry, idx) => `
    <div class="leaderboard-entry">
      <span class="rank">${idx + 1}</span>
      <span>${entry.username}</span>
      <span>${entry.score.toFixed(1)}%</span>
    </div>
  `).join("");
}

function populateLeaderboardCategories() {
  const select = document.getElementById("leaderboardCategorySelect");
  const categories = [...new Set(MASTER_QUIZ.map(q => q.category).filter(c => c && c.trim() !== ""))];
  select.innerHTML = categories.map(t => `<option value="${t}">${t}</option>`).join("");
  select.addEventListener("change", () => renderLeaderboard());
  renderLeaderboard();
}

// ----------------------------- CATEGORY DROPDOWNS -----------------------------
function refreshCategoryDropdowns() {
  const categories = [...new Set(MASTER_QUIZ.map(q => q.category).filter(c => c && c.trim() !== ""))];
  const formSelect = document.getElementById("formCategory");
  const currentFormVal = formSelect.value;
  formSelect.innerHTML = '<option value="">-- Select existing --</option>';
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    formSelect.appendChild(opt);
  });
  if (categories.includes(currentFormVal)) formSelect.value = currentFormVal;
  const filterSelect = document.getElementById("categoryFilter");
  const currentFilterVal = filterSelect.value;
  filterSelect.innerHTML = '<option value="all">📂 All Topics</option>';
  categories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    filterSelect.appendChild(opt);
  });
  if (currentFilterVal !== "all" && categories.includes(currentFilterVal)) filterSelect.value = currentFilterVal;
  else filterSelect.value = "all";
  if (currentUser) rebuildFiltered();
}

// ----------------------------- EDIT MODAL -----------------------------
function openEditModal(id) {
  const q = MASTER_QUIZ.find(qq => qq.id === id);
  if (!q) return;
  document.getElementById("modalTitle").innerHTML = '<i class="fas fa-edit"></i> Edit MCQ';
  document.getElementById("formQuestion").value = q.text;
  document.getElementById("formOpt0").value = q.options[0];
  document.getElementById("formOpt1").value = q.options[1];
  document.getElementById("formOpt2").value = q.options[2];
  document.getElementById("formOpt3").value = q.options[3];
  document.getElementById("formCorrect").value = q.correct;
  document.getElementById("formCategory").value = q.category;
  document.getElementById("newCategoryInput").value = "";
  document.getElementById("formExplanation").value = q.explanation;
  document.getElementById("editingId").value = id;
  document.getElementById("formError").innerText = "";
  mcqFormModal.style.display = "flex";
}

// ----------------------------- TAB SWITCHING -----------------------------
function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(tab => tab.classList.remove("active"));
  document.getElementById(`${tabId}TabContent`).classList.add("active");
  document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add("active");
  if (tabId === "analytics") renderAnalytics();
  if (tabId === "leaderboard") populateLeaderboardCategories();
}

// ----------------------------- INIT AFTER LOGIN -----------------------------
function initAfterLogin() {
  document.getElementById("userNameDisplay").innerText = currentUser;
  rebuildFiltered();
  document.getElementById("quizApp").style.display = "block";
  document.getElementById("loginOverlay").style.display = "none";
  if (examActive) toggleExam();
  examActive = false;
  answersLocked = false;
  if (examTimer) clearInterval(examTimer);
  examModeBtn.innerText = "⏱️ Exam OFF";
  updateTimerDisplay();
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });
  switchTab("quiz");
}

// ----------------------------- DOM ELEMENTS & EVENT LISTENERS -----------------------------
const loginOverlay = document.getElementById("loginOverlay");
const quizApp = document.getElementById("quizApp");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");
const createAccountBtn = document.getElementById("createAccountBtn");
const switchUserBtn = document.getElementById("switchUserBtn");
const categoryFilter = document.getElementById("categoryFilter");
const examModeBtn = document.getElementById("examModeBtn");
const timerDisplay = document.getElementById("timerDisplay");
const totalScoreSpan = document.getElementById("totalScoreSpan");
const answeredCounterSpan = document.getElementById("answeredCounter");
const totalFilteredSpan = document.getElementById("totalFilteredSpan");
const progressFill = document.getElementById("progressFill");
const progressPercent = document.getElementById("progressPercent");
const filteredCountBadge = document.getElementById("filteredCountBadge");
const questionTextDiv = document.getElementById("questionText");
const optionsContainer = document.getElementById("optionsContainer");
const explanationBox = document.getElementById("explanationBox");
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const resetProgressBtn = document.getElementById("resetProgressBtn");
const addMcqBtn = document.getElementById("addMcqBtn");
const manageMcqBtn = document.getElementById("manageMcqBtn");
const mcqFormModal = document.getElementById("mcqFormModal");
const manageModal = document.getElementById("manageModal");
const saveMcqBtn = document.getElementById("saveMcqBtn");
const cancelFormBtn = document.getElementById("cancelFormBtn");
const closeManageBtn = document.getElementById("closeManageBtn");
const deleteAllMcqBtn = document.getElementById("deleteAllMcqBtn");
const timerMinusBtn = document.getElementById("timerMinusBtn");
const timerPlusBtn = document.getElementById("timerPlusBtn");
const exportBackupBtn = document.getElementById("exportBackupBtn");
const importBackupBtn = document.getElementById("importBackupBtn");
const saveAttemptBtn = document.getElementById("saveAttemptBtn");
const refreshLeaderboardBtn = document.getElementById("refreshLeaderboardBtn");
const resetDefaultQuestionsBtn = document.getElementById("resetDefaultQuestionsBtn");

saveAttemptBtn.onclick = saveCurrentAttempt;
refreshLeaderboardBtn.onclick = renderLeaderboard;
importBackupBtn.onclick = () => {
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = ".json";
  inp.onchange = e => { if (inp.files.length) importBackup(inp.files[0]); };
  inp.click();
};
exportBackupBtn.onclick = exportFullBackup;
timerMinusBtn.onclick = () => { if (!examActive) setExamDuration(examDurationMinutes - 1); else alert("Turn OFF exam mode first."); };
timerPlusBtn.onclick = () => { if (!examActive) setExamDuration(examDurationMinutes + 1); else alert("Turn OFF exam mode first."); };
deleteAllMcqBtn.onclick = deleteAllMCQs;
resetDefaultQuestionsBtn.onclick = resetToDefaultQuestions;
loginBtn.onclick = () => login(loginUsername.value.trim(), loginPassword.value);
createAccountBtn.onclick = () => createAccount(loginUsername.value.trim(), loginPassword.value);
loginPassword.addEventListener("keypress", e => { if (e.key === "Enter") loginBtn.click(); });
switchUserBtn.onclick = () => {
  quizApp.style.display = "none";
  loginOverlay.style.display = "flex";
  currentUser = null;
  loginUsername.value = "";
  loginPassword.value = "";
  loginError.innerText = "";
  updateUserDropdown();
};
categoryFilter.onchange = () => { currentIdx = 0; rebuildFiltered(); };
prevBtn.onclick = prevQuestion;
nextBtn.onclick = nextQuestion;
resetProgressBtn.onclick = resetProgress;
examModeBtn.onclick = toggleExam;
addMcqBtn.onclick = () => {
  document.getElementById("modalTitle").innerHTML = '<i class="fas fa-plus-circle"></i> Add New MCQ';
  document.getElementById("formQuestion").value = "";
  document.getElementById("formOpt0").value = "";
  document.getElementById("formOpt1").value = "";
  document.getElementById("formOpt2").value = "";
  document.getElementById("formOpt3").value = "";
  document.getElementById("formCorrect").value = "0";
  document.getElementById("formCategory").value = "";
  document.getElementById("newCategoryInput").value = "";
  document.getElementById("formExplanation").value = "";
  document.getElementById("editingId").value = "-1";
  document.getElementById("formError").innerText = "";
  mcqFormModal.style.display = "flex";
};
manageMcqBtn.onclick = () => {
  const container = document.getElementById("manageListContainer");
  if (MASTER_QUIZ.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;">📭 No MCQs. Use "Add MCQ".</div>';
  } else {
    container.innerHTML = MASTER_QUIZ.map(q => `
      <div class="manage-item">
        <div class="manage-item-text">${q.id}. ${q.text.substring(0, 70)}...</div>
        <div class="manage-item-actions">
          <i class="fas fa-edit edit-manage" data-id="${q.id}"></i>
          <i class="fas fa-trash-alt delete-manage" data-id="${q.id}"></i>
        </div>
      </div>
    `).join("");
    container.querySelectorAll(".edit-manage").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(btn.dataset.id);
        manageModal.style.display = "none";
        openEditModal(id);
      });
    });
    container.querySelectorAll(".delete-manage").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const id = parseInt(btn.dataset.id);
        if (confirm("Delete this MCQ?")) deleteMCQ(id);
        manageModal.style.display = "none";
        setTimeout(() => manageMcqBtn.click(), 100);
      });
    });
  }
  manageModal.style.display = "flex";
};
closeManageBtn.onclick = () => manageModal.style.display = "none";
saveMcqBtn.onclick = () => {
  const qtext = document.getElementById("formQuestion").value.trim();
  const opts = [
    document.getElementById("formOpt0").value,
    document.getElementById("formOpt1").value,
    document.getElementById("formOpt2").value,
    document.getElementById("formOpt3").value
  ];
  const correct = parseInt(document.getElementById("formCorrect").value);
  const newCat = document.getElementById("newCategoryInput").value.trim();
  let cat = newCat !== "" ? newCat : document.getElementById("formCategory").value.trim();
  if (cat === "") cat = "General";
  const expl = document.getElementById("formExplanation").value.trim();
  const editingId = parseInt(document.getElementById("editingId").value);
  let result;
  if (editingId === -1) result = addNewMCQ(qtext, opts, correct, cat, expl);
  else result = updateMCQ(editingId, qtext, opts, correct, cat, expl);
  if (result.success) {
    mcqFormModal.style.display = "none";
    if (currentUser) rebuildFiltered();
    refreshCategoryDropdowns();
  } else {
    document.getElementById("formError").innerText = result.reason === "duplicate" ? "❌ Duplicate question!" : "❌ All fields required.";
  }
};
cancelFormBtn.onclick = () => mcqFormModal.style.display = "none";

// Initialize
loadMasterQuiz();
updateUserDropdown();
setExamDuration(30);