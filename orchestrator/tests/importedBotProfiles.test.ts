import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBotMutation } from '../src/state/pgBotStore';
import { compileBotPrompt, sha256Hex, type BotProfile } from '../src/domain/botProfile';
const clientModulePath = new URL('../../src/bots/compileBotPrompt.ts', import.meta.url).href;
const { compileBotPrompt: clientCompile } = await import(clientModulePath);

const bots = JSON.parse(readFileSync(new URL('../../docs/bots-import-20260911/profiles.json', import.meta.url), 'utf8')).bots as BotProfile[];

describe('14 fiches historiques converties', () => {
 it('valide toutes les identités, familles et sources sans tronquer', () => {
  expect(bots).toHaveLength(14);
  expect(new Set(bots.map(b => b.runtimeId)).size).toBe(14);
  expect(bots.filter(b => b.family === 'veilleur')).toHaveLength(5);
  expect(bots.filter(b => b.family === 'redacteur')).toHaveLength(7);
  for (const bot of bots) {
   expect(() => validateBotMutation(bot)).not.toThrow();
   if (bot.family === 'veilleur') expect(bot.sources).toHaveLength(6);
   expect(bot.limits).toContain('lien en bio');
   expect(bot.limits).toContain('consentement');
   expect(bot.method.length).toBeGreaterThan(100);
  }
 });
 for (const bot of bots) it(`${bot.runtimeId} : aperçu identique au serveur`, () => {
  const text=compileBotPrompt(bot);
  expect(clientCompile(bot)).toBe(text);
  expect(text.startsWith(bot.displayName)).toBe(true);
  expect(text.length).toBeLessThanOrEqual(32000);
  expect(sha256Hex(text)).toMatch(/^[a-f0-9]{64}$/);
  expect(text).not.toContain('Réponse illustrative');
 });
});
