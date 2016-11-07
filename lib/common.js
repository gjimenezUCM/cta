'use strict';
const fs = require('fs');
const path = require('path');
const config = require('../config');

module.exports = {
  isCtaDir: function(name) {
    return typeof name === 'string' && name.indexOf(config.prefix) === 0;
  },

  explore: function(base) {
    const that = this;
    return fs.readdirSync(base)
      .filter((dir) => {
        return fs.statSync(path.join(base, dir)).isDirectory() && that.isCtaDir(dir);
      });
  },

  exists(dir) {
    return new Promise((resolve, reject) => {
      try {
        fs.access(dir, (err) => {
          if (err) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  },

  isDir(dir) {
    let isDir = false;
    try {
      const stat = fs.statSync(dir);
      isDir = stat.isDirectory();
    } catch (e) {
      //console.log('common.isDir: ', e);
    }
    return isDir;
  },
};