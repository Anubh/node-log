'use strict';

const bunyan = require('bunyan');
const  _ = require('lodash');
const jsonStringifySafe = require('json-stringify-safe');
const prettyStdout = require('./beautify_log/prettystdout');

class Logger {

  constructor( options = {}){
    let self = this;
    this.env = options.env || 'development';
    this.outputWays = options.outputWays || ['File', 'Stdout'];
    this.serviceName = options.serviceName || 'localhost';
    this.level = options.LEVEL || 'info';
    this.mode = options.MODE || 'short';
    this.path = options.log_path || '/home/ubuntu';
    this.streams = {};
    this.setSerializers();

    // Will add this change in sometime if needed.
    // if(this.domain === 'development')
    //   this.outputWays = options.outputWays || ['Stdout'];

    // ensure we have a trailing slash
    if (!this.path.match(/\/$|\\$/)) {
      this.path = this.path + '/';
    }

    this.rotation = {
      enabled: options.rotation.enabled || false,
      period: options.rotation.period || '6h',
      count: options.rotation.count
    };

    _.forEach(this.outputWays, function (outputWay) {
      self[`set${outputWay.slice(0, 1).toUpperCase()}${outputWay.slice(1)}Stream`]()
    });
  }

  removeSensitiveData(obj) {
    var newObj = {};

    _.forEach(obj, function (value, key) {
      try {
        if (_.isObject(value)) {
          value = this.removeSensitiveData(value);
        }

        if (!key.match(/password|authorization|cookie|pin/gi)) {
          newObj[key] = value;
        }
      } catch (err) {
        newObj[key] = value;
      }
    });

    return newObj;
  }

  setSerializers() {
    let self = this;

    this.serializers = {
      req: function (req) {
        return {
          meta: {
            requestId: req.requestId,
            userId: req.userId
          },
          url: req.url,
          method: req.method,
          originalUrl: req.originalUrl,
          params: req.params,
          headers: self.removeSensitiveData(req.headers),
          body: self.removeSensitiveData(req.body),
          query: self.removeSensitiveData(req.query)
        };
      },
      res: function (res) {
        return {
          _headers: self.removeSensitiveData(res._headers),
          statusCode: res.statusCode,
          responseTime: res.responseTime
        };
      },
      err: function (err) {
        return {
          id: err.id,
          code: err.code,
          name: err.errorType,
          statusCode: err.statusCode,
          level: err.level,
          message: err.message,
          context: err.context,
          help: err.help,
          stack: err.stack,
          hideStack: err.hideStack
        };
      }
    };
  }

  setStdoutStream() {
    const prettyStdOut = new prettyStdout({ mode: this.mode });

    prettyStdOut.pipe(process.stdout);

    this.streams.stdout = {
      name: 'stdout',
      log: bunyan.createLogger({
        name: 'Log',
        streams: [{
          type: 'raw',
          stream: prettyStdOut,
          level: this.level
        }],
        serializers: this.serializers
      })
    };
  }

  setFileStream() {

    this.streams['file-errors'] = {
      name: 'file',
      log: bunyan.createLogger({
        name: 'Log',
        streams: [{
          path: `${this.path}${this.domain}_${this.env}.error.log`,
          level: 'error'
        }],
        serializers: this.serializers
      })
    };

    this.streams['file-all'] = {
      name: 'file',
      log: bunyan.createLogger({
        name: 'Log',
        streams: [{
          path: `${this.path}${this.domain}_${this.env}.log`,
          level: this.level
        }],
        serializers: this.serializers
      })
    };

    if (this.rotation.enabled) {
      this.streams['rotation-errors'] = {
        name: 'rotation-errors',
        log: bunyan.createLogger({
          name: 'Log',
          streams: [{
            type: 'rotating-file',
            path: `${this.path}${this.domain}_${this.env}.error.log`,
            period: this.rotation.period,
            count: this.rotation.count,
            level: this.level
          }],
          serializers: this.serializers
        })
      };

      this.streams['rotation-all'] = {
        name: 'rotation-all',
        log: bunyan.createLogger({
          name: 'Log',
          streams: [{
            type: 'rotating-file',
            path: `${this.path}${this.domain}_.log`,
            period: this.rotation.period,
            count: this.rotation.count,
            level: this.level
          }],
          serializers: this.serializers
        })
      }
    }
  }

  log(type, args) {
    let self = this;
    let modifiedArguments;

    _.forEach(args, function (value) {
      if (value instanceof Error) {
        if (!modifiedArguments) {
          modifiedArguments = {};
        }

        modifiedArguments.err = value;
      } else if (_.isObject(value)) {
        if (!modifiedArguments) {
          modifiedArguments = {};
        }

        let keys = Object.keys(value);
        _.forEach(keys, function (key) {
          modifiedArguments[key] = value[key];
        });
      } else {
        if (!modifiedArguments) {
          modifiedArguments = '';
        }

        modifiedArguments += value;
        modifiedArguments += ' ';
      }
    });

    _.forEach(self.streams, function (logger) {
      if (logger.match) {
        if (new RegExp(logger.match).test(jsonStringifySafe(modifiedArguments).replace(/"/g, ''))) {
          logger.log[type](modifiedArguments);
        }
      } else {
        logger.log[type](modifiedArguments);
      }
    });
  }

  info(){
    this.log('info', arguments);
  }

  warn(){
    this.log('warn', arguments);
  }

  error(){
    this.log('error', arguments);
  }

}

module.exports = Logger;