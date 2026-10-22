import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRuntime } from './lib/runtime'
import { ConfigError } from './components/ConfigError'
import './index.css'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
function createApplication(value: unknown) {
  const runtime = createRuntime(value)
  const router = createRouter({ routeTree, context: runtime, trailingSlash: 'never' })
  runtime.setRouterInvalidation(() => { void router.invalidate() })
  return { runtime, router }
}

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createApplication>['router']
  }
}

// Render the app
document.documentElement.dataset.theme = 'night'
const root = ReactDOM.createRoot(document.getElementById('root')!)
try {
  const { runtime, router } = createApplication(import.meta.env.VITE_API_BASE)
  if (import.meta.hot) import.meta.hot.dispose(() => runtime.dispose())
  root.render(<StrictMode><QueryClientProvider client={runtime.queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>)
} catch (error) {
  root.render(<StrictMode><ConfigError message={error instanceof Error ? error.message : '配置读取失败'} /></StrictMode>)
}
