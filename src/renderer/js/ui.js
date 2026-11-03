/**
 * 界面层：对话气泡与好感度。
 * 气泡用 DOM 承载（比贴图清晰），好感度存 localStorage。
 */

const AFFECTION_KEY = 'umapet.affection';
const AFFECTION_LEVELS = [
  { min: 0, name: '陌生' },
  { min: 25, name: '熟悉' },
  { min: 55, name: '亲近' },
  { min: 80, name: '信赖' }
];
const AFFECTION_MAX = 100;

const LINES = {
  greeting: ['训练员，今天也一起加油吧！', '我在这里哦～', '欢迎回来，训练员。'],
  pat: [
    '嘿嘿…耳朵有点痒。',
    '再摸一下也可以哦。',
    '唔…好舒服。',
    '训练员的手好暖。',
    '耳朵不能一直摸啦！'
  ],
  patShy: ['别、别摸那么久啦…', '真是的…就一下下哦。'],
  drag: ['哇——要掉下去了！', '轻一点、轻一点！', '要带我去哪里呀？'],
  idle: ['今天天气不错呢。', '要不要一起跑一会儿？', '有点想吃胡萝卜…', '训练员，加油哦！'],
  sit: ['坐太久啦，站起来活动一下吧。', '肩膀会不会酸？拉伸一下～'],
  sleep: ['呼…好困…先睡一会儿。']
};

const bubbleEl = document.getElementById('bubble');
const affEl = document.getElementById('affection');
const affLevelEl = document.getElementById('affLevel');
const affFillEl = document.getElementById('affFill');

let bubbleTimer = null;
let affection = 0;

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

export function showBubble(text, duration = 2600) {
  if (!bubbleEl || !text) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.add('show');
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    bubbleEl.classList.remove('show');
    bubbleTimer = null;
  }, duration);
}

/** 既支持传 LINES 的组名，也支持直接传候选文本数组。 */
export function randomLine(group) {
  const list = Array.isArray(group) ? group : LINES[group];
  if (!list || !list.length) return '';
  return pick(list);
}

export function say(group, duration = 2600) {
  const text = randomLine(group);
  if (text) showBubble(text, duration);
  return text;
}

function levelOf(value) {
  let current = AFFECTION_LEVELS[0];
  for (const lv of AFFECTION_LEVELS) {
    if (value >= lv.min) current = lv;
  }
  return current;
}

export function loadAffection() {
  try {
    const raw = window.localStorage.getItem(AFFECTION_KEY);
    const n = Number(raw);
    affection = Number.isFinite(n) ? Math.min(AFFECTION_MAX, Math.max(0, n)) : 0;
  } catch (err) {
    affection = 0;
  }
  if (affLevelEl) affLevelEl.textContent = levelOf(affection).name;
  if (affFillEl) affFillEl.style.width = `${affection}%`;
  return affection;
}

function persist() {
  try {
    window.localStorage.setItem(AFFECTION_KEY, String(affection));
  } catch (err) {
    // 忽略存储失败
  }
}

let affVisTimer = null;

export function updateAffection(delta) {
  affection = Math.min(AFFECTION_MAX, Math.max(0, affection + delta));
  persist();
  const lv = levelOf(affection);
  if (affLevelEl) affLevelEl.textContent = lv.name;
  if (affFillEl) affFillEl.style.width = `${affection}%`;
  if (affEl) {
    affEl.classList.add('show');
    if (affVisTimer) clearTimeout(affVisTimer);
    affVisTimer = setTimeout(() => affEl.classList.remove('show'), 1800);
  }
  return affection;
}

export function getAffection() {
  return affection;
}

export function affectionLevelName() {
  return levelOf(affection).name;
}
