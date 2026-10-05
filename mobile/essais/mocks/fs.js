import fs from 'node:fs';
const p = (u) => u.replace(/^file:\/\//, '');
export const documentDirectory = `file://${process.env.H}/docs/`;
export const makeDirectoryAsync = async (u) => void fs.mkdirSync(p(u), { recursive: true });
export const copyAsync = async ({ from, to }) => void fs.copyFileSync(p(from), p(to));
export const deleteAsync = async (u) => void fs.rmSync(p(u), { force: true });
export const getInfoAsync = async (u) => (fs.existsSync(p(u)) ? { exists: true, size: fs.statSync(p(u)).size } : { exists: false });
