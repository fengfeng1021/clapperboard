const storageScope = new URLSearchParams(window.location.search).get("storage");
const STORAGE_KEY = `slate-board-app-state-v3${storageScope ? `-${storageScope}` : ""}`;
const CLAP_CLOSE_MS = 220;
const CLAP_RESET_MS = 260;
const CLAP_VOLUME_MULTIPLIER = 3;

const slateFieldDefinitions = [
  { key: "scene", title: "場次", label: "場次", type: "text", inputMode: "text", options: ["1", "2", "3"] },
  { key: "shot", title: "鏡號", label: "鏡號", type: "text", inputMode: "text", options: ["1", "2", "3"] },
  { key: "take", title: "次數", label: "次數", type: "number", min: 1, options: ["1", "2", "3"] },
  { key: "roll", title: "記憶卡", label: "記憶卡", type: "text", options: ["A001", "B001", "C001"] },
  {
    key: "fps",
    title: "影格率",
    label: "影格率",
    type: "text",
    defaultMode: "select",
    options: ["23.976", "24", "25", "29.97", "30", "50", "60"],
  },
  {
    key: "intExt",
    title: "內外景",
    label: "內外景",
    type: "text",
    defaultMode: "select",
    options: ["內景", "外景", "內外景"],
  },
  {
    key: "dayNight",
    title: "日夜",
    label: "日夜",
    type: "text",
    defaultMode: "select",
    options: ["日", "夜", "黎明", "黃昏"],
  },
  {
    key: "sound",
    title: "收音",
    label: "收音",
    type: "text",
    multiline: true,
    options: ["有聲同步", "無聲", "野聲", "播放", "環境音偏大", "收音雜訊"],
  },
  { key: "camera", title: "攝影機", label: "攝影機", type: "text", options: ["A 機", "B 機", "C 機"] },
  { key: "soundFile", title: "聲音檔", label: "聲音檔", type: "text", placeholder: "例：A001_T001.wav", options: ["A001_T001.wav"] },
];

const clapSoundOptions = [
  { id: "classic", label: "經典場記板" },
  { id: "sharp", label: "乾脆短啪" },
  { id: "deep", label: "低頻厚板" },
  { id: "wood", label: "木質輕敲" },
  { id: "metal", label: "金屬清脆" },
  { id: "film", label: "膠片啪聲" },
  { id: "digital", label: "電子短嗶" },
  { id: "soft", label: "柔和拍點" },
  { id: "bright", label: "高頻脆響" },
  { id: "thud", label: "悶聲重拍" },
];

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
  settings: {
    clapSound: "classic",
    fields: defaultFieldSettings(),
  },
};

const legacyMaps = {
  intExt: { INT: "內景", EXT: "外景", "INT/EXT": "內外景" },
  dayNight: { DAY: "日", NIGHT: "夜", DAWN: "黎明", DUSK: "黃昏" },
  sound: { SYNC: "有聲同步", MOS: "無聲", "WILD SOUND": "野聲", PLAYBACK: "播放" },
  status: { Circle: "圈選", Good: "可用", Hold: "保留", NG: "不採用" },
};

const projectEditDefinitions = {
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
};

let state = loadState();
let activeEditDefinition = null;
let lastRenderedTimecode = "";
let clapResetTimer = 0;
let clapAudioContext = null;
let clapNoiseBuffer = null;

const elements = {
  viewButtons: document.querySelectorAll("[data-view-target]"),
  views: document.querySelectorAll(".view"),
  projectInputs: document.querySelectorAll("[data-project]"),
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
  recordingScene: document.querySelector("#recordingScene"),
  recordingShot: document.querySelector("#recordingShot"),
  recordingTake: document.querySelector("#recordingTake"),
  recordingMeta: document.querySelector("#recordingMeta"),
  slateBoard: document.querySelector("#slateBoard"),
  clapButton: document.querySelector("#clapButton"),
  recordButton: document.querySelector("#recordButton"),
  logRecordButton: document.querySelector("#logRecordButton"),
  logNextTakeButton: document.querySelector("#logNextTakeButton"),
  nextTakeButton: document.querySelector("#nextTakeButton"),
  slateForm: document.querySelector("#slateForm"),
  newSceneButton: document.querySelector("#newSceneButton"),
  newShotButton: document.querySelector("#newShotButton"),
  resetTakeButton: document.querySelector("#resetTakeButton"),
  openDataButton: document.querySelector("#openDataButton"),
  openRecordsButton: document.querySelector("#openRecordsButton"),
  resetButton: document.querySelector("#resetButton"),
  statusInput: document.querySelector("#statusInput"),
  logSoundFileInput: document.querySelector("#logSoundFileInput"),
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
  clapSoundSelect: document.querySelector("#clapSoundSelect"),
  testClapSoundButton: document.querySelector("#testClapSoundButton"),
  fieldSettings: document.querySelector("#fieldSettings"),
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
      settings: mergeSettings(parsed.settings),
    });
  } catch {
    return structuredClone(defaultState);
  }
}

function migrateState(nextState) {
  nextState.slate.intExt = legacyMaps.intExt[nextState.slate.intExt] || nextState.slate.intExt;
  nextState.slate.dayNight = legacyMaps.dayNight[nextState.slate.dayNight] || nextState.slate.dayNight;
  nextState.slate.sound = legacyMaps.sound[nextState.slate.sound] || nextState.slate.sound;
  nextState.settings = mergeSettings(nextState.settings);
  nextState.records = nextState.records.map((record) => ({
    ...record,
    roll: record.roll ?? record.memoryCard ?? "",
    intExt: legacyMaps.intExt[record.intExt] || record.intExt,
    dayNight: legacyMaps.dayNight[record.dayNight] || record.dayNight,
    sound: legacyMaps.sound[record.sound] || record.sound,
    status: legacyMaps.status[record.status] || record.status,
  }));
  return nextState;
}

function defaultFieldSettings() {
  return Object.fromEntries(
    slateFieldDefinitions.map((field) => [
      field.key,
      {
        mode: field.defaultMode || "text",
        options: [...field.options],
      },
    ])
  );
}

function mergeSettings(savedSettings = {}) {
  savedSettings = savedSettings || {};
  const fieldSettings = defaultFieldSettings();
  Object.entries(savedSettings.fields || {}).forEach(([key, value]) => {
    if (!fieldSettings[key]) return;
    fieldSettings[key] = {
      mode: value.mode === "select" ? "select" : "text",
      options: normalizeOptions(value.options, fieldSettings[key].options),
    };
  });

  const clapSound = clapSoundOptions.some((option) => option.id === savedSettings.clapSound)
    ? savedSettings.clapSound
    : defaultState.settings.clapSound;

  return {
    clapSound,
    fields: fieldSettings,
  };
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

  elements.slateForm.addEventListener("input", handleSlateControlInput);
  elements.slateForm.addEventListener("change", handleSlateControlInput);
  elements.fieldSettings.addEventListener("input", handleFieldSettingsInput);
  elements.fieldSettings.addEventListener("change", handleFieldSettingsInput);

  elements.editableFields.forEach((button) => {
    button.addEventListener("click", () => openEditor(button.dataset.edit));
  });

  elements.clapButton.addEventListener("click", clap);
  elements.slateBoard.addEventListener("dblclick", clap);
  elements.recordButton.addEventListener("click", recordTake);
  elements.logRecordButton.addEventListener("click", recordTake);
  elements.logNextTakeButton.addEventListener("click", incrementTake);
  elements.nextTakeButton.addEventListener("click", incrementTake);
  elements.newSceneButton.addEventListener("click", nextScene);
  elements.newShotButton.addEventListener("click", nextShot);
  elements.resetTakeButton.addEventListener("click", () => setTake(1));
  elements.openDataButton.addEventListener("click", () => setView("data"));
  elements.openRecordsButton.addEventListener("click", () => setView("records"));
  elements.logSoundFileInput.addEventListener("input", () => {
    state.slate.soundFile = elements.logSoundFileInput.value;
    saveState();
    renderSlate();
  });
  elements.noteInput.addEventListener("input", () => resizeTextarea(elements.noteInput));
  elements.filterInput.addEventListener("change", renderRecords);
  elements.clapSoundSelect.addEventListener("change", () => {
    state.settings.clapSound = elements.clapSoundSelect.value;
    saveState();
  });
  elements.testClapSoundButton.addEventListener("click", async () => {
    playClapTone(await prepareClapTone(), 0);
  });
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
    preventPageZoom(event);
  });
  document.addEventListener("wheel", preventWheelZoom, { passive: false });
  document.addEventListener("gesturestart", preventGestureZoom);
  document.addEventListener("gesturechange", preventGestureZoom);
  document.addEventListener("gestureend", preventGestureZoom);
  window.addEventListener("resize", fitSlateText);
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
  elements.logSoundFileInput.value = state.slate.soundFile ?? "";
  renderSlateForm();
  renderSettings();
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
  elements.recordingScene.textContent = state.slate.scene || "-";
  elements.recordingShot.textContent = state.slate.shot || "-";
  elements.recordingTake.textContent = String(normalizeTake(state.slate.take));
  elements.recordingMeta.textContent = `${state.slate.roll || "--"} / ${state.slate.soundFile || state.slate.sound || "--"}`;
  updateTimecode();
  requestAnimationFrame(fitSlateText);
}

function renderSlateForm() {
  elements.slateForm.innerHTML = "";
  slateFieldDefinitions.forEach((field) => {
    const label = document.createElement("label");
    if (field.key === "sound") label.classList.add("wide");

    const labelText = document.createElement("span");
    labelText.textContent = field.label;

    const control = createSlateControl(field);
    label.append(labelText, control);
    elements.slateForm.appendChild(label);
    if (control.tagName === "TEXTAREA") resizeTextarea(control);
  });
}

function renderSettings() {
  elements.clapSoundSelect.innerHTML = "";
  clapSoundOptions.forEach((sound) => {
    const option = document.createElement("option");
    option.value = sound.id;
    option.textContent = sound.label;
    elements.clapSoundSelect.appendChild(option);
  });
  elements.clapSoundSelect.value = state.settings.clapSound;

  elements.fieldSettings.innerHTML = "";
  slateFieldDefinitions.forEach((field) => {
    const setting = getFieldSetting(field.key);
    const item = document.createElement("section");
    item.className = "field-setting";
    item.innerHTML = `
      <div class="field-setting-head">
        <h4>${escapeHtml(field.label)}</h4>
        <label>
          <span>輸入方式</span>
          <select data-field-mode="${field.key}">
            <option value="text">手動輸入</option>
            <option value="select">選項</option>
          </select>
        </label>
      </div>
      <label>
        <span>選項內容</span>
        <textarea data-field-options="${field.key}" rows="4" placeholder="每行一個選項">${escapeHtml(setting.options.join("\n"))}</textarea>
      </label>
    `;
    item.querySelector("[data-field-mode]").value = setting.mode;
    elements.fieldSettings.appendChild(item);
  });
}

function createSlateControl(field) {
  const setting = getFieldSetting(field.key);
  const currentValue = state.slate[field.key] ?? "";
  const useSelect = setting.mode === "select";

  if (useSelect) {
    const select = document.createElement("select");
    select.dataset.slate = field.key;
    const options = currentValue
      ? normalizeOptions([...setting.options, currentValue], setting.options)
      : setting.options;

    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      select.appendChild(option);
    });
    select.value = currentValue;
    return select;
  }

  const control = field.multiline ? document.createElement("textarea") : document.createElement("input");
  control.dataset.slate = field.key;
  control.value = currentValue;
  if (field.placeholder) control.placeholder = field.placeholder;

  if (control.tagName === "TEXTAREA") {
    control.rows = 3;
  } else {
    control.type = field.type;
    if (field.inputMode) control.inputMode = field.inputMode;
    if (field.min) control.min = String(field.min);
  }

  return control;
}

function handleSlateControlInput(event) {
  const control = event.target.closest("[data-slate]");
  if (!control) return;

  const key = control.dataset.slate;
  state.slate[key] = key === "take" ? normalizeTake(control.value) : control.value;
  saveState();
  renderSlate();
  if (key === "soundFile") elements.logSoundFileInput.value = state.slate.soundFile ?? "";
  if (control.tagName === "TEXTAREA") resizeTextarea(control);
}

function handleFieldSettingsInput(event) {
  const modeControl = event.target.closest("[data-field-mode]");
  const optionsControl = event.target.closest("[data-field-options]");

  if (modeControl) {
    const key = modeControl.dataset.fieldMode;
    getFieldSetting(key).mode = modeControl.value === "select" ? "select" : "text";
    saveState();
    renderSlateForm();
    renderSlate();
    return;
  }

  if (optionsControl) {
    const key = optionsControl.dataset.fieldOptions;
    const field = getFieldDefinition(key);
    getFieldSetting(key).options = normalizeOptions(optionsControl.value.split(/\r?\n/), field?.options || []);
    saveState();
    renderSlateForm();
    if (optionsControl.tagName === "TEXTAREA") resizeTextarea(optionsControl);
  }
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
      <td class="note-cell">
        <textarea class="record-note" data-note="${record.id}" rows="3" aria-label="編輯 ${escapeHtml(record.scene)} 場 ${escapeHtml(record.shot)} 鏡第 ${escapeHtml(record.take)} 次場記備註">${escapeHtml(record.note || "")}</textarea>
      </td>
      <td><button class="danger delete-record" type="button" data-delete="${record.id}">刪除</button></td>
    `;
    elements.recordsBody.appendChild(row);
  });

  elements.recordsBody.querySelectorAll("[data-note]").forEach((textarea) => {
    textarea.addEventListener("input", () => {
      updateRecordNote(textarea.dataset.note, textarea.value);
      resizeTextarea(textarea);
    });
    resizeTextarea(textarea);
  });

  elements.recordsBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteRecord(button.dataset.delete));
  });

  elements.tableWrap.classList.toggle("has-records", records.length > 0);
  elements.totalCount.textContent = `${state.records.length} 次`;
  elements.circleCount.textContent = `${countByStatus("圈選")} 圈選`;
  elements.goodCount.textContent = `${countByStatus("可用")} 可用`;
}

function getEditDefinition(editKey) {
  if (projectEditDefinitions[editKey]) return projectEditDefinitions[editKey];
  if (editKey === "mode") {
    return {
      title: "景別",
      fields: [getSlateEditorField("intExt"), getSlateEditorField("dayNight")],
    };
  }

  const field = getSlateEditorField(editKey);
  if (!field) return null;
  return {
    title: field.title,
    fields: [field],
  };
}

function getSlateEditorField(key) {
  const field = getFieldDefinition(key);
  if (!field) return null;
  return {
    ...field,
    scope: "slate",
    options: getFieldSetting(key).options,
    mode: getFieldSetting(key).mode,
  };
}

function createEditorControl(field) {
  if (field.scope === "slate" && field.mode === "select") {
    const select = document.createElement("select");
    const value = state.slate[field.key] ?? "";
    const options = value ? normalizeOptions([...field.options, value], field.options) : field.options;
    options.forEach((optionValue) => {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionValue;
      select.appendChild(option);
    });
    return select;
  }

  const control = field.multiline ? document.createElement("textarea") : document.createElement("input");
  if (control.tagName === "TEXTAREA") {
    control.rows = 4;
  } else {
    control.type = field.type || "text";
    if (field.min) control.min = String(field.min);
  }
  return control;
}

function openEditor(editKey) {
  const definition = getEditDefinition(editKey);
  if (!definition) return;

  activeEditDefinition = definition;
  elements.editTitle.textContent = `修改${definition.title}`;
  elements.editControls.innerHTML = "";

  definition.fields.forEach((field) => {
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const control = createEditorControl(field);
    labelText.textContent = field.label;
    control.name = `${field.scope}.${field.key}`;
    control.dataset.scope = field.scope;
    control.dataset.key = field.key;

    control.value = state[field.scope][field.key] ?? "";
    label.append(labelText, control);
    elements.editControls.appendChild(label);
    if (control.tagName === "TEXTAREA") resizeTextarea(control);
  });

  elements.editModal.hidden = false;
  const firstControl = elements.editControls.querySelector("input, select, textarea");
  firstControl?.focus();
  if (firstControl?.select) firstControl.select();
}

function saveEditor(event) {
  event.preventDefault();
  if (!activeEditDefinition) return;

  elements.editControls.querySelectorAll("input, select, textarea").forEach((control) => {
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
    soundFile: elements.logSoundFileInput.value.trim() || state.slate.soundFile,
    status: elements.statusInput.value,
    note: elements.noteInput.value.trim(),
  };

  state.records.unshift(record);
  elements.noteInput.value = "";
  resizeTextarea(elements.noteInput);
  incrementTake(false);
  saveState();
  render();
}

function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
  saveState();
  renderRecords();
}

function updateRecordNote(id, note) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  record.note = note;
  saveState();
}

function resizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
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

function getFieldDefinition(key) {
  return slateFieldDefinitions.find((field) => field.key === key);
}

function getFieldSetting(key) {
  if (!state.settings.fields[key]) {
    const field = getFieldDefinition(key);
    state.settings.fields[key] = {
      mode: field?.defaultMode || "text",
      options: [...(field?.options || [])],
    };
  }
  return state.settings.fields[key];
}

function normalizeOptions(options, fallback = []) {
  const normalized = options
    .map((option) => String(option ?? "").trim())
    .filter(Boolean);
  const unique = [...new Set(normalized)];
  return unique.length ? unique : [...fallback];
}

function fitSlateText() {
  elements.slateBoard.querySelectorAll(".slate-field strong").forEach((text) => {
    text.style.fontSize = "";
    const field = text.closest(".slate-field");
    if (!field || !text.textContent.trim()) return;

    const styles = getComputedStyle(text);
    let size = Number.parseFloat(styles.fontSize);
    const minSize = text.id === "displayTimecode" ? 18 : 16;
    const maxHeight = Math.max(28, field.clientHeight - 34);

    while (
      size > minSize &&
      (text.scrollWidth > text.clientWidth || text.scrollHeight > maxHeight)
    ) {
      size -= 1;
      text.style.fontSize = `${size}px`;
    }
  });
}

function preventPageZoom(event) {
  if (!event.ctrlKey && !event.metaKey) return;
  if (!["+", "-", "=", "0"].includes(event.key)) return;
  event.preventDefault();
}

function preventWheelZoom(event) {
  if (!event.ctrlKey && !event.metaKey) return;
  event.preventDefault();
}

function preventGestureZoom(event) {
  event.preventDefault();
}

async function clap() {
  window.clearTimeout(clapResetTimer);
  const clapSound = await prepareClapTone();
  elements.slateBoard.classList.remove("is-clapping");
  void elements.slateBoard.offsetWidth;
  elements.slateBoard.classList.add("is-clapping");
  playClapTone(clapSound, CLAP_CLOSE_MS / 1000);
  clapResetTimer = window.setTimeout(() => {
    elements.slateBoard.classList.remove("is-clapping");
  }, CLAP_RESET_MS);
}

async function prepareClapTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  if (!clapAudioContext) {
    clapAudioContext = new AudioContext();
  }

  const context = clapAudioContext;
  if (context.state === "suspended") {
    await context.resume();
  }

  return { context };
}

function playClapTone(clapSound, delaySeconds = 0) {
  if (!clapSound) return;

  const profile = clapSoundProfile(state.settings.clapSound);
  const { context } = clapSound;
  const startTime = context.currentTime + delaySeconds;
  const noiseBuffer = getNoiseBuffer(context, profile.duration);
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const noiseFilter = context.createBiquadFilter();
  noise.buffer = noiseBuffer;
  noiseFilter.type = profile.filterType;
  noiseFilter.frequency.setValueAtTime(profile.filterFrequency, startTime);
  noiseGain.gain.setValueAtTime(0.0001, startTime);
  noiseGain.gain.exponentialRampToValueAtTime(profile.noiseGain, startTime + profile.attack);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + profile.duration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(CLAP_VOLUME_MULTIPLIER, startTime);
  noiseGain.connect(masterGain);

  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = profile.wave;
  oscillator.frequency.setValueAtTime(profile.startFrequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(profile.endFrequency, startTime + profile.toneDuration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(profile.toneGain, startTime + profile.attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + profile.toneDuration);
  oscillator.connect(gain);
  gain.connect(masterGain);
  masterGain.connect(context.destination);
  noise.start(startTime);
  oscillator.start(startTime);
  noise.stop(startTime + profile.duration);
  oscillator.stop(startTime + profile.toneDuration);
}

function getNoiseBuffer(context, duration) {
  const bufferSize = Math.floor(context.sampleRate * duration);
  if (clapNoiseBuffer && clapNoiseBuffer.length === bufferSize && clapNoiseBuffer.sampleRate === context.sampleRate) {
    return clapNoiseBuffer;
  }

  clapNoiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const output = clapNoiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    const decay = 1 - i / bufferSize;
    output[i] = (Math.random() * 2 - 1) * decay * decay;
  }
  return clapNoiseBuffer;
}

function clapSoundProfile(soundId) {
  const profiles = {
    classic: ["highpass", 900, 0.14, 0.85, "triangle", 180, 72, 0.55, 0.11],
    sharp: ["highpass", 1800, 0.08, 0.95, "square", 420, 160, 0.32, 0.06],
    deep: ["lowpass", 620, 0.18, 0.8, "sine", 120, 54, 0.72, 0.16],
    wood: ["bandpass", 760, 0.12, 0.55, "triangle", 260, 120, 0.38, 0.09],
    metal: ["highpass", 2400, 0.1, 0.7, "sawtooth", 880, 420, 0.22, 0.08],
    film: ["bandpass", 1200, 0.16, 0.65, "triangle", 320, 90, 0.35, 0.14],
    digital: ["highpass", 3200, 0.07, 0.2, "square", 1200, 900, 0.24, 0.06],
    soft: ["lowpass", 900, 0.13, 0.42, "sine", 220, 120, 0.25, 0.11],
    bright: ["highpass", 4200, 0.075, 0.82, "triangle", 980, 360, 0.2, 0.065],
    thud: ["lowpass", 460, 0.2, 0.9, "sine", 82, 46, 0.84, 0.18],
  };
  const [filterType, filterFrequency, duration, noiseGain, wave, startFrequency, endFrequency, toneGain, toneDuration] =
    profiles[soundId] || profiles.classic;
  return {
    filterType,
    filterFrequency,
    duration,
    noiseGain,
    wave,
    startFrequency,
    endFrequency,
    toneGain,
    toneDuration,
    attack: 0.006,
  };
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
  if (status === "不採用") return "status-ng";
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
    ["記憶卡", "roll"],
    ["影格率", "fps"],
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
