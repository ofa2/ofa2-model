'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var mongoose = _interopDefault(require('mongoose'));
var _ = _interopDefault(require('lodash'));
var fs = _interopDefault(require('fs'));
var mongodbUri = _interopDefault(require('mongodb-uri'));
var pathUtil = _interopDefault(require('path'));
var Promise = _interopDefault(require('bluebird'));

/* eslint-disable global-require, import/no-dynamic-require */
const {
  Schema
} = mongoose;

function composeMongodbConnectionString(config) {
  return mongodbUri.format(config);
}

function lift(done) {
  let self = this;
  let modelsConfig = self.config.models;
  let defaultConnectionName = modelsConfig.connection; // custom Promise

  if (modelsConfig.Promise) {
    mongoose.Promise = modelsConfig.Promise;
  } // expose mongoose schema types


  global.ObjectId = Schema.Types.ObjectId;
  global.Mixed = Schema.Types.Mixed;
  global.ObjectID = mongoose.mongo.ObjectID;
  self.config.paths.models = pathUtil.resolve(self.config.paths.projectPath, 'models');
  let modelsPath = self.config.paths.models;
  let readdirAsync = Promise.promisify(fs.readdir);
  let statAsync = Promise.promisify(fs.stat);
  readdirAsync(modelsPath).then(fileNames => {
    let filePaths = _.map(fileNames, fileName => {
      return pathUtil.join(modelsPath, fileName);
    });

    return [fileNames, filePaths, Promise.map(filePaths, filePath => {
      let extname = pathUtil.extname(filePath);

      if (extname !== '.js') {
        return null;
      }

      return statAsync(filePath);
    })];
  }).spread((fileNames, filePaths, fileStats) => {
    let connections = {};
    let models = {}; // get model definitions and connection definitions

    _.each(fileNames, (fileName, index) => {
      let stat = fileStats[index];

      if (!stat || !stat.isFile()) {
        return;
      }

      let filePath = filePaths[index];

      let model = require(filePath);

      if (model.default) {
        model = model.default;
      }

      let modelName = pathUtil.basename(fileName, '.js');
      models[modelName] = model;
      model.options = model.options || {}; // cache connection config

      model.options.connection = model.options.connection || defaultConnectionName;
      let connectionName = model.options.connection;
      let connectionConfig = self.config.connections[connectionName];

      if (!connectionConfig) {
        throw new Error(`cannot find connection config for ${connectionName}`);
      }

      connections[connectionName] = connectionConfig;
    }); // specify native query promise type


    let connectionOptions = {
      config: {
        autoIndex: typeof modelsConfig.autoIndex === 'undefined' ? true : !!modelsConfig.autoIndex
      }
    };

    if (modelsConfig.Promise) {
      connectionOptions.promiseLibrary = modelsConfig.Promise;
    }

    if (modelsConfig.mongos) {
      connectionOptions.mongos = true;
    } // create used connections


    connections = _.mapValues(connections, connectionConfig => {
      let options = _.clone(connectionOptions);

      return mongoose.createConnection(composeMongodbConnectionString(connectionConfig), options);
    });
    models = _.mapValues(models, (model, modelName) => {
      model.options.collection = model.options.collection || modelName.toLowerCase();

      let options = _.extend({
        timestamps: true
      }, model.options);

      delete options.connection;
      let schema = new Schema(model.attributes, options);

      if (model.schemaInitializer) {
        model.schemaInitializer(schema);
      }

      let connectionName = model.options.connection || defaultConnectionName;
      return connections[connectionName].model(modelName, schema);
    });
    self.models = models;

    _.extend(global, self.models);

    return null;
  }).then(_.ary(done, 0)).catch(done);
}

function lower(done) {
  mongoose.disconnect(done);
}

var index = {
  lift: Promise.promisify(lift),
  lower: Promise.promisify(lower)
};

module.exports = index;
//# sourceMappingURL=bundle.cjs.js.map
