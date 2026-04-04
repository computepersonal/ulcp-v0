import type { KdsConfig } from '../types';

const KEY = 'kds_config';

export const getConfig = (): KdsConfig | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as KdsConfig | null;
  } catch {
    return null;
  }
};

export const setConfig = (c: KdsConfig): void => {
  localStorage.setItem(KEY, JSON.stringify(c));
};

export const clearConfig = (): void => {
  localStorage.removeItem(KEY);
};
