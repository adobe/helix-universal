/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { inspect } from 'util';

/**
 * Checks if the content type is binary.
 * @param {string} type - content type
 * @returns {boolean} {@code true} if content type is binary.
 */
export function isBinaryType(type) {
  if (!type) {
    return true;
  }
  if (type.indexOf(';') > 0) {
    // eslint-disable-next-line no-param-reassign
    [type] = type.split(';');
  }
  // eslint-disable-next-line no-use-before-define
  return !textTypes.has(type);
}

/**
 * Checks if the response is binary according to content-type or content-encoding.
 * @param {Map} headers response headers
 * @returns {boolean} {@code true} if response is binary.
 */
export function isBinary(headers) {
  // assume all encoding to be binary
  if (headers.get('content-encoding')) {
    return true;
  }

  return isBinaryType(headers.get('content-type'));
}

/**
 * Checks if the response content-type header contains an charset part.
 * If the type is text/html and has no charset part, it will be appended.
 * @param {Response} resp the response
 * @return {Response} the same response
 */
export function ensureUTF8Charset(resp) {
  if (!resp) {
    throw Error('unexpected response: undefined');
  }
  if (!resp.headers) {
    throw Error(`unexpected response: no headers. is: ${inspect(resp)}`);
  }
  if (typeof resp.headers.get !== 'function') {
    throw Error('response.headers has no method "get()"');
  }
  const type = resp.headers.get('content-type');
  if (!type) {
    resp.headers.set('content-type', 'text/plain; charset=utf-8');
  } else if (type === 'text/html') {
    resp.headers.set('content-type', 'text/html;charset=UTF-8');
  }
  return resp;
}

/**
 * Sets the 'x-invocation-id' to the response header it not already present.
 * @param {Response} resp the response
 * @param {UniversalContext} context the context
 * @return {Response} the same response
 */
export function ensureInvocationId(resp, context) {
  if (!resp.headers.has('x-invocation-id')) {
    resp.headers.set('x-invocation-id', context.invocation.id);
  }
  return resp;
}

/**
 * Updates the process environment with function information.
 * (note that we don't set the invocation id, since not all runtimes isolate the process env)
 * @param {UniversalContext} context The context
 */
export function updateProcessEnv(context) {
  process.env.HELIX_UNIVERSAL_RUNTIME = context.runtime.name;
  process.env.HELIX_UNIVERSAL_NAME = context.func.name;
  process.env.HELIX_UNIVERSAL_PACKAGE = context.func.package;
  process.env.HELIX_UNIVERSAL_APP = context.func.app;
  process.env.HELIX_UNIVERSAL_VERSION = context.func.version;
}

/**
 * Cleans up a header value by stripping invalid characters and truncating to 1024 chars
 * @param {string} value a header value
 * @returns a valid header value
 */
export function cleanupHeaderValue(value) {
  return value.replace(/[^\t\u0020-\u007E\u0080-\u00FF]/g, '').substr(0, 1024);
}

export const HEALTHCHECK_PATH = '/_status_check/healthcheck.json';

/**
 * Creates a default helix-log compatible console logger.
 * @returns {Logger}
 */
export function createDefaultLogger() {
  const log = {};
  ['log', 'silly:debug', 'trace:debug', 'debug', 'verbose:debug', 'info', 'warn', 'error', 'fatal:error']
    .forEach((m) => {
      const [k, v] = m.split(':');
      // eslint-disable-next-line no-console
      log[k] = console[v ?? k].bind(console);
    });
  return log;
}

/**
 * content types that openwhisk treats as text
 *
 * @see https://doc.akka.io/api/akka-http/10.1.11/akka/http/scaladsl/model/MediaTypes$.html
 */
const textTypes = new Set([
  'application/atom+xml',
  'application/base64',
  'application/javascript',
  'application/json',
  'application/json-patch+json',
  'application/merge-patch+json',
  'application/problem+json',
  'application/problem+xml',
  'application/rss+xml',
  'application/soap+xml',
  'application/vnd.api+json',
  'application/vnd.google-earth.kml+xml',
  'application/x-latex',
  'application/x-vrml',
  'application/x-www-form-urlencoded',
  'application/xhtml+xml',
  'application/xml',
  'application/xml-dtd',
  'text/asp',
  'text/cache-manifest',
  'text/calendar',
  'text/css',
  'text/csv',
  'text/event-stream',
  'text/html',
  'text/markdown',
  'text/mcf',
  'text/plain',
  'text/richtext',
  'text/tab-separated-values',
  'text/uri-list',
  'text/vnd.wap.wml',
  'text/vnd.wap.wmlscript',
  'text/x-asm',
  'text/x-c',
  'text/x-component',
  'text/x-h',
  'text/x-java-source',
  'text/x-pascal',
  'text/x-script',
  'text/x-scriptcsh',
  'text/x-scriptelisp',
  'text/x-scriptksh',
  'text/x-scriptlisp',
  'text/x-scriptperl',
  'text/x-scriptperl-module',
  'text/x-scriptphyton',
  'text/x-scriptrexx',
  'text/x-scriptscheme',
  'text/x-scriptsh',
  'text/x-scripttcl',
  'text/x-scripttcsh',
  'text/x-scriptzsh',
  'text/x-server-parsed-html',
  'text/x-setext',
  'text/x-sgml',
  'text/x-speech',
  'text/x-uuencode',
  'text/x-vcalendar',
  'text/x-vcard',
  'text/xml',
]);
