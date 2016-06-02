"use strict";
let core, config, logger, client = null,
    _ = require('lodash'), m = require('redis');
let redis = {
  assert: (error) => {
    if (error) {
      logger.error(error);
      throw '[redis] ' + error;
    }
  },
  init: (c, callback) => {
    core = c;
    logger = core.getLogger('redis');
    config = core.getConfig('redis');
    if (!config.enable_api) {
      // disable api
      delete redis.get_keys;
      delete redis.get_value;
      delete redis.post_command;
      delete redis.put_value;
      delete redis.put_incr;
      delete redis.delete_value;
    }
    let options = {};
    if (config.password) {
      options.auth_pass = config.password;
    }
    client = m.createClient(config.port || 6379, config.host || '127.0.0.1', options);
    client.on('error', redis.assert);
    client.on('connect', callback);
  },
  uninit: () => {
    if (client) {
      client.quit();
    }
  },
  getClient: () => client,
  get_keys: (req, res, next) => {
    let key = req.query.key || '*';
    client.keys(key, (error, keys) => {
      redis.assert(error);
      next({ keys: keys });
    });
  },
  get_value: (req, res, next) => {
    if (req.query.key === undefined) {
      throw 'Params is wrong.';
    }
    client.get(req.query.key, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  },
  put_value: (req, res, next) => {
    if (req.query.key === undefined || !req.body || req.body.value === undefined) {
      throw 'Params is wrong.';
    }
    let key = req.query.key, value = req.body.value,
        ex = req.body.ex !== undefined && req.body.ex.match(/^\d+$/) ?
            parseInt(req.body.ex, 10) : false;
    if (ex) {
      client.setex(key, ex, value, (error) => {
        redis.assert(error);
        next({ affected: 1 });
      });
    } else {
      client.set(key, value, (error) => {
        redis.assert(error);
        next({ affected: 1 });
      });
    }
  },
  delete_value: (req, res, next) => {
    if (req.query.key === undefined) {
      throw 'Params is wrong.';
    }
    client.keys(req.query.key, (error, keys) => {
      redis.assert(error);
      if (keys.length) {
        client.del(keys, (error, value) => {
          redis.assert(error);
          next({ affected: value });
        });
      } else {
        next({ affected: 0 });
      }
    });
  },
  put_incr: (req, res, next) => {
    if (req.query.key === undefined) {
      throw 'Params is wrong.';
    }
    let increment = req.body && req.body.increment !== undefined &&
        req.body.increment.match(/^\d+$/) ?
        Math.max(1, parseInt(req.body.increment, 10)) : 1;
    client.incrby(req.query.key, increment, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  },
  command: (command, args, next) => {
    client.send_command(command, args, (error, value) {
      if (error) {
        // log only
        logger.error(error);
        value = false;
      }
      if (typeof next === 'function') {
        next(value);
      }
    });
  },
  post_command: (req, res, next) => {
    if (req.query.command === undefined) {
      throw 'Params is wrong.';
    }
    let args = req.body && req.body.arguments !== undefined ?
        req.body.arguments : [];
    if (!_.isArray(args)) {
      args = [ args ];
    }
    client.send_command(req.query.command, args, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  }
};

module.exports = redis;
