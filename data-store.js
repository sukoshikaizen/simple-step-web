(function () {
  "use strict";

  const STORAGE_KEY = "simple-step-v2-db";
  const SCHEMA_VERSION = 6;
  const PRIORITIES = ["none", "low", "medium", "high", "urgent"];

  const now = () => new Date().toISOString();
  const id = () => crypto.randomUUID();
  const dateKey = (value = new Date()) => {
    const date = new Date(value);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  };

  function businessDateKey(settings = {}, value = new Date()) {
    const date = new Date(value);
    const [hour, minute] = String(settings.dayRolloverTime || "00:00").split(":").map(Number);
    const boundaryMinutes = (Number.isInteger(hour) ? hour : 0) * 60 + (Number.isInteger(minute) ? minute : 0);
    if (date.getHours() * 60 + date.getMinutes() < boundaryMinutes) date.setDate(date.getDate() - 1);
    return dateKey(date);
  }

  function weekKey(value, weekStartsOn = 1) {
    const date = new Date(String(value).slice(0, 10) + "T12:00:00");
    const start = Number.isInteger(Number(weekStartsOn)) ? Number(weekStartsOn) : 1;
    date.setDate(date.getDate() - (date.getDay() - start + 7) % 7);
    return dateKey(date);
  }

  const monthKey = value => String(value).slice(0, 7);

  function createEmptyDatabase() {
    return {
      schemaVersion: SCHEMA_VERSION,
      categories: [],
      projects: [],
      themes: [],
      tasks: [],
      journals: [],
      recurringRules: [],
      routines: [],
      patrolPlaces: [],
      patrolChecks: [],
      aiChanges: [],
      importHistory: [],
      settings: { timeZone: "Asia/Tokyo", weekStartsOn: 1, dayRolloverTime: "00:00" }
    };
  }

  function normalizeTask(task) {
    const createdAt = task.createdAt || now();
    return {
      id: task.id || id(),
      type: "task",
      title: String(task.title || "").trim(),
      description: String(task.description || ""),
      categoryId: task.categoryId || "",
      projectId: task.projectId || "",
      status: task.status === "done" ? "done" : "open",
      approvalStatus: task.approvalStatus || "approved",
      todayDate: task.todayDate || null,
      weekStatusKey: task.weekStatusKey || null,
      monthStatusKey: task.monthStatusKey || null,
      startDate: task.startDate || null,
      dueDate: task.dueDate || null,
      priority: PRIORITIES.includes(task.priority) ? task.priority : "none",
      estimateMinutes: Number.isInteger(task.estimateMinutes) && task.estimateMinutes > 0
        ? task.estimateMinutes
        : null,
      recurrenceRuleId: task.recurrenceRuleId || null,
      occurrenceDate: task.occurrenceDate || null,
      createdAt,
      createdDate: task.createdDate || dateKey(createdAt),
      updatedAt: task.updatedAt || createdAt,
      completedAt: task.completedAt || null,
      deletedAt: task.deletedAt || null,
      source: task.source || "manual",
      requestId: task.requestId || "",
      updatedBy: task.updatedBy || (task.source === "ai" ? "ai" : "user"),
      version: Number.isInteger(task.version) && task.version > 0 ? task.version : 1
    };
  }

  function normalizeRecurringRule(rule) {
    return {
      id: rule.id || id(),
      type: "recurring_rule",
      title: String(rule.title || "").trim(),
      description: String(rule.description || ""),
      categoryId: rule.categoryId || "",
      projectId: rule.projectId || "",
      priority: PRIORITIES.includes(rule.priority) ? rule.priority : "none",
      estimateMinutes: Number.isInteger(rule.estimateMinutes) && rule.estimateMinutes > 0
        ? rule.estimateMinutes
        : null,
      frequency: ["daily", "weekly", "monthly", "interval"].includes(rule.frequency)
        ? rule.frequency
        : "daily",
      interval: Number.isInteger(rule.interval) && rule.interval > 0 ? rule.interval : 1,
      daysOfWeek: Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek.map(Number) : [],
      dayOfMonth: Number.isInteger(rule.dayOfMonth) ? rule.dayOfMonth : null,
      startDate: rule.startDate || dateKey(),
      endDate: rule.endDate || null,
      active: rule.active !== false,
      approvalStatus: rule.approvalStatus || "approved",
      createdAt: rule.createdAt || now(),
      updatedAt: rule.updatedAt || rule.createdAt || now(),
      deletedAt: rule.deletedAt || null,
      source: rule.source || "manual",
      updatedBy: rule.updatedBy || "user",
      version: Number.isInteger(rule.version) && rule.version > 0 ? rule.version : 1
    };
  }

  function normalizeRoutine(routine, index = 0) {
    const createdAt = routine.createdAt || now();
    return {
      id: routine.id || id(), type: "routine", itemType: routine.itemType === "category" ? "category" : "routine",
      categoryId: routine.categoryId || "", title: String(routine.title || "").trim(),
      description: String(routine.description || ""), idealOrder: Number.isInteger(routine.idealOrder) ? routine.idealOrder : index + 1,
      active: routine.active !== false, dailyDate: routine.dailyDate || null,
      dailyState: ["selected", "completed", "skipped"].includes(routine.dailyState) ? routine.dailyState : "undecided",
      dailyOrder: Number.isInteger(routine.dailyOrder) && routine.dailyOrder > 0 ? routine.dailyOrder : null,
      createdAt, updatedAt: routine.updatedAt || createdAt, deletedAt: routine.deletedAt || null
    };
  }

  function migrate(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const db = { ...createEmptyDatabase(), ...source, schemaVersion: SCHEMA_VERSION };
    for (const key of [
      "categories", "projects", "themes", "tasks", "journals",
      "recurringRules", "routines", "patrolPlaces", "patrolChecks", "aiChanges", "importHistory"
    ]) {
      db[key] = Array.isArray(db[key]) ? db[key] : [];
    }
    db.tasks = db.tasks.map(normalizeTask);
    db.projects = db.projects.map(project => ({ ...project, categoryId: project.categoryId || "" }));
    for (const project of db.projects) {
      if (project.categoryId) continue;
      const categoryIds = [...new Set(db.tasks.filter(task => task.projectId === project.id && task.categoryId).map(task => task.categoryId))];
      if (categoryIds.length === 1) project.categoryId = categoryIds[0];
    }
    db.recurringRules = db.recurringRules.map(normalizeRecurringRule);
    db.routines = db.routines.map(normalizeRoutine);
    db.patrolPlaces = db.patrolPlaces.map((place, index) => { const createdAt = place.createdAt || now(); return { id: place.id || id(), type: "patrol_place", name: String(place.name || "").trim(), order: Number.isInteger(place.order) ? place.order : index + 1, active: place.active !== false, createdAt, updatedAt: place.updatedAt || createdAt, deletedAt: place.deletedAt || null }; }).filter(place => place.name);
    db.patrolChecks = db.patrolChecks.map(check => { const createdAt = check.createdAt || check.checkedAt || now(); return { id: check.id || id(), type: "patrol_check", patrolPlaceId: check.patrolPlaceId || "", businessDate: check.businessDate || dateKey(createdAt), checked: check.checked !== false, checkedAt: check.checked === false ? null : (check.checkedAt || createdAt), uncheckedAt: check.uncheckedAt || null, createdAt, updatedAt: check.updatedAt || createdAt }; }).filter(check => check.patrolPlaceId);
    db.aiChanges = db.aiChanges.map(change => ({
      ...change,
      fromValue: change.fromValue ?? change.fromId ?? null,
      toValue: change.toValue ?? change.toId ?? null
    }));
    db.themes = db.themes.map(theme => ({ ...theme, active: theme.active !== false }));
    db.settings = { timeZone: "Asia/Tokyo", weekStartsOn: 1, dayRolloverTime: "00:00", ...(db.settings || {}) };
    db.settings.weekStartsOn = Math.min(6, Math.max(0, Number(db.settings.weekStartsOn) || 0));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(db.settings.dayRolloverTime)) db.settings.dayRolloverTime = "00:00";
    return db;
  }

  function createTask(input = {}) {
    return normalizeTask({
      ...input,
      id: input.id || id(),
      createdAt: input.createdAt || now(),
      updatedAt: input.updatedAt || now(),
      version: input.version || 1
    });
  }

  function updateTask(task, changes, actor = "user") {
    Object.assign(task, changes, {
      updatedAt: now(),
      updatedBy: actor,
      version: (task.version || 1) + 1
    });
    return task;
  }

  function dayDifference(from, to) {
    return Math.round((new Date(to + "T12:00:00") - new Date(from + "T12:00:00")) / 86400000);
  }

  function isRuleDue(rule, targetDate) {
    if (!rule.active || rule.deletedAt || rule.approvalStatus === "pending") return false;
    if (targetDate < rule.startDate || (rule.endDate && targetDate > rule.endDate)) return false;
    const date = new Date(targetDate + "T12:00:00");
    const elapsed = dayDifference(rule.startDate, targetDate);
    if (rule.frequency === "daily") return true;
    if (rule.frequency === "interval") return elapsed % rule.interval === 0;
    if (rule.frequency === "weekly") {
      const week = Math.floor(elapsed / 7);
      return week % rule.interval === 0 && rule.daysOfWeek.includes(date.getDay());
    }
    if (rule.frequency === "monthly") {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      return date.getDate() === Math.min(rule.dayOfMonth || 1, lastDay);
    }
    return false;
  }

  function generateDueTasks(db, targetDate = dateKey()) {
    const generated = [];
    for (const rule of db.recurringRules) {
      if (!isRuleDue(rule, targetDate)) continue;
      const exists = db.tasks.some(task =>
        task.recurrenceRuleId === rule.id && task.occurrenceDate === targetDate
      );
      if (exists) continue;
      const task = createTask({
        title: rule.title,
        description: rule.description,
        categoryId: rule.categoryId,
        projectId: rule.projectId,
        priority: rule.priority,
        estimateMinutes: rule.estimateMinutes,
        recurrenceRuleId: rule.id,
        occurrenceDate: targetDate,
        todayDate: targetDate,
        startDate: targetDate,
        source: "system",
        updatedBy: "system"
      });
      db.tasks.push(task);
      generated.push(task);
    }
    return generated;
  }

  const repository = {
    async load() {
      const raw = localStorage.getItem(STORAGE_KEY);
      return migrate(raw ? JSON.parse(raw) : null);
    },
    async save(db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
  };

  window.SimpleStepData = {
    STORAGE_KEY,
    SCHEMA_VERSION,
    PRIORITIES,
    repository,
    createEmptyDatabase,
    createTask,
    updateTask,
    normalizeRecurringRule,
    normalizeRoutine,
    migrate,
    generateDueTasks,
    dateKey,
    businessDateKey,
    weekKey,
    monthKey,
    now,
    id
  };
}());
