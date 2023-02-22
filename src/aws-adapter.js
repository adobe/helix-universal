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
  cleanupHeaderValue,
  createDefaultLogger,
  ensureInvocationId,
  ensureUTF8Charset,
  isBinary,
  updateProcessEnv,
} from './utils.js';

import awsSecretsPlugin from './aws-secrets.js';
import { AWSResolver } from './resolver.js';
import { AWSStorage } from './aws-storage.js';

/**
 * Given an event, builds a query string out of the string-valued properties of
 * the event.
 *
 * @param event AWS event
 * @returns query string
 */
function eventToQueryString(event) {
  const searchParams = new URLSearchParams();
  Object.getOwnPropertyNames(event).forEach((name) => {
    const value = event[name];
    if (typeof value === 'string') {
      searchParams.append(name, value);
    }
  });
  return searchParams.toString();
}

/**
 * Given a raw headers object, returns an object containing single and multivalued
 * headers, separately.
 *
 * @param raw raw headers object
 * @returns object containing a property 'headers' and a property 'multiValueHeaders'
 */
function splitHeaders(raw) {
  const headers = {};
  const multiValueHeaders = {};

  Object.entries(raw).forEach(([name, value]) => {
    if (Array.isArray(value)) {
      multiValueHeaders[name] = value;
    } else {
      headers[name] = value;
    }
  });
  return {
    headers,
    multiValueHeaders,
  };
}

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
   * The raw universal adapter for lambda functions
   * @param {object} event AWS Lambda event
   * @param {object} context AWS Lambda context
   * @returns {*} lambda response
   */
  return async function lambdaAdapter(event, context) {
    const nonHttp = (!event.requestContext);

    try {
      // add cookie header if missing
      const { headers = {} } = event;
      if (!headers.cookie && event.cookies) {
        headers.cookie = event.cookies.join(';');
      }

      const host = event.requestContext?.domainName;
      const method = event.requestContext?.http?.method;
      const requestBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;
      const path = event.rawPath ?? '';
      const queryString = nonHttp ? eventToQueryString(event) : event.rawQueryString || '';

      if (method && ['GET', 'HEAD'].includes(method.toUpperCase()) && requestBody) {
        return {
          statusCode: 400,
          headers: {
            'content-type': 'text/plain',
            'x-error': 'Request with GET/HEAD method cannot have body',
            'x-invocation-id': context.awsRequestId,
          },
          body: '',
        };
      }

      const request = new Request(`https://${host}${path}${queryString ? '?' : ''}${queryString}`, {
        method,
        headers,
        body: requestBody,
      });

      // parse ARN
      //   arn:partition:service:region:account-id:resource-type:resource-id
      //   eg: arn:aws:lambda:us-east-1:118435662149:function:dump:4_2_1
      const [/* 'arn' */, /* 'aws' */, /* 'lambda' */,
        region,
        accountId, /* 'function' */,
        functionName,
        functionAlias = '$LATEST',
      ] = context.invokedFunctionArn.split(':');
      const [packageName, name] = functionName.split('--');

      const con = {
        resolver: new AWSResolver(event),
        pathInfo: {
          suffix: event.pathParameters?.path ? `/${event.pathParameters.path}` : '',
        },
        runtime: {
          name: 'aws-lambda',
          region,
          accountId,
        },
        func: {
          name,
          package: packageName,
          version: functionAlias.replace(/_/g, '.'),
          fqn: context.invokedFunctionArn,
          app: event.requestContext?.apiId ?? `aws-${accountId}`,
        },
        invocation: {
          id: context.awsRequestId,
          deadline: Date.now() + context.getRemainingTimeInMillis(),
          transactionId: request.headers.get('x-transaction-id') || request.headers.get('x-amzn-trace-id'),
          requestId: event.requestContext?.requestId,
          event,
        },
        env: {
          ...process.env,
        },
        storage: AWSStorage,
        log: createDefaultLogger(),
      };

      // support for Amazon SQS, remember records passed by trigger
      if (event.Records) {
        con.records = event.Records;
      }

      updateProcessEnv(con);
      // create the `main` after the process.env is set. this gives the functions the ability to
      // use process.env in their global scopes.
      const main = await factory();

      const response = await main(request, con);
      ensureUTF8Charset(response);
      ensureInvocationId(response, con);

      // flush log if present
      if (con.log && con.log.flush) {
        await con.log.flush();
      }

      if (nonHttp) {
        // directly return response body
        if (response.headers.get('content-type') === 'application/json') {
          return await response.json();
        }
        return await response.text();
      }

      const isBase64Encoded = isBinary(response.headers);
      const body = isBase64Encoded ? Buffer.from(await response.arrayBuffer())
        .toString('base64') : await response.text();

      return {
        statusCode: response.status,
        ...splitHeaders(response.headers.raw()),
        isBase64Encoded,
        body,
      };
    } catch (e) {
      if (e instanceof TypeError && e.code === 'ERR_INVALID_CHAR') {
        // eslint-disable-next-line no-console
        console.error('invalid request header', e.message);
        return {
          statusCode: 400,
          headers: {
            'content-type': 'text/plain',
            'x-invocation-id': context.awsRequestId,
          },
          body: e.message,
        };
      }
      // eslint-disable-next-line no-console
      console.error('error while invoking function', e);
      if (nonHttp) {
        // let caller see the exception thrown
        throw e;
      }
      return {
        statusCode: 500,
        headers: {
          'content-type': 'text/plain',
          'x-error': cleanupHeaderValue(e.message),
          'x-invocation-id': context.awsRequestId,
        },
        body: e.message,
      };
    }
  };
}

export function wrap(adapter) {
  const wrapped = async (evt, ctx) => {
    try {
      // intentional await to catch errors
      return await adapter(evt, ctx);
    } catch (e) {
      if (!evt.requestContext) {
        // let caller see the exception thrown
        throw e;
      }
      return {
        statusCode: e.statusCode || 500,
        headers: {
          'content-type': 'text/plain',
          'x-error': cleanupHeaderValue(e.message),
          'x-invocation-id': ctx.awsRequestId,
        },
        body: e.message,
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

// default export contains the aws secrets plugin
export const lambda = wrap(createAdapter()).with(awsSecretsPlugin);

// create raw adapter for easier testing
lambda.raw = createAdapter();
