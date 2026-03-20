let counter = 0;

export function generateId(prefix = 'id') {
  return `${prefix}_${++counter}_${Date.now()}`;
}
