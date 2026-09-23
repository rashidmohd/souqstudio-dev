import { defineConfig, mergeConfig } from 'vitest/config'
import { vitestBase } from '@souqstudio/config/vitest.base'

export default mergeConfig(vitestBase, defineConfig({}))
