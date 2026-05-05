const storageScope = new URLSearchParams(window.location.search).get("storage");
const STORAGE_KEY = `slate-board-app-state-v3${storageScope ? `-${storageScope}` : ""}`;
const CLAP_CONTACT_MS = 150;
const CLAP_ANIMATION_MS = 280;

const defaultState = {
  project: {
    production: "未命名專案",
    director: "",
    dop: "",
    date: new Date().toISOString().slice(0, 10),
    location: "",
  },
  slate: {
    scene: "1",
    shot: "1",
    take: 1,
    roll: "A001",
    fps: "24",
    intExt: "內景",
    dayNight: "日",
    sound: "有聲同步",
    camera: "A 機",
    soundFile: "",
  },
  records: [],
};

const legacyMaps = {
  intExt: { INT: "內景", EXT: "外景", "INT/EXT": "內外景" },
  dayNight: { DAY: "日", NIGHT: "夜", DAWN: "黎明", DUSK: "黃昏" },
  sound: { SYNC: "有聲同步", MOS: "無聲", "WILD SOUND": "野聲", PLAYBACK: "播放" },
  status: { Circle: "圈選", Good: "可用", Hold: "保留" },
};

const editDefinitions = {
  production: {
    title: "片名",
    fields: [{ scope: "project", key: "production", label: "片名", type: "text" }],
  },
  date: {
    title: "日期",
    fields: [{ scope: "project", key: "date", label: "日期", type: "date" }],
  },
  director: {
    title: "導演",
    fields: [{ scope: "project", key: "director", label: "導演", type: "text" }],
  },
  scene: {
    title: "場次",
    fields: [{ scope: "slate", key: "scene", label: "場次", type: "text" }],
  },
  shot: {
    title: "鏡號",
    fields: [{ scope: "slate", key: "shot", label: "鏡號", type: "text" }],
  },
  take: {
    title: "次數",
    fields: [{ scope: "slate", key: "take", label: "次數", type: "number", min: 1 }],
  },
  roll: {
    title: "卷卡",
    fields: [{ scope: "slate", key: "roll", label: "卷卡", type: "text" }],
  },
  fps: {
    title: "格率",
    fields: [
      {
        scope: "slate",
        key: "fps",
        label: "格率",
        type: "select",
        options: ["23.976", "24", "25", "29.97", "30", "50", "60"],
      },
    ],
  },
  mode: {
    title: "景別",
    fields: [
      {
        scope: "slate",
        key: "intExt",
        label: "內外景",
        type: "select",
        options: ["內景", "外景", "內外景"],
      },
      {
        scope: "slate",
        key: "dayNight",
        label: "日夜",
        type: "select",
        options: ["日", "夜", "黎明", "黃昏"],
      },
    ],
  },
  sound: {
    title: "收音",
    fields: [
      {
        scope: "slate",
        key: "sound",
        label: "收音",
        type: "select",
        options: ["有聲同步", "無聲", "野聲", "播放"],
      },
    ],
  },
  camera: {
    title: "攝影機",
    fields: [{ scope: "slate", key: "camera", label: "攝影機", type: "text" }],
  },
};

let state = loadState();
let activeEditDefinition = null;
let lastRenderedTimecode = "";
let clapSoundTimer = 0;
let clapResetTimer = 0;

const elements = {
  viewButtons: document.querySelectorAll("[data-view-target]"),
  views: document.querySelectorAll(".view"),
  projectInputs: document.querySelectorAll("[data-project]"),
  slateInputs: document.querySelectorAll("[data-slate]"),
  editableFields: document.querySelectorAll("[data-edit]"),
  displayProduction: document.querySelector("#displayProduction"),
  displayDate: document.querySelector("#displayDate"),
  displayScene: document.querySelector("#displayScene"),
  displayShot: document.querySelector("#displayShot"),
  displayTake: document.querySelector("#displayTake"),
  displayRoll: document.querySelector("#displayRoll"),
  displayFps: document.querySelector("#displayFps"),
  displayMode: document.querySelector("#displayMode"),
  displaySound: document.querySelector("#displaySound"),
  displayDirector: document.querySelector("#displayDirector"),
  displayCamera: document.querySelector("#displayCamera"),
  displayTimecode: document.querySelector("#displayTimecode"),
  slateBoard: document.querySelector("#slateBoard"),
  clapButton: document.querySelector("#clapButton"),
  recordButton: document.querySelector("#recordButton"),
  nextTakeButton: document.querySelector("#nextTakeButton"),
  newSceneButton: document.querySelector("#newSceneButton"),
  newShotButton: document.querySelector("#newShotButton"),
  resetTakeButton: document.querySelector("#resetTakeButton"),
  openDataButton: document.querySelector("#openDataButton"),
  openRecordsButton: document.querySelector("#openRecordsButton"),
  resetButton: document.querySelector("#resetButton"),
  statusInput: document.querySelector("#statusInput"),
  noteInput: document.querySelector("#noteInput"),
  filterInput: document.querySelector("#filterInput"),
  recordsBody: document.querySelector("#recordsBody"),
  totalCount: document.querySelector("#totalCount"),
  circleCount: document.querySelector("#circleCount"),
  goodCount: document.querySelector("#goodCount"),
  exportCsvButton: document.querySelector("#exportCsvButton"),
  exportJsonButton: document.querySelector("#exportJsonButton"),
  printButton: document.querySelector("#printButton"),
  tableWrap: document.querySelector(".table-wrap"),
  editModal: document.querySelector("#editModal"),
  editForm: document.querySelector("#editForm"),
  editTitle: document.querySelector("#editTitle"),
  editControls: document.querySelector("#editControls"),
  closeEditButton: document.querySelector("#closeEditButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
};

bindEvents();
render();
requestAnimationFrame(tickTimecode);

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return migrateState({
      project: { ...defaultState.project, ...parsed.project },
      slate: { ...defaultState.slate, ...parsed.slate },
      records: Array.isArray(parsed.records) ? parsed.records : [],
    });
  } catch {
    return structuredClone(defaultState);
  }
}

function migrateState(nextState) {
  nextState.slate.intExt = legacyMaps.intExt[nextState.slate.intExt] || nextState.slate.intExt;
  nextState.slate.dayNight = legacyMaps.dayNight[nextState.slate.dayNight] || nextState.slate.dayNight;
  nextState.slate.sound = legacyMaps.sound[nextState.slate.sound] || nextState.slate.sound;
  nextState.records = nextState.records.map((record) => ({
    ...record,
    intExt: legacyMaps.intExt[record.intExt] || record.intExt,
    dayNight: legacyMaps.dayNight[record.dayNight] || record.dayNight,
    sound: legacyMaps.sound[record.sound] || record.sound,
    status: legacyMaps.status[record.status] || record.status,
  }));
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function bindEvents() {
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.viewTarget));
  });

  elements.projectInputs.forEach((input) => {
    input.addEventListener("input", () => {
      state.project[input.dataset.project] = input.value;
      saveState();
      renderSlate();
    });
  });

  elements.slateInputs.forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.slate;
      state.slate[key] = key === "take" ? normalizeTake(input.value) : input.value;
      saveState();
      renderSlate();
    });
  });

  elements.editableFields.forEach((button) => {
    button.addEventListener("click", () => openEditor(button.dataset.edit));
  });

  elements.clapButton.addEventListener("click", clap);
  elements.slateBoard.addEventListener("dblclick", clap);
  elements.recordButton.addEventListener("click", recordTake);
  elements.nextTakeButton.addEventListener("click", incrementTake);
  elements.newSceneButton.addEventListener("click", nextScene);
  elements.newShotButton.addEventListener("click", nextShot);
  elements.resetTakeButton.addEventListener("click", () => setTake(1));
  elements.openDataButton.addEventListener("click", () => setView("data"));
  elements.openRecordsButton.addEventListener("click", () => setView("records"));
  elements.filterInput.addEventListener("change", renderRecords);
  elements.exportCsvButton.addEventListener("click", exportCsv);
  elements.exportJsonButton.addEventListener("click", exportJson);
  elements.printButton.addEventListener("click", () => window.print());
  elements.resetButton.addEventListener("click", resetAllData);
  elements.editForm.addEventListener("submit", saveEditor);
  elements.closeEditButton.addEventListener("click", closeEditor);
  elements.cancelEditButton.addEventListener("click", closeEditor);
  elements.editModal.addEventListener("click", (event) => {
    if (event.target === elements.editModal) closeEditor();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.editModal.hidden) closeEditor();
  });
}

function setView(viewName) {
  elements.views.forEach((view) => {
    view.classList.toggle("is-active", view.id === `view-${viewName}`);
  });
  elements.viewButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.viewTarget === viewName);
  });
}

function render() {
  renderInputs();
  renderSlate();
  renderRecords();
}

function renderInputs() {
  elements.projectInputs.forEach((input) => {
    input.value = state.project[input.dataset.project] ?? "";
  });
  elements.slateInputs.forEach((input) => {
    input.value = state.slate[input.dataset.slate] ?? "";
  });
}

function renderSlate() {
  elements.displayProduction.textContent = state.project.production || "未命名專案";
  elements.displayDate.textContent = formatDisplayDate(state.project.date);
  elements.displayScene.textContent = state.slate.scene || "-";
  elements.displayShot.textContent = state.slate.shot || "-";
  elements.displayTake.textContent = String(normalizeTake(state.slate.take));
  elements.displayRoll.textContent = state.slate.roll || "--";
  elements.displayFps.textContent = state.slate.fps || "--";
  elements.displayMode.textContent = `${state.slate.intExt || "--"} / ${state.slate.dayNight || "--"}`;
  elements.displaySound.textContent = state.slate.sound || "--";
  elements.displayDirector.textContent = state.project.director || "--";
  elements.displayCamera.textContent = state.slate.camera || "--";
  updateTimecode();
}

function renderRecords() {
  const filter = elements.filterInput.value;
  const records =
    filter === "全部" ? state.records : state.records.filter((record) => record.status === filter);

  elements.recordsBody.innerHTML = "";
  records.forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(record.createdAtLabel)}</td>
      <td>${escapeHtml(record.scene)}</td>
      <td>${escapeHtml(record.shot)}</td>
      <td>${escapeHtml(record.take)}</td>
      <td><span class="status-pill ${statusClass(record.status)}">${escapeHtml(record.status)}</span></td>
      <td>${escapeHtml(record.roll)}</td>
      <td>${escapeHtml(record.soundFile || record.sound)}</td>
      <td>${escapeHtml(record.note || "")}</td>
      <td><button class="danger delete-record" type="button" data-delete="${record.id}">刪除</button></td>
    `;
    elements.recordsBody.appendChild(row);
  });

  elements.recordsBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.delete));
  });

  elements.tableWrap.classList.toggle("has-records", records.length > 0);
  elements.totalCount.textContent = `${state.records.length} 次`;
  elements.circleCount.textContent = `${countByStatus("圈選")} 圈選`;
  elements.goodCount.textContent = `${countByStatus("可用")} 可用`;
}

function openEditor(editKey) {
  const definition = editDefinitions[editKey];
  if (!definition) return;

  activeEditDefinition = definition;
  elements.editTitle.textContent = `修改${definition.title}`;
  elements.editControls.innerHTML = "";

  definition.fields.forEach((field) => {
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const control = field.type === "select" ? document.createElement("select") : document.createElement("input");
    labelText.textContent = field.label;
    control.name = `${field.scope}.${field.key}`;
    control.dataset.scope = field.scope;
    control.dataset.key = field.key;

    if (field.type === "select") {
      field.options.forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        control.appendChild(option);
      });
    } else {
      control.type = field.type;
      if (field.min) control.min = String(field.min);
    }

    control.value = state[field.scope][field.key] ?? "";
    label.append(labelText, control);
    elements.editControls.appendChild(label);
  });

  elements.editModal.hidden = false;
  const firstControl = elements.editControls.querySelector("input, select");
  firstControl?.focus();
  if (firstControl?.select) firstControl.select();
}

function saveEditor(event) {
  event.preventDefault();
  if (!activeEditDefinition) return;

  elements.editControls.querySelectorAll("input, select").forEach((control) => {
    const scope = control.dataset.scope;
    const key = control.dataset.key;
    state[scope][key] = key === "take" ? normalizeTake(control.value) : control.value;
  });

  saveState();
  render();
  closeEditor();
}

function closeEditor() {
  elements.editModal.hidden = true;
  activeEditDefinition = null;
}

function recordTake() {
  const now = new Date();
  const record = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    createdAtLabel: formatDateTime(now),
    production: state.project.production,
    director: state.project.director,
    dop: state.project.dop,
    location: state.project.location,
    projectDate: state.project.date,
    scene: state.slate.scene,
    shot: state.slate.shot,
    take: String(normalizeTake(state.slate.take)),
    roll: state.slate.roll,
    fps: state.slate.fps,
    intExt: state.slate.intExt,
    dayNight: state.slate.dayNight,
    sound: state.slate.sound,
    camera: state.slate.camera,
    soundFile: state.slate.soundFile,
    status: elements.statusInput.value,
    note: elements.noteInput.value.trim(),
  };

  state.records.unshift(record);
  elements.noteInput.value = "";
  incrementTake(false);
  saveState();
  render();
}

function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  saveState();
  renderRecords();
}

function incrementTake(shouldRender = true) {
  state.slate.take = normalizeTake(state.slate.take) + 1;
  saveState();
  if (shouldRender) render();
}

function setTake(value) {
  state.slate.take = normalizeTake(value);
  saveState();
  render();
}

function nextScene() {
  state.slate.scene = nextToken(state.slate.scene);
  state.slate.shot = "1";
  state.slate.take = 1;
  saveState();
  render();
}

function nextShot() {
  state.slate.shot = nextToken(state.slate.shot);
  state.slate.take = 1;
  saveState();
  render();
}

function nextToken(value) {
  const token = String(value || "0").trim();
  if (/^\d+$/.test(token)) return String(Number(token) + 1);
  if (/^[A-Za-z]$/.test(token)) return String.fromCharCode(token.charCodeAt(0) + 1);
  const match = token.match(/^(.*?)(\d+)$/);
  if (!match) return `${token}1`;
  const [, prefix, number] = match;
  return `${prefix}${String(Number(number) + 1).padStart(number.length, "0")}`;
}

function normalizeTake(value) {
  const take = Number.parseInt(value, 10);
  return Number.isFinite(take) && take > 0 ? take : 1;
}

function clap() {
  window.clearTimeout(clapSoundTimer);
  window.clearTimeout(clapResetTimer);
  elements.slateBoard.classList.remove("is-clapping");
  void elements.slateBoard.offsetWidth;
  elements.slateBoard.classList.add("is-clapping");
  clapSoundTimer = window.setTimeout(playClapTone, CLAP_CONTACT_MS);
  clapResetTimer = window.setTimeout(() => {
    elements.slateBoard.classList.remove("is-clapping");
  }, CLAP_ANIMATION_MS);
}

function playClapTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  const context = new AudioContext();
  const duration = 0.14;
  const bufferSize = Math.floor(context.sampleRate * duration);
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const decay = 1 - i / bufferSize;
    output[i] = (Math.random() * 2 - 1) * decay * decay;
  }

  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const noiseFilter = context.createBiquadFilter();
  noise.buffer = noiseBuffer;
  noiseFilter.type = "highpass";
  noiseFilter.frequency.setValueAtTime(900, context.currentTime);
  noiseGain.gain.setValueAtTime(0.0001, context.currentTime);
  noiseGain.gain.exponentialRampToValueAtTime(0.85, context.currentTime + 0.006);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(context.destination);

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(180, context.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(72, context.currentTime + 0.08);
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.55, context.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.11);
  oscillator.connect(gain);
  gain.connect(context.destination);
  noise.start();
  oscillator.start();
  noise.stop(context.currentTime + duration);
  oscillator.stop(context.currentTime + 0.12);
}

function tickTimecode() {
  updateTimecode();
  requestAnimationFrame(tickTimecode);
}

function updateTimecode() {
  const nextTimecode = getTimecode(new Date(), Number.parseFloat(state.slate.fps));
  if (nextTimecode === lastRenderedTimecode) return;
  lastRenderedTimecode = nextTimecode;
  elements.displayTimecode.textContent = nextTimecode;
}

function getTimecode(date, fps) {
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 24;
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const frames = String(Math.floor((date.getMilliseconds() / 1000) * safeFps)).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}:${frames}`;
}

function countByStatus(status) {
  return state.records.filter((record) => record.status === status).length;
}

function statusClass(status) {
  if (status === "圈選") return "status-circle";
  if (status === "可用") return "status-good";
  if (status === "NG") return "status-ng";
  return "status-hold";
}

function exportCsv() {
  const columns = [
    ["時間", "createdAtLabel"],
    ["片名", "production"],
    ["場次", "scene"],
    ["鏡號", "shot"],
    ["次數", "take"],
    ["狀態", "status"],
    ["卷卡", "roll"],
    ["格率", "fps"],
    ["內外景", "intExt"],
    ["日夜", "dayNight"],
    ["收音", "sound"],
    ["攝影機", "camera"],
    ["聲音檔", "soundFile"],
    ["備註", "note"],
  ];
  const headers = columns.map(([label]) => csvCell(label)).join(",");
  const rows = state.records.map((record) =>
    columns.map(([, key]) => csvCell(record[key])).join(",")
  );
  downloadFile(`slate-log-${todayStamp()}.csv`, [headers, ...rows].join("\n"), "text/csv");
}

function exportJson() {
  downloadFile(
    `slate-log-${todayStamp()}.json`,
    JSON.stringify(state, null, 2),
    "application/json"
  );
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function resetAllData() {
  const confirmed = window.confirm("確定要清空專案資料與所有拍攝紀錄？此動作無法復原。");
  if (!confirmed) return;
  state = structuredClone(defaultState);
  saveState();
  render();
  setView("slate");
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatDisplayDate(value) {
  if (!value) return "--";
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${year}年${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日 ${weekdays[date.getDay()]}`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
