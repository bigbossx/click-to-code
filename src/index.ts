import { ClickToComponent as DevelopmentClickToComponent } from './ClickToComponent'
import type { ClickToComponentComponent } from './types'

declare const process: { env: { NODE_ENV?: string } }

const ProductionClickToComponent: ClickToComponentComponent = () => null

export const ClickToComponent: ClickToComponentComponent =
  process.env.NODE_ENV === 'production'
    ? ProductionClickToComponent
    : DevelopmentClickToComponent

export type {
  ClickToComponentComponent,
  ClickToComponentProps,
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
