'use strict';

/**
 * Mongoose-compatible wrapper around NeDB (nedb-promises).
 *
 * Controllers keep calling find/findOne/create/update/aggregate/paginate the same way they
 * do against Mongoose. Offline-only: this module is the entire persistence layer.
 *
 * Edge cases handled here (see offlinemode.md):
 *  - populate() is resolved in JS by querying the related collection
 *  - aggregate() implements $match/$sort/$skip/$limit/$project/$group/$unwind/$lookup/$addFields/$count
 *  - findOneAndUpdate / $inc / $set / $unset / $push / $pull
 *  - ObjectId-shaped 24-char hex _id generation
 *  - timestamps (createdAt / updatedAt) when timestampData is on
 */

const Datastore = require('nedb-promises');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = process.env.NEDB_DATA_DIR || path.join(
  process.env.APPDATA || process.env.HOME || process.cwd(),
  'FatFox Admin',
  'data'
);

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const collections = Object.create(null);
const modelRegistry = Object.create(null);
const populatePaths = Object.create(null);

function getCollection(name) {
  if (!collections[name]) {
    collections[name] = Datastore.create({
      filename: path.join(dataDir, `${name}.db`),
      autoload: true,
      timestampData: true,
      onload(err) {
        if (err) {
          console.error(`[offline-db] failed to load ${name}.db:`, err.message);
        }
      }
    });
  }
  return collections[name];
}

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function isObjectIdLike(value) {
  return typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value);
}

function clone(value) {
  if (value == null) return value;
  if (value instanceof Date) return new Date(value);
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = clone(value[key]);
    return out;
  }
  return value;
}

function applyUpdate(doc, update) {
  if (!update || typeof update !== 'object') return doc;
  const operators = Object.keys(update).filter((k) => k.startsWith('$'));
  if (operators.length === 0) {
    const next = clone(update);
    next._id = doc._id;
    if (doc.createdAt && next.createdAt == null) next.createdAt = doc.createdAt;
    next.updatedAt = new Date();
    return next;
  }
  const next = clone(doc);
  if (update.$set) Object.assign(next, clone(update.$set));
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) delete next[key];
  }
  if (update.$inc) {
    for (const [key, amount] of Object.entries(update.$inc)) {
      next[key] = (Number(next[key]) || 0) + Number(amount);
    }
  }
  if (update.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      if (!Array.isArray(next[key])) next[key] = [];
      if (value && typeof value === 'object' && Array.isArray(value.$each)) {
        next[key].push(...clone(value.$each));
      } else {
        next[key].push(clone(value));
      }
    }
  }
  if (update.$addToSet) {
    for (const [key, value] of Object.entries(update.$addToSet)) {
      if (!Array.isArray(next[key])) next[key] = [];
      const exists = next[key].some((item) => JSON.stringify(item) === JSON.stringify(value));
      if (!exists) next[key].push(clone(value));
    }
  }
  if (update.$pull) {
    for (const [key, value] of Object.entries(update.$pull)) {
      if (!Array.isArray(next[key])) continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        next[key] = next[key].filter((item) => !matchesQuery(item, value));
      } else {
        next[key] = next[key].filter((item) => JSON.stringify(item) !== JSON.stringify(value));
      }
    }
  }
  next.updatedAt = new Date();
  return next;
}

function getPath(obj, dotted) {
  if (!obj || !dotted) return undefined;
  const parts = String(dotted).split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setPath(obj, dotted, value) {
  const parts = String(dotted).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function compareValues(a, b) {
  if (a instanceof Date) a = a.getTime();
  if (b instanceof Date) b = b.getTime();
  if (a === b) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  return a < b ? -1 : 1;
}

function matchesQuery(doc, query) {
  if (!query || typeof query !== 'object') return true;
  if (query.$and) return query.$and.every((q) => matchesQuery(doc, q));
  if (query.$or) return query.$or.some((q) => matchesQuery(doc, q));
  if (query.$nor) return !query.$nor.some((q) => matchesQuery(doc, q));
  for (const [key, cond] of Object.entries(query)) {
    if (key === '$and' || key === '$or' || key === '$nor') continue;
    const value = getPath(doc, key);
    if (!matchesCondition(value, cond)) return false;
  }
  return true;
}

function matchesCondition(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    for (const [op, expected] of Object.entries(cond)) {
      switch (op) {
        case '$eq': if (!(compareValues(value, expected) === 0)) return false; break;
        case '$ne': if (compareValues(value, expected) === 0) return false; break;
        case '$gt': if (!(compareValues(value, expected) > 0)) return false; break;
        case '$gte': if (!(compareValues(value, expected) >= 0)) return false; break;
        case '$lt': if (!(compareValues(value, expected) < 0)) return false; break;
        case '$lte': if (!(compareValues(value, expected) <= 0)) return false; break;
        case '$in': if (!Array.isArray(expected) || !expected.some((item) => compareValues(value, item) === 0 || (Array.isArray(value) && value.some((v) => compareValues(v, item) === 0)))) return false; break;
        case '$nin': if (Array.isArray(expected) && expected.some((item) => compareValues(value, item) === 0)) return false; break;
        case '$exists': {
          const exists = value !== undefined;
          if (Boolean(expected) !== exists) return false;
          break;
        }
        case '$regex': {
          const flags = (cond.$options || '');
          const re = expected instanceof RegExp ? expected : new RegExp(expected, flags);
          if (!re.test(value == null ? '' : String(value))) return false;
          break;
        }
        case '$options': break;
        case '$elemMatch':
          if (!Array.isArray(value) || !value.some((item) => matchesQuery(item, expected))) return false;
          break;
        default:
          break;
      }
    }
    return true;
  }
  if (cond instanceof RegExp) return cond.test(value == null ? '' : String(value));
  if (Array.isArray(value)) return value.some((item) => compareValues(item, cond) === 0);
  return compareValues(value, cond) === 0;
}

function projectDoc(doc, projection) {
  if (!projection) return doc;
  if (typeof projection === 'string') {
    const fields = projection.split(/\s+/).filter(Boolean);
    const include = {};
    let excluding = false;
    for (const field of fields) {
      if (field.startsWith('-')) {
        excluding = true;
        include[field.slice(1)] = 0;
      } else {
        include[field] = 1;
      }
    }
    return projectDoc(doc, include);
  }
  const keys = Object.keys(projection);
  if (keys.length === 0) return doc;
  const isInclude = keys.some((k) => projection[k] === 1 || projection[k] === true);
  const out = { _id: doc._id };
  if (isInclude) {
    for (const key of keys) {
      if (projection[key]) setPath(out, key, clone(getPath(doc, key)));
    }
    if (projection._id === 0 || projection._id === false) delete out._id;
    return out;
  }
  const next = clone(doc);
  for (const key of keys) {
    if (!projection[key]) {
      const parts = key.split('.');
      let cur = next;
      for (let i = 0; i < parts.length - 1; i++) {
        if (cur == null) break;
        cur = cur[parts[i]];
      }
      if (cur && typeof cur === 'object') delete cur[parts[parts.length - 1]];
    }
  }
  return next;
}

function sortDocs(docs, sort) {
  if (!sort) return docs;
  const entries = Object.entries(sort);
  return docs.slice().sort((a, b) => {
    for (const [key, dir] of entries) {
      const cmp = compareValues(getPath(a, key), getPath(b, key));
      if (cmp !== 0) return dir < 0 || dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function groupKey(doc, idSpec) {
  if (idSpec == null) return null;
  if (typeof idSpec === 'string' && idSpec.startsWith('$')) return getPath(doc, idSpec.slice(1));
  if (typeof idSpec !== 'object') return idSpec;
  const key = {};
  for (const [k, v] of Object.entries(idSpec)) {
    key[k] = typeof v === 'string' && v.startsWith('$') ? getPath(doc, v.slice(1)) : v;
  }
  return JSON.stringify(key);
}

function resolveExpr(doc, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1));
  if (expr && typeof expr === 'object' && !Array.isArray(expr)) {
    if (expr.$sum !== undefined) {
      const v = resolveExpr(doc, expr.$sum);
      return Number(v) || 0;
    }
    if (expr.$size !== undefined) {
      const v = resolveExpr(doc, expr.$size);
      return Array.isArray(v) ? v.length : 0;
    }
    if (expr.$ifNull) {
      const [a, b] = expr.$ifNull;
      const val = resolveExpr(doc, a);
      return val == null ? resolveExpr(doc, b) : val;
    }
  }
  return expr;
}

async function executeAggregate(db, pipeline = []) {
  let docs = clone(await db.find({}));
  for (const stage of pipeline) {
    if (stage.$match) docs = docs.filter((d) => matchesQuery(d, stage.$match));
    else if (stage.$sort) docs = sortDocs(docs, stage.$sort);
    else if (stage.$skip) docs = docs.slice(stage.$skip);
    else if (stage.$limit) docs = docs.slice(0, stage.$limit);
    else if (stage.$project) {
      docs = docs.map((d) => {
        const out = {};
        for (const [k, v] of Object.entries(stage.$project)) {
          if (v === 0 || v === false) continue;
          if (v === 1 || v === true) out[k] = getPath(d, k);
          else out[k] = resolveExpr(d, v);
        }
        if (stage.$project._id !== 0 && out._id === undefined) out._id = d._id;
        return out;
      });
    } else if (stage.$addFields || stage.$set) {
      const spec = stage.$addFields || stage.$set;
      docs = docs.map((d) => {
        const next = clone(d);
        for (const [k, v] of Object.entries(spec)) setPath(next, k, resolveExpr(d, v));
        return next;
      });
    } else if (stage.$unwind) {
      const pathSpec = typeof stage.$unwind === 'string' ? stage.$unwind : stage.$unwind.path;
      const field = pathSpec.replace(/^\$/, '');
      const preserve = typeof stage.$unwind === 'object' && stage.$unwind.preserveNullAndEmptyArrays;
      const next = [];
      for (const d of docs) {
        const arr = getPath(d, field);
        if (!Array.isArray(arr) || arr.length === 0) {
          if (preserve) next.push(d);
          continue;
        }
        for (const item of arr) {
          const copy = clone(d);
          setPath(copy, field, item);
          next.push(copy);
        }
      }
      docs = next;
    } else if (stage.$group) {
      const buckets = new Map();
      for (const d of docs) {
        const key = groupKey(d, stage.$group._id);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(d);
      }
      const grouped = [];
      for (const [key, items] of buckets.entries()) {
        const out = { _id: key && key.startsWith('{') ? JSON.parse(key) : key };
        for (const [field, acc] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          if (acc.$sum !== undefined) {
            if (acc.$sum === 1) out[field] = items.length;
            else out[field] = items.reduce((s, d) => s + (Number(resolveExpr(d, acc.$sum)) || 0), 0);
          } else if (acc.$avg !== undefined) {
            const nums = items.map((d) => Number(resolveExpr(d, acc.$avg)) || 0);
            out[field] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
          } else if (acc.$min !== undefined) {
            out[field] = items.reduce((m, d) => {
              const v = resolveExpr(d, acc.$min);
              return m == null || compareValues(v, m) < 0 ? v : m;
            }, null);
          } else if (acc.$max !== undefined) {
            out[field] = items.reduce((m, d) => {
              const v = resolveExpr(d, acc.$max);
              return m == null || compareValues(v, m) > 0 ? v : m;
            }, null);
          } else if (acc.$first !== undefined) {
            out[field] = resolveExpr(items[0], acc.$first);
          } else if (acc.$last !== undefined) {
            out[field] = resolveExpr(items[items.length - 1], acc.$last);
          } else if (acc.$push !== undefined) {
            out[field] = items.map((d) => resolveExpr(d, acc.$push));
          } else if (acc.$addToSet !== undefined) {
            const seen = new Set();
            out[field] = [];
            for (const d of items) {
              const v = resolveExpr(d, acc.$addToSet);
              const k = JSON.stringify(v);
              if (!seen.has(k)) {
                seen.add(k);
                out[field].push(v);
              }
            }
          }
        }
        grouped.push(out);
      }
      docs = grouped;
    } else if (stage.$lookup) {
      const { from, localField, foreignField, as } = stage.$lookup;
      const foreignDb = getCollection(from);
      const foreignDocs = await foreignDb.find({});
      docs = docs.map((d) => {
        const local = getPath(d, localField);
        const matches = foreignDocs.filter((f) => compareValues(getPath(f, foreignField), local) === 0);
        return { ...d, [as]: clone(matches) };
      });
    } else if (stage.$count) {
      docs = [{ [stage.$count]: docs.length }];
    }
  }
  return docs;
}

async function executePaginate(db, query, options = {}) {
  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.max(1, parseInt(options.limit, 10) || 10);
  const sort = options.sort || { createdAt: -1 };
  const skip = (page - 1) * limit;
  const [totalDocs, docs] = await Promise.all([
    db.count(query || {}),
    db.find(query || {}).sort(sort).skip(skip).limit(limit)
  ]);
  const totalPages = Math.ceil(totalDocs / limit) || 1;
  return {
    docs,
    totalDocs,
    limit,
    page,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
    pagingCounter: skip + 1
  };
}

async function populateDocs(docs, populateSpec) {
  if (!populateSpec || !docs || docs.length === 0) return docs;
  const specs = Array.isArray(populateSpec) ? populateSpec : [populateSpec];
  const out = docs.map(clone);
  for (const spec of specs) {
    const pathName = typeof spec === 'string' ? spec : spec.path;
    const select = typeof spec === 'object' ? spec.select : undefined;
    const modelName = (typeof spec === 'object' && spec.model) || (populatePaths[pathName] && populatePaths[pathName].ref);
    if (!pathName || !modelName) continue;
    const model = modelRegistry[modelName] || modelRegistry[modelName.replace(/s$/, '')] || null;
    const collectionName = (model && model._collectionName) || (populatePaths[pathName] && populatePaths[pathName].collection) || modelName;
    const related = getCollection(collectionName);
    const ids = new Set();
    for (const doc of out) {
      const val = getPath(doc, pathName);
      if (Array.isArray(val)) val.forEach((id) => id && ids.add(String(id)));
      else if (val) ids.add(String(val));
    }
    if (ids.size === 0) continue;
    const relatedDocs = await related.find({ _id: { $in: Array.from(ids) } });
    const byId = new Map(relatedDocs.map((d) => [String(d._id), select ? projectDoc(d, select) : d]));
    for (const doc of out) {
      const val = getPath(doc, pathName);
      if (Array.isArray(val)) setPath(doc, pathName, val.map((id) => byId.get(String(id)) || id));
      else if (val) setPath(doc, pathName, byId.get(String(val)) || val);
    }
  }
  return out;
}

function createCursor(db, query, model) {
  let sortSpec = null;
  let skipN = 0;
  let limitN = null;
  let selectSpec = null;
  const populateSpecs = [];
  let leanFlag = false;

  const run = async () => {
    let cursor = db.find(query || {});
    if (sortSpec) cursor = cursor.sort(sortSpec);
    if (skipN) cursor = cursor.skip(skipN);
    if (limitN != null) cursor = cursor.limit(limitN);
    let docs = await cursor;
    if (selectSpec) docs = docs.map((d) => projectDoc(d, selectSpec));
    if (populateSpecs.length) docs = await populateDocs(docs, populateSpecs);
    return leanFlag ? docs : docs.map((d) => wrapDocument(d, model));
  };

  const chain = {
    sort(s) { sortSpec = s; return chain; },
    skip(n) { skipN = n; return chain; },
    limit(n) { limitN = n; return chain; },
    select(s) { selectSpec = s; return chain; },
    populate(p) { populateSpecs.push(p); return chain; },
    lean() { leanFlag = true; return chain; },
    exec: run,
    then(resolve, reject) { return run().then(resolve, reject); },
    catch(reject) { return run().catch(reject); }
  };
  return chain;
}

function wrapDocument(doc, model) {
  if (!doc) return doc;
  const wrapped = clone(doc);
  wrapped.save = async function save() {
    const payload = clone(this);
    delete payload.save;
    delete payload.toObject;
    delete payload.toJSON;
    if (!payload._id) payload._id = generateId();
    const existing = await model._db.findOne({ _id: payload._id });
    if (existing) {
      const updated = applyUpdate(existing, { $set: payload });
      await model._db.update({ _id: payload._id }, updated, {});
      return updated;
    }
    return model._db.insert(payload);
  };
  wrapped.toObject = function toObject() {
    const obj = clone(this);
    delete obj.save;
    delete obj.toObject;
    delete obj.toJSON;
    return obj;
  };
  wrapped.toJSON = wrapped.toObject;
  return wrapped;
}

function createOfflineModel(collectionName, schemaDefinition = {}, options = {}) {
  const db = getCollection(collectionName);
  const indexes = options.indexes || schemaDefinition.__indexes || [];
  Promise.resolve()
    .then(async () => {
      for (const idx of indexes) {
        try {
          await db.ensureIndex(idx);
        } catch (err) {
          console.warn(`[offline-db] index on ${collectionName} failed:`, err.message);
        }
      }
    })
    .catch(() => {});

  const Model = {
    _db: db,
    _collectionName: collectionName,
    modelName: options.modelName || collectionName,
    find(query = {}) { return createCursor(db, query, Model); },
    findOne(query = {}) {
      const p = db.findOne(query);
      return {
        populate(spec) {
          return p.then(async (doc) => {
            if (!doc) return null;
            const [populated] = await populateDocs([doc], spec);
            return populated;
          });
        },
        lean() { return p; },
        select(s) { return p.then((doc) => projectDoc(doc, s)); },
        exec() { return p; },
        then(resolve, reject) { return p.then(resolve, reject); },
        catch(reject) { return p.catch(reject); }
      };
    },
    findById(id) { return Model.findOne({ _id: id }); },
    async create(doc) {
      if (Array.isArray(doc)) return Model.insertMany(doc);
      const payload = clone(doc);
      if (!payload._id) payload._id = generateId();
      const inserted = await db.insert(payload);
      return wrapDocument(inserted, Model);
    },
    async insertMany(docs) {
      const payload = (docs || []).map((d) => {
        const copy = clone(d);
        if (!copy._id) copy._id = generateId();
        return copy;
      });
      return db.insert(payload);
    },
    async updateOne(query, update) {
      const doc = await db.findOne(query);
      if (!doc) return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
      const next = applyUpdate(doc, update);
      await db.update({ _id: doc._id }, next, {});
      return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    },
    async updateMany(query, update) {
      const docs = await db.find(query || {});
      for (const doc of docs) {
        const next = applyUpdate(doc, update);
        await db.update({ _id: doc._id }, next, {});
      }
      return { acknowledged: true, matchedCount: docs.length, modifiedCount: docs.length };
    },
    async findOneAndUpdate(query, update, opts = {}) {
      const doc = await db.findOne(query);
      if (!doc) {
        if (opts.upsert) {
          const base = { _id: generateId() };
          const next = applyUpdate(base, update.$set ? update : { $set: update });
          if (query) {
            for (const [k, v] of Object.entries(query)) {
              if (!String(k).startsWith('$') && next[k] == null) next[k] = v;
            }
          }
          const inserted = await db.insert(next);
          return opts.new === false ? null : inserted;
        }
        return null;
      }
      const next = applyUpdate(doc, update);
      await db.update({ _id: doc._id }, next, {});
      return opts.new === false ? doc : next;
    },
    findByIdAndUpdate(id, update, opts = {}) {
      return Model.findOneAndUpdate({ _id: id }, update, opts);
    },
    async deleteOne(query) {
      const n = await db.remove(query || {}, { multi: false });
      return { acknowledged: true, deletedCount: n };
    },
    async deleteMany(query) {
      const n = await db.remove(query || {}, { multi: true });
      return { acknowledged: true, deletedCount: n };
    },
    async remove(query, opts = {}) {
      return db.remove(query || {}, { multi: !!opts.multi });
    },
    countDocuments(query = {}) { return db.count(query); },
    count(query = {}) { return db.count(query); },
    estimatedDocumentCount() { return db.count({}); },
    distinct(field, query = {}) {
      return db.find(query).then((docs) => {
        const seen = new Set();
        const out = [];
        for (const d of docs) {
          const v = getPath(d, field);
          const k = JSON.stringify(v);
          if (!seen.has(k)) {
            seen.add(k);
            out.push(v);
          }
        }
        return out;
      });
    },
    aggregate(pipeline) {
      const p = executeAggregate(db, pipeline);
      return {
        exec() { return p; },
        then(resolve, reject) { return p.then(resolve, reject); },
        catch(reject) { return p.catch(reject); }
      };
    },
    paginate(query, options) { return executePaginate(db, query, options); },
    async aggregatePaginate(pipeline, options = {}) {
      const all = await executeAggregate(db, pipeline);
      const page = Math.max(1, parseInt(options.page, 10) || 1);
      const limit = Math.max(1, parseInt(options.limit, 10) || 10);
      const skip = (page - 1) * limit;
      const docs = all.slice(skip, skip + limit);
      const totalDocs = all.length;
      const totalPages = Math.ceil(totalDocs / limit) || 1;
      return {
        docs,
        totalDocs,
        limit,
        page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      };
    },
    async exists(query) {
      const doc = await db.findOne(query || {});
      return doc ? { _id: doc._id } : null;
    },
    watch() {
      return { on() {}, close() {} };
    }
  };

  Model.prototype = {
    constructor: function OfflineDocument(doc) {
      return wrapDocument(doc, Model);
    }
  };

  function DocumentCtor(doc) {
    return wrapDocument(doc || {}, Model);
  }
  DocumentCtor.find = Model.find;
  Object.assign(DocumentCtor, Model);

  const exported = new Proxy(function OfflineModel(doc) {
    return wrapDocument(doc || {}, Model);
  }, {
    apply(_target, _thisArg, args) {
      return wrapDocument(args[0] || {}, Model);
    },
    construct(_target, args) {
      return wrapDocument(args[0] || {}, Model);
    },
    get(_target, prop) {
      if (prop in Model) return Model[prop];
      return undefined;
    }
  });

  modelRegistry[collectionName] = exported;
  if (options.modelName) modelRegistry[options.modelName] = exported;
  return exported;
}

function registerPopulate(pathName, ref, collection) {
  populatePaths[pathName] = { ref, collection };
}

function getModel(name) {
  return modelRegistry[name] || null;
}

async function compactAll() {
  for (const name of Object.keys(collections)) {
    try {
      await collections[name].compactDatafile();
    } catch (err) {
      console.warn(`[offline-db] compact ${name} failed:`, err.message);
    }
  }
}

module.exports = {
  createOfflineModel,
  getCollection,
  getModel,
  registerPopulate,
  generateId,
  compactAll,
  dataDir,
  isObjectIdLike
};
