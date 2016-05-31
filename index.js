var core, config, logger, client, _ = require('lodash'),
    m = require('redis');
var redis = {
  assert: function(error) {
    if (error) {
      logger.error(error);
      throw '[redis] ' + error;
    }
  },
  init: function(c, callback) {
    core = c;
    // logger = core.getLogger('redis');
    config = core.getConfig('redis');
    var options = {};
    if (config.password) {
      options.auth_pass = config.password;
    }
    client = m.createClient(
      config.port || 6379,
      config.host || '127.0.0.1',
      options
    );
    client.on('error', redis.assert);
    client.on('connect', function() {
      callback();
    });
  },
  uninit: function() {
    if (client) {
      client.quit();
    }
  },
  getClient: function() {
    if (client) {
      return client;
    }
    return false;
  },
  get_keys: function(req, res, next) {
    var key = req.query.key || '*';
    client.keys(key, function(error, keys) {
      redis.assert(error);
      next({ keys: keys });
    });
  },
  get_value: function(req, res, next) {
    if (req.query.key === undefined) {
      throw '参数错误';
    }
    client.get(req.query.key, function(error, value) {
      redis.assert(error);
      next({ value: value });
    });
  },
  put_value: function(req, res, next) {
    if (req.query.key === undefined || !req.body || req.body.value === undefined) {
      throw '参数错误';
    }
    var key = req.query.key, value = req.body.value,
        ex = req.body.ex !== undefined && req.body.ex.match(/^\d+$/) ?
            parseInt(req.body.ex, 10) : false;
    if (ex) {
      client.setex(key, ex, value, function(error) {
        redis.assert(error);
        next({ affected: 1 });
      });
    } else {
      client.set(key, value, function(error) {
        redis.assert(error);
        next({ affected: 1 });
      });
    }
  },
  delete_value: function(req, res, next) {
    if (req.query.key === undefined) {
      throw '参数错误';
    }
    client.keys(req.query.key, function(error, keys) {
      redis.assert(error);
      if (keys.length) {
        client.del(keys, function(error, value) {
          redis.assert(error);
          next({ affected: value });
        });
      } else {
        next({ affected: 0 });
      }
    });
  },
  put_incr: function(req, res, next) {
    if (req.query.key === undefined) {
      throw '参数错误';
    }
    var increment = req.body && req.body.increment !== undefined &&
        req.body.increment.match(/^\d+$/) ?
        Math.max(1, parseInt(req.body.increment, 10)) : 1;
    client.incrby(req.query.key, increment, function(error, value) {
      redis.assert(error);
      next({ value: value });
    });
  },
  command: function(command, args, next) {
    client.send_command(command, args, function(error, value) {
      // TODO 仅 log
      if (error) {
        logger.error(error);
        value = false;
      }
      if (typeof next === 'function') {
        next(value);
      }
    });
  },
  post_command: function(req, res, next) {
    if (req.query.command === undefined) {
      throw '参数错误';
    }
    var args = req.body && req.body.arguments !== undefined ?
        req.body.arguments : [];
    if (!_.isArray(args)) {
      args = [ args ];
    }
    client.send_command(req.query.command, args, function(error, value) {
      redis.assert(error);
      next({ value: value });
    });
  }
};

module.exports = redis;
