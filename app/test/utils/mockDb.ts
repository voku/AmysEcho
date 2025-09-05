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
      return {
        commit: async () => {
          const idx = list.indexOf(record);
          if (idx >= 0) {
            list.splice(idx, 1);
          }
        },
      };
    },
    prepareUpdate(cb: (draft: any) => void) {
      const draft = { ...record };
      cb(draft);
      return { commit: () => Object.assign(record, draft) };
    },
  });
}

export function createMockDb(data: Collections) {
  const collections = data;

  function getCollection(name: string) {
    const list = collections[name] || (collections[name] = []);
    return {
      query: (clause?: any) => {
        const filters: Record<string, any> = {};
        if (clause) {
          if (clause.left) {
            const right = clause.comparison?.right;
            if (right?.value !== undefined) {
              filters[clause.left] = right.value;
            } else if (right?.values !== undefined) {
              filters[clause.left] = right.values;
            }
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
                    const id = rec.gestureDefinition?.id ?? rec[f];
                    return Array.isArray(v) ? v.includes(id) : id === v;
                  }
                  return Array.isArray(v) ? v.includes(rec[f]) : rec[f] === v;
                }),
              )
              .map(rec => wrap(rec, list));
          },
        } as any;
      },
      async find(id: string) {
        const rec = list.find(r => r.id === id);
        if (!rec) {
          const err: any = new Error('Nicht gefunden');
          err.name = 'NotFoundError';
          throw err;
        }
        return wrap(rec, list);
      },
      async create(cb: (rec: any) => void) {
        const rec: any = { id: `${name}-${list.length + 1}` };
        if (name === 'gesture_training_data') {
          rec.gestureDefinition = { id: '' };
        }
        const model = wrap(rec, list);
        model._raw = { id: rec.id };
        cb(model);
        rec.id = model._raw.id;
        list.push(rec);
        return model;
      },
      prepareCreate(cb: (rec: any) => void) {
        const rec: any = { id: `${name}-${list.length + 1}` };
        if (name === 'gesture_training_data') {
          rec.gestureDefinition = { id: '' };
        }
        const model = wrap(rec, list);
        model._raw = { id: rec.id };
        cb(model);
        return {
          commit: () => {
            rec.id = model._raw.id;
            list.push(rec);
          },
        };
      },
    };
  }

  return {
    get: getCollection,
    async write<T>(fn: () => Promise<T> | T): Promise<T> {
      return await fn();
    },
    async batch(...ops: any[]) {
      for (const op of ops) {
        if (typeof op?.commit === 'function') {
          await op.commit();
        } else if (typeof op?.destroyPermanently === 'function') {
          await op.destroyPermanently();
        }
      }
    },
  };
}
