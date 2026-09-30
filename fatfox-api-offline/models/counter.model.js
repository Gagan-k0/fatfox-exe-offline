'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

const Counter = createOfflineModel('counters', {}, {
  modelName: 'counter'
});

Counter.getNextSequence = async function getNextSequence(key) {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return doc.seq;
};

module.exports = Counter;
