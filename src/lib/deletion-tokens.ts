import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const TOKENS_FILE = join(process.cwd(), "data/deletion-tokens.json");

interface DeletionToken {
  filename: string;
  token: string;
  createdAt: string;
}

async function getTokens(): Promise<DeletionToken[]> {
  try {
    const content = await readFile(TOKENS_FILE, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    return [];
  }
}

async function saveTokens(tokens: DeletionToken[]): Promise<void> {
  await writeFile(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export async function storeDeletionToken(
  filename: string,
  token: string
): Promise<void> {
  const tokens = await getTokens();
  tokens.push({
    filename,
    token,
    createdAt: new Date().toISOString(),
  });
  await saveTokens(tokens);
}

export async function validateDeletionToken(
  filename: string,
  token: string
): Promise<boolean> {
  const tokens = await getTokens();
  return tokens.some((t) => t.filename === filename && t.token === token);
}

export async function deleteDeletionToken(filename: string): Promise<void> {
  const tokens = await getTokens();
  const newTokens = tokens.filter((t) => t.filename !== filename);
  await saveTokens(newTokens);
}
