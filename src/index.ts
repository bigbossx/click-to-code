import { ClickToCode as DevelopmentClickToCode } from './ClickToCode'
import type { ClickToCodeComponent } from './types'

declare const process: { env: { NODE_ENV?: string } }

const ProductionClickToCode: ClickToCodeComponent = () => null

export const ClickToCode: ClickToCodeComponent =
  process.env.NODE_ENV === 'production'
    ? ProductionClickToCode
    : DevelopmentClickToCode

export type {
  ClickToCodeComponent,
  ClickToCodeProps,
  Editor,
  PathModifier,
  ReactFiber,
  SourceLocation,
} from './types'

export {
  getReactInstanceForElement,
  getReactInstancesForElement,
  getSourceForElement,
  getSourceForInstance,
  parseDebugStack,
} from './reactFiber'

export { getPathToSource, getUrl } from './utils'
