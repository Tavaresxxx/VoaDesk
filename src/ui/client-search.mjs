// Search only the saved entries already loaded by the authenticated local UI.
export const foldSearch = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
const compactCode = value => value.replace(/[\s-]/g, '');

// Snapshot and normalize once per agenda load/change. Queries never reread mutable source rows.
export function createClientSearch(items) {
  const rows = items.map((source, index) => {
    const item = Object.freeze({...source});
    return {item, index, name: foldSearch(item.name), code: compactCode(foldSearch(item.code))};
  });
  return Object.freeze({
    search(query, {field = 'all', limit = Infinity} = {}) {
      if (!['all', 'name', 'code'].includes(field)) throw new TypeError('Campo de busca inválido.');
      if (limit !== Infinity && (!Number.isInteger(limit) || limit < 0)) throw new TypeError('Limite de busca inválido.');
      const text = foldSearch(query), compact = compactCode(text);
      const tokens = text.split(/\s+/).filter(Boolean).map(name => ({name, code: compactCode(name)}));
      const matches = [];
      for (const row of rows) {
        const {name, code} = row;
        const nameMatch = Boolean(text) && tokens.every(token => name.includes(token.name));
        const codeMatch = Boolean(compact) && code.includes(compact);
        const mixedMatch = field === 'all' && tokens.some(token => name.includes(token.name)) && tokens.every(token => name.includes(token.name) || (Boolean(token.code) && code.includes(token.code)));
        if (text && !(field === 'name' ? nameMatch : field === 'code' ? codeMatch : nameMatch || codeMatch || mixedMatch)) continue;
        const matchedBy = !text ? null : field === 'name' ? 'name' : field === 'code' ? 'code' : nameMatch && codeMatch ? 'both' : nameMatch ? 'name' : codeMatch ? 'code' : 'both';
        const rank = !text ? 0 : field !== 'name' && code === compact ? 0 : field !== 'code' && name === text ? 1 : field !== 'code' && name.startsWith(text) ? 2 : field !== 'name' && Boolean(compact) && code.startsWith(compact) ? 3 : 4;
        matches.push({item: row.item, index: row.index, matchedBy, rank});
      }
      matches.sort((a, b) => a.rank - b.rank || a.index - b.index);
      const visible = matches.slice(0, limit).map(({item, matchedBy}) => ({item, matchedBy}));
      return {items: visible.map(match => match.item), matches: visible, total: matches.length};
    }
  });
}

// Kept for callers that need a one-off query. The UI reuses createClientSearch instead.
export const searchClients = (items, query) => createClientSearch(items).search(query).items;
