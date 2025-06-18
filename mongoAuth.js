import { useSingleFileAuthState } from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';

const statePath = path.join('./', 'auth_info.json');

export async function getAuthState() {
  if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, JSON.stringify({}));
  return useSingleFileAuthState(statePath);
}
