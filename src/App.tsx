import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  Home,
  KanbanSquare,
  ListTodo,
  Loader2,
  Moon,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Sun,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Toaster } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import {
  type ActionType,
  type Deal,
  type FeedEvent,
  type Health,
  type NextAction,
  type Signal,
  HEALTH_META,
  HEALTH_ORDER,
  SEED_DEALS,
  SEED_FEED,
  SIGNAL_RANK,
  STAGES,
  TODAY,
  d,
  dueLabel,
  getHealth,
  getSignals,
  isOverdue,
  isToday,
  plural,
} from "@/data"

/* ------------------------------------------------------------------ */
/* Композиция: навигация 232px | рабочая область (жидкая) | контекст   */
/* 300px: виден inline от 1280px, на более узких экранах открывается панелью. */
/* Обе таблицы используют одну сетку колонок — секции выровнены.       */
/* ------------------------------------------------------------------ */

type ScreenState = "default" | "loading" | "allClear" | "empty" | "error"
type Filter = "all" | "closing"
type EnrichedDeal = Deal & { signals: Signal[]; health: Health }
type ActionDraft = { dealId: string; title: string; type: ActionType; day: string; time: string; comment: string }

const ACTION_LABEL: Record<ActionType, string> = { call: "Звонок", meeting: "Встреча", email: "Письмо", task: "Задача" }

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const fromIso = (s: string) => {
  const [y, m, dd] = s.split("-").map(Number)
  return new Date(y, m - 1, dd)
}
const DAY_OPTIONS = [
  { value: iso(d(23)), label: "Сегодня, 23 сен" },
  { value: iso(d(24)), label: "Завтра, 24 сен" },
  { value: iso(d(25)), label: "Пт, 25 сен" },
  { value: iso(d(28)), label: "Пн, 28 сен" },
]
const TIME_OPTIONS = ["—", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
const END_OF_MONTH = d(30)

const rub = (n: number) => "₽ " + new Intl.NumberFormat("ru-RU").format(n)
const shortDate = (date: Date) => date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "").replace(" ", "\u00a0")
const daysTo = (date: Date) => Math.round((date.getTime() - TODAY.getTime()) / 86_400_000)
const daysLeftLabel = (date: Date) => {
  const n = daysTo(date)
  if (n < 0) return "срок прошёл"
  if (n === 0) return "сегодня"
  if (n === 1) return "завтра"
  return `через ${n} ${plural(n, "день", "дня", "дней")}`
}

const enrich = (deal: Deal): EnrichedDeal => {
  const signals = getSignals(deal)
  return { ...deal, signals, health: getHealth(signals) }
}
const openDeal = (deal: Deal) => toast(deal.title, { description: "Карточка сделки — следующий экран прототипа" })


/* Общая сетка колонок для «Требуют внимания» и «Мои сделки» */
/* Доли ≈ 25 / 13 / 16 / 25 / 11 / 10 %. Минимумы не дают колонкам сжиматься на 1440. */
const COLS =
  "grid grid-cols-[minmax(200px,32fr)_minmax(108px,11fr)_minmax(124px,12fr)_minmax(200px,27fr)_minmax(100px,9fr)_minmax(96px,9fr)] gap-x-4 min-[1536px]:gap-x-6"

/* ------------------------------------------------------------------ */

export default function App() {
  const [deals, setDeals] = useState<Deal[]>(SEED_DEALS)
  const [feed, setFeed] = useState<FeedEvent[]>(SEED_FEED)
  const [screen, setScreen] = useState<ScreenState>("loading")
  const [failNextSave, setFailNextSave] = useState(false)
  const [dark, setDark] = useState(false)
  const [draft, setDraft] = useState<ActionDraft | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
  const [railOpen, setRailOpen] = useState(false)

  useEffect(() => {
    if (screen !== "loading") return
    const t = setTimeout(() => setScreen("default"), 800)
    return () => clearTimeout(t)
  }, [screen])
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  const sourceDeals = useMemo<Deal[]>(() => {
    if (screen === "empty") return []
    if (screen === "allClear")
      return deals.map((x) =>
        x.nextAction && !isOverdue(x.nextAction.date) && x.nextAction.date <= x.closeDate
          ? x
          : { ...x, lastContact: d(22), daysInStage: 3, nextAction: { title: "Созвон по статусу", type: "call", date: d(24), time: "11:00" } }
      )
    return deals
  }, [deals, screen])

  const enriched = useMemo(
    () => sourceDeals.map(enrich).sort((a, b) => HEALTH_ORDER[a.health] - HEALTH_ORDER[b.health] || a.closeDate.getTime() - b.closeDate.getTime()),
    [sourceDeals]
  )
  const attention = enriched.filter((x) => x.health !== "ok")
  const agenda = enriched
    .filter((x) => x.nextAction && (isToday(x.nextAction.date) || isOverdue(x.nextAction.date)))
    .sort((a, b) => {
      const ao = isOverdue(a.nextAction!.date) ? 0 : 1
      const bo = isOverdue(b.nextAction!.date) ? 0 : 1
      return ao - bo || (a.nextAction!.time ?? "99").localeCompare(b.nextAction!.time ?? "99")
    })

  /* actions */
  const patch = (id: string, fn: (x: Deal) => Deal) => setDeals((all) => all.map((x) => (x.id === id ? fn(x) : x)))
  const pushFeed = (e: Pick<FeedEvent, "text" | "deal" | "detail">) =>
    setFeed((f) => [{ id: crypto.randomUUID(), actor: "Вы", initials: "М", time: "сейчас", kind: "you", ...e }, ...f])

  const completeAction = (deal: Deal) => {
    const prev = deal
    patch(deal.id, (x) => ({ ...x, nextAction: null, lastContact: TODAY, lastActivityNote: x.nextAction?.title ?? x.lastActivityNote }))
    pushFeed({ text: `выполнили «${deal.nextAction?.title}»`, deal: deal.company })
    toast("Выполнено. Задайте сделке следующий шаг", {
      description: deal.company,
      action: { label: "Отменить", onClick: () => patch(deal.id, () => prev) },
    })
  }
  const reschedule = (deal: Deal, date: Date) => {
    patch(deal.id, (x) => (x.nextAction ? { ...x, nextAction: { ...x.nextAction, date } } : x))
    pushFeed({ text: `перенесли «${deal.nextAction?.title}» на ${shortDate(date)}`, deal: deal.company })
    toast(`Перенесено на ${shortDate(date)}`, { description: deal.nextAction?.title })
  }
  const changeCloseDate = (deal: Deal, date: Date) => {
    patch(deal.id, (x) => ({ ...x, closeDate: date }))
    pushFeed({ text: "изменили дату закрытия", deal: deal.company, detail: `${shortDate(deal.closeDate)} → ${shortDate(date)}` })
    toast(`Дата закрытия: ${shortDate(date)}`, { description: deal.company })
  }
  const openDraft = (deal: Deal, preset?: Partial<ActionDraft>) =>
    setDraft({ dealId: deal.id, title: `Связаться: ${deal.contact}`, type: "call", day: iso(TODAY), time: "14:00", comment: "", ...preset })
  const saveDraft = (dr: ActionDraft) => {
    const deal = deals.find((x) => x.id === dr.dealId)!
    const na: NextAction = { title: dr.title, type: dr.type, date: fromIso(dr.day), time: dr.time === "—" ? undefined : dr.time, contact: deal.contact }
    patch(dr.dealId, (x) => ({ ...x, nextAction: na }))
    pushFeed({ text: `запланировали «${na.title}»`, deal: deal.company, detail: dueLabel(na.date, na.time) })
    toast(`Запланировано: ${dueLabel(na.date, na.time).toLowerCase()}`, { description: `${deal.company} — ${na.title}` })
    setDraft(null)
  }
  const handlers = { onComplete: completeAction, onReschedule: reschedule, onChangeClose: changeCloseDate, onDraft: openDraft }

  const ready = screen === "default" || screen === "allClear"
  const overdue = agenda.filter((x) => isOverdue(x.nextAction!.date)).length

  const rail = ready ? (
    <>
      <TodayRail items={agenda} onComplete={completeAction} />
      <ChangesRail items={feed} />
    </>
  ) : screen === "loading" ? (
    <LoadingRail />
  ) : null

  return (
    <>
      <div className="flex min-h-svh bg-background">
        <Nav
          dark={dark}
          onToggleTheme={() => setDark((v) => !v)}
          dealCount={enriched.length}
          taskCount={agenda.length}
          screen={screen}
          onScreen={setScreen}
          failNextSave={failNextSave}
          onFailNextSave={setFailNextSave}
          onReset={() => {
            setDeals(SEED_DEALS)
            setFeed(SEED_FEED)
            setScreen("loading")
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ---------- Шапка приложения ---------- */}
          <header className="sticky top-0 z-30 flex h-[88px] shrink-0 items-center gap-4 border-b bg-background px-6 2xl:px-10">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-3">
                <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">Главная</h1>
                {ready && attention.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Status tone="attention">{attention.length} требуют внимания</Status>
                    {overdue > 0 && <Status tone="risk">{overdue} просрочено</Status>}
                  </span>
                )}
              </div>
              <p className="hidden truncate text-[14px] leading-5 text-muted-foreground md:block">Среда, 23 сентября</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative hidden md:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                <Input
                  placeholder="Поиск сделок и компаний"
                  aria-label="Поиск сделок и компаний"
                  className="h-10 w-64 rounded-[8px] border-border bg-sidebar pr-10 pl-9 text-[14px] shadow-none md:text-[14px] dark:bg-sidebar"
                />
                <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-sans text-[12px] text-faint">⌘K</kbd>
              </div>
              <Button
                variant="outline"
                className="h-10 rounded-[8px] px-4 text-[14px] font-medium shadow-none xl:hidden"
                onClick={() => setRailOpen((v) => !v)}
                aria-expanded={railOpen}
              >
                <CalendarCheck className="text-muted-foreground" /> Сегодня
                {ready && <span className="text-muted-foreground tabular">{agenda.length}</span>}
              </Button>
              <Button
                className="h-10 rounded-[8px] px-4 text-[14px] font-medium shadow-none"
                onClick={() => toast("Новая сделка", { description: "Следующий экран прототипа" })}
              >
                <Plus /> Новая сделка
              </Button>
            </div>
          </header>

          <div className="flex min-w-0 flex-1">
            {/* ---------- Рабочая область ---------- */}
            <main className="min-w-0 flex-1 px-6 pt-8 pb-20 2xl:px-10">
              <div>
                {screen === "loading" && <LoadingMain />}
                {screen === "error" && <ErrorState onRetry={() => setScreen("loading")} />}
                {screen === "empty" && <EmptyState />}
                {ready && (
                  <>
                    <AttentionSection deals={attention} {...handlers} />
                    <DealsSection deals={enriched} filter={filter} onFilter={setFilter} />
                  </>
                )}
              </div>
            </main>

            {/* ---------- Контекст: inline на широких экранах ---------- */}
            <aside className="hidden w-[280px] shrink-0 border-l bg-sidebar xl:block">
              <div className="sticky top-[88px] max-h-[calc(100svh-88px)] overflow-y-auto px-6 pt-8 pb-8">{rail}</div>
            </aside>
          </div>
        </div>
      </div>

      {/* ---------- Контекст: выезжающая панель на экранах уже 1280px ---------- */}
      {railOpen && (
        <div className="fixed inset-y-0 right-0 z-40 w-[320px] border-l bg-sidebar shadow-[-8px_0_24px_-12px_rgba(0,0,0,0.14)] xl:hidden">
          <div className="flex h-[88px] items-center justify-between border-b px-6">
            <span className="text-[16px] font-semibold">Контекст дня</span>
            <Button variant="ghost" size="icon-sm" onClick={() => setRailOpen(false)} aria-label="Закрыть панель">
              <X />
            </Button>
          </div>
          <div className="max-h-[calc(100svh-88px)] overflow-y-auto px-6 pt-6 pb-8">{rail}</div>
        </div>
      )}

      <ActionDialog
        draft={draft}
        deal={draft ? deals.find((x) => x.id === draft.dealId) ?? null : null}
        failFirst={failNextSave}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSave={saveDraft}
      />
      <Toaster position="bottom-right" theme={dark ? "dark" : "light"} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

type NavProps = {
  dark: boolean
  onToggleTheme: () => void
  dealCount: number
  taskCount: number
  screen: ScreenState
  onScreen: (s: ScreenState) => void
  failNextSave: boolean
  onFailNextSave: (v: boolean) => void
  onReset: () => void
}

function Nav(props: NavProps) {
  const items = [
    { label: "Главная", icon: Home, active: true },
    { label: "Воронка", icon: KanbanSquare },
    { label: "Сделки", icon: Briefcase, count: props.dealCount },
    { label: "Клиенты", icon: Building2 },
    { label: "Задачи", icon: ListTodo, count: props.taskCount },
    { label: "Аналитика", icon: BarChart3 },
  ]
  const itemCls = "flex h-9 items-center gap-3 rounded-[8px] px-3 text-left text-[14px] leading-5 transition-colors"
  return (
    <aside className="sticky top-0 hidden h-svh w-[216px] shrink-0 flex-col border-r bg-sidebar lg:flex">
      <div className="flex h-[88px] items-center gap-3 border-b px-4">
        <span className="flex size-8 items-center justify-center rounded-[6px] bg-foreground text-[13px] font-semibold text-background">D</span>
        <div className="min-w-0 leading-tight">
          <div className="text-[14px] leading-5 font-semibold">Dealflow</div>
          <div className="text-[12px] leading-4 text-muted-foreground">Отдел продаж</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-2 pt-4">
        {items.map((n) => (
          <button
            key={n.label}
            aria-current={n.active ? "page" : undefined}
            onClick={() => !n.active && toast(`«${n.label}» ещё не собран в прототипе`)}
            className={cn(itemCls, n.active ? "bg-sidebar-accent font-medium text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground")}
          >
            <n.icon className={cn("size-4", n.active ? "text-foreground" : "text-faint")} strokeWidth={1.75} />
            {n.label}
            {n.count ? <span className="ml-auto min-w-5 text-right text-[13px] text-muted-foreground tabular">{n.count}</span> : null}
          </button>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t px-2 py-4">
        <PrototypeMenu {...props} className={itemCls} />
        <button onClick={props.onToggleTheme} className={cn(itemCls, "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground")}>
          {props.dark ? <Sun className="size-4 text-faint" strokeWidth={1.75} /> : <Moon className="size-4 text-faint" strokeWidth={1.75} />}
          {props.dark ? "Светлая тема" : "Тёмная тема"}
        </button>
        <div className="mt-2 flex items-center gap-3 px-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[12px] font-medium">ММ</span>
          <div className="min-w-0 leading-tight">
            <div className="text-[14px] leading-5 font-medium whitespace-nowrap">Марат Мурзагалиев</div>
            <div className="text-[12px] leading-4 whitespace-nowrap text-muted-foreground">Менеджер по продажам</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

function PrototypeMenu({ screen, onScreen, failNextSave, onFailNextSave, onReset, className }: NavProps & { className: string }) {
  const labels: Record<ScreenState, string> = {
    default: "Рабочий день",
    loading: "Загрузка",
    allClear: "Проблем нет",
    empty: "Новый пользователь",
    error: "Ошибка загрузки",
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(className, "text-muted-foreground outline-none hover:bg-sidebar-accent/70 hover:text-foreground")}>
        <span className="w-4 text-center text-[12px] text-faint">◇</span>
        <span className="whitespace-nowrap">Прототип</span>
        <ChevronDown className="ml-auto size-3.5 shrink-0 text-faint" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel>Состояние экрана</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={screen} onValueChange={(v) => onScreen(v as ScreenState)}>
          {(Object.keys(labels) as ScreenState[]).map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>
              {labels[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault()
            onFailNextSave(!failNextSave)
          }}
        >
          <Check className={cn("size-3.5", !failNextSave && "opacity-0")} />
          Сбой при сохранении шага
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReset}>
          <RefreshCw className="size-3.5" /> Сбросить данные
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* ------------------------------------------------------------------ */
/* Shared table parts                                                  */
/*                                                                     */
/* Сетка: текст ячеек стоит на той же вертикали, что заголовок         */
/* страницы и заголовки секций. Строки выходят на 12px за неё          */
/* (-mx-3 px-3), чтобы разделители и hover не упирались в текст.       */
/* Шрифты: 22/600 · 16/600 · 14/600 · 13/400 · 12/400 · 12/500.         */
/* Отступы: 4 · 8 · 12 · 16 · 20 · 24 · 32.                            */
/* ------------------------------------------------------------------ */

const ROW = "-mx-3 px-3"

function SectionHead({ title, count, children, small }: { title: string; count?: number; children?: React.ReactNode; small?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", small ? "mb-3 h-8" : "mb-4 h-10")}>
      <h2 className={cn("font-semibold tracking-[-0.01em]", small ? "text-[16px] leading-6" : "text-[20px] leading-7")}>{title}</h2>
      {count !== undefined && <span className={cn("text-faint tabular", small ? "text-[14px]" : "text-[16px]")}>{count}</span>}
      <div className="ml-auto flex items-center gap-1 text-[14px]">{children}</div>
    </div>
  )
}

function ColumnHeader({ cols }: { cols: [string, string, string, string, string, string] }) {
  return (
    <div className={cn(COLS, ROW, "h-9 items-center rounded-[8px] bg-sidebar text-[12px] leading-4 font-medium text-muted-foreground")}>
      {cols.map((c, i) => (
        <span key={i} className={cn((i === 4 || i === 5) && "text-right")}>
          {c}
        </span>
      ))}
    </div>
  )
}

/* ---------- Примитивы меток ----------
 * Tag    — категория (этап): нейтральный серый фон, без рамки.
 * Status — смысловое состояние: красный (критично), оранжевый (внимание), зелёный (в порядке).
 * Метаданные (компания, сумма, даты, «5 из 6», тип шага) — обычный текст, меткой не становятся.
 * Метки 24px / 12px / 600 / радиус 6; кнопки 40px / 14px / 500 / радиус 8 — их не спутать.
 */
const LABEL = "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-[6px] px-2 text-[12px] leading-4 font-semibold"

function Tag({ children }: { children: React.ReactNode }) {
  return <span className={cn(LABEL, "bg-tag font-medium text-tag-fg")}>{children}</span>
}

const STATUS_TONE: Record<Health, string> = {
  risk: "bg-tag-red text-tag-red-fg",
  attention: "bg-tag-orange text-tag-orange-fg",
  stalled: "bg-tag-orange text-tag-orange-fg",
  ok: "bg-tag-green text-tag-green-fg",
}

function Status({ tone, children, caps }: { tone: Health; children: React.ReactNode; caps?: boolean }) {
  return <span className={cn(LABEL, STATUS_TONE[tone], caps && "text-[11px] tracking-[0.05em] uppercase")}>{children}</span>
}

function DealCell({ deal }: { deal: Deal }) {
  return (
    <div className="min-w-0">
      <button
        onClick={() => openDeal(deal)}
        className="block max-w-full text-left text-[15px] leading-[22px] font-semibold text-foreground hover:underline hover:decoration-foreground/25 hover:underline-offset-4"
      >
        {deal.title}
      </button>
      <div className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{deal.company}</div>
    </div>
  )
}

function StageCell({ deal }: { deal: Deal }) {
  return (
    <div className="min-w-0">
      <Tag>{deal.stage}</Tag>
      <div className="mt-1.5 text-[12px] leading-4 text-muted-foreground tabular">{STAGES.indexOf(deal.stage) + 1} из 6</div>
    </div>
  )
}


function NextCell({ deal }: { deal: Deal }) {
  const na = deal.nextAction
  if (!na)
    return (
      <div className="min-w-0">
        <div className="text-[14px] leading-[22px] font-medium text-warning">Шаг не задан</div>
        <div className="mt-1 text-[12px] leading-4 text-muted-foreground">Контакт был {shortDate(deal.lastContact)}</div>
      </div>
    )
  const late = isOverdue(na.date)
  return (
    <div className="min-w-0">
      <div className="text-[14px] leading-[22px]">{na.title}</div>
      <div className="mt-1 text-[12px] leading-4 text-muted-foreground">
        <span className={late ? "font-medium text-destructive" : undefined}>{dueLabel(na.date, na.time)}</span> · {ACTION_LABEL[na.type].toLowerCase()}
      </div>
    </div>
  )
}

function MoneyCell({ amount, note }: { amount: number; note?: string }) {
  return (
    <div className="text-right">
      <div className="text-[15px] leading-[22px] font-semibold tabular">{rub(amount)}</div>
      {note && <div className="mt-1 text-[12px] leading-4 text-muted-foreground tabular">{note}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Требуют внимания                                                 */
/* ------------------------------------------------------------------ */

type RowHandlers = {
  onComplete: (d: Deal) => void
  onReschedule: (d: Deal, date: Date) => void
  onChangeClose: (d: Deal, date: Date) => void
  onDraft: (d: Deal, preset?: Partial<ActionDraft>) => void
}

type AttentionSort = "urgency" | "amount" | "close"
const SORT_LABEL: Record<AttentionSort, string> = { urgency: "Сначала срочные", amount: "Сначала крупные", close: "По дате закрытия" }

/** Срочность: просрочка → пропущенный follow-up → шаг позже закрытия → нет шага; внутри — ближе закрытие, потом сумма. */
function sortAttention(list: EnrichedDeal[], by: AttentionSort) {
  const rank = (x: EnrichedDeal) => SIGNAL_RANK[x.signals[0].kind]
  return [...list].sort((a, b) => {
    if (by === "amount") return b.amount - a.amount
    if (by === "close") return a.closeDate.getTime() - b.closeDate.getTime()
    return rank(a) - rank(b) || a.closeDate.getTime() - b.closeDate.getTime() || b.amount - a.amount
  })
}

/* ------------------------------------------------------------------ */
/* Action Center: не таблица, а очередь дел.                           */
/* Глаз идёт: проблема → сделка → что сделать → деньги/срок → кнопка.  */
/* Первая по срочности задача — «фокус» с увеличенной иерархией,       */
/* остальные — компактная очередь под ней.                              */
/* ------------------------------------------------------------------ */

/** Короткая метка проблемы — первое, что читает глаз. */
function problemLabel(deal: EnrichedDeal) {
  const s = deal.signals[0]
  switch (s.kind) {
    case "overdue":
      return "Просрочено"
    case "noResponse":
      return s.title.replace("Не отвечают", "Нет ответа")
    case "dateConflict":
      return "Шаг позже даты"
    default:
      return s.title
  }
}

/** Что именно случилось — одна фраза. */
function problemDetail(deal: EnrichedDeal) {
  const s = deal.signals[0]
  const na = deal.nextAction
  switch (s.kind) {
    case "overdue":
      return `Срок задачи был ${na ? dueLabel(na.date).toLowerCase() : ""}`
    case "noResponse":
      return `Последний контакт ${shortDate(deal.lastContact)}: ${deal.lastActivityNote.toLowerCase()}`
    case "dateConflict":
      return `Закрытие ${shortDate(deal.closeDate)}, а следующий шаг только ${na ? shortDate(na.date) : ""}`
    case "stalled":
      return `${deal.daysInStage} ${plural(deal.daysInStage, "день", "дня", "дней")} на этапе «${deal.stage}» без движения`
    case "noNext":
      return "Шаг не запланирован, сделка может потерять динамику"
  }
}

/** Что сделать: запланированный шаг или предложение системы. */
function actionLine(deal: EnrichedDeal): { text: string; suggested: boolean } {
  if (deal.nextAction) return { text: deal.nextAction.title, suggested: false }
  return { text: deal.signals[0].kind === "noResponse" ? "Позвонить клиенту сегодня" : `Связаться: ${deal.contact}`, suggested: true }
}

function AttentionSection({ deals, ...h }: { deals: EnrichedDeal[] } & RowHandlers) {
  const [sort, setSort] = useState<AttentionSort>("urgency")
  const [first, ...rest] = sortAttention(deals, sort)
  return (
    <section>
      <SectionHead title="Требуют внимания" count={deals.length}>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground">
            {SORT_LABEL[sort]}
            <ChevronDown className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as AttentionSort)}>
              {(Object.keys(SORT_LABEL) as AttentionSort[]).map((k) => (
                <DropdownMenuRadioItem key={k} value={k} className="text-[13px]">
                  {SORT_LABEL[k]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SectionHead>

      {!first ? (
        <div className="flex min-h-14 items-center gap-3 rounded-[10px] border px-5 text-[14px]">
          <Status tone="ok">Всё в порядке</Status>
          <span className="text-muted-foreground">У каждой сделки есть следующий шаг, просрочек и зависших сделок нет.</span>
        </div>
      ) : (
        /* Одна очередь из всех сделок; первая выделена только размером и синей кнопкой. */
        <div className="overflow-hidden rounded-[10px] border bg-card">
          <ul className="divide-y">
            <WorkRow deal={first} first={sort === "urgency"} as="li" {...h} />
            {rest.map((deal) => (
              <WorkRow key={deal.id} deal={deal} first={false} as="li" {...h} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

/** Семантическая метка проблемы — компактный тег, стоит прямо перед названием сделки. */
function ProblemLabel({ deal }: { deal: EnrichedDeal }) {
  return (
    <Status tone={deal.health} caps>
      {problemLabel(deal)}
    </Status>
  )
}

/*
 * Рабочая строка очереди: [статус] сделка + контекст | следующий шаг | действие.
 * Колонки делят ширину по содержимому; текст никогда не обрезается — при нехватке места переносится.
 */
function WorkRow({ deal, first, as = "div", ...h }: { deal: EnrichedDeal; first: boolean; as?: "div" | "li" } & RowHandlers) {
  const act = actionLine(deal)
  const na = deal.nextAction
  const Comp = as
  return (
    <Comp
      className={cn(
        "grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] items-center gap-x-6 px-5 transition-colors hover:bg-row-hover min-[1536px]:gap-x-10 max-lg:grid-cols-1 max-lg:gap-y-3",
        first ? "py-4" : "py-3.5"
      )}
    >
      {/* сделка: [статус] название, под ним компания · [этап] · сумма · срок — текст переносится, не обрезается */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1" title={problemDetail(deal)}>
          <ProblemLabel deal={deal} />
          <button
            onClick={() => openDeal(deal)}
            className={cn(
              "text-left font-semibold hover:underline hover:decoration-foreground/25 hover:underline-offset-4",
              first ? "text-[17px] leading-6" : "text-[15px] leading-[22px]"
            )}
          >
            {deal.title}
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted-foreground">
          <span className="whitespace-nowrap">{deal.company}</span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className="text-faint">·</span>
            <Tag>{deal.stage}</Tag>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap tabular">
            <span className="text-faint">·</span>
            <span className="font-medium text-foreground">{rub(deal.amount)}</span>
            <span className="text-faint">·</span>
            до {shortDate(deal.closeDate)}
          </span>
        </div>
      </div>

      {/* следующий шаг — полностью, без многоточий */}
      <div className="min-w-0">
        <div className={cn("flex gap-1.5 font-medium", first ? "text-[15px] leading-[22px]" : "text-[14px] leading-5")}>
          <span className="text-faint">→</span>
          <span>{act.text}</span>
        </div>
        <div className="pl-[18px] text-[13px] leading-5 text-muted-foreground">
          {act.suggested ? (
            "предлагает Dealflow"
          ) : (
            <>
              <span className={na && isOverdue(na.date) ? "font-medium text-destructive" : undefined}>{na && dueLabel(na.date, na.time)}</span>
              {na && <> · {ACTION_LABEL[na.type].toLowerCase()}</>}
              {na?.contact && <> · {na.contact}</>}
            </>
          )}
        </div>
      </div>

      {/* действие: ширина по самой длинной кнопке, кнопка по своему тексту, «⋯» на одном месте */}
      <div className="flex min-w-[196px] items-center justify-end gap-1">
        <RowActions deal={deal} primary={first} {...h} />
      </div>
    </Comp>
  )
}

/* Кнопки строки: 36px, 13/500, радиус 8. Сплошная синяя — только у первой по срочности сделки. */
const btnBase = "h-8 rounded-[8px] px-3 text-[13px] font-medium shadow-none"
const btnSolid = cn(btnBase)
const btnSubtle = cn(btnBase, "border border-input bg-background text-foreground hover:bg-accent dark:bg-transparent dark:hover:bg-accent")

function RowActions({ deal, primary, onComplete, onReschedule, onChangeClose, onDraft }: { deal: EnrichedDeal; primary: boolean } & RowHandlers) {
  const kind = deal.signals[0].kind
  const cls = primary ? btnSolid : btnSubtle
  const variant = primary ? "default" : "ghost"

  const more = (items: { label: string; run: () => void }[]) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-8 shrink-0 rounded-[8px] text-muted-foreground" aria-label="Другие действия">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((it) => (
          <DropdownMenuItem key={it.label} onSelect={it.run} className="text-[13px]">
            {it.label}
          </DropdownMenuItem>
        ))}
        {items.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => openDeal(deal)} className="text-[13px]">
          Открыть сделку
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  switch (kind) {
    case "noResponse":
      return (
        <>
          <Button variant={variant} className={cls} onClick={() => onDraft(deal, { title: "Позвонить Анне Петровой", type: "call", time: "14:00", comment: "Уточнить статус согласования предложения" })}>
            Позвонить сегодня
          </Button>
          {more([
            {
              label: "Написать follow-up",
              run: () => onDraft(deal, { title: "Отправить follow-up по предложению", type: "email", time: "—", comment: "Напомнить о коммерческом предложении от 12 сентября" }),
            },
          ])}
        </>
      )
    case "overdue":
      return (
        <>
          <Button variant={variant} className={cls} onClick={() => onComplete(deal)}>
            Выполнено
          </Button>
          {more([
            { label: "Перенести на завтра", run: () => onReschedule(deal, d(24)) },
            { label: "Перенести на пятницу", run: () => onReschedule(deal, d(25)) },
            { label: "Перенести на понедельник", run: () => onReschedule(deal, d(28)) },
          ])}
        </>
      )
    case "dateConflict":
      return (
        <>
          <DateMenu
            className={cls}
            variant={variant}
            label="Сдвинуть закрытие"
            title="Новая дата закрытия"
            options={[
              { date: d(30), label: "30 сентября", hint: "в день шага" },
              { date: d(2, 9), label: "2 октября", hint: "+2 дня" },
              { date: d(9, 9), label: "9 октября", hint: "+1 неделя" },
            ]}
            onPick={(date) => onChangeClose(deal, date)}
          />
          {more([{ label: `Перенести шаг на ${shortDate(deal.closeDate)}`, run: () => onReschedule(deal, deal.closeDate) }])}
        </>
      )
    case "stalled":
    case "noNext":
      return (
        <>
          <Button variant={variant} className={cls} onClick={() => onDraft(deal, { day: iso(d(24)), time: "11:00" })}>
            Назначить шаг
          </Button>
          {more([])}
        </>
      )
  }
}

function DateMenu({
  label,
  title,
  onPick,
  options,
  className,
  variant,
}: {
  label: string
  title: string
  onPick: (d: Date) => void
  options: { date: Date; label: string; hint: string }[]
  className: string
  variant: "default" | "ghost"
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} className={className}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 rounded-[6px] p-1">
        <div className="px-2 py-1 text-[12px] text-muted-foreground">{title}</div>
        {options.map((o) => (
          <button
            key={o.label}
            className="flex h-8 w-full items-center justify-between rounded-[4px] px-2 text-[13px] hover:bg-accent"
            onClick={() => {
              onPick(o.date)
              setOpen(false)
            }}
          >
            {o.label}
            <span className="text-[12px] text-muted-foreground">{o.hint}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Мои сделки                                                       */
/* ------------------------------------------------------------------ */

function DealsSection({ deals, filter, onFilter }: { deals: EnrichedDeal[]; filter: Filter; onFilter: (f: Filter) => void }) {
  const rows = filter === "closing" ? deals.filter((x) => x.closeDate <= END_OF_MONTH) : deals
  const closingCount = deals.filter((x) => x.closeDate <= END_OF_MONTH).length
  const total = rows.reduce((s, x) => s + x.amount, 0)

  const tab = (key: Filter, label: string, count: number) => (
    <button
      onClick={() => onFilter(key)}
      aria-pressed={filter === key}
      className={cn("h-8 rounded-[8px] px-3 transition-colors", filter === key ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}
    >
      {label} <span className="font-normal text-faint tabular">{count}</span>
    </button>
  )

  return (
    <section className="pt-10">
      <div className="mb-3 flex h-10 items-center gap-2">
        <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em]">Мои сделки</h2>
        <span className="text-[16px] text-faint tabular">{rows.length}</span>
        <span className="text-[16px] text-faint">·</span>
        <span className="text-[16px] font-medium text-muted-foreground tabular">{rub(total)}</span>
        <div className="ml-auto flex items-center gap-1 text-[14px]">
          {tab("all", "Все", deals.length)}
          {tab("closing", "Закрытие в сентябре", closingCount)}
        </div>
      </div>

      <div className="-mx-3 overflow-x-auto px-3">
        <div className="min-w-[860px]">
          <ColumnHeader cols={["Сделка", "Этап", "Статус", "Следующий шаг", "Сумма", "Закрытие"]} />
          {rows.map((deal) => (
            <DealRow key={deal.id} deal={deal} />
          ))}
          {rows.length === 0 && <p className={cn(ROW, "flex min-h-12 items-center text-[14px] text-muted-foreground")}>Нет сделок под этот фильтр.</p>}
        </div>
      </div>
    </section>
  )
}

function DealRow({ deal }: { deal: EnrichedDeal }) {
  const conflict = deal.signals.some((s) => s.kind === "dateConflict")
  return (
    <div className={cn(COLS, ROW, "min-h-[68px] items-start border-b border-border/60 py-3.5 transition-colors last:border-b-0 hover:bg-row-hover")}>
      <DealCell deal={deal} />
      <StageCell deal={deal} />
      <div className="min-w-0">
        <Status tone={deal.health}>{HEALTH_META[deal.health].label}</Status>
      </div>
      <NextCell deal={deal} />
      <MoneyCell amount={deal.amount} />
      <div className="text-right">
        <div className={cn("text-[14px] leading-[22px] tabular", conflict && "font-medium text-warning")}>{shortDate(deal.closeDate)}</div>
        <div className="mt-1 text-[12px] leading-4 text-muted-foreground">{daysLeftLabel(deal.closeDate)}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Контекст: сегодня + изменения (одна система: заголовок, линия, пункты) */
/* ------------------------------------------------------------------ */

function TodayRail({ items, onComplete }: { items: EnrichedDeal[]; onComplete: (d: Deal) => void }) {
  return (
    <section>
      <SectionHead title="Сегодня" count={items.length} small />
      {items.length === 0 ? (
        <p className="flex min-h-12 items-center border-t text-[13px] text-muted-foreground">На сегодня шагов нет.</p>
      ) : (
        <ul className="border-t">
          {items.slice(0, 5).map((deal) => {
            const na = deal.nextAction!
            const late = isOverdue(na.date)
            return (
              <li key={deal.id} className="flex items-start gap-3 border-b border-border/60 py-4">
                <div className="min-w-0 flex-1">
                  {late ? <Status tone="risk">Просрочено · вчера</Status> : <Tag>{na.time ?? "В течение дня"}</Tag>}
                  <div className="mt-2 text-[14px] leading-5 font-medium">{na.title}</div>
                  <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
                    {deal.company} · {ACTION_LABEL[na.type].toLowerCase()}
                  </div>
                </div>
                <button
                  onClick={() => onComplete(deal)}
                  aria-label={`Отметить выполненным: ${na.title}`}
                  title="Отметить выполненным"
                  className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-background text-transparent transition-colors hover:border-foreground/50 hover:text-foreground"
                >
                  <Check className="size-3" strokeWidth={2.5} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ChangesRail({ items }: { items: FeedEvent[] }) {
  return (
    <section className="pt-10">
      <SectionHead title="Последние изменения" small />
      <ul className="border-t">
        {items.slice(0, 5).map((e) => (
          <li key={e.id} className="border-b border-border/60 py-4">
            <div className="text-[12px] leading-4 text-muted-foreground">{e.time}</div>
            <p className="mt-1 text-[13.5px] leading-5">
              <span className="font-medium">{e.actor}</span> <span className="text-muted-foreground">{e.text}</span>
            </p>
            <div className="mt-1 text-[13px] leading-5 text-muted-foreground">
              {e.deal}
              {e.detail && <span className="tabular"> · {e.detail}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Action dialog                                                       */
/* ------------------------------------------------------------------ */

function ActionDialog({
  draft,
  deal,
  failFirst,
  onChange,
  onClose,
  onSave,
}: {
  draft: ActionDraft | null
  deal: Deal | null
  failFirst: boolean
  onChange: (d: ActionDraft) => void
  onClose: () => void
  onSave: (d: ActionDraft) => void
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle")
  const [attempts, setAttempts] = useState(0)
  useEffect(() => {
    if (draft === null) {
      setStatus("idle")
      setAttempts(0)
    }
  }, [draft])

  if (!draft || !deal) return null
  const set = (p: Partial<ActionDraft>) => onChange({ ...draft, ...p })
  const busy = status === "saving"
  const submit = () => {
    setStatus("saving")
    setTimeout(() => {
      if (failFirst && attempts === 0) {
        setAttempts(1)
        setStatus("error")
        return
      }
      onSave(draft)
    }, 900)
  }
  const labelCls = "text-[12px] font-medium text-muted-foreground"
  const field = "h-9 text-[14px] shadow-none md:text-[14px]"

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="gap-5 rounded-[8px] bg-card p-6 text-[14px] sm:max-w-[480px]">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-[17px]">Следующий шаг</DialogTitle>
          <DialogDescription className="text-[13px]">
            {deal.title} · {deal.company}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex gap-1 rounded-[7px] bg-accent p-0.5" role="radiogroup" aria-label="Тип шага">
            {(Object.keys(ACTION_LABEL) as ActionType[]).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={draft.type === t}
                disabled={busy}
                onClick={() => set({ type: t })}
                className={cn(
                  "h-8 flex-1 rounded-[6px] text-[13px] transition-colors",
                  draft.type === t ? "bg-background font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {ACTION_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="na-title" className={labelCls}>
              Что сделать
            </Label>
            <Input id="na-title" className={field} value={draft.title} disabled={busy} onChange={(e) => set({ title: e.target.value })} />
          </div>

          <div className="grid grid-cols-[1fr_120px] gap-3">
            <div className="grid gap-1.5">
              <Label className={labelCls}>Когда</Label>
              <Select value={draft.day} onValueChange={(v) => set({ day: v })} disabled={busy}>
                <SelectTrigger className="w-full text-[14px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-[14px]">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className={labelCls}>Время</Label>
              <Select value={draft.time} onValueChange={(v) => set({ time: v })} disabled={busy}>
                <SelectTrigger className="w-full text-[14px] shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-[14px]">
                      {t === "—" ? "Без времени" : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <span className={labelCls}>Контакт</span>
            <div>
              {deal.contact} <span className="text-muted-foreground">· {deal.contactRole}</span>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="na-comment" className={labelCls}>
              Комментарий
            </Label>
            <Textarea
              id="na-comment"
              className="min-h-16 text-[14px] shadow-none md:text-[14px]"
              placeholder="Чего ждём в результате"
              value={draft.comment}
              disabled={busy}
              onChange={(e) => set({ comment: e.target.value })}
            />
          </div>

          {fromIso(draft.day) > deal.closeDate && (
            <p className="text-[13px] text-warning">Шаг позже даты закрытия сделки ({shortDate(deal.closeDate)}). Выберите день раньше или перенесите закрытие.</p>
          )}

          {status === "error" && (
            <p role="alert" className="border-l-2 border-destructive pl-3 text-[13px]">
              <span className="font-medium text-destructive">Не удалось сохранить.</span>{" "}
              <span className="text-muted-foreground">Сервер не ответил, сделка не изменилась. Введённые данные на месте, попробуйте ещё раз.</span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" className="h-9 text-[14px] font-normal" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button className="h-9 text-[14px] shadow-none" onClick={submit} disabled={busy || !draft.title.trim()}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" /> Сохраняем
              </>
            ) : status === "error" ? (
              "Повторить"
            ) : (
              "Запланировать"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Screen states                                                       */
/* ------------------------------------------------------------------ */

function LoadingMain() {
  const row = (i: number) => (
    <div key={i} className="flex items-start gap-8 border-b py-5 pl-3">
      <div className="flex w-72 flex-col gap-2">
        <Skeleton className="h-4 w-64 rounded-sm" />
        <Skeleton className="h-3 w-28 rounded-sm" />
      </div>
      <Skeleton className="h-4 w-28 rounded-sm" />
      <Skeleton className="h-4 w-36 rounded-sm" />
      <Skeleton className="h-4 w-48 rounded-sm" />
      <Skeleton className="mr-3 ml-auto h-4 w-24 rounded-sm" />
    </div>
  )
  return (
    <div aria-busy>
      <Skeleton className="mb-4 h-5 w-44 rounded-sm" />
      <div className="border-t">{[0, 1, 2, 3].map(row)}</div>
      <Skeleton className="mt-12 mb-4 h-5 w-32 rounded-sm" />
      <div className="border-t">{[0, 1, 2, 3, 4].map(row)}</div>
    </div>
  )
}

function LoadingRail() {
  return (
    <div aria-busy>
      <Skeleton className="mb-4 h-5 w-24 rounded-sm" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b py-3.5">
          <Skeleton className="h-3 w-12 rounded-sm" />
          <Skeleton className="h-4 w-48 rounded-sm" />
        </div>
      ))}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="max-w-md pt-6">
      <h2 className="text-[16px] font-semibold">Не удалось загрузить сделки</h2>
      <p className="mt-1.5 text-[14px] text-muted-foreground">Сервер не ответил. Данные не потеряны: как только соединение восстановится, список появится.</p>
      <Button variant="outline" className="mt-4 h-9 text-[14px] font-normal shadow-none" onClick={onRetry}>
        <RefreshCw /> Повторить
      </Button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="max-w-lg pt-6">
      <h2 className="text-[16px] font-semibold">Сделок пока нет</h2>
      <p className="mt-1.5 text-[14px] text-muted-foreground">
        Здесь появятся сделки, которым нужно ваше решение, и полный список по этапам. Создайте первую сделку и задайте ей следующий шаг.
      </p>
      <div className="mt-4 flex gap-2">
        <Button className="h-9 text-[14px] shadow-none">
          <Plus /> Новая сделка
        </Button>
        <Button variant="ghost" className="h-9 text-[14px] font-normal text-muted-foreground">
          Импорт из Excel
        </Button>
      </div>
    </div>
  )
}
