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
/* eslint-disable no-param-reassign, no-underscore-dangle, import/no-extraneous-dependencies */
import { Request } from '@adobe/fetch';
import {
  cleanupHeaderValue, createDefaultLogger,
  ensureInvocationId,
  ensureUTF8Charset,
  isBinary,
  updateProcessEnv,
} from './utils.js';

import googleSecretsPlugin from './google-secrets.js';
import { GoogleResolver } from './resolver.js';
import { GoogleStorage } from './google-storage.js';

/**
 * Creates a universal adapter for google cloud functions.
 * @param {function} opts.factory the factory for the main function. defaults to dynamic import
 * @param {object} opts options
 */
export function createAdapter(opts = {}) {
  let { factory } = opts;
  if (!factory) {
    factory = async () => (await import('./main.js')).main;
  }

  /**
   * Universal adapter for google cloud functions.
   * @param {*} req express request
   * @param {*} res express response
   */
  return async function googleAdapter(req, res) {
    try {
      const request = new Request(`https://${req.hostname}/${process.env.K_SERVICE}${req.originalUrl}`, {
        method: req.method,
        headers: req.headers,
        // google magically does the right thing here
        body: req.rawBody,
      });

      const [subdomain] = req.headers.host.split('.');
      const [country, region, ...servicename] = subdomain.split('-');
      const [packageName, name] = process.env.K_SERVICE.split('--');

      const context = {
        resolver: new GoogleResolver(req),
        pathInfo: {
          // original: /foo?hey=bar
          suffix: req.originalUrl.replace(/\?.*/, ''),
        },
        runtime: {
          name: 'googlecloud-functions',
          region: `${country}-${region}`,
        },
        func: {
          name,
          package: packageName,
          version: process.env.K_REVISION,
          fqn: process.env.K_SERVICE,
          app: servicename.join('-'),
        },
        invocation: {
          id: req.headers['function-execution-id'],
          deadline: Number.parseInt(req.headers['x-appengine-timeout-ms'], 10) + Date.now(),
          transactionId: request.headers.get('x-transaction-id'),
          requestId: request.headers.get('x-cloud-trace-context'),
        },
        env: {
          ...process.env,
        },
        log: createDefaultLogger(),
        storage: GoogleStorage,
      };

      updateProcessEnv(context);
      // create the `main` after the process.env is set. this gives the functions the ability to
      // use process.env in their global scopes.
      const main = await factory();

      const response = await main(request, context);
      ensureUTF8Charset(response);
      ensureInvocationId(response, context);

      const body = isBinary(response.headers)
        ? Buffer.from(await response.arrayBuffer())
        : await response.text();
      Array.from(response.headers.entries())
        .reduce((r, [header, value]) => r.set(header, value), res.status(response.status))
        .send(body);
    } catch (e) {
      if (e instanceof TypeError && e.code === 'ERR_INVALID_CHAR') {
        // eslint-disable-next-line no-console
        console.error('invalid request header', e.message);
        res.status(400).send(e.message);
        return;
      }
      // eslint-disable-next-line no-console
      console.error('error while invoking function', e);
      res
        .status(500)
        .set('content-type', 'text/plain')
        .set('x-invocation-id', req.headers['function-execution-id'])
        .set('x-error', cleanupHeaderValue(e.message))
        .send(e.message);
    }
  };
}

// export 'wrap' so it can be used like: `google.wrap(google.raw).with(epsagon).with(secrets);
export function wrap(adapter) {
  /**
   * Universal adapter for google cloud functions.
   * @param {*} req express request
   * @param {*} res express response
   */
  const wrapped = async (req, res) => {
    try {
      // intentional await to catch errors
      await adapter(req, res);
    } catch (e) {
      res
        .status(e.statusCode || 500)
        .set('content-type', 'text/plain')
        .set('x-invocation-id', req.headers['function-execution-id'])
        .set('x-error', cleanupHeaderValue(e.message))
        .send(e.message);
    }
  };

  // allow to install a plugin
  wrapped.with = (plugin, options) => {
    const wrappedAdapter = plugin(adapter, options);
    return wrap(wrappedAdapter);
  };

  return wrapped;
}

// default export contains the aws secrets plugin
export const google = wrap(createAdapter()).with(googleSecretsPlugin);

// create raw adapter for easier testing
google.raw = createAdapter();
