const m = new Map();
export default { getItem: async (k) => (m.has(k) ? m.get(k) : null), setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) };
