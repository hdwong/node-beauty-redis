"use strict";
let core, config, logger, client = null,
    _ = require('lodash'), m = require('redis');

let serviceName = 'redis';
let redis = {
  assert: (error) => {
    if (error) {
      logger.error(error);
      throw '[' + serviceName + '] ' + error;
    }
  },
  init: (name, c, callback) => {
    serviceName = name;
    core = c;
    logger = core.getLogger(serviceName);
    config = core.getConfig(serviceName);
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
      throw 'Params is wrong';
    }
    client.get(req.query.key, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  },
  put_value: (req, res, next) => {
    if (!req.body || req.body.key === undefined || req.body.value === undefined) {
      throw 'Params is wrong';
    }
    let key = req.body.key, value = req.body.value,
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
    if (req.body.key === undefined) {
      throw 'Params is wrong';
    }
    let deleteKey = (key, callback) => {
      if (key.indexOf('*') >= 0) {
        client.keys(key, (error, keys) => {
          redis.assert(error);
          core.forEach(keys, (k, n) => {
            client.del(k, n);
          }, () => {
            callback(keys.length);
          });
        });
      } else {
        client.del(key, (error, value) => {
          redis.assert(error);
          callback(value ? 1 : 0);
        });
      }
    };
    if (_.isArray(req.body.key)) {
      let count = 0;
      core.forEach(req.body.key, (key, n) => {
        deleteKey(key, (value) => {
          count += value;
          n();
        });
      }, () => {
        next({ affected: count });
      });
    } else {
      deleteKey(req.body.key, (value) => {
        next({ affected: value });
      });
    }
  },
  put_incr: (req, res, next) => {
    if (req.body.key === undefined) {
      throw 'Params is wrong';
    }
    let increment = req.body && req.body.increment !== undefined &&
        req.body.increment.match(/^\d+$/) ?
        Math.max(1, parseInt(req.body.increment, 10)) : 1;
    client.incrby(req.body.key, increment, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  },
  command: (command, args, next) => {
    client.send_command(command, args, (error, value) => {
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
    if (req.body.command === undefined) {
      throw 'Params is wrong';
    }
    let args = req.body && req.body.arguments !== undefined ? req.body.arguments : [];
    if (!_.isArray(args)) {
      args = [ args ];
    }
    client.send_command(req.body.command, args, (error, value) => {
      redis.assert(error);
      next({ value: value });
    });
  }
};

module.exports = redis;
