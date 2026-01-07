import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TextCase = 'lower' | 'upper' | 'capitalize' | 'title';

/**
 * Transform snake_case string to normal text with specified case formatting
 */
export function snakeToText(str: string, textCase: TextCase = 'title'): string {
  const words = str.split('_');

  switch (textCase) {
    case 'lower':
      return words.join(' ').toLowerCase();
    case 'upper':
      return words.join(' ').toUpperCase();
    case 'capitalize':
      return words
        .map((word, i) =>
          i === 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase()
        )
        .join(' ');
    case 'title':
      return words
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
  }
}
