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
export { Resolver } from './resolver';
export * from './adapter';

import {UniversalContext as _UniversalContext} from './adapter';

/**
 * Namespace declaration with interfaces that wrappers can extend.
 *
 * @example
 * ```ts
 * // Extend in a wrapper declaration via merging
 * declare module '@adobe/helix-universal' {
 *   namespace Helix {
 *     export interface UniversalContext {
 *       foo: () => void;
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```ts
 * // Use merged interface as a type
 * import type { Helix } from '@adobe/helix-universal';
 *
 * async function main(request: Request, context: Helix.UniversalContext) {
 *   const bar = context.foo();
 * }
 *
 * ```
 */
declare module '@adobe/helix-universal' {
  namespace Helix {
    export interface UniversalContext extends _UniversalContext {
      [key: string]: unknown;
    }
  }
}
