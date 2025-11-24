# Helix Universal

> Serverless adapters for the universal runtime.

## Status
[![codecov](https://img.shields.io/codecov/c/github/adobe/helix-universal.svg)](https://codecov.io/gh/adobe/helix-universal)
[![CircleCI](https://img.shields.io/circleci/project/github/adobe/helix-universal.svg)](https://circleci.com/gh/adobe/helix-universal)
[![GitHub license](https://img.shields.io/github/license/adobe/helix-universal.svg)](https://github.com/adobe/helix-universal/blob/master/LICENSE.txt)
[![GitHub issues](https://img.shields.io/github/issues/adobe/helix-universal.svg)](https://github.com/adobe/helix-universal/issues)
[![LGTM Code Quality Grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/adobe/helix-universal.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/adobe/helix-universal)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)

## Installation

```bash
$ npm install @adobe/helix-universal
```

## Deployment

**Helix Universal** is part of the [Helix Deploy](https://github.com/adobe/helix-deploy) ecosystem. [Helix Deploy](https://github.com/adobe/helix-deploy) is the parent project that provides deployment capabilities for universal functions across multiple serverless platforms.

### Supported Platforms

Helix Deploy can deploy universal functions to:
- **AWS Lambda** - Traditional serverless functions
- **Google Cloud Functions** - Serverless functions on Google Cloud Platform
- **Apache OpenWhisk** - Open-source serverless platform

### Edge Compute Support

[Helix Deploy Plugin Edge](https://github.com/adobe/helix-deploy-plugin-edge) extends the reach of Helix Universal to edge compute runtimes, enabling deployment to:
- **Fastly Compute@Edge** - Edge computing platform
- **Cloudflare Workers** - Edge computing platform

This allows you to write universal functions that can run at the edge, closer to your users, while maintaining the same universal function interface.

### Secret Naming Convention

When deploying with Helix Deploy, secrets follow a naming convention that includes the `helix-deploy` prefix:
- **AWS Secrets Manager**: `/helix-deploy/{package-name}/all`
- **Google Secret Manager**: `projects/{project-id}/secrets/helix-deploy--{package-name}/versions/latest`

This convention ensures secrets are properly organized and accessible to deployed functions across all platforms.

## API Documentation

This library provides adapters that allow you to write universal serverless functions that work across multiple platforms (AWS Lambda, Google Cloud Functions, and Apache OpenWhisk). Your function receives a standardized `Request` object and `Context` object, regardless of the underlying platform.

### Universal Function Signature

All universal functions follow this signature:

```javascript
async function main(request, context) {
  // Your function logic here
  return new Response('Hello, World!', {
    status: 200,
    headers: {
      'content-type': 'text/plain',
    },
  });
}
```

**Parameters:**
- `request` (Request): A standard [Fetch API Request](https://developer.mozilla.org/en-US/docs/Web/API/Request) object containing the HTTP request details
- `context` (UniversalContext): A context object providing runtime information, function metadata, and utilities

**Returns:** A [Fetch API Response](https://developer.mozilla.org/en-US/docs/Web/API/Response) object

### Universal Context

The `context` object provides a standardized interface to access platform-specific information and utilities. Additionally, plugins and wrappers may extend the context with additional properties (see [Available Plugin Packages](#available-plugin-packages) section below).

#### `context.resolver`

A `Resolver` instance for creating URLs to invoke other functions/actions. Supports version locking via the `x-ow-version-lock` header.

**Methods:**
- `createURL(options)`: Creates a URL for invoking another function
  - `options.name` (string, required): Function/action name
  - `options.package` (string, optional): Package name
  - `options.version` (string, optional): Version to invoke

**Example:**
```javascript
// Invoke another function
const url = context.resolver.createURL({
  package: 'helix-services',
  name: 'content-proxy',
  version: '1.2.3',
});
// url is a URL object pointing to the function
```

#### `context.pathInfo`

Path information about the current request.

**Properties:**
- `suffix` (string): The request path suffix (e.g., `/foo/bar` from `/api/function/foo/bar`)

#### `context.runtime`

Information about the runtime environment.

**Properties:**
- `name` (string): Runtime name (`'aws-lambda'`, `'googlecloud-functions'`, or `'apache-openwhisk'`)
- `region` (string): Deployment region (e.g., `'us-east-1'`, `'us-central1'`)
- `accountId` (string, AWS only): AWS account ID

#### `context.func`

Information about the current function.

**Properties:**
- `name` (string): Function name (stemmed name without package/version)
- `package` (string): Package name
- `version` (string): Function version
- `app` (string): Application/namespace name
- `fqn` (string): Fully qualified name (platform-specific format)

**Example values:**
```javascript
{
  name: 'dispatch',
  package: 'helix-services',
  version: '4.3.1',
  app: 'helix-pages',
  fqn: 'arn:aws:lambda:us-east-1:118435662149:function:helix-services--dispatch:4_3_1'
}
```

#### `context.invocation`

Information about the current invocation.

**Properties:**
- `id` (string): Unique invocation ID (activation ID for OpenWhisk, request ID for AWS/Google)
- `deadline` (number): Unix timestamp (milliseconds) when the function will timeout
- `transactionId` (string, optional): Transaction ID for tracing across multiple invocations
- `requestId` (string, optional): Request ID identifying the HTTP request
- `event` (object, AWS only): Raw AWS Lambda event object

#### `context.env`

Environment variables object. This includes:
- All `process.env` variables
- Secrets loaded from platform-specific secret managers (when using secrets plugins)
- Function-specific environment variables

**Note:** The following environment variables are automatically set:
- `HELIX_UNIVERSAL_RUNTIME`: Runtime name
- `HELIX_UNIVERSAL_NAME`: Function name
- `HELIX_UNIVERSAL_PACKAGE`: Package name
- `HELIX_UNIVERSAL_APP`: Application name
- `HELIX_UNIVERSAL_VERSION`: Function version

#### `context.log`

A logger instance compatible with [helix-log](https://github.com/adobe/helix-log). Provides the following methods:
- `log(...args)`
- `fatal(...args)`
- `error(...args)`
- `warn(...args)`
- `info(...args)`
- `debug(...args)`
- `verbose(...args)`
- `silly(...args)`
- `trace(...args)`

**Example:**
```javascript
context.log.info('Processing request', { url: request.url });
context.log.error('Something went wrong', error);
```

#### `context.storage`

Storage API for generating presigned URLs for cloud storage.

**Methods:**
- `presignURL(bucket, path, blobParams, method, expires)`: Generate a presigned URL
  - `bucket` (string): Storage bucket name
  - `path` (string): Object path within the bucket
  - `blobParams` (object, optional): Additional parameters (e.g., `ContentType`, `ContentDisposition`)
  - `method` (string, optional): HTTP method (`'GET'` or `'PUT'`), defaults to `'GET'`
  - `expires` (number, optional): Expiration time in seconds, defaults to `60`

**Example:**
```javascript
const url = await context.storage.presignURL(
  'my-bucket',
  'path/to/file.jpg',
  { ContentType: 'image/jpeg' },
  'GET',
  3600
);
```

#### `context.attributes`

An object for storing user-defined attributes. This is particularly useful for passing data between [wrappers](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-wrap) and middleware functions. Wrappers can store computed values or initialized resources in `context.attributes` so they can be reused across the request lifecycle without re-initialization.

**Common Use Cases:**
- Caching initialized resources (e.g., storage clients, database connections)
- Passing data between middleware layers
- Storing request-scoped metadata

**Example:**
```javascript
// In a wrapper function
function storageWrapper(fn) {
  return async (request, context) => {
    // Initialize storage once and cache it in attributes
    if (!context.attributes.storage) {
      context.attributes.storage = new HelixStorage({
        // ... configuration
      });
    }
    return fn(request, context);
  };
}

// In your main function
export async function main(request, context) {
  // Access the cached storage instance
  const storage = context.attributes.storage;
  const bucket = storage.contentBus();
  
  // Use other attributes
  context.attributes.userId = '12345';
  context.attributes.requestStartTime = Date.now();
  
  return new Response('OK');
}
```

**Note:** The `context.attributes` object is heavily used by packages like `@adobe/helix-shared-storage` and `helix-admin` to cache resources and share data between middleware layers.

### Custom Adapters

You can create custom adapters using the `createAdapter` function:

```javascript
import { createAdapter } from '@adobe/helix-universal/aws';

const adapter = createAdapter({
  factory: async () => {
    // Custom factory function to load your main function
    return (await import('./my-main.js')).main;
  },
});

export const handler = adapter;
```

### Plugins

Adapters support a plugin system for extending functionality:

#### Secrets Plugins

Secrets plugins automatically load secrets from platform-specific secret managers and inject them into `process.env` as environment variables. Both plugins are **included by default** in their respective adapters, so secrets are automatically loaded on every invocation.

**How Secrets Work:**

1. Secrets are stored as JSON objects in the platform's secret manager
2. Each key-value pair in the JSON becomes an environment variable
3. Only secrets that don't already exist in `process.env` are set (existing variables take precedence)
4. Secrets are available in `context.env` and `process.env` within your function

**AWS Secrets Plugin**

The AWS secrets plugin loads secrets from AWS Secrets Manager.

**Secret Naming Convention:**
- Secret ID format: `/helix-deploy/{package-name}/all`
- The package name is extracted from the Lambda function name (everything before `--`)
- Example: For function `helix-services--dispatch`, secrets are loaded from `/helix-deploy/helix-services/all`

**Configuration:**
```javascript
import { lambda, awsSecretsPlugin } from '@adobe/helix-universal';
// Already included in default lambda export, but you can customize:
const customLambda = lambda.raw.with(awsSecretsPlugin, {
  expiration: 3600000,  // Cache expiration time in milliseconds (default: 1 hour)
  checkDelay: 60000,    // Modification check delay in milliseconds (default: 1 minute)
  emulateEnv: {         // For testing: provide mock secrets instead of calling AWS
    API_KEY: 'test-key',
    DB_PASSWORD: 'test-password',
  },
});
```

**Caching Behavior:**
- Secrets are cached in memory for performance
- Cache expires after `expiration` time (default: 1 hour)
- Every `checkDelay` (default: 1 minute), the plugin checks if the secret was modified
- If the secret was modified, it's reloaded automatically
- This balances performance with the ability to update secrets without redeploying

**AWS Credentials:**
The plugin requires AWS credentials, which are typically provided via:
- IAM role attached to the Lambda function (recommended)
- Environment variables: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`
- AWS region: `AWS_REGION` (defaults to Lambda's region)

**Error Handling:**
- `ResourceNotFoundException`: Returns empty object `{}`, allowing the function to continue without secrets
- `ThrottlingException`: Throws an error with `statusCode: 429`
- Other errors: Throws an error, which will be caught by the adapter's error handler

**Custom Endpoint (for local testing):**
```javascript
// Use localstack or other AWS-compatible endpoint
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
```

**Example Secret Structure:**
Store this JSON in AWS Secrets Manager at `/helix-deploy/my-package/all`:
```json
{
  "API_KEY": "your-api-key-here",
  "DATABASE_URL": "postgresql://...",
  "JWT_SECRET": "your-jwt-secret"
}
```

**Google Secrets Plugin**

The Google secrets plugin loads secrets from Google Secret Manager.

**Secret Naming Convention:**
- Secret path format: `projects/{project-id}/secrets/helix-deploy--{package-name}/versions/latest`
- The project ID is extracted from the Cloud Function hostname subdomain
- The package name is extracted from `K_SERVICE` environment variable (everything before `--`)
- Dots in package names are replaced with underscores
- Example: For function `helix-services--dispatch` in project `helix-225321`, secrets are loaded from `projects/helix-225321/secrets/helix-deploy--helix_services/versions/latest`

**Configuration:**
```javascript
import { google, googleSecretsPlugin } from '@adobe/helix-universal';
// Already included in default google export, but you can customize:
const customGoogle = google.raw.with(googleSecretsPlugin, {
  emulateEnv: {  // For testing: provide mock secrets instead of calling Google
    API_KEY: 'test-key',
    DB_PASSWORD: 'test-password',
  },
});
```

**Caching Behavior:**
- **No caching**: Secrets are fetched on every invocation
- This ensures you always have the latest secrets, but may impact performance

**Google Cloud Credentials:**
The plugin requires Google Cloud credentials, which are typically provided via:
- Service account attached to the Cloud Function (recommended)
- `GOOGLE_APPLICATION_CREDENTIALS` environment variable pointing to a service account key file
- Default credentials from the Cloud Function's runtime environment

**Error Handling:**
- Any error during secret retrieval: Returns empty object `{}`, allowing the function to continue
- Errors are logged to console but don't fail the invocation

**Example Secret Structure:**
Store this JSON in Google Secret Manager at `projects/{project-id}/secrets/helix-deploy--my_package/versions/latest`:
```json
{
  "API_KEY": "your-api-key-here",
  "DATABASE_URL": "postgresql://...",
  "JWT_SECRET": "your-jwt-secret"
}
```

**Using Secrets in Your Function:**

```javascript
export async function main(request, context) {
  // Secrets are automatically available in context.env and process.env
  const apiKey = context.env.API_KEY;
  const dbUrl = process.env.DATABASE_URL;
  
  // Existing environment variables take precedence
  // If API_KEY is already set in process.env, the secret won't override it
  
  return new Response('OK');
}
```

**Disabling Secrets Plugin:**

If you want to disable automatic secret loading:

```javascript
// Use the raw adapter without secrets plugin
import { lambda } from '@adobe/helix-universal';

export const handler = lambda.raw;  // No secrets plugin
```

**Testing with Secrets:**

For testing, you can provide mock secrets using the `emulateEnv` option:

```javascript
import { lambda } from '@adobe/helix-universal';
import awsSecretsPlugin from '@adobe/helix-universal/aws-secrets';

const testLambda = lambda.raw.with(awsSecretsPlugin, {
  emulateEnv: {
    API_KEY: 'test-api-key',
    TEST_MODE: 'true',
  },
});

// Use testLambda in your tests
```

#### Custom Plugins

You can create custom plugins:

```javascript
function myPlugin(adapter, options) {
  return async (event, context) => {
    // Pre-processing
    context.attributes.customData = 'value';
    
    // Call the adapter
    const response = await adapter(event, context);
    
    // Post-processing
    response.headers.set('x-custom-header', 'value');
    
    return response;
  };
}

const customAdapter = lambda.raw.with(myPlugin, { option: 'value' });
```

#### Available Plugin Packages

The Helix ecosystem provides several pre-built plugins that extend the universal runtime functionality. These plugins use the [wrap utility](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-wrap) to compose middleware around your functions.

**Body Data Plugin** ([@adobe/helix-shared-body-data](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-body-data))

Parses request bodies (JSON, form data, URL-encoded) and makes the data available in `context.data`:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import bodyData from '@adobe/helix-shared-body-data';

export const main = wrap(async (request, context) => {
  // Access parsed body data
  const { name, email } = context.data;
  return new Response(`Hello ${name}!`);
})
  .with(bodyData);
```

**Bounce Plugin** ([@adobe/helix-shared-bounce](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-bounce))

Provides fast pro-forma responses from slow-running functions. The faster of two responses (a quick responder function or the slow main function) is returned:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import bounce from '@adobe/helix-shared-bounce';

async function fastResponder(req, context) {
  return new Response(`Processing... Use ${context.invocation.bounceId} to track status.`);
}

export const main = wrap(async (request, context) => {
  // Slow operation
  await doSlowWork();
  return new Response('Done');
})
  .with(bounce, { responder: fastResponder });
```

**Secrets Plugin** ([@adobe/helix-shared-secrets](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-secrets))

Loads secrets from cloud provider secret managers (currently AWS Secrets Manager) and adds them to `context.env` and `process.env`:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import secrets from '@adobe/helix-shared-secrets';

export const main = wrap(async (request, context) => {
  // Secrets are available in context.env
  const apiKey = context.env.API_KEY;
  return new Response('OK');
})
  .with(secrets);
```

**Note:** This is different from the built-in secrets plugins (`awsSecretsPlugin` and `googleSecretsPlugin`) that are automatically included in the adapters. The `@adobe/helix-shared-secrets` plugin provides additional customization options and can be used with custom name functions.

**IMS Plugin** ([@adobe/helix-shared-ims](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-ims))

Provides Adobe Identity Management System (IMS) authentication. Handles OAuth2 flow and makes user profile available in `context.ims`:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import ims from '@adobe/helix-shared-ims';

export const main = wrap(async (request, context) => {
  if (context.ims.profile) {
    // User is authenticated
    const { name, email, userId } = context.ims.profile;
    return new Response(`Hello ${name}!`);
  }
  return new Response('Not authenticated', { status: 401 });
})
  .with(ims, { 
    clientId: 'my-client-id',
    env: 'prod',
    forceAuth: true, // Require authentication
  });
```

The IMS plugin adds the following to `context.ims`:
- `context.ims.config`: Resolved IMS configuration
- `context.ims.accessToken`: Current access token
- `context.ims.profile`: Authenticated user profile (name, email, userId)

**Server Timing Plugin** ([@adobe/helix-shared-server-timing](https://github.com/adobe/helix-shared/tree/main/packages/helix-shared-server-timing))

Adds performance monitoring by tracking execution time and adding `Server-Timing` HTTP headers:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import serverTiming from '@adobe/helix-shared-server-timing';

export const main = wrap(async (request, context) => {
  const { timer } = context;
  
  timer.update('fetch-data');
  const data = await fetchData();
  
  timer.update('process-data');
  const result = processData(data);
  
  timer.update('render');
  const html = render(result);
  
  return new Response(html);
})
  .with(serverTiming);
```

The plugin adds a `timer` object to `context` with an `update(name)` method to record execution milestones. Timing data is automatically added to the `Server-Timing` response header, viewable in browser DevTools.

**Combining Multiple Plugins:**

You can chain multiple plugins together:

```javascript
import wrap from '@adobe/helix-shared-wrap';
import bodyData from '@adobe/helix-shared-body-data';
import ims from '@adobe/helix-shared-ims';
import serverTiming from '@adobe/helix-shared-server-timing';

export const main = wrap(async (request, context) => {
  // context.data - parsed body data
  // context.ims.profile - authenticated user
  // context.timer - performance timer
  return new Response('OK');
})
  .with(serverTiming)
  .with(ims, { clientId: 'my-client-id' })
  .with(bodyData);
```

**Note:** Execution order is reversed - the last plugin added executes first.

### Resolver and Version Locking

The resolver supports version locking, allowing you to pin specific versions of functions via the `x-ow-version-lock` header:

```javascript
// Client sends header: x-ow-version-lock: content-proxy=1.2.3&dispatch=2.0.0

// In your function:
const url = context.resolver.createURL({
  package: 'helix-services',
  name: 'content-proxy',
  version: '1.5.0', // This will be overridden to 1.2.3
});
```

### Complete Example

Here's a complete example of a universal function:

```javascript
import { Response } from '@adobe/fetch';

export async function main(request, context) {
  // Log request
  context.log.info('Processing request', {
    method: request.method,
    url: request.url,
    function: context.func.name,
    version: context.func.version,
  });

  // Access environment variables
  const apiKey = context.env.API_KEY;

  // Invoke another function
  const otherFunctionUrl = context.resolver.createURL({
    package: 'helix-services',
    name: 'content-proxy',
    version: '1.2.3',
  });

  // Generate presigned URL
  const presignedUrl = await context.storage.presignURL(
    'my-bucket',
    'path/to/file.jpg',
    {},
    'GET',
    3600
  );

  // Process request
  const body = await request.json();
  
  // Return response
  return new Response(JSON.stringify({
    message: 'Success',
    function: context.func.name,
    runtime: context.runtime.name,
    presignedUrl,
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
    },
  });
}
```

### TypeScript Support

Type definitions are included. Import types as needed:

```typescript
import type { UniversalContext, UniversalFunction } from '@adobe/helix-universal';

async function main(
  request: Request,
  context: UniversalContext
): Promise<Response> {
  // TypeScript will provide full type checking
  return new Response('OK');
}
```

## Development

### Build

```bash
$ npm install
```

### Test

```bash
$ npm test
```

### Lint

```bash
$ npm run lint
```
