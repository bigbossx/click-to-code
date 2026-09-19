import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_CLICK_TO_CODE_PROJECT_ROOT:
      process.env.NODE_ENV === 'development' ? process.cwd() : '',
  },
}

export default nextConfig
