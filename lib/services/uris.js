'use strict';

const _ = require('lodash'),
  buf = require('./buffer'),
  db = require('./db'),
  references = require('./references'),
  { getPrefix } = require('clayutils'),
  notifications = require('./notifications'),
  siteService = require('./sites'),
  plugins = require('../plugins'),
  bus = require('./bus');

/**
 * @param {string} uri
 * @returns {Promise}
 */
function get(uri) {
  return db.get(uri);
}

/**
 * @param {string} uri
 * @param {string} body
 * @returns {Promise}
 */
function put(uri, body) {
  if (uri === body) {
    throw new Error('Client: Cannot point uri at itself');
  }

  if (_.includes(body, '"') || _.includes(body, '\'')) {
    throw new Error('Client: Destination cannot contain quotes');
  }

  if (references.isPropagatingVersion(body)) {
    throw new Error('Client: Cannot point uri at propagating version, such as @published');
  }

  return db.put(uri, body).return(body);
}

/**
 * Deletes a URI
 *
 * NOTE: Return the data it used to contain.  This is often used to create queues or messaging on the client-side,
 * because clients can guarantee that only one client was allowed to be the last one to fetch a particular item.
 *
 * @param {string} uri
 * @param {object} user
 * @returns {Promise}
 */
function del(uri, user) {
  return get(uri).then(function (oldData) {
    return db.del(uri).then(function () {
      const prefix = getPrefix(uri),
        site = siteService.getSiteFromPrefix(prefix),
        pageUrl = buf.decode(uri.split('/').pop()),
        obj = { uri: oldData, url: pageUrl, user: user };

      // TODO: Clean this up in v7
      // Call the unpublish hook for plugins
      plugins.executeHook('unpublish', { url: pageUrl, uri: oldData });
      plugins.executeHook('unpublishPage', obj);
      bus.publish('unpublishPage', JSON.stringify(obj));

      notifications.notify(site, 'unpublished', { url: pageUrl, uri: oldData });
    }).return(oldData);
  });
}

module.exports.get = get;
module.exports.put = put;
module.exports.del = del;
