// Демо-данные и правила, по которым система сама находит проблемные сделки.
// «Сегодня» в прототипе — среда, 23 сентября 2026.

export const TODAY = new Date(2026, 8, 23)
export const d = (day: number, month = 8) => new Date(2026, month, day)

export const STAGES = [
  "Новый лид",
  "Квалификация",
  "Потребность подтверждена",
  "Предложение",
  "Переговоры",
  "Согласование",
] as const
export type Stage = (typeof STAGES)[number]

export type Health = "ok" | "attention" | "risk" | "stalled"

export type ActionType = "call" | "meeting" | "email" | "task"

export type NextAction = {
  title: string
  type: ActionType
  date: Date
  time?: string
  contact?: string
}

export type Deal = {
  id: string
  title: string
  company: string
  amount: number
  stage: Stage
  closeDate: Date
  contact: string
  contactRole: string
  owner: string
  daysInStage: number
  lastContact: Date // последний ответ / контакт с клиентом
  lastActivityNote: string
  nextAction: NextAction | null
}

export type SignalKind = "overdue" | "noResponse" | "stalled" | "noNext" | "dateConflict"

export type Signal = {
  kind: SignalKind
  title: string
  description: string
}

const dayDiff = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86_400_000)
const fmt = (date: Date) =>
  date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })

/** Правила сигналов. Порядок = приоритет. */
/**
 * Правила сигналов. Порядок = операционный приоритет:
 * 1. просроченная задача → 2. пропущенный follow-up → 3. шаг позже даты закрытия → 4. нет следующего шага.
 */
export const SIGNAL_RANK: Record<SignalKind, number> = { overdue: 0, noResponse: 1, dateConflict: 2, stalled: 3, noNext: 4 }

export function getSignals(deal: Deal): Signal[] {
  const s: Signal[] = []
  const silence = dayDiff(TODAY, deal.lastContact)
  const na = deal.nextAction

  if (na && dayDiff(na.date, TODAY) < 0) {
    const late = dayDiff(TODAY, na.date)
    s.push({
      kind: "overdue",
      title: "Задача просрочена",
      description: `${na.title} · срок: ${late === 1 ? "вчера" : fmt(na.date)}`,
    })
  }
  if (!na && silence >= 10) {
    s.push({
      kind: "noResponse",
      title: `Не отвечают ${silence} ${plural(silence, "день", "дня", "дней")}`,
      description: `Последний контакт: ${fmt(deal.lastContact)} — ${deal.lastActivityNote.toLowerCase()}`,
    })
  }
  if (na && dayDiff(na.date, deal.closeDate) > 0) {
    s.push({
      kind: "dateConflict",
      title: "Шаг позже даты закрытия",
      description: `Закрытие: ${fmt(deal.closeDate)} · следующий шаг: ${fmt(na.date)}`,
    })
  }
  if (!na && deal.daysInStage > 21) {
    s.push({
      kind: "stalled",
      title: "Сделка зависла",
      description: `${deal.daysInStage} ${plural(deal.daysInStage, "день", "дня", "дней")} на этапе «${deal.stage}» без движения`,
    })
  }
  if (!na) {
    s.push({
      kind: "noNext",
      title: "Нет следующего шага",
      description: "Зафиксируйте следующий шаг, чтобы не потерять сделку",
    })
  }
  return s.sort((a, b) => SIGNAL_RANK[a.kind] - SIGNAL_RANK[b.kind])
}

/** Красный — просрочка и пропущенный follow-up, жёлтый — всё, что требует внимания. */
export function getHealth(signals: Signal[]): Health {
  if (signals.some((x) => x.kind === "overdue" || x.kind === "noResponse")) return "risk"
  if (signals.some((x) => x.kind === "dateConflict")) return "attention"
  if (signals.some((x) => x.kind === "stalled")) return "stalled"
  if (signals.some((x) => x.kind === "noNext")) return "attention"
  return "ok"
}

export const HEALTH_ORDER: Record<Health, number> = { risk: 0, attention: 1, stalled: 2, ok: 3 }

export const HEALTH_META: Record<Health, { label: string; dot: string; text: string; soft: string }> = {
  ok: { label: "В порядке", dot: "bg-success", text: "text-success", soft: "bg-success/10" },
  attention: { label: "Требует внимания", dot: "bg-warning", text: "text-warning", soft: "bg-warning/10" },
  risk: { label: "Под риском", dot: "bg-destructive", text: "text-destructive", soft: "bg-destructive/10" },
  stalled: { label: "Зависла", dot: "bg-warning", text: "text-warning", soft: "bg-warning/10" },
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function dueLabel(date: Date, time?: string) {
  const diff = dayDiff(date, TODAY)
  const day =
    diff === 0 ? "Сегодня" : diff === -1 ? "Вчера" : diff === 1 ? "Завтра" :
    date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")
  return time ? `${day}, ${time}` : day
}

export const isToday = (date: Date) => dayDiff(date, TODAY) === 0
export const isOverdue = (date: Date) => dayDiff(date, TODAY) < 0

export const SEED_DEALS: Deal[] = [
  {
    id: "nova",
    title: "Внедрение аналитической платформы",
    company: "Nova Systems",
    amount: 1_240_000,
    stage: "Переговоры",
    closeDate: d(25),
    contact: "Анна Петрова",
    contactRole: "Project Manager",
    owner: "Марат",
    daysInStage: 18,
    lastContact: d(12),
    lastActivityNote: "Отправлено коммерческое предложение",
    nextAction: null,
  },
  {
    id: "kronos",
    title: "Лицензии BI на 120 рабочих мест",
    company: "Кронос Логистик",
    amount: 860_000,
    stage: "Предложение",
    closeDate: d(10, 9),
    contact: "Игорь Белов",
    contactRole: "ИТ-директор",
    owner: "Марат",
    daysInStage: 6,
    lastContact: d(19),
    lastActivityNote: "Встреча: согласовали состав лицензий",
    nextAction: { title: "Отправить коммерческое предложение", type: "email", date: d(22), contact: "Игорь Белов" },
  },
  {
    id: "ladoga",
    title: "Пилот модуля прогнозирования спроса",
    company: "Ладога Ритейл",
    amount: 540_000,
    stage: "Согласование",
    closeDate: d(25),
    contact: "Ольга Миронова",
    contactRole: "Head of Analytics",
    owner: "Марат",
    daysInStage: 4,
    lastContact: d(21),
    lastActivityNote: "Звонок: юристы смотрят договор",
    nextAction: { title: "Получить подписанный договор", type: "task", date: d(30), contact: "Ольга Миронова" },
  },
  {
    id: "tehnopark",
    title: "Интеграция отчётности с 1С",
    company: "ТехноПарк Урал",
    amount: 380_000,
    stage: "Квалификация",
    closeDate: d(31, 9),
    contact: "Денис Орлов",
    contactRole: "Финансовый директор",
    owner: "Марат",
    daysInStage: 24,
    lastContact: d(16),
    lastActivityNote: "Письмо: запросили вводные по объёму данных",
    nextAction: null,
  },
  {
    id: "medline",
    title: "Аналитика для сети клиник",
    company: "МедЛайн Групп",
    amount: 2_100_000,
    stage: "Предложение",
    closeDate: d(15, 9),
    contact: "Сергей Котов",
    contactRole: "COO",
    owner: "Марат",
    daysInStage: 5,
    lastContact: d(22),
    lastActivityNote: "Письмо: подтвердили время презентации",
    nextAction: { title: "Презентация решения", type: "meeting", date: d(23), time: "11:00", contact: "Сергей Котов" },
  },
  {
    id: "polimer",
    title: "Дашборды для производства",
    company: "Полимер-Т",
    amount: 720_000,
    stage: "Потребность подтверждена",
    closeDate: d(20, 9),
    contact: "Мария Гусева",
    contactRole: "Руководитель ПЭО",
    owner: "Марат",
    daysInStage: 3,
    lastContact: d(20),
    lastActivityNote: "Встреча: обсудили ключевые метрики",
    nextAction: { title: "Демо для ИТ-директора", type: "meeting", date: d(23), time: "16:30", contact: "Мария Гусева" },
  },
  {
    id: "arctic",
    title: "Продление подписки на 2027 год",
    company: "Арктик Энерджи",
    amount: 450_000,
    stage: "Согласование",
    closeDate: d(30),
    contact: "Павел Зуев",
    contactRole: "Менеджер по закупкам",
    owner: "Марат",
    daysInStage: 2,
    lastContact: d(22),
    lastActivityNote: "Звонок: условия согласованы",
    nextAction: { title: "Отправить договор на подпись", type: "email", date: d(23), contact: "Павел Зуев" },
  },
  {
    id: "sfera",
    title: "Внедрение CRM-аналитики",
    company: "Сфера Девелопмент",
    amount: 1_600_000,
    stage: "Переговоры",
    closeDate: d(30, 9),
    contact: "Елена Власова",
    contactRole: "Коммерческий директор",
    owner: "Марат",
    daysInStage: 7,
    lastContact: d(22),
    lastActivityNote: "Встреча: клиент запросил скидку",
    nextAction: { title: "Встреча по условиям договора", type: "meeting", date: d(24), time: "12:00", contact: "Елена Власова" },
  },
  {
    id: "gorizont",
    title: "Обучение команды аналитиков",
    company: "Горизонт Медиа",
    amount: 190_000,
    stage: "Новый лид",
    closeDate: d(30, 9),
    contact: "Артём Лебедев",
    contactRole: "HR BP",
    owner: "Марат",
    daysInStage: 1,
    lastContact: d(22),
    lastActivityNote: "Заявка с сайта",
    nextAction: { title: "Квалификационный звонок", type: "call", date: d(24), time: "10:00", contact: "Артём Лебедев" },
  },
  {
    id: "baikal",
    title: "Миграция отчётности в облако",
    company: "Байкал Агро",
    amount: 980_000,
    stage: "Квалификация",
    closeDate: d(14, 10),
    contact: "Николай Седов",
    contactRole: "CIO",
    owner: "Марат",
    daysInStage: 8,
    lastContact: d(18),
    lastActivityNote: "Звонок: ждут ТЗ от подрядчика",
    nextAction: { title: "Запросить техническое задание", type: "email", date: d(26), contact: "Николай Седов" },
  },
]

export type FeedEvent = {
  id: string
  actor: string
  initials: string
  text: string
  deal: string
  detail?: string
  time: string
  kind: "team" | "you" | "system"
}

export const SEED_FEED: FeedEvent[] = [
  {
    id: "e1",
    actor: "Алексей Смирнов",
    initials: "АС",
    text: "изменил сумму сделки",
    deal: "Сфера Девелопмент",
    detail: "₽\u00a01\u00a0750\u00a0000 → ₽\u00a01\u00a0600\u00a0000",
    time: "30 мин назад",
    kind: "team",
  },
  {
    id: "e2",
    actor: "Ирина Ковалёва",
    initials: "ИК",
    text: "оставила комментарий",
    deal: "Nova Systems",
    detail: "«Что с Nova? Почти две недели тишины»",
    time: "Вчера, 18:40",
    kind: "team",
  },
  {
    id: "e3",
    actor: "Вы",
    initials: "М",
    text: "перевели сделку на этап «Согласование»",
    deal: "Арктик Энерджи",
    time: "Вчера, 15:12",
    kind: "you",
  },
  {
    id: "e4",
    actor: "Dealflow",
    initials: "D",
    text: "создал сделку из заявки с сайта",
    deal: "Горизонт Медиа",
    time: "Вчера, 09:03",
    kind: "system",
  },
]
