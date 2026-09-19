# Click to React Component

开发环境中的 React 组件定位工具。按住 <kbd>Alt/Option</kbd> 点击页面元素，
即可在编辑器中打开对应源码；按住 <kbd>Alt/Option</kbd> 右键，可以从组件祖先列表中选择。

支持 React 18 和 React 19、Vite、webpack，以及常见的 Next.js 开发栈格式。

## 安装

这个包只在开发阶段使用，推荐安装到 `devDependencies`：

```sh
npm install --save-dev click-to-code
```

```sh
pnpm add --save-dev click-to-code
```

```sh
yarn add --dev click-to-code
```

React 和 React DOM 由宿主项目提供，支持版本为 `>=18 <20`。

## Vite：推荐接入方式

Vite 的开发环境常量是大写的 `import.meta.env.DEV`，不是
`import.meta.env.dev`。

使用构建期条件和动态 `import()`，可以让生产构建直接删除整个依赖，
而不只是渲染一个返回 `null` 的组件。

创建 `src/DevClickToComponent.tsx`：

```tsx
import { lazy, Suspense } from 'react'
import type { ClickToComponentProps } from 'click-to-code'

const DevelopmentInspector = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import('click-to-code')
      return { default: module.ClickToComponent }
    })
  : null

export function DevClickToComponent(props: ClickToComponentProps) {
  if (!DevelopmentInspector) return null

  return (
    <Suspense fallback={null}>
      <DevelopmentInspector {...props} />
    </Suspense>
  )
}
```

然后在应用根节点挂载一次：

```tsx
import { DevClickToComponent } from './DevClickToComponent'

export function App() {
  return (
    <>
      <DevClickToComponent editor="cursor" />
      <main>{/* application */}</main>
    </>
  )
}
```

生产构建时，`import.meta.env.DEV` 会被替换为 `false`，动态导入分支会被
dead-code elimination 移除，因此不会生成 inspector 的生产 chunk。

## Next.js

App Router 项目可以创建一个只在客户端运行的开发组件：

```tsx
'use client'

import dynamic from 'next/dynamic'
import type { ClickToComponentProps } from 'click-to-code'

const DevelopmentInspector =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('click-to-code').then(
            (module) => module.ClickToComponent,
          ),
        { ssr: false },
      )
    : null

export function DevClickToComponent(props: ClickToComponentProps) {
  if (!DevelopmentInspector) return null
  return <DevelopmentInspector {...props} />
}
```

在根布局中挂载：

```tsx
import { DevClickToComponent } from './DevClickToComponent'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <DevClickToComponent editor="cursor" />
        {children}
      </body>
    </html>
  )
}
```

Pages Router 也可以使用相同的包装组件，在 `pages/_app.tsx` 中挂载一次。

## webpack 和其他构建工具

使用构建工具能够静态替换的开发环境常量包裹动态导入：

```tsx
import { lazy, Suspense } from 'react'
import type { ClickToComponentProps } from 'click-to-code'

const DevelopmentInspector =
  process.env.NODE_ENV === 'development'
    ? lazy(async () => {
        const module = await import('click-to-code')
        return { default: module.ClickToComponent }
      })
    : null

export function DevClickToComponent(props: ClickToComponentProps) {
  return DevelopmentInspector ? (
    <Suspense fallback={null}>
      <DevelopmentInspector {...props} />
    </Suspense>
  ) : null
}
```

需要确保生产配置会把 `process.env.NODE_ENV` 静态替换为
`"production"`，并开启 tree shaking/minification。

## 简单接入方式

如果不要求从生产产物中彻底删除这个包，也可以直接静态导入：

```tsx
import { ClickToComponent } from 'click-to-code'

export function App() {
  return (
    <>
      <ClickToComponent editor="vscode" />
      <main>{/* application */}</main>
    </>
  )
}
```

包内在 `NODE_ENV=production` 时会让组件返回 `null`。不过，静态导入是否能被
完整移除取决于宿主构建工具，因此追求生产零冗余时应使用前面的条件动态导入方案。

## 使用方式

- <kbd>Alt/Option</kbd> + 左键：直接打开当前元素对应的组件源码。
- <kbd>Alt/Option</kbd> + 右键：显示当前组件及其祖先组件，点击其中一项打开源码。
- <kbd>Escape</kbd>：关闭组件选择菜单。

### `editor`

默认编辑器是 `vscode`，内置常用值包括：

```tsx
<DevClickToComponent editor="vscode" />
<DevClickToComponent editor="vscode-insiders" />
<DevClickToComponent editor="cursor" />
```

也可以传入自定义编辑器 URL scheme，例如 `webstorm`。

### `pathModifier`

当开发服务器、容器和本机使用不同路径，或者 stack 中只有项目相对路径时，
可以在打开编辑器前转换路径：

```tsx
<DevClickToComponent
  editor="cursor"
  pathModifier={(path) =>
    path
      .replace(/^app\//, '/Users/me/project/app/')
      .replace(/^\/workspace\//, '/Users/me/project/')
  }
/>
```

传入和返回的格式都是：

```text
/absolute/path/to/Component.tsx:line:column
```

`pathModifier` 抛出异常或返回空值时，本次候选项会被安全忽略，不会影响宿主应用。

## TypeScript

运行时 API 和类型都从包根路径导出：

```ts
import {
  getSourceForElement,
  parseDebugStack,
  type ClickToComponentProps,
  type Editor,
  type PathModifier,
  type ReactFiber,
  type SourceLocation,
} from 'click-to-code'
```

包同时提供 ESM、CommonJS，以及对应的 `.d.ts` 声明文件。

## React 18/19 兼容方式

- React 18：优先读取 Fiber 的 `_debugSource`。
- React 19：从 Fiber 的 `_debugStack` 中解析源码位置。
- 当 React DevTools 可用时，会优先使用 renderer 查找 DOM 对应的 Fiber。
- 支持常见 Vite `/@fs/` 和 webpack/Next.js internal stack 路径。

这些 Fiber 字段属于 React 私有开发 API，因此只应在开发环境启用。无法解析某个
Fiber、属性或 stack frame 时，该项会被跳过，不会中断宿主应用。

## 检查生产产物

建议在接入后执行一次生产构建，并确认产物中不存在包名：

```sh
npm run build
grep -R "click-to-code" dist
```

Next.js 可以在 `.next/static` 中检查；webpack 项目则检查自己的输出目录。
如果使用 bundle analyzer，也不应看到 `click-to-code` 的独立 chunk。
