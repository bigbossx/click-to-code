# click-to-code

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

## 示例项目

仓库包含两个最小可运行示例：

- [`examples/vite-react`](./examples/vite-react)：Vite 8 + React 19，使用
  `import.meta.env.DEV && <ClickToCode />`。
- [`examples/next`](./examples/next)：Next.js 16 App Router + React 19，
  通过 Client Component 仅在开发环境挂载。

克隆仓库并安装依赖后，可以分别启动：

```sh
npm run examples:vite
npm run examples:next
```

一次验证包和两个示例的生产构建：

```sh
npm run examples:build
```

## Vite：推荐接入方式

不需要使用 `lazy`。Vite 会在生产构建中把 `import.meta.env.DEV` 静态替换为
`false`，随后移除不可达的 JSX 和未使用 import。包本身也声明了
`sideEffects: false`，因此下面的静态导入可以被完整 tree-shake：

Vite 对项目根目录内的 stack frame 使用 `/src/...` 形式。为了让编辑器获得本机
绝对路径，在 `vite.config.ts` 中仅向开发构建注入项目根目录：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __CLICK_TO_CODE_PROJECT_ROOT__: JSON.stringify(
      command === 'serve' ? process.cwd() : '',
    ),
  },
}))
```

在 `src/vite-env.d.ts` 中声明这个开发常量：

```ts
/// <reference types="vite/client" />

declare const __CLICK_TO_CODE_PROJECT_ROOT__: string
```

然后在应用根节点挂载：

```tsx
import { ClickToCode } from 'click-to-code'

export function App() {
  return (
    <>
      {import.meta.env.DEV && (
        <ClickToCode
          editor="cursor"
          projectRoot={__CLICK_TO_CODE_PROJECT_ROOT__}
        />
      )}
      <main>{/* application */}</main>
    </>
  )
}
```

注意 Vite 的内置常量是大写的 `import.meta.env.DEV`，不是
`import.meta.env.dev`。

### 可选：开发环境异步加载

只有在希望 inspector 不进入开发环境的初始 chunk 时，才需要 `lazy` 和动态导入：

```tsx
import { lazy, Suspense } from 'react'

const ClickToCode = import.meta.env.DEV
  ? lazy(async () => {
      const module = await import('click-to-code')
      return { default: module.ClickToCode }
    })
  : null

export function DevTools() {
  return ClickToCode ? (
    <Suspense fallback={null}>
      <ClickToCode
        editor="cursor"
        projectRoot={__CLICK_TO_CODE_PROJECT_ROOT__}
      />
    </Suspense>
  ) : null
}
```

这个方案的区别只是开发环境代码分包，不是生产 tree-shaking 的必要条件。

## Next.js

在 `next.config.ts` 中仅向开发构建注入项目根目录：

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLICK_TO_CODE_PROJECT_ROOT:
      process.env.NODE_ENV === 'development' ? process.cwd() : '',
  },
}

export default nextConfig
```

App Router 中再创建一个 Client Component：

```tsx
'use client'

import { ClickToCode } from 'click-to-code'
import type { ClickToCodeProps } from 'click-to-code'

export function DevClickToCode(props: ClickToCodeProps) {
  if (process.env.NODE_ENV !== 'development') return null
  return (
    <ClickToCode
      {...props}
      projectRoot={process.env.NEXT_PUBLIC_CLICK_TO_CODE_PROJECT_ROOT}
    />
  )
}
```

然后在根布局中挂载一次：

```tsx
import { DevClickToCode } from './DevClickToCode'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <DevClickToCode editor="cursor" />
        {children}
      </body>
    </html>
  )
}
```

Pages Router 可以直接在 `pages/_app.tsx` 中使用：

```tsx
import { ClickToCode } from 'click-to-code'
import type { AppProps } from 'next/app'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      {process.env.NODE_ENV === 'development' && (
        <ClickToCode
          editor="cursor"
          projectRoot={process.env.NEXT_PUBLIC_CLICK_TO_CODE_PROJECT_ROOT}
        />
      )}
      <Component {...pageProps} />
    </>
  )
}
```

## webpack 和其他构建工具

使用构建工具能够静态替换的开发环境常量即可：

```tsx
import { ClickToCode } from 'click-to-code'

export function App() {
  return (
    <>
      {process.env.NODE_ENV === 'development' && <ClickToCode />}
      <main>{/* application */}</main>
    </>
  )
}
```

生产配置需要把 `process.env.NODE_ENV` 静态替换为 `"production"`，并开启
tree shaking/minification。如果所用构建工具不能静态替换环境变量，再改用条件动态导入。

## 使用方式

- <kbd>Alt/Option</kbd> + 左键：直接打开当前元素对应的组件源码。
- <kbd>Alt/Option</kbd> + 右键：显示当前组件及其祖先组件，点击其中一项打开源码。
- <kbd>Escape</kbd>：关闭组件选择菜单。

### `editor`

默认编辑器是 `vscode`：

```tsx
<ClickToCode editor="vscode" />
<ClickToCode editor="vscode-insiders" />
<ClickToCode editor="cursor" />
```

也可以传入自定义编辑器 URL scheme，例如 `webstorm`。

### `projectRoot`

React 19 的浏览器 stack 可能只包含 `/src/App.tsx` 或 `app/page.tsx`。这些是
相对于项目根目录的开发服务器路径，不是电脑上的绝对路径。通过 `projectRoot`
提供本机项目根目录后，会生成正确的编辑器路径：

```tsx
<ClickToCode projectRoot="/Users/me/project" />
```

例如 `/src/App.tsx:5:19` 会被解析成
`/Users/me/project/src/App.tsx:5:19`。Vite 的 `/@fs/...` 路径和 React 18
已有的绝对路径不会被重复拼接。

### `pathModifier`

当开发服务器、容器和本机使用不同路径，或者 stack 中只有项目相对路径时，
可以在打开编辑器前转换路径：

```tsx
<ClickToCode
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
  ClickToCode,
  getSourceForElement,
  parseDebugStack,
  type ClickToCodeProps,
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

接入后建议执行一次生产构建，并检查产物：

```sh
npm run build
grep -R "click-to-code" dist
```

找不到匹配内容即表示包名未进入生产产物。Next.js 可以检查 `.next/static`，
webpack 项目则检查自己的输出目录；使用 bundle analyzer 时也不应看到
`click-to-code` 的独立 chunk。
