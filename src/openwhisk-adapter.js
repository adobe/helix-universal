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
import querystring from 'querystring';
import { Request } from '@adobe/fetch';
import {
  cleanupHeaderValue, createDefaultLogger,
  ensureInvocationId,
  ensureUTF8Charset,
  isBinary,
  isBinaryType,
  updateProcessEnv,
} from './utils.js';

import { OpenwhiskResolver } from './resolver.js';

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
   * The universal adapter for openwhisk actions.
   * @param {object} params openwhisk action params.
   * @returns {*} openwhisk response
   */
  return async function openwhiskAdapter(params) {
    const {
      __ow_method: method = 'GET',
      __ow_headers: headers = {},
      __ow_path: suffix = '',
      __ow_body: rawBody = '',
      __ow_query: query = '',
      ...rest
    } = params;

    let body;
    if (!/^(GET|HEAD)$/i.test(method)) {
      body = isBinaryType(headers['content-type'])
        ? Buffer.from(rawBody, 'base64')
        : rawBody;
      // binaries and JSON (!) are base64 encoded
      if (/application\/json/.test(headers['content-type'])) {
        body = Buffer.from(rawBody, 'base64')
          .toString('utf-8');
      }
    }

    const env = { ...process.env };
    delete env.__OW_API_KEY;
    let host = env.__OW_API_HOST || 'https://localhost';
    if (typeof headers['x-forwarded-host'] === 'string') {
      host = `https://${headers['x-forwarded-host'].split(',')[0].trim()}`;
    }
    const url = new URL(`${host}/api/v1/web${process.env.__OW_ACTION_NAME}${suffix}`);

    // add query to params
    if (query) {
      Object.entries(querystring.parse(query))
        .forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
    }
    // add additional params for actions invoked via wsk
    Object.entries(rest)
      .forEach(([key, value]) => {
        if (key.match(/^[A-Z0-9_]+$/)) {
          env[key] = value;
        } else {
          url.searchParams.append(key, value);
        }
      });
    const request = new Request(url.toString(), {
      method,
      headers,
      body,
    });

    const fqn = process.env.__OW_ACTION_NAME;
    const segments = fqn.split('/');
    const [name, version] = segments.pop()
      .split('@');
    const packageName = segments.pop();

    const context = {
      resolver: new OpenwhiskResolver(params),
      pathInfo: {
        suffix,
      },
      runtime: {
        name: 'apache-openwhisk',
        region: process.env.__OW_REGION,
      },
      func: {
        name,
        version,
        package: packageName,
        app: process.env.__OW_NAMESPACE,
        fqn,
      },
      invocation: {
        id: process.env.__OW_ACTIVATION_ID,
        deadline: Number.parseInt(process.env.__OW_DEADLINE, 10),
        transactionId: headers['x-transaction-id'] || process.env.__OW_TRANSACTION_ID,
        requestId: headers['x-request-id'],
      },
      env,
      log: createDefaultLogger(),
    };

    updateProcessEnv(context);
    // create the `main` after the process.env is set. this gives the functions the ability to
    // use process.env in their global scopes.
    const main = await factory();

    const response = await main(request, context);
    ensureUTF8Charset(response);
    ensureInvocationId(response, context);

    const isBase64Encoded = isBinary(response.headers);
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: isBase64Encoded ? Buffer.from(await response.arrayBuffer())
        .toString('base64') : await response.text(),
    };
  };
}

export function wrap(adapter) {
  /**
   * Universal adapter for openwhisk actions
   * @param {*} params openwhisk params
   * @return {Promise<*>} openwhisk response
   */
  const wrapped = async (params) => {
    try {
      const ret = await adapter(params);
      // for web actions, add the `x-last-activation-id` header.
      // see https://github.com/adobe/helix-epsagon/issues/50
      // this is a temporary solution until a better sequence activation flow handling is provided
      // by I/O runtime.
      if (params.__ow_method) {
        ret.headers['x-last-activation-id'] = process.env.__OW_ACTIVATION_ID;
      }
      return ret;
    } catch (e) {
      if (e instanceof TypeError && e.code === 'ERR_INVALID_CHAR') {
        // eslint-disable-next-line no-console
        console.error('invalid request header', e.message);
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'text/plain',
            'x-invocation-id': process.env.__OW_ACTIVATION_ID,
          },
          body: e.message,
        };
      }
      // eslint-disable-next-line no-console
      console.error('error while invoking function', e);
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'text/plain',
          'x-invocation-id': process.env.__OW_ACTIVATION_ID,
          'x-error': cleanupHeaderValue(e.message),
        },
        body: 'Internal Server Error',
      };
    }
  };

  // allow to install a plugin
  wrapped.with = (plugin, options) => {
    const wrappedAdapter = plugin(adapter, options);
    return wrap(wrappedAdapter);
  };

  return wrapped;
}

export const openwhisk = wrap(createAdapter());

// create raw adapter for easier testing
openwhisk.raw = createAdapter();
