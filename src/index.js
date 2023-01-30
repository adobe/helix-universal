/*
 * Copyright 2021 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { lambda as aws } from './aws-adapter.js';
import awsSecretsPlugin from './aws-secrets.js';
import googleSecretsPlugin from './google-secrets.js';
import { openwhisk } from './openwhisk-adapter.js';
import { google } from './google-adapter.js';

export default {
  adapter: {
    openwhisk,
    aws,
    google,
  },
  awsSecretsPlugin,
  googleSecretsPlugin,
};
