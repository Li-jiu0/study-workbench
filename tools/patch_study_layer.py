# -*- coding: utf-8 -*-
"""app.js 追加「学途 · 学习中枢」数据层（v1.15）"""
import io

path = r'D:\下载的文件\学习工作台\assets\app.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

data_layer = """

/* ================= 学途 · 学习中枢数据层（v1.15） =================
 * 学习记录 / 学习会话计时 / 连续天数 / 错因 / 自定义学科 / 学习目标
 * 全部走 localStorage，file:// 全页共享；App 与网页版一致。
 */
const STUDY_RECORDS_KEY = 'study_workbench_records';
const STUDY_SESSION_KEY = 'study_workbench_session';
const WRONG_REASON_KEY = 'study_workbench_wrong_reasons';
const SUBJECTS_KEY = 'study_workbench_subjects';
const GOALS_KEY = 'study_workbench_goals';

/* ---------- 学习记录：{ 'YYYY-MM-DD': { minutes, done: [] } } ---------- */
function loadStudyRecords() {
  try { return JSON.parse(localStorage.getItem(STUDY_RECORDS_KEY)) || {}; } catch (e) { return {}; }
}
function saveStudyRecords(r) {
  try { localStorage.setItem(STUDY_RECORDS_KEY, JSON.stringify(r)); } catch (e) { }
}
function getStudyRecord(dateStr) {
  const r = loadStudyRecords();
  return r[dateStr] || { minutes: 0, done: [] };
}
function addStudyMinutes(type, mins) {
  if (!mins || mins <= 0) return;
  const r = loadStudyRecords();
  const today = getTodayStr();
  if (!r[today]) r[today] = { minutes: 0, done: [] };
  r[today].minutes += Math.round(mins);
  if (type && r[today].done.indexOf(type) < 0) r[today].done.push(type);
  saveStudyRecords(r);
}
function markTaskDone(type) {
  const r = loadStudyRecords();
  const today = getTodayStr();
  if (!r[today]) r[today] = { minutes: 0, done: [] };
  if (r[today].done.indexOf(type) < 0) r[today].done.push(type);
  saveStudyRecords(r);
}

/* ---------- 学习会话：进入模块开始计时，回到学途自动结算 ---------- */
function startStudySession(type) {
  try {
    localStorage.setItem(STUDY_SESSION_KEY, JSON.stringify({ start: Date.now(), type: type || 'study' }));
  } catch (e) { }
}
function endStudySession() {
  try {
    const raw = localStorage.getItem(STUDY_SESSION_KEY);
    if (!raw) return null;
    localStorage.removeItem(STUDY_SESSION_KEY);
    const s = JSON.parse(raw);
    const mins = (Date.now() - s.start) / 60000;
    if (mins >= 1) addStudyMinutes(s.type, Math.min(mins, 600));
    return s;
  } catch (e) { return null; }
}
/** 学途入口：结算上次会话 → 记录本次开始 → 跳转学习模块 */
function goStudy(type, url) {
  endStudySession();
  startStudySession(type);
  if (url) location.href = url;
}

/* ---------- 统计 ---------- */
function calcStreakDays() {
  const r = loadStudyRecords();
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 365; i++) {
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (r[ds] && (r[ds].minutes > 0 || (r[ds].done && r[ds].done.length))) streak++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
function calcWeekMinutes() {
  const r = loadStudyRecords();
  const out = [0, 0, 0, 0, 0, 0, 0]; // 周一~周日
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  for (let i = 0; i <= day; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - (day - i));
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    out[i] = (r[ds] && r[ds].minutes) || 0;
  }
  return out;
}
function calcMonthMinutes() {
  const r = loadStudyRecords();
  const now = new Date();
  const prefix = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let total = 0;
  Object.keys(r).forEach(k => { if (k.indexOf(prefix) === 0) total += r[k].minutes || 0; });
  return total;
}
function calcTodayMinutes() {
  return getStudyRecord(getTodayStr()).minutes || 0;
}
function getLastStudySession() {
  const r = loadStudyRecords();
  const keys = Object.keys(r).sort().reverse();
  for (const k of keys) {
    if (r[k].minutes > 0 || (r[k].done && r[k].done.length)) {
      return { date: k, minutes: r[k].minutes, done: r[k].done || [] };
    }
  }
  return null;
}

/* ---------- 错因（学途错题本）：{ questionId: reason } ---------- */
const WRONG_REASONS = ['知识点不会', '粗心', '看错题', '计算错误', '时间不够', '方法不会'];
function loadWrongReasons() {
  try { return JSON.parse(localStorage.getItem(WRONG_REASON_KEY)) || {}; } catch (e) { return {}; }
}
function saveWrongReasons(w) {
  try { localStorage.setItem(WRONG_REASON_KEY, JSON.stringify(w)); } catch (e) { }
}
function chooseWrongReason(qid, reason) {
  const w = loadWrongReasons();
  w[qid] = reason;
  saveWrongReasons(w);
}
function getWrongReasonStats(limit) {
  const w = loadWrongReasons();
  const ids = Object.keys(w).slice(-(limit || 30));
  const cnt = {};
  ids.forEach(id => { const rs = w[id]; if (rs) cnt[rs] = (cnt[rs] || 0) + 1; });
  return { total: ids.length, counts: cnt };
}
/** 完整错题详情（题目 + 正确答案 + 解析 + 已选错因） */
function getWrongDetails(limit) {
  const ids = (appData.wrongQuestions || []).slice(-(limit || 20));
  const reasons = loadWrongReasons();
  const map = {};
  (typeof EXAM_BANK !== 'undefined' ? EXAM_BANK : []).forEach(q => { map[q.id] = q; });
  return ids.map(id => {
    const q = map[id];
    if (!q) return null;
    return {
      id: id,
      q: q.q,
      type: q.type || '',
      sub: q.sub || '',
      options: q.options || [],
      answer: q.answer,
      exp: q.exp || '',
      reason: reasons[id] || ''
    };
  }).filter(Boolean);
}

/* ---------- 自定义学科 ---------- */
function loadSubjects() {
  try { return JSON.parse(localStorage.getItem(SUBJECTS_KEY)) || []; } catch (e) { return []; }
}
function saveSubjects(s) {
  try { localStorage.setItem(SUBJECTS_KEY, JSON.stringify(s)); } catch (e) { }
}
function addSubject(name, url) {
  const s = loadSubjects();
  s.push({ name: name, url: url || '', createdAt: Date.now() });
  saveSubjects(s);
}
function removeSubject(idx) {
  const s = loadSubjects();
  if (idx >= 0 && idx < s.length) { s.splice(idx, 1); saveSubjects(s); }
}

/* ---------- 学习目标 ---------- */
function loadGoals() {
  try { return JSON.parse(localStorage.getItem(GOALS_KEY)) || []; } catch (e) { return []; }
}
function saveGoals(g) {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(g)); } catch (e) { }
}
function addGoal(name, progress) {
  const g = loadGoals();
  g.push({ name: name, progress: Number(progress) || 0, createdAt: Date.now() });
  saveGoals(g);
}
function removeGoal(idx) {
  const g = loadGoals();
  if (idx >= 0 && idx < g.length) { g.splice(idx, 1); saveGoals(g); }
}
function updateGoalProgress(idx, progress) {
  const g = loadGoals();
  if (idx >= 0 && idx < g.length) { g[idx].progress = Number(progress) || 0; saveGoals(g); }
}
"""
src += data_layer
with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print('OK: app.js data layer appended, size =', len(src))
