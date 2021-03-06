/**
 * This source code is provided under the Apache 2.0 license and is provided
 * AS IS with no warranty or guarantee of fit for purpose. See the project's
 * LICENSE.md for details.
 * Copyright 2017 Thomson Reuters. All rights reserved.
 */

'use strict';

const path = require('path');
const childProcess = require('child_process');
const q = require('q');
const fs = require('fs-extra');
const jsonfile = require('jsonfile');
const mkdirp = require('mkdirp');
const winston = require('winston');
const git = require('simple-git');
const tools = require('./tools');

class Master {
  /**
   * Create a new Master instance
   * @param {object} conf - configuration object, see config folder
   */
  constructor(conf) {
    this.config = conf;
    this.logger = new winston.Logger({
      transports: [
        new (winston.transports.Console)({
          timestamp: true,
          colorize: true,
          level: 'silly',
        }),
        new (winston.transports.File)({
          timestamp: true,
          json: false,
          filename: `${conf.log}.${new Date().toISOString().replace(/:/g, '-')}`,
          level: 'silly',
        }),
      ],
    });
    this.summary = {
      top: [],
      cloned: [],
      updated: [],
      errors: [],
      conflicts: {},
    };
  }

  start(argv) {
    const commands = [];
    if (argv.c) {
      commands.push('clone');
    }
    if (argv.p) {
      commands.push('pull');
    }
    if (argv.i) {
      commands.push('install');
    }
    if (commands.length) {
      this.all(commands);
    } else {
      this.all(['clone', 'install']);
    }
  }

  title(txt) {
    this.logger.info('');
    this.logger.info('# -------------------------------------------------------- #');
    this.logger.info(`# ${txt}`);
    this.logger.info('# -------------------------------------------------------- #');
    this.logger.info('');
  }

  autoUpdate(options) {
    const that = this;
    if (!options) {
      options = {
        retries: 0,
        deferred: q.defer(),
      };
    }
    if (options.retries === 0) {
      that.logger.log('info', 'Auto updating CTA... Please wait');
    }
    const folder = path.resolve(__dirname, '..');
    git(folder)
      .pull((err, data) => {
        if (err) {
          if (err.indexOf('Could not read from remote repository') !== -1 && options.retries < 2) {
            options.retries += 1;
            that.logger.error(`Failed to pull CTA, retrying ${options.retries} time...`);
            return that.autoUpdate(options);
          }
          that.logger.error('Failed to pull CTA, aborting!');
          options.deferred.resolve(err);
        } else {
          if (data.summary.changes > 0) {
            that.logger.info('Changes: ', data);
            that.logger.info('Changes detected on CTA, please run "npm install" again');
          } else {
            that.logger.info('No changes detected');
          }
          options.deferred.resolve(data.summary.changes > 0);
        }
      });
    return options.deferred.promise;
  }

  /**
   * Init working directory
   * @return {object} - promise
   */
  init() {
    // return Promise.resolve();
    const that = this;
    const deferred = q.defer();
    that.title('Init sources Directory...');
    that.logger.info(`Sources directory is: ${that.config.sources}`);
    try {
      const sourcesExists = tools.exists(that.config.sources);
      if (sourcesExists) {
        that.logger.info('Sources directory already exists');
      } else {
        mkdirp.sync(that.config.sources);
        that.logger.info('Created sources directory');
      }
      that.logger.info(`Packages directory is: ${that.config.packages}`);
      const packagesExists = tools.exists(that.config.packages);
      if (packagesExists) {
        that.logger.info('Packages directory already exists');
      } else {
        mkdirp.sync(that.config.packages);
        that.logger.info('Created packages directory');
      }
      const eslintDestination = path.resolve(that.config.sources, '.eslintrc');
      const eslintSource = path.resolve(__dirname, '..', '.eslintrc');
      fs.createReadStream(eslintSource).pipe(fs.createWriteStream(eslintDestination));
      that.logger.info(`Created/updated eslint in ${eslintDestination}`);
      that.summary.top.push(`Sources directory: ${that.config.sources}`);
      deferred.resolve();
    } catch (e) {
      deferred.reject(e);
      that.logger.info(`Can't create directory ${that.config.sources}`);
      that.logger.info(e);
      process.exit(0);
    }
    return deferred.promise;
  }

  /**
   * git clone project to working directory
   * @param {object} project - project name
   * @param {object} options - options
   * @param {retries} options.retries - current retry iteration in case it can't read from remote
   * @return {object} - promise
   * */
  clone(project, options) {
    // return Promise.resolve();
    const that = this;
    const deferred = q.defer();
    try {
      if (!options) {
        options = {
          retries: 0,
          deferred,
        };
      }
      if (options.retries === 0) {
        that.logger.info(`Cloning ${project}... Please wait`);
      }
      git(that.config.sources)
      .clone(that.config.repositories[project], project, (err, data) => {
        if (err) {
          if (err.indexOf('already exists and is not an empty directory') !== -1) {
            that.logger.info(`${project} already cloned, updating instead...`);
            return that.pull(project, { retries: 0, deferred: options.deferred });
          } else if (options.retries < 2) {
            options.retries += 1;
            // that.logger.error(err);
            that.logger.error(`Failed to clone ${project}, retrying ${options.retries} time...`);
            return that.clone(project, options);
          }
          that.logger.error(`Failed to clone ${project}, aborting!`);
          that.summary.errors.push(`Failed to clone ${project}`);
          options.deferred.resolve({ cloned: false, error: err });
        } else {
          that.summary.cloned.push(project);
          that.logger.info('done. ', data);
          options.deferred.resolve({ cloned: true, data });
        }
      });
    } catch (e) {
      deferred.reject(e.message);
    }
    return deferred.promise;
  }

  /**
   * git pull project
   * @param {object} project - project name
   * @param {object} options - options
   * @param {retries} options.retries - current retry iteration in case it can't read from remote
   * @return {object} - promise
   * */
  pull(project, options) {
    // return Promise.resolve();
    const that = this;
    const deferred = q.defer();
    try {
      if (!options) {
        options = {
          retries: 0,
          deferred,
        };
      }
      if (options.retries === 0) {
        that.logger.info(`Updating ${project}... Please wait`);
      }
      const folder = path.join(that.config.sources, project);
      git(folder)
        .pull((err, data) => {
          if (err) {
            if (err.indexOf('Could not read from remote repository') !== -1 && options.retries < 2) {
              options.retries += 1;
              // that.logger.error(err);
              that.logger.error(`Failed to pull ${project}, retrying ${options.retries} time...`);
              return that.pull(project, options);
            }
            that.logger.error(`Failed to pull ${project}, aborting!`);
            that.summary.errors.push(`Failed to pull ${project}`);
            options.deferred.resolve(err);
          } else {
            if (data.summary.changes > 0) {
              that.summary.updated.push(project);
              that.logger.info('Changes: ', data);
            } else {
              that.logger.info('No changes detected');
            }
            options.deferred.resolve(data);
          }
        });
    } catch (e) {
      deferred.reject(e);
    }
    return deferred.promise;
  }

  /**
   * npm install cta repositories vendor node modules in same packages directory
   * @return {object} - promise
   * */
  install() {
    const that = this;
    const deferred = q.defer();
    try {
      const ctaPkgSourceName = path.resolve(__dirname, '..', 'package.json');
      const ctaPkgBackupName = path.resolve(__dirname, '..', 'package.backup.json');
      const ctaPkgDestName = path.resolve(that.config.root, 'package.json');
      const ctaPkgInstalledName = path.resolve(that.config.root, 'package.installed.json');
      // backup
      fs.copySync(ctaPkgSourceName, ctaPkgBackupName);

      const ctaPkg = jsonfile.readFileSync(ctaPkgSourceName);
      ctaPkg.scripts = {};
      ctaPkg.devDependencies = {};
      ctaPkg.dependencies = {};
      // collecting npm dependencies of all projects
      Object.keys(that.config.repositories).forEach((repoName) => {
        const repoPkgName = path.resolve(that.config.sources, repoName, 'package.json');
        const repoPkg = jsonfile.readFileSync(repoPkgName);
        ['dependencies', 'devDependencies'].forEach(function (element) {
          const dependencies = repoPkg[element];
          if (!dependencies) {
            return;
          }
          Object.keys(dependencies).forEach((dependency) => {
            // if it is not cta dependency
            if (dependency.indexOf(that.config.prefix) !== 0) {
              const version = dependencies[dependency];
              // is there a version conflict with the same dependency in another repo?
              const pkgVersion = `${repoName}: ${version}`;
              if (!(dependency in that.summary.conflicts)) {
                that.summary.conflicts[dependency] = [pkgVersion];
              }
              if (dependency in ctaPkg.dependencies && ctaPkg.dependencies[dependency] !== version) {
                // conflict, taking highest version
                const oldVersion = ctaPkg.dependencies[dependency].replace(/~|\^/g, '');
                const newVersion = version.replace(/~|\^/g, '');
                ctaPkg.dependencies[dependency] = oldVersion > newVersion ? oldVersion : newVersion;
                if (that.summary.conflicts[dependency].indexOf(pkgVersion) === -1) {
                  that.summary.conflicts[dependency].push(pkgVersion);
                }
              } else {
                ctaPkg.dependencies[dependency] = version;
              }
            }
          });
        });
      });
      // generating temporary file package.json with all projects dependencies
      jsonfile.writeFileSync(ctaPkgDestName, ctaPkg, { spaces: 2 }, function (err) {
        throw new Error(err);
      });
      // saving list of installed packages
      jsonfile.writeFileSync(ctaPkgInstalledName, ctaPkg, { spaces: 2 }, function (err) {
        throw new Error(err);
      });
      that.logger.info('Installing packages: ', Object.keys(ctaPkg.dependencies).sort().join(', '));
      process.chdir(that.config.root);
      const child = childProcess.exec('npm install');
      child.stdout.on('data', function (log) {
        that.logger.log('silly', log);
        if (log.indexOf('ERR!') !== -1) {
          that.summary.errors.push('Error with "npm install"');
        }
      });
      child.stderr.on('data', function (log) {
        that.logger.log('silly', log);
        if (log.indexOf('ERR!') !== -1) {
          that.summary.errors.push('Error with "npm install"');
        }
      });
      child.on('close', function () {
        // restore cta main package.json
        fs.copySync(ctaPkgBackupName, ctaPkgSourceName);
        fs.removeSync(ctaPkgBackupName);
        deferred.resolve();
      });
    } catch (e) {
      deferred.reject(e.message);
    }
    return deferred.promise;
  }

  all(commands) {
    const that = this;
    const deferred = q.defer();
    that.autoUpdate()
      .then((updated) => {
        if (updated === true) {
          process.exit(0);
        }
        return q(true);
      })
      .then(function () {
        return that.init();
      })
      .then(function () {
        if (commands.indexOf('clone') !== -1) {
          that.title('Cloning projects...');
          const promises = Object.keys(that.config.repositories).map(function (project) {
            return function () {
              return that.clone(project);
            };
          });
          return that.sequence(promises);
        } else {
          return q(true);
        }
      })
      .then(function () {
        if (commands.indexOf('pull') !== -1) {
          that.title('Updating projects...');
          const promises = Object.keys(that.config.repositories).map(function (project) {
            return function () {
              return that.pull(project);
            };
          });
          return that.sequence(promises);
        } else {
          return q(true);
        }
      })
      .then(function () {
        if (commands.indexOf('install') !== -1) {
          that.title('Installing packages...');
          return that.install();
        } else {
          return q(true);
        }
      })
      .catch(function (err) {
        that.logger.log('error', err);
        that.summary.errors.push(err);
      })
      .finally(function () {
        that.logger.info('');
        that.logger.info('# --------------------------------------------------------------- #');
        that.logger.info('# Finished.');
        that.summary.top.forEach((e) => {
          that.logger.info(`# ${e}`);
        });
        const cloned = that.summary.cloned.length > 0 ? that.summary.cloned.sort().join(', ') : 'none';
        that.logger.info(`# Cloned repositories (${that.summary.cloned.length}): ${cloned}`);
        const updated = that.summary.updated.length > 0 ? that.summary.updated.sort().join(', ') : 'none';
        that.logger.info(`# Updated repositories (${that.summary.updated.length}): ${updated}`);
        that.logger.info('# Packages versions conflicts :');
        Object.keys(that.summary.conflicts).forEach((dependency) => {
          const conflicts = that.summary.conflicts[dependency];
          if (conflicts.length > 1) {
            that.logger.warn(`Conflicts on package name "${dependency}":`, conflicts.join(', '));
          }
        });
        const errors = that.summary.errors.length > 0 ? that.summary.errors.length : 'none';
        that.logger.info(`# Errors: ${errors}`);
        let i = 1;
        that.summary.errors.forEach((e) => {
          that.logger.info(`# ${i}.`, e);
          i += 1;
        });
        that.logger.info('# See installed packages on file ./package.installed.json');
        that.logger.info('# For more details see log file in:');
        that.logger.info(`# ${that.config.log}`);
        that.logger.info('# --------------------------------------------------------------- #');
        that.logger.info('');
        deferred.resolve();
      });
    return deferred.promise;
  }

  sequence(promises) {
    return promises.reduce(q.when, q());
  }
}

module.exports = Master;
