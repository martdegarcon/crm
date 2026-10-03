import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const rub = (n: number) =>
  "₽ " + new Intl.NumberFormat("ru-RU").format(n)
