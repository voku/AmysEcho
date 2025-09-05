export type Collections = Record<string, any[]>;

function wrap(record: any, list: any[]) {
  return Object.assign(record, {
    async update(cb: (draft: any) => void) {
      const draft = { ...record };
      cb(draft);
      Object.assign(record, draft);
    },
    async destroyPermanently() {
      const idx = list.indexOf(record);
      if (idx >= 0) {
        list.splice(idx, 1);
      }
    },
    prepareDestroyPermanently() {
      return { destroyPermanently: this.destroyPermanently.bind(this) };
    },
  });
}

export function createMockDb(data: Collections) {
  const collections = data;

  function getCollection(name: string) {
    const list = collections[name] || (collections[name] = []);
    return {
      query: (...clauses: any[]) => {
        const filters: Record<string, any> = {};
        const clause = clauses[0];
        if (clause) {
          if (clause.left) {
            filters[clause.left] = clause.comparison?.right?.value;
          } else if (clause.column) {
            filters[clause.column] = clause.value;
          }
        }
        return {
          where(field: string, value: any) {
            filters[field] = value;
            return this;
          },
          async fetch() {
            return list
              .filter(rec =>
                Object.entries(filters).every(([f, v]) => {
                  if (f === 'gesture_definition_id') {
                    return rec.gestureDefinition?.id === v || rec[f] === v;
                  }
                  return rec[f] === v;
                }),
              )
              .map(rec => wrap(rec, list));
          },
        } as any;
      },
      async find(id: string) {
        const rec = list.find(r => r.id === id);
        if (!rec) {
          const err: any = new Error('not found');
          err.name = 'NotFoundError';
          throw err;
        }
        return wrap(rec, list);
      },
      async create(cb: (rec: any) => void) {
        const rec: any = { id: `${name}-${list.length + 1}`, gestureDefinition: { id: '' } };
        const model = wrap(rec, list);
        model._raw = { id: rec.id };
        cb(model);
        rec.id = model._raw.id;
        list.push(rec);
      },
    };
  }

  return {
    get: getCollection,
    async write(fn: any) {
      await fn();
    },
    async batch(...ops: any[]) {
      for (const op of ops) {
        await op.destroyPermanently?.();
      }
    },
  };
}
