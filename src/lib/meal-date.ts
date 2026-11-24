// Dates d'un repas (« Quand ? ») : jours au format AAAA-MM-JJ, comme la colonne meal_date.
// Sans React Native : testé avec node. Le serveur refuse un jour passé ou à plus de 6 mois
// (create_soiree) ; l'écran ne propose que ces jours-là.

export const MAX_DAYS_AHEAD = 183;

const WEEKDAYS_SHORT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const WEEKDAYS_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// Le jour local d'une date JavaScript, en AAAA-MM-JJ.
export function toDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// À midi : aucun passage à l'heure d'été ne change le jour.
function fromDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}

export function addDays(day: string, count: number): string {
  const date = fromDay(day);
  date.setDate(date.getDate() + count);
  return toDay(date);
}

// « jeu. 24 déc. »
export function formatShortDay(day: string): string {
  const date = fromDay(day);
  return `${WEEKDAYS_SHORT[date.getDay()]} ${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

// « jeudi 24 décembre », pour le lecteur d'écran.
export function formatLongDay(day: string): string {
  const date = fromDay(day);
  return `${WEEKDAYS_LONG[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}

// « décembre 2026 »
export function formatMonth(year: number, month: number): string {
  return `${MONTHS[month]} ${year}`;
}

export function isSelectable(day: string, today: string): boolean {
  return day >= today && day <= addDays(today, MAX_DAYS_AHEAD);
}

// Les semaines d'un mois, du lundi au dimanche ; null pour les cases hors du mois.
export function monthWeeks(year: number, month: number): (string | null)[][] {
  const first = new Date(year, month, 1, 12);
  const daysInMonth = new Date(year, month + 1, 0, 12).getDate();
  // getDay : 0 = dimanche ; on commence la semaine le lundi.
  const offset = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      toDay(new Date(year, month, index + 1, 12)),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let start = 0; start < cells.length; start += 7) weeks.push(cells.slice(start, start + 7));
  return weeks;
}
