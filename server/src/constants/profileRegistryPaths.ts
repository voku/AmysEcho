import path from 'path';
import { DATA_DIR } from './modelPaths.js';

export const PROFILE_REGISTRY_DIR = path.join(DATA_DIR, 'profiles');
export const PROFILE_REGISTRY_PATH = path.join(PROFILE_REGISTRY_DIR, 'profile_registry.json');
export const PROFILE_BACKUPS_DIR = path.join(DATA_DIR, 'backups', 'profiles');
