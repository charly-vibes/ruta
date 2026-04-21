import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const source = await readFile(new URL('../extensions/prompts.ts', import.meta.url), 'utf8');
const hash = `sha256:${createHash('sha256').update(source, 'utf8').digest('hex')}`;
await writeFile(new URL('../prompts-version.txt', import.meta.url), `${hash}\n`, 'utf8');
console.log(hash);
