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
const { Request } = require('@adobe/helix-fetch');
const { epsagon } = require('@adobe/helix-epsagon');
const {
  isBinary, ensureUTF8Charset, ensureInvocationId, updateProcessEnv, HEALTHCHECK_PATH,
  cleanupHeaderValue,
} = require('./utils.js');
const getAWSSecrets = require('./aws-package-params.js');
const { AWSResolver } = require('./resolver.js');
const { AWSStorage } = require('./aws-storage');

/**
 * The (inner) universal adapter for lambda functions with the secrets already retrieved
 * @param {object} event AWS Lambda event
 * @param {object} context AWS Lambda context
 * @param {object} secrets AWS secrets
 * @returns {*} lambda response
 */
async function lambdaAdapter(event, context, secrets = {}) {
  try {
    const request = new Request(`https://${event.requestContext.domainName}${event.rawPath}${event.rawQueryString ? '?' : ''}${event.rawQueryString}`, {
      method: event.requestContext.http.method,
      headers: event.headers,
      body: event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body,
    });

    // parse ARN
    //   arn:partition:service:region:account-id:resource-type:resource-id
    //   eg: arn:aws:lambda:us-east-1:118435662149:function:dump:4_2_1
    const [/* 'arn' */, /* 'aws' */, /* 'lambda' */,
      region,
      accountId, /* 'function' */,
      functionName,
      functionAlias,
    ] = context.invokedFunctionArn.split(':');
    const [packageName, name] = functionName.split('--');

    const con = {
      resolver: new AWSResolver(event),
      pathInfo: {
        suffix: event.pathParameters && event.pathParameters.path ? `/${event.pathParameters.path}` : '',
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
        app: event.requestContext.apiId,
      },
      invocation: {
        id: context.awsRequestId,
        deadline: Date.now() + context.getRemainingTimeInMillis(),
        transactionId: request.headers.get('x-transaction-id') || request.headers.get('x-amzn-trace-id'),
        requestId: event.requestContext.requestId,
      },
      env: {
        ...process.env,
        ...secrets,
      },
      storage: AWSStorage,
    };

    // support for Amazon SQS, remember records passed by trigger
    if (event.Records) {
      con.records = event.Records;
    }

    updateProcessEnv(con);
    // eslint-disable-next-line import/no-unresolved,global-require
    const { main } = require('./main.js');

    const response = await main(request, con);
    ensureUTF8Charset(response);
    ensureInvocationId(response, con);

    // flush log if present
    if (con.log && con.log.flush) {
      await con.log.flush();
    }
    const isBase64Encoded = isBinary(response.headers.get('content-type'));
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      isBase64Encoded,
      body: isBase64Encoded ? Buffer.from(await response.arrayBuffer()).toString('base64') : await response.text(),
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
}

/**
 * The universal adapter for lambda functions
 * @param {object} evt AWS Lambda event
 * @param {object} ctx AWS Lambda context
 * @returns {*} lambda response
 */
async function lambda(evt, ctx) {
  try {
    const secrets = await getAWSSecrets(ctx.functionName);
    let handler = (event, context) => lambdaAdapter(event, context, secrets);
    if (secrets.EPSAGON_TOKEN) {
      // check if health check
      const suffix = evt.pathParameters && evt.pathParameters.path ? `/${evt.pathParameters.path}` : '';
      if (suffix !== HEALTHCHECK_PATH) {
        handler = epsagon(handler, {
          token: secrets.EPSAGON_TOKEN,
        });
      }
    }
    if (!evt.requestContext) {
      // function was invoked directly, not through API Gateway
      const searchParams = new URLSearchParams();
      Object.getOwnPropertyNames(evt).forEach((name) => {
        const value = evt[name];
        if (typeof value === 'string') {
          searchParams.append(name, value);
        }
      });
      evt.rawPath = '';
      evt.rawQueryString = searchParams.toString();
      evt.headers = {};
      evt.requestContext = { http: {} };
    }
    return handler(evt, ctx);
  } catch (e) {
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
}

lambda.raw = lambdaAdapter;

module.exports = lambda;
